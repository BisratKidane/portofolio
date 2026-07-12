# Deferred Items — Phase 07

Out-of-scope discoveries logged during execution, not fixed per the executor's scope boundary rule (only issues directly caused by the current task's changes are auto-fixed).

## 07-01: Pre-existing frontend test failures (unrelated to this plan)

- **Found during:** Task 3 full-suite verification (`npm test` at repo root)
- **Scope:** `frontend/src/pages/Login.test.jsx`, `frontend/src/pages/Register.test.jsx`, and 2 other frontend test files (4 files, 10 tests failing)
- **Symptom:** `Error: Invalid Chai property: toHaveTextContent` — jest-dom matchers (`toHaveTextContent`) are not registered with Vitest's `expect`, suggesting a missing/misconfigured `@testing-library/jest-dom` matcher extension in the frontend Vitest setup.
- **Why deferred:** This plan (07-01) touches only `backend/**` files (`server.js`, `test/helpers.js`, `config/corsOptions.js`, `package.json`). No frontend files were modified in this plan (`git diff --name-only` confirms zero frontend changes). The failure is pre-existing and out of this plan's scope per the SCOPE BOUNDARY rule.
- **Backend suite status:** Unaffected — `npm test --workspace backend` passes 44/44 (39 pre-existing + 5 new CORS tests).
- **Recommendation:** Flag to the orchestrator/user for a separate fix — likely a missing `import '@testing-library/jest-dom/vitest'` (or equivalent) in `frontend/test/setup.js`, or a `@testing-library/jest-dom` version mismatch with Vitest 4.x's `expect`.
