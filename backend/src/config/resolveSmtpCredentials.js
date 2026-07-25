// Resolves the SMTP credentials the mailer uses, from raw environment values.
//
// Supports Resend (https://resend.com) as a first-class provider: setting a
// single RESEND_API_KEY is enough to send in any environment (including local
// dev) — it defaults the host to smtp.resend.com and the SMTP username to
// "resend", per Resend's SMTP docs. Explicit SMTP_* variables always win, so a
// different provider can be used by setting SMTP_HOST/SMTP_USER/SMTP_PASS.
export function resolveSmtpCredentials(source = process.env) {
  const resendApiKey = source.RESEND_API_KEY || '';
  const hasResend = Boolean(resendApiKey);

  return {
    smtpHost: source.SMTP_HOST || (hasResend ? 'smtp.resend.com' : ''),
    smtpPort: Number(source.SMTP_PORT || 587),
    smtpUser: source.SMTP_USER || (hasResend ? 'resend' : ''),
    smtpPass: source.SMTP_PASS || resendApiKey || '',
    smtpFrom: source.SMTP_FROM || 'no-reply@portfolio.local',
    smtpReplyTo: source.SMTP_REPLY_TO || ''
  };
}
