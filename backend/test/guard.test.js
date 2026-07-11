import { describe, it, expect, afterEach } from 'vitest';
import { env } from '../src/config/env.js';
import { assertTestDatabase } from './guard.js';

const originalNodeEnv = env.nodeEnv;
const originalDbName = env.database.name;

describe('assertTestDatabase', () => {
  afterEach(() => {
    env.nodeEnv = originalNodeEnv;
    env.database.name = originalDbName;
  });

  it('does not throw when NODE_ENV is test and DB_NAME ends with _test', () => {
    env.nodeEnv = 'test';
    env.database.name = 'portofolio_test';

    expect(() => assertTestDatabase()).not.toThrow();
  });

  it('throws when NODE_ENV is not test, even if DB_NAME ends with _test', () => {
    env.nodeEnv = 'development';
    env.database.name = 'portofolio_test';

    expect(() => assertTestDatabase()).toThrow();
  });

  it('throws when DB_NAME does not end with _test, even if NODE_ENV is test', () => {
    env.nodeEnv = 'test';
    env.database.name = 'portofolio';

    expect(() => assertTestDatabase()).toThrow();
  });
});
