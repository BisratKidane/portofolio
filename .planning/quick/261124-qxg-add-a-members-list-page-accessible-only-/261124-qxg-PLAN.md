---
phase: quick-261124-qxg
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/package.json
  - package-lock.json
  - backend/assets/fonts/abyssinica-sil-ethiopic-400-normal.woff
  - backend/assets/fonts/abyssinica-sil-latin-400-normal.woff
  - backend/src/services/membersPdf.service.js
  - backend/src/services/membersPdf.service.test.js
  - backend/src/routes/members.routes.js
  - backend/src/routes/members.pdf.test.js
  - backend/src/resolvers/familyMember.membersList.test.js
  - backend/src/server.js
  - frontend/src/api/membersPdfClient.js
  - frontend/src/pages/MembersPage.jsx
  - frontend/src/pages/MembersPage.test.jsx
  - frontend/src/App.jsx
  - frontend/src/components/AppLayout.jsx
autonomous: false
requirements: [QUICK-261124-qxg]

must_haves:
  truths:
    - "A logged-in, linked (or ADMIN) user opens /members and sees every member: first+last name in Latin and Ge'ez, mother's name in Latin and Ge'ez"
    - "Gender is color-coded AND carries a text label (Male/Female/Other), so color is never the only signal"
    - "A 'Download PDF' control downloads a PDF listing the same data with legible Ge'ez glyphs and gender text labels"
    - "An unauthenticated request to the familyMembers query returns no member data (GraphQL error)"
    - "An unauthenticated request to GET /api/members.pdf returns 401 and no PDF bytes; a logged-in but unlinked non-admin gets 403"
    - "Same access rule as every other member-facing page: requireFamilyAccess (Active + email-verified via getUserFromRequest, and linked to a family member unless ADMIN)"
  artifacts:
    - path: "backend/src/services/membersPdf.service.js"
      provides: "buildMembersPdf(members) -> Buffer, embeds Abyssinica SIL for Ge'ez"
    - path: "backend/src/routes/members.routes.js"
      provides: "GET /api/members.pdf, auth-guarded server-side"
    - path: "frontend/src/pages/MembersPage.jsx"
      provides: "Members list page with gender chips + PDF download"
  key_links:
    - from: "frontend/src/pages/MembersPage.jsx"
      to: "familyMembers GraphQL query"
      via: "graphqlRequest"
      pattern: "familyMembers"
    - from: "frontend/src/api/membersPdfClient.js"
      to: "/api/members.pdf"
      via: "axios blob GET with Bearer token (a plain anchor cannot send Authorization)"
      pattern: "members\\.pdf"
    - from: "backend/src/routes/members.routes.js"
      to: "getUserFromRequest + requireFamilyAccess"
      via: "same 401/403 mapping as photo.routes.js"
      pattern: "requireFamilyAccess"
---

<objective>
Add a members list page (logged-in only) listing all members with first/last name and mother's name in Latin and Ge'ez, gender color-coded (with text label), plus an authenticated PDF download.

Purpose: let family members browse and print the full member roster.
Output: /members page, nav entry, GET /api/members.pdf, tests for each.

Codebase facts established (no schema change needed):
- Model `FamilyMember` (backend/src/models/FamilyMember.js) already has `firstname`, `lastname`, `mothersname`, `geezFirstname`, `geezLastname`, `geezMothersname`, `gender` ENUM('Male','Female','Other'). No migration.
- GraphQL `familyMembers` query already returns all of these, ordered lastname/firstname, guarded by `requireFamilyAccess(user)`. Reuse it; add no new query.
- Frontend guard: `<ProtectedRoute />` in App.jsx (redirects no-user to /login, unlinked non-admin to /pending). Nav links live in AppLayout.jsx. No i18n library; labels are plain English strings.
- No PDF generation exists anywhere. Self-hosted Ge'ez font exists only as frontend dep `@fontsource/abyssinica-sil` (woff/woff2 in node_modules/@fontsource/abyssinica-sil/files/).
- Non-Apollo REST precedent: backend/src/routes/photo.routes.js (mounted `app.use('/api', photoRouter)` in server.js, `mapAuthFailure` -> 401/403) and frontend/src/api/photoClient.js (axios blob + Bearer header).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@backend/src/routes/photo.routes.js
@backend/src/routes/photo.serve.test.js
@backend/src/utils/auth.js
@backend/src/server.js
@frontend/src/api/photoClient.js
@frontend/src/pages/FamilyTreePage.test.jsx
@frontend/src/App.jsx
@frontend/src/components/AppLayout.jsx
@frontend/src/theme.js

Test-first is mandatory (project preference): in every task, write the failing test, run it and see it fail, then implement, then refactor.
Backend tests run with `npm test --workspace backend` (Vitest, real MariaDB/MySQL; use `resetTables`, `createTestUser`, `httpClient` from backend/test/helpers.js, `signToken` from utils/auth.js, as in photo.serve.test.js). Frontend: `npm test --workspace frontend`.
</context>

<tasks>

<task type="checkpoint:human-verify" gate="blocking-human">
  <what-built>Nothing yet. No RESEARCH.md Package Legitimacy Audit exists for this quick task, so the new dependency `pdfkit` (Node PDF generator, embeds custom TTF/WOFF fonts via fontkit) is treated as [ASSUMED].</what-built>
  <how-to-verify>
    1. Open https://www.npmjs.com/package/pdfkit and confirm: package is `pdfkit` (not a typosquat), repo github.com/foliojs/pdfkit, long release history, high weekly downloads, MIT license.
    2. Confirm it supports Node 18 (this repo pins Node 18.x).
  </how-to-verify>
  <resume-signal>Type "approved" to allow `npm install pdfkit --workspace backend`, or name an alternative library.</resume-signal>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Backend - authenticated PDF route + list-query auth tests</name>
  <files>backend/package.json, package-lock.json, backend/assets/fonts/abyssinica-sil-ethiopic-400-normal.woff, backend/assets/fonts/abyssinica-sil-latin-400-normal.woff, backend/src/services/membersPdf.service.js, backend/src/services/membersPdf.service.test.js, backend/src/routes/members.routes.js, backend/src/routes/members.pdf.test.js, backend/src/resolvers/familyMember.membersList.test.js, backend/src/server.js</files>
  <behavior>
    - familyMembers query with no Authorization header: GraphQL error 'You must be logged in...', `data` null, no member rows in the response (use the Apollo/httpClient pattern in existing resolver tests, e.g. familyMember.resolver.test.js). Linked USER and ADMIN get all members including the six name fields and gender. Unlinked non-admin USER is rejected ('not yet linked').
    - GET /api/members.pdf: no token -> 401 with JSON {error} and body not starting with `%PDF`; garbage token -> 401; valid but unlinked non-admin -> 403; linked USER -> 200, Content-Type application/pdf, Content-Disposition attachment filename members.pdf, body starts with `%PDF-`; ADMIN (unlinked) -> 200. A user whose status is not Active or email unverified -> 401 (getUserFromRequest already returns null).
    - buildMembersPdf(members) returns a Buffer starting `%PDF-`; with a member having geezFirstname 'ሰላም' the output embeds the Abyssinica font (assert the PDF buffer contains the ASCII 'AbyssinicaSIL' / 'Abyssinica' font name, which a default-font PDF would not), and does not throw for members with null Ge'ez/mother fields or empty list.
    - Gender text label ('Male'/'Female'/'Other') is rendered in the PDF alongside its color (assert via the service accepting members and a pure helper `genderStyle(gender)` exported from the service returning `{ label, color }` with distinct dark, white-background-legible colors, e.g. Male #1d4ed8, Female #be185d, Other #4b5563).
  </behavior>
  <action>
    RED first: write the three test files above, run them, confirm they fail (route/service missing).
    Then implement. Run `npm install pdfkit --workspace backend` (only after the Task 1 approval). Copy the two woff files from node_modules/@fontsource/abyssinica-sil/files/ (ethiopic-400-normal.woff and latin-400-normal.woff) into backend/assets/fonts/ and commit them (SIL OFL licensed; mention in a short comment at the top of the service). Reason: backend must not depend on a frontend workspace's node_modules, and a default PDF font renders Ge'ez as blanks. pdfkit loads WOFF through fontkit; if registerFont rejects WOFF in the installed version, fall back to the woff2->ttf converted file or `@fontsource` ttf-equivalent and note it in the SUMMARY (do not drop Ge'ez support).
    membersPdf.service.js: export `genderStyle` and `buildMembersPdf(members)` (async, collects pdfkit chunks into a Buffer). Register two fonts ('AbyssinicaLatin', 'AbyssinicaEthiopic'); a small helper picks the font per string by testing for code points U+1200-U+137F (Ethiopic) and uses it for Ge'ez fields, Latin font otherwise. Layout: title 'Family members', generated date, then a table-like row per member (page-break aware, header row repeated per page): Latin name 'Firstname Lastname' + Ge'ez name beneath, mother's Latin + Ge'ez, and a gender cell showing the text label drawn in the gender color (text label always present, color is additive). Missing values render as an en dash. Use the injected plain array of model rows (read via `.get({plain:true})` or property access); never log member data.
    members.routes.js: `membersRouter = express.Router()`; `GET /members.pdf`: `getUserFromRequest(req, models)`, then same mapping as photo.routes.js (requireAuth failure -> 401 JSON {error}, requireFamilyAccess failure -> 403 JSON {error}) BEFORE any DB read of members, so no member data is touched for unauthorized callers; then `models.FamilyMember.findAll({ order: [['lastname','ASC'],['firstname','ASC']] })`, set `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="members.pdf"`, `Cache-Control: no-store`, send the buffer. Wrap in try/catch -> next(err). Do not copy mapAuthFailure by reaching into photo.routes.js internals; if it is not exported, export it from a tiny shared place only if that does not change photo behavior, otherwise duplicate the 10-line function (non-destructive: do not alter photo route behavior).
    Mount in server.js next to the photo router: `app.use('/api', membersRouter)` (no express.json needed). Access rule applied: requireFamilyAccess, identical to the familyMembers query and the ProtectedRoute guard.
    REFACTOR: dedupe the member ordering constant only if it does not touch the existing resolver's behavior.
  </action>
  <verify>
    <automated>npm test --workspace backend -- src/services/membersPdf.service.test.js src/routes/members.pdf.test.js src/resolvers/familyMember.membersList.test.js</automated>
  </verify>
  <done>Unauthenticated list query and unauthenticated PDF request return no member data (tests prove 401 + no %PDF body, and GraphQL error with null data); authorized PDF is a real PDF with embedded Abyssinica font and gender text labels; photo route tests still pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Frontend - /members page, gender chips, PDF download, nav entry</name>
  <files>frontend/src/api/membersPdfClient.js, frontend/src/pages/MembersPage.jsx, frontend/src/pages/MembersPage.test.jsx, frontend/src/App.jsx, frontend/src/components/AppLayout.jsx</files>
  <behavior>
    - Renders a loading state, then one row/card per member from the mocked `familyMembers` graphqlRequest result, showing 'Firstname Lastname' (Latin), Ge'ez full name, mother's Latin and Ge'ez names; null values show an en dash.
    - Each member shows a MUI Chip whose label text is the gender ('Male'/'Female'/'Other') with distinct colors (use theme-compatible values with at least 4.5:1 contrast on the chip background: e.g. outlined chip with the dark gender color text/border from the same palette as the PDF: #1d4ed8, #be185d, #4b5563). Test asserts the text labels are present for each gender (not color-only).
    - Ge'ez text elements carry the Ge'ez-capable font stack (theme already provides "Abyssinica SIL" in FONT_SANS; ensure the Ge'ez spans inherit it or set `lang="am"`/`fontFamily` explicitly).
    - Error from graphqlRequest shows an MUI Alert with the message and a Retry button (same pattern as DetailPage).
    - 'Download PDF' button calls `downloadMembersPdf()`: axios GET '/api/members.pdf' with responseType 'blob' via the same Bearer interceptor pattern as photoClient.js (import `attachAuthHeader` from photoClient.js), then triggers a browser download via a temporary object URL anchor (revoke the URL afterwards). Failure shows an Alert. Test mocks the client module and asserts it is called on click and that a failure message is displayed. Note: a plain `<a href>` cannot send the Authorization header, which is why the blob approach is required.
    - Route: `members` added inside the existing `<ProtectedRoute />` group in App.jsx (no allowedRoles: all linked users and admins). Unauthed redirect is already covered by ProtectedRoute.test.jsx; add one assertion in MembersPage.test or reuse that pattern only if cheap.
    - Nav: 'Members' Button in AppLayout.jsx (copy the existing Button pattern, between 'Detail' and 'Manage', inside the `user ?` branch only).
  </behavior>
  <action>
    RED first: write MembersPage.test.jsx (mock '../api/graphqlClient.js' and '../api/membersPdfClient.js', mock useAuth like FamilyTreePage.test.jsx; MemoryRouter) and run it to confirm failure.
    Implement membersPdfClient.js (`downloadMembersPdf` + `rethrowWithNetworkContext`-style Network Error message mirroring photoClient.js), MembersPage.jsx (`export default function MembersPage()`, handler names with `handle` prefix, query string constant `MEMBERS_QUERY` selecting id firstname lastname gender mothersname geezFirstname geezLastname geezMothersname from `familyMembers`; MUI Table on >=sm and stacked rows are optional - a responsive-friendly MUI Table inside a TableContainer is sufficient), the App.jsx route and AppLayout nav Button. Follow code style: 2 spaces, single quotes, semicolons, explicit `.jsx` import extensions. Do not add i18n. Do not modify the shared theme or existing pages.
    REFACTOR: share the gender color constants between chip styling and nothing else on the backend (the two palettes are intentionally identical values; keep a comment-free but named constant `GENDER_COLORS` in MembersPage.jsx).
  </action>
  <verify>
    <automated>npm test --workspace frontend -- src/pages/MembersPage.test.jsx src/components/ProtectedRoute.test.jsx</automated>
  </verify>
  <done>/members renders all members with Latin+Ge'ez names, gender chips with text + color, working authenticated PDF download, nav link, route behind ProtectedRoute; full `npm test` passes for both workspaces.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client -> GET /api/members.pdf | Bearer token crosses here; the PDF contains the full member roster |
| client -> familyMembers query | Same data via GraphQL |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-qxg-01 | I | GET /api/members.pdf | mitigate | getUserFromRequest + requireFamilyAccess run before any member DB read; 401 unauthenticated, 403 unlinked; tests assert no `%PDF` body |
| T-qxg-02 | I | familyMembers query | mitigate | existing requireFamilyAccess; new test asserts unauthenticated gets null data |
| T-qxg-03 | I | PDF caching | mitigate | `Cache-Control: no-store` on the response so shared caches/proxies do not retain the roster |
| T-qxg-04 | I | Frontend route only | mitigate | route guard is UX only; server enforces on both data paths |
| T-qxg-05 | T | PDF text injection | accept | pdfkit draws text as glyphs, no markup/HTML interpretation; names already length-limited by model |
| T-qxg-SC | T | npm install pdfkit | mitigate | blocking human-verify checkpoint (Task 1) as audit table absent |
</threat_model>

<verification>
- `npm test --workspace backend` and `npm test --workspace frontend` pass (note memory: if the backend suite hangs silently after the banner, MariaDB may be wedged by a killed vitest run; restart it per the known ladder).
- Manual spot check (optional, after execution): download the PDF and confirm Ge'ez names show real glyphs, not boxes.
</verification>

<success_criteria>
Logged-in linked users/admins can view /members and download members.pdf; anonymous callers get nothing from either path; gender is color + text on both screen and PDF; Ge'ez renders via embedded Abyssinica SIL; no existing runtime behavior changed.
</success_criteria>

<output>
Create `.planning/quick/261124-qxg-add-a-members-list-page-accessible-only-/261124-qxg-SUMMARY.md` when done
</output>
