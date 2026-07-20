# Phase 11: Email Verification & ADMIN Race Fix - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-20
**Phase:** 11-email-verification-admin-race-fix
**Areas discussed:** ADMIN race fix, Verification gate, Existing-user migration, resend + token storage

---

## ADMIN race fix (VERIFY-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Atomic conditional UPDATE | Set role=ADMIN only if no verified ADMIN exists yet, guarded at the DB layer (mirrors resetPassword's atomic update). Race-safe. | ✓ |
| App-level count check | Count verified admins in app code, set ADMIN if zero. Read-then-write race window. | |
| Env-seeded ADMIN only | Drop "first verified wins"; ADMIN = ADMIN_EMAIL match. Deterministic but changes product behavior. | |

**User's choice:** Atomic conditional UPDATE
**Notes:** Assigned at verifyEmail time; "first verified" replaces "first registrant".

---

## Verification gate (VERIFY-05 / SC-3)

| Option | Description | Selected |
|--------|-------------|----------|
| Both: login + central requireAuth | login rejects unverified after password check AND central auth path rejects unverified sessions at protected resolvers (defense-in-depth). | ✓ |
| login-only | Only the login resolver rejects; leans on "no token ever issued to unverified". | |

**User's choice:** Both: login + central requireAuth
**Notes:** Reuses the Phase 9 central-check pattern in auth.js.

---

## Existing-user migration

| Option | Description | Selected |
|--------|-------------|----------|
| Grandfather to verified (all) | Backfill all existing rows to emailVerified=true; only new registrations verify. | |
| No backfill — all re-verify | Existing rows stay false; everyone re-verifies. Cleanest invariant but risks locking out the sole admin. | ✓ (initial) |
| — resolved via follow-up → | See "ADMIN anchor" below. Final: grandfather the ADMIN row only. | ✓ (final) |

**User's choice:** Initially "No backfill — all re-verify", then refined (see next section) to **grandfather the ADMIN row only**.
**Notes:** The no-backfill choice interacts with "first verified wins ADMIN": on deploy it un-verifies the current admin and reopens the single ADMIN slot to any new registrant. Surfaced as a footgun.

---

## ADMIN anchor (follow-up on the migration/race interaction)

**User's clarifying question:** "does this assume that there is only one admin?"
**Answer given:** Yes — the app is a single-bootstrap-ADMIN model (register: `userCount === 0 ? 'ADMIN' : 'USER'`, no in-app promotion). VERIFY-04 keeps one ADMIN slot and only changes who/when fills it.

| Option | Description | Selected |
|--------|-------------|----------|
| ADMIN_EMAIL pins it + first-verified fallback | Env ADMIN_EMAIL owns the slot if set; else atomic first-verified. | |
| Pure first-verified (accept race) | Slot goes to whoever verifies first after deploy; must re-verify fast to reclaim. | |
| Grandfather the admin row only | Backfill ONLY the existing ADMIN row to verified; all others re-verify. | ✓ |

**User's choice:** Grandfather the admin row only
**Notes:** Keeps the single bootstrap admin's role + session across deploy without a broad backfill; atomic first-verified still governs a fresh install. VERIFY-F1 (env ADMIN_EMAIL) stays deferred.

---

## resend + token storage (VERIFY-07)

| Option | Description | Selected |
|--------|-------------|----------|
| Generic + hash-at-rest (mirror reset) | Generic anti-enumeration response + timing floor; store sha256(token), email raw. | ✓ |
| Generic message, token stored raw | Generic response but plaintext token at rest (diverges from Phase 9 precedent). | |
| Reveal state, hash-at-rest | Tell caller "already verified"/"no account" (better UX) but reintroduces enumeration oracle. | |

**User's choice:** Generic + hash-at-rest (mirror reset)
**Notes:** Consistent with Phase 8 anti-enumeration + Phase 9 hashed-token-at-rest.

## Claude's Discretion

- Exact column types/names and token-helper reuse vs. new analogues.
- Exact resendVerificationEmail rate-limit number (recommended 5/hour).
- One combined UPDATE/txn vs. two steps for emailVerified flip + ADMIN assignment (atomicity must hold).
- Register message-only payload shape (new vs. reused message type).
- Email/page/register copy.
- Test structure.

## Deferred Ideas

- VERIFY-F1 env-seeded ADMIN_EMAIL (belt-and-suspenders).
- Live SMTP provider account (deployment concern).
- Sequelize migration tooling (infra-hardening milestone).
