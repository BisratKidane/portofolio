import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.ENV_FILE = path.resolve(__dirname, '../env/test.env');
process.env.NODE_ENV = 'test';

export default defineConfig({
  test: {
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false
  }
});
