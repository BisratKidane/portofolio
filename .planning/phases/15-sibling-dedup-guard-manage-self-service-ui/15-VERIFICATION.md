---
phase: 15-sibling-dedup-guard-manage-self-service-ui
verified: 2026-07-23T22:35:00Z
status: passed
score: 9/9 must-haves verified
overrides_applied: 0
---

# Phase 15: Sibling Dedup Guard & /manage Self-Service UI Verification Report

**Phase Goal:** Members have a working `/manage` page to view and edit their scope through real forms, duplicate-child creation is guarded against, and admins can manage the whole tree and link accounts from the same page.
**Verified:** 2026-07-23T22:35:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Creating/linking a duplicate-firstname child sharing either parent is rejected with an actionable, correctly-worded error (REL-06, D-08/D-09) | VERIFIED | `backend/src/services/familyMember.service.js:52-110` implements the guard exactly per spec (either-parent OR, trim+case-fold). `backend/src/services/familyMember.dedup.test.js` (7 `it` blocks) and resolver-level tests in `familyMember.addChild.test.js`/`familyMember.addSibling.test.js` assert the exact copy. Full backend suite run live: 281/281 passed. |
| 2 | Two genuinely concurrent addChild calls targeting the same parent+firstname: exactly one succeeds (D-10 TOCTOU) | VERIFIED | `familyMember.dedup.test.js:72-93` uses `Promise.allSettled` (no sequential await) and asserts exactly one fulfilled/one rejected, final count 1. Additionally, `familyMember.dedup.test.js:113-147` is a deterministic regression test reproducing the exact resolver-path race (plain `findByPk` fixing the REPEATABLE READ snapshot before the guard runs) — confirms the fix (`lock: t.LOCK.UPDATE` on the duplicate-check `findOne`, service.js:83-95) actually closes CR-01, not just the original direct-call test. Ran the live suite; this test passed. |
| 3 | The guard applies to admins exactly as it applies to members (D-08, no override) | VERIFIED | `grep -n "isAdmin" backend/src/services/familyMember.service.js` returns zero matches — no role parameter exists in the guard at all. Adversarial admin test present and green in both `familyMember.dedup.test.js` and `familyMember.addChild.test.js:254-279`. |
| 4 | A member-user visiting /manage sees You/Parents/Spouse/Children/Siblings sections populated from their editable scope (MNG-01, D-01/D-02) | VERIFIED | `frontend/src/pages/ManagePage.jsx`'s `MemberBranch` fetches `MY_EDITABLE_MEMBERS_QUERY`, groups via `groupByRelation`, renders `RelationshipGroupedPanel` (all 5 sections present, `frontend/src/components/manage/RelationshipGroupedPanel.jsx:44-98`). Siblings section shows "Derived" chip and independent empty-state copy. `ManagePage.test.jsx` asserts populated sections; full frontend suite run live: 90/90 passed. |
| 5 | A member can add a relative via wired AddRelativeDialog and the page reflects the new relative after success (MNG-02, D-04/D-05) | VERIFIED | `AddRelativeDialog.jsx` implements all 4 relation types with exact mutation SDL, "Add member" submit label, in-scope-only picker (`options={inScopeMembers}`), and error-Alert surfacing for REL-06/D-04 rejections. `ManagePage.jsx`'s `onCreated={refetch}` re-fetches scope on success. Test suites for both files pass. |
| 6 | A member can edit an existing, non-locked relative's plain fields via editMember (MNG-02) | VERIFIED | `EditMemberDialog.jsx` sends `EDIT_MEMBER_MUTATION` with exactly the `EditFamilyMemberInput` field set (no motherId/fatherId/spouse field — confirmed by inspection); pre-fills from `member`, calls `onSaved()`+`onClose()` on success, renders Alert on failure. Wired into `ManagePage.jsx` for both member and admin branches. |
| 7 | /manage is reachable only by linked members and admins; unlinked non-admin redirected to /pending (MNG-04, D-12) | VERIFIED | `frontend/src/App.jsx:24-27` registers `/manage` inside the same plain `<Route element={<ProtectedRoute />}>` (no `allowedRoles`) that wraps `/dashboard`. `ProtectedRoute.jsx:17` redirects unlinked non-admins to `/pending`, unchanged. `ManagePage.test.jsx:471-` (`describe('ManagePage route gating (MNG-04...)')`) renders the real route tree and asserts the `/pending` sentinel renders for an unlinked user. |
| 8 | An admin can search/paginate the whole tree and select a member to focus into the shared grouped panel, with admin powers (Edit bypass, Remove) active (MNG-03, D-03) | VERIFIED | `AdminMemberTable.jsx` implements case-insensitive search + `TablePagination` (10/25/50) + `onSelect`. `ManagePage.jsx`'s `AdminBranch` wires `handleFocus` → `FAMILY_MEMBER_FOCUS_QUERY` → same `groupByRelation` → `RelationshipGroupedPanel isAdmin`. `MemberCard.jsx`'s `locked` computation short-circuits on `!isAdmin`, so Edit is always active for admins; Remove button renders unconditionally for `isAdmin`. Two-step confirm dialog uses exact UI-SPEC copy ("Remove member?", "...This can't be undone.") and calls `DELETE_MEMBER_MUTATION`. |
| 9 | An admin can link an unlinked user account to a family-member node from /manage (MNG-03) | VERIFIED | `ManagePage.jsx`'s `AdminBranch` fetches `UNLINKED_USERS_QUERY` alongside `FAMILY_MEMBERS_QUERY`, renders the "Link accounts" section with the ported `UnlinkedUserRow` (pick-existing / create-and-link toggle, "Create & link" label distinct from "Add member"), calls `LINK_USER_TO_MEMBER_MUTATION`, removes the user from the list on success. `/admin/link-members` is now a 5-line unconditional redirect (`AdminLinkMembers.jsx`), verified by `AdminLinkMembers.test.jsx`. |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/services/familyMember.service.js` | REL-06 guard, row-locked, unconditional | VERIFIED | `LOCK.UPDATE` present twice (parent-row lock + duplicate-check locking read, the CR-01 fix); zero `isAdmin` references |
| `backend/src/services/familyMember.dedup.test.js` | REL-06 tests incl. concurrency + resolver-path race proof | VERIFIED | 7 `it` blocks, includes genuinely concurrent `Promise.allSettled` test and deterministic CR-01 regression test |
| `frontend/src/components/manage/MemberCard.jsx` | D-06 lock branch, D-02 chip, admin bypass, no Rewire | VERIFIED | All behaviors present; `grep "Rewire"` returns no match |
| `frontend/src/components/manage/RelationshipGroupedPanel.jsx` | Shared 5-section panel | VERIFIED | You/Parents/Spouse/Children/Siblings all present, correct empty states |
| `frontend/src/components/manage/AddRelativeDialog.jsx` | 4-relation-type dialog | VERIFIED | All 4 mutations wired, in-scope-only picker, error surfacing |
| `frontend/src/components/manage/AdminMemberTable.jsx` | Searchable, paginated table | VERIFIED | Search filter, TablePagination, onSelect wired |
| `frontend/src/components/manage/EditMemberDialog.jsx` | Plain-field edit dialog | VERIFIED | EditFamilyMemberInput-only fields, wired to editMember |
| `frontend/src/pages/ManagePage.jsx` | /manage route component, member + admin branches | VERIFIED | Both branches fully implemented (MemberBranch + AdminBranch) |
| `frontend/src/App.jsx` | /manage route registration | VERIFIED | Registered behind plain ProtectedRoute, no allowedRoles |
| `frontend/src/pages/AdminLinkMembers.jsx` | Retired to redirect | VERIFIED | 5 lines, `<Navigate to="/manage" replace />`, no leftover form/query code |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `familyMember.resolver.js` addChild/addSibling | `familyMember.service.js` addChild | `addChild(attrs, { transaction: t })` | WIRED | Both resolvers call the same guarded function; confirmed by direct read of resolver.js:106-193 |
| `RelationshipGroupedPanel.jsx` | `MemberCard.jsx` | `<MemberCard` per row | WIRED | `MemberRows` helper renders one MemberCard per relation row |
| `App.jsx` | `ManagePage.jsx` | plain ProtectedRoute-wrapped route | WIRED | `path="manage"` inside the no-allowedRoles Route block, identical to dashboard |
| `ManagePage.jsx` | `myEditableMembers` query | `graphqlRequest(MY_EDITABLE_MEMBERS_QUERY)` on mount | WIRED | `MemberBranch`'s `refetch` callback, invoked in `useEffect` |
| `AddRelativeDialog.jsx` | `addParent/addSpouse/addChild/addSibling` mutations | `graphqlRequest(MUTATION, variables)` | WIRED | All four mutation constants defined and dispatched via if/else chain on `relationType` |
| `ManagePage.jsx` admin branch | `deleteMember`/`linkUserToMember` | `graphqlRequest` | WIRED | `DELETE_MEMBER_MUTATION` and `LINK_USER_TO_MEMBER_MUTATION` both defined and called |

### Behavioral Spot-Checks / Live Test Runs

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full backend suite green (incl. REL-06 + CR-01 regression) | `npm test --workspace backend` | 43 test files, 281/281 passed | PASS |
| Full frontend suite green (incl. /manage member + admin branches) | `npm test --workspace frontend` | 15 test files, 90/90 passed | PASS |

Both suites were re-run live during verification (not taken from SUMMARY.md claims) and match the reported 281/281 backend and 90/90 frontend counts exactly.

### CR-01 (TOCTOU) Correctness Assessment

Per the escalation note, the REL-06 guard's correctness was independently re-verified, not just trusted from the review's "RESOLVED" annotation:

- Read `familyMember.service.js:52-110`: the duplicate-check `findOne` now carries `lock: t.LOCK.UPDATE` (line 93), not a plain read. Under InnoDB, a locking read (`SELECT ... FOR UPDATE`) always retrieves the latest committed row version rather than the transaction's REPEATABLE READ consistent-read snapshot — this is the correct mechanism to defeat the exact race CR-01 identified (an earlier plain `findByPk` in the resolver fixing the snapshot before the guard runs).
- Read the regression test (`familyMember.dedup.test.js:113-147`): it manually opens a transaction, performs a plain `findByPk` (mirroring the resolver's pre-read), commits a conflicting sibling row from a separate autocommitted connection, then calls `addChild` against the manually-managed transaction and asserts the guard still rejects. This is a deterministic, real-database reproduction of the exact resolver-path scenario described in CR-01 — not a mocked or trivially-passing assertion.
- Confirmed both resolver call sites (`familyMember.resolver.js:131-133` `addChild`, `:165-167` `addSibling`) still perform the pre-existing plain `findByPk(targetId)` before handing the transaction to the guard — i.e., the fix genuinely operates under the exact adversarial condition CR-01 described, not a rewritten/avoided code path.
- Live-ran the full backend suite; this test passed alongside all others.

Conclusion: CR-01 is genuinely resolved, not merely marked resolved.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| REL-06 | 15-01 | Duplicate-child-name guard, either-parent scope | SATISFIED | Guard implemented + tested, live suite green |
| MNG-01 | 15-02, 15-05 | Member sees editable scope on /manage | SATISFIED | RelationshipGroupedPanel + ManagePage MemberBranch |
| MNG-02 | 15-03, 15-05 | Add/edit members via forms with in-scope pickers | SATISFIED | AddRelativeDialog + EditMemberDialog, wired |
| MNG-03 | 15-04, 15-06 | Admin manages whole tree + links accounts from /manage | SATISFIED | AdminMemberTable + admin branch + re-homed account-linking |
| MNG-04 | 15-05 | /manage gated to linked members + admins | SATISFIED | ProtectedRoute reuse, route-gating test against real tree |

**Note (non-blocking):** `.planning/REQUIREMENTS.md` still shows REL-06 and MNG-01..04 as unchecked `[ ]` / status `Pending` in its traceability table, unlike prior completed phases (e.g. REL-04, PERM-01..05 are marked `[x]`/`Complete`). This is a documentation-bookkeeping gap, not a functional gap — all five requirements are functionally satisfied per the evidence above. Flagging so the requirements ledger gets updated as part of phase close-out.

### Anti-Patterns Found

None blocking. Grep across all 10 phase-modified files for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER|coming soon|not yet implemented|not available` returned only one incidental comment match (`familyMember.resolver.js:149`, "a placeholder parent nobody created" — descriptive prose in a code comment, not a stub marker). No stub returns, no dead-end handlers, no hardcoded-empty props found in the reviewed files.

### Human Verification Required

None. All observable truths are verifiable via code inspection, live test-suite execution, and grep-level acceptance-criteria checks; no visual/UX/real-time behavior in this phase's scope required human judgment beyond what the existing (green) RTL test suites already assert.

### Advisory Findings Carried Forward (non-blocking, from 15-REVIEW.md)

These four Warnings and four Info items are real but explicitly non-blocking per the code review's own classification (none is security-critical, none breaks a must-have truth):

- **WR-01**: `groupByRelation` throws an uncaught (but caught-and-displayed-as-raw-JS-error) `TypeError` if `self` is momentarily undefined (e.g. stale `user.familyMemberId` after an admin deletes the acting user's own linked record). Degrades to a confusing error message, not a crash.
- **WR-02**: D-05's "add a parent first" sibling rejection is only surfaced reactively (after full form submission), not proactively (e.g. disabling "+ Add sibling" when `scope.parents.length === 0`).
- **WR-03**: `AdminMemberTable`'s pagination `page` state is not clamped when the underlying `members` list shrinks (e.g. after a delete), which can render an empty page with no explanation until manual back-navigation.
- **WR-04**: An admin who is also a linked member can delete their own `FamilyMember` record via the Remove button with only the generic confirmation copy — no self-delete-specific warning about self-unlinking.
- **IN-01 through IN-04**: relation-type string duplication, empty-form-shape duplication, unfiltered "other parent" picker breadth, and non-canonicalized lock-ordering in the dedup guard — all cosmetic/robustness items with no observed functional failure.

None of these affect the phase's 9 observable truths or its 5 requirement IDs. They are candidates for a follow-up gap-closure or hardening pass, not blockers to proceeding.

### Gaps Summary

No gaps found. All observable truths verified against live-executed test suites (not SUMMARY.md claims) and direct source inspection. The one Critical issue from code review (CR-01, REL-06 TOCTOU on the real resolver path) was independently re-verified as genuinely fixed — the locking-read mechanism is correct, and the regression test reproduces the exact adversarial scenario rather than a weaker proxy. The four Warnings and four Info items are real, documented, non-blocking robustness/UX gaps appropriate for a follow-up pass, not phase-goal blockers. The only documentation gap is REQUIREMENTS.md's traceability checkboxes not yet being flipped to Complete — functional, not a code gap.

---

*Verified: 2026-07-23T22:35:00Z*
*Verifier: Claude (gsd-verifier)*
