import nodemailer, { type Transporter } from 'nodemailer';
import { env } from './env';
import { renderEmail } from '../emails/templates';

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!transporter && env.SMTP_URL) {
    transporter = nodemailer.createTransport(env.SMTP_URL);
  }
  return transporter;
}

/**
 * In-process outbox email deliverer for dev/test.
 * Directly sends outbox messages via nodemailer until the V11 worker takes over.
 */
export async function deliverOutboxNow(
  messages: Array<{ type: string; payload: Record<string, unknown> }>,
): Promise<void> {
  const mailer = getTransporter();
  if (!mailer) return;

  for (const msg of messages) {
    try {
      const rendered = renderEmail(msg.type, msg.payload, env.APP_URL);
      if (rendered) {
        await mailer.sendMail({
          from: env.MAIL_FROM || 'BasaManager <no-reply@notify.basamanager.rhrony05.me>',
          to: rendered.to,
          subject: rendered.subject,
          text: rendered.text,
          html: rendered.html,
        });
      }
    } catch {
      // Don't fail the request if local SMTP is down; worker will retry in V11
    }
  }
}
