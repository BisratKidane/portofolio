---
phase: 21
slug: shared-display-helper
status: verified
threats_open: 0
asvs_level: 1
created: 2026-07-30
---

# Phase 21 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| None new | This phase adds a pure function (`getGeezDisplay`) operating on data already fetched and already authorized by earlier phases (Phase 14 permission-scoped resolvers, Phase 19 GraphQL layer). No new network call, no new input-parsing boundary, no persistence, no auth/session logic. | Reads one already-authorized in-memory string field (`member.geezFullname`); returns a plain object or `null`. |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| — | — | `getGeezDisplay` pure helper | accept | No applicable STRIDE threat. The helper reads one already-fetched/authorized string and returns a plain in-memory value or `null` — no new input handling, network, database, DOM/injection surface, or dependency. Verified at audit: `frontend/package.json`/`package-lock.json` byte-identical to the phase base (`ace797c`) → **zero new packages**, so no supply-chain (`T-SC`) checkpoint applies. | closed |

*Status: open · closed*

**Forward note (not a threat in this phase):** the `text` value this helper returns is rendered by React consumers starting in Phase 22; React auto-escapes text-node content by default. This phase introduces no `dangerouslySetInnerHTML` and no raw-HTML path — the returned string is a plain data value with no rendering behavior attached. Phase 22's threat model should confirm consumers render it as a text node (which they do by default).

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|

No accepted risks — no applicable threats exist for a pure, dependency-free, side-effect-free function.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-30 | 0 | 0 | 0 | /gsd:secure-phase (orchestrator direct verification) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer) — no threats apply
- [x] Accepted risks documented in Accepted Risks Log (none)
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-30
