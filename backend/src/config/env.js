import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { assertProductionMailConfig } from './assertProductionMailConfig.js';
import { assertProductionSecrets } from './assertProductionSecrets.js';
import { requiredPositiveInt } from './requiredPositiveInt.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultEnvPath = path.resolve(__dirname, '../../../env/local.env');

dotenv.config({ path: process.env.ENV_FILE || defaultEnvPath });

const clientOrigins = (process.env.CLIENT_ORIGINS || process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  clientUrl: process.env.CLIENT_URL || clientOrigins[0],
  clientOrigins,
  jwtSecret: process.env.JWT_SECRET || 'change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  resetTokenExpiresMinutes: Number(process.env.RESET_TOKEN_EXPIRES_MINUTES || 30),
  // CR-03: 12 selection levels comfortably covers realistic family-tree
  // traversals while bounding the exponential amplification available on a
  // schema where mother/father/children/spouses/siblings are mutually
  // recursive. Parsed strictly so a malformed value fails at startup
  // instead of silently disabling the rule (CR-04).
  maxQueryDepth: requiredPositiveInt(process.env.MAX_QUERY_DEPTH, 12, 'MAX_QUERY_DEPTH'),
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  smtpFrom: process.env.SMTP_FROM || 'no-reply@portfolio.local',
  database: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    name: process.env.DB_NAME || 'portofolio',
    user: process.env.DB_USER || 'portofolio',
    password: process.env.DB_PASSWORD || 'portofolio'
  }
};

assertProductionSecrets({ nodeEnv: env.nodeEnv, jwtSecret: env.jwtSecret });
assertProductionMailConfig({
  nodeEnv: env.nodeEnv,
  smtpHost: env.smtpHost,
  smtpUser: env.smtpUser,
  smtpPass: env.smtpPass
});
