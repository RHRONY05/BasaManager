import type { Db } from '../../config/db';
import { ApiError } from '../../lib/ApiError';
import { ErrorCode } from '@bm/shared';
import { verifyPassword } from '../../lib/passwords';

export interface UserAuthRecord {
  id: string;
  passwordHash: string | null;
  lockedUntil: Date | null;
  failedLoginCount: number;
  deletedAt: Date | null;
}

/**
 * Validates a user's password attempt against their stored hash,
 * enforcing deleted account guards, temporary lockout windows, and failed login counter increments.
 */
export async function verifyUserPasswordWithLockout(
  prisma: Db,
  user: UserAuthRecord,
  passwordAttempt: string,
  now: Date,
): Promise<void> {
  if (user.deletedAt) {
    // Dummy hash verify to balance timing
    await verifyPassword(
      '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$KIj3ijHkVAnYnt99Bpcr0QdHZdYXEPW4d2+eGsYZ/JU',
      passwordAttempt,
    ).catch(() => false);
    throw new ApiError(ErrorCode.INVALID_CREDENTIALS, 'Invalid email or password');
  }

  // Check account lockout
  if (user.lockedUntil && user.lockedUntil > now) {
    const remainingMinutes = Math.max(1, Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 60000));
    throw new ApiError(ErrorCode.ACCOUNT_LOCKED, `Account locked. Try again in ${remainingMinutes} minutes.`);
  }

  if (!user.passwordHash) {
    throw new ApiError(ErrorCode.INVALID_CREDENTIALS, 'Invalid email or password');
  }

  const isValid = await verifyPassword(user.passwordHash, passwordAttempt);
  if (!isValid) {
    const lockUntil = new Date(now.getTime() + 15 * 60 * 1000);
    const rows = await prisma.$queryRaw<Array<{ failed_login_count: number; locked_until: Date | null }>>`
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
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  }
}
