import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { assertProductionSecrets } from './assertProductionSecrets.js';

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
  database: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    name: process.env.DB_NAME || 'portofolio',
    user: process.env.DB_USER || 'portofolio',
    password: process.env.DB_PASSWORD || 'portofolio'
  }
};

assertProductionSecrets({ nodeEnv: env.nodeEnv, jwtSecret: env.jwtSecret });
