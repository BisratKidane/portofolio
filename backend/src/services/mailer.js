import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

const transporter = nodemailer.createTransport(
  env.nodeEnv === 'production'
    ? {
        host: env.smtpHost,
        port: env.smtpPort,
        auth: { user: env.smtpUser, pass: env.smtpPass }
      }
    : { jsonTransport: true }
);

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
