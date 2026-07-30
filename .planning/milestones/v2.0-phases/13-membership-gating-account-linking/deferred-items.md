# Phase 13 — Deferred Code-Review Items

Source: `13-REVIEW.md` (standard-depth review, 2026-07-22).
Fixed in-phase (commits `13-05`): CR-01 (blocker), WR-01, WR-03.
The items below were triaged as non-blocking and deferred to a follow-up gap-closure phase.

| ID | Sev | Issue | File | Suggested fix |
|----|-----|-------|------|---------------|
| WR-02 | Warn | `unlinkedUsers` filters only on `familyMemberId: null`, so ADMIN accounts (never backfilled) and unverified users appear in the admin "waiting to link" list | `backend/src/resolvers/user.resolver.js` | Exclude `role: 'ADMIN'` and/or unverified users from the `unlinkedUsers` query, or surface status in the UI |
| WR-04 | Warn | Membership gate is enforced client-side (`ProtectedRoute`) + on `familyMember`/`familyMembers` resolvers, but the `dashboard` resolver still uses `requireAuth` only — defense-in-depth gap (no data leak today) | `backend/src/resolvers/*.resolver.js` | Apply `requireFamilyAccess` to `dashboard` and any other member-scoped resolvers |
| INFO-1 | Info | Admin `familyMembers` list can go stale after a create-and-link (new member not reflected without refetch) | `frontend/src/pages/AdminLinkMembers.jsx` | Refetch `familyMembers` after a successful create-and-link |
| INFO-2 | Info | A just-linked user can remain on `/pending` until client auth state refreshes (stale `me`) | `frontend/src/context/AuthContext.jsx` | Refresh `me` / re-fetch linkage after linking or on focus |
| INFO-3 | Info | MUI `Autocomplete` missing `isOptionEqualToValue` — console warning / equality edge cases | `frontend/src/pages/AdminLinkMembers.jsx` | Add `isOptionEqualToValue={(o, v) => o.id === v.id}` |

Route via `/gsd:phase` (add a gap-closure phase) or address in the next family-tree milestone phase.
