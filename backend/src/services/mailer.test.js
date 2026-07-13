import { describe, it, expect } from 'vitest';
import { buildTransportOptions } from './mailer.js';

const productionConfig = {
  nodeEnv: 'production',
  smtpHost: 'smtp.example.com',
  smtpUser: 'apikey',
  smtpPass: 'secret'
};

describe('buildTransportOptions', () => {
  it('uses jsonTransport outside production so dev and test produce no network egress', () => {
    expect(buildTransportOptions({ nodeEnv: 'test' })).toEqual({ jsonTransport: true });
    expect(buildTransportOptions({ nodeEnv: 'development' })).toEqual({ jsonTransport: true });
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
