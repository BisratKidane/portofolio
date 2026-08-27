---
phase: 29-accessibility-responsive-quality-gate
reviewed: 2026-08-05T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - backend/src/resolvers/verifyEmail.test.js
  - backend/src/services/familyMember.dedup.test.js
  - backend/test/dbEngine.js
  - frontend/package.json
  - frontend/src/components/person/GenerationGrid.jsx
  - frontend/src/components/person/GenerationGrid.test.jsx
  - frontend/src/components/person/PersonCard.jsx
  - frontend/src/components/person/PersonCard.test.jsx
  - frontend/src/components/person/PersonSearch.test.jsx
  - frontend/src/pages/DetailPage.test.jsx
  - frontend/src/theme.contrast.test.js
  - frontend/test/setup.js
findings:
  critical: 0
  warning: 4
  info: 2
  total: 6
status: issues_found
---

# Phase 29: Code Review Report

**Reviewed:** 2026-08-05T00:00:00Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

This phase's two real production changes are sound: the `GenerationGrid.jsx` migration from
the legacy flexbox `Grid` to `Grid2` is a genuine bug fix (the legacy `Grid` silently ignored
the `size={{xs,sm,md}}` prop — confirmed by re-running the new breakpoint-CSS-presence test,
which now finds real `@media (min-width: 600px/900px)` rules) and the `PersonCard.jsx`
`TEXT_TINT`/`CHIP_TEXT_ALIVE` text-color fix genuinely closes the 4.5:1 text-contrast gaps its
own code comment documents. I ran all five affected frontend test files locally
(`vitest run` — 99/99 passing) and independently re-derived the WCAG contrast math in
`theme.contrast.test.js` against the actual hex tokens; the text-contrast assertions check out.

I also verified the `ctx.skip(condition, note)` calls added to the two MariaDB-gated
concurrency tests against the installed `@vitest/runner` source (`condition === false` is a
true no-op, so these tests genuinely execute and assert on CI's MySQL 8.4 image, matching
`KNOWN-ISSUES.md`) — this is not a hidden "always skip."

The residual issues below are all quality/robustness gaps, not functional breaks: the
text-contrast fix left the same gender tokens in use for the card border and avatar ring
(non-text UI components also covered by WCAG 1.4.11), one of which (Female) is computed below
the 3:1 threshold and is not covered by the new contrast-gate test suite; a magic-number
coupling between production and test code that could silently desync; a same-day-tested
but overly permissive `catch{}` in two backend concurrency tests; and inherent timing fragility
in two `SLEEP`/`wait`-based concurrency proofs. No critical/blocker findings.

## Warnings

### WR-01: Gender border/avatar-ring still fails or barely passes WCAG 1.4.11 non-text contrast — not covered by the new contrast gate

**File:** `frontend/src/components/person/PersonCard.jsx:107-108`, `frontend/src/components/person/PersonCard.jsx:164`
**Issue:** The A11Y-01 fix in this phase replaced `genderTint` with `TEXT_TINT` for *text* usage only (Ge'ez name, role label) — per the file's own comment, it deliberately left the shared `MALE_TINT`/`FEMALE_TINT`/`colors.slate` tokens in place for `bgcolor`, `border`, and the avatar-ring `border`. Those same tokens are the ones the comment measured as failing 4.5:1 (male 3.13:1, female 2.97:1). I independently recomputed contrast for the border/ring usage against the same composited card background used in `theme.contrast.test.js`:
```
border male   vs cardbg: 3.13:1   (barely clears the 3:1 non-text threshold)
border female vs cardbg: 2.97:1   (FAILS the 3:1 non-text threshold)
border other  vs cardbg: 4.03:1   (passes)
```
The border and the avatar-ring `border-style` are exactly the kind of "graphical object required to identify a UI component's state/category" that WCAG 1.4.11 (Non-text Contrast, 3:1) governs — the code's own CARD-03/D-09 comment explicitly documents the ring as the non-color gender cue. `theme.contrast.test.js` (the new contrast gate this phase adds) only asserts against `TEXT_TINT`/`CHIP_TEXT_ALIVE`, so this residual failure is invisible to the new "quality gate" and to `jest-axe` (which disables `color-contrast` under jsdom by design, per the file's own comment). The full 99/99 green test suite therefore gives false confidence that contrast is fully fixed.
**Fix:** Either introduce a `BORDER_TINT`/ring-specific darker constant (mirroring `TEXT_TINT`) for the Female (and ideally Male) border/ring, or explicitly document this as a known/deferred gap in `KNOWN-ISSUES.md`/`deferred-items.md` alongside a contrast-gate test that asserts it (e.g. extend `theme.contrast.test.js` with a `contrast.hex(genderTint, CARD_BG[gender]) >= 3` check per gender, `xfail`/skip-with-reason if intentionally deferred) so a future regression or intentional deferral is visible rather than silently uncovered.

### WR-02: Contrast-gate composite alpha (`0x14`) duplicated as an untethered magic number in prod and test code

**File:** `frontend/src/theme.contrast.test.js:43-45`, `frontend/src/components/person/PersonCard.jsx:107`
**Issue:** `PersonCard.jsx` composites its card background as `` `${genderTint}14` `` (the literal string suffix `'14'` = alpha byte `0x14`). `theme.contrast.test.js` independently hard-codes the same `0x14` value in three `compositeOverPage(..., 0x14)` calls to reproduce that background for its contrast math. There is no shared constant between the two files. If `PersonCard.jsx`'s alpha suffix is ever changed (e.g. to improve contrast, or for a visual tweak) without a matching update in `theme.contrast.test.js`, the contrast gate will silently keep testing a stale background — passing green while validating a composite that no longer matches what's rendered. This directly undermines the purpose of this phase's own quality gate.
**Fix:** Export the alpha byte as a named constant from `PersonCard.jsx` (or a shared theme util) and import it into `theme.contrast.test.js` instead of re-hardcoding `0x14`, so the two can't drift independently.

### WR-03: Blanket `catch {}` around `conn.rollback()` swallows all errors, not just "already committed"

**File:** `backend/src/resolvers/verifyEmail.test.js:141-145`, `backend/src/resolvers/verifyEmail.test.js:206-210`
**Issue:** Both raw-connection concurrency tests do:
```js
try {
  await conn.rollback();
} catch {
  /* already committed */
}
```
The comment implies this only guards against the expected "transaction already committed" case, but the `catch` has no error-type/message check — it silently discards *any* rollback failure, including genuine connection-loss or protocol errors that would otherwise be a useful signal when a test's real assertions fail for an unrelated infra reason. This makes flaky/broken CI runs against the raw `mysql2` connection harder to diagnose.
**Fix:** Narrow the catch to the expected case, e.g.:
```js
} catch (err) {
  if (!/Transaction has already been committed/i.test(err.message)) throw err;
}
```
or at minimum log the swallowed error for diagnostic visibility.

### WR-04: Fixed-sleep concurrency assertions are inherently timing-fragile under CI load

**File:** `backend/src/resolvers/verifyEmail.test.js:129-154` (Test A), `backend/src/resolvers/verifyEmail.test.js:188-229` (Test B)
**Issue:** Test A holds a lock for a hard-coded `SELECT SLEEP(0.3)` and then asserts `mutationResolvedAt >= rawCommittedAt - 25` (a 25ms tolerance window). Test B releases a held lock after a hard-coded `wait(300)` and assumes both concurrent verifiers have already reached (and are blocked on) the anchor-row lock by then. Under a loaded/throttled CI runner, either window could be too short — Test A's 25ms tolerance could false-fail on scheduler jitter alone, and Test B's 300ms window could elapse before both racers have actually reached the lock, silently defeating the interleaving the test is designed to force (the assertions would then pass without exercising the intended race). This isn't a regression introduced by this phase (only the MariaDB-skip guard was added to these tests), but since the full file is in this review's scope, it's worth flagging as a standing CI-reliability risk for the exact tests this phase depends on to guarantee the VERIFY-04 concurrency fix.
**Fix:** No action required for this phase, but consider a follow-up: replace fixed sleeps with a poll-until-blocked signal (e.g. poll `information_schema.INNODB_TRX`/`SHOW PROCESSLIST` for a lock-wait state) instead of a fixed wall-clock delay, to make the interleaving deterministic rather than probabilistic.

## Info

### IN-01: Undocumented removal of the (already-dead) `&:focus-visible` outline rule

**File:** `frontend/src/components/person/PersonCard.jsx:112-116` (diff context)
**Issue:** The pre-phase `PersonCardSingle` root `Paper` sx included `'&:focus-visible': { outline: ... }`. This phase's diff removes it with no comment. Verified this rule was already inert before removal — the root `Paper` has no `tabIndex`/interactive role, so it can never itself receive keyboard focus and the rule could never fire — so this is not a functional or accessibility regression. Flagging only because an unexplained removal in an accessibility-focused phase is worth a one-line comment for future readers who might otherwise wonder if it was an accidental accessibility regression.
**Fix:** No functional fix needed; optionally add a one-line comment noting the rule was dead code (the Paper root is never focusable) if intentionally removed as cleanup.

### IN-02: `isMariaDB()` doesn't defensively guard an empty/unexpected query result

**File:** `backend/test/dbEngine.js:17`
**Issue:** `rows[0].version` assumes `SELECT VERSION() AS version` always returns at least one row. If the query unexpectedly returns zero rows (e.g. a misconfigured connection/driver edge case), this throws an opaque `TypeError: Cannot read properties of undefined (reading 'version')` instead of a clear, actionable error.
**Fix:** 
```js
const [rows] = await conn.query('SELECT VERSION() AS version');
if (!rows[0]) throw new Error('isMariaDB(): SELECT VERSION() returned no rows');
return /mariadb/i.test(rows[0].version);
```

---

_Reviewed: 2026-08-05T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
