# Production frontend image: build the SPA with Vite, serve the static output
# with nginx. This replaces the dev-server-in-production approach — no Vite dev
# server, no allowedHosts issues. The /graphql calls are same-origin and routed
# to the backend by the Caddy edge proxy (see Caddyfile), so nginx only needs to
# serve static files with SPA history fallback.
#
# Build context is a clean checkout of the `main` branch (see build-and-push.sh);
# reference this file with `-f docker-deploy/frontend.Dockerfile`.

FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY frontend/package*.json ./frontend/
RUN npm install --workspace frontend
COPY frontend ./frontend
# Baked into the bundle at build time; the browser calls same-origin /graphql.
ARG VITE_API_URL=/graphql
ENV VITE_API_URL=$VITE_API_URL
WORKDIR /app/frontend
RUN npm run build

FROM nginx:alpine
# SPA history fallback: unknown paths return index.html so client-side routing works.
RUN printf 'server {\n\
    listen 80;\n\
    server_name _;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
