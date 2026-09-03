---
title: "CR-02 — tokenless register enables account pre-hijacking (password bound before ownership is proven)"
created: 2026-09-03
source: .planning/phases/32-tokenless-registration/32-REVIEW.md (round 4, Critical)
severity: critical
status: pending
deferred_by: user decision 2026-09-03 (fix CR-01 now, defer CR-02)
---

## The defect

Phase 32's tokenless `register` persists an **anonymous caller's chosen password** against a **third party's email address**, and nothing downstream ever re-binds that credential to the person who actually proved ownership:

- `verifyEmail` only flips `emailVerified` (and, for the ADMIN_EMAIL bootstrap, role/status).
- `approveUser` only flips `status`.
- The verification email never states that a password was already set.

## Attack

1. Attacker calls `register` with `mesfin@family-domain.com`, their own password, and a plausible `relationshipNote`.
2. The real Mesfin receives a verification email and clicks it — the account is now `emailVerified: true`.
3. An admin sees the pending queue row, recognises **both the name and the address**, and approves it.
4. The attacker logs in as Mesfin.

The admin-approval gate — the phase's core defence — is defeated precisely because the attacker forged the one signal the admin decides on. The victim's own click is what activates the account.

## Why it is not covered by existing mitigations

- Rate limiting (SEC-02) limits volume, not the attack itself.
- Enumeration-silence (SEC-01/D-08) is unrelated — the attacker does not need to know whether the account exists.
- `32-CONTEXT.md` was checked: this trade-off was never raised or accepted. It is a genuine gap, not a decided cost.

## Candidate fixes (needs a design decision, not a patch)

1. **Do not accept a password at tokenless registration.** Create the account credential-less; have the verification link carry the registrant to a set-password form. Ownership is proven before a credential exists. Note this interacts with D-09 (bcrypt precomputed before the existence lookup for timing-safety) — that timing defence would need rework, since there would be no hash to compute on the tokenless path.
2. **Invalidate the pre-set password on verification** and force a reset, so the clicking party sets the credential.
3. **Show the admin that the account is self-registered and unproven**, and state in the verification email that a password was already chosen by whoever registered — so neither the victim nor the admin confirms unwittingly.

Related open item: registration squatting (WR-04) compounds this — squatting `ADMIN_EMAIL` permanently denies the zero-admin bootstrap.

## Next step

`/gsd:discuss-phase` this before implementing — option 1 likely changes `register`'s contract and would moot part of the current tokenless branch.
