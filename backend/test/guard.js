import { env } from '../src/config/env.js';

export function assertTestDatabase() {
  const isTestEnv = env.nodeEnv === 'test';
  const isTestDbName = /_test$/.test(env.database.name);

  if (!isTestEnv || !isTestDbName) {
    throw new Error(
      `Refusing to run tests: expected NODE_ENV=test and DB_NAME ending in "_test", ` +
      `got NODE_ENV=${env.nodeEnv} DB_NAME=${env.database.name}. ` +
      `Check that ENV_FILE points at env/test.env before Vitest loads.`
    );
  }
}
