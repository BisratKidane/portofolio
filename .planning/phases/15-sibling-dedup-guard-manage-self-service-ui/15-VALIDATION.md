---
phase: 15
slug: sibling-dedup-guard-manage-self-service-ui
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-23
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 (shared config pattern across `backend` and `frontend` workspaces) |
| **Config file** | `backend/vitest.config.js`, `frontend/vitest.config.js` |
| **Quick run command** | `npm test --workspace backend -- <path>` / `npm test --workspace frontend -- <path>` |
| **Full suite command** | `npm test --workspace backend` / `npm test --workspace frontend` (both wired into root `npm test` → CI, per Phase 6) |
| **Estimated runtime** | ~15-25 seconds per quick run; ~60-90 seconds per full-suite run |

---

## Sampling Rate

- **After every task commit:** Run the task's `<automated>` quick command (specific test file).
- **After every plan wave:** Run `npm test --workspace backend` and `npm test --workspace frontend` (both full suites).
- **Before `/gsd:verify-work`:** Both full suites must be green (enforced explicitly by Plan 15-06's final task).
- **Max feedback latency:** ~25 seconds (quick run); no watch-mode flags used anywhere in this phase's verify commands.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 1 | REL-06 | T-15-01 | RED: guard tests fail because no guard exists yet | integration | `npm test --workspace backend -- src/services/familyMember.dedup.test.js` | ❌ W0 (created this task) | ⬜ pending |
| 15-01-02 | 01 | 1 | REL-06 | T-15-01 / T-15-02 | GREEN: FOR UPDATE row lock closes the TOCTOU; guard is unconditional (no admin bypass) | integration | `npm test --workspace backend -- src/services/familyMember.dedup.test.js` | ✅ (Task 1 creates it) | ⬜ pending |
| 15-01-03 | 01 | 1 | REL-06 | T-15-01 / T-15-02 | Both public doors (addChild, addSibling mutations) reject duplicates identically for members and admins | integration (resolver) | `npm test --workspace backend` | ✅ existing, extended | ⬜ pending |
| 15-02-01 | 02 | 1 | MNG-01 | T-15-04 / T-15-05 | Locked relative renders no Edit button + hint (D-06); self/admin bypass correct; no dead Rewire UI | component (RTL) | `npm test --workspace frontend -- src/components/manage/MemberCard.test.jsx` | ❌ W0 (created this task) | ⬜ pending |
| 15-02-02 | 02 | 1 | MNG-01 | — | Five sections render with UI-SPEC-exact empty-state copy; derived siblings marked | component (RTL) | `npm test --workspace frontend -- src/components/manage/RelationshipGroupedPanel.test.jsx` | ❌ W0 (created this task) | ⬜ pending |
| 15-03-01 | 03 | 1 | MNG-02 | — | Parent/spouse forms submit the correct mutation; "Add member" label exact | component (RTL) | `npm test --workspace frontend -- src/components/manage/AddRelativeDialog.test.jsx` | ❌ W0 (created this task) | ⬜ pending |
| 15-03-02 | 03 | 1 | MNG-02 | T-15-06 / T-15-07 | In-scope picker bound to `inScopeMembers` only; REL-06/D-04 server errors surface via Alert | component (RTL) | `npm test --workspace frontend -- src/components/manage/AddRelativeDialog.test.jsx` | ❌ W0 (created this task) | ⬜ pending |
| 15-04-01 | 04 | 1 | MNG-03 | — | Search filters case-insensitively; empty state on no match | component (RTL) | `npm test --workspace frontend -- src/components/manage/AdminMemberTable.test.jsx` | ❌ W0 (created this task) | ⬜ pending |
| 15-04-02 | 04 | 1 | MNG-03 | T-15-08 | Client-side pagination boundary correct; row-select callback fires with exact member | component (RTL) | `npm test --workspace frontend -- src/components/manage/AdminMemberTable.test.jsx` | ❌ W0 (created this task) | ⬜ pending |
| 15-05-01 | 05 | 2 | MNG-01 | — | Member branch groups flat `myEditableMembers` into scope client-side (Pitfall 5); add-relative dialog opens with correct relationType/targetId | component (RTL) | `npm test --workspace frontend -- src/pages/ManagePage.test.jsx` | ❌ W0 (created this task) | ⬜ pending |
| 15-05-02 | 05 | 2 | MNG-02 | T-15-10 | editMember wired for self/non-locked relatives; EditFamilyMemberInput has no edge field | component (RTL) | `npm test --workspace frontend -- src/components/manage/EditMemberDialog.test.jsx` | ❌ W0 (created this task) | ⬜ pending |
| 15-05-03 | 05 | 2 | MNG-04 | T-15-09 / T-15-11 | Unlinked non-admin redirected to /pending on the real /manage route; /admin/link-members fully retired | component (RTL, route-level) | `npm test --workspace frontend` | ✅ ProtectedRoute.test.jsx exists generically; extended here for the real /manage path | ⬜ pending |
| 15-06-01 | 06 | 3 | MNG-03 | T-15-12 | Admin table→focus→panel shows admin-bypass Edit + Remove; delete requires UI-SPEC-exact confirm dialog | component (RTL) | `npm test --workspace frontend -- src/pages/ManagePage.test.jsx` | ✅ extended from 15-05 | ⬜ pending |
| 15-06-02 | 06 | 3 | MNG-03 | T-15-14 | Account-linking re-homed verbatim; both full suites green (phase gate) | component (RTL) + full suite | `npm test --workspace frontend && npm test --workspace backend` | ✅ extended from 15-05 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/services/familyMember.dedup.test.js` — new file, created by Task 15-01-01 (RED state, then made green by 15-01-02)
- [ ] `frontend/src/components/manage/MemberCard.test.jsx` — new file, created by Task 15-02-01
- [ ] `frontend/src/components/manage/RelationshipGroupedPanel.test.jsx` — new file, created by Task 15-02-02
- [ ] `frontend/src/components/manage/AddRelativeDialog.test.jsx` — new file, created by Task 15-03-01 (extended by 15-03-02)
- [ ] `frontend/src/components/manage/AdminMemberTable.test.jsx` — new file, created by Task 15-04-01 (extended by 15-04-02)
- [ ] `frontend/src/pages/ManagePage.test.jsx` — new file, created by Task 15-05-01 (extended by 15-05-02, 15-05-03, 15-06-01, 15-06-02)
- [ ] `frontend/src/components/manage/EditMemberDialog.test.jsx` — new file, created by Task 15-05-02
- [ ] No new test framework/config needed — both `vitest.config.js` files already cover these colocated `*.test.js`/`*.test.jsx` locations by existing glob patterns.

Every Wave 0 gap listed above is closed by the plan/task that creates the corresponding file — no task in this phase depends on a test file that isn't created within the same plan.

---

## Manual-Only Verifications

*None. All phase behaviors have automated verification, including the D-10 concurrency proof (`Promise.allSettled`-driven, per Pitfall 1's explicit warning against a sequential substitute) and the MNG-04 route-gating proof (exercised against the real `/manage` route tree, not just `ProtectedRoute` in isolation).*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (every Wave 0 file is created within the same plan that needs it — see table above).
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every task across all 6 plans has its own `<automated>` command).
- [x] Wave 0 covers all MISSING references (all 7 new test files listed above are accounted for).
- [x] No watch-mode flags (`vitest run` is the underlying script for both workspaces' `test` command — no `--watch`).
- [x] Feedback latency < 30s (quick runs target a single test file; full-suite runs are reserved for wave/plan boundaries, matching the Sampling Rate section).
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** approved (2026-07-23)
