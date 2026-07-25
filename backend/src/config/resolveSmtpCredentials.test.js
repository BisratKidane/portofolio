import { describe, it, expect } from 'vitest';
import { resolveSmtpCredentials } from './resolveSmtpCredentials.js';

describe('resolveSmtpCredentials', () => {
  it('defaults host/user for Resend when only RESEND_API_KEY is set (so local can send with one variable)', () => {
    const creds = resolveSmtpCredentials({ RESEND_API_KEY: 're_test_123' });
    expect(creds.smtpHost).toBe('smtp.resend.com');
    expect(creds.smtpUser).toBe('resend');
    expect(creds.smtpPass).toBe('re_test_123');
    expect(creds.smtpPort).toBe(587);
  });

  it('lets explicit SMTP_* variables override the Resend defaults (any provider)', () => {
    const creds = resolveSmtpCredentials({
      RESEND_API_KEY: 're_test_123',
      SMTP_HOST: 'smtp.mailgun.org',
      SMTP_USER: 'postmaster',
      SMTP_PASS: 'mg-secret',
      SMTP_PORT: '465'
    });
    expect(creds.smtpHost).toBe('smtp.mailgun.org');
    expect(creds.smtpUser).toBe('postmaster');
    expect(creds.smtpPass).toBe('mg-secret');
    expect(creds.smtpPort).toBe(465);
  });

  it('carries the from and reply-to addresses through', () => {
    const creds = resolveSmtpCredentials({
      RESEND_API_KEY: 're_test_123',
      SMTP_FROM: '"Portofolio" <noreply@example.ch>',
      SMTP_REPLY_TO: 'you@gmail.com'
    });
    expect(creds.smtpFrom).toBe('"Portofolio" <noreply@example.ch>');
    expect(creds.smtpReplyTo).toBe('you@gmail.com');
  });

  it('leaves host/user/pass empty and reply-to blank when nothing is configured', () => {
    const creds = resolveSmtpCredentials({});
    expect(creds.smtpHost).toBe('');
    expect(creds.smtpUser).toBe('');
    expect(creds.smtpPass).toBe('');
    expect(creds.smtpReplyTo).toBe('');
    expect(creds.smtpFrom).toBe('no-reply@portfolio.local');
  });
});
