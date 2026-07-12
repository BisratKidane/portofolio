---
phase: 07
slug: foundation-hardening-cors-jwt-fail-fast-password-strength
status: verified
threats_open: 0
asvs_level: 1
created: 2026-07-12
---

# Phase 07 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Browser (attacker-controlled `Origin` header) → Express `cors()` middleware | Untrusted request header crosses into server-side origin-allowlist logic | HTTP `Origin` header (untrusted) |
| `npm install` → `backend/package.json` devDependencies | Third-party supply-chain code entering the build/test toolchain | Package tarball + transitive deps |
| Deployment environment variables (`JWT_SECRET`) → backend boot sequence | A misconfigured/insecure production secret crosses into the token-signing trust boundary at startup | Signing secret (highly sensitive) |
| Client-submitted password (`register`/`resetPassword` args) → resolver → `bcrypt` hash | Untrusted user input crosses into the credential-storage boundary | Plaintext password (sensitive) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-07-01 | Information Disclosure | `corsOriginValidator` / `server.js` CORS callback | mitigate | Rejected origin logged only via `console.warn` server-side; callback returns fixed `Not allowed by CORS.` (D-02), no origin interpolation. HTTP regression `server.cors.test.js` asserts body+headers never contain the rejected origin. Old echo string absent (CORS-01). | closed |
| T-07-02 | Tampering | `server.js` `app` export / `app.listen()` guard | mitigate | `export { app }` decoupled; sole `app.listen()` gated behind `env.nodeEnv !== 'test'` — importing under Vitest binds no port and does not double-start Apollo. | closed |
| T-07-SC | Tampering (supply chain) | `backend/package.json` — `supertest` devDependency | mitigate | Blocking `checkpoint:human-verify` gate; human approved `supertest@^7.2.2` (MIT, maintainer `niftylettuce`, no peerDeps) before install. `package.json` pins exactly the approved version; no other new devDependency. | closed |
| T-07-03 | Spoofing | `assertProductionSecrets` / `env.js` boot sequence | mitigate | Refuses boot when `NODE_ENV=production` and `JWT_SECRET` is unset or `'change-me'` (SECRET-01); gated on the literal `nodeEnv === 'production'` allowlist-of-one (SECRET-02). Called at bottom of `env.js` after `env` is built. | closed |
| T-07-04 | Elevation of Privilege | `passwordPolicy.js` / `register` & `resetPassword` resolvers | mitigate | Rejects passwords under 8 chars server-side, before hashing/persistence, in both resolvers (PWD-01/PWD-02); exact D-01 message, zero-dependency validator, no inline duplicate. | closed |
| T-07-05 | Denial of Service (self-inflicted) | `assertProductionSecrets` scope | mitigate | Fail-fast never fires in test/development — literal `nodeEnv === 'production'` condition (never inverted per PITFALLS Pitfall 12); `env/test.env`'s `change-me-local-jwt-secret` ≠ literal `'change-me'`, so the guard is structurally unreachable under test/dev. Full 54-test suite green. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-07-01 | (07-REVIEW WR-01) | JWT-secret guard rejects only unset/`change-me`, not a `>=32`-char length floor. Out of scope for this phase's register (SECRET-01/02 only require rejecting the insecure default); tracked in `07-REVIEW.md` as a future hardening enhancement. | Security audit (agent) | 2026-07-12 |
| AR-07-02 | (07-REVIEW WR-02) | CORS rejection throws → Express returns HTTP 500 with a stack trace in dev/test (no error handler registered). Functional origin-leak prevention is already proven closed by T-07-01; the status-code/stack concern is a non-production hardening item tracked in `07-REVIEW.md`. | Security audit (agent) | 2026-07-12 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-12 | 6 | 6 | 0 | gsd-security-auditor (verify-mode) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-12
