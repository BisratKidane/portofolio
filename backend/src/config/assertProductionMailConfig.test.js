import { describe, it, expect } from 'vitest';
import { assertProductionMailConfig } from './assertProductionMailConfig.js';

describe('assertProductionMailConfig', () => {
  it('throws when nodeEnv is production and no SMTP config is set', () => {
    expect(() =>
      assertProductionMailConfig({
        nodeEnv: 'production',
        smtpHost: undefined,
        smtpUser: undefined,
        smtpPass: undefined
      })
    ).toThrow();
  });

  it('throws when nodeEnv is production and SMTP config is only partially set', () => {
    expect(() =>
      assertProductionMailConfig({
        nodeEnv: 'production',
        smtpHost: 'smtp.example.com',
        smtpUser: undefined,
        smtpPass: undefined
      })
    ).toThrow();
  });

  it('does not throw when nodeEnv is production and SMTP config is complete', () => {
    expect(() =>
      assertProductionMailConfig({
        nodeEnv: 'production',
        smtpHost: 'smtp.example.com',
        smtpUser: 'user',
        smtpPass: 'pass'
      })
    ).not.toThrow();
  });

  it('does not throw when nodeEnv is test and no SMTP config is set', () => {
    expect(() =>
      assertProductionMailConfig({
        nodeEnv: 'test',
        smtpHost: undefined,
        smtpUser: undefined,
        smtpPass: undefined
      })
    ).not.toThrow();
  });

  it('does not throw when nodeEnv is development and no SMTP config is set', () => {
    expect(() =>
      assertProductionMailConfig({
        nodeEnv: 'development',
        smtpHost: undefined,
        smtpUser: undefined,
        smtpPass: undefined
      })
    ).not.toThrow();
  });
});
