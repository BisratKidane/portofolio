# Phase 16: Photo Upload - Context

**Gathered:** 2026-07-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can upload a profile picture for a family member **within their editable scope**, stored durably on a mounted Docker volume and served through a dedicated, hardened backend route. The photo displays on that member across the app. Scope is limited to: a `profilePicture` field on `FamilyMember`, a new upload route, a new serving route, adversarial-upload hardening, and the avatar/upload UI on the existing member surfaces.

**Not in this phase:** multi-photo galleries, photo albums, image editing beyond a pre-upload crop, cropping/transforming server-side, CDN/external object storage (S3 etc.), or photos for anything other than a `FamilyMember`.

</domain>

<decisions>
## Implementation Decisions

### Upload control & UX
- **D-01:** The upload entry point is **clicking the member's avatar on `MemberCard`** — opens a native file picker.
- **D-02:** After a file is selected, show a **crop/preview dialog** before the upload is committed. The user frames the image; the cropped result (a client-produced image blob) is what gets uploaded. Crop output must be one of the accepted formats (see D-05).
- **D-03:** `EditMemberDialog` is **not** the upload entry point — the avatar-click flow is the single control. (EditMemberDialog remains for plain-field edits.)

### Formats, size & storage form
- **D-04:** Accept **JPEG, PNG, and WebP**. Max upload size **5 MB** (post-crop).
- **D-05:** **Store the uploaded bytes as-is** — no server-side re-encoding/normalization. The crop is client-side; the server persists the received file unchanged.
- **D-06:** Because files are stored as-is (re-encoding is NOT neutralizing malformed/polyglot files), content-type validation on the server **MUST sniff the real type from magic bytes**, not trust the multipart `Content-Type` header or the filename extension (PHOTO-03). This is a hard constraint for research/planning — see Deferred/Risks note.

### Photo visibility when served
- **D-07:** Served photos are gated to **any logged-in user** (a valid JWT is required to load a photo) — there is **no per-member view-scope check** on the serving route. All authenticated app users are treated as trusted family for *viewing*.
- **D-08:** *Uploading* remains gated to the member's **editable scope** (carried forward from Phase 14/15 `computeEditableScope`) — viewing is broad, writing is scoped.
- **D-09:** The exact serving mechanism that lets an `<img>` tag carry auth (e.g., short-lived signed URL, token query param, or auth cookie — plain `<img src>` cannot send an `Authorization` header) is a **research decision**, not locked here. The locked policy is "valid JWT required to view."

### Empty & replace states
- **D-10:** When a member has no photo, show a **generic person icon** placeholder (not initials).
- **D-11:** Users (within editable scope) can both **replace** and **remove** a photo. Removing reverts to the generic-icon placeholder. Removal/replacement should clean up the prior stored file (no orphaned blobs).

### Claude's Discretion
- Route paths/naming, multipart parser choice (multer vs busboy), the `profilePicture` column's exact representation (stored filename/key vs relative URL), crop-library choice, and the serving-auth mechanism (per D-09) are left to research/planning.
- Storage layout under the volume (flat with UUID names vs sharded dirs) is Claude's discretion, provided filenames are **server-generated** (never derived from client input) per PHOTO-03.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — PHOTO-01, PHOTO-02, PHOTO-03, QUAL-01 (the four requirements this phase validates).
- `.planning/ROADMAP.md` §"Phase 16: Photo Upload" — goal + 4 success criteria (dedicated route, named-volume persistence, adversarial-uploads-rejected-as-first-red-tests, TDD coverage).

### Prior-phase decisions to honor (scope + member surfaces)
- `.planning/phases/14-relationship-resolvers-permission-scoping-query-safety/14-CONTEXT.md` — `computeEditableScope` semantics that gate who may upload for a member (D-08).
- `.planning/phases/15-sibling-dedup-guard-manage-self-service-ui/15-CONTEXT.md` — `/manage` surfaces and the MemberCard/EditMemberDialog contracts the avatar-upload control attaches to.

### Codebase maps
- `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STACK.md`, `.planning/codebase/CONVENTIONS.md`, `.planning/codebase/TESTING.md` — Express+Apollo wiring, ESM/workspace conventions, Vitest patterns.

No external ADRs/specs beyond the above — decisions are captured inline here.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/components/manage/MemberCard.jsx` — hosts the avatar the upload click attaches to (Phase 15). MUI `Avatar` conventions already in use → generic-icon placeholder (D-10) fits naturally.
- `frontend/src/components/manage/EditMemberDialog.jsx` — precedent for a member-scoped dialog; the crop/preview dialog can mirror its structure.
- `frontend/src/api/graphqlClient.js` — axios client that already attaches the JWT `Authorization: Bearer` header; a multipart upload helper can reuse the same token source (but is a new, separate transport — the existing client is JSON-only).
- `backend/src/utils/auth.js` — `getUserFromRequest` / JWT verify; the new upload + serving routes need their own JWT verification since they bypass the Apollo `context` function.
- `backend/src/services/familyMember.service.js` + `computeEditableScope` — reuse for the upload authorization check (D-08).

### Established Patterns
- Backend is Apollo-GraphQL-only today (`backend/src/server.js` mounts `/health` + `/graphql`). The upload/serving routes are **new plain Express routes** mounted alongside `expressMiddleware` — a genuine architectural addition, not an extension of a resolver.
- No file-upload dependencies exist yet (`multer`/`sharp`/`file-type`/`graphql-upload` all absent) — all net-new.
- `FamilyMember` model has **no `profilePicture` column** — a new nullable field is required (Sequelize `sync`, consistent with prior phases; watch schema-drift gate).
- TDD red-green is the project norm (QUAL-01) — adversarial upload tests (path-traversal filename, mislabeled content-type, oversized file) must be the **first red tests**, before any happy-path upload test (Success Criterion #3).

### Integration Points
- `docker-compose.yml` — `mysql_data` named volume exists; a **new named volume** must be mounted into the `backend` service for uploads (PHOTO-02 persistence across rebuilds). Backend service currently has no volume mount.
- Member display surfaces (`MemberCard`, relationship panels, admin table) consume the served photo URL.

</code_context>

<specifics>
## Specific Ideas

- Security posture leans on validation, not re-encoding (D-05/D-06): the "store as-is" choice makes **magic-byte content sniffing** and a **server-generated filename** the load-bearing defenses. Research should treat the multipart header and client filename as untrusted.
- Viewing is deliberately broad (any logged-in user, D-07) while writing stays scope-gated (D-08) — a conscious privacy/simplicity trade-off for a trusted-family app.

</specifics>

<deferred>
## Deferred Ideas

- **Server-side re-encoding / EXIF stripping / thumbnail generation** — considered but explicitly deferred by D-05 (store as-is). If a future phase wants normalized/derived images or metadata scrubbing, that's its own scope. Research should still *note* the residual EXIF-retention and malformed-file risk that store-as-is carries.
- **Per-member photo view privacy** — the option to gate viewing to in-scope/linked users was considered and rejected for this phase (D-07). Revisit if the app ever serves non-family users.
- **External object storage / CDN (S3 etc.)** — out of scope; this phase uses a mounted Docker volume per PHOTO-02.

</deferred>

---

*Phase: 16-photo-upload*
*Context gathered: 2026-07-23*
