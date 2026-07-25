import { describe, it, expect } from 'vitest';
import { buildTransportOptions } from './mailer.js';

const productionConfig = {
  nodeEnv: 'production',
  smtpHost: 'smtp.example.com',
  smtpUser: 'apikey',
  smtpPass: 'secret'
};

describe('buildTransportOptions', () => {
  it('uses jsonTransport in tests and when SMTP is unconfigured, so no email is sent', () => {
    // Tests must never open a socket, even if credentials happen to be present.
    expect(buildTransportOptions({ nodeEnv: 'test' })).toEqual({ jsonTransport: true });
    expect(buildTransportOptions({ nodeEnv: 'test', smtpHost: 'smtp.resend.com', smtpPass: 're_x' })).toEqual({
      jsonTransport: true
    });
    // Unconfigured dev (no key yet) falls back to jsonTransport so the app still boots.
    expect(buildTransportOptions({ nodeEnv: 'development' })).toEqual({ jsonTransport: true });
    expect(buildTransportOptions({ nodeEnv: 'development', smtpHost: 'smtp.resend.com' })).toEqual({
      jsonTransport: true
    });
  });

  it('builds a real SMTP transport in development once configured, so local sends via Resend', () => {
    const options = buildTransportOptions({
      nodeEnv: 'development',
      smtpHost: 'smtp.resend.com',
      smtpPort: 587,
      smtpUser: 'resend',
      smtpPass: 're_local_key'
    });

    expect(options.jsonTransport).toBeUndefined();
    expect(options.host).toBe('smtp.resend.com');
    expect(options.port).toBe(587);
    expect(options.requireTLS).toBe(true);
    expect(options.auth).toEqual({ user: 'resend', pass: 're_local_key' });
  });

  it('enforces STARTTLS on port 587 in production', () => {
    const options = buildTransportOptions({ ...productionConfig, smtpPort: 587 });

    expect(options.secure).toBe(false);
    expect(options.requireTLS).toBe(true);
    expect(options.host).toBe('smtp.example.com');
    expect(options.port).toBe(587);
  });

  it('enforces implicit TLS on port 465 in production', () => {
    const options = buildTransportOptions({ ...productionConfig, smtpPort: 465 });

    expect(options.secure).toBe(true);
    expect(options.port).toBe(465);
  });

  it('never permits a cleartext session in production, whatever the port', () => {
    for (const smtpPort of [25, 465, 587, 2525, '587', '465']) {
      const options = buildTransportOptions({ ...productionConfig, smtpPort });

      expect(options.secure || options.requireTLS).toBe(true);
    }
  });
});
