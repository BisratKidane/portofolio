# Phase 2: Backend Unit Tests - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-12
**Phase:** 2-Backend Unit Tests
**Areas discussed:** DB vs pure isolation, getUserFromRequest scope, Reset-token utils scope, Negative-case construction

---

## DB vs pure isolation (password tests, BE-02)

| Option | Description | Selected |
|--------|-------------|----------|
| In-memory (no DB) | `User.build()` + run hook/bcrypt directly; no DB connection, no harness dependency | |
| Real test-DB harness | `createTestUser()`/`User.create()` so the actual `beforeCreate` hook fires end-to-end | |
| You decide | Let planner/researcher pick the boundary | ✓ |

**User's choice:** You decide
**Notes:** Claude flagged the Sequelize 6 subtlety — `beforeCreate` fires on `save()`/`create()`, not on `build()`. Recorded preference: pure in-memory where the function is pure; for the "hashed on create" assertion use the lightest path that still runs the real hook (invoke hook directly if practical, else the harness). Captured as D-05 + Claude's Discretion.

---

## getUserFromRequest scope (verify path, BE-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Stub models in getUserFromRequest | Unit-test the exported function with a fake `req` + stubbed `models.User`; covers header parse, verify, null degradation; no DB | ✓ |
| Test jwt round-trip only | Only assert sign→verify at the jwt level; defer getUserFromRequest to Phase 3 integration | |
| Both | jwt round-trip AND stubbed getUserFromRequest test | |

**User's choice:** Stub models in getUserFromRequest
**Notes:** Naturally covers the `signToken`→verify round-trip and the silent `null` degradation on bad/absent tokens. Captured as D-01, D-02.

---

## Reset-token utils scope

| Option | Description | Selected |
|--------|-------------|----------|
| Include them | Add cheap unit tests for `createResetToken` (64-char hex, unique) and `resetTokenExpiry` (future Date ~N min) | ✓ |
| Leave for Phase 3 | Keep Phase 2 strictly to BE-01/02/03; cover reset utils with the Phase 3 flow | |

**User's choice:** Include them
**Notes:** Same file as the auth utilities, near-zero cost. The `requestPasswordReset` flow and its known token-exposure bug stay Phase 3. Captured as D-07.

---

## Negative-case construction (BE-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Real expiry + wrong-secret/mutate | Expired via `expiresIn:'-1s'`; tampered via mutated segment or wrong secret; no timers | ✓ |
| Vitest fake timers | `vi.useFakeTimers()` to advance past expiry | |
| You decide | Planner picks per-case | |

**User's choice:** Real expiry + wrong-secret/mutate
**Notes:** Fully deterministic, no fake-timer setup/teardown. Captured as D-03.

---

## Claude's Discretion

- DB boundary for the "hashed on create" assertion (D-05) — user delegated. Default to invoking the hashing hook without a live DB if Sequelize 6 allows it cleanly; else fall back to `createTestUser`/`User.create()` for that one assertion.
- Exact spec filenames and `describe`/`it` structure (co-located `src/**/*.test.js`).
- Stub/mock mechanism for `models.User` (`vi.fn()` vs hand-rolled stub).
- Whether guard tests assert exact error messages or only that they throw.

## Deferred Ideas

None — discussion stayed within phase scope. (`requestPasswordReset` resolver flow + known reset-token exposure bug → Phase 3 / DOCS-01; `getUserFromRequest`'s real DB lookup path → Phase 3 integration.)
