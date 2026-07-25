# Requirements: Portfolio Auth App — v2.0 Collaborative Family Tree

**Defined:** 2026-07-21
**Core Value:** Changes to the app can be made with confidence — auth and core flows are protected by an automated test suite that fails loudly (locally and in CI) before broken code ships.

**Milestone goal:** Add a family-tree domain where app access is gated on being an admin-linked member; members collaboratively add/edit their immediate relatives on `/manage`, and any linked member views a deep, pan/zoom tree on `/family` — built test-first (TDD) with CI staying green.

## v1 Requirements

Requirements for this milestone (v2.0). Each maps to exactly one roadmap phase (see Traceability).

### Member Records (MEM)

- [x] **MEM-01**: A user can create a family member with required `firstname`, `lastname`, and `gender` (one of Male / Female / Other).
- [x] **MEM-02**: A member record captures optional `mothersname`, `email`, `birthdate`, `deathdate`, `phone`, and `address`.
- [x] **MEM-03**: A member's `fullname` is displayed as a derived combination of `firstname` + `lastname` (not entered or stored as separate input).
- [x] **MEM-04**: A user can edit the fields of a family member that is within their permitted scope.
- [x] **MEM-05**: Family members are persisted in MySQL via a new Sequelize model that follows the existing barrel/model conventions.

### Relationships (REL)

- [x] **REL-01**: A user can set a member's parents (mother and/or father) by linking to existing members or creating them.
- [x] **REL-02**: A user can link two members as spouses, and the relationship reads correctly from either side (symmetric).
- [x] **REL-03**: A user can add a child to a member, establishing the parent→child link.
- [x] **REL-04**: Siblings are derived from shared parents (never stored) and presented as such.
- [x] **REL-05**: The system rejects any relationship edit that would create a cycle (a member cannot become their own ancestor).
- [x] **REL-06**: The system blocks creating/linking a child whose `firstname` duplicates an existing child that shares **either** parent (any-shared-parent scope).

### Access & Account Linking (ACC)

- [x] **ACC-01**: A registered, email-verified user with no linked member sees a "pending — awaiting admin linking" gate and cannot reach family data.
- [x] **ACC-02**: An admin can link a user account to a family member node, granting that user member access.
- [x] **ACC-03**: The first-verified-user ADMIN keeps access without a linked member (explicit carve-out) and can self-link to their own member node.
- [x] **ACC-04**: A backend guard (`requireFamilyAccess`: linked-member-or-ADMIN) enforces access on every family query and mutation server-side, not only in the frontend.
- [x] **ACC-05**: The `User↔FamilyMember` link is added to the existing `users` table via a tracked manual `ALTER` + boot-verify step (not assumed to apply via `sync()`).

### Permissions & Scoping (PERM)

- [x] **PERM-01**: A member-user can add their immediate relatives — parents, spouse, children, and siblings.
- [x] **PERM-02**: A member-user can edit the fields and relationships of members within their immediate-relative set.
- [x] **PERM-03**: A member-user cannot remove any member; removal is admin-only. (The member→admin removal-request flow is deferred — see v2.)
- [x] **PERM-04**: An admin can add, edit, and remove any member across the whole tree.
- [x] **PERM-05**: The backend computes each member-user's editable immediate-relative set and enforces it in resolvers (no client-supplied scope is trusted).

### Photos (PHOTO)

- [x] **PHOTO-01**: A user can upload a `profilePicture` for a member within their scope.
- [x] **PHOTO-02**: Uploaded photos are stored on a mounted Docker volume and served via a backend route, persisting across container rebuilds.
- [x] **PHOTO-03**: Uploads are validated for content-type and size, and stored with safely generated filenames (no path traversal).

### Manage Page — /manage (MNG)

- [x] **MNG-01**: A member-user sees a visible list of the family members within their editable scope on `/manage`.
- [x] **MNG-02**: A user can add/edit members and wire relationships (parents, spouse, children) through forms that pick existing members from dropdowns.
- [x] **MNG-03**: An admin can manage the whole tree from `/manage`, including linking user accounts to member nodes.
- [x] **MNG-04**: `/manage` is reachable only by linked members (scoped view) and admins (full view); unlinked users are gated out.

### Family Visualization — /family (TREE)

- [x] **TREE-01**: A linked member can view the family as a tree on `/family`, with spouses shown paired.
- [ ] **TREE-02**: The tree supports pan/zoom and collapsible/expandable branches so a deep (~10–23 generation) lineage is navigable.
- [x] **TREE-03**: The tree is populated by a single flat whole-graph query assembled client-side (no per-node N+1).
- [ ] **TREE-04**: `/family` is reachable only by linked members and admins.

### Testing & CI (QUAL)

- [x] **QUAL-01**: New backend models, resolvers, and the upload route are covered by unit + integration tests, written test-first (TDD red-green).
- [ ] **QUAL-02**: New frontend pages/components (`/manage`, `/family`, the pending gate) are covered by component tests.
- [ ] **QUAL-03**: CI stays green across the milestone; the family-tree suite runs and is enforced on every push/PR.

## v2 Requirements

Deferred to a future release. Tracked but not in this roadmap.

### Invitations (INV)

- **INV-01**: An admin/member can email a registration link to a member whose email is known, pre-linking the new account to that member node.
- **INV-02**: A copy-paste registration link can be shared manually (e.g. via WhatsApp).
- **INV-03**: Automated WhatsApp invite sending (Business API / Twilio).

### Member-initiated Removal (RMV)

- **RMV-01**: A member-user can request removal of a member; an admin reviews and approves/denies.

### Richer Genealogy (GEN)

- **GEN-01**: Multiple marriages / remarriage over time as first-class data.
- **GEN-02**: Half-siblings, step-relations, and adoptions as first-class relationship types.

### Tree Editing & Curation (CUR)

- **CUR-01**: Inline editing directly from a tree node on `/family`.
- **CUR-02**: Duplicate-member detection and admin merge tooling.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Invitation / registration links (email + WhatsApp) | Deferred to v2; access this milestone is admin-linking only |
| Automated WhatsApp integration | External, approval-gated, usually paid dependency — out of a portfolio milestone |
| Member-initiated removal flow | Members add/edit only; removal is admin-only this milestone (request flow deferred) |
| Full genealogy (multiple marriages, half-siblings, adoptions as first-class) | Model supports one mother/father + spouse; richer genealogy is its own milestone |
| Inline tree-editing from `/family` nodes | `/manage` (list + forms) is the edit surface this milestone |
| Duplicate merge tooling | Prevention (visible list + firstname rule) suffices at single-family scale; merge is crowd-scale cure |
| Object-storage photos (S3/Cloudinary) | Local Docker volume chosen; external buckets deferred |
| GEDCOM import/export | Not needed for a hand-built single-family tree |
| Browser E2E (Playwright/Cypress) | Backend integration + frontend component tests meet the safety-net bar |
| Real family-data entry (the Agne lineage) | Tooling ships this milestone; data is entered afterward using it (a small seed exists only for tests/demo) |
| Live email-provider account | Deployment concern; the v1.1 pluggable mailer stays as-is |

## Traceability

Which phase covers which requirement.

| Requirement | Phase | Status |
|-------------|-------|--------|
| MEM-01 | Phase 12 | Complete |
| MEM-02 | Phase 12 | Complete |
| MEM-03 | Phase 12 | Complete |
| MEM-04 | Phase 14 | Complete |
| MEM-05 | Phase 12 | Complete |
| REL-01 | Phase 12 | Complete |
| REL-02 | Phase 12 | Complete |
| REL-03 | Phase 12 | Complete |
| REL-04 | Phase 14 | Complete |
| REL-05 | Phase 12 | Complete |
| REL-06 | Phase 15 | Complete |
| ACC-01 | Phase 13 | Complete |
| ACC-02 | Phase 13 | Complete |
| ACC-03 | Phase 13 | Complete |
| ACC-04 | Phase 13 | Complete |
| ACC-05 | Phase 13 | Complete |
| PERM-01 | Phase 14 | Complete |
| PERM-02 | Phase 14 | Complete |
| PERM-03 | Phase 14 | Complete |
| PERM-04 | Phase 14 | Complete |
| PERM-05 | Phase 14 | Complete |
| PHOTO-01 | Phase 16 | Complete |
| PHOTO-02 | Phase 16 | Complete |
| PHOTO-03 | Phase 16 | Complete |
| MNG-01 | Phase 15 | Complete |
| MNG-02 | Phase 15 | Complete |
| MNG-03 | Phase 15 | Complete |
| MNG-04 | Phase 15 | Complete |
| TREE-01 | Phase 17 | Complete |
| TREE-02 | Phase 17 | Pending |
| TREE-03 | Phase 17 | Complete |
| TREE-04 | Phase 17 | Pending |
| QUAL-01 | Phase 16 | Complete |
| QUAL-02 | Phase 17 | Pending |
| QUAL-03 | Phase 17 | Pending |

**Coverage:**
- v1 requirements: 35 total (corrected from the initial "34" header count during roadmap creation — the actual requirement list below contains 35 IDs across MEM×5, REL×6, ACC×5, PERM×5, PHOTO×3, MNG×4, TREE×4, QUAL×3)
- Mapped to phases: 35/35 ✓
- Unmapped: 0 ✓

**Phase summary:**
- Phase 12 (Family Data Model Foundation): 8 requirements — MEM-01, MEM-02, MEM-03, MEM-05, REL-01, REL-02, REL-03, REL-05
- Phase 13 (Membership Gating & Account Linking): 5 requirements — ACC-01..05
- Phase 14 (Relationship Resolvers, Permission Scoping & Query Safety): 7 requirements — MEM-04, REL-04, PERM-01..05
- Phase 15 (Sibling Dedup Guard & /manage Self-Service UI): 5 requirements — REL-06, MNG-01..04
- Phase 16 (Photo Upload): 4 requirements — PHOTO-01..03, QUAL-01
- Phase 17 (/family Deep Tree Visualization): 6 requirements — TREE-01..04, QUAL-02, QUAL-03

---
*Requirements defined: 2026-07-21*
*Last updated: 2026-07-21 after roadmap creation (Phases 12–17), 100% traceability coverage confirmed*
