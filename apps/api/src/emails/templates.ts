export interface RenderedEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export function renderEmail(
  type: string,
  payload: Record<string, unknown>,
  appUrl: string,
): RenderedEmail | null {
  const email = payload.email as string;
  if (!email) return null;

  switch (type) {
    case 'user.verify_email': {
      const link = `${appUrl}/verify-email?token=${payload.token}`;
      return {
        to: email,
        subject: 'Verify your email address - BasaManager',
        text: `Welcome to BasaManager! Please verify your email by opening the link:\n\n${link}\n\nThis link will expire in 24 hours.`,
        html: `
          <div style="font-family: sans-serif; line-height: 1.5; color: #333;">
            <h2>Verify your email address</h2>
            <p>Welcome to BasaManager! Please click the button below to verify your email address:</p>
            <p><a href="${link}" style="display: inline-block; padding: 10px 20px; background-color: #2563eb; color: #fff; text-decoration: none; border-radius: 6px;">Verify Email</a></p>
            <p>Or copy and paste this URL into your browser:</p>
            <p><a href="${link}">${link}</a></p>
            <p>This link expires in 24 hours.</p>
          </div>
        `,
      };
    }

    case 'user.password_reset': {
      const link = `${appUrl}/reset-password?token=${payload.token}`;
      return {
        to: email,
        subject: 'Reset your password - BasaManager',
        text: `We received a request to reset your BasaManager password. Open the link to set a new password:\n\n${link}\n\nThis link expires in 30 minutes.`,
        html: `
          <div style="font-family: sans-serif; line-height: 1.5; color: #333;">
            <h2>Reset your password</h2>
            <p>We received a request to reset your password. Click the button below to choose a new password:</p>
            <p><a href="${link}" style="display: inline-block; padding: 10px 20px; background-color: #2563eb; color: #fff; text-decoration: none; border-radius: 6px;">Reset Password</a></p>
            <p>Or copy and paste this URL into your browser:</p>
            <p><a href="${link}">${link}</a></p>
            <p>This link expires in 30 minutes. If you did not make this request, you can safely ignore this email.</p>
          </div>
        `,
      };
    }

    case 'user.security_alert': {
      return {
        to: email,
        subject: 'Security alert: Session revoked - BasaManager',
        text: `Security Alert: We detected an attempt to reuse an expired session token on your account. As a security precaution, all active sessions in this family have been revoked. If this was not you, please change your password immediately.`,
        html: `
          <div style="font-family: sans-serif; line-height: 1.5; color: #333;">
            <h2 style="color: #dc2626;">Security Alert: Session Revoked</h2>
            <p>We detected an attempt to reuse an expired session token on your account.</p>
            <p>As a security precaution, all active sessions in this family have been revoked and signed out.</p>
            <p>If you suspect unauthorized access, please log in and change your password immediately.</p>
          </div>
        `,
      };
    }

    case 'invite.sent': {
      const link = `${appUrl}/invites/${payload.token}`;
      return {
        to: email,
        subject: 'You have been invited to BasaManager',
        text: `You have been invited to join BasaManager. Click the link to view and accept your invitation:\n\n${link}\n\nThis link expires in 7 days.`,
        html: `
          <div style="font-family: sans-serif; line-height: 1.5; color: #333;">
            <h2>You've been invited!</h2>
            <p>You have been invited to join BasaManager.</p>
            <p><a href="${link}" style="display: inline-block; padding: 10px 20px; background-color: #2563eb; color: #fff; text-decoration: none; border-radius: 6px;">Accept Invitation</a></p>
            <p>Or open this link: <a href="${link}">${link}</a></p>
            <p>This link expires in 7 days.</p>
          </div>
        `,
      };
    }

    default:
      return null;
  }
}
