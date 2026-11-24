# Quick 261124-qxg: Members list page with PDF download

Logged-in /members page (Latin + Ge'ez names, mother's name, gender chip with text) and an auth-guarded GET /api/members.pdf using pdfkit with embedded Abyssinica SIL.

## Commits
- 91ee7c7 backend: route, service, fonts, tests, pdfkit
- 5103c9f frontend: page, client, route, nav

## Decisions
- pdfkit pinned to exactly 0.20.2 (user chose it over the four-day-old 0.21.0 at the dependency checkpoint; MIT, foliojs/pdfkit).
- WOFF loaded directly by pdfkit/fontkit; no converter or fallback needed.
- Route duplicates the 10-line mapAuthFailure instead of touching photo.routes.js.
- Route catch returns a generic 500 JSON body, never the underlying error, so member data cannot leak on failure.

## Test-first
Red runs observed: backend service and route test files failed (module not found) before implementation; frontend MembersPage.test.jsx failed (import not resolved) before implementation. The resolver auth tests exercise existing behavior, so they were green on first correct run (one initial failure was my own wrong assertion: non-null list makes `data` null, fixed in the test).

## Deviations
None to the plan. Tests and implementation for each task are in one commit rather than separate RED/GREEN commits.

## Not verified
Ge'ez glyphs rendering visually in the PDF (tests only assert the Abyssinica font is embedded).
