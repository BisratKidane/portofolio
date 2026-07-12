import { describe, it, expect } from 'vitest';
import { assertProductionSecrets } from './assertProductionSecrets.js';

describe('assertProductionSecrets', () => {
  it('throws when nodeEnv is production and jwtSecret is unset', () => {
    expect(() => assertProductionSecrets({ nodeEnv: 'production', jwtSecret: undefined })).toThrow();
  });

  it('throws when nodeEnv is production and jwtSecret is the insecure default', () => {
    expect(() => assertProductionSecrets({ nodeEnv: 'production', jwtSecret: 'change-me' })).toThrow();
  });

  it('does not throw when nodeEnv is production and jwtSecret is a real strong secret', () => {
    expect(() =>
      assertProductionSecrets({ nodeEnv: 'production', jwtSecret: 'a-real-strong-secret-value' })
    ).not.toThrow();
  });

  it('does not throw when nodeEnv is test, even with the insecure default secret', () => {
    expect(() => assertProductionSecrets({ nodeEnv: 'test', jwtSecret: 'change-me' })).not.toThrow();
  });

  it('does not throw when nodeEnv is development and jwtSecret is unset', () => {
    expect(() => assertProductionSecrets({ nodeEnv: 'development', jwtSecret: undefined })).not.toThrow();
  });
});
