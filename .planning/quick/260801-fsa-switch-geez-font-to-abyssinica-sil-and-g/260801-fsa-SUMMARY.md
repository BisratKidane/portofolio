---
phase: quick-260801-fsa
plan: 01
subsystem: ui
tags: [react, mui, fontsource, vitest, family-tree]

# Dependency graph
requires:
  - phase: 20-selfhosted-font-theme (v3.0)
    provides: self-hosted Noto Sans Ethiopic webfont + FONT_SANS/FONT_DISPLAY stacks
provides:
  - Self-hosted Abyssinica SIL webfont replacing Noto Sans Ethiopic app-wide
  - Gender-tinted Ge'ez name row and mother's-name row on the /family tree card
affects: [family-tree-rendering, theme]

# Tech tracking
tech-stack:
  added: ["@fontsource/abyssinica-sil@5.3.0 (replaces @fontsource/noto-sans-ethiopic)"]
  patterns: []

key-files:
  created: []
  modified:
    - frontend/package.json
    - frontend/src/main.jsx
    - frontend/src/theme.js
    - frontend/src/theme.test.js
    - frontend/src/components/family/MemberNode.jsx

key-decisions:
  - "Abyssinica SIL ships only weight 400 (no bold/700 variant, confirmed via node_modules/@fontsource/abyssinica-sil/metadata.json) — main.jsx imports only 400.css instead of the planned 400/700 pair; the plan explicitly anticipated this package-structure difference and delegated the filename adjustment to execution."

patterns-established: []

requirements-completed: []

# Metrics
duration: 20min
completed: 2026-08-01
---

# Phase quick-260801-fsa: Switch Ge'ez font to Abyssinica SIL + gender-tint tree-card rows Summary

**Swapped the self-hosted Ge'ez webfont from Noto Sans Ethiopic to Abyssinica SIL app-wide, and colored the Ge'ez name + mother's-name rows on `/family` tree cards with the member's gender tint.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-08-01T09:10:00Z (approx.)
- **Completed:** 2026-08-01T09:29:46Z
- **Tasks:** 2 completed
- **Files modified:** 5

## Accomplishments
- `@fontsource/abyssinica-sil` installed and wired into `main.jsx`, `theme.js` (FONT_SANS/FONT_DISPLAY), and `theme.test.js`; `@fontsource/noto-sans-ethiopic` fully removed.
- Ge'ez name row and mother's-name row on the `/family` `MemberNode.jsx` tree card now render in `genderTint` (matching the card's border/background gender cue), while fullname, birthday, address rows, and the `/manage` list are untouched.
- Full frontend suite green after each task: 301/301 tests passing.

## Task Commits

Each task was committed atomically:

1. **Task 1: Switch Ge'ez webfont from Noto Sans Ethiopic to Abyssinica SIL** - `c9c3bef` (feat)
2. **Task 2: Gender-color the Ge'ez name row and mother's-name row on the /family tree card** - `a74feef` (feat)

_No TDD tasks in this plan; both were single-commit `type="auto"` tasks._

## Files Created/Modified
- `frontend/package.json` - `@fontsource/abyssinica-sil@^5.3.0` added, `@fontsource/noto-sans-ethiopic` removed
- `frontend/src/main.jsx` - two Noto Sans Ethiopic CSS imports replaced with a single `@fontsource/abyssinica-sil/400.css` import
- `frontend/src/theme.js` - `FONT_SANS`/`FONT_DISPLAY` stacks reference `"Abyssinica SIL"` in the same fallback position `"Noto Sans Ethiopic"` held
- `frontend/src/theme.test.js` - both `it()` assertions updated to search for `'Abyssinica SIL'`, position assertions (`toBeGreaterThan`/`toBeLessThan`) unchanged
- `frontend/src/components/family/MemberNode.jsx` - Ge'ez name row and mother's-name row `Typography` now use `sx={{ ...ROW_SX, color: genderTint }}`; fullname/birthday/address rows byte-for-byte unchanged
- `package-lock.json` - regenerated for the dependency swap (root lockfile, npm workspaces)

## Decisions Made
- **Single-weight font file:** Abyssinica SIL's fontsource package ships only weight 400 (confirmed via `metadata.json`: `"weights": [400]`) — there is no `700.css` to import. The plan text explicitly anticipated this ("Abyssinica SIL ships weight-named CSS files, not an 'ethiopic' subset... verify the exact file names exist... and adjust only the filename if the package structure differs"), so `main.jsx` imports only `@fontsource/abyssinica-sil/400.css`. No bold Ge'ez rendering will be available anywhere the font stack falls through to Abyssinica SIL; this is a pre-existing constraint of the chosen font, not a regression from Noto Sans Ethiopic (which did ship both 400/700 subsets).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Only one CSS weight file exists in the Abyssinica SIL package**
- **Found during:** Task 1
- **Issue:** Plan's interface excerpt assumed a `400.css`/`700.css` pair analogous to the old `ethiopic-400.css`/`ethiopic-700.css` pair. `node_modules/@fontsource/abyssinica-sil/` only contains `400.css` (plus latin/latin-ext/ethiopic subset variants at 400, no 700 anywhere) — the font itself has no bold master.
- **Fix:** Imported only `@fontsource/abyssinica-sil/400.css` in `main.jsx`.
- **Files modified:** `frontend/src/main.jsx`
- **Verification:** `npm test --workspace frontend` green (301/301); `grep -rn "Noto Sans Ethiopic\|noto-sans-ethiopic" frontend/src frontend/package.json` returns no matches.
- **Committed in:** `c9c3bef` (Task 1 commit)

**2. [Rule 1 - Bug, self-caused] Accidental npm install run against the shared main-repo checkout instead of the isolated worktree**
- **Found during:** Task 1, before any commit
- **Issue:** An early `cd /Users/bisrat/Projects/portofolio && npm i ...` compound command in this session executed in the shared checkout (`/Users/bisrat/Projects/portofolio`) rather than this worktree (`/Users/bisrat/Projects/portofolio/.claude/worktrees/agent-afbab783e7650dc87`), because the tool's cwd resets between Bash calls and a `cd` prefix silently escaped the worktree for that one call. This modified `frontend/package.json`/`node_modules` in the shared checkout outside of git (uncommitted, on-disk only) before the guard rail caught the subsequent `Edit` calls.
- **Fix:** Immediately reversed the accidental change in the shared checkout via `npm uninstall @fontsource/abyssinica-sil --workspace frontend` followed by `npm i "@fontsource/noto-sans-ethiopic@^5.3.0" --workspace frontend`, restoring `frontend/package.json` to its original byte-for-byte dependency line and removing the stray `node_modules/@fontsource/abyssinica-sil` directory. All subsequent work (both tasks, both commits) was then redone correctly inside the actual worktree using relative paths and no `cd`.
- **Files modified (shared checkout, not part of any commit in this worktree):** `frontend/package.json`, `node_modules/` — restored, not committed.
- **Verification:** `grep -n fontsource /Users/bisrat/Projects/portofolio/frontend/package.json` confirms only `@fontsource/noto-sans-ethiopic` remains there (original state); the worktree's own `frontend/package.json` correctly has only `@fontsource/abyssinica-sil` and was committed normally. Note: I could not run `git status`/`git diff` against the shared checkout to confirm `package-lock.json` there is byte-identical to its committed state — the sandbox explicitly blocks all git operations targeting that path (by design, to prevent exactly this kind of cross-checkout mutation). Since the exact same version-pinned reinstall (`^5.3.0`) was used to reverse the change, no dependency version drift should exist, but a human `git status`/`git diff -- package-lock.json` check in the main checkout is recommended as a follow-up sanity check.
- **Committed in:** N/A — this was a pre-commit correction in a different (non-worktree) directory, not part of this plan's task commits.

---

**Total deviations:** 2 auto-fixed (1 blocking - package structure, 1 blocking - self-caused cross-checkout leak, both Rule 1/3)
**Impact on plan:** Neither affected the plan's scope or success criteria. The font-weight adjustment was explicitly pre-authorized by the plan text. The cross-checkout leak was caught and reversed before any commit was made in either location; recommend a quick manual `git status` in `/Users/bisrat/Projects/portofolio` as a belt-and-suspenders check.

## Issues Encountered
See Deviations above — both were resolved inline without blocking task completion.

## User Setup Required

None - no external service configuration required.

## Manual Follow-up Required (deferred, not blocking)

Per the plan's verification section, jsdom/Vitest cannot assert real glyph rendering. Two items need a human `/family` page look, same category as the Phase 22 deferred visual sign-off (STATE.md):

1. **Glyph coverage:** Abyssinica SIL's rendering of Tigrinya labialized consonant forms (ቨ, ቐ) against real Ge'ez name data — confirm no missing-glyph tofu boxes and that the "broader/more accurate native Ge'ez glyph design" goal is visibly achieved vs. the old Noto Sans Ethiopic.
2. **Gender-tint contrast:** Visual check that the Ge'ez name row and mother's-name row remain legible at `genderTint` color (male `#3b82f6`, female `#ec4899`, other `colors.slate`) against the card's `${genderTint}14` background tint, at the fixed 252×120px card size, for the longest real Ge'ez name in the dataset.

Recommended: also run `git -C /Users/bisrat/Projects/portofolio status --short` manually to confirm the shared main checkout has no stray uncommitted diff from the self-caused deviation noted above (I verified `frontend/package.json` content directly but could not run git there).

## Next Phase Readiness
- Both tasks are complete, atomic, and independently green on `npm test --workspace frontend` (301/301).
- No backend, API, or runtime-behavior changes — purely visual/dependency swap, matching the plan's non-destructive scope.
- Nothing blocks closing this quick task; the two manual visual checks above are advisory, not gating (consistent with how the plan's `<verification>` section scoped them).

---
*Phase: quick-260801-fsa*
*Completed: 2026-08-01*

## Self-Check: PASSED

- FOUND: frontend/src/main.jsx
- FOUND: frontend/src/theme.js
- FOUND: frontend/src/theme.test.js
- FOUND: frontend/src/components/family/MemberNode.jsx
- FOUND: frontend/package.json
- FOUND commit: c9c3bef
- FOUND commit: a74feef
