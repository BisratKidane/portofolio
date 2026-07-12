export function assertProductionSecrets({ nodeEnv, jwtSecret }) {
  if (nodeEnv === 'production' && (!jwtSecret || jwtSecret === 'change-me')) {
    throw new Error('JWT_SECRET must be set to a non-default value in production.');
  }
}
