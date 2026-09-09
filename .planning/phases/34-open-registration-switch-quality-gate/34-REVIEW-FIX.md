---
phase: 34-open-registration-switch-quality-gate
fixed_at: 2026-09-09T15:37:24Z
review_path: .planning/phases/34-open-registration-switch-quality-gate/34-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 34: Code Review Fix Report

**Fixed at:** 2026-09-09T15:37:24Z
**Source review:** .planning/phases/34-open-registration-switch-quality-gate/34-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope (critical + warning): 3
- Fixed: 3
- Skipped: 0

Fix scope was `critical_warning` (CR-01, WR-01, WR-02). The five Info findings (IN-01..IN-05) are out of scope for this run and untouched.

## Fixed Issues

### CR-01: `setPublicRegistrationEnabled` reads the "from" value outside the transaction with no lock

**Files modified:** `backend/src/utils/appSettings.js`, `backend/src/resolvers/setting.resolver.js`, `backend/src/resolvers/publicRegistrationSwitch.test.js`
**Commit:** `e09347f` — `fix(34): CR-01 lock the audit "from" read inside the flip transaction`

**Applied fix:** Threaded an `options` passthrough (`{ transaction, lock }`) through `getPublicRegistrationSettingRow(models, options)` and `isPublicRegistrationEnabled(models, options)` rather than adding a second `findByPk` call site (preserves D-07 Layer 1's single predicate). `isPublicRegistrationEnabled` now rethrows a read failure when `options.transaction` is set (instead of swallowing to `false`), so a transient DB error rolls back the flip rather than recording a fabricated audit `from`; untransacted callers (`Query.publicRegistrationEnabled`, `register`) keep the original D-02 fail-closed swallow verbatim. The flip mutation in `setting.resolver.js` now reads `previous` via `isPublicRegistrationEnabled(models, { transaction: t, lock: t.LOCK.UPDATE })`, so the read joins the transaction under a row lock — serialising concurrent flips and using exactly one pooled connection per flip (eliminating the pool-starvation mode as a structural side effect). Rewrote the stale comment at the old lines 53-56 that claimed the unlocked read was intentional. Documented the row-less-DB deadlock edge case (two concurrent `FOR UPDATE`s on an absent PK take a gap lock; the second `upsert` throws `ER_LOCK_DEADLOCK` rather than corrupting anything) as a comment, per the review's explicit instruction not to engineer around it.

**TDD evidence (red -> green):**

RED — added `it('two CONCURRENT flips to the same value chain their audit history rather than both recording the pre-flip value (CR-01 regression, 34-REVIEW.md)', ...)` to the D-03 audit describe block in `publicRegistrationSwitch.test.js`, fired two concurrent `SET_PUBLIC_REGISTRATION` flips (both `{ enabled: false }`) against a seeded-`true` row, and asserted `rows[1].from === rows[0].to`. Run against the unmodified source:

```
FAIL  src/resolvers/publicRegistrationSwitch.test.js > settings layer (ADMIN-01 / ADMIN-03 / D-03) > flip behaviour > two CONCURRENT flips to the same value chain their audit history rather than both recording the pre-flip value (CR-01 regression, 34-REVIEW.md)
AssertionError: expected { …(3) } to match object { from: false, to: false }
  {
-   "from": false,
+   "from": true,
    "to": false,
  }
```
This reproduces the review's own finding: both concurrent flips observed the same pre-flip value (`true`) instead of the second flip observing the first flip's committed write.

GREEN — after the fix, the same test file: `Test Files 1 passed (1)`, `Tests 27 passed (27)`. Also re-ran `backend/src/utils/appSettings.test.js` (13/13 passed) to confirm the untransacted D-02 fail-closed swallow behavior is unchanged for `Query.publicRegistrationEnabled`/`register`.

### WR-01: `buildPublicRegistrationSettingPayload` composes `enabled` and attribution from two separate, unlocked reads

**Files modified:** `backend/src/resolvers/setting.resolver.js`
**Commit:** `98a8143` — `fix(34): WR-01 read enabled and attribution under one transaction snapshot`

**Applied fix:** `buildPublicRegistrationSettingPayload` now wraps both reads (and the actor `findByPk`) in `sequelize.transaction(async (t) => { ... })`, passing `{ transaction: t }` to `isPublicRegistrationEnabled`, `getPublicRegistrationSettingRow`, and `models.User.findByPk`. MySQL's REPEATABLE READ isolation gives every statement in the transaction the same snapshot, so a flip committed mid-read can no longer pair one state's `enabled` with the other state's attribution. No lock is needed on this read-only path.

**Verification (no new deterministic test, per review's own guidance):** 34-REVIEW.md explicitly says this race is hard to reproduce deterministically (unlike CR-01, there is no lock to force a specific interleaving) and that re-running the existing D-06 attribution-variant tests is sufficient evidence. Ran `publicRegistrationSwitch.test.js` after the change: `Tests 27 passed (27)`, including all three D-06 attribution variants (never-changed / named-actor / unknown-actor) and the absent-row case. Per the verification_strategy's logic-bug caveat, this fix does not introduce a new assertable state, but a human should still sanity-check that wrapping these three reads in one transaction (as opposed to, e.g., the flip mutation building its own payload from its already-open transaction) is the intended long-term shape before this is considered fully closed — the review offered both as equally acceptable.

### WR-02: Confirmation dialog's "Keep it closed" / backdrop / Escape remain active while the open-flip is in flight

**Files modified:** `frontend/src/components/PublicSignupSwitch.jsx`, `frontend/src/components/PublicSignupSwitch.test.jsx`
**Commit:** `23383c3` — `fix(34): WR-02 make "Keep it closed" and Escape inert while the open-flip is in flight`

**Applied fix:** `<Dialog>`'s `onClose` is now `busy ? undefined : () => setConfirmOpen(false)` (backdrop click and Escape become no-ops while busy — MUI's Modal only invokes `onClose` when it is defined), plus an explicit `disableEscapeKeyDown={busy}` as a second, independent guard on the same condition. The "Keep it closed" `Button` now has `disabled={busy}` (it previously had no `disabled` prop at all). The confirm button was already disabled while busy. Added a one-line comment above the button explaining why, matching the codebase's rationale-comment convention.

**TDD evidence (red -> green):**

RED — added `it('disables "Keep it closed" and ignores Escape while the open-flip is in flight, and fires only one request (WR-02, 34-REVIEW.md)', ...)` (plus a `neverResolveFlip` fixture flag in the shared `graphqlRequest` mock dispatcher) to `PublicSignupSwitch.test.jsx`. It clicks "Open signup" against a mutation that never resolves, then asserts "Keep it closed" is disabled. Run against the unmodified source:

```
FAIL  src/components/PublicSignupSwitch.test.jsx > PublicSignupSwitch > disables "Keep it closed" and ignores Escape while the open-flip is in flight, and fires only one request (WR-02, 34-REVIEW.md)
Error: expect(element).toBeDisabled()
Received element is not disabled:
  <button class="MuiButtonBase-root MuiButton-root MuiButton-text ..." tabindex="0" type="button" />
```

GREEN — after the fix: `Test Files 1 passed (1)`, `Tests 9 passed (9)`. The test also asserts (post-fix) that a `fireEvent.click` on the now-disabled "Keep it closed" button does not close the dialog, that `user.keyboard('{Escape}')` does not close the dialog, and that exactly one `setPublicRegistrationEnabled` request was ever sent.

*Test-technique note:* the first GREEN attempt still failed, but on a test-harness issue rather than the fix — `@testing-library/user-event@14`'s `user.click()` refuses to interact with any element that resolves to `pointer-events: none` (which `disabled` triggers via MUI's styles), throwing before the click semantics could even be exercised. Switched that specific interaction to `fireEvent.click` (which faithfully reproduces "a disabled button's onClick never fires" without the pre-click guard); confirmed via a standalone probe that `fireEvent.click` on a plain `disabled` React button does not invoke its `onClick` handler, so this substitution proves the same thing a real user's click would prove. This was a test-file correction, not a source-code rollback — the production fix in `PublicSignupSwitch.jsx` was correct on the first attempt.

## Skipped Issues

None — all three in-scope findings (CR-01, WR-01, WR-02) were fixed.

---

_Fixed: 2026-09-09T15:37:24Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

## Orchestrator Addendum

- `09d0bdc` — `test(34): CR-01 pin that a failed in-transaction read rolls the flip back with no audit row`. The CR-01 fix changed an error path (transactional read failure now rethrows instead of being swallowed to `false`) without a test on that path. Added a spy-rejected `AppSetting.findByPk` test: the mutation errors, the door stays `true`, and zero `setting.public_registration_changed` audit rows exist. Verified red under a mutant that removes the rethrow (audit row written with a fabricated `from: false`), green with the fix.
