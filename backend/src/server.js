import express from 'express';
import cors from 'cors';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { env } from './config/env.js';
import { buildCorsOptions } from './config/corsOptions.js';
import { initializeDatabase, models } from './models/index.js';
import { typeDefs, resolvers, validationRules } from './graphql/serverConfig.js';
import { getUserFromRequest } from './utils/auth.js';
import { rateLimitPlugin } from './plugins/rateLimitPlugin.js';

const app = express();

app.set('trust proxy', 1);

export { app };

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use(cors(buildCorsOptions(env)));

const apollo = new ApolloServer({ typeDefs, resolvers, validationRules, plugins: [rateLimitPlugin] });

await apollo.start();
await initializeDatabase();

app.use(
  '/graphql',
  express.json(),
  expressMiddleware(apollo, {
    context: async ({ req }) => ({
      models,
      user: await getUserFromRequest(req, models),
      clientIp: req.ip
    })
  })
);

if (env.nodeEnv !== 'test') {
  app.listen(env.port, () => {
    console.log(`Backend ready at http://localhost:${env.port}/graphql`);
  });
}
