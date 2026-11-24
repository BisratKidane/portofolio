# Quick 261124-rpj Summary: Depth-first member order

One shared pure function (`orderDepthFirst`, iterative, visited-set) now orders both the /members page (new auth-guarded `familyMembersDepthFirst` query) and GET /api/members.pdf; `familyMembers` is unchanged (lastname, firstname).

## Commits
- 92eef2d feat: pure depth-first ordering + `loadMembersDepthFirst` (2 queries, no auth check by design)
- 22efcd7 feat: guarded `familyMembersDepthFirst` query; PDF route uses the loader after `mapAuthFailure`
- aa77cea feat: MembersPage reads `familyMembersDepthFirst`, no client re-sort
- 515246c test: update root-field pin in security.boundaries.test.js

## Red runs observed
- Task 1: memberOrder.service.test.js failed (module not found) before implementation.
- Task 2: 4 resolver tests failed (unknown field) and the PDF order test failed (got lastname order [3,2,1]) before implementation.
- Task 3: updated MembersPage tests failed (`Cannot read properties of undefined (reading 'map')`) before the page change.

## Auth proof
Resolver: `requireFamilyAccess` is the first statement. Tests: unauthenticated and unlinked USER get no data and no names in the response; unlinked ADMIN sees all. PDF: existing 401/403 tests kept, and the no-read test now also asserts `Spouse.findAll` and `FamilyMember.findAll` are never called for unauthorized callers.

## Deviation
[Rule 3 - blocking] `backend/src/resolvers/security.boundaries.test.js` pins root-field counts (14 Query / 28 swept). Adding the query made it fail in the first full run (1 failure). Updated to 15 / 29 (not public, so allowlist unchanged); the Pending-user sweep for the new field passes.

## Results (full suites)
- Backend: 77 files passed, 689 tests passed, 3 skipped (692). The first full run had 1 failure (the pin above), fixed and rerun green.
- Frontend: 46 files, 512 tests passed.

## Not verified
Ordering rules are the orchestrator's interpretation; no manual browser/PDF visual check was done. Node v24 locally vs pinned 18.

## Self-Check: PASSED
