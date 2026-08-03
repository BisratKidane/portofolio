---
phase: 20
slug: self-hosted-font-theme
status: verified
threats_open: 0
asvs_level: 1
created: 2026-07-30
---

# Phase 20 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Developer machine → npm registry | A new third-party npm package (`@fontsource/noto-sans-ethiopic`) is pulled from the public registry and bundled into the frontend build output. This is the ONLY trust boundary this phase crosses. | Static font asset (woff2/woff) + package metadata. No user data. |

No runtime request-handling boundary is added this phase: no new endpoint, no new user-input path, no auth/session code, no privilege boundary. Spoofing, Repudiation, Denial of Service, and Elevation of Privilege do not apply (no identity, no audit surface, no request handling, no privilege boundary touched). Tampering and Information Disclosure are assessed only at the supply-chain boundary below.

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-20-SC | Tampering | `@fontsource/noto-sans-ethiopic` npm install (frontend workspace) | mitigate | Version pinned `^5.3.0`; installed **5.3.0** via a real `npm install --workspace frontend` (not hand-edited lockfile, not `slopcheck install`). Verified at audit: license **OFL-1.1**, **zero** install-time scripts (`scripts: {}` — no pre/post/install hooks execute on install), **zero** runtime dependencies, resolved from `registry.npmjs.org` with a sha512 integrity hash in `package-lock.json`. Diff landed only in `frontend/package.json` + shared lockfile; repo-root `package.json` confirmed byte-for-byte unchanged (`git diff --stat` empty vs base `ff46145`). Legitimacy pre-vetted in `20-RESEARCH.md` Package Legitimacy Audit (official `fontsource/font-files` GitHub org, live `npm view` + tarball inspection). | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|

No accepted risks — the single plan-time threat is verified CLOSED via implemented mitigation.

**Scope note (not an accepted risk):** The pre-existing Inter/Sora Google Fonts CDN `<link>` in `frontend/index.html` is intentionally out of scope for this phase (D-01/D-02, REQUIREMENTS.md) and was left untouched. It is not a Phase 20 threat — it predates this phase and carries no new exposure introduced here.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-30 | 1 | 1 | 0 | /gsd:secure-phase (orchestrator direct verification) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log (none — T-20-SC closed by mitigation)
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-30
