---
status: complete
phase: 34-open-registration-switch-quality-gate
source: [34-01-SUMMARY.md, 34-03-SUMMARY.md, 34-04-SUMMARY.md, 34-05-SUMMARY.md, 34-06-SUMMARY.md, 34-07-SUMMARY.md, 34-09-SUMMARY.md]
started: 2026-09-09T16:23:34Z
updated: 2026-09-09T18:06:12Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Stop any running backend/frontend. Against a local MySQL (docker compose local or your own), apply backend/migrations/manual/021-create-app-settings.sql, then start the stack from scratch. Backend boots with "Backend ready at http://localhost:4000/graphql" and no errors; GET /health responds; `SELECT settingKey, value FROM app_settings;` returns exactly one row, public_registration_enabled = 'true'; the frontend loads and you can sign in as an ADMIN.
result: pass

### 2. Admin sees the public-signup switch on /invitations
expected: Signed in as ADMIN, open /invitations. Above the invite form and approvals queue there is a new region whose description reads "Whether someone without an invitation can create an account. Closing it stops new requests — it doesn't affect invitations you've already sent, or anyone already waiting in the queue below." It shows an open-lock icon, the headline "Public signup is open", the attribution "Not changed since setup.", and a Switch in the ON position (tooltip "Open — click to close public signup"). While it loads you briefly see "Checking whether public signup is open…" with no Switch.
result: pass

### 3. Closing public signup is one click, no confirmation
expected: Click the Switch once. NO dialog or confirmation appears. The Switch is disabled at its old position and the attribution line is replaced by "Closing public signup…"; then the region re-renders with a closed-lock icon, headline "Public signup is closed", the Switch OFF (tooltip "Closed — click to open public signup"), and the attribution now names you and the time (e.g. "Changed by Bisrat · just now").
result: pass

### 4. /register shows the invitation-only view while closed
expected: In a logged-out browser/private window, open /register with no invitation token. You see a bare centred spinner for a moment (no form, no card chrome), then the invitation-only card: eyebrow "Invitation required", title "You need an invitation", subtitle "Agne is invitation-only right now.", an info alert reading "Registration is currently by invitation only. Ask an administrator to send you an invitation link, then open the link from that email.", and a "Sign in" link. No name/email/password fields are rendered.
result: pass

### 5. Server refuses tokenless registration while closed (not just the UI)
expected: With the door closed, send the register mutation directly to http://localhost:4000/graphql with any GraphQL client or curl (no token argument): `mutation { register(name: "Probe", email: "probe@example.com", password: "Str0ng-Passw0rd!") { token } }`. The response contains a GraphQL error whose message says public registration is closed (the exact PUBLIC_REGISTRATION_CLOSED_MESSAGE), no token, and no user row appears in the users table for probe@example.com.
result: pass

### 6. Invitations still work while public signup is closed
expected: As ADMIN, send an invitation to a fresh email address. Open the invitation link (in a logged-out window). The invited registration form renders immediately — eyebrow "Get started", title "Create your account", subtitle "You've been invited — set up your Agne profile." — with NO spinner and NO invitation-only message. Completing it creates the account and signs you in as before.
result: pass

### 7. The approval queue is unaffected by closing
expected: Any request that was already Pending before you closed the door still appears in the approvals list on /invitations, and Approve / Reject on it still work exactly as in Phase 33 while the door is closed. (If you have no Pending user, reopen the door — test 8 — register one via /register, close the door again, then check.)
result: pass

### 8. Reopening requires a confirmation dialog; "Keep it closed" is a real escape hatch
expected: With the door closed, click the Switch. A dialog titled "Open public signup?" appears with body copy naming the consequence (anyone can request an account; approval is still required), a low-emphasis "Keep it closed" button and a contained (non-red) "Open signup" button. Click "Keep it closed" — the dialog closes and the headline still reads "Public signup is closed". Click the Switch again and press "Open signup" — the button reads "Opening…" (Escape and "Keep it closed" are disabled during this), then the region shows "Public signup is open" with the attribution naming you.
result: pass

### 9. Mid-form close swaps the visitor to the invitation-only view without a "just closed" tell
expected: Two sessions: in a logged-out window open /register (door open) and fill in the public signup form. In the admin window close the door. Back in the visitor window press Submit: the form is replaced by the invitation-only card that is byte-identical to test 4 (same eyebrow/title/subtitle/alert) — no error alert, no "the door just closed" wording, nothing revealing that an admin acted moments ago.
result: pass

### 10. Non-admins cannot see or flip the switch
expected: Signed in as a regular USER, /invitations shows no "Public signup" region at all. Calling `mutation { setPublicRegistrationEnabled(enabled: true) { enabled } }` at /graphql with that user's Bearer token returns the GraphQL error "Admin access is required." and the door state is unchanged. Calling `query { publicRegistrationEnabled }` with no token returns just a boolean — no admin name or timestamp.
result: pass

### 11. Every flip is audited
expected: After the flips above, `SELECT action, actorUserId, metadata, createdAt FROM audit_logs WHERE action = 'setting.public_registration_changed' ORDER BY createdAt;` shows one row per flip you made, each with your admin user id and metadata containing from/to that chain correctly (true→false, false→true, …). "Keep it closed" wrote no row.
result: pass

## Summary

total: 11
passed: 11
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
