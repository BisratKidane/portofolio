import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Mirrors env.js's __dirname-relative resolution pattern (backend/src/config/env.js:1-10) --
// never process.cwd(), so this resolves identically whether launched via `npm start`,
// `nodemon` (dev), or the Docker CMD (backend/Dockerfile sets WORKDIR /app/backend).
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const photoStorageConfig = {
  photosDir: path.resolve(__dirname, '../../storage/photos')
};
