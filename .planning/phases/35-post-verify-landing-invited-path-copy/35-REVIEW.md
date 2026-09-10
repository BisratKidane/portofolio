---
phase: 35-post-verify-landing-invited-path-copy
reviewed: 2026-09-10T09:43:45Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - frontend/src/pages/AwaitingApproval.jsx
  - frontend/src/pages/VerifyEmail.jsx
  - frontend/src/pages/Pending.jsx
  - frontend/src/pages/Register.jsx
  - frontend/src/App.jsx
  - backend/src/services/mailer.js
  - frontend/src/pages/verifyLanding.composed.test.jsx
  - frontend/src/pages/VerifyEmail.test.jsx
  - frontend/src/pages/Pending.test.jsx
  - frontend/src/pages/Register.test.jsx
  - backend/src/services/mailer.test.js
findings:
  critical: 0
  warning: 0
  info: 2
  total: 2
status: clean
---

# Phase 35: Code Review Report

**Reviewed:** 2026-09-10T09:43:45Z
**Depth:** standard
**Files Reviewed:** 11 (6 source, 5 test files reviewed for context/reliability only)
**Status:** clean

## Summary

Reviewed the full diff (base `876ec38`..`HEAD` `2d44ea3`) against 35-CONTEXT.md's locked decisions (D-01..D-13) and 35-UI-SPEC.md's exact-string copy contract. Every touched string was diffed character-for-character against the spec's "Locked copy by surface" tables and matched verbatim, including the do-not-use list (`approval` noun absent from `Pending.jsx`; `review`/`approv` absent from every invited-path surface; `activate your account` absent from `sendVerificationEmail`).

Verified against the four phase-specific concerns:

1. **Route exposure** — `/awaiting-approval` is registered as a sibling of `pending`/`verify-email`, outside the `<Route element={<ProtectedRoute />}>` block (`frontend/src/App.jsx:29`). `AwaitingApproval.jsx` has zero hooks, zero props, no `useAuth`, no `useSearchParams`, and never names an email address or any other identifying data — it renders the identical static markup regardless of session state, confirmed by the composed test's direct-hit case (`verifyLanding.composed.test.jsx`, "renders the landing page on a direct hit with no session and zero network calls").
2. **Session handling** — `VerifyEmail.jsx`'s Active branch (`navigate(... : '/dashboard')`) is untouched; only the non-Active destination string changed (`'/pending'` → `'/awaiting-approval'`). `AuthContext.jsx`'s `verifyEmail` (the function that withholds the token for non-Active users, D-04) has a zero-line diff against base — confirmed via `git diff --stat -- frontend/src/context/AuthContext.jsx backend/src/resolvers backend/src/schemas` returning empty. The composed test's Active-session case confirms `authToken` **is** stored for Active users and the no-signal `/pending` case confirms a still-Pending/no-session hit never reaches a stored token.
3. **Mailer template injection** — Both edited functions (`sendInvitationEmail`'s `text`/`note`, `sendVerificationEmail`'s `text`/`intro`) replace one static string literal with another static string literal; no new `${...}` interpolation was introduced into any HTML field, and no previously-escaped value (all `escapeHtml()` call sites: `inviterName`, `note`, `newUserName`, `newUserEmail`, `relationship`, `reason`) had its escaping removed or its template touched. Confirmed via `git diff backend/src/services/mailer.js | grep -c '^+.*escapeHtml('` → `0` (no new escape calls needed because no new interpolation exists).
4. **Guard preservation** — `Pending.jsx:9` (`if (!user) return <Navigate to="/login" replace />;`) and `:10` (the dashboard-redirect guard) are byte-identical to base; only the `AuthShell title`/body `Typography` strings changed. `Pending.test.jsx`'s three behavior-only cases (dashboard redirects ×2, `/login` bounce) are unmodified; only the two copy-assertion strings changed, matching the plan's stated scope exactly.

No Critical or Warning findings. Two Info-level observations below, neither blocking.

## Info

### IN-01: `AuthContext.jsx`'s `verifyEmail` comment now describes a route that no longer exists

**File:** `frontend/src/context/AuthContext.jsx:72-75` (not modified by this phase; referenced for context only)
**Issue:** The comment above `verifyEmail` still reads "...just return the user so the page can route to `/pending`." As of this phase, `VerifyEmail.jsx` routes non-Active users to `/awaiting-approval`, not `/pending`. `AuthContext.jsx` was correctly left untouched (D-04 locks it), so this drift is a natural side effect rather than an in-scope defect — but the comment is now misleading for the next reader who greps for "`/pending`" to understand why the token is withheld.
**Fix:** A one-word comment edit in a future phase/quick-task (not this one, since D-04 forbids touching this file here):
```js
// Email verification can succeed while the account is still Pending admin
// approval. In that case the returned token is not yet usable, so DON'T
// establish a session -- just return the user so the page can route to
// the appropriate landing (/awaiting-approval or /pending).
```

### IN-02: Apostrophe-encoding convention now diverges between auth pages

**File:** `frontend/src/pages/AwaitingApproval.jsx:23`, `frontend/src/pages/Pending.jsx:16-17`
**Issue:** `AwaitingApproval.jsx` (new) and `Pending.jsx` (modified) use a literal `'` in body copy ("You'll get...", "you'll get access..."), while `Register.jsx`'s neighboring auth-flow copy uses the `&apos;` HTML entity ("We&apos;ve sent...", "You&apos;ll be able to..."). This was a deliberate, documented choice in 35-01-SUMMARY.md (matching `Pending.jsx`'s pre-existing convention over `Register.jsx`'s), so it is not a regression, but it leaves the three auth pages inconsistent with each other going forward.
**Fix:** Non-blocking; if a future copy pass touches any of these files, standardize on one convention (literal apostrophes are simpler and render identically; `&apos;` has no accessibility or correctness benefit here).

---

_Reviewed: 2026-09-10T09:43:45Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
