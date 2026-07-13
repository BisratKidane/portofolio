export function assertProductionMailConfig({ nodeEnv, smtpHost, smtpUser, smtpPass }) {
  if (nodeEnv === 'production' && (!smtpHost || !smtpUser || !smtpPass)) {
    throw new Error('SMTP_HOST, SMTP_USER, and SMTP_PASS must be set in production.');
  }
}
