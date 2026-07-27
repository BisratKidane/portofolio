---
quick_id: 260727-tb1
slug: member-provenance-isalive
status: complete
date: 2026-07-27
---

# Member provenance + isAlive — Summary

Test-first addition of member provenance tracking and an isAlive living-status flag
(replacing the deathdate field), with an admin toggle in both admin surfaces.

## What shipped

### Backend (`2473c7c`)
- `FamilyMember.isAlive` (bool, default true); legacy `deathdate` column **kept** but
  dropped from the GraphQL API (type + both inputs).
- `createdByUser` / `updatedByUser` associations (FKs, `ON DELETE SET NULL`) + a
  `userById` loader.
- Every create site (addParent/addSpouse/addChild/addSibling + linkUserToMember) stamps
  `createdByUserId`; `editMember` stamps `updatedByUserId`.
- `createdBy` / `updatedBy` resolve **only for ADMIN** viewers (mirrors linkedUser
  gating); `createdAt` / `updatedAt` exposed.
- 6 new provenance/isAlive tests.

### Frontend (`4a4321e`)
- `MemberFields`: Deathdate date-picker → **Living** switch; Add/Edit forms carry isAlive.
- `MemberNode` / `MemberDetailPanel`: address + lifespan keyed off isAlive; detail panel
  shows Living/Deceased and an **admin-only "Mark as deceased/living"** toggle.
- `FamilyTreePage`: query isAlive; admin toggle patches the member in place (drawer stays
  open, no full reload).
- `AdminMemberTable`: per-row **Living** toggle + **Added by** / **Last edited by**
  provenance columns; `ManagePage` wires the toggle and selects isAlive + provenance.

### Migration + docs
- `backend/migrations/manual/014-add-family-members-isalive-and-provenance.sql` — adds
  isAlive + createdByUserId/updatedByUserId (FKs), backfills `isAlive = deathdate IS NULL`,
  keeps deathdate. Documented in README under Manual Database Migrations.

## Decisions (from user)
- History depth: **last editor + creator** (no audit-log table).
- Death dates: **keep the column, hide it** (backfill isAlive, don't drop deathdate).
- Toggle location: **both** /manage list and /family detail panel.
- Provenance visibility: **admins only**.

## Tests
- Backend: 6 new provenance/isAlive tests; suite green except the 2 pre-existing
  MariaDB-only concurrency tests (CI runs MySQL 8.4).
- Frontend: full suite green (235), incl. new switch/toggle/provenance coverage across
  MemberFields, AdminMemberTable, MemberDetailPanel.

## Not deployed
On branch `member-provenance-isalive` (stacked on `dashboard-user-management`). Awaiting
review. **Deploy note:** run migration 014 on the server DB **before** the new backend
starts, or it will error on `Unknown column 'isAlive'`.
