# Phase 1: Backend Test Tooling & Test Database - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-11
**Phase:** 1-Backend Test Tooling & Test Database
**Areas discussed:** Test DB lifecycle, Test env & safety guard, Test file location, Shared DB harness shape, Local DB provisioning, Env wiring

---

## Test DB Lifecycle

### Who creates the MySQL test database?
| Option | Description | Selected |
|--------|-------------|----------|
| Pre-created, harness resets tables | DB pre-exists (dev/CI); harness manages only tables via sync({force:true}). Least privilege. | ✓ |
| Harness creates/drops the DB | Harness uses admin creds for CREATE/DROP DATABASE. Self-contained but elevated privileges. | |

### How is table state reset per run?
| Option | Description | Selected |
|--------|-------------|----------|
| sync({force:true}) once per run | Drop+recreate tables once at run start (global setup). Fast, clean per run. | ✓ |
| Reset per test file | Recreate/truncate before each file. Stronger isolation, slower. | |

### What does end-of-run teardown do?
| Option | Description | Selected |
|--------|-------------|----------|
| Drop tables + close connection | Drop all tables, close pool. No residual rows, clean Vitest exit. | ✓ |
| Truncate tables + close connection | Empty tables, keep schema, close pool. | |
| Close connection only | Leave tables; next run's sync recreates them. | |

**User's choice:** Pre-created DB + sync({force:true}) per run + drop tables & close connection on teardown.
**Notes:** Chosen for least-privilege and clean mapping to the Phase 6 CI service container.

---

## Test Environment & Safety Guard

### How is env/test.env loaded?
| Option | Description | Selected |
|--------|-------------|----------|
| ENV_FILE + NODE_ENV via test script | Reuse existing ENV_FILE hook in env.js; set via test run. | ✓ |
| Vitest globalSetup loads it | globalSetup dotenv-loads test.env before module imports. | |

### What must the safety guard verify?
| Option | Description | Selected |
|--------|-------------|----------|
| NODE_ENV=test AND name ends with _test | Two independent signals; flexible for future test DBs. | ✓ |
| Exact name match 'portofolio_test' | Strictest; hard-codes single name. | |
| NODE_ENV=test only | Simplest; wouldn't catch a test.env pointing at dev DB. | |

**User's choice:** Reuse ENV_FILE hook; guard requires NODE_ENV==='test' AND DB name ending in `_test`.
**Notes:** Env wiring mechanism later refined (see Env Wiring below) to set ENV_FILE/NODE_ENV in vitest.config.js. Guard lives in globalSetup and throws before any connection.

---

## Test File Location

### Where do backend test files live?
| Option | Description | Selected |
|--------|-------------|----------|
| Co-located src/**/*.test.js | Tests beside code. Vitest default; convention for Phases 2/3. | ✓ |
| Top-level backend/tests/ | Separate mirror tree. | |
| backend/src/__tests__/ | Jest-style grouped folders. | |

### Where does shared test infrastructure live?
| Option | Description | Selected |
|--------|-------------|----------|
| backend/test/ (singular) | Dedicated dir for globalSetup, DB helpers, guard. | ✓ |
| backend/src/test-utils/ | Under src, normal relative imports. | |
| Vitest config references root files | Setup files at backend root. | |

**User's choice:** Co-located `src/**/*.test.js` specs + shared infra in `backend/test/`.

---

## Shared DB Harness Shape

### How do Phases 2 & 3 consume DB setup/teardown?
| Option | Description | Selected |
|--------|-------------|----------|
| Vitest globalSetup + importable helpers | Automatic global lifecycle PLUS resetTables()/createTestUser() helpers. | ✓ |
| Vitest globalSetup only | Only automatic lifecycle; suites use raw model calls. | |
| Importable helpers only | Per-suite setup/teardown calls; easy to forget. | |

### What proves the harness for Phase 1?
| Option | Description | Selected |
|--------|-------------|----------|
| Smoke spec + DB-connect spec | Two focused specs mapping to SPEC reqs 2 and 5. | ✓ |
| Single combined spec | One file mixing both concerns. | |

**User's choice:** globalSetup + importable helpers; two proof specs (smoke + DB-connect).

---

## Local DB Provisioning

### How does a local dev get portofolio_test created?
| Option | Description | Selected |
|--------|-------------|----------|
| docker-compose init script | MySQL init SQL creates portofolio_test + grants app user. Auto for docker devs; mirrors CI. | ✓ |
| One-time documented manual step | Documented CREATE DATABASE command run once. | |
| npm setup script (db:test:setup) | Script with admin creds creates DB. Reintroduces elevated creds. | |

**User's choice:** docker-compose MySQL init script; documented one-time statement for non-docker devs.

---

## Env Wiring

### How to set ENV_FILE + NODE_ENV cross-platform?
| Option | Description | Selected |
|--------|-------------|----------|
| Set in vitest.config.js | Config sets process.env before module load. No new dep, cross-platform. | ✓ |
| Reuse dotenv-cli | Root dotenv-cli in test script; NODE_ENV inside test.env. | |
| Leave to planner | Record requirement, let planner pick. | |

**User's choice:** Set `ENV_FILE` + `NODE_ENV='test'` at the top of `vitest.config.js`.

---

## Claude's Discretion

- Vitest version pin — deferred to research/plan (per SPEC).
- Exact filenames within `backend/test/` and precise `vitest.config.js` structure.
- Exact form of the docker-compose init-script mount.
- Helper API surface beyond `resetTables()`/`createTestUser()`.

## Deferred Ideas

- Per-test-file DB reset (stronger isolation) — deferred to Phase 3 if integration tests require more than the per-run reset.
