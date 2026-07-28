import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

// Builds the nodemailer transport options.
//
// - In `test`, always jsonTransport so the suite never opens a socket.
// - When SMTP is configured (host + password present), a REAL SMTP transport
//   is used in every other environment — including local development — so
//   local can send through Resend (or any provider) exactly like production.
// - When SMTP is not configured (e.g. local dev before a key is added), fall
//   back to jsonTransport so the app still boots and just logs the message.
export function buildTransportOptions({ nodeEnv, smtpHost, smtpPort, smtpUser, smtpPass }) {
  if (nodeEnv === 'test') return { jsonTransport: true };
  if (!smtpHost || !smtpPass) return { jsonTransport: true };

  const port = Number(smtpPort);

  return {
    host: smtpHost,
    port,
    secure: port === 465,
    requireTLS: true,
    auth: { user: smtpUser, pass: smtpPass }
  };
}

const transporter = nodemailer.createTransport(buildTransportOptions(env));

// Minimal, inline-styled HTML wrapper so the message renders well in email
// clients (which strip <style>/external CSS). Plain text is always sent
// alongside for accessibility and deliverability.
function renderHtml({ heading, intro, ctaLabel, ctaUrl, note }) {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f1f5f9;padding:24px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      <tr><td>
        <h1 style="margin:0 0 16px;font-size:20px;">${heading}</h1>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.5;">${intro}</p>
        <a href="${ctaUrl}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px;font-size:15px;">${ctaLabel}</a>
        <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#64748b;">${note}</p>
        <p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#94a3b8;word-break:break-all;">If the button doesn't work, paste this link into your browser:<br />${ctaUrl}</p>
      </td></tr>
    </table>
  </body>
</html>`;
}

export async function sendMail({ to, subject, text, html, replyTo }) {
  const message = { from: env.smtpFrom, to, subject, text, html };

  // A reply-to (e.g. a personal inbox) keeps replies reaching a real person
  // even though the From address is a no-reply/verified sending domain.
  const effectiveReplyTo = replyTo || env.smtpReplyTo;
  if (effectiveReplyTo) message.replyTo = effectiveReplyTo;

  const result = await transporter.sendMail(message);

  if (env.nodeEnv !== 'production') {
    console.log(`[mailer] to=${to} subject=${subject}`);
  }

  return result;
}

export async function sendPasswordResetEmail({ to, token }) {
  const link = `${env.clientUrl}/reset-password?token=${token}`;
  const subject = 'Reset your password';
  const text = `We received a request to reset your password.\n\nOpen this link to choose a new one:\n${link}\n\nThis link expires in ${env.resetTokenExpiresMinutes} minutes. If you did not request a reset, you can ignore this email.`;
  const html = renderHtml({
    heading: 'Reset your password',
    intro: 'We received a request to reset your password. Choose a new one using the button below.',
    ctaLabel: 'Choose a new password',
    ctaUrl: link,
    note: `This link expires in ${env.resetTokenExpiresMinutes} minutes. If you did not request a reset, you can safely ignore this email.`
  });

  return sendMail({ to, subject, text, html });
}

export async function sendInvitationEmail({ to, url, inviterName, invitedName, relationship, note }) {
  const greeting = invitedName ? `Hi ${invitedName},` : 'Hello,';
  const from = inviterName ? `${inviterName} has invited you` : 'You have been invited';
  const rel = relationship ? ` as their ${relationship}` : '';
  const subject = 'You are invited to join the family';
  const noteLine = note ? `\n\nA note from ${inviterName || 'the inviter'}: ${note}` : '';
  const text = `${greeting}\n\n${from}${rel} to join the family platform.\n\nRegister here (this link expires soon and can be used once):\n${url}${noteLine}\n\nAfter you register, an administrator will review and approve your account before you can sign in.`;
  const html = renderHtml({
    heading: 'You are invited to join the family',
    intro: `${from}${rel} to join the family platform. Use the button below to register — the link can be used once and expires soon.${note ? `<br /><br /><em>Note: ${note}</em>` : ''}`,
    ctaLabel: 'Register your account',
    ctaUrl: url,
    note: 'After registering, an administrator reviews and approves your account before you can sign in.'
  });

  return sendMail({ to, subject, text, html });
}

export async function sendVerificationEmail({ to, token }) {
  const link = `${env.clientUrl}/verify-email?token=${token}`;
  const subject = 'Verify your email';
  const text = `Welcome! Please verify your email address to activate your account.\n\nOpen this link to verify:\n${link}\n\nThis link expires in 24 hours. If you did not create this account, you can ignore this email.`;
  const html = renderHtml({
    heading: 'Verify your email',
    intro: 'Welcome! Please verify your email address to activate your account.',
    ctaLabel: 'Verify email',
    ctaUrl: link,
    note: 'This link expires in 24 hours. If you did not create this account, you can safely ignore this email.'
  });

  return sendMail({ to, subject, text, html });
}
