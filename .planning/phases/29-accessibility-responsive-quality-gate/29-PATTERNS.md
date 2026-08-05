# Phase 29: Accessibility, Responsive & Quality Gate - Pattern Map

**Mapped:** 2026-08-05
**Files analyzed:** 13 (new + modified)
**Analogs found:** 12 / 13 (1 file — `theme.contrast.test.js` — has no direct in-repo analog; pattern comes from RESEARCH.md's own worked example, cited below)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `frontend/src/components/person/PersonCard.test.jsx` (MODIFY: add axe + tab-order tests) | test | request-response (UI) | itself (existing file, same file) | exact — extend in place |
| `frontend/src/components/person/GenerationGrid.test.jsx` (MODIFY: add axe + breakpoint-CSS test) | test | request-response (UI) | itself | exact — extend in place |
| `frontend/src/components/person/PersonSearch.test.jsx` (MODIFY: add axe + `baseElement` portal scan + tab-order) | test | request-response (UI) | itself | exact — extend in place |
| `frontend/src/pages/DetailPage.test.jsx` (MODIFY: add axe scan) | test | request-response (UI) | itself | exact — extend in place |
| `frontend/src/theme.contrast.test.js` (NEW) | test (pure data, no DOM) | transform (color math) | none in-repo; pattern from RESEARCH.md D-03 worked example + `frontend/src/utils/genderTheme.js` (source of the tokens under test) | role-match only |
| `frontend/test/setup.js` (MODIFY: add `expect.extend(toHaveNoViolations)`) | config | — | itself | exact — extend in place |
| `frontend/package.json` (MODIFY: add `jest-axe`, `wcag-contrast` devDependencies) | config | — | itself | exact — extend in place |
| `backend/test/dbEngine.js` (NEW) | utility (test helper) | request-response (raw SQL) | `backend/src/resolvers/verifyEmail.test.js`'s `rawConnection()` (lines 28-39) + `backend/test/guard.js` (module shape/style) | role-match, strong |
| `backend/src/resolvers/verifyEmail.test.js` (MODIFY: add `ctx.skip` guard to VERIFY-04 test only) | test | event-driven (concurrency) | itself | exact — extend in place |
| `backend/src/services/familyMember.dedup.test.js` (MODIFY: add `ctx.skip` guard to REL-06 test only) | test | event-driven (concurrency) | itself | exact — extend in place |
| `KNOWN-ISSUES.md` (MODIFY: add MariaDB-vs-MySQL entry) | doc | — | itself (existing "Reset-token exposure" entry, lines 10-16) | exact — mirror entry format |
| `.planning/phases/29-.../29-HUMAN-UAT.md` (NEW) | doc (test artifact) | — | `.planning/phases/27-.../27-HUMAN-UAT.md` and `26-.../26-HUMAN-UAT.md` | exact |
| `frontend/src/components/person/PersonCard.jsx` (MODIFY: contrast fixes + dead-CSS decision) | component | request-response (UI) | itself | exact — extend in place |

## Pattern Assignments

### `frontend/src/components/person/PersonCard.test.jsx` (test, request-response)

**Analog:** itself — `frontend/src/components/person/PersonCard.test.jsx` (269 lines, already read in full)

**Existing imports/render-helper pattern to extend (lines 1-35):**
```javascript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PersonCard from './PersonCard.jsx';

vi.mock('../../api/photoClient.js', () => ({
  fetchMemberPhotoBlob: vi.fn().mockRejectedValue(new Error('not needed in this test'))
}));

const BASE_MEMBER = {
  id: '1', fullname: 'Ada Lovelace', gender: 'Female', isAlive: true,
  geezFullname: null, photoUrl: null, children: [], spouses: [], canEdit: false
};

function renderCard(overrides = {}) {
  const props = { member: BASE_MEMBER, role: 'Head', expanded: false, onExpand: vi.fn(), onEdit: vi.fn(), ...overrides };
  const utils = render(<PersonCard {...props} />);
  return { ...props, ...utils };
}
```

**New axe pattern to add (per RESEARCH.md D-02):**
```javascript
import { axe } from 'jest-axe';
// jest-axe's toHaveNoViolations() matcher is registered globally in
// frontend/test/setup.js (D-02) — no per-file expect.extend needed.

it('has no axe accessibility violations (canEdit + expandable + Add-menu state)', async () => {
  const { container } = renderCard({
    member: { ...BASE_MEMBER, canEdit: true, children: [{ id: '2' }] },
    onAddRelative: vi.fn()
  });
  const results = await axe(container);
  expect(results).toHaveNoViolations();
}, 10000); // axe scans can exceed the default 5s Vitest timeout
```

**New tab-order pattern to add (RESEARCH.md D-02, `userEvent.setup()` v14 idiom — genuinely new to this codebase; existing tests use static `userEvent.click(...)`):**
```javascript
it('tabs from Edit to Add to the expand control in DOM order', async () => {
  const user = userEvent.setup();
  renderCard({ member: { ...BASE_MEMBER, canEdit: true, children: [{ id: '2' }] }, onAddRelative: vi.fn() });

  await user.tab();
  expect(screen.getByRole('button', { name: 'Edit Ada Lovelace' })).toHaveFocus();
  await user.tab();
  expect(screen.getByLabelText(/add relative to ada lovelace/i)).toHaveFocus();
  await user.tab();
  expect(screen.getByRole('button', { name: /children of Ada Lovelace/i })).toHaveFocus();
});
```

**Known landmine to test explicitly (RESEARCH.md Pitfall 1 — confirmed dead CSS):** the root `Paper` (`PersonCard.jsx` lines 88-108) has `'&:focus-visible': {...}` but no `tabIndex`/interactive role, so it can never receive focus via Tab. Add an assertion proving the `Paper` is *not* reachable via Tab (documents current behavior / will flip green once the planner's fix — remove the dead CSS, per the two options in RESEARCH.md Pitfall 1 — lands).

---

### `frontend/src/components/person/GenerationGrid.test.jsx` (test, request-response)

**Analog:** itself — `frontend/src/components/person/GenerationGrid.test.jsx` (141 lines, already read in full)

**Existing render-helper pattern (lines 1-37):**
```javascript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GenerationGrid from './GenerationGrid.jsx';

function makePerson(id, overrides = {}) {
  return { id, fullname: `Person ${id}`, gender: 'Female', isAlive: true, geezFullname: null,
    photoUrl: null, children: [], spouses: [], canEdit: false, ...overrides };
}

function renderGrid(overrides = {}) {
  const props = { people: [makePerson('1'), makePerson('2')], role: 'Child', expandedId: null,
    onExpand: vi.fn(), onEdit: vi.fn(), loadingId: null, ...overrides };
  const utils = render(<GenerationGrid {...props} />);
  return { ...props, ...utils };
}
```

**New axe pattern (mirrors PersonCard.test.jsx's, applied at grid level):**
```javascript
import { axe } from 'jest-axe';

it('has no axe accessibility violations for a 3-card generation row', async () => {
  const { container } = renderGrid({ people: [makePerson('1'), makePerson('2'), makePerson('3')] });
  const results = await axe(container);
  expect(results).toHaveNoViolations();
}, 10000);
```

**New breakpoint-CSS-presence pattern (D-04, jsdom-feasible mobile-layout leg — verbatim from RESEARCH.md D-04, confirmed against `@mui/material/Grid/Grid.js` + `@mui/system/createBreakpoints`):**
```javascript
it('generates real @media rules for the sm (600px) and md (900px) breakpoints used by the grid', () => {
  renderGrid({ people: [makePerson('1'), makePerson('2'), makePerson('3')] });
  const styleText = Array.from(document.querySelectorAll('style')).map((s) => s.textContent).join('\n');
  expect(styleText).toMatch(/@media \(min-width:\s*600px\)/);
  expect(styleText).toMatch(/@media \(min-width:\s*900px\)/);
});
```

---

### `frontend/src/components/person/PersonSearch.test.jsx` (test, request-response)

**Analog:** itself — `frontend/src/components/person/PersonSearch.test.jsx` (102 lines, already read in full)

**Existing imports/mock/typing pattern (lines 1-32, 55-65):**
```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PersonSearch from './PersonSearch.jsx';

vi.mock('../../api/graphqlClient.js', () => ({ graphqlRequest: vi.fn() }));
vi.mock('../../api/photoClient.js', () => ({
  fetchMemberPhotoBlob: vi.fn().mockRejectedValue(new Error('not needed in this test'))
}));
import { graphqlRequest } from '../../api/graphqlClient.js';

const MEMBER = { id: '7', fullname: 'Byron Lovelace', geezFullname: 'ባይሮን ላቭሌስ', gender: 'Male',
  birthdate: '1998-04-12', photoUrl: null, mothersname: 'Ada Byron' };

// Existing typing pattern to reuse for opening the suggestion popper:
const input = screen.getByLabelText('Search by name');
await userEvent.click(input);
await userEvent.type(input, 'Byron');
```

**New axe pattern — MUST use `baseElement`, not `container`, because MUI `Autocomplete`'s listbox popper is portaled to `document.body` (RESEARCH.md D-02 MUI-specific caveat, confirmed via jest-axe README):**
```javascript
import { axe } from 'jest-axe';

it('has no axe accessibility violations with the suggestion popper open', async () => {
  graphqlRequest.mockResolvedValue({ searchFamilyMembers: [MEMBER] });
  const { baseElement } = render(<PersonSearch onSelect={vi.fn()} />);
  const input = screen.getByLabelText('Search by name');
  await userEvent.click(input);
  await userEvent.type(input, 'Byron');
  await screen.findByText('Byron Lovelace');

  const results = await axe(baseElement); // baseElement, not container — portal
  expect(results).toHaveNoViolations();
}, 10000);
```

**New tab-order pattern for the Autocomplete (D-02):**
```javascript
it('tabs into the search input as a normal focusable field', async () => {
  const user = userEvent.setup();
  render(<PersonSearch onSelect={vi.fn()} />);
  await user.tab();
  expect(screen.getByLabelText('Search by name')).toHaveFocus();
});
```

---

### `frontend/src/pages/DetailPage.test.jsx` (test, request-response)

**Analog:** itself — `frontend/src/pages/DetailPage.test.jsx` (1004 lines; only the header/render-helper region read — lines 1-100 — plus the full file structure via the `renderPage()`/fixture pattern already in context)

**Existing render-helper pattern (lines 1-90):**
```javascript
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import DetailPage from './DetailPage.jsx';

vi.mock('../api/graphqlClient.js', () => ({ graphqlRequest: vi.fn() }));
vi.mock('../api/photoClient.js', () => ({
  fetchMemberPhotoBlob: vi.fn().mockRejectedValue(new Error('not needed in this test'))
}));

function renderPage() {
  return render(
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <MemoryRouter initialEntries={['/detail']}>
        <DetailPage />
      </MemoryRouter>
    </LocalizationProvider>
  );
}
```

**New axe pattern — page-level scan after the head card has loaded (use `baseElement` since `EditMemberDialog`/`AddRelativeDialog`/MUI `Menu` are all portal-mounted, unconditionally rendered per Phase 28's `28-04` revision):**
```javascript
import { axe } from 'jest-axe';

it('has no axe accessibility violations once the head card has loaded', async () => {
  graphqlRequest.mockResolvedValueOnce({ familyHead: { id: '1' } }).mockResolvedValueOnce({ familyMember: HEAD });
  const { baseElement } = renderPage();
  await screen.findByTestId('person-card-1');

  const results = await axe(baseElement);
  expect(results).toHaveNoViolations();
}, 10000);
```
D-06 audit-boundary reminder: this scan is on `/detail`'s own surfaces only — do not extend axe coverage into `EditMemberDialog`/`AddRelativeDialog` internals (out of scope); if `axe(baseElement)` flags something *inside* those dialogs, note it as a deferred follow-up per CONTEXT.md D-06, don't fix it here.

---

### `frontend/src/theme.contrast.test.js` (test, transform — pure data, no DOM)

**Analog:** none in-repo (first contrast test in the codebase) — pattern is RESEARCH.md's own worked D-03 example, grounded in the real tokens read from `frontend/src/theme.js` and `frontend/src/utils/genderTheme.js` (both read in full above).

**Real tokens this test imports (confirmed exact values):**
```javascript
// frontend/src/theme.js
export const colors = {
  ink: '#0f172a', slate: '#64748b', bg: '#f5f6fb', paper: '#ffffff',
  success: '#10b981', /* ... */
};

// frontend/src/utils/genderTheme.js
export const MALE_TINT = '#3b82f6';
export const FEMALE_TINT = '#ec4899';
export function genderMeta(gender) { /* returns { label, tint } */ }
```

**Card background composition to mirror exactly (from `PersonCard.jsx` line 97 — `bgcolor: \`${genderTint}14\`` on a page sitting on `colors.bg`):**
```javascript
// PersonCard.jsx (source of the composite bg being tested):
sx={{ bgcolor: `${genderTint}14`, ... }}   // '14' = alpha hex byte (~7.8%)
```

**Recommended test file shape (from RESEARCH.md D-03, verbatim):**
```javascript
import { describe, it, expect } from 'vitest';
import contrast from 'wcag-contrast';
import { colors } from './theme.js';
import { MALE_TINT, FEMALE_TINT } from './utils/genderTheme.js';

function compositeOverPage(hexFg, alphaByte, hexBg = colors.bg) { /* alpha-composite fg over bg */ }

describe('WCAG AA contrast — /detail surfaces', () => {
  it('fullname (ink) on the male/female/other card background meets 4.5:1', () => { /* PASS ~15:1 */ });
  it("Ge'ez name text (genderTint) on its own card background meets 4.5:1", () => {
    // CONFIRMED FAIL as of this research: male 3.13:1, female 2.97:1 — real fix required
  });
  it('role label (slate) on the card background meets 4.5:1', () => {
    // CONFIRMED FAIL as of this research: 4.01-4.05:1 — real fix required
  });
  it('"Living"/"Deceased" chip text meets 4.5:1 against the card background', () => {
    // CONFIRMED FAIL as of this research: 2.16:1 (card) / 2.54:1 (white) — real fix required
  });
});
```

**TDD shape flagged by research (aligns with user's TDD memory note):** write this file FIRST against current token values (red on the 3 known-failing pairs), THEN fix `PersonCard.jsx` (below) until green. Do not skip straight to fixing without the red baseline.

---

### `frontend/test/setup.js` (config)

**Analog:** itself — `frontend/test/setup.js` (24 lines, read in full)

**Existing shape to extend (whole file):**
```javascript
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

window.matchMedia = window.matchMedia || function matchMedia(query) { /* ... */ };

afterEach(() => {
  localStorage.clear();
  cleanup();
});
```

**Addition (RESEARCH.md D-02, jest-axe README):**
```javascript
import { toHaveNoViolations } from 'jest-axe';
expect.extend(toHaveNoViolations);
```
Registering here (not per-test-file) means `toHaveNoViolations()` is globally available — no `expect.extend` boilerplate needed in `PersonCard.test.jsx`/`GenerationGrid.test.jsx`/`PersonSearch.test.jsx`/`DetailPage.test.jsx`.

---

### `backend/test/dbEngine.js` (NEW utility)

**Analog:** `backend/src/resolvers/verifyEmail.test.js`'s `rawConnection()` helper (lines 25-39, read in full) for the connection-construction pattern; `backend/test/guard.js` (14 lines, read in full) for this repo's convention of a small, single-purpose, named-export helper module living in `backend/test/`.

**`guard.js` — the sibling-module shape to mirror (whole file, confirms the "small named-export helper in `backend/test/`" convention):**
```javascript
import { env } from '../src/config/env.js';

export function assertTestDatabase() {
  const isTestEnv = env.nodeEnv === 'test';
  const isTestDbName = /_test$/.test(env.database.name);
  if (!isTestEnv || !isTestDbName) {
    throw new Error(`Refusing to run tests: expected NODE_ENV=test and DB_NAME ending in "_test", ...`);
  }
}
```

**`verifyEmail.test.js`'s `rawConnection()` — the exact connection-construction pattern to reuse (lines 25-39):**
```javascript
import mysql from 'mysql2/promise';
import { env } from '../config/env.js';

async function rawConnection() {
  const conn = await mysql.createConnection({
    host: env.database.host,
    port: env.database.port,
    user: env.database.user,
    password: env.database.password,
    database: env.database.name
  });
  await conn.query('SET SESSION innodb_lock_wait_timeout = 10');
  return conn;
}
```

**Recommended new file (RESEARCH.md's own worked D-01 example, path adjusted for `backend/test/` — one level shallower than `env/config.js` than the resolver file, so the relative import differs: `../src/config/env.js`, matching `guard.js`'s own relative path):**
```javascript
import mysql from 'mysql2/promise';
import { env } from '../src/config/env.js';

export async function isMariaDB() {
  const conn = await mysql.createConnection({
    host: env.database.host,
    port: env.database.port,
    user: env.database.user,
    password: env.database.password,
    database: env.database.name
  });
  try {
    const [[row]] = await conn.query('SELECT VERSION() AS version');
    return /mariadb/i.test(row.version);
  } finally {
    await conn.end();
  }
}
```

**Note for the planner (RESEARCH.md, confirmed by direct inspection):** CONTEXT.md's cited analog `familyMember.queryCount.test.js` does NOT contain a reusable engine-detection pattern — it has a `countQueries()` SQL-statement-counting helper, unrelated to `SELECT VERSION()` engine detection. Treat `dbEngine.js` as genuinely new code, not an extraction from that file.

---

### `backend/src/resolvers/verifyEmail.test.js` (MODIFY — engine-guard skip)

**Analog:** itself (240 lines, read in full). Target test: `'lets two users racing to verify simultaneously each keep a usable session, with exactly one becoming ADMIN (VERIFY-04)'` (lines 162-222).

**Existing test signature to extend (line 162):**
```javascript
it('lets two users racing to verify simultaneously each keep a usable session, with exactly one becoming ADMIN (VERIFY-04)', async () => {
  const future = new Date(Date.now() + 60 * 60 * 1000);
  const racerA = await createTestUser({ /* ... */ });
  // ...unchanged body...
});
```

**Minimal-diff pattern to apply — add `ctx` param + one `ctx.skip(...)` line at the top of the body, per RESEARCH.md's `context.skip(condition, reason)` recommendation (NOT `it.skipIf` — see RESEARCH.md Pitfall 3, async condition):**
```javascript
import { isMariaDB } from '../../test/dbEngine.js';

it('lets two users racing to verify simultaneously each keep a usable session, with exactly one becoming ADMIN (VERIFY-04)', async (ctx) => {
  ctx.skip(
    await isMariaDB(),
    'MariaDB does not implement the MySQL 8.4 SELECT … FOR UPDATE lock-wait semantics this test asserts ' +
    '(MariaDB raises a Sequelize optimistic-version error instead). Runs and must pass on CI (MySQL 8.4). ' +
    'See KNOWN-ISSUES.md.'
  );

  const future = new Date(Date.now() + 60 * 60 * 1000);
  // ...rest of existing body, unchanged...
});
```
Only this one `it(...)` gets the guard — the other 5 tests in this file (including the closely-related "serializes a concurrent verifier..." test at line 109, which is NOT the CONTEXT-named MariaDB failure) stay unguarded and must keep passing on both engines.

---

### `backend/src/services/familyMember.dedup.test.js` (MODIFY — engine-guard skip)

**Analog:** itself (164 lines, read in full). Target test: `'(D-10 resolver-path TOCTOU, CR-01) detects a duplicate even when a plain read earlier in the SAME transaction froze the REPEATABLE READ snapshot...'` (lines 113-147) — this is CONTEXT's REL-06.

**Identical minimal-diff pattern (mirrors the verifyEmail.test.js change above):**
```javascript
import { isMariaDB } from '../../test/dbEngine.js';

it('(D-10 resolver-path TOCTOU, CR-01) detects a duplicate even when a plain read earlier in the SAME transaction froze the REPEATABLE READ snapshot — mirrors addChild/addSibling resolvers findByPk-ing the target before the guard runs', async (ctx) => {
  ctx.skip(
    await isMariaDB(),
    'MariaDB does not implement the MySQL 8.4 SELECT … FOR UPDATE lock-wait semantics this test asserts ' +
    '(MariaDB raises a Sequelize optimistic-version error instead). Runs and must pass on CI (MySQL 8.4). ' +
    'See KNOWN-ISSUES.md.'
  );

  const mother = await models.FamilyMember.create({ firstname: 'Almaz', lastname: 'Kidane', gender: 'Female' });
  // ...rest of existing body, unchanged...
});
```
Only this one test in this file gets the guard — the other 6 tests in the `describe('addChild REL-06 dedup guard (D-08/D-09/D-10/D-11)', ...)` block (including the near-identical-looking "(D-10 TOCTOU proof) two genuinely concurrent addChild calls..." at line 72, which is a DIFFERENT, engine-agnostic test) stay unguarded.

---

### `KNOWN-ISSUES.md` (MODIFY — doc)

**Analog:** itself — the existing "Reset-token exposure" entry (lines 10-16, read in full), which defines this doc's `## Title` / `- **Location:**` / `- **Expected:**` / `- **Actual:**` / `- **Severity:**` / `- **Documented by test:**` format.

**Existing entry to mirror exactly (whole file's only entry today):**
```markdown
## Reset-token exposure in `requestPasswordReset` response

- **Location:** `backend/src/resolvers/user.resolver.js:48-61`
- **Expected:** The password reset token is delivered only via a verified email channel, never included in the API response.
- **Actual:** The `requestPasswordReset` mutation returns `resetToken` directly in the `PasswordResetPayload` — any caller who knows a user's email address can retrieve the token and call `resetPassword` to take over that account.
- **Severity:** High
- **Documented by test:** `backend/src/resolvers/resetPassword.test.js` — `requestPasswordReset` suite
```

**New entry to append (RESEARCH.md D-01's own drafted text — use verbatim, it already matches the format above):**
```markdown
## MariaDB-only skip on two concurrency-locking tests

- **Location:** `backend/src/resolvers/verifyEmail.test.js` (VERIFY-04), `backend/src/services/familyMember.dedup.test.js` (REL-06)
- **Expected:** Both tests pass on any supported MySQL-compatible engine.
- **Actual:** Both assert `SELECT ... FOR UPDATE` lock-wait interleaving that holds under MySQL 8.4 (CI's engine) but not under local MariaDB, which surfaces a Sequelize optimistic-version `"Record has changed since last read"` error instead. Both tests auto-detect the engine via `SELECT VERSION()` (`backend/test/dbEngine.js`) and skip themselves, with a visible reason, when running on MariaDB. They still run and pass on CI (MySQL 8.4).
- **Severity:** N/A — not a product defect, a test-infrastructure limitation.
- **Documented by test:** the two tests named above (see their inline skip reason).
```
Note: this doc's own header text ("These issues are intentionally **not fixed** in this milestone...") is scoped to the original security-bug-tracking purpose of the file (v1.0 milestone) — the new entry is a different category (test-infra limitation, not a security bug); append it as an additional `##` section without altering the file's existing intro paragraph.

---

### `.planning/phases/29-accessibility-responsive-quality-gate/29-HUMAN-UAT.md` (NEW doc)

**Analog:** `.planning/phases/27-descendant-navigation-performance/27-HUMAN-UAT.md` (40 lines, read in full) and `.planning/phases/26-detail-page-search-initial-load/26-HUMAN-UAT.md` (37 lines, read in full) — both establish the exact frontmatter + section format.

**Frontmatter + structure to mirror exactly (from `27-HUMAN-UAT.md`, whole file):**
```markdown
---
status: partial
phase: 27-descendant-navigation-performance
source: [27-VERIFICATION.md, 27-REVIEW.md]
started: "2026-08-04T06:35:00Z"
updated: "2026-08-04T06:35:00Z"
---

## Current Test

[awaiting human testing]

## Tests

### 1. Responsive grid + apex connector visual check
expected: On a real browser, expanding a person reveals children in a responsive per-generation grid with a group-level inverted-V (apex) connector; layout reflows cleanly across mobile/desktop breakpoints. jsdom cannot assert real CSS layout, so the automated suite deliberately skips pixel-level checks.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
```

**Content to adapt for Phase 29 (per CONTEXT.md D-04 + RESEARCH.md's exact checklist items):**
- Item 1: 360px width — single-column card stack, no horizontal scroll/truncation, 44px+ touch targets on search bar + suggestion dropdown.
- Item 2: 768px width — precisely "2 cards per row" (NOT 3, NOT 1 — per RESEARCH.md's confirmed `sm:600/md:900` breakpoint arithmetic: 768px is `≥600px, <900px` so only `sm: 6` applies), apex connector + spouse dashed-connector legibility.
- Item 3: keyboard-only pass at both widths — Tab through Edit/Add/Expand and confirm a real *visible* focus ring paints (the one thing RTL's `toHaveFocus()` cannot prove — see RESEARCH.md D-02 jsdom caveat).
- `phase: 29-accessibility-responsive-quality-gate`, `source: [29-VERIFICATION.md, 29-REVIEW.md]` (once those exist), `total: 3` in Summary.

---

### `frontend/src/components/person/PersonCard.jsx` (MODIFY — contrast fixes + dead-CSS decision)

**Analog:** itself — `frontend/src/components/person/PersonCard.jsx` (197 lines, read in full).

**Three confirmed-failing spots to fix (exact current lines):**

1. **Ge'ez name text** (line 171) — `color: genderTint` directly on the translucent card bg. Confirmed FAIL: male 3.13:1, female 2.97:1 (both under 4.5:1; the 18px/700 size is ~0.67px under the WCAG large-text bold cutoff per RESEARCH.md Assumption A3, so 4.5:1 is the applicable threshold either way):
   ```javascript
   <Typography sx={{ fontSize: 18, fontWeight: 700, lineHeight: 1.3, color: genderTint }} lang={geez.lang} noWrap>
   ```

2. **Role label** (line 177) — `color: colors.slate` on the card bg. Confirmed FAIL: 4.01-4.05:1 (just under 4.5:1, too small at 12px to qualify as large text):
   ```javascript
   <Typography sx={{ fontSize: 12, fontWeight: 700, lineHeight: 1.4, letterSpacing: '0.04em', color: colors.slate }}>
   ```

3. **Living/Deceased Chip** (line 182) — outlined variant renders `success.main` at full opacity as text (confirmed via `@mui/material/Chip/Chip.js` line 280 — only the border gets alpha). Confirmed FAIL: as low as 2.16:1:
   ```javascript
   <Chip size="small" label={isAlive ? 'Living' : 'Deceased'} color={isAlive ? 'success' : 'default'} variant="outlined" />
   ```

RESEARCH.md's own guidance (Open Question 3): prefer fixing via text weight/size or the card's background opacity over changing `MALE_TINT`/`FEMALE_TINT` themselves (those constants are shared with `/family` via `genderTheme.js`, and darkening them risks an unplanned visual change outside this phase's D-06 audit boundary). This is a planner/executor decision point, not a locked research recommendation — flag it explicitly in the plan.

**Dead-CSS decision point (line 106, RESEARCH.md Pitfall 1 — confirmed unreachable):**
```javascript
'&:focus-visible': { outline: `2px solid ${colors.primary}`, outlineOffset: '2px' }
```
on the root `Paper` (no `tabIndex`, no interactive role → never in tab order, this rule can never fire). Per CONTEXT.md's phase-boundary framing ("MODIFIED PersonCard.jsx (dead `&:focus-visible` on non-focusable Paper — planner decision)"), the planner should pick: (a) remove it (safest — buttons already have native focus-visible via the browser), or (b) wire up `tabIndex={0}` + a role to make the whole card genuinely focusable (larger scope-creep risk, flag if chosen).

---

## Shared Patterns

### axe-core zero-violations scanning (D-02)
**Source:** `frontend/test/setup.js` (registration) + jest-axe README (via RESEARCH.md, WebFetch-sourced)
**Apply to:** `PersonCard.test.jsx`, `GenerationGrid.test.jsx`, `PersonSearch.test.jsx`, `DetailPage.test.jsx`
```javascript
// setup.js (once):
import { toHaveNoViolations } from 'jest-axe';
expect.extend(toHaveNoViolations);

// per test file:
import { axe } from 'jest-axe';
const results = await axe(container); // or baseElement if portals are open (Menu/Autocomplete/Dialogs)
expect(results).toHaveNoViolations();
```
**Critical caveat (jest-axe README, confirmed):** jsdom `color-contrast` checks are disabled by jest-axe by default — a fully-green axe suite proves nothing about contrast. `theme.contrast.test.js` is the only code-enforced coverage for SC-2; treat as a separate, independently-required gate (RESEARCH.md Pitfall 2).

### `userEvent.setup()` v14 tab-order idiom (new to this codebase)
**Source:** `@testing-library/user-event@14.6.1` (already pinned), RESEARCH.md D-02
**Apply to:** any new focus-order/visible-focus test in `PersonCard.test.jsx`/`PersonSearch.test.jsx`
```javascript
const user = userEvent.setup();
await user.tab();
expect(someElement).toHaveFocus();
```
Existing tests in this repo call the static `userEvent.click(...)` (no `.setup()`) — this is a legitimate new pattern, not a deviation to avoid.

### Vitest `context.skip(condition, reason)` for async, per-test conditional skips (D-01)
**Source:** RESEARCH.md, confirmed against `@vitest/runner`'s shipped `.d.ts` and vitest.dev docs (available since Vitest 3.1, present in installed 4.1.10)
**Apply to:** `verifyEmail.test.js` (VERIFY-04 test only), `familyMember.dedup.test.js` (REL-06 test only)
```javascript
it('name', async (ctx) => {
  ctx.skip(await isMariaDB(), 'reason string — shown in reporter output');
  // ...rest of test body unchanged...
});
```
Do NOT use `it.skipIf`/`describe.skipIf` (requires a synchronous condition at collection time — see RESEARCH.md Pitfall 3).

### Backend test-DB reset / GraphQL execution harness (unaffected, but underlies both target test files)
**Source:** `backend/test/helpers.js` (57 lines, read in full)
**Apply to:** context only — no changes needed, both `verifyEmail.test.js` and `familyMember.dedup.test.js` already `beforeEach(resetTables)` and either call `graphql(...)` (Apollo `executeOperation` wrapper, lines 16-26) or call service functions directly.

### KNOWN-ISSUES.md entry format
**Source:** `KNOWN-ISSUES.md` lines 10-16 (existing "Reset-token exposure" entry)
**Apply to:** the new MariaDB-skip entry — see full text under Pattern Assignments above.

### HUMAN-UAT.md frontmatter + section format
**Source:** `.planning/phases/26-.../26-HUMAN-UAT.md`, `.planning/phases/27-.../27-HUMAN-UAT.md`
**Apply to:** `29-HUMAN-UAT.md` — see full structure under Pattern Assignments above.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `frontend/src/theme.contrast.test.js` | test (pure data) | transform | No pure-data/no-DOM test file exists yet in this codebase to mirror structurally (every existing frontend test renders a component). Use RESEARCH.md's own D-03 worked example (grounded in the real `theme.js`/`genderTheme.js` tokens, both read in full above) as the template instead of an in-repo analog. |

## Metadata

**Analog search scope:** `frontend/src/components/person/`, `frontend/src/pages/`, `frontend/src/theme.js`, `frontend/src/utils/genderTheme.js`, `frontend/test/`, `backend/test/`, `backend/src/resolvers/verifyEmail.test.js`, `backend/src/services/familyMember.dedup.test.js`, `.planning/phases/26-*/`, `.planning/phases/27-*/`, `KNOWN-ISSUES.md`
**Files scanned/read in full:** `PersonCard.jsx`, `PersonCard.test.jsx`, `GenerationGrid.jsx`, `GenerationGrid.test.jsx`, `PersonSearch.jsx`, `PersonSearch.test.jsx`, `DetailPage.jsx`, `DetailPage.test.jsx` (partial — header + render helper, file is 1004 lines), `theme.js`, `genderTheme.js`, `verifyEmail.test.js`, `familyMember.dedup.test.js`, `backend/test/helpers.js`, `backend/test/guard.js`, `KNOWN-ISSUES.md`, `27-HUMAN-UAT.md`, `26-HUMAN-UAT.md` (header), `frontend/test/setup.js`, `frontend/vitest.config.js`, `frontend/package.json`, `Login.test.jsx` (userEvent convention cross-check)
**Pattern extraction date:** 2026-08-05
