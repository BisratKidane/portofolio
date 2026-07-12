export function corsOriginValidator(origin, callback, { clientOrigins }) {
  if (!origin || clientOrigins.includes(origin)) return callback(null, true);

  console.warn(`CORS rejected origin: ${origin}`);
  return callback(new Error('Not allowed by CORS.'));
}

export function buildCorsOptions(env) {
  return {
    origin: (origin, callback) => corsOriginValidator(origin, callback, env),
    credentials: true
  };
}
