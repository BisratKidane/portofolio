import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

export function buildTransportOptions({ nodeEnv, smtpHost, smtpPort, smtpUser, smtpPass }) {
  if (nodeEnv !== 'production') return { jsonTransport: true };

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

export async function sendMail({ to, subject, text, html }) {
  const result = await transporter.sendMail({ from: env.smtpFrom, to, subject, text, html });

  if (env.nodeEnv === 'development') {
    console.log(`[mailer] to=${to} subject=${subject} body=${text}`);
  }

  return result;
}

export async function sendPasswordResetEmail({ to, token }) {
  const link = `${env.clientUrl}/reset-password?token=${token}`;
  const subject = 'Reset your password';
  const text = `We received a request to reset your password.\n\nOpen this link to choose a new one:\n${link}\n\nThis link expires in ${env.resetTokenExpiresMinutes} minutes. If you did not request a reset, you can ignore this email.`;

  return sendMail({ to, subject, text });
}

export async function sendVerificationEmail({ to, token }) {
  const link = `${env.clientUrl}/verify-email?token=${token}`;
  const subject = 'Verify your email';
  const text = `Welcome! Please verify your email address to activate your account.\n\nOpen this link to verify:\n${link}\n\nThis link expires in 24 hours. If you did not create this account, you can ignore this email.`;

  return sendMail({ to, subject, text });
}
