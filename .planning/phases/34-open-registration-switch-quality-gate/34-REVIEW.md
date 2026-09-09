---
phase: 34-open-registration-switch-quality-gate
reviewed: 2026-09-09T14:10:22Z
depth: standard
files_reviewed: 20
files_reviewed_list:
  - backend/migrations/manual/021-create-app-settings.sql
  - backend/src/models/AppSetting.js
  - backend/src/models/index.js
  - backend/src/resolvers/index.js
  - backend/src/resolvers/publicRegistrationSwitch.test.js
  - backend/src/resolvers/security.boundaries.test.js
  - backend/src/resolvers/setting.resolver.js
  - backend/src/resolvers/user.resolver.js
  - backend/src/schemas/index.js
  - backend/src/schemas/setting.schema.js
  - backend/src/utils/appSettings.js
  - backend/src/utils/appSettings.test.js
  - backend/test/globalSetup.js
  - backend/test/helpers.js
  - frontend/src/components/PublicSignupSwitch.jsx
  - frontend/src/components/PublicSignupSwitch.test.jsx
  - frontend/src/pages/InvitationsPage.jsx
  - frontend/src/pages/InvitationsPage.test.jsx
  - frontend/src/pages/Register.jsx
  - frontend/src/pages/Register.test.jsx
findings:
  critical: 1
  warning: 2
  info: 5
  total: 8
status: issues_found
---

# Phase 34: Code Review Report

**Reviewed:** 2026-09-09T14:10:22Z
**Depth:** standard
**Files Reviewed:** 20
**Status:** issues_found

## Summary

Reviewed the public-registration switch end to end: migration 021 and the `AppSetting` model, the shared fail-closed predicate in `utils/appSettings.js`, the three new root fields in `setting.resolver.js`/`setting.schema.js`, the door check hoisted into `Mutation.register`, the test-harness seeding, and the `/register` gate plus admin `PublicSignupSwitch` on the frontend. For the two large pre-existing files (`user.resolver.js`, `helpers.js`) I reviewed the phase-34 diff and its interaction with the surrounding code.

The parts this project's recurring defect class is about are sound:

- The tokenless door check is the literal first statement of `register` and runs before any validator, bcrypt, lookup, write, or email. `!token` / `token` are complements of one local, so `''` and `undefined` both hit the door, and a whitespace-only token skips the door only to fall into the invited branch and fail on `findOne`. There is no path where a closed door creates a `User` row or sends mail.
- `publicRegistrationSetting` and `setPublicRegistrationEnabled` both call `requireAdmin` before anything else; the public `publicRegistrationEnabled` field returns a bare `Boolean!` with no attribution, so admin names/timestamps never reach an anonymous caller.
- `enabled` is derived from the stored row only; there is no env override anywhere in `backend/src/config`.
- The frontend fails closed on a rejected read and swaps views via re-query rather than string-matching the refusal, so the only "form shown while server refuses" window is the designed one.

What is not sound is the flip mutation's read-then-write. `previous` is deliberately read outside the transaction with no lock, and I reproduced both consequences against the live test database: (1) two concurrent flips produced audit rows `true→false` and `true→true` for a real history of `true→false→true`, corrupting what the code itself calls "the ONLY history of a value that overwrites itself"; (2) five concurrent flips starved Sequelize's default 5-connection pool until my 15 s watchdog fired, because each transaction holds one connection while waiting for a second. This is exactly the "read-then-write not under a transaction lock" gap the phase context asked about, and it is CR-01 below.

The remaining findings are a non-atomic two-read payload builder, a confirmation dialog whose "Keep it closed" button cannot actually keep it closed once a flip is in flight, and small quality items.

## Critical Issues

### CR-01: `setPublicRegistrationEnabled` reads the "from" value outside the transaction with no lock — stale audit history under concurrency, and pool starvation at 5 concurrent flips

**File:** `backend/src/resolvers/setting.resolver.js:52-64` (also `backend/src/utils/appSettings.js:44-46, 56-74`)
**Issue:** Inside `sequelize.transaction(async (t) => { ... })`, `previous` is captured by `isPublicRegistrationEnabled(models)` with no `transaction`/`lock` option, so it executes on a *different* pooled connection, auto-committed, unlocked. The comment says this is intentional ("must observe the committed old value, and no lock is held yet"), but the rationale is wrong: a `SELECT ... FOR UPDATE` inside the transaction also observes the committed value, and additionally serialises concurrent flips on the row. As written there are two proven defects:

1. **Audit `from` is stale under concurrent flips.** Interleaving: A reads `true`, B reads `true`, A upserts `false` (takes the row X-lock), B blocks on the upsert, A writes audit `true→false` and commits, B proceeds and writes audit `true→true`. Reproduced with two concurrent resolver calls against the test DB:
   ```
   final value: true
   audit 1 from true to false
   audit 2 from true to true
   ```
   The real history was `true→false→true`. Per the file's own comment (lines 66-77) this audit row is the ONLY record of a value that overwrites itself (D-03), so the history is now unreconstructible — the second row claims nothing changed. `setting.resolver.js` line 56 also folds a swallowed read error into `previous = false` (the predicate's `catch` returns `false`), so a transient DB error during the capture silently records `from: false` regardless of the actual stored value.

2. **Pool deadlock.** Each in-flight mutation holds its transaction connection while waiting to acquire a second one for the outside read. With Sequelize's default `pool.max = 5` (no `pool` is configured in `config/database.js`), 5 concurrent flips hold all 5 connections and all 5 wait forever for a 6th. Reproduced: 4 concurrent flips complete in 7 ms; 5 concurrent flips do not complete within 15 s. During that window *every* other request on the backend (including the public `publicRegistrationEnabled` read that `/register` depends on) is starved until the 60 s `acquire` timeout fires and rolls them back.

The existing tests (`publicRegistrationSwitch.test.js:181-208`) only exercise sequential flips, so both defects hide behind green.

**Fix:** Take the row lock inside the transaction and derive `previous` from the locked read. Keep D-07's single-predicate rule by threading an `options` passthrough rather than adding a second `findByPk` site:

```js
// backend/src/utils/appSettings.js
export async function getPublicRegistrationSettingRow(models, options = {}) {
  return models.AppSetting.findByPk(PUBLIC_REGISTRATION_KEY, options);
}

export async function isPublicRegistrationEnabled(models, options = {}) {
  try {
    const row = await getPublicRegistrationSettingRow(models, options);
    if (!row) { console.warn(/* unchanged */); return false; }
    return row.value === 'true';
  } catch (err) {
    console.error('Failed to read public-registration setting:', err?.name, err?.message);
    return false;
  }
}
```

```js
// backend/src/resolvers/setting.resolver.js
await sequelize.transaction(async (t) => {
  // SELECT ... FOR UPDATE: serialises concurrent flips on this row so the
  // audit's `from` is the value this transaction actually overwrote.
  const previous = await isPublicRegistrationEnabled(models, { transaction: t, lock: t.LOCK.UPDATE });
  await models.AppSetting.upsert(
    { settingKey: PUBLIC_REGISTRATION_KEY, value: enabled ? 'true' : 'false', updatedById: user.id },
    { transaction: t }
  );
  await writeAuditLog(models, { /* unchanged */ }, { transaction: t });
});
```

Notes for the fixer: (a) with the read now inside the transaction, the pool-starvation mode disappears because each mutation uses exactly one connection; (b) when the row is *absent* (unmigrated DB), two concurrent `FOR UPDATE` reads on the missing key both take gap locks and the second `INSERT` will get `ER_LOCK_DEADLOCK` — that is the correct outcome (one admin gets an error, nothing is corrupted) and needs no retry logic; (c) add a test that fires two `setPublicRegistrationEnabled` calls via `Promise.all` and asserts the two audit rows chain (`rows[1].from === rows[0].to`) — that is the outcome assertion the current suite lacks; (d) consider having the mutation *not* swallow a read failure during the capture — a `from` derived from a caught error is a wrong audit row, not a fail-closed decision.

## Warnings

### WR-01: `buildPublicRegistrationSettingPayload` composes `enabled` and attribution from two separate, unlocked reads

**File:** `backend/src/resolvers/setting.resolver.js:14-30`
**Issue:** `enabled` comes from `isPublicRegistrationEnabled(models)` (read 1) and `updatedAt`/`updatedById` from `getPublicRegistrationSettingRow(models)` (read 2). A flip committed between the two yields a payload whose `enabled` belongs to one state and whose attribution belongs to another, and `describeAttribution` in `PublicSignupSwitch.jsx:49` then renders the verb from `enabled` next to the actor/date from the other state — e.g. "Opened by Alice on 9 Sep" when Alice actually closed it. It is also the value returned by the mutation itself (line 93), so an admin who just flipped can be shown another admin's attribution under their own verb. Low probability, but it is the same read-consistency class as CR-01 and the fix is the same shape.
**Fix:** Read once under a consistent snapshot and derive both from it. With CR-01's options passthrough in place:
```js
async function buildPublicRegistrationSettingPayload(models) {
  const sequelize = models.AppSetting.sequelize;
  return sequelize.transaction(async (t) => {
    const opts = { transaction: t };
    const enabled = await isPublicRegistrationEnabled(models, opts);
    const row = await getPublicRegistrationSettingRow(models, opts);
    // ... unchanged from here ...
  });
}
```
(REPEATABLE READ gives both reads the same snapshot; no `FOR UPDATE` is needed on the read path.)

### WR-02: Confirmation dialog's "Keep it closed" / backdrop / Escape remain active while the open-flip is in flight, but cannot cancel it

**File:** `frontend/src/components/PublicSignupSwitch.jsx:186-198`
**Issue:** `handleConfirmOpen` fires `flip(true)` and only closes the dialog after it resolves. During that window "Open signup" is `disabled={busy}`, but "Keep it closed" (line 194) and `onClose` (line 186, backdrop click / Escape) are not. An admin who clicks "Open signup", reconsiders, and clicks "Keep it closed" sees the dialog close — and the door opens anyway, because the mutation is already on the wire. The button's label makes a promise the component cannot keep; the admin has to notice the "Public signup is open" state and close it again. `Register.jsx` visitors can register in that gap.
**Fix:** Disable every dismiss path while busy, and only re-enable once the flip has settled:
```jsx
<Dialog open={confirmOpen} onClose={busy ? undefined : () => setConfirmOpen(false)} fullWidth maxWidth="xs">
  ...
  <DialogActions>
    <Button disabled={busy} onClick={() => setConfirmOpen(false)}>Keep it closed</Button>
    <Button variant="contained" disabled={busy} onClick={handleConfirmOpen}>
      {busy ? 'Opening…' : 'Open signup'}
    </Button>
  </DialogActions>
</Dialog>
```
Add a test: click "Open signup" with a never-resolving mutation, assert "Keep it closed" is disabled and Escape does not close the dialog.

## Info

### IN-01: `formatWhen` is now copy-pasted in three components

**File:** `frontend/src/components/PublicSignupSwitch.jsx:37-42` (duplicates `components/manage/AdminMemberTable.jsx:21` and `pages/ApprovalsPage.jsx:37`)
**Issue:** The comment admits the copy. Three hand-synced implementations of the epoch-ms-string parsing quirk is the drift class this phase spends a lot of words warning about.
**Fix:** Extract to `frontend/src/utils/formatWhen.js` and import it from all three.

### IN-02: `describeAttribution` can render "Opened by X on null."

**File:** `frontend/src/components/PublicSignupSwitch.jsx:45-52`
**Issue:** `formatWhen` returns `null` for an unparseable `updatedAt`, and line 51 interpolates it straight into the sentence. Today the backend always sends an epoch-ms string so this is latent, but the copy contract has no fallback.
**Fix:** `const when = formatWhen(setting.updatedAt); return when ? \`${verb} by ${actor} on ${when}.\` : \`${verb} by ${actor}.\`;`

### IN-03: A no-op flip (setting the value it already has) rewrites the row, re-stamps attribution, and writes a `from === to` audit row

**File:** `backend/src/resolvers/setting.resolver.js:48-93`
**Issue:** The UI cannot produce this (the switch always sends the opposite of the server value), but any API caller can, and the result is an attribution line "Opened by Bob on today" for a change Bob did not make, plus audit noise. Once CR-01's locked read is in place this is a one-line early return.
**Fix:** After capturing `previous` under the lock: `if (previous === enabled) return;` (and skip the audit write), then return the unchanged payload.

### IN-04: `Register.jsx` does not reset `publicOpen` when `token` changes on a mounted instance

**File:** `frontend/src/pages/Register.jsx:25, 34-39`
**Issue:** React Router keeps the same `Register` instance across `/register` → `/register?token=…` → `/register`. On the way back, `publicOpen` still holds the earlier `true`, so the public form paints immediately from a stale value while the effect re-fetches; if the door closed meanwhile the form is visible until the re-fetch lands. The server still refuses, so this is only the designed swap arriving late — but it is one more "form shown while closed" window than the design intends.
**Fix:** `useEffect(() => { if (token) return; setPublicOpen(null); graphqlRequest(...)...; }, [token]);`

### IN-05: `publicRegistrationSwitch.test.js` replaces the mailer module wholesale while `security.boundaries.test.js` spreads `importOriginal()`

**File:** `backend/src/resolvers/publicRegistrationSwitch.test.js:27-33`
**Issue:** The file's own comment (lines 20-26) documents the failure mode of a partial `vi.mock` factory: any mailer export a resolver reaches that the factory omits comes back `undefined` and throws synchronously before the resolver's `.catch` attaches. It then omits `sendInvitationEmail` and `sendAccountRejectedEmail`. The sibling file fixed this class with `async (importOriginal) => ({ ...(await importOriginal()), ... })`. The next test added to this file that reaches `rejectUser` or `createInvitation` will crash with the exact symptom the comment warns about.
**Fix:** Use the same `importOriginal` spread form as `security.boundaries.test.js:60-69`.

---

_Reviewed: 2026-09-09T14:10:22Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
