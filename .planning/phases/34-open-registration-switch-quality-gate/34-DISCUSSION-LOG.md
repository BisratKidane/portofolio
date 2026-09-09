# Phase 34: Open-Registration Switch & Quality Gate - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-08
**Phase:** 34-open-registration-switch-quality-gate
**Mode:** default (interactive)
**Areas discussed:** Where the switch lives, Where the admin flips it, How /register learns, Adversarial test shape

---

## Todo cross-reference

**CR-02 — account pre-hijacking** matched at 0.6 (`keywords: tokenless, register, account, password, before`). Surfaced a second time (Phase 33 folded it), because Phase 34 is the milestone's quality gate and the vulnerability is now live behind a public form.

| Option | Description | Selected |
|--------|-------------|----------|
| Keep it accepted | Phase 33's D-01 stands; todo stays open and annotated; phase stays scoped to ADMIN-01..03 + SEC-04..05 | ✓ |
| Fold in as a decision | Reopen and discuss whether the switch changes the calculus enough to fix it now | |
| Note it in the gate | Don't fix, but pin the current vulnerable behaviour with a test so it can't regress silently | |

**User's choice:** Keep it accepted → recorded in CONTEXT.md Reviewed Todos, not folded.

---

## Gray area selection

**Presented:** Where the switch lives / Where the admin flips it / How /register learns / Adversarial test shape
**Selected:** all four

---

## Area: Where the switch lives

### Q1 — Storage shape

| Option | Description | Selected |
|--------|-------------|----------|
| `app_settings` key/value (recommended) | Migration 021, generic table; future flags are rows not migrations; cost is string values needing a typed accessor | ✓ |
| Dedicated typed table | Single-row `app_config` with `openRegistrationEnabled BOOLEAN`; self-documenting, DB-enforced type; a migration per future flag | |
| In-memory singleton | No migration; a restart silently reopens the door and replicas would disagree | |

**Notes:** Established during this question that **no settings infrastructure exists anywhere** — `backend/src/models/` holds only User, Invitation, FamilyMember, Spouse, AuditLog, and greps for any flag/setting pattern across `backend/src` and `frontend/src` return nothing. Whatever holds this flag is genuinely new code. Also established that Phase 32 D-03's ban on `PUBLIC_REGISTRATION_ENABLED` targets *env vars specifically* (they need a redeploy, which ADMIN-01 forbids) and does not conflict with a DB-backed in-app switch. → D-01

### Q2 — Behaviour on absent row / failed read, and the seeded value

| Option | Description | Selected |
|--------|-------------|----------|
| Fail closed, seed open (recommended) | Seeds enabled so prod is unchanged; absent row or read error → invitation-only | ✓ |
| Fail open, seed open | Any uncertainty resolves to enabled; never locks out legitimate signups, but a dropped row silently undoes an admin's "off" | |
| Fail closed, seed closed | v4.1 deploys shut; safest, but changes production behaviour on deploy | |

**Notes:** Argued from CR-02 being live behind the form — the unexpected state should be the safe one. → D-02

### Q3 — Audit trail for a flip

| Option | Description | Selected |
|--------|-------------|----------|
| Audit row per flip (recommended) | AuditLog entry per change: actor, old → new, timestamp; full history | ✓ |
| Row columns only | `updatedById`/`updatedAt` only — enough for ADMIN-03, but history is overwritten | |
| Both | Audit row for history plus row columns for a cheap page-load read | |

**Notes:** Chose history over the denormalized convenience. This later created a tension with D-06 (which needs "last changed by" rendered cheaply) — recorded in CONTEXT.md as **F-01** for the planner rather than silently resolved here. → D-03

**Check:** "More questions / Next area" → **Next area**

---

## Area: Where the admin flips it

### Q4 — Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Top of `/invitations` (recommended) | Third region in the existing 26-line admin console stack; no new route, nav entry, or page | ✓ |
| New `/settings` page | Dedicated ADMIN-only route + nav entry; room to grow, but a page holding one control | |
| Dashboard admin panel | Highest visibility, seen every login; but mixes an admin control into the page every user sees | |

**Notes:** `/invitations` already merges InvitePage + ApprovalsPage behind `allowedRoles={['ADMIN']}`, with `/invite` and `/approvals` redirecting into it. The approval queue sitting directly below the switch is the visible consequence of leaving the door open. → D-04

### Q5 — Friction on flipping

| Option | Description | Selected |
|--------|-------------|----------|
| Instant close, confirm open (recommended) | Asymmetric, derived from ADMIN-01's own "stopped in seconds" wording; opening is the risky direction | ✓ |
| Instant both ways | Simplest to build and test; an accidental open is silent | |
| Confirm both ways | Consistent, matches the reject dialog; but puts a modal in front of an emergency shutdown | |

**Notes:** The asymmetry is deliberate and requirement-derived — CONTEXT.md instructs the planner not to "simplify" it to symmetric behaviour. → D-05

### Q6 — What the control displays

| Option | Description | Selected |
|--------|-------------|----------|
| State + last change (recommended) | "Public signup is OPEN — opened by Bisrat on 8 Sep"; satisfies ADMIN-03 and surfaces the audit trail | ✓ |
| State only | Exactly what ADMIN-03 asks, nothing more; no extra query or name resolution | |
| State + consequence | Adds a plain-language line on what the setting means in practice | |

**Notes:** → D-06

**Check:** "More questions / Next area" → **Next area**

---

## Area: How /register learns

### Q7 — How an anonymous visitor discovers the state

| Option | Description | Selected |
|--------|-------------|----------|
| Public query + submit fallback (recommended) | `publicRegistrationEnabled: Boolean!` drives the render, plus graceful handling if a submit is refused anyway | ✓ |
| Public query only | Simpler; but a door closed mid-form leaves loaded pages showing a generic error | |
| Submit-and-refuse only | Nothing new in the schema; but makes people fill a form that was never going to work | |

**Notes:** **Flagged at ask time and carried into CONTEXT.md as a hard constraint.** The client query and the server check are an outer and an inner guard on the same predicate — the exact bug class that has hit this project across Phases 14, 15, 30, 31, 32 and 33, most recently inside the agreement test built to prevent it. Both sides must read the same stored value through the same accessor. → D-07

### Q8 — Does the switch also gate the invited path?

| Option | Description | Selected |
|--------|-------------|----------|
| Tokenless only (recommended) | A valid invitation token still registers while the door is closed; literal reading of ADMIN-01/02 | ✓ |
| All registration | One predicate, one answer; but silently voids invitations already issued | |
| Tokenless now, invited later | Same behaviour today, records a future control | |

**Notes:** The "freeze invitations too" idea was captured as a deferred idea rather than folded. → D-08

### Q9 — What a refused tokenless register does

| Option | Description | Selected |
|--------|-------------|----------|
| Refuse first, say so plainly (recommended) | Checked before email lookup, bcrypt, and any DB write; no timing signal, no owner-notification email | ✓ |
| Uniform success message | Maximum silence, but lies to legitimate visitors and the public query reveals the state anyway | |
| Validate first, then refuse | Better feedback in one round trip; but does work for a request that was always going to fail | |

**Notes:** Established that revealing the door's state is **not** an enumeration oracle — SEC-01/Phase 32 D-08 concern whether a given *email* has an account, and the public query discloses the door state by design. The real constraint is ordering: the switch check must run ahead of the uniform-response machinery, not behind it. Recorded in CONTEXT.md so the planner does not get this backwards. → D-09

**Not asked — recorded directly as D-10:** accounts already in the approval queue when the door closes stay there and remain approvable. Obvious, and exactly the kind of obvious that produces a bug.

---

## Area: Adversarial test shape

### Q10 — Where the proof lives

| Option | Description | Selected |
|--------|-------------|----------|
| One matrix file, additive (recommended) | New `security.boundaries.test.js` readable top to bottom as the milestone's proof; existing per-resolver cases untouched | ✓ |
| Per-resolver only | Matches current convention; but no single place proves the milestone | |
| Matrix replacing scattered cases | One authoritative location; but edits passing tests and detaches them from their resolvers | |

**Notes:** → D-11

### Q11 — How hard SEC-05 pushes on "any authenticated surface"

| Option | Description | Selected |
|--------|-------------|----------|
| Schema-driven sweep (recommended) | Enumerate every Query/Mutation field from the SDL; explicit allowlist for public ones; a future unguarded resolver fails on day one | ✓ |
| Representative sample | Five resolvers across domains; readable, but proves those five, not "any" | |
| Chokepoint test | Tests `getUserFromRequest` directly; smallest, but never checks that every resolver goes through it | |

**Notes:** Established during this area that the gate **already exists** — `auth.js:33` returns `null` for any non-Active user and `accountStatus.test.js:49` covers it. SEC-05's contribution is proving the consequence holds across the whole surface and keeps holding. The allowlist is the point: a field is authenticated unless someone deliberately writes it down. → D-12

### Q12 — Mutation-testing the new guards

| Option | Description | Selected |
|--------|-------------|----------|
| Mutation-test every guard (recommended) | Remove/weaken each guard, confirm the test goes red, restore; recorded as a plan step with its result | ✓ |
| TDD red-green only | The project's existing practice; but CR-01 and its Phase 33 repeat were both TDD'd, green, and wrong | |
| Only the switch guard | Focus on the known-dangerous shape, ordinary TDD elsewhere | |

**Notes:** → D-13

### Q13 — Quality-gate scope

| Option | Description | Selected |
|--------|-------------|----------|
| SC-5 as written (recommended) | ADMIN-01..03 + SEC-04..05 + `npm test --workspaces` green; open debt stays separate | ✓ |
| Absorb the open debt | Also close Phase 33's UAT items, re-verify SEC-01, fix advisory warnings | |
| Add the index only | SC-5 plus the missing `users(role, status, emailVerified)` index | |

**Notes:** → D-14. The open debt is recorded in CONTEXT.md's Deferred Ideas so it is not lost before the milestone close.

---

## Claude's Discretion

- Setting key name, migration slug, and whether the typed accessor caches.
- The flip mutation's name, signature, and return shape.
- Visual composition of the admin control (`/gsd:ui-phase 34` produces the contract — ROADMAP marks this phase UI hint: yes).
- All copy: confirmation dialog, OPEN/CLOSED state line, server refusal message, `/register` invitation-only message.
- Whether `publicRegistrationEnabled` is rate-limited.
- Whether the switch state is ever surfaced to non-admins (default: no).
- Test-file placement for the switch's own coverage; whether the sweep's allowlist is itself pinned against an expected literal set.

## Deferred Ideas

- A second switch to freeze outstanding invitations — new capability, own phase.
- Absorbing the milestone's open debt (Phase 33's two visual UAT items, `/gsd:verify-work 32`, the missing `users(role, status, emailVerified)` index) — considered and rejected as this phase's work; runs as separate closing steps.

## Scope creep

None acted on. Two ideas were raised and deferred rather than folded (the invitation freeze, the open-debt absorption), and CR-02 was reviewed a second time and consciously left accepted.

---

*Phase: 34-open-registration-switch-quality-gate*
