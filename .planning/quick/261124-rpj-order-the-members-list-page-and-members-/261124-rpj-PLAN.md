---
phase: quick-261124-rpj
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/src/services/memberOrder.service.js
  - backend/src/services/memberOrder.service.test.js
  - backend/src/schemas/familyMember.schema.js
  - backend/src/resolvers/familyMember.resolver.js
  - backend/src/resolvers/familyMember.membersDepthFirst.test.js
  - backend/src/routes/members.routes.js
  - backend/src/routes/members.pdf.test.js
  - frontend/src/pages/MembersPage.jsx
  - frontend/src/pages/MembersPage.test.jsx
autonomous: true
requirements: [QUICK-261124-rpj]
must_haves:
  truths:
    - "The /members page lists members in depth-first (pre-order) family-tree order, not by lastname"
    - "The members PDF lists members in exactly the same order as the page"
    - "The existing familyMembers query still returns lastname, firstname order"
    - "Unauthenticated callers and unlinked non-admins get no member data from the new query or the PDF route"
    - "Every member appears exactly once, even with cycles or a child whose two parents are both present"
  artifacts:
    - path: "backend/src/services/memberOrder.service.js"
      provides: "orderDepthFirst pure function and loadMembersDepthFirst (2 queries)"
      exports: ["orderDepthFirst", "loadMembersDepthFirst"]
    - path: "backend/src/schemas/familyMember.schema.js"
      provides: "familyMembersDepthFirst query"
      contains: "familyMembersDepthFirst"
  key_links:
    - from: "backend/src/resolvers/familyMember.resolver.js"
      to: "loadMembersDepthFirst"
      via: "requireFamilyAccess then load"
      pattern: "loadMembersDepthFirst"
    - from: "backend/src/routes/members.routes.js"
      to: "loadMembersDepthFirst"
      via: "after mapAuthFailure"
      pattern: "loadMembersDepthFirst"
    - from: "frontend/src/pages/MembersPage.jsx"
      to: "familyMembersDepthFirst"
      via: "graphqlRequest"
      pattern: "familyMembersDepthFirst"
---

<objective>
Order the /members page and GET /api/members.pdf depth-first through the family tree (user: "Make sure the order of the list is depth first").

Purpose: the roster reads as the family tree (ancestor, then each descendant line) instead of alphabetically.
Output: one pure backend ordering function, a new auth-guarded query for the page, the PDF route switched to the same loader, and tests.

Ordering rules (the orchestrator's interpretation; the user may correct them):
1. Pre-order depth-first walk of the parent -> children tree: a member, then each child's whole subtree before the next child.
2. Roots = members with neither parent present in the member set, visited in ascending id order (top ancestor id 1 first).
3. Children of a member = those whose fatherId or motherId is that member, ordered by birthdate ascending, unknown birthdates last, ties by ascending id.
4. A married-in spouse (spouse of the current member, no parent in the set, not yet visited) is listed directly after that member and before the children. Spouses are visited in ascending id order.
5. Every member appears exactly once: visited set; a child with two parents in the tree is listed under whichever parent is reached first; cycles cannot loop; anything still unvisited after the walk is appended in ascending id order.

Findings from the code: existing schema does not expose an ordered list, `FamilyMember` GraphQL type has no fatherId/motherId, so the page cannot order client-side (and must not). Hence a new query. Spouse rows are `{ memberAId, memberBId }` (Spouse model, spouses table). The walk must be iterative (explicit stack) so a very deep chain cannot overflow the call stack.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/quick/261124-qxg-add-a-members-list-page-accessible-only-/261124-qxg-SUMMARY.md
@backend/src/routes/members.routes.js
@backend/src/resolvers/familyMember.resolver.js
@backend/src/resolvers/familyMember.membersList.test.js
@backend/src/routes/members.pdf.test.js
@backend/src/services/membersPdf.service.js
@frontend/src/pages/MembersPage.jsx
@frontend/src/pages/MembersPage.test.jsx

<interfaces>
Existing (do not change behavior):
- resolver `Query.familyMembers`: `requireFamilyAccess(user); return models.FamilyMember.findAll({ order: [['lastname','ASC'],['firstname','ASC']] })`
- route `GET /members.pdf` in members.routes.js: `mapAuthFailure(user, res)` runs first, then `models.FamilyMember.findAll(...)`, then `membersPdfService.buildMembersPdf(members)`. buildMembersPdf iterates the array it is given in order, so it needs no change.
- Test helpers: `import { graphql, httpClient, resetTables, createTestUser } from '../../test/helpers.js'`; `graphql(query, vars, user)`.
- Models: `models.FamilyMember` (fields id, fatherId, motherId, birthdate), `models.Spouse` (memberAId, memberBId).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pure orderDepthFirst function plus loader (test first)</name>
  <files>backend/src/services/memberOrder.service.test.js, backend/src/services/memberOrder.service.js</files>
  <behavior>
    Write the test file first and run it red (module not found). `orderDepthFirst(members, spouseRows)` takes plain arrays (members: objects with id, fatherId, motherId, birthdate; spouseRows: objects with memberAId, memberBId) and returns a new array of the same member objects in order. No DB access, input not mutated. Cases:
    - empty list returns []
    - single root chain A -> B -> C returns [A, B, C]
    - siblings: children with birthdates 2000, null, 1990, plus two children with the same birthdate and different ids: order is ascending birthdate, same-date by ascending id, null last
    - spouse placed after the member and before the member's children; a spouse who has a parent in the set is NOT pulled in as a spouse (stays under their own parent)
    - child with both parents present appears exactly once, under the parent reached first
    - multiple roots visited in ascending id order, each subtree complete before the next root
    - cycle (A father of B, B father of A, plus unrelated root C): output has every id exactly once, terminates
    - numeric-string vs number ids (e.g. '2' vs 2 from DB) and birthdate as 'YYYY-MM-DD' strings or Date objects compare correctly
  </behavior>
  <action>
    Create `backend/src/services/memberOrder.service.js` with named exports (project convention, 2-space indent, single quotes, semicolons, explicit .js import paths).
    `orderDepthFirst`: normalize ids with Number(); build a Map id -> member, a children Map (parentId -> members, only when the parent id is in the set; a member whose fatherId and motherId are the same id is added once), and a spouses Map from spouseRows ignoring rows whose ends are not both in the set. Sort children by (birthdate asc with null/undefined/invalid last, then id asc); compare birthdates via `new Date(x).getTime()` or the normalized YYYY-MM-DD string, whichever handles both Date and string. Roots = members where neither fatherId nor motherId is a Number in the set, ascending id. Walk with an explicit stack and a visited Set (rule 5): on visiting a member, emit it, then emit each unvisited married-in spouse (no parent in the set) in ascending id order, then push the member's children and the spouses' children so that the member's children come out in the sorted order and each child's whole subtree completes before the next child (push in reverse). Treat a spouse's own children as children of that spouse, visited right after the member's own children in the same pre-order discipline (document this choice in a one-line comment). Skip already visited ids when popping. After all roots, append unvisited members in ascending id order, then run the same walk from each of them only if needed to keep descendants adjacent; at minimum append them so none is dropped (cycle members are covered by this fallback).
    `loadMembersDepthFirst(models)`: exactly two queries, `models.FamilyMember.findAll()` and `models.Spouse.findAll()`, then `return orderDepthFirst(members, spouses)`. It performs NO auth check (callers do it first); say so in a one-line comment.
    Do not touch the existing lastname/firstname order anywhere.
  </action>
  <verify>
    <automated>cd backend && npx vitest run src/services/memberOrder.service.test.js</automated>
  </verify>
  <done>Test file seen failing first, then all cases green; function is pure and exported alongside loadMembersDepthFirst.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: New guarded query and PDF route use the depth-first loader (test first)</name>
  <files>backend/src/resolvers/familyMember.membersDepthFirst.test.js, backend/src/routes/members.pdf.test.js, backend/src/schemas/familyMember.schema.js, backend/src/resolvers/familyMember.resolver.js, backend/src/routes/members.routes.js</files>
  <behavior>
    Write tests first and run them red.
    Resolver test (model it on familyMember.membersList.test.js): query `familyMembersDepthFirst { id firstname lastname }`.
    - unauthenticated: errors[0].message matches /logged in/i, data null, response JSON contains no seeded name
    - unlinked non-admin USER: errors match /not yet linked/i, data null
    - linked USER: seed a tree whose lastname order differs from depth-first order (e.g. root 'Zed', child 'Abe', grandchild 'Mo', a married-in spouse 'Bea'); assert the exact id order is depth-first, and that `familyMembers` for the same data still returns lastname/firstname order
    - unlinked ADMIN gets all members
    PDF route test (add to members.pdf.test.js): spy `vi.spyOn(pdfService, 'buildMembersPdf')`, call the route as an authorized user with the same seeded tree, assert the array passed in has depth-first order (ids). Keep the existing 401/403 no-leak tests; they must still pass and the spy must NOT have been called for them.
  </behavior>
  <action>
    Schema: add `familyMembersDepthFirst: [FamilyMember!]!` to Query in familyMember.schema.js next to `familyMembers`, with a one-line comment that it is the roster order (depth-first) and `familyMembers` stays alphabetical.
    Resolver: add `familyMembersDepthFirst: async (_parent, _args, { models, user }) => { requireFamilyAccess(user); return loadMembersDepthFirst(models); }` importing from '../services/memberOrder.service.js'. Leave `familyMembers` untouched.
    Route: in members.routes.js replace the `findAll({ order: ... })` line with `await loadMembersDepthFirst(models)`; the `mapAuthFailure` check stays first and unchanged, the generic 500 catch stays.
    The FamilyMember GraphQL type's existing field resolvers (fullname, canEdit, etc.) work on returned model instances, so no extra mapping is needed.
  </action>
  <verify>
    <automated>cd backend && npx vitest run src/resolvers/familyMember.membersDepthFirst.test.js src/resolvers/familyMember.membersList.test.js src/routes/members.pdf.test.js src/services/membersPdf.service.test.js</automated>
  </verify>
  <done>New query ordered depth-first and auth-guarded before any read; PDF receives the same order; old familyMembers test still green; 401/403 tests still green with no PDF builder call.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Members page uses the depth-first query (test first)</name>
  <files>frontend/src/pages/MembersPage.test.jsx, frontend/src/pages/MembersPage.jsx</files>
  <behavior>
    Update MembersPage.test.jsx first: the mocked graphqlRequest resolves `{ familyMembersDepthFirst: MEMBERS }`, with MEMBERS in a deliberately non-alphabetical order; assert the query string passed to graphqlRequest contains `familyMembersDepthFirst` and that rendered rows appear in the given (server) order, not re-sorted. Run red (page still reads data.familyMembers).
  </behavior>
  <action>
    In MembersPage.jsx change the query to `familyMembersDepthFirst { ...same fields... }` (keep operation name and fields) and `setMembers(data.familyMembersDepthFirst)`. Confirm there is no client-side sort in the page (none exists today; add none). No other page behavior changes.
  </action>
  <verify>
    <automated>cd frontend && npx vitest run src/pages/MembersPage.test.jsx</automated>
  </verify>
  <done>Page test red then green; page renders server order untouched.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client -> GraphQL familyMembersDepthFirst | untrusted caller reaches member data |
| client -> GET /api/members.pdf | untrusted caller reaches member data |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-rpj-01 | I | familyMembersDepthFirst resolver | mitigate | requireFamilyAccess(user) is the first statement, before loadMembersDepthFirst; test asserts unauth and unlinked non-admin get no member names |
| T-rpj-02 | I | members.pdf route | mitigate | mapAuthFailure remains before the loader; test asserts 401/403 and that the PDF builder is not called |
| T-rpj-03 | D | orderDepthFirst on bad data | mitigate | visited set plus iterative stack; cycle test proves termination and no deep-chain stack overflow |
| T-rpj-04 | D | loader query count | accept | fixed two queries regardless of member count |
| T-rpj-SC | T | package installs | accept | no new dependencies |
</threat_model>

<verification>
- cd backend && npx vitest run (full backend suite green; run serially, per known resetTables flake note)
- cd frontend && npx vitest run
- grep confirms `order: [['lastname'` still present in the familyMembers resolver
</verification>

<success_criteria>
- /members and members.pdf both list members depth-first via one shared function
- familyMembers order unchanged; no new dependencies; auth check precedes every member/spouse read
- Unit tests cover chain, sibling order with null birthdate and id tie-break, spouse placement, dual-parent child once, multiple roots, cycle, empty
</success_criteria>

<output>
Create `.planning/quick/261124-rpj-order-the-members-list-page-and-members-/261124-rpj-SUMMARY.md` when done
</output>
