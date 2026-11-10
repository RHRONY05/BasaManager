import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { ErrorCode } from '@bm/shared/errors';
import type {
  SignupRequest,
  VerifyEmailRequest,
  LoginRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
} from '@bm/shared/api/auth';
import type { Db } from '../../config/db';
import type { Env } from '../../config/env';
import { ApiError } from '../../lib/ApiError';
import { clock } from '../../lib/clock';
import { hashPassword, verifyPassword, validatePassword } from '../../lib/passwords';
import {
  sha256,
  generateRefreshToken,
  generateRandomToken,
  generateCsrfToken,
  signAccessToken,
} from '../../lib/tokens';
import { setAuthCookies, clearAuthCookies, COOKIE_REFRESH_NAME } from '../../lib/cookies';
import { generateSlug } from '../../lib/slug';
import { deliverOutboxNow } from '../../config/mailer';
import { emitSessionRevoked } from '../../realtime/emit';
import { getGoogleClient, encryptOAuthState, decryptOAuthState } from './google';
import { findInvitationByTokenHash } from '../../config/db';
import { createLogger } from '../../lib/logger';
import { linkTenantToLease } from '../leases/lease-activation';

const logger = createLogger({ level: 'info' });

export class AuthService {
  constructor(
    private readonly prisma: Db,
    private readonly env: Env,
  ) {}

  /**
   * Registers a new landlord account, creates organization & membership, issues verification email.
   * If email is taken, returns identical response without creating anything or setting cookies.
   */
  async signup(data: SignupRequest, req: Request, res: Response) {
    validatePassword(data.password, 'password');
    const email = data.email.toLowerCase().trim();

    const existing = await this.prisma.user.findFirst({
      where: { email },
    });

    if (existing) {
      // Prevent user enumeration: identical success response, no session cookie
      return { message: 'Check your email to verify your account' };
    }

    const userId = randomUUID();
    const orgId = randomUUID();
    const passwordHash = await hashPassword(data.password);
    const now = clock.now();
    const verifyToken = generateRandomToken(32);

    const MAX_SLUG_ATTEMPTS = 3;
    let registered = false;

    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
      const orgSlug = generateSlug(data.orgName);
      try {
        await this.prisma.$tx({ orgId, userId, role: 'landlord' }, async (tx) => {
          await tx.user.create({
            data: {
              id: userId,
              email,
              fullName: data.fullName.trim(),
              passwordHash,
              emailVerifiedAt: null,
            },
          });

          await tx.organization.create({
            data: {
              id: orgId,
              name: data.orgName.trim(),
              slug: orgSlug,
              createdBy: userId,
            },
          });

          await tx.membership.create({
            data: {
              orgId,
              userId,
              role: 'landlord',
              status: 'active',
            },
          });

          await tx.authToken.create({
            data: {
              kind: 'email_verify',
              userId,
              tokenHash: sha256(verifyToken),
              expiresAt: new Date(now.getTime() + 24 * 3600 * 1000), // 24 hours
            },
          });

          await tx.outboxMessage.createMany({
            data: [
              {
                orgId,
                type: 'user.verify_email',
                payload: {
                  userId,
                  email,
                  token: verifyToken,
                },
              },
            ],
          });
        });
        registered = true;
        break;
      } catch (err: unknown) {
        // Prisma P2002 is unique constraint violation (concurrent duplicate email or slug collision)
        const isP2002 =
          typeof err === 'object' &&
          err !== null &&
          'code' in err &&
          (err as { code: string }).code === 'P2002';

        if (isP2002) {
          // If a user with this email already exists, it's an email conflict
          const existingUser = await this.prisma.user.findFirst({ where: { email } });
          if (existingUser) {
            return { message: 'Check your email to verify your account' };
          }

          // Otherwise, the collision was on organization slug; retry with fresh slug
          if (attempt < MAX_SLUG_ATTEMPTS - 1) {
            continue;
          }
        }
        throw err;
      }
    }

    if (!registered) {
      throw ApiError.internal('Failed to create organization due to slug collision');
    }

    await deliverOutboxNow([
      {
        type: 'user.verify_email',
        payload: { userId, email, token: verifyToken },
      },
    ]);

    // Create session family for initial sign-in
    const familyId = randomUUID();
    const refreshToken = generateRefreshToken();
    const session = await this.prisma.session.create({
      data: {
        userId,
        familyId,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(now.getTime() + 30 * 24 * 3600 * 1000), // 30 days
        userAgent: (req.headers['user-agent'] as string) || null,
        ip: (req.ip as string) || null,
      },
    });

    const accessToken = await signAccessToken(
      { sub: userId, sid: session.id, adm: false },
      this.env.JWT_SECRET || '',
    );
    const csrfToken = generateCsrfToken();
    setAuthCookies(res, this.env, { accessToken, refreshToken, csrfToken });

    return { message: 'Check your email to verify your account' };
  }

  /**
   * Verifies user email with single-use token.
   */
  async verifyEmail(data: VerifyEmailRequest) {
    const tokenHash = sha256(data.token);
    const now = clock.now();

    const rows = await this.prisma.$queryRaw<Array<{ id: string; user_id: string }>>`
      update auth_tokens
      set used_at = ${now}
      where token_hash = ${tokenHash}
        and kind = 'email_verify'
        and used_at is null
        and expires_at > ${now}
      returning id, user_id
    `;

    if (!rows || rows.length === 0) {
      throw new ApiError(ErrorCode.TOKEN_INVALID, 'Invalid or expired verification token');
    }

    const userId = rows[0]!.user_id;
    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: now },
    });

    return { verified: true };
  }

  /**
   * Resends verification email to the current logged-in user.
   */
  async resendVerification(userId: string, email: string) {
    const token = generateRandomToken(32);
    const now = clock.now();

    await this.prisma.authToken.create({
      data: {
        kind: 'email_verify',
        userId,
        tokenHash: sha256(token),
        expiresAt: new Date(now.getTime() + 24 * 3600 * 1000),
      },
    });

    await this.prisma.$tx({ orgId: null, userId, role: null }, async (tx) => {
      await tx.outboxMessage.createMany({
        data: [
          {
            orgId: null,
            type: 'user.verify_email',
            payload: { userId, email, token },
          },
        ],
      });
    });

    await deliverOutboxNow([
      {
        type: 'user.verify_email',
        payload: { userId, email, token },
      },
    ]);

    return { sent: true };
  }

  /**
   * Signs in user with email and password, enforcing account lockout and rotating session family.
   */
  async login(data: LoginRequest, req: Request, res: Response) {
    const email = data.email.toLowerCase().trim();
    const user = await this.prisma.user.findFirst({
      where: { email },
    });

    const now = clock.now();

    if (!user || user.deletedAt) {
      // Dummy hash verify to balance timing
      await verifyPassword(
        '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$KIj3ijHkVAnYnt99Bpcr0QdHZdYXEPW4d2+eGsYZ/JU',
        data.password,
      ).catch(() => false);
      throw new ApiError(ErrorCode.INVALID_CREDENTIALS, 'Invalid email or password');
    }

    // Check account lockout
    if (user.lockedUntil && user.lockedUntil > now) {
      const remainingMinutes = Math.max(1, Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 60000));
      throw new ApiError(
        ErrorCode.ACCOUNT_LOCKED,
        `Account locked. Try again in ${remainingMinutes} minutes.`,
      );
    }

    if (!user.passwordHash) {
      throw new ApiError(ErrorCode.INVALID_CREDENTIALS, 'Invalid email or password');
    }

    const isValid = await verifyPassword(user.passwordHash, data.password);

    if (!isValid) {
      const lockUntil = new Date(now.getTime() + 15 * 60 * 1000);
      const rows = await this.prisma.$queryRaw<
        Array<{ failed_login_count: number; locked_until: Date | null }>
      >`
        update users
        set failed_login_count = case
            when locked_until is not null and locked_until <= ${now}::timestamptz then 1
            else failed_login_count + 1
          end,
          locked_until = case
            when (case when locked_until is not null and locked_until <= ${now}::timestamptz then 1 else failed_login_count + 1 end) >= 5
            then ${lockUntil}::timestamptz
            else null
          end
        where id = ${user.id}::uuid
        returning failed_login_count, locked_until
      `;

      const updated = rows && rows[0];
      if (updated?.locked_until && updated.locked_until > now) {
        throw new ApiError(ErrorCode.ACCOUNT_LOCKED, 'Account locked. Try again in 15 minutes.');
      }

      throw new ApiError(ErrorCode.INVALID_CREDENTIALS, 'Invalid email or password');
    }

    // Success: reset failures
    if (user.failedLoginCount > 0 || user.lockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
    }

    // Create fresh session family
    const familyId = randomUUID();
    const refreshToken = generateRefreshToken();
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(now.getTime() + 30 * 24 * 3600 * 1000),
        userAgent: (req.headers['user-agent'] as string) || null,
        ip: (req.ip as string) || null,
      },
    });

    const accessToken = await signAccessToken(
      { sub: user.id, sid: session.id, adm: user.isPlatformAdmin },
      this.env.JWT_SECRET,
    );
    const csrfToken = generateCsrfToken();
    setAuthCookies(res, this.env, { accessToken, refreshToken, csrfToken });

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
      },
    };
  }

  /**
   * Rotates refresh token and issues fresh access token.
   * If rotated token is presented (reuse detected), revokes the family and sends alert.
   */
  async refresh(req: Request, res: Response) {
    const rawToken = req.cookies?.[COOKIE_REFRESH_NAME];
    if (!rawToken || typeof rawToken !== 'string') {
      throw ApiError.unauthenticated('Refresh token missing');
    }

    const tokenHash = sha256(rawToken);
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
    });

    if (!session) {
      throw new ApiError(ErrorCode.SESSION_REVOKED, 'Session not found');
    }

    const now = clock.now();

    if (session.expiresAt <= now) {
      throw new ApiError(ErrorCode.SESSION_REVOKED, 'Session expired');
    }

    if (session.revokedAt !== null) {
      throw new ApiError(ErrorCode.SESSION_REVOKED, 'Session revoked');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
    });

    if (!user || user.deletedAt) {
      throw ApiError.unauthenticated('User not found');
    }

    // Reuse detection
    if (session.rotatedAt !== null) {
      await this.prisma.session.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: {
          revokedAt: now,
          revokeReason: 'reuse',
        },
      });

      await emitSessionRevoked(user.id);

      await this.prisma.$tx({ orgId: null, userId: user.id, role: null }, async (tx) => {
        await tx.outboxMessage.createMany({
          data: [
            {
              orgId: null,
              type: 'user.security_alert',
              payload: { userId: user.id, email: user.email },
            },
          ],
        });
      });

      await deliverOutboxNow([
        {
          type: 'user.security_alert',
          payload: { userId: user.id, email: user.email },
        },
      ]);

      clearAuthCookies(res, this.env);
      throw new ApiError(
        ErrorCode.SESSION_REVOKED,
        'Session reuse detected. All sessions in this family were revoked.',
      );
    }

    // Atomic rotation and child creation: exactly one concurrent request can rotate
    const newRefreshToken = generateRefreshToken();
    const childId = randomUUID();
    const newExpiresAt = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
    const userAgent = (req.headers['user-agent'] as string) || null;
    const ip = (req.ip as string) || null;

    const rotated = await this.prisma.$transaction(async (tx) => {
      const won = await tx.$queryRaw<Array<{ id: string }>>`
        update sessions
        set rotated_at = ${now}
        where id = ${session.id}::uuid and rotated_at is null and revoked_at is null
        returning id
      `;

      if (!won || won.length !== 1) {
        return false;
      }

      await tx.session.create({
        data: {
          id: childId,
          userId: session.userId,
          familyId: session.familyId,
          tokenHash: sha256(newRefreshToken),
          expiresAt: newExpiresAt,
          userAgent,
          ip,
        },
      });

      return true;
    });

    if (!rotated) {
      // The other concurrent request rotated this token; revoke family and alert
      await this.prisma.session.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: {
          revokedAt: now,
          revokeReason: 'reuse',
        },
      });

      await emitSessionRevoked(user.id);

      await this.prisma.$tx({ orgId: null, userId: user.id, role: null }, async (tx) => {
        await tx.outboxMessage.createMany({
          data: [
            {
              orgId: null,
              type: 'user.security_alert',
              payload: { userId: user.id, email: user.email },
            },
          ],
        });
      });

      await deliverOutboxNow([
        {
          type: 'user.security_alert',
          payload: { userId: user.id, email: user.email },
        },
      ]);

      clearAuthCookies(res, this.env);
      throw new ApiError(
        ErrorCode.SESSION_REVOKED,
        'Session reuse detected. All sessions in this family were revoked.',
      );
    }

    const newAccessToken = await signAccessToken(
      { sub: user.id, sid: childId, adm: user.isPlatformAdmin },
      this.env.JWT_SECRET,
    );
    const csrfToken = generateCsrfToken();
    setAuthCookies(res, this.env, {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      csrfToken,
    });

    return { ok: true };
  }

  /**
   * Signs out current device session.
   */
  async logout(sessionId: string, res: Response) {
    const now = clock.now();
    await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        revokedAt: now,
        revokeReason: 'logout',
      },
    });

    clearAuthCookies(res, this.env);
    return { ok: true };
  }

  /**
   * Signs out all device sessions for the user and disconnects live sockets.
   */
  async logoutAll(userId: string, res: Response) {
    const now = clock.now();
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: {
        revokedAt: now,
        revokeReason: 'logout_all',
      },
    });

    await emitSessionRevoked(userId);
    clearAuthCookies(res, this.env);
    return { ok: true };
  }

  /**
   * Sends password reset link. Always answers 200 with identical body to prevent user enumeration.
   * Runs token persistence and email dispatch off the critical path to prevent timing side channels.
   */
  async forgotPassword(data: ForgotPasswordRequest) {
    const email = data.email.toLowerCase().trim();
    const user = await this.prisma.user.findFirst({
      where: { email },
    });

    if (user && !user.deletedAt) {
      void (async () => {
        const token = generateRandomToken(32);
        const now = clock.now();

        await this.prisma.$tx({ orgId: null, userId: user.id, role: null }, async (tx) => {
          await tx.authToken.create({
            data: {
              kind: 'password_reset',
              userId: user.id,
              tokenHash: sha256(token),
              expiresAt: new Date(now.getTime() + 30 * 60 * 1000), // 30 minutes
            },
          });

          await tx.outboxMessage.createMany({
            data: [
              {
                orgId: null,
                type: 'user.password_reset',
                payload: { userId: user.id, email: user.email, token },
              },
            ],
          });
        });

        await deliverOutboxNow([
          {
            type: 'user.password_reset',
            payload: { userId: user.id, email: user.email, token },
          },
        ]);
      })().catch((err: unknown) => {
        logger.warn({ err, userId: user.id }, 'forgot-password background dispatch failed');
      });
    }

    return { message: 'If that email exists, we sent a password reset link.' };
  }

  /**
   * Resets password using token, revokes all sessions, and signs in on this device.
   */
  async resetPassword(data: ResetPasswordRequest, req: Request, res: Response) {
    // Validate password before consuming token
    validatePassword(data.password, 'password');

    const tokenHash = sha256(data.token);
    const now = clock.now();

    const rows = await this.prisma.$queryRaw<Array<{ id: string; user_id: string }>>`
      update auth_tokens
      set used_at = ${now}
      where token_hash = ${tokenHash}
        and kind = 'password_reset'
        and used_at is null
        and expires_at > ${now}
      returning id, user_id
    `;

    if (!rows || rows.length === 0) {
      throw new ApiError(ErrorCode.TOKEN_INVALID, 'Invalid or expired reset token');
    }

    const userId = rows[0]!.user_id;
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) {
      throw new ApiError(ErrorCode.TOKEN_INVALID, 'Invalid or expired reset token');
    }

    const passwordHash = await hashPassword(data.password);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          failedLoginCount: 0,
          lockedUntil: null,
          ...(user.emailVerifiedAt === null ? { emailVerifiedAt: now } : {}),
        },
      });

      // Revoke all sessions of this user
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: {
          revokedAt: now,
          revokeReason: 'password_reset',
        },
      });
    });

    // Disconnect active socket connections
    await emitSessionRevoked(userId);

    const familyId = randomUUID();
    const refreshToken = generateRefreshToken();
    const session = await this.prisma.session.create({
      data: {
        userId,
        familyId,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(now.getTime() + 30 * 24 * 3600 * 1000),
        userAgent: (req.headers['user-agent'] as string) || null,
        ip: (req.ip as string) || null,
      },
    });

    const accessToken = await signAccessToken(
      { sub: user.id, sid: session.id, adm: user.isPlatformAdmin },
      this.env.JWT_SECRET,
    );
    const csrfToken = generateCsrfToken();
    setAuthCookies(res, this.env, { accessToken, refreshToken, csrfToken });

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
      },
    };
  }

  /**
   * Initiates Google OAuth flow by redirecting to Google authorization URL with state + PKCE.
   */
  googleStart(invite: string | undefined, res: Response) {
    const googleClient = getGoogleClient(this.env);
    const state = generateRandomToken(16);
    const codeVerifier = generateRandomToken(32);

    const authUrl = googleClient.authorizationUrl({ state, codeVerifier });
    const encryptedCookie = encryptOAuthState({ state, codeVerifier, invite }, this.env.JWT_SECRET);

    res.cookie('bm_g_oauth', encryptedCookie, {
      httpOnly: true,
      secure: this.env.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/api/auth/google',
      maxAge: 10 * 60 * 1000,
    });

    return authUrl.toString();
  }

  /**
   * Handles Google OAuth callback, creating user + org, linking account, or accepting invite.
   */
  async googleCallback(req: Request, res: Response) {
    const failedUrl = `${this.env.APP_URL}/login?error=google_failed`;
    const cookieToken = req.cookies?.['bm_g_oauth'];
    res.clearCookie('bm_g_oauth', { path: '/api/auth/google' });

    if (!cookieToken || typeof cookieToken !== 'string') {
      return failedUrl;
    }

    const stateData = decryptOAuthState(cookieToken, this.env.JWT_SECRET);
    if (!stateData || stateData.state !== req.query.state) {
      return failedUrl;
    }

    const code = req.query.code as string | undefined;
    if (!code) {
      return failedUrl;
    }

    const googleClient = getGoogleClient(this.env);
    let profile;
    try {
      profile = await googleClient.fetchProfile({
        code,
        codeVerifier: stateData.codeVerifier,
      });
    } catch {
      return failedUrl;
    }

    if (!profile.emailVerified) {
      return failedUrl;
    }

    try {
      const email = profile.email.toLowerCase().trim();
      const now = clock.now();

      if (stateData.invite) {
        const invHash = sha256(stateData.invite);
        const inv = await findInvitationByTokenHash(this.prisma, invHash);

        if (!inv || inv.acceptedAt !== null || inv.revokedAt !== null || inv.expiresAt < now) {
          return failedUrl;
        }

        if (inv.email.toLowerCase().trim() !== email) {
          return failedUrl;
        }

        // Find or create user atomically in one transaction
        const matchedUser = await this.prisma.user.findFirst({ where: { email } });
        if (matchedUser?.deletedAt) {
          return failedUrl;
        }

        const isUnverifiedLocal = Boolean(matchedUser && !matchedUser.emailVerifiedAt);
        const targetUserId = matchedUser?.id || randomUUID();

        let user: { id: string; isPlatformAdmin: boolean };
        try {
          user = await this.prisma.$tx(
            { orgId: inv.orgId, userId: targetUserId, role: inv.role },
            async (tx) => {
              let u: { id: string; isPlatformAdmin: boolean };
              if (matchedUser) {
                if (!matchedUser.emailVerifiedAt) {
                  u = await tx.user.update({
                    where: { id: matchedUser.id },
                    data: {
                      emailVerifiedAt: now,
                      fullName: matchedUser.fullName || profile.name,
                      passwordHash: null,
                    },
                    select: { id: true, isPlatformAdmin: true },
                  });
                  await tx.session.updateMany({
                    where: { userId: matchedUser.id, revokedAt: null },
                    data: {
                      revokedAt: now,
                      revokeReason: 'google_claimed_unverified',
                    },
                  });
                  await tx.authToken.updateMany({
                    where: { userId: matchedUser.id, kind: 'email_verify', usedAt: null },
                    data: { usedAt: now },
                  });
                } else {
                  u = matchedUser;
                }
              } else {
                u = await tx.user.create({
                  data: {
                    id: targetUserId,
                    email,
                    fullName: profile.name,
                    emailVerifiedAt: now,
                  },
                  select: { id: true, isPlatformAdmin: true },
                });
              }

              // Link OAuth account
              await tx.oauthAccount.upsert({
                where: {
                  provider_providerUserId: {
                    provider: 'google',
                    providerUserId: profile.sub,
                  },
                },
                update: {},
                create: {
                  userId: u.id,
                  provider: 'google',
                  providerUserId: profile.sub,
                },
              });

              // Accept invitation under org transaction
              const updated = await tx.invitation.updateMany({
                where: {
                  id: inv.id,
                  acceptedAt: null,
                  revokedAt: null,
                  expiresAt: { gt: now },
                },
                data: { acceptedAt: now },
              });

              if (updated.count === 0) {
                throw new ApiError(ErrorCode.TOKEN_INVALID, 'Invitation already accepted or expired');
              }

              const existingMembership = await tx.membership.findFirst({
                where: {
                  orgId: inv.orgId,
                  userId: u.id,
                },
              });

              // Blocker 1: Prevent staff member (landlord/caretaker) from being demoted to tenant
              if (
                existingMembership &&
                (existingMembership.role === 'landlord' || existingMembership.role === 'caretaker') &&
                inv.role === 'tenant'
              ) {
                throw ApiError.conflict(
                  'Cannot accept tenant invite: user is already a staff member in this organisation',
                );
              }

              let membershipId: string;
              if (existingMembership) {
                const updatedM = await tx.membership.update({
                  where: { id: existingMembership.id },
                  data: {
                    status: 'active',
                    removedAt: null,
                    role: inv.role,
                  },
                });
                membershipId = updatedM.id;
                await tx.caretakerBuilding.deleteMany({
                  where: { orgId: inv.orgId, membershipId },
                });
              } else {
                const m = await tx.membership.create({
                  data: {
                    orgId: inv.orgId,
                    userId: u.id,
                    role: inv.role,
                    status: 'active',
                  },
                });
                membershipId = m.id;
              }

              // Issue #13 fix: Assign caretaker buildings on Google acceptance
              if (inv.role === 'caretaker' && inv.buildingIds && inv.buildingIds.length > 0) {
                for (const buildingId of inv.buildingIds) {
                  await tx.caretakerBuilding.create({
                    data: {
                      orgId: inv.orgId,
                      membershipId,
                      buildingId,
                    },
                  });
                }
              }

              if (inv.role === 'tenant') {
                await linkTenantToLease(tx, inv, membershipId, now);
              }

              return u;
            },
          );
        } catch (err: unknown) {
          if (err instanceof ApiError && err.code === ErrorCode.TOKEN_INVALID) {
            return failedUrl;
          }
          throw err;
        }

        if (isUnverifiedLocal && matchedUser) {
          await emitSessionRevoked(matchedUser.id);
        }

        // Create session and set cookies
        const familyId = randomUUID();
        const refreshToken = generateRefreshToken();
        const session = await this.prisma.session.create({
          data: {
            userId: user.id,
            familyId,
            tokenHash: sha256(refreshToken),
            expiresAt: new Date(now.getTime() + 30 * 24 * 3600 * 1000),
            userAgent: (req.headers['user-agent'] as string) || null,
            ip: (req.ip as string) || null,
          },
        });

        const accessToken = await signAccessToken(
          { sub: user.id, sid: session.id, adm: user.isPlatformAdmin },
          this.env.JWT_SECRET,
        );
        const csrfToken = generateCsrfToken();
        setAuthCookies(res, this.env, { accessToken, refreshToken, csrfToken });

        return `${this.env.APP_URL}`;
      }

      // No invite: standard Google sign-in
      const existingOauth = await this.prisma.oauthAccount.findUnique({
        where: {
          provider_providerUserId: {
            provider: 'google',
            providerUserId: profile.sub,
          },
        },
        include: { user: true },
      });

      let user;
      if (existingOauth) {
        if (existingOauth.user.deletedAt) {
          return failedUrl;
        }
        user = existingOauth.user;
      } else {
        // Check if user with verified email exists
        const existingUser = await this.prisma.user.findFirst({
          where: { email },
        });

        if (existingUser) {
          if (existingUser.deletedAt) {
            return failedUrl;
          }
          const matchedUser = existingUser;
          if (!matchedUser.emailVerifiedAt) {
            await this.prisma.$transaction(async (tx) => {
              await tx.user.update({
                where: { id: matchedUser.id },
                data: {
                  emailVerifiedAt: now,
                  passwordHash: null,
                },
              });
              await tx.session.updateMany({
                where: { userId: matchedUser.id, revokedAt: null },
                data: {
                  revokedAt: now,
                  revokeReason: 'google_claimed_unverified',
                },
              });
              await tx.authToken.updateMany({
                where: { userId: matchedUser.id, kind: 'email_verify', usedAt: null },
                data: { usedAt: now },
              });
            });
            await emitSessionRevoked(matchedUser.id);
          }
          user = existingUser;
          await this.prisma.oauthAccount.create({
            data: {
              userId: user.id,
              provider: 'google',
              providerUserId: profile.sub,
            },
          });
        } else {
          // Create brand new landlord account + organization atomically in ONE transaction (Issue #17)
          const userId = randomUUID();
          const orgId = randomUUID();
          const orgName = `${profile.name}'s properties`;

          const MAX_SLUG_ATTEMPTS = 3;
          let created = false;
          for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
            const orgSlug = generateSlug(orgName);
            try {
              user = await this.prisma.$tx({ orgId, userId, role: 'landlord' }, async (tx) => {
                const newUser = await tx.user.create({
                  data: {
                    id: userId,
                    email,
                    fullName: profile.name,
                    emailVerifiedAt: now,
                  },
                });

                await tx.oauthAccount.create({
                  data: {
                    userId,
                    provider: 'google',
                    providerUserId: profile.sub,
                  },
                });

                await tx.organization.create({
                  data: {
                    id: orgId,
                    name: orgName,
                    slug: orgSlug,
                    createdBy: userId,
                  },
                });

                await tx.membership.create({
                  data: {
                    orgId,
                    userId,
                    role: 'landlord',
                    status: 'active',
                  },
                });

                return newUser;
              });
              created = true;
              break;
            } catch (err: unknown) {
              const isP2002 =
                typeof err === 'object' &&
                err !== null &&
                'code' in err &&
                (err as { code: string }).code === 'P2002';
              if (isP2002 && attempt < MAX_SLUG_ATTEMPTS - 1) {
                const existingUser = await this.prisma.user.findFirst({ where: { email } });
                if (!existingUser) {
                  continue;
                }
              }
              throw err;
            }
          }

          if (!created || !user) {
            throw ApiError.internal('Failed to create organization due to slug collision');
          }
        }
      }

      // Create session family & sign in
      const familyId = randomUUID();
      const refreshToken = generateRefreshToken();
      const session = await this.prisma.session.create({
        data: {
          userId: user.id,
          familyId,
          tokenHash: sha256(refreshToken),
          expiresAt: new Date(now.getTime() + 30 * 24 * 3600 * 1000),
          userAgent: (req.headers['user-agent'] as string) || null,
          ip: (req.ip as string) || null,
        },
      });

      const accessToken = await signAccessToken(
        { sub: user.id, sid: session.id, adm: user.isPlatformAdmin },
        this.env.JWT_SECRET,
      );
      const csrfToken = generateCsrfToken();
      setAuthCookies(res, this.env, { accessToken, refreshToken, csrfToken });

      return `${this.env.APP_URL}`;
    } catch (err) {
      const logger = (req as unknown as { log?: { warn: (obj: object, msg: string) => void } }).log;
      if (logger && typeof logger.warn === 'function') {
        logger.warn({ err }, 'google callback failed');
      }
      return failedUrl;
    }
  }
}
