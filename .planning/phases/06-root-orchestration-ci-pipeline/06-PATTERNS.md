# Phase 6: Root Orchestration & CI Pipeline - Pattern Map

**Mapped:** 2026-07-12
**Files analyzed:** 3 (1 modified, 2 new)
**Analogs found:** 3 / 3 (2 exact/in-repo-template, 1 structural)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `package.json` (repo root) — add `test` script | config | batch (script fan-out) | `backend/package.json` / `frontend/package.json` `scripts.test` | exact (same script name, same convention, sibling files in the same monorepo) |
| `.github/workflows/ci.yml` (new) | config (CI pipeline) | event-driven (push/PR trigger → batch test run) | `docker-compose.yml` `services.mysql` block | role-match (no CI file exists yet; docker-compose is the closest "declarative service provisioning" analog in-repo) |
| `README.md` — new `## Continuous Integration` section | config (docs) | — (documentation, not code) | Existing `README.md` `##`-level sections (e.g. `## Troubleshooting registration network errors`, `## Deploy remotely with Docker Compose`) | exact (same file, same heading convention) |

No controller/component/service/model files are touched — this phase is pure orchestration/tooling, consistent with CONTEXT.md's "non-destructive, no application runtime changes" boundary.

## Pattern Assignments

### `package.json` (repo root) — add `"test"` script

**Role:** config (npm workspaces root script) · **Data flow:** batch (fan out one command to N workspace scripts)

**Analog:** `backend/package.json` and `frontend/package.json` — both already define `"test": "vitest run"` (the leaf scripts the new root script will fan out to), and the root `package.json` itself already has 5 other scripts following the same style (double-quoted keys, 2-space indent, no trailing comma issues).

**Current root `package.json`** (full file, `/Users/bisrat/Projects/portofolio/package.json` lines 1-23):
```json
{
  "name": "portofolio",
  "version": "1.0.0",
  "private": true,
  "engines": {
    "node": "24.x"
  },
  "workspaces": [
    "backend",
    "frontend"
  ],
  "scripts": {
    "dev": "dotenv -e env/local.env -- concurrently -n backend,frontend -c blue,green \"npm run dev --workspace backend\" \"npm run dev --workspace frontend\"",
    "start": "dotenv -e env/local.env -- concurrently -n backend,frontend -c blue,green \"npm start --workspace backend\" \"npm start --workspace frontend\"",
    "build": "npm run build --workspace frontend",
    "docker:local": "docker compose --env-file env/local.env up --build",
    "docker:remote": "docker compose --env-file env/remote.env up --build -d"
  },
  "devDependencies": {
    "concurrently": "^8.2.2",
    "dotenv-cli": "^7.4.2"
  }
}
```

**Leaf script pattern to fan out to** — `backend/package.json` lines 10-15 and `frontend/package.json` lines 9-15:
```json
"scripts": {
  "dev": "nodemon src/server.js",
  "start": "node src/server.js",
  "check": "node --check src/server.js",
  "test": "vitest run"
}
```
```json
"scripts": {
  "dev": "vite --host 0.0.0.0 --port ${CLIENT_PORT:-5173}",
  "start": "vite --host 0.0.0.0 --port ${CLIENT_PORT:-5173}",
  "build": "vite build",
  "preview": "vite preview --host 0.0.0.0 --port ${CLIENT_PORT:-5173}",
  "test": "vitest run"
}
```

**Pattern to add** (per CONTEXT.md D-01, verified in RESEARCH.md Code Examples):
```json
"scripts": {
  "dev": "...",
  "start": "...",
  "build": "...",
  "docker:local": "...",
  "docker:remote": "...",
  "test": "npm test --workspaces"
}
```
No `try/catch` or validation pattern applies — this is a single string script addition, alphanumerically consistent with the existing `scripts` block. Do not reorder existing keys.

---

### `.github/workflows/ci.yml` (new file)

**Role:** config (CI pipeline definition) · **Data flow:** event-driven (GitHub `push`/`pull_request` events trigger a batch job)

**Analog:** No `.github/workflows/` directory exists yet (confirmed via `ls`: `.github` not found) — this is greenfield. The closest in-repo analog for the MySQL provisioning piece is `docker-compose.yml`'s `services.mysql` block, which is the project's existing declarative "spin up a MySQL matching test/dev env" pattern.

**MySQL service block to translate** — `/Users/bisrat/Projects/portofolio/docker-compose.yml` lines 1-19:
```yaml
services:
  mysql:
    image: mysql:8.4
    restart: unless-stopped
    environment:
      MYSQL_DATABASE: ${MYSQL_DATABASE}
      MYSQL_USER: ${MYSQL_USER}
      MYSQL_PASSWORD: ${MYSQL_PASSWORD}
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
    ports:
      - "${DB_PORT:-3306}:3306"
    volumes:
      - mysql_data:/var/lib/mysql
      - ./backend/test/init/01-create-test-db.sh:/docker-entrypoint-initdb.d/01-create-test-db.sh:ro
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-u", "root", "-p${MYSQL_ROOT_PASSWORD}"]
      interval: 10s
      timeout: 5s
      retries: 10
```
Translation notes for the GitHub Actions `services:` block:
- `image: mysql:8.4` carries over unchanged — matches D-03.
- `environment:` → `env:` in Actions syntax; values must be **literal**, not `${VAR}` interpolation (Actions services don't read job-level `env:` — see RESEARCH.md Pitfall 4). Use the literal values from `env/test.env` below, not the docker-compose `${MYSQL_*}` placeholders.
- `healthcheck:` → `options: --health-cmd="mysqladmin ping -h localhost" --health-interval=10s --health-timeout=5s --health-retries=10` (same command family, same intervals — this repo's own proven values).
- The `volumes` init-script mount (`01-create-test-db.sh`) is **not needed** in CI: `MYSQL_DATABASE` env on the official image already creates that database and grants the `MYSQL_USER` full privileges on it at container init — the init-script is docker-compose-specific plumbing for a scenario the Actions service doesn't need.
- Do not add `restart: unless-stopped` — not a valid/needed key for Actions service containers.

**Values to hard-code in the service `env:` block** — sourced from `/Users/bisrat/Projects/portofolio/env/test.env` (lines 8-12):
```
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=portofolio_test
DB_USER=portofolio
DB_PASSWORD=portofolio
```
`MYSQL_DATABASE=portofolio_test`, `MYSQL_USER=portofolio`, `MYSQL_PASSWORD=portofolio` map directly from `DB_NAME`/`DB_USER`/`DB_PASSWORD`. `MYSQL_ROOT_PASSWORD` has **no equivalent** in `env/test.env` (only used by the image's own bootstrap/health-check, never by the app) — set any throwaway literal value directly in the workflow YAML (RESEARCH.md Pitfall 2).

**Node version source** — `/Users/bisrat/Projects/portofolio/.nvmrc` (full file):
```
24
```
Use `node-version-file: '.nvmrc'` in `actions/setup-node`, not a hardcoded `node-version: 18` — CLAUDE.md/README still say Node 18 but the live repo (`.nvmrc`, all three `package.json engines.node: "24.x"`) is already on 24.

**Root install/test invocation** — mirrors the root `package.json` scripts this phase adds/already has:
```yaml
- run: npm ci
- run: npm test
```
`npm ci` at root installs both workspaces from the single root `package-lock.json` (per root `package.json`'s `workspaces: ["backend", "frontend"]`, lines 8-11). `npm test` invokes the exact script added above — no separate CI-only command, satisfying D-02 ("what runs locally is exactly what runs in CI").

**Full recommended workflow** (from RESEARCH.md Code Examples, cross-checked against docker-compose.yml/env/test.env/.nvmrc above — no discrepancies found):
```yaml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      mysql:
        image: mysql:8.4
        env:
          MYSQL_DATABASE: portofolio_test
          MYSQL_USER: portofolio
          MYSQL_PASSWORD: portofolio
          MYSQL_ROOT_PASSWORD: root_ci_password
        ports:
          - 3306:3306
        options: >-
          --health-cmd="mysqladmin ping -h localhost"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=10

    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-node@v6
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'

      - run: npm ci

      - run: npm test
```

**No env rewriting inside the workflow** — do not add `ENV_FILE`, `NODE_ENV`, or `DB_*` to the workflow `env:` block. `backend/vitest.config.js` (lines 1-15) already sets these itself:
```javascript
process.env.ENV_FILE = path.resolve(__dirname, '../env/test.env');
process.env.NODE_ENV = 'test';
```
And `backend/test/guard.js` (`assertTestDatabase`, lines 1-14) will throw if `NODE_ENV !== 'test'` or the DB name doesn't end in `_test` — this is the existing safety net; CI must satisfy it by *not* overriding these vars, only by making the DB reachable at `127.0.0.1:3306`.

---

### `README.md` — new `## Continuous Integration` section

**Role:** config (documentation) · **Data flow:** — (static docs, no runtime data flow)

**Analog:** Existing `README.md` (`/Users/bisrat/Projects/portofolio/README.md`, 170 lines) — reuse its existing heading/prose conventions rather than inventing new formatting.

**Heading style pattern** (e.g. lines 123-132, `## Troubleshooting registration network errors`):
```markdown
## Troubleshooting registration network errors

If registration shows `Network Error`, the browser could not reach the GraphQL API. Check these items first:

1. The backend is running and <http://localhost:4000/health> returns `{ "status": "ok" }`.
2. `VITE_API_URL` is `/graphql` for local npm and Docker runs so the frontend uses the Vite proxy instead of making a cross-origin request.
...
```
Numbered-list-of-steps + inline code ticks is the established pattern for "how do I configure X" sections (also seen in `## Deploy remotely with Docker Compose`, lines 98-121).

**Recommended placement:** insert a new `## Continuous Integration` section after `## Useful scripts` (line 143-151) and before `## Project structure` (line 153), or after `## Authentication workflow` — either slot fits the existing section ordering (setup topics first, then operational/reference topics last). Content should follow the same numbered-steps style used in `## Deploy remotely with Docker Compose`, covering:
1. What the workflow does (`.github/workflows/ci.yml` runs `npm test` on every push/PR, per D-02/D-06).
2. That the check is **not** merge-blocking by default (D-07) — a workflow alone only produces a pass/fail check.
3. The one-time manual step: GitHub Settings → Branches → branch protection rule → "Require status checks to pass before merging" → select the `test` job (must have run at least once to appear in the picker, per RESEARCH.md Open Questions #1).

**Note (do not silently "fix"):** `README.md` line 3 and line 22 both say "Node.js 18" — this is stale relative to `.nvmrc`/`engines: "24.x"`. This phase's CI section should use Node 24 language; correcting the pre-existing Node-18 references elsewhere in the README is out of scope for this phase unless the user asks for it (avoid unrelated scope creep in the same edit).

---

## Shared Patterns

### npm workspaces script-name convention
**Source:** `backend/package.json` line 14, `frontend/package.json` line 14 (`"test": "vitest run"`)
**Apply to:** root `package.json` — the new root `test` script must use the identical script name (`test`) so `npm test --workspaces` resolves it in each workspace; this is not a new convention, it's reusing the existing one.

### Env-driven test config (no CI-side overrides)
**Source:** `backend/vitest.config.js` (lines 1-15), `backend/test/guard.js` (lines 1-14), `env/test.env` (12 lines)
**Apply to:** `.github/workflows/ci.yml` — the workflow must NOT set `ENV_FILE`/`NODE_ENV`/`DB_*` itself; it only needs to make a MySQL instance reachable at `127.0.0.1:3306` with `portofolio_test`/`portofolio`/`portofolio`. Everything else (env loading, DB guard, schema sync/teardown) is already handled by the existing Phase 1/3 harness untouched.

### Declarative service container provisioning
**Source:** `docker-compose.yml` lines 1-19 (`services.mysql`)
**Apply to:** `.github/workflows/ci.yml` `services.mysql` block — same image, same healthcheck command family, same port; translate `${VAR}` interpolation to literal values (Actions services don't inherit job `env:`) and drop the docker-compose-only init-script volume mount (unneeded — `MYSQL_DATABASE` env on the official image self-provisions the database).

### README section formatting
**Source:** `README.md` lines 98-132 (`## Deploy remotely with Docker Compose`, `## Troubleshooting registration network errors`)
**Apply to:** the new `## Continuous Integration` section — numbered steps, inline code ticks for file/setting names, no new heading levels beyond `##`/numbered list.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `.github/workflows/ci.yml` | config (CI pipeline) | event-driven | No `.github/workflows/` directory exists in this repo (confirmed: `ls .github` → not found). This is genuinely greenfield; the docker-compose.yml `services.mysql` block (documented above) is the best available in-repo template for the DB-provisioning portion, and RESEARCH.md's verified `actions/checkout@v7`/`actions/setup-node@v6` code example (Code Examples section) should be used as the structural template for the rest of the file. |

## Metadata

**Analog search scope:** repo root (`package.json`, `docker-compose.yml`, `.nvmrc`, `README.md`), `backend/` (`package.json`, `vitest.config.js`, `test/guard.js`, `test/init/01-create-test-db.sh`), `frontend/` (`package.json`), `env/test.env`, `.github/` (confirmed absent)
**Files scanned:** 10
**Pattern extraction date:** 2026-07-12
