---
phase: 01-backend-test-tooling-test-database
reviewed: 2026-07-11T20:24:46Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - backend/package.json
  - backend/src/models/database.test.js
  - backend/src/smoke.test.js
  - backend/test/globalSetup.js
  - backend/test/guard.js
  - backend/test/guard.test.js
  - backend/test/helpers.js
  - backend/test/init/01-create-test-db.sh
  - backend/vitest.config.js
  - env/test.env
findings:
  critical: 0
  warning: 3
  info: 5
  total: 8
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-07-11T20:24:46Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

This phase adds the backend test foundation: a Vitest runner (`vitest.config.js`),
a global DB harness (`globalSetup.js`), a destructive-operation safety guard
(`guard.js`), test helpers, a MySQL init script, and an isolated `env/test.env`.

The destructive path (`sync({ force: true })` / `sequelize.drop()`) is reasonably
well guarded: `globalSetup` calls `assertTestDatabase()` before syncing, and
`sync` additionally passes `match: /_test$/`. I traced the env-loading chain
(`vitest.config.js` sets `ENV_FILE`/`NODE_ENV` → `env.js` `dotenv.config` →
`config/database.js` builds the Sequelize instance) and the fork-inheritance path
for workers; both hold up, so I found **no data-loss or security BLOCKER**.

The findings below are correctness/robustness concerns: a flaky-test pattern in
the helper, a safety guard that is weaker than it appears, and a hardcoded DB-name
string duplicated across three files that can silently drift.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: `createTestUser` derives email from `Date.now()` — non-unique, flaky under the unique constraint

**File:** `backend/test/helpers.js:7-15`
**Issue:** `email: \`test-${Date.now()}@example.com\`` is only millisecond-resolution.
The `email` column has `unique: true` (`backend/src/models/User.js:22-26`). Two
`createTestUser()` calls that resolve within the same millisecond — e.g. when a
caller passes an explicit `overrides.email`-free batch, or when bcrypt work is
cached/mocked in future tests — will violate the unique constraint and throw a
`SequelizeUniqueConstraintError`. This is a latent flaky-test source in exactly
the "fails loudly / trust the suite" foundation this phase is meant to establish.
The project already declares `uuid` as a dependency (currently unused per CLAUDE.md).
**Fix:**
```js
import { randomUUID } from 'node:crypto';
// or: import { v4 as uuid } from 'uuid';

export async function createTestUser(overrides = {}) {
  return models.User.create({
    name: 'Test User',
    email: `test-${randomUUID()}@example.com`,
    passwordHash: 'Password123!',
    role: 'USER',
    ...overrides
  });
}
```

### WR-02: `assertTestDatabase` NODE_ENV check is always true under Vitest — real protection is single-factor

**File:** `backend/test/guard.js:3-14`
**Issue:** The guard reads as two-factor (`NODE_ENV=test` AND DB name ends in `_test`),
but under this setup the first condition is *always* satisfied: `vitest.config.js:7`
forces `process.env.NODE_ENV = 'test'`, and Vitest itself defaults `NODE_ENV` to
`test`. So `isTestEnv` can never be false when the suite runs. The only condition
that actually prevents wiping a non-test database is the `_test$` suffix on
`env.database.name`. That is defensible, but the two-condition structure gives a
false sense of defense-in-depth: anyone reading it may assume `NODE_ENV` adds a
layer that it does not. If a developer's shell exports `DB_NAME` (dotenv does not
override pre-set vars — `env.js:9`), the suffix check is the sole thing standing
between the test run and a real database.
**Fix:** Make the effective guard explicit and strengthen it — assert on something
that cannot be trivially forced, and document that the DB-name suffix is the real
gate:
```js
export function assertTestDatabase() {
  const isTestDbName = /_test$/.test(env.database.name);
  // NODE_ENV is force-set to 'test' by vitest.config.js, so it is NOT a real
  // guard — the _test suffix on the DB name is the only effective protection.
  if (!isTestDbName) {
    throw new Error(
      `Refusing to run tests: DB_NAME must end in "_test", got ${env.database.name}. `
    );
  }
}
```
(Optionally also assert `env.database.host` is a known local/test host.)

### WR-03: Test DB name `portofolio_test` is a magic string duplicated across three files and can drift

**File:** `backend/test/init/01-create-test-db.sh:5-6`, `env/test.env:10`, `backend/test/guard.js:5`
**Issue:** The literal database name is hardcoded in the init script
(`CREATE DATABASE IF NOT EXISTS portofolio_test` / `GRANT ... ON portofolio_test.*`),
while the app reads its name from `DB_NAME=portofolio_test` in `env/test.env`, and
the guard/sync rely on a `_test$` regex. If `DB_NAME` in `test.env` is ever changed
(e.g. `myapp_test`), the guard still passes but the init script creates/grants the
*wrong* database, and tests fail at connect time with a confusing error. Separately,
the `GRANT ... TO '$MYSQL_USER'@'%'` statement will fail (aborting container init
under `set -e`) if `MYSQL_USER` is unset or does not match `DB_USER=portofolio`,
and an unset `MYSQL_USER` would grant to the anonymous `''@'%'` account.
**Fix:** Source the name from the same env variable the app uses, and guard the user:
```bash
#!/bin/bash
set -euo pipefail

: "${MYSQL_ROOT_PASSWORD:?}" "${MYSQL_USER:?}"
DB_NAME="${DB_NAME:-portofolio_test}"

mysql -u root -p"$MYSQL_ROOT_PASSWORD" <<-EOSQL
	CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\`;
	GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${MYSQL_USER}'@'%';
	FLUSH PRIVILEGES;
EOSQL
```

## Info

### IN-01: `helpers.js` exports (`resetTables`, `createTestUser`) are unused

**File:** `backend/test/helpers.js:3-15`
**Issue:** Confirmed via grep — neither `resetTables` nor `createTestUser` is
imported by any of the three current test files (`smoke.test.js`,
`database.test.js`, `guard.test.js`). This is scaffolding for future tests, but
as of this phase it is dead code that ships untested (the helpers themselves are
never exercised, so a bug in `resetTables`/`createTestUser` would go unnoticed).
**Fix:** Either add a test that uses them (which would also validate the create/
truncate cycle end-to-end), or defer adding the file until the first consumer lands.

### IN-02: `env/test.env` commits literal secrets (`JWT_SECRET`, `DB_PASSWORD`)

**File:** `env/test.env:5,12`
**Issue:** `JWT_SECRET=change-me-local-jwt-secret` and `DB_PASSWORD=portofolio`
are committed. For a test-only file loaded solely when `ENV_FILE` points at it
this is low risk, but CLAUDE.md references a "forbidden files / do-not-read env
values" policy, so committing a real-looking secret here is worth an explicit
decision. Ensure this secret is never reused for dev/remote and that `env/test.env`
is intentionally tracked (not accidentally un-ignored).
**Fix:** Keep the value obviously non-production (e.g. `test-only-not-a-real-secret`)
and add a comment noting these are throwaway CI/test credentials.

### IN-03: `resetTables` passes redundant `where: {}` alongside `truncate: true`

**File:** `backend/test/helpers.js:4`
**Issue:** `models.User.destroy({ where: {}, truncate: true })` — Sequelize ignores
`where` when `truncate` is true, so the clause is dead/misleading and implies a
filtered delete that does not happen.
**Fix:** `await models.User.destroy({ truncate: true });`

### IN-04: `vitest.config.js` mutates `process.env` as a module-load side effect

**File:** `backend/vitest.config.js:6-7`
**Issue:** `ENV_FILE`/`NODE_ENV` are set imperatively at config module load. It
works (config loads before globalSetup and workers inherit via fork), but it is an
implicit side effect and couples correctness to load order.
**Fix:** Prefer Vitest's declarative `test.env` block, or a dedicated `globalSetup`/
`setupFiles` entry, so the env contract is explicit:
```js
export default defineConfig({
  test: {
    env: { ENV_FILE: path.resolve(__dirname, '../env/test.env'), NODE_ENV: 'test' },
    globalSetup: ['./test/globalSetup.js'],
    pool: 'forks',
    fileParallelism: false
  }
});
```

### IN-05: `guard.test.js` mutates the shared `env` singleton in place

**File:** `backend/test/guard.test.js:5-33`
**Issue:** The test reassigns `env.nodeEnv` and `env.database.name` on the imported
singleton and restores them in `afterEach`. It is safe here (each file runs in its
own fork, `fileParallelism: false`), but mutating shared config from a test is
fragile — any early `return`/added assertion before restoration, or future in-file
parallelism, would leak state into sibling tests.
**Fix:** Pass the values to guard explicitly (refactor `assertTestDatabase` to accept
an env object / individual params) so the test needs no global mutation, e.g.
`assertTestDatabase({ nodeEnv, dbName })`.

---

_Reviewed: 2026-07-11T20:24:46Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
