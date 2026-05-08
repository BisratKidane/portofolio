# Portofolio

A full-stack Node.js 18 application with an Express, MySQL, Sequelize, and GraphQL backend plus a React, Axios, GraphQL, and MUI frontend.

## Features

- Node.js 18 across local scripts and Docker images.
- Express backend exposing GraphQL at `/graphql`.
- Sequelize models are collected and exported from `backend/src/models/index.js` as a single `models` object.
- GraphQL schemas live in `backend/src/schemas` and resolvers live in `backend/src/resolvers`.
- User registration, login, logout, password reset token generation, and password reset.
- Role-based access with `ADMIN` and `USER` roles.
  - The first registered account becomes `ADMIN`.
  - Later registered accounts become ordinary `USER` accounts.
  - Admins can see system users on the dashboard; ordinary users only see their own dashboard.
- React Router protected dashboard route.
- MUI components for the UI.
- Frontend GraphQL requests are centralized in `frontend/src/api/graphqlClient.js` and made through Axios.

## Requirements

- Node.js 18.x
- npm 9+
- MySQL 8+ for non-Docker local development
- Docker and Docker Compose for container deployments

If you use `nvm`, run:

```bash
nvm use
```

## Environment files

Environment files are in the `env` folder:

- `env/local.env` - local development defaults for `npm start`, `npm run dev`, and local Docker Compose.
- `env/local.container.env` - optional local container-specific example where the database host is `mysql`.
- `env/remote.env` - remote Docker Compose template. Replace passwords, `JWT_SECRET`, `CLIENT_URL`, and public API settings before using it in production.

The same code runs in local npm, local Docker, and remote Docker environments. Change the environment file or Docker Compose command; do not change application code.

## Install dependencies

```bash
npm install
```

## Run locally with npm

1. Start or create a local MySQL database matching `env/local.env`:

   ```bash
   docker compose --env-file env/local.env up -d mysql
   ```

   You can also use any MySQL server if it has the database, user, and password from `env/local.env`.

2. Start the backend and frontend together:

   ```bash
   npm run dev
   ```

   Or run the non-watch start command:

   ```bash
   npm start
   ```

3. Open the app:

   - Frontend: <http://localhost:5173>
   - GraphQL endpoint: <http://localhost:4000/graphql>
   - Backend health check: <http://localhost:4000/health>

## Run locally with Docker Compose

Use the local environment file and build all services:

```bash
npm run docker:local
```

Equivalent direct Docker Compose command:

```bash
docker compose --env-file env/local.env up --build
```

Docker Compose starts:

- MySQL on port `3306`
- Backend on port `4000`
- Frontend on port `5173`

## Deploy remotely with Docker Compose

1. Copy the repository to the server.
2. Edit `env/remote.env` and replace every placeholder secret or URL:
   - `CLIENT_URL`
   - `VITE_API_URL`
   - `JWT_SECRET`
   - `DB_PASSWORD`
   - `MYSQL_PASSWORD`
   - `MYSQL_ROOT_PASSWORD`
3. Start the stack:

   ```bash
   npm run docker:remote
   ```

   Equivalent direct Docker Compose command:

   ```bash
   docker compose --env-file env/remote.env up --build -d
   ```

4. Put a reverse proxy such as Nginx, Caddy, or a load balancer in front of the frontend/backend as needed for HTTPS and your public domain.

## Authentication workflow

1. Register the first account. It is automatically assigned the `ADMIN` role.
2. Register additional accounts. They are assigned the `USER` role.
3. Login stores a JWT in browser local storage.
4. The protected dashboard route sends the JWT in the `Authorization: Bearer <token>` header.
5. Logout clears the token from local storage and calls the backend logout mutation.
6. Password reset currently returns a development reset token from the GraphQL mutation so the flow works without email infrastructure. For production, connect `requestPasswordReset` to an email provider and avoid returning the token to the browser.

## Useful scripts

```bash
npm run dev          # Run backend and frontend with env/local.env
npm start            # Run backend and frontend without nodemon
npm run build        # Build the React frontend
npm run docker:local # Build and run the local Docker stack
npm run docker:remote# Build and run the remote Docker stack in detached mode
```

## Project structure

```text
backend/
  src/
    config/      # Environment and Sequelize setup
    models/      # Sequelize models and exported models object
    resolvers/   # GraphQL resolvers
    schemas/     # GraphQL schemas/type definitions
    utils/       # Authentication helpers
frontend/
  src/
    api/         # Central Axios GraphQL client
    components/  # Layout/protected route components
    context/     # Authentication context
    pages/       # Login/register/password reset/dashboard pages
env/             # Local and remote environment files
```
