# Phase 35: Post-Verify Landing & Invited-Path Copy - Pattern Map

**Mapped:** 2026-09-09
**Files analyzed:** 12
**Analogs found:** 12 / 12 (all either have a direct codebase analog or are pure copy-only self-edits with no external analog needed)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `frontend/src/pages/AwaitingApproval.jsx` (CREATE) | component (page) | transform (static render, zero I/O) | `frontend/src/pages/VerifyEmail.jsx` (AuthShell + footer shape) | exact |
| `frontend/src/pages/verifyLanding.composed.test.jsx` (CREATE) | test | request-response (mocked network + real routing) | `frontend/src/pages/VerifyEmail.test.jsx` (harness minus `useNavigate` mock) + `frontend/src/pages/Pending.test.jsx` (multi-route sentinel pattern) | exact |
| `frontend/src/pages/AwaitingApproval.test.jsx` (CREATE, optional) | test | transform | `frontend/src/pages/Pending.test.jsx` (simple `render` + `screen.getByText` unit shape) | role-match |
| `frontend/src/pages/VerifyEmail.jsx` (MODIFY line 25) | component (page) | request-response | self (single-line destination string edit) | exact — self-edit |
| `frontend/src/pages/VerifyEmail.test.jsx` (MODIFY ~line 65-76) | test | request-response | self (single assertion + description edit) | exact — self-edit |
| `frontend/src/pages/Pending.jsx` (MODIFY, copy only) | component (page) | request-response (session-derived render + redirect guards) | self (title/body string edit only) | exact — self-edit |
| `frontend/src/pages/Pending.test.jsx` (MODIFY ~34-38, ~50-54) | test | request-response | self (string assertion updates only) | exact — self-edit |
| `frontend/src/pages/Register.jsx` (MODIFY lines 310-313 only) | component (page) | CRUD (form submit + success-state render) | self, using lines 211-215 (correct self-registration paragraph) as the tone/shape reference for the sibling invited-path paragraph | exact — self-edit |
| `frontend/src/pages/Register.test.jsx` | test | CRUD | **no change required** — verified below | n/a |
| `frontend/src/App.jsx` (MODIFY, add one `<Route>`) | route | request-response | self (existing `verify-email`/`pending` route entries are the template) | exact — self-edit |
| `backend/src/services/mailer.js` (MODIFY 2 functions, 4 strings) | service | transform (string template construction) | self, using `sendAccountApprovedEmail` (lines 82-94) as the "honest, already-true statement" tone reference | exact — self-edit |
| `backend/src/services/mailer.test.js` (MODIFY + ADD describe block) | test | transform | existing `sendInvitationEmail` describe (lines 133-151) to extend; existing `sendAccountRejectedEmail`/`sendRegistrationAttemptEmail` describes (lines 83-92, 153-164) as the shape for the brand-new `sendVerificationEmail` describe | exact |

## Pattern Assignments

### `frontend/src/pages/AwaitingApproval.jsx` (component, transform)

**Analog:** `frontend/src/pages/VerifyEmail.jsx` (full file, 54 lines — read in full, no re-read needed)

**Imports pattern** (`VerifyEmail.jsx:1-5`):
```jsx
import { useEffect, useState } from 'react';
import { Alert, Box, Link, Typography } from '@mui/material';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import AuthShell from '../components/AuthShell.jsx';
```
**For the new page, D-02 forbids everything session/routing-related.** The trimmed import set is just:
```jsx
import { Box, Link, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import AuthShell from '../components/AuthShell.jsx';
```
No `useEffect`/`useState`/`useNavigate`/`useSearchParams`/`useAuth` — this file has zero hooks, matching D-02's "renders identically cold, on refresh, and via `navigate()`" requirement.

**AuthShell + footer pattern** (`VerifyEmail.jsx:33-53`, copy the footer block verbatim per D-06):
```jsx
return (
  <AuthShell
    eyebrow="Almost there"
    title="Verifying your email"
    footer={
      <Typography variant="body2" color="text.secondary">
        <Link component={RouterLink} to="/login">
          Return to sign in
        </Link>
      </Typography>
    }
  >
    <Box>
      {error ? (
        <Alert severity="error">{error}</Alert>
      ) : (
        loading && <Typography>Verifying your email…</Typography>
      )}
    </Box>
  </AuthShell>
);
```
For `AwaitingApproval.jsx`: same `AuthShell`/footer shape, `eyebrow`/`title` values from `35-UI-SPEC.md` (`Email verified` / `Awaiting admin approval`), body replaced with two static `Typography` paragraphs (locked copy in UI-SPEC's "Locked copy by surface" §1) instead of the conditional error/loading block — there is no `error`/`loading` state on this page.

**No error/loading branching needed** — this is the one structural difference from the analog: `VerifyEmail.jsx` branches on `error`/`loading` state; `AwaitingApproval.jsx` has no such state and renders its two `Typography` paragraphs unconditionally inside `<Box>`.

**AuthShell prop contract** (`frontend/src/components/AuthShell.jsx:9`, full file read):
```jsx
export default function AuthShell({ eyebrow, title, subtitle, children, footer, maxWidth = 460 }) {
```
`subtitle` is optional and omitted by both `VerifyEmail.jsx` and `Pending.jsx` — omit it on the new page too (UI-SPEC confirms this explicitly).

---

### `frontend/src/pages/verifyLanding.composed.test.jsx` (test, request-response)

**Analog:** `frontend/src/pages/VerifyEmail.test.jsx` (full file, 97 lines) minus its `useNavigate` mock, plus `frontend/src/pages/Pending.test.jsx`'s multi-route `<Routes>` sentinel idea (full file, 80 lines).

**Harness to copy from `VerifyEmail.test.jsx:1-23`** (KEEP the `graphqlRequest` mock, DROP the `react-router-dom` mock/`navigateSpy`):
```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext.jsx';
import VerifyEmail from './VerifyEmail.jsx';

vi.mock('../api/graphqlClient.js', () => ({
  graphqlRequest: vi.fn()
}));

import { graphqlRequest } from '../api/graphqlClient.js';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});
```
Do **not** carry over `VerifyEmail.test.jsx:13-18`:
```jsx
// DO NOT COPY into the composed test — real react-router-dom must drive real
// navigation through real <Route>s, per D-11.
const { navigateSpy } = vi.hoisted(() => ({ navigateSpy: vi.fn() }));
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => navigateSpy
}));
```

**Multi-route render helper** — combine `VerifyEmail.test.jsx:25-35`'s `renderVerifyEmail` shape with `Pending.test.jsx:12-22`'s pattern of mounting several real `<Route>`s (including plain sentinel `<div>`s for destinations not under test, but here all four destinations ARE under test, so mount the real components):
```jsx
// Pattern source: VerifyEmail.test.jsx:25-35 (single-route shape) combined
// with Pending.test.jsx:12-22 (multi-route <Routes> mounting several
// destinations so a real navigation can be asserted on by rendered content).
function renderApp(initialEntries) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/awaiting-approval" element={<AwaitingApproval />} />
          <Route path="/pending" element={<Pending />} />
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<div>Dashboard Sentinel</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}
```
`/dashboard` can stay a sentinel `<div>` (matching `Pending.test.jsx:17`'s `<div>Dashboard Sentinel</div>`) since D-13 item 1 only needs to prove the route rendered and `authToken` was stored — it does not need `Dashboard.jsx`'s real (data-fetching) content.

**Mock shape to assert against** (`VerifyEmail.test.jsx:65-76`, the exact case being redirected):
```jsx
it('navigates to /pending when the verified account is still Pending', async () => {
  graphqlRequest.mockResolvedValueOnce({
    verifyEmail: {
      token: 'tok-pending',
      user: { id: 5, name: 'Caleb', email: 'caleb@example.com', role: 'USER', status: 'Pending' }
    }
  });

  renderVerifyEmail(['/verify-email?token=pending-token']);

  await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith('/pending'));
});
```
Composed-test equivalent (assert on rendered copy + `localStorage`, not a `navigate()` spy — this is D-11's explicit instruction and the reason `useNavigate` is not mocked here):
```jsx
graphqlRequest.mockResolvedValueOnce({
  verifyEmail: { token: 'tok', user: { id: 5, name: 'Caleb', email: 'c@x.com', role: 'USER', status: 'Pending' } }
});

renderApp(['/verify-email?token=abc']);

await waitFor(() => expect(screen.getByText(/your email address is verified/i)).toBeInTheDocument());
expect(screen.queryByRole('heading', { name: /sign in to agne/i })).not.toBeInTheDocument();
expect(localStorage.getItem('authToken')).toBeNull();
```
(Exact heading text on `Login.jsx` should be confirmed by reading `Login.jsx`'s `title` prop at execution time rather than assumed — RESEARCH.md's example used `/sign in to agne/i` as an illustrative match, not a verified string.)

**Error-state assertion pattern for reference** (`VerifyEmail.test.jsx:78-88`, useful if a red-first run needs an error-branch check):
```jsx
it('shows a recoverable error state and never navigates when verification fails', async () => {
  graphqlRequest.mockRejectedValueOnce(new Error('The email verification token is invalid or has expired.'));
  renderVerifyEmail(['/verify-email?token=bad-token']);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'The email verification token is invalid or has expired.'
  );
  expect(screen.getByRole('link', { name: /return to sign in/i })).toBeInTheDocument();
  expect(navigateSpy).not.toHaveBeenCalled();
});
```

**D-13 items 2-3 pattern source** — `Pending.test.jsx:73-79` (no-session bounce) and the "direct hit, no mock call" idea both reuse the same `renderApp` helper with different `initialEntries` and assert `graphqlRequest` was never called for item 3:
```jsx
// D-13 item 2 shape (adapted from Pending.test.jsx:73-79 — 'redirects to /login when user is null')
it('bounces a no-session /pending hit to /login (SC-2 defence in depth)', () => {
  renderApp(['/pending']);
  expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
});

// D-13 item 3 shape — the refresh-safety property that drove D-01
it('renders the landing page on a direct hit with no session, no network call', () => {
  renderApp(['/awaiting-approval']);
  expect(screen.getByText(/your email address is verified/i)).toBeInTheDocument();
  expect(graphqlRequest).not.toHaveBeenCalled();
});
```

---

### `frontend/src/pages/AwaitingApproval.test.jsx` (optional unit test, transform)

**Analog:** `frontend/src/pages/Pending.test.jsx` (full file, 80 lines) — closest simple-page-render-assertion shape in the codebase; note it uses a *mocked* `useAuth` (`vi.mock('../context/AuthContext.jsx', ...)`) which `AwaitingApproval.jsx` will not need at all since it calls no hooks.

**Render + assert pattern** (`Pending.test.jsx:12-38`):
```jsx
function renderPending() {
  return render(
    <MemoryRouter initialEntries={['/pending']}>
      <Routes>
        <Route path="/login" element={<div>Login Sentinel</div>} />
        <Route path="/dashboard" element={<div>Dashboard Sentinel</div>} />
        <Route path="/pending" element={<Pending />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Pending page', () => {
  it('renders the static awaiting-link message for an unlinked, non-admin user', () => {
    useAuthMock.mockReturnValue({ user: { id: 1, role: 'USER', familyMemberId: null } });
    renderPending();
    expect(screen.getByText("...")).toBeInTheDocument();
  });
```
For `AwaitingApproval.test.jsx`, this simplifies further — no `useAuth` mock needed, no `MemoryRouter`/`Routes` needed for anything beyond a single `<Route>` (or `render` with just a bare `MemoryRouter` wrapper for the `RouterLink` footer to resolve), e.g.:
```jsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AwaitingApproval from './AwaitingApproval.jsx';

it('renders the verified/awaiting-approval copy and a return-to-sign-in link', () => {
  render(
    <MemoryRouter>
      <AwaitingApproval />
    </MemoryRouter>
  );
  expect(screen.getByText(/your email address is verified/i)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /return to sign in/i })).toBeInTheDocument();
});
```
No project convention was found for `jest-axe` on the small `AuthShell` auth pages (`VerifyEmail.test.jsx`, `Pending.test.jsx`, `Login.test.jsx` do not use it — `jest-axe` is only used on data-heavy pages/components: `DetailPage.test.jsx`, `PersonCard.test.jsx`, `PersonSearch.test.jsx`, `GenerationGrid.test.jsx`, `theme.contrast.test.js`). Adding it here would be new ground for an `AuthShell` page test, not an established pattern — optional, not required by CONTEXT.md.

---

### `frontend/src/pages/VerifyEmail.jsx` (MODIFY, line 25 only)

**Current** (`VerifyEmail.jsx:21-26`):
```jsx
verifyEmail(token)
  .then((user) => {
    // Email verified, but the account may still be awaiting admin approval
    // (two-gate flow) — route there instead of the dashboard.
    navigate(user && user.status && user.status !== 'Active' ? '/pending' : '/dashboard');
  })
```
**Change:** `'/pending'` → `'/awaiting-approval'` and update the stale comment. This is a self-edit — no external analog needed, just the one-line diff plus a comment rewrite. Do not touch the `user.status !== 'Active'` predicate unless tightening to `=== 'Pending'` (Claude's Discretion; if changed, add a comment citing why, per CONTEXT.md).

---

### `frontend/src/pages/VerifyEmail.test.jsx` (MODIFY, ~line 65-76)

**Current** (`VerifyEmail.test.jsx:65-76`):
```jsx
it('navigates to /pending when the verified account is still Pending', async () => {
  graphqlRequest.mockResolvedValueOnce({
    verifyEmail: {
      token: 'tok-pending',
      user: { id: 5, name: 'Caleb', email: 'caleb@example.com', role: 'USER', status: 'Pending' }
    }
  });

  renderVerifyEmail(['/verify-email?token=pending-token']);

  await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith('/pending'));
});
```
**Change:** rename the `it(...)` description and change the final assertion's target string to `'/awaiting-approval'`. Everything else (mock shape, `renderVerifyEmail` helper, `navigateSpy` mock at the top of the file) stays byte-identical — this file still tests `VerifyEmail.jsx` in isolation with a mocked `useNavigate`; it is explicitly NOT converted into the composed test (that lives in the separate new file per D-11/Open Question 2's recommendation).

---

### `frontend/src/pages/Pending.jsx` (MODIFY, copy only)

**Current** (`Pending.jsx`, full 21-line file):
```jsx
import { Navigate } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import { useAuth } from '../context/AuthContext.jsx';
import AuthShell from '../components/AuthShell.jsx';

export default function Pending() {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;
  if (user.familyMemberId || user.role === 'ADMIN') return <Navigate to="/dashboard" replace />;

  return (
    <AuthShell eyebrow="Almost there" title="Waiting for admin approval">
      <Box>
        <Typography>
          Your account is awaiting an admin to link you to your family member; you'll get access once linked.
        </Typography>
      </Box>
    </AuthShell>
  );
}
```
**Change (D-07, locked copy from `35-UI-SPEC.md` §2):** only the `title` prop string (`"Waiting for admin approval"` → `"Waiting to be linked to your family"`) and the `Typography` body string (→ `"Your account is approved. An administrator still needs to link you to your family member in the tree — you'll get access as soon as that happens."`). The three guard/import lines (`import`, `if (!user)`, `if (user.familyMemberId...)`) are byte-identical — do not add a conditional branch (Pitfall 2 in RESEARCH.md; `AuthContext`'s `ME_QUERY` carries nothing that distinguishes self-registered from invited users).

---

### `frontend/src/pages/Pending.test.jsx` (MODIFY, ~34-38 and ~50-54)

**Current** (`Pending.test.jsx:29-55`, both string-assertion sites):
```jsx
it('renders the static awaiting-link message for an unlinked, non-admin user', () => {
  useAuthMock.mockReturnValue({ user: { id: 1, role: 'USER', familyMemberId: null } });
  renderPending();
  expect(
    screen.getByText(
      "Your account is awaiting an admin to link you to your family member; you'll get access once linked."
    )
  ).toBeInTheDocument();
});

it('renders the same awaiting-link message for an approved, unlinked self-registrant (APPR-06 regression)', () => {
  // AuthContext.jsx's ME_QUERY selects only id/name/email/role/familyMemberId,
  // so nothing in `user` distinguishes a self-registered account from an
  // invited one -- Pending.jsx needs no code change, this test exists purely
  // to make APPR-06's coverage traceable in the suite.
  useAuthMock.mockReturnValue({ user: { id: 2, role: 'USER', familyMemberId: null } });
  renderPending();
  expect(
    screen.getByText(
      "Your account is awaiting an admin to link you to your family member; you'll get access once linked."
    )
  ).toBeInTheDocument();
});
```
**Change:** both `screen.getByText(...)` literal strings update to the new D-07 body string. The APPR-06 regression's *comment* and *purpose* (nothing in `user` distinguishes self-registered vs. invited) stay — only the literal string argument changes. The other three tests in this file (`redirects to /dashboard for a linked user`, `redirects to /dashboard for an ADMIN...`, `redirects to /login when user is null`) are untouched.

---

### `frontend/src/pages/Register.jsx` (MODIFY, lines 310-313 only)

**Correct sibling paragraph to use as tone reference** (`Register.jsx:211-215`, self-registration branch — UNCHANGED, do not edit, but matches the calm sentence-case tone the new invited paragraph should match):
```jsx
<Alert severity="success">Check {form.email} for a verification link.</Alert>
<Typography variant="body2" color="text.secondary">
  Once you verify your email, an administrator reviews your request. You&apos;ll be able to sign in as
  soon as they approve it.
</Typography>
```

**Current stale paragraph to change** (`Register.jsx:305-314`, invited/`token` branch):
```jsx
<Stack spacing={2.25}>
  {error && <Alert severity="error">{error}</Alert>}
  {result ? (
    <>
      <Alert severity="success">{result.message}</Alert>
      <Typography variant="body2" color="text.secondary">
        We&apos;ve sent a verification link to your email. After you verify, an administrator will review and
        approve your account before you can sign in.
      </Typography>
    </>
  ) : (
```
**Change (D-08, locked copy from `35-UI-SPEC.md` §3):** only the `<Typography>` text after the `Alert` changes, to `"We've sent a verification link to your email. Verify it and you can sign in right away."` (exact apostrophe convention: this file uses `&apos;` HTML entities inside JSX text, e.g. `We&apos;ve`, `You&apos;ll` — match that convention, not a literal `'`). `{result.message}` (the `Alert`) is untouched — it renders the server's D-10-locked string verbatim.

**Verification note:** searched `Register.test.jsx` for any assertion on the current stale sentence (`"After you verify, an administrator will review and approve..."`) or the new sentence — **none found**. The only assertion resembling this (`Register.test.jsx:84`, `/an administrator will review your account/i`) is checking the `result.message` `Alert` against a test-local *overridden mock server string* (`Register.test.jsx:70`), not the client paragraph being changed. **No change to `Register.test.jsx` is required for D-08.**

---

### `frontend/src/App.jsx` (MODIFY, add one `<Route>`)

**Current route block** (`App.jsx:20-27`):
```jsx
<Route element={<AppLayout />}>
  <Route index element={<Navigate to="/dashboard" replace />} />
  <Route path="login" element={<Login />} />
  <Route path="register" element={<Register />} />
  <Route path="forgot-password" element={<ForgotPassword />} />
  <Route path="reset-password" element={<ResetPassword />} />
  <Route path="verify-email" element={<VerifyEmail />} />
  <Route path="pending" element={<Pending />} />
  <Route element={<ProtectedRoute />}>
```
**Change:** add `import AwaitingApproval from './pages/AwaitingApproval.jsx';` to the import block (`App.jsx:4-15`, unsorted — insert anywhere consistent, e.g. right after the `AppLayout`/`ProtectedRoute` imports or alphabetically near the top of the page imports), and add `<Route path="awaiting-approval" element={<AwaitingApproval />} />` immediately after the `pending` route (line 27), still inside the public `<Route element={<AppLayout />}>` block and still **outside** both `<ProtectedRoute />` blocks.

---

### `backend/src/services/mailer.js` (MODIFY, `sendInvitationEmail` + `sendVerificationEmail`)

**Tone reference for "this already happened, here's the honest next step" phrasing** (`mailer.js:82-94`, `sendAccountApprovedEmail` — not edited, cited only as a style example of a short, factual, no-hedging sentence):
```jsx
export async function sendAccountApprovedEmail({ to, name }) {
  const loginUrl = `${env.clientUrl}/login`;
  const subject = 'Your account has been approved';
  const text = `Hi ${name || 'there'},\n\nGood news — an administrator has approved your account. You can now sign in:\n${loginUrl}\n\nWelcome to the family.`;
  const html = renderHtml({
    heading: 'Your account is approved',
    intro: 'An administrator has reviewed and approved your account. You can now sign in.',
    ctaLabel: 'Sign in',
    ctaUrl: loginUrl,
    note: 'Welcome to the family.'
  });
  return sendMail({ to, subject, text, html });
}
```

**`sendInvitationEmail` — current (full function, `mailer.js:143-164`):**
```jsx
export async function sendInvitationEmail({ to, url, inviterName, invitedName, relationship, note }) {
  const greeting = invitedName ? `Hi ${invitedName},` : 'Hello,';
  const from = inviterName ? `${inviterName} has invited you` : 'You have been invited';
  const rel = relationship ? ` as their ${relationship}` : '';
  const subject = 'You are invited to join the family';
  const noteLine = note ? `\n\nA note from ${inviterName || 'the inviter'}: ${note}` : '';
  const text = `${greeting}\n\n${from}${rel} to join the family platform.\n\nRegister here (this link expires soon and can be used once):\n${url}${noteLine}\n\nAfter you register, an administrator will review and approve your account before you can sign in.`;

  const fromHtml = inviterName ? `${escapeHtml(inviterName)} has invited you` : 'You have been invited';
  const relHtml = relationship ? ` as their ${escapeHtml(relationship)}` : '';
  const html = renderHtml({
    heading: 'You are invited to join the family',
    intro: `${fromHtml}${relHtml} to join the family platform. Use the button below to register — the link can be used once and expires soon.${note ? `<br /><br /><em>Note: ${escapeHtml(note)}</em>` : ''}`,
    ctaLabel: 'Register your account',
    ctaUrl: url,
    note: 'After registering, an administrator reviews and approves your account before you can sign in.'
  });

  return sendMail({ to, subject, text, html });
}
```
**Change (D-08, locked copy from `35-UI-SPEC.md` §4):** the trailing clause of `text` (currently `"After you register, an administrator will review and approve your account before you can sign in."`) and the `note` field passed to `renderHtml` (currently `"After registering, an administrator reviews and approves your account before you can sign in."`) both become the same string: `"Once you register and verify your email, you can sign in right away."`. Nothing else in this function changes — `greeting`/`from`/`rel`/`noteLine`/`fromHtml`/`relHtml`/`heading`/`ctaLabel`/`ctaUrl` all stay. No new interpolation is introduced, so no new `escapeHtml()` call is needed.

**`sendVerificationEmail` — current (full function, `mailer.js:166-179`):**
```jsx
export async function sendVerificationEmail({ to, token }) {
  const link = `${env.clientUrl}/verify-email?token=${token}`;
  const subject = 'Verify your email';
  const text = `Welcome! Please verify your email address to activate your account.\n\nOpen this link to verify:\n${link}\n\nThis link expires in 24 hours. If you did not create this account, you can ignore this email.`;
  const html = renderHtml({
    heading: 'Verify your email',
    intro: 'Welcome! Please verify your email address to activate your account.',
    ctaLabel: 'Verify email',
    ctaUrl: link,
    note: 'This link expires in 24 hours. If you did not create this account, you can safely ignore this email.'
  });

  return sendMail({ to, subject, text, html });
}
```
**Change (D-09, locked copy from `35-UI-SPEC.md` §5):** the sentence `"Please verify your email address to activate your account."` appears twice (once inside `text`, once as `intro`) and both instances become `"Please confirm this is your email address."`. `heading`, `ctaLabel`, `ctaUrl`, and the 24-hour `note` line are all untouched. No signature change, no branching, no new parameter.

**`escapeHtml` pattern** (imported at `mailer.js:3`, used throughout for any interpolated dynamic value) — not needed for this phase's edits since all four changed strings are static literals with no interpolation, but cite this if the planner's final wording ends up interpolating anything:
```js
import { escapeHtml } from '../utils/escapeHtml.js';
```

---

### `backend/src/services/mailer.test.js` (MODIFY: extend `sendInvitationEmail`; ADD `sendVerificationEmail`)

**Shared test-file helper to reuse, unmodified** (`mailer.test.js:23-26`):
```js
async function renderedMessage(sendPromise) {
  const result = await sendPromise;
  return JSON.parse(result.message);
}
```
This is how every describe block in this file reads the *actual rendered* `text`/`html`/`subject` output (via nodemailer's `jsonTransport`, forced by `nodeEnv: 'test'`), not a mocked return value — reuse for both the extended and the new describe block.

**Existing `sendInvitationEmail` describe to extend** (`mailer.test.js:133-151`, full block):
```js
describe('sendInvitationEmail', () => {
  it('escapes inviterName and note (D-07)', async () => {
    const { html } = await renderedMessage(
      sendInvitationEmail({
        to: 'invitee@example.com',
        url: 'https://example.com/register?token=abc',
        inviterName: '<i>Bob</i>',
        invitedName: null,
        relationship: null,
        note: '<u>hi</u>'
      })
    );

    expect(html).toContain('&lt;i&gt;Bob&lt;/i&gt;');
    expect(html).toContain('&lt;u&gt;hi&lt;/u&gt;');
    expect(html).not.toContain('<i>Bob</i>');
    expect(html).not.toContain('<u>hi</u>');
  });
});
```
**Add a second `it(...)` here** asserting (per UI-SPEC's stronger mutation-test surface note — assert absence of the whole `/review|approv/i` pattern, not just the literal old sentence) both `text` and `html` from `renderedMessage`:
```js
it('promises "verify then sign in", never a review/approval step (D-08, W-2)', async () => {
  const { text, html } = await renderedMessage(
    sendInvitationEmail({ to: 'invitee@example.com', url: 'https://example.com/register?token=abc' })
  );

  expect(text).toMatch(/sign in right away/i);
  expect(html).toMatch(/sign in right away/i);
  expect(text).not.toMatch(/review|approv/i);
  expect(html).not.toMatch(/review|approv/i);
});
```

**Sibling describe-block shape to model the brand-new `sendVerificationEmail` describe on** (`mailer.test.js:153-164`, `sendRegistrationAttemptEmail` — same "import at top, single focused `it`, `renderedMessage` + plain assertions" shape):
```js
describe('sendRegistrationAttemptEmail', () => {
  it('escapes name, references a registration attempt, and points its CTA at /forgot-password (D-10)', async () => {
    const { html, subject } = await renderedMessage(
      sendRegistrationAttemptEmail({ to: 'x@example.com', name: '<mark>X</mark>' })
    );

    expect(html).toContain('&lt;mark&gt;X&lt;/mark&gt;');
    expect(html).not.toContain('<mark>');
    expect(subject.toLowerCase()).toContain('registration attempt');
    expect(html).toContain(`${env.clientUrl}/forgot-password`);
  });
});
```
**New block for `sendVerificationEmail`** (this function has ZERO existing coverage — confirmed: not in the `mailer.test.js` import list at lines 2-8):
```js
import { /* existing names */, sendVerificationEmail } from './mailer.js'; // add to the existing import block, mailer.test.js:2-8

describe('sendVerificationEmail', () => {
  it('is path-neutral: confirms the address without promising activation or a review (D-09, W-2)', async () => {
    const { text, html } = await renderedMessage(
      sendVerificationEmail({ to: 'new@example.com', token: 'tok-123' })
    );

    expect(text).toMatch(/confirm this is your email address/i);
    expect(html).toMatch(/confirm this is your email address/i);
    expect(text).not.toMatch(/activate your account/i);
    expect(html).not.toMatch(/activate your account/i);
  });
});
```

---

## Shared Patterns

### AuthShell chrome (every touched frontend page)
**Source:** `frontend/src/components/AuthShell.jsx` (full file, unmodified)
**Apply to:** `AwaitingApproval.jsx` (new), `Pending.jsx` (copy edit), `Register.jsx`'s invited branch (copy edit, `AuthShell` usage at `Register.jsx:291-304` unchanged)
```jsx
export default function AuthShell({ eyebrow, title, subtitle, children, footer, maxWidth = 460 }) {
  // ...Paper card, Stack header (BrandGlyph + eyebrow overline + h4 title [+ optional subtitle]), children, optional footer with top border
}
```
No prop-shape changes needed anywhere in this phase — every page consumes the existing `eyebrow`/`title`/`children`/`footer` contract as-is.

### "Return to sign in" footer link (single-action pages)
**Source:** `frontend/src/pages/VerifyEmail.jsx:37-43`
**Apply to:** `AwaitingApproval.jsx` (D-06 requires this verbatim)
```jsx
footer={
  <Typography variant="body2" color="text.secondary">
    <Link component={RouterLink} to="/login">
      Return to sign in
    </Link>
  </Typography>
}
```

### Composed test harness: real `AuthProvider` + real `<Routes>`, network mocked only at `graphqlRequest`
**Source:** `frontend/src/pages/VerifyEmail.test.jsx:1-35` (single-route version) + `frontend/src/pages/Pending.test.jsx:12-22` (multi-route version)
**Apply to:** `verifyLanding.composed.test.jsx` (new)
```jsx
vi.mock('../api/graphqlClient.js', () => ({ graphqlRequest: vi.fn() }));
import { graphqlRequest } from '../api/graphqlClient.js';

function renderApp(initialEntries) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>{/* one <Route> per page under test */}</Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}
```
Key rule (D-11): do **not** mock `react-router-dom`/`useNavigate` in this file — that is what makes it "composed" rather than a `VerifyEmail.test.jsx`-style isolated unit test.

### Mailer template test helper: parse the real `jsonTransport` output
**Source:** `backend/src/services/mailer.test.js:23-26`
**Apply to:** the extended `sendInvitationEmail` describe and the new `sendVerificationEmail` describe
```js
async function renderedMessage(sendPromise) {
  const result = await sendPromise;
  return JSON.parse(result.message);
}
```
`nodeEnv: 'test'` forces `buildTransportOptions` (`mailer.js:14`) to `{ jsonTransport: true }`, so every `sendXEmail()` call in this test file resolves with nodemailer's JSON-transport payload — no SMTP socket, no mock needed on `sendMail` itself.

### Copy-only edits keep all guard/control-flow lines byte-identical
**Source:** `Pending.jsx`'s `if (!user)`/`if (user.familyMemberId...)` guards; `Register.jsx`'s `{result ? (...) : (...)}` branch structure; `VerifyEmail.jsx`'s `user.status !== 'Active'` predicate
**Apply to:** every MODIFY-only file in this phase
Every file this phase touches for copy reasons (`Pending.jsx`, `Register.jsx`'s invited paragraph, both `mailer.js` functions) changes **string literals only** — no new conditionals, no new props, no new fields read off `user`/`result`/args. This mirrors RESEARCH.md Pitfall 2 and D-07/D-08/D-09's explicit "no branching" constraints.

## No Analog Found

None. Every file in scope either has a direct, close-role/close-flow analog in the codebase (`AwaitingApproval.jsx` ← `VerifyEmail.jsx`; `verifyLanding.composed.test.jsx` ← `VerifyEmail.test.jsx` + `Pending.test.jsx`; `sendVerificationEmail`'s new test coverage ← sibling `mailer.test.js` describe blocks) or is a narrow, self-contained copy/line edit to an existing file where the "analog" is the file's own surrounding, unchanged code.

## Verified Non-Changes (do not create tasks for these)

- **`frontend/src/pages/Register.test.jsx`** — searched for any assertion on the invited-path client paragraph (old: `"After you verify, an administrator will review and approve..."`; new candidates) — **none found**. The only nearby-looking assertion (`Register.test.jsx:84`, `/an administrator will review your account/i`) checks a test-local overridden **mock server message** (`Register.test.jsx:70`) rendered via `{result.message}`, not the client `<Typography>` paragraph at `Register.jsx:310-313`. No edit needed here for D-08.
- **`frontend/src/pages/Register.jsx:211-215`** (self-registration success paragraph) and **`user.resolver.js:104,285`** (`TOKENLESS_REGISTER_MESSAGE`) — confirmed correct/locked, D-10, not touched.
- **Resolver test files referencing `sendVerificationEmail`/`sendInvitationEmail`** (`register.test.js`, `updateUser.test.js`, `resendVerificationEmail.test.js`, `publicRegistrationSwitch.test.js`, `security.boundaries.test.js`) — all mock `mailer.js` at the module boundary and assert only on call *arguments*, never rendered template text (confirmed by RESEARCH.md's grep sweep). No changes needed in any of these for D-08/D-09.

## Metadata

**Analog search scope:** `frontend/src/pages/`, `frontend/src/components/AuthShell.jsx`, `frontend/src/App.jsx`, `backend/src/services/mailer.js` + `mailer.test.js`
**Files read in full this session:** `VerifyEmail.jsx`, `VerifyEmail.test.jsx`, `Pending.jsx`, `Pending.test.jsx`, `AuthShell.jsx`, `App.jsx`, `mailer.js`, `mailer.test.js`; `Register.jsx` read at lines 1-20 and 190-319 (imports + both success-state branches); `Register.test.jsx` read at lines 1-100 (full mock setup + all assertions relevant to D-08).
**Pattern extraction date:** 2026-09-09
