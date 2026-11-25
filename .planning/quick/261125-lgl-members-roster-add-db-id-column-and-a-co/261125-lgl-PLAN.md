---
phase: quick-261125-lgl
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/src/services/membersPdf.service.js
  - backend/src/services/membersPdf.service.test.js
  - frontend/src/pages/MembersPage.jsx
  - frontend/src/pages/MembersPage.test.jsx
autonomous: true
requirements: [QUICK-261125-lgl]
must_haves:
  truths:
    - "Roster page and PDF both show a first ID column with the raw DB id, and a Contact column with email on top and phone below"
    - "Empty values (null, undefined, '', whitespace) render as blank everywhere: no en dash, hyphen or placeholder, including Ge'ez name, mother's name, Ge'ez mother's name"
    - "Depth-first row order, auth, schema and resolvers are unchanged"
    - "Long emails never overlap the Gender column in the PDF and rows never overlap"
  artifacts:
    - path: "backend/src/services/membersPdf.service.js"
      provides: "ID + Contact columns, exported pure helpers memberRowCells and fitFontSize, blank for empty"
    - path: "frontend/src/pages/MembersPage.jsx"
      provides: "ID + Contact columns, query selects email and phone, blank for empty"
  key_links:
    - from: "frontend/src/pages/MembersPage.jsx"
      to: "familyMembersDepthFirst"
      via: "MEMBERS_QUERY selecting email and phone"
      pattern: "email[\\s\\S]*phone"
---

<objective>
Add an ID column and a stacked Contact column (email over phone) to the members roster page and PDF, and replace every en-dash placeholder with blank.

Output: updated MembersPage.jsx and membersPdf.service.js with their tests. No schema, resolver, route, auth or dependency change (email/phone already exposed behind requireFamilyAccess; PDF route already passes full model rows).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/261124-qxg-add-a-members-list-page-accessible-only-/261124-qxg-SUMMARY.md
@.planning/quick/261124-rpj-order-the-members-list-page-and-members-/261124-rpj-SUMMARY.md
@backend/src/services/membersPdf.service.js
@backend/src/services/membersPdf.service.test.js
@frontend/src/pages/MembersPage.jsx
@frontend/src/pages/MembersPage.test.jsx

Decision (phone-only rows): the phone stays on the BOTTOM line and the top line is left blank, so the phone is always in the same vertical position and rows stay aligned. Applies to page and PDF.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: PDF - ID and Contact columns, blank for empty, long-email fit</name>
  <files>backend/src/services/membersPdf.service.js, backend/src/services/membersPdf.service.test.js</files>
  <behavior>
    - memberRowCells(member) returns { id, name, geezName, mother, geezMother, email, phone } as strings, each '' when null/undefined/''/whitespace-only; values trimmed; id is String of the stored id with no padding or prefix (id 7 -> '7'; missing id -> '').
    - memberRowCells never returns '–', '-' or any placeholder (assert for a fully sparse member: every value === '').
    - Name joins first+last with a single space and yields '' when both are empty; a lone first name has no trailing space.
    - Works with plain objects and with Sequelize-style objects exposing get(key).
    - fitFontSize(measure, text, width, start=10, min=6): returns the largest size in 0.5 steps from start down to min at which measure(text, size) <= width; returns min if none fits. (measure is injected so the test needs no PDF doc.)
    - buildMembersPdf still returns a %PDF- buffer for: member with long email (60+ chars, no spaces), phone-only member, email-only member, fully sparse member, empty list, and 120 members (pagination).
  </behavior>
  <action>
    Write the failing tests first in membersPdf.service.test.js (import memberRowCells and fitFontSize; run and confirm RED), then implement in membersPdf.service.js:

    1. Delete the DASH constant. Keep valueOf (already trims and nulls); add and export memberRowCells(member) built on it that returns '' instead of null. Reuse joinNames returning ''.
    2. Columns (A4 portrait, usable width 515 = 595 - 2*MARGIN 40), column gap 11: ID width 36, Name 118, Mother's name 108, Contact 160, Gender 48; 36+118+108+160+48 = 470, plus 4 gaps of 11 = 514. Compute each x cumulatively from MARGIN (x_next = x + width + 11) instead of hard-coding, in order ID, Name, Mother's name, Contact, Gender. Header titles: 'ID', 'Name', "Mother's name", 'Contact', 'Gender'. Header rule line runs MARGIN to MARGIN + 515.
    3. Long emails: the Contact cells never wrap (lineBreak:false, like the other cells). Before drawing email and phone, compute size = fitFontSize((t, s) => doc.fontSize(s).widthOfString(t), text, col.width) using the font chosen by fontFor for that text, then draw at that size with ellipsis:true as a final guard (a 6pt floor with ellipsis guarantees the text stays inside its 160pt column, so it cannot reach Gender). Apply the same fit to the ID cell (width 36) so a large id cannot spill into Name. Make drawCell accept an optional size parameter (default 10) and skip drawing when text is ''.
    4. Rows: email at y, phone at y + 14 (phone stays on the bottom line even if email is blank, per the phone-only decision), Name/Mother cells keep Latin at y and Ge'ez at y + 14, ID and Gender at y. Because nothing wraps, every row occupies exactly ROW_HEIGHT 40, so rows cannot overlap. Keep the existing bottom check and per-page header redraw/page-break logic unchanged. Depth-first order is untouched (members iterate in the order received).
    5. Email and phone use fontFor (Latin font unless Ethiopic characters are present), Ge'ez fields keep the Ethiopic font via fontFor.

    Do not touch members.routes.js or members.pdf.test.js.
  </action>
  <verify>
    <automated>cd /Users/bisrat/Projects/portofolio/backend && npx vitest run src/services/membersPdf.service.test.js src/routes/members.pdf.test.js</automated>
  </verify>
  <done>New tests failed before the change and pass after; route/auth PDF tests pass untouched; no '–' left in membersPdf.service.js (grep -v '^\s*//' | grep -c '–' is 0).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Members page - ID and Contact columns, blank for empty</name>
  <files>frontend/src/pages/MembersPage.jsx, frontend/src/pages/MembersPage.test.jsx</files>
  <behavior>
    - Header cells in order: ID, Name, Mother's name, Contact, Gender.
    - ID cell shows the id string as given (e.g. '1', no padding).
    - Contact cell: email on the top line, phone on the bottom line; email is a link with href mailto:{email}, phone a link with href tel:{phone}. Phone-only member: top line empty, phone on bottom line. Email-only: bottom line empty.
    - A member with every optional field null/''/'   ' renders no '–', '-' or any placeholder text in its row; the cells for Ge'ez name, mother's name, Ge'ez mother's name and contact are empty.
    - MEMBERS_QUERY selects email and phone; rows still render in the received order.
  </behavior>
  <action>
    Update MembersPage.test.jsx first (RED): add id/email/phone to the MEMBERS fixtures (Ada has both; Bo has phone only; Cy has neither, plus one whitespace-only mothersname); replace the 'renders null values as an en dash' test with one asserting the Bo and Cy rows contain no '–' or '-' text and that their Ge'ez/mother paragraphs are empty (check with queryByText('–') null and the row textContent not containing '–'); add tests for the header order, the ID text, the mailto:/tel: hrefs, phone-only placement (phone link is in the second contact line, first line empty), and that graphqlRequest.mock.calls[0][0] contains 'email' and 'phone'. Run and confirm failures.

    Then implement in MembersPage.jsx: remove DASH; add a clean(v) helper returning a trimmed string or ''; joinNames uses clean and returns '' when nothing remains. Add `email` and `phone` to MEMBERS_QUERY. Add the ID TableCell first (`String(member.id)`) and Contact TableCell after Mother's name, before Gender, with two Typography body2 lines: top line renders a MUI Link href mailto only when email is non-empty, bottom line renders a Link href tel only when phone is non-empty; give each line sx minHeight '1.43em' (and the same on the name/mother Typography lines) so blank lines keep rows aligned. Add sx={{ wordBreak: 'break-all' }} on the email line so a long email wraps inside the cell rather than widening it; the existing TableContainer already scrolls horizontally on narrow screens, so the page itself does not scroll sideways. Keep lang="am" and the Abyssinica fontFamily on Ge'ez lines. Import Link from @mui/material. No other file changes.
  </action>
  <verify>
    <automated>cd /Users/bisrat/Projects/portofolio/frontend && npx vitest run src/pages/MembersPage.test.jsx src/pages/AdminLinkMembers.test.jsx</automated>
  </verify>
  <done>Updated tests fail before and pass after; no en-dash literal remains in MembersPage.jsx; full workspace tests (npm test at repo root) still pass.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client -> /graphql, /api/members.pdf | existing requireFamilyAccess gate, unchanged |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-lgl-01 | I | email/phone on page and PDF | accept | Same fields already exposed to the same requireFamilyAccess callers; no auth/schema change; existing 401/403 tests run untouched |
| T-lgl-02 | T | mailto:/tel: href built from data | mitigate | React escapes attributes; values are trimmed strings rendered only as href/text, never as HTML; javascript: cannot arise because the scheme prefix is fixed |
| T-lgl-03 | D | PDF with very long email | mitigate | fitFontSize + ellipsis bound the drawn width; no wrapping, fixed row height |
</threat_model>

<verification>
Backend and frontend vitest runs above pass; grep confirms no '–' placeholder in either source file; git diff shows no change to resolvers, schema, routes, auth tests.
</verification>

<success_criteria>
Page and PDF show ID, Name, Mother's name, Contact (email over phone), Gender; empty values are blank everywhere; order, auth and other pages unchanged; no new dependencies.
</success_criteria>

<output>
Create `.planning/quick/261125-lgl-members-roster-add-db-id-column-and-a-co/261125-lgl-SUMMARY.md` when done
</output>
