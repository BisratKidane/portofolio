# Phase 9: Session Revocation via passwordChangedAt - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-20
**Phase:** 9-session-revocation-via-passwordchangedat
**Areas discussed:** Second-vs-ms precision, Schema migration strategy, Existing users on deploy, Fold in plaintext-token fix

---

## Second-vs-millisecond precision

| Option | Description | Selected |
|--------|-------------|----------|
| Second granularity, strict `<` | Floor passwordChangedAt to seconds; reject only when iat_seconds < passwordChangedAt_seconds. Same-second post-reset re-login stays valid. Accepted sub-1s survival window. Standard JWT approach. | ✓ |
| Add explicit 1s leeway | Same math framed as a deliberate 1s grace. Larger, documented survival window; more forgiving of clock skew but weaker revocation. | |

**User's choice:** Second granularity, strict `<`
**Notes:** Directly targets the roadmap's mandatory same-second boundary test. Root cause: `jwt.sign` iat is Unix seconds (floored) while passwordChangedAt is ms-precision Date — comparison must normalize to seconds or it self-invalidates fresh post-reset tokens.

---

## Schema migration strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Manual documented ALTER | Explicit ALTER TABLE + boot-and-verify step, matching roadmap manual-acceptance criterion. No new tooling. | ✓ |
| Adopt a migration tool now | sequelize-cli/umzug for versioned migrations across Phases 9 & 11. Heavier upfront. | |
| sync({ alter: true }) | Auto-alter. Least effort but risky — can reorder/rebuild tables; discouraged near prod data. | |

**User's choice:** Manual documented ALTER
**Notes:** sequelize.sync() never ALTERs existing tables, so CI (force-recreate) passes while a provisioned DB throws Unknown column — not test-catchable. Migration framework deferred to v2. Phase 11 repeats the pattern.

---

## Existing users on deploy

| Option | Description | Selected |
|--------|-------------|----------|
| NULL = no revocation point | Nullable column; getUserFromRequest treats NULL as nothing-to-revoke. Existing tokens valid to natural expiry. No forced logout. | ✓ |
| Backfill to now() on deploy | Populate all rows during migration. Cleaner invariant but logs out every active user at ship. | |

**User's choice:** NULL = no revocation point
**Notes:** Non-disruptive; revocation activates per-user on first reset.

---

## Fold in plaintext-token fix (WR-08)

| Option | Description | Selected |
|--------|-------------|----------|
| Fold into Phase 9 | Hash the token (store sha256, email raw, look up by hash) while resetPassword is open. Adds new requirement ID for traceability. | ✓ |
| Backlog as its own mini-phase | Keep Phase 9 tightly scoped; capture WR-08 separately. Reopens the resolver later. | |
| Defer to v2 | Log as accepted documented risk; revisit in v2. | |

**User's choice:** Fold into Phase 9
**Notes:** Registered as RESET-06 in REQUIREMENTS.md (list + traceability → Phase 9) to keep scope expansion honest. Spans both requestPasswordReset (store hash) and resetPassword (look up by hash); must preserve all Phase 8 properties.

## Claude's Discretion

- Column type/name detail, location of the seconds-flooring helper, hash column naming — planner/executor choices provided the locked behaviors hold.

## Deferred Ideas

- Real migration framework (sequelize-cli/umzug) — deferred to v2.
- Refresh-token rotation / server-side denylist / multi-device logout — out of scope per REQUIREMENTS.md line 76.
