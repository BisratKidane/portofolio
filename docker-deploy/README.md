# docker-deploy — deploy to a single Docker host

> This repo has **two** deploy paths. This one runs the app with Docker Compose on
> one server (the Hetzner box). For Kubernetes, see [`../kubernetes-deploy`](../kubernetes-deploy).

One command builds the images from `main`, pushes them to Docker Hub, then makes
the server pull and restart:

```
./deploy.sh   →  build (main, amd64)  →  push to Docker Hub  →  SSH: docker compose pull + up -d
```

Only [Caddy](https://caddyserver.com/) is public; it terminates TLS and routes
`https://$DOMAIN/graphql*` → backend and everything else → the static frontend.
`backend` and `mysql` have no public ports.

---

## Run the deploy

### First time

1. **Prereqs**
   - Local: Docker + buildx (Docker Desktop has both).
   - Docker Hub account, and `docker login` on your laptop.
   - Server: Docker + Docker Compose, SSH key access, ports 80/443 open.
   - A **domain** with a DNS A record pointing at the server (Caddy needs it for TLS).
   - Real **SMTP** credentials (`NODE_ENV=production` won't boot without them).

2. **Configure** (both files are gitignored):
   ```bash
   cd docker-deploy
   cp deploy.config.example deploy.config   # set DOCKERHUB_USER, SERVER_SSH, DOMAIN
   cp remote.env.example    remote.env      # set secrets, DOMAIN, SMTP_* (leave no CHANGE_ME)
   ```

3. **Log in to Docker Hub** (so the build can push):
   ```bash
   docker login
   ```

4. **Deploy:**
   ```bash
   ./deploy.sh
   ```
   The script verifies SSH, builds both images from `main`, pushes them, ships the
   compose files, and runs `docker compose pull && up -d` on the server, then waits
   for the backend health check.

5. **Open** `https://$DOMAIN`. First user to verify their email becomes `ADMIN`.

### Every time after

```bash
cd docker-deploy
./deploy.sh                 # rebuild from main, push, redeploy
./deploy.sh --skip-build    # redeploy the last-built images (no rebuild)
```

You can run `./deploy.sh` from any branch — it always builds the app from **`main`**
(`git archive main`). Each build is tagged `:latest` and `:<main-short-sha>`; the
sha tag is what gets deployed, so the server runs exactly what you built.

---

## What each file does

| File | Purpose |
|------|---------|
| `deploy.sh` | Entry point — build, push, deploy, health-check. `--skip-build` to skip rebuild. |
| `build-and-push.sh` | Cross-builds (`linux/amd64`) backend + frontend from `main`, pushes to Docker Hub. |
| `docker-compose.yml` | Server stack: pulls images, runs Caddy + frontend + backend + mysql. |
| `frontend.Dockerfile` | Production frontend: `vite build` → static files served by nginx. |
| `Caddyfile` | TLS + path routing at the edge. |
| `deploy.config.example` | Copy → `deploy.config` (gitignored): registry user, server, domain. |
| `remote.env.example` | Copy → `remote.env` (gitignored): production secrets + config. |

## Operate the server

```bash
ssh <SERVER_SSH> ; cd /opt/portofolio
docker compose --env-file remote.env ps
docker compose --env-file remote.env logs -f backend
docker compose --env-file remote.env down       # stop the stack
```

## Notes

- **Single backend instance** — the login/register rate limiter is in-memory per
  process; don't scale the backend past 1 without moving it to a shared store.
- **Frontend config is build-time** — `VITE_API_URL=/graphql` is baked in, so a
  change means a rebuild.
- **TLS needs DNS first** — Caddy can only issue a cert once `$DOMAIN` resolves to
  the server and 80/443 are reachable.
