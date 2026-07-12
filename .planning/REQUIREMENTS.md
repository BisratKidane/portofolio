# Requirements: Portfolio Auth App — Testing Foundation

**Defined:** 2026-07-11
**Core Value:** Changes can be made with confidence — auth and core flows are protected by an automated test suite that fails loudly (locally and in CI) before broken code ships.

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Test Tooling

- [x] **SETUP-01**: Backend has a configured test runner; running `npm test` in the backend workspace executes the suite and reports pass/fail
- [x] **SETUP-02**: Frontend has a configured test runner with jsdom + React Testing Library; running `npm test` in the frontend workspace executes the suite
- [ ] **SETUP-03**: A single root-level command runs both workspace test suites
- [x] **SETUP-04**: Backend integration tests run against an isolated test database (never dev data), set up and torn down per run

### Backend Tests

- [x] **BE-01**: Auth token utilities are unit-tested — signing produces a verifiable JWT; verification accepts a valid token and rejects tampered/expired ones
- [x] **BE-02**: Password handling is unit-tested — passwords are hashed on user creation and `validatePassword` accepts the correct password and rejects an incorrect one
- [x] **BE-03**: Role/authorization guards in `auth.js` are unit-tested (allows permitted roles, blocks others)
- [x] **BE-04**: The `register` mutation is integration-tested — creates a user, rejects a duplicate email, and rejects invalid input
- [x] **BE-05**: The `login` mutation is integration-tested — returns a JWT for valid credentials and rejects invalid credentials
- [x] **BE-06**: The protected dashboard/me query is integration-tested — returns data for an authenticated request and rejects an unauthenticated one
- [x] **BE-07**: The `requestPasswordReset` flow is integration-tested, documenting its current behavior

### Frontend Tests

- [ ] **FE-01**: AuthContext is tested — it stores and exposes the token + user, and clears them on logout
- [ ] **FE-02**: ProtectedRoute is tested — it redirects unauthenticated users and renders children for authenticated users
- [ ] **FE-03**: The Login page is tested — it submits credentials and handles both success and error states
- [ ] **FE-04**: The Register page is tested — it submits input and handles both success and error states

### Continuous Integration

- [ ] **CI-01**: A GitHub Actions workflow runs the full test suite on every push and pull request
- [ ] **CI-02**: CI provisions the test-database dependency so backend integration tests pass in the pipeline
- [ ] **CI-03**: CI fails the build (blocks merge) when any test fails

### Known-Issue Documentation

- [x] **DOCS-01**: Security bugs surfaced while writing tests are recorded as tracked known-issues (location + expected vs. actual behavior), not fixed in this milestone

## v2 Requirements

Deferred to a future milestone. Tracked but not in this roadmap.

### Quality

- **QUAL-01**: Coverage reporting and enforced coverage thresholds
- **QUAL-02**: Linter + formatter (ESLint/Prettier) configuration and CI gate

### Testing

- **E2E-01**: Full browser end-to-end tests (Playwright/Cypress) covering register → login → protected route

### Remediation

- **FIX-01**: Fix the documented security bugs (reset-token leak, insecure JWT-secret fallback, missing rate limiting) with tests asserting corrected behavior

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Fixing known security bugs | Deliberately deferred to a dedicated remediation milestone (see FIX-01); this milestone documents, not remediates |
| 100% / exhaustive coverage | Goal is a meaningful safety net over auth + core flows, not a coverage-number chase |
| Browser E2E tests | Backend integration + frontend component tests meet the safety-net need at lower cost (see E2E-01) |
| New product features / UI redesign | This milestone is testing infrastructure only |
| Migrating off `sequelize.sync()` / Node 18 upgrade | Runtime/infra changes are out of scope for a testing milestone |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SETUP-01 | Phase 1 | Complete |
| SETUP-02 | Phase 4 | Complete |
| SETUP-03 | Phase 6 | Pending |
| SETUP-04 | Phase 1 | Complete |
| BE-01 | Phase 2 | Complete |
| BE-02 | Phase 2 | Complete |
| BE-03 | Phase 2 | Complete |
| BE-04 | Phase 3 | Complete |
| BE-05 | Phase 3 | Complete |
| BE-06 | Phase 3 | Complete |
| BE-07 | Phase 3 | Complete |
| FE-01 | Phase 5 | Pending |
| FE-02 | Phase 5 | Pending |
| FE-03 | Phase 5 | Pending |
| FE-04 | Phase 5 | Pending |
| CI-01 | Phase 6 | Pending |
| CI-02 | Phase 6 | Pending |
| CI-03 | Phase 6 | Pending |
| DOCS-01 | Phase 3 | Complete |

**Coverage:**
- v1 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0 ✓

---
*Requirements defined: 2026-07-11*
*Last updated: 2026-07-11 after roadmap creation (6 phases, 19/19 requirements mapped)*
