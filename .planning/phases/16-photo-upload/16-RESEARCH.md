# Phase 16: Photo Upload - Research

**Researched:** 2026-07-23
**Domain:** Multipart file upload, magic-byte content validation, authenticated static-asset serving, Docker volume persistence, client-side image cropping (Node/Express/Apollo/MySQL + React/MUI stack)
**Confidence:** HIGH (backend upload/validation mechanics, Docker volume, TDD/test-harness fit) / MEDIUM (D-09 serving-auth mechanism choice — a genuine architectural tradeoff, not a single "correct" answer; crop-library choice)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Upload control & UX
- **D-01:** The upload entry point is **clicking the member's avatar on `MemberCard`** — opens a native file picker.
- **D-02:** After a file is selected, show a **crop/preview dialog** before the upload is committed. The user frames the image; the cropped result (a client-produced image blob) is what gets uploaded. Crop output must be one of the accepted formats (see D-05).
- **D-03:** `EditMemberDialog` is **not** the upload entry point — the avatar-click flow is the single control. (EditMemberDialog remains for plain-field edits.)

#### Formats, size & storage form
- **D-04:** Accept **JPEG, PNG, and WebP**. Max upload size **5 MB** (post-crop).
- **D-05:** **Store the uploaded bytes as-is** — no server-side re-encoding/normalization. The crop is client-side; the server persists the received file unchanged.
- **D-06:** Because files are stored as-is (re-encoding is NOT neutralizing malformed/polyglot files), content-type validation on the server **MUST sniff the real type from magic bytes**, not trust the multipart `Content-Type` header or the filename extension (PHOTO-03). This is a hard constraint for research/planning — see Deferred/Risks note.

#### Photo visibility when served
- **D-07:** Served photos are gated to **any logged-in user** (a valid JWT is required to load a photo) — there is **no per-member view-scope check** on the serving route. All authenticated app users are treated as trusted family for *viewing*.
- **D-08:** *Uploading* remains gated to the member's **editable scope** (carried forward from Phase 14/15 `computeEditableScope`) — viewing is broad, writing is scoped.
- **D-09:** The exact serving mechanism that lets an `<img>` tag carry auth (e.g., short-lived signed URL, token query param, or auth cookie — plain `<img src>` cannot send an `Authorization` header) is a **research decision**, not locked here. The locked policy is "valid JWT required to view." *(See this document's D-09 recommendation: fetch-blob-to-objectURL.)*

#### Empty & replace states
- **D-10:** When a member has no photo, show a **generic person icon** placeholder (not initials).
- **D-11:** Users (within editable scope) can both **replace** and **remove** a photo. Removing reverts to the generic-icon placeholder. Removal/replacement should clean up the prior stored file (no orphaned blobs).

### Claude's Discretion
- Route paths/naming, multipart parser choice (multer vs busboy), the `profilePicture` column's exact representation (stored filename/key vs relative URL), crop-library choice, and the serving-auth mechanism (per D-09) are left to research/planning.
- Storage layout under the volume (flat with UUID names vs sharded dirs) is Claude's discretion, provided filenames are **server-generated** (never derived from client input) per PHOTO-03.

### Deferred Ideas (OUT OF SCOPE)
- **Server-side re-encoding / EXIF stripping / thumbnail generation** — considered but explicitly deferred by D-05 (store as-is). If a future phase wants normalized/derived images or metadata scrubbing, that's its own scope. Research should still *note* the residual EXIF-retention and malformed-file risk that store-as-is carries. *(See Pitfall 5.)*
- **Per-member photo view privacy** — the option to gate viewing to in-scope/linked users was considered and rejected for this phase (D-07). Revisit if the app ever serves non-family users.
- **External object storage / CDN (S3 etc.)** — out of scope; this phase uses a mounted Docker volume per PHOTO-02.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|--------------------|
| PHOTO-01 | A user can upload a `profilePicture` for a member within their scope. | Pattern 1/2 (reused `getUserFromRequest` + `computeEditableScope` authz on the new upload route); Validation Architecture maps this to the happy-path + outside-scope integration tests. |
| PHOTO-02 | Uploaded photos are stored on a mounted Docker volume and served via a backend route, persisting across container rebuilds. | Docker Compose Change subsection (new `photo_uploads` named volume mirroring `mysql_data`); Pattern 1 (serving route); Environment Availability confirms Docker/Compose present for the rebuild-persistence check. |
| PHOTO-03 | Uploads are validated for content-type and size, and stored with safely generated filenames (no path traversal). | Standard Stack (`multer` memoryStorage + `file-type` magic-byte sniff), Pattern 2 (post-parse validation gate), `crypto.randomUUID()` filenames, Pitfall 1 (never read `originalname`), Code Examples (all three adversarial vectors). |
| QUAL-01 | New backend models, resolvers, and the upload route are covered by unit + integration tests, written test-first (TDD red-green). | Validation Architecture (full Phase Requirements → Test Map, Wave 0 Gaps); adversarial-tests-first ordering explicitly called out in Code Examples and Validation Architecture's QUAL-01 row. |
</phase_requirements>

## Summary

This phase adds the app's first non-GraphQL, non-JSON HTTP surface: two plain Express routes (upload, serve) that sit alongside `expressMiddleware(apollo)` in `backend/src/server.js`, sharing its JWT-verification utility (`getUserFromRequest`) but bypassing the Apollo `context` factory entirely. The backend stack for this is well-established and low-risk: **multer** (memory storage, not disk storage) parses the multipart body, **file-type** sniffs the real format from magic bytes after multer hands over the buffer, and a server-generated filename (`node:crypto`'s built-in `randomUUID()` — already the pattern used in `backend/src/utils/auth.js` for reset/verification tokens, no new dependency needed) is the only name ever written to disk. All three candidate packages (`multer`, `file-type`, `react-easy-crop`) were verified against their official GitHub READMEs and passed `slopcheck` with an `[OK]` verdict — see the Package Legitimacy Audit.

The one genuinely open architectural question is D-09: how a plain `<img>` tag gets authenticated access to a JWT-gated route. Of the four options CONTEXT.md lists, **fetch-blob-to-objectURL** is the strongest fit for this codebase specifically because it requires **zero new backend auth mechanism** — the serving route reuses `getUserFromRequest` completely unchanged (same as every other authenticated request today), and the frontend reuses the exact `Authorization: Bearer <token>` pattern already centralized in `graphqlClient.js`, just with `axios.get(url, { responseType: 'blob' })` instead of a GraphQL POST. The alternatives (signed URL, raw-JWT-in-query-param, auth cookie) each require inventing a mechanism this stateless-JWT, no-cookie, no-session app doesn't otherwise have.

Storage is a flat directory of UUID-named files under a new named Docker volume (mirroring the existing `mysql_data` precedent), with the `family_members.profilePicture` column holding only the generated filename — never a client-supplied name, never a full path. Because `family_members` is a pre-existing table (created in Phase 12), adding this column requires the same manual-`ALTER` + integration-test-"boot-verify" pattern already used for `users.familyMemberId` in Phase 13 (012 migration) — `sequelize.sync()` only auto-creates the column on a fresh/test database, never alters an already-provisioned one.

**Primary recommendation:** multer (memoryStorage) + file-type (post-parse magic-byte sniff, reject on mismatch/undefined) + crypto.randomUUID() filenames + a new named `photo_uploads` Docker volume + fetch-blob-to-objectURL for authenticated `<img>` rendering + react-easy-crop for the pre-upload crop dialog. Write the three adversarial tests (path-traversal filename, mislabeled content-type, oversized file) against the upload route via `supertest` **before** any happy-path test, per Success Criterion #3.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Avatar click → native file picker | Browser / Client | — | Pure UI (D-01); no server round-trip until a file is chosen |
| Crop/preview dialog, canvas→blob crop | Browser / Client | — | D-02/D-05: cropping happens client-side; server never re-encodes, so this is the only place image transformation occurs |
| Upload route: authz (editable scope), multipart parse, magic-byte validation, filename generation | API / Backend | — | PHOTO-01/03, D-06/D-08: the entire security boundary (who may write, what may be written) must be server-enforced; client input (Content-Type, filename, extension) is never trusted here |
| Serving route: JWT verification, file stream | API / Backend | — | D-07: every photo read requires a valid JWT, checked the same way as every other authenticated backend operation |
| `profilePicture` filename/key | Database (MySQL, `family_members` row) | — | A small pointer column; the bytes themselves are deliberately NOT in MySQL |
| Persisted photo bytes | Storage (Docker named volume, backend filesystem) | — | PHOTO-02: must survive container rebuild — the writable container layer does not, and MySQL is the wrong place for binary blobs at this scale |
| Object-URL creation/lifecycle for `<img>` rendering | Browser / Client | — | D-09 (fetch-blob-to-objectURL): the browser does the authenticated fetch and manages `URL.createObjectURL`/`revokeObjectURL`; no server-side signing scheme needed |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|---------------|
| `multer` | ^2.2.0 [VERIFIED: npm registry] | Express multipart/form-data middleware; parses the upload into `req.file` | The de facto standard Express file-upload middleware (maintained under the `expressjs` GitHub org); internally wraps `busboy` (confirmed via `npm view multer dependencies` — `busboy: ^1.6.0` is a transitive dep), giving multer's simpler high-level API without giving up busboy's streaming parser underneath. Using multer directly (rather than wiring busboy by hand) is the appropriate level of abstraction for a single dedicated route, not a general upload framework. |
| `file-type` | ^22.0.1 [VERIFIED: npm registry] | Detects real file type from magic bytes (`fileTypeFromBuffer`) | Purpose-built for exactly D-06's hard constraint — it reads binary signatures, not the multipart `Content-Type` header or filename extension. Confirms `image/jpeg`, `image/png`, `image/webp` are all in its supported-format list. **ESM-only** (`"type": "module"` in its own package.json) — confirmed compatible: this backend already uses `"type": "module"` throughout (`backend/package.json`), and `file-type`'s `engines.node` requires `>=22`, comfortably satisfied by this project's actual Node 24.x runtime (see Assumptions Log A1 re: the CLAUDE.md Node-18 vs actual-24.x discrepancy). |
| `react-easy-crop` | ^6.2.2 [VERIFIED: npm registry] | Pre-upload crop/zoom UI component (D-02) | Small, framework-agnostic (plain `style`/`classes` props, no CSS-in-JS conflict with MUI/Emotion), actively maintained (published 2026-07-08), React peer range `>=16.4.0` covers this project's React 18.3. `onCropComplete` returns pixel-accurate crop bounds; the actual crop (drawing the source image onto a `<canvas>` at those bounds, then `canvas.toBlob()`) is a small amount of unavoidable custom code the library does not — and by design should not — hide, since the output format/quality (D-04: JPEG/PNG/WebP under 5MB) is an app-level decision. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:crypto` (`randomUUID`) | Node 24 built-in, zero install | Server-generated storage filenames (PHOTO-03) | Already the established pattern in this codebase — `backend/src/utils/auth.js` imports `crypto from 'node:crypto'` for `createResetToken`/`createVerificationToken`. Reuse it here instead of adding the already-declared-but-unused `uuid` npm dependency (confirmed via grep: `uuid` is in `backend/package.json` but has zero call sites anywhere in `backend/src`) — one less thing to explain, and it is exactly the kind of "existing pattern" CONVENTIONS.md documents. |
| `supertest` (existing devDependency, ^7.2.2) | Already installed | Drives multipart HTTP requests in tests | `.attach(field, buffer, { filename, contentType })` lets a test buffer supply real image bytes while independently overriding the declared multipart `Content-Type` header — exactly the tool needed for the "mislabeled content-type" adversarial vector (CITED, confirmed supported since supertest 3.x; this project is on 7.2.2). |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `multer` | `busboy` directly | Busboy is multer's own underlying parser — using it directly means hand-rolling stream buffering, size-limit enforcement, and field/file separation multer already provides. Only worth it for a general-purpose streaming upload service with many upload routes; this phase has exactly one. |
| `file-type` | Hand-rolled magic-byte checks (compare first N bytes to known signatures) | This is precisely the "don't hand-roll" case — `file-type` covers 350+ formats' signatures, is fuzz-tested, and is trivially wrong to get right by hand (e.g. WebP's signature is a RIFF container with a `WEBP` fourCC at a specific offset, not a single fixed magic number). |
| `react-easy-crop` | `react-image-crop` (`^11.1.2` [VERIFIED: npm registry]) | Both are viable and MUI-compatible. `react-image-crop` renders a DOM-based crop overlay (no canvas until you extract the crop yourself, same as `react-easy-crop`); `react-easy-crop` was chosen for its simpler pinch-zoom+pan interaction model, which suits a single circular/square avatar crop better than `react-image-crop`'s free-form rectangle-resize UX. Either is a reasonable Claude's-Discretion swap if the planner prefers `react-image-crop`'s API. |
| fetch-blob-to-objectURL (D-09) | Signed short-lived URL / raw-JWT-in-query-param / auth cookie | See the dedicated D-09 subsection below — this is the phase's one real either-or decision, not a minor substitution. |

**Installation:**
```bash
npm install multer file-type react-easy-crop --workspace backend --workspace frontend
# more precisely, split by workspace:
npm install multer file-type --workspace backend
npm install react-easy-crop --workspace frontend
```

**Version verification:** confirmed live against the npm registry during this research session:
```
npm view multer version          -> 2.2.0   (no "type" field; CommonJS, imports fine under Node ESM via default import)
npm view file-type version       -> 22.0.1  (type: module; engines.node >= 22)
npm view react-easy-crop version -> 6.2.2   (peerDependencies: react/react-dom >= 16.4.0)
```
All three last-published in 2026 (multer: 2026-06-15, file-type: 2026-04-09, react-easy-crop: 2026-07-08) — actively maintained, not stale.

## Package Legitimacy Audit

`slopcheck` was installed and run successfully against all three candidate packages during this research session.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|--------------|-----------|-------------|
| `multer` | npm | 11+ yrs (first published 2014) | very high (foundational Express ecosystem package) | github.com/expressjs/multer | [OK] | Approved |
| `file-type` | npm | 10+ yrs, actively released (v22, 2026-04) | very high | github.com/sindresorhus/file-type | [OK] | Approved |
| `react-easy-crop` | npm | several years, actively released (v6, 2026-07) | moderate-high | github.com/9elements/react-easy-crop | [OK] | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

No `postinstall` scripts were found on any of the three packages (`npm view <pkg> scripts.postinstall` returned empty for all).

> **Process note for the planner:** running `slopcheck install <pkg>` actually executes a real `npm install` as a side effect (not a dry-run check) — during this research session it modified the **repo-root** `package.json`/`package-lock.json` (installing all three packages as root-level, non-workspace dependencies). This was caught and reverted (`git checkout -- package.json package-lock.json`) before finishing research; the repo is clean. When the planner/executor actually installs these packages for real, install them **scoped to the correct workspace** (`--workspace backend` / `--workspace frontend`), not at the repo root.

## Architecture Patterns

### System Architecture Diagram

```text
Browser (MemberCard avatar click)
        │
        ▼
  [native file picker] ──selected file──▶ [Crop dialog: react-easy-crop]
                                                   │ onCropComplete(pixelCrop)
                                                   ▼
                                     [canvas draw + toBlob()] → cropped Blob
                                                   │  (JPEG/PNG/WebP, <5MB, D-04)
                                                   ▼
                         axios.post('/api/family-members/:id/photo',
                                    FormData{photo: blob},
                                    { headers: Authorization: Bearer <jwt> })
                                                   │  HTTP multipart
                                                   ▼
┌──────────────────────────── Backend (Express, plain route — NOT Apollo) ─────┐
│  POST /api/family-members/:id/photo                                          │
│   1. getUserFromRequest(req, models)  ──(reused from backend/src/utils/auth)  │
│   2. requireFamilyAccess(user)                                                │
│   3. isAdmin ? skip : computeEditableScope(user.familyMemberId).ids.has(id)   │
│   4. multer.single('photo')  → req.file.buffer  (memoryStorage; NEVER trust  │
│      req.file.originalname or req.file.mimetype past this point)             │
│   5. fileTypeFromBuffer(req.file.buffer) → sniff magic bytes                  │
│        - undefined OR mime not in {jpeg,png,webp} → 400 reject (PHOTO-03)     │
│   6. crypto.randomUUID() + verified-ext  → server-generated filename          │
│   7. fs.writeFile(newPath, buffer)                                            │
│   8. FamilyMember.update({ profilePicture: filename }) inside a transaction   │
│   9. best-effort fs.unlink(oldPath) if a previous photo existed (D-11)        │
└────────────────────────────────────────────────────────────────────────────┘
                                                   │
                                                   ▼
                                   [Docker named volume: photo_uploads]
                                   /app/backend/storage/photos/<uuid>.<ext>
                                                   │
                                                   ▼ (on view)
┌──────────────────────────── Backend (Express, plain route) ──────────────────┐
│  GET /api/family-members/:id/photo                                           │
│   1. getUserFromRequest(req, models)                                         │
│   2. requireAuth(user)   ← D-07: ANY valid JWT, no scope check                │
│   3. FamilyMember.findByPk(id) → profilePicture filename or 404              │
│   4. res.type(mime).sendFile(path under the volume)                          │
└────────────────────────────────────────────────────────────────────────────┘
                                                   │  HTTP GET + Bearer header (blob)
                                                   ▼
                     axios.get(url, { responseType: 'blob' })
                                                   │
                                                   ▼
                        URL.createObjectURL(blob) → <Avatar src={objectUrl} />
                        (revoke on unmount / src change — cleanup effect)
```

### Recommended Project Structure

```
backend/
├── src/
│   ├── routes/                      # NEW — first non-Apollo route directory
│   │   └── photo.routes.js          # upload + serve route handlers, mounted in server.js
│   ├── services/
│   │   └── photoStorage.service.js  # NEW — filename generation, write/unlink, path resolution
│   ├── config/
│   │   └── photoStorage.js          # NEW — resolves storage dir (mirrors env.js's __dirname pattern)
│   ├── models/
│   │   └── FamilyMember.js          # + profilePicture: STRING, allowNull: true
│   └── schemas/, resolvers/         # + photoUrl computed field on FamilyMember type
├── migrations/manual/
│   └── 013-add-family-members-profile-picture.sql   # mirrors 012's precedent
└── storage/photos/                  # gitignored; volume-mounted in Docker, plain dir locally

frontend/
├── src/
│   ├── api/
│   │   └── photoClient.js           # NEW — axios GET with blob responseType + auth header reuse
│   ├── components/manage/
│   │   ├── MemberCard.jsx           # + avatar click → opens crop dialog
│   │   ├── PhotoCropDialog.jsx      # NEW — react-easy-crop wrapper, outputs a Blob
│   │   └── MemberAvatarImage.jsx    # NEW — fetch-blob-to-objectURL wrapper component
```

### Pattern 1: Reused JWT verification on a plain Express route (not Apollo context)

**What:** Both new routes call `getUserFromRequest(req, models)` directly — the exact function Apollo's `context` factory calls in `server.js` — instead of duplicating token-parsing logic.
**When to use:** Any new HTTP surface that needs the same auth semantics as the GraphQL API but isn't itself a GraphQL operation.
**Example:**
```javascript
// backend/src/routes/photo.routes.js
import { getUserFromRequest, requireAuth, requireFamilyAccess } from '../utils/auth.js';
import { computeEditableScope } from '../services/familyMember.service.js';

router.get('/family-members/:id/photo', async (req, res, next) => {
  try {
    const user = await getUserFromRequest(req, req.app.locals.models);
    requireAuth(user); // D-07: any valid JWT, no per-member scope check
    // ... look up FamilyMember, stream file, 404 if none
  } catch (err) {
    next(err);
  }
});
```

### Pattern 2: multer memoryStorage + post-parse magic-byte gate (never trust the header)

**What:** Configure multer with `memoryStorage()` (not `diskStorage()`) so the untrusted buffer never touches disk under a client-influenced name; sniff and validate AFTER multer hands back `req.file.buffer`.
**When to use:** Any upload route where D-06-style "don't trust Content-Type/extension" applies.
**Example:**
```javascript
// Source: multer README (github.com/expressjs/multer) + file-type README (github.com/sindresorhus/file-type)
import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';

const ACCEPTED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB, D-04

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 }
  // NOTE: no fileFilter authoritative check here — file.mimetype at this
  // stage is still the CLIENT-SUPPLIED multipart header. Reject/accept
  // decisions happen below, after the buffer is fully available.
});

router.post('/family-members/:id/photo', upload.single('photo'), async (req, res, next) => {
  try {
    if (!req.file) throw new Error('No file uploaded.');

    const detected = await fileTypeFromBuffer(req.file.buffer);
    if (!detected || !ACCEPTED_MIMES.has(detected.mime)) {
      return res.status(400).json({ error: 'Unsupported or unrecognized image format.' });
    }
    // detected.ext (e.g. "jpg"/"png"/"webp") is the ONLY extension ever used
    // to name the stored file -- req.file.originalname is never read again.
    // ... generate crypto.randomUUID() filename, write, update DB, cleanup old file
  } catch (err) {
    next(err);
  }
}, (err, req, res, next) => {
  // multer errors (e.g. LIMIT_FILE_SIZE) land here, NOT in the route body above --
  // must be a dedicated 4-arg Express error handler mounted right after the route.
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Upload rejected: ${err.code}` });
  }
  next(err);
});
```

### Pattern 3: Fetch-blob-to-objectURL for authenticated `<img>` rendering (D-09)

**What:** The frontend fetches the photo with the same `Authorization: Bearer` header used everywhere else, gets back a `Blob`, and renders it via `URL.createObjectURL`.
**When to use:** Whenever a plain `<img src>` needs to load from a JWT-gated route (this app has no other mechanism for that today).
**Example:**
```javascript
// frontend/src/components/manage/MemberAvatarImage.jsx (new)
import { useEffect, useState } from 'react';
import { Avatar } from '@mui/material';
import PersonIcon from '@mui/icons-material/Person'; // D-10 placeholder
import graphqlClient from '../../api/graphqlClient.js'; // reuse the SAME axios instance +
                                                          // its request interceptor that
                                                          // already attaches the Bearer header

export default function MemberAvatarImage({ member }) {
  const [objectUrl, setObjectUrl] = useState(null);

  useEffect(() => {
    if (!member.photoUrl) { setObjectUrl(null); return; }
    let currentUrl;
    let cancelled = false;

    graphqlClient
      .get(member.photoUrl, { baseURL: '', responseType: 'blob' }) // absolute path override
      .then((res) => {
        if (cancelled) return;
        currentUrl = URL.createObjectURL(res.data);
        setObjectUrl(currentUrl);
      });

    return () => {
      cancelled = true;
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [member.photoUrl]);

  return (
    <Avatar src={objectUrl ?? undefined} sx={{ width: 42, height: 42 }}>
      {!objectUrl && <PersonIcon />}
    </Avatar>
  );
}
```
Note: `graphqlClient`'s `baseURL` is set to the GraphQL endpoint (`normalizeGraphqlUrl`), so an absolute-path photo request needs `{ baseURL: '' }` or a second axios instance sharing the same interceptor logic — a small factoring decision left to the planner, but the auth-header-reuse mechanism itself is the load-bearing part of this pattern.

### Docker Compose Change (PHOTO-02)

```yaml
# docker-compose.yml — mirrors the existing mysql_data precedent
services:
  backend:
    # ...existing config unchanged...
    volumes:
      - photo_uploads:/app/backend/storage/photos   # NEW

volumes:
  mysql_data:
  photo_uploads:   # NEW
```
The mount path `/app/backend/storage/photos` matches `backend/Dockerfile`'s `WORKDIR /app/backend` (confirmed by reading the Dockerfile) — resolve the storage directory in code via `path.resolve(__dirname, ...)` from a `backend/src/config/` module (mirroring `env.js`'s own `__dirname`-relative resolution), never via `process.cwd()`, so the same relative path is correct whether launched by `npm start`, `nodemon`, or the Docker `CMD`.

### Anti-Patterns to Avoid

- **Trusting `req.file.mimetype` or `req.file.originalname` for anything persisted or decision-making:** both are 100% client-controlled multipart header values. `req.file.mimetype` is fine to log for debugging, never to gate on; `req.file.originalname` should never be read again after multer returns.
- **Using `multer.diskStorage()` for this route:** writing the untrusted buffer to disk under any client-influenced name (even transiently) before validation reopens exactly the path-traversal/arbitrary-write surface PHOTO-03 exists to close. `memoryStorage()` keeps the buffer in-process until the server has generated its own name.
- **Putting the magic-byte check inside multer's `fileFilter`:** `fileFilter` runs mid-stream, before the full buffer is necessarily available, and is designed for cheap per-part accept/reject (e.g. field name checks), not authoritative content validation. Do the `file-type` check as a separate step after `upload.single()` completes.
- **Re-encoding the image server-side "just to be safe":** explicitly rejected by D-05 — the crop is client-side, and store-as-is is the locked decision. Re-encoding would also silently satisfy a wrong assumption that it neutralizes malformed files (it does reduce *some* polyglot attacks, but D-06 already covers the actual PHOTO-03 requirement via magic-byte validation, and re-encoding is out of scope here).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Detecting real file type from bytes | A hand-rolled table of magic-byte signatures per accepted format | `file-type` (`fileTypeFromBuffer`) | Getting WebP's RIFF-container signature check right (not a single fixed byte sequence, but a container format with an offset-based fourCC) is exactly the kind of "looks simple, is subtly wrong" logic this library exists to own. |
| Multipart body parsing | Manual `busboy` wiring (stream buffering, part boundaries, size-limit enforcement) | `multer` (memoryStorage) | Multer already wraps `busboy` with the size-limit/error-code semantics (`MulterError`, `LIMIT_FILE_SIZE`) this phase needs; reimplementing it adds surface area with no benefit for a single route. |
| Crop UI (drag/zoom/pan interactions, pixel math) | A custom `<canvas>`-based drag-crop component | `react-easy-crop` | Touch/mouse gesture handling, aspect-ratio locking, and zoom-bounds math are exactly the kind of interaction code that's easy to get subtly wrong (especially on mobile); the library is small and does not hide the one part that must stay custom (the actual crop-to-blob canvas draw). |
| Server-generated unique filenames | A homegrown random-string generator | `node:crypto.randomUUID()` | Already a codebase convention (`backend/src/utils/auth.js`'s reset/verification tokens); cryptographically-strong, collision-resistant, zero new dependency. |

**Key insight:** every "don't hand-roll" item here maps directly to one of PHOTO-03's adversarial vectors — the pattern in this domain is that the naive/manual version of each of these (extension-based type checks, raw busboy streams, ad-hoc filename generation) is precisely what an adversarial upload test is designed to catch.

## Common Pitfalls

### Pitfall 1: Reading `req.file.originalname` anywhere after multer parses
**What goes wrong:** A stored filename or file-extension decision derived from the client-supplied name reopens path traversal (`../../etc/passwd`-style names) even if the upload route "looks" safe elsewhere.
**Why it happens:** `originalname` is a convenient, human-readable value; it's tempting to use it for the stored file's extension "since it's probably right anyway."
**How to avoid:** Never read `req.file.originalname` past the initial multer callback. Derive the extension exclusively from `file-type`'s detected `.ext`, and the base filename exclusively from `crypto.randomUUID()`.
**Warning signs:** Any `path.join`, `path.extname`, or template string that includes `req.file.originalname` or `req.body.filename`.

### Pitfall 2: Multer errors bypassing the route's own try/catch
**What goes wrong:** `upload.single('photo')` is Express middleware, not a function call inside your route handler — a `MulterError` (e.g. oversized file) is passed to Express's error pipeline, not thrown inside your route's `try/catch`. Wrapping only the route body in try/catch misses it, producing a raw 500 / Express default error page instead of a clean rejection.
**Why it happens:** It's easy to assume all failure modes surface inside the async route handler you wrote.
**How to avoid:** Add a dedicated 4-arg Express error-handling middleware immediately after the upload route (see Pattern 2's example) that checks `err instanceof multer.MulterError` and returns a structured 4xx response.
**Warning signs:** An adversarial oversized-file test that expects a 400 but gets a 500 or a hung/truncated connection.

### Pitfall 3: Orphaned files on replace/remove (D-11)
**What goes wrong:** Replacing or removing a photo updates the DB row but leaves the old file on disk forever, slowly filling the volume.
**Why it happens:** Deleting the old file is easy to forget because it's not "the happy path" of the request — the DB update alone makes the feature *look* like it works.
**How to avoid:** Sequence writes so the DB is the source of truth and the file delete is a deliberate, explicit best-effort step: (1) validate + write NEW file to disk under its new UUID name, (2) update the DB row to point at the new filename inside a transaction, (3) only after the DB update commits, `fs.unlink` the OLD filename (swallow `ENOENT`), (4) on removal, do the same without step 1. If the DB update in step 2 fails, delete the just-written new file so nothing is orphaned by a failed request either.
**Warning signs:** A test that replaces a photo twice and finds more than one file per member under the storage directory.

### Pitfall 4: `family_members.profilePicture` column silently missing on already-provisioned databases
**What goes wrong:** Adding `profilePicture` to the `FamilyMember` Sequelize model definition works perfectly in CI/tests (which run `sequelize.sync({ force: true, ... })` against a fresh test DB — confirmed in `backend/test/globalSetup.js`) but does nothing on an already-provisioned dev/staging/prod database, where `sync()` never alters existing tables.
**Why it happens:** This is the exact carry-forward blocker already logged in `.planning/STATE.md` for `users.familyMemberId` (Phase 13) — "CI's force-recreate can't surface the gap."
**How to avoid:** Follow the established `backend/migrations/manual/012-add-users-family-member-id.sql` precedent exactly: write a new `013-add-family-members-profile-picture.sql` with a plain `ALTER TABLE family_members ADD COLUMN profilePicture VARCHAR(255) NULL DEFAULT NULL;` (simpler than 012 — no UNIQUE/FK needed here), and prove it via an integration test that persists and reloads a `profilePicture` value against the real test schema (the "boot-verify" in this codebase is an integration test proving the migration was applied, not a runtime code check — confirmed by reading `backend/src/models/database.test.js`'s `familyMemberId link column (ACC-05)` describe block, which is the actual precedent, not a separate boot-time assertion function).
**Warning signs:** `profilePicture` works in the test suite but `ALTER TABLE... Unknown column` errors appear against a real deployed database.

### Pitfall 5: EXIF/GPS metadata retained in "store as-is" uploads (residual risk, explicitly accepted by D-05)
**What goes wrong:** Since the server never re-encodes or strips metadata (D-05), any EXIF GPS/location or device-identifying metadata embedded in an uploaded JPEG is preserved and served back verbatim to any logged-in user (D-07: broad view access).
**Why it happens:** D-05's "store as-is" decision was made for simplicity, and D-06's magic-byte validation defends against *malicious content*, not metadata *privacy leakage* — these are different concerns.
**How to avoid:** This is a documented, accepted residual risk per CONTEXT.md's `<deferred>` section ("EXIF-retention... risk that store-as-is carries") — not something to silently "fix" by adding re-encoding logic that would violate D-05. If it matters, it's an explicit follow-up phase (EXIF stripping / re-encoding), not something to bolt on here.
**Warning signs:** N/A for this phase — flagging for awareness, not for a task.

## Code Examples

### Adversarial test vectors (Success Criterion #3 — write these FIRST, before any happy-path test)

```javascript
// Source: derived from multer README + supertest README, applied to this
// codebase's httpClient()/graphql() helpers in backend/test/helpers.js
import { httpClient, createTestUser } from '../../test/helpers.js';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

function authHeaderFor(user) {
  return `Bearer ${jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, { expiresIn: '1h' })}`;
}

// Vector 1: path-traversal filename -- server-generated names neutralize this
// structurally, so the test proves the ORIGINAL name never reaches disk/DB.
it('rejects/ignores a path-traversal filename and never derives the stored name from it', async () => {
  const user = await createTestUser(/* linked + in-scope */);
  const res = await httpClient()
    .post(`/api/family-members/${targetId}/photo`)
    .set('Authorization', authHeaderFor(user))
    .attach('photo', validJpegBuffer, '../../../etc/passwd.jpg');

  // Either the upload succeeds with a server-generated UUID filename (never
  // "passwd"/"etc" anywhere in the stored name or DB column), or the whole
  // multipart request is rejected -- assert whichever behavior the plan
  // chooses, but assert the stored filename matches a UUID pattern.
});

// Vector 2: mislabeled content-type -- real malicious/text bytes labeled as image/jpeg
it('rejects a non-image file whose multipart Content-Type claims image/jpeg', async () => {
  const scriptBuffer = Buffer.from('#!/bin/sh\necho pwned\n');
  const res = await httpClient()
    .post(`/api/family-members/${targetId}/photo`)
    .set('Authorization', authHeaderFor(user))
    .attach('photo', scriptBuffer, { filename: 'totally-a.jpg', contentType: 'image/jpeg' });

  expect(res.status).toBe(400);
});

// Vector 2b (the OTHER direction -- proves the header is truly ignored, not just
// "checked in addition to" magic bytes): real image bytes mislabeled as something else.
it('accepts real image bytes even when Content-Type is mislabeled', async () => {
  const res = await httpClient()
    .post(`/api/family-members/${targetId}/photo`)
    .set('Authorization', authHeaderFor(user))
    .attach('photo', validPngBuffer, { filename: 'photo.png', contentType: 'text/html' });

  expect(res.status).toBe(200); // accepted on magic-byte evidence alone
});

// Vector 3: oversized file
it('rejects a file over the 5 MB limit', async () => {
  const oversized = Buffer.alloc(5 * 1024 * 1024 + 1, 0xff);
  const res = await httpClient()
    .post(`/api/family-members/${targetId}/photo`)
    .set('Authorization', authHeaderFor(user))
    .attach('photo', oversized, { filename: 'big.jpg', contentType: 'image/jpeg' });

  expect(res.status).toBe(400); // via the MulterError error-handler, not a 500
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-------------------|---------------|--------|
| Trusting multipart `Content-Type` / file extension for upload validation | Magic-byte sniffing (`file-type` et al.) as the sole authoritative check | Long-standing OWASP guidance, unchanged; reaffirmed by this phase's own D-06 | This phase's hard constraint already matches current best practice — no gap to close. |
| Uploading directly to disk with client-supplied names | `memoryStorage()` + server-generated names, validate-then-write | Standard practice for any upload accepting untrusted input | Avoids ever writing a client-influenced path to the filesystem, even transiently. |

**Deprecated/outdated:** none identified specific to this phase's stack — multer 2.x, file-type 22.x, and react-easy-crop 6.x are all current major versions, not legacy holdovers.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Node 24.x (not the CLAUDE.md-stated 18.x) is the actual runtime, based on `backend/package.json`/`frontend/package.json`/root `package.json` all declaring `"engines": { "node": "24.x" }` and both Dockerfiles using `FROM node:24-alpine` (all confirmed via direct file reads) | Standard Stack (`file-type` engines requirement) | If the true target were actually Node 18.x, `file-type@22.x` (`engines.node >= 22`) would fail to install/run, and an older `file-type` major (e.g. v18, which supported older Node) would be needed instead. Low risk — the actual `package.json`/`Dockerfile` contents are stronger evidence than the CLAUDE.md prose, and the currently-running `node --version` in this session reports v24.15.0. |
| A2 | D-09's recommended mechanism (fetch-blob-to-objectURL) is the best fit for this specific codebase's existing stateless-JWT/no-cookie architecture, rather than a universally "correct" choice | Architecture Patterns, Summary | This is a judgment call weighing simplicity/consistency against the minor UX cost of extra client-side blob-lifecycle code; a reasonable planner could instead choose the token-query-param approach for less frontend code, accepting the tradeoff of a JWT appearing in a URL (server access logs, browser history). Flagged HIGH visibility in CONTEXT.md as "a research decision, not locked" — this recommendation should be confirmed, not silently accepted, before planning locks it in. |
| A3 | `react-easy-crop` is preferable to `react-image-crop` for this app's single-avatar-crop use case | Standard Stack (Alternatives Considered) | Low risk either way — both are legitimate, actively maintained, MUI-compatible options; swapping later is a contained frontend-only change with no backend/schema impact. |

## Open Questions

1. **Exact route base path (`/api/family-members/:id/photo` vs. something else)**
   - What we know: the phase needs two new plain-Express routes, mounted alongside the existing `/health` and `/graphql` in `backend/src/server.js`.
   - What's unclear: whether to use a fresh `/api/...` prefix (this app has none today — only `/health` and `/graphql` exist at the root) or nest under `/graphql`-adjacent naming.
   - Recommendation: use a `/api/family-members/:id/photo` prefix (both upload=POST and serve=GET on the same path) — clear, RESTful, and doesn't collide with the single GraphQL endpoint. Left as Claude's Discretion per CONTEXT.md.

2. **Whether `photoUrl` on the GraphQL `FamilyMember` type should be a relative or absolute path**
   - What we know: the frontend needs *some* URL to `axios.get(..., { responseType: 'blob' })` against, and the existing `graphqlClient.js` resolves its `baseURL` from `VITE_API_URL`/proxy config.
   - What's unclear: whether to reuse that resolved base or expose a separate `VITE_PHOTO_API_URL`-style config, given the dev-proxy (`vite.config.js`) currently only forwards `/graphql`.
   - Recommendation: extend the Vite dev-server proxy to also forward `/api` (mirroring the existing `/graphql` proxy rule), and have the backend emit `photoUrl` as a relative path (e.g. `/api/family-members/42/photo`) that resolves against whatever origin the SPA is already served from — consistent with how `VITE_API_URL`/proxying already works, no new env var needed.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Docker + Docker Compose | PHOTO-02 (named-volume persistence verification) | Yes | Docker Compose v5.0.2 (confirmed via `docker compose version`) | — |
| Node.js | All backend work | Yes | v24.15.0 (confirmed via `node --version`) | — |
| `multer`, `file-type`, `react-easy-crop` npm packages | PHOTO-01/03, D-02 | Not yet installed (net-new deps, confirmed absent from both `backend/package.json` and `frontend/package.json`) | Verified installable at 2.2.0 / 22.0.1 / 6.2.2 respectively via live `npm view` | — |

**Missing dependencies with no fallback:** none — all three new packages install cleanly and are the primary recommendation, not a fallback-requiring gap.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.10 (backend and frontend both; confirmed in both `package.json` files) |
| Config file | `backend/vitest.config.js` (globalSetup does a real `sequelize.sync({ force: true, match: /_test$/ })` against a MySQL test DB — confirmed by reading `backend/test/globalSetup.js`) |
| Quick run command | `npm test --workspace backend -- <pattern>` (or `npx vitest run <file>` from `backend/`) |
| Full suite command | `npm test --workspace backend` (currently green per Phase 15 completion; STATE.md notes ~195+ tests across the backend suite) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|-------------|
| PHOTO-03 | Path-traversal filename neutralized (server-generated names only) | integration (supertest against `app`) | `npx vitest run src/routes/photo.upload.test.js -t "path-traversal"` | Wave 0 |
| PHOTO-03 | Mislabeled content-type rejected/accepted purely on magic bytes (both directions) | integration | `npx vitest run src/routes/photo.upload.test.js -t "content-type"` | Wave 0 |
| PHOTO-03 | Oversized file (>5MB) rejected cleanly (400, not 500) | integration | `npx vitest run src/routes/photo.upload.test.js -t "5 MB"` | Wave 0 |
| PHOTO-01 | Upload succeeds for a member within editable scope; photo displays | integration + unit (`computeEditableScope` reuse) | `npx vitest run src/routes/photo.upload.test.js -t "happy path"` | Wave 0 |
| PHOTO-01 | Upload rejected for a member OUTSIDE editable scope (mirrors existing addParent/addChild scope-check tests) | integration | `npx vitest run src/routes/photo.upload.test.js -t "outside scope"` | Wave 0 |
| PHOTO-02 | Photo persists across a container rebuild (named volume, not writable layer) | manual/docker-integration (not a Vitest unit test — requires `docker compose` lifecycle) | `docker compose up -d --build && <upload> && docker compose down && docker compose up -d --build && <verify still present>` | Wave 0 — needs a documented manual/script verification step, not purely automatable inside Vitest |
| PHOTO-02 | `family_members.profilePicture` migration applied and round-trips (boot-verify pattern) | integration | `npx vitest run src/models/FamilyMember.test.js -t "profilePicture"` | Wave 0 |
| QUAL-01 | Adversarial tests exist and FAIL before any happy-path upload test passes (ordering proof) | process/manual (git history / commit-order review during `/gsd:verify-work`, not a runtime assertion) | N/A — verified by red-green commit sequence, not a command | Wave 0 (process, not code) |
| D-11 | Replace/remove cleans up the prior file, no orphaned blobs | unit (`photoStorage.service.test.js`) or integration | `npx vitest run src/services/photoStorage.service.test.js` | Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run <touched-file-pattern>` (fast, scoped)
- **Per wave merge:** `npm test --workspace backend` and `npm test --workspace frontend` (full suite)
- **Phase gate:** full backend + frontend suite green, PLUS the manual Docker-rebuild persistence check (PHOTO-02) documented and executed at least once before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `backend/test/fixtures/images.js` — small valid JPEG/PNG/WebP buffer fixtures (a few real bytes each, not synthetic) for use across upload tests
- [ ] `backend/src/routes/photo.upload.test.js` — the adversarial-first test file (path traversal, mislabeled content-type both directions, oversized file) — MUST be written and committed red before any happy-path test in the same area
- [ ] `backend/src/routes/photo.serve.test.js` — JWT-required-to-view (D-07) test file
- [ ] `backend/src/services/photoStorage.service.test.js` — filename generation, write/unlink ordering, orphan-cleanup unit tests
- [ ] `backend/migrations/manual/013-add-family-members-profile-picture.sql` — the manual ALTER migration file (mirrors `012-add-users-family-member-id.sql`)
- [ ] `.gitignore` entry for `backend/storage/` (or `backend/storage/photos/`) — no existing entry covers this new local-dev artifact directory (confirmed by reading `.gitignore` in full)
- [ ] Frontend: `frontend/src/components/manage/PhotoCropDialog.test.jsx` and `MemberAvatarImage.test.jsx` — component tests for the crop dialog and the blob-fetch avatar wrapper

*(Framework install: none needed — Vitest, supertest, and React Testing Library are already installed and configured in both workspaces.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|--------------------|
| V4 Access Control | Yes | Reuse `requireFamilyAccess` + `computeEditableScope` (D-08) for the upload route, identical to every Phase 14 mutation's authz pattern; `requireAuth` alone (no scope check) for the serving route (D-07) |
| V5 Input Validation | Yes | `file-type` magic-byte sniffing (never trust multipart `Content-Type`/filename), multer `limits.fileSize` (5 MB, D-04), server-generated filenames only (PHOTO-03) |
| V6 Cryptography | Marginal | `crypto.randomUUID()` for filename generation is cryptographically strong by construction (Node's CSPRNG-backed UUIDv4); no custom crypto is written |
| V12 File and Resources (upload-specific controls) | Yes | This entire phase — file type/size/name validation, storage outside the web root's request-mapping (files are served only through the dedicated route, never directly path-addressable), and — as an accepted residual risk (Pitfall 5) — no metadata (EXIF) stripping, since D-05 explicitly stores bytes as-is |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|------------------------|
| Path traversal via multipart filename (`../../etc/passwd`) | Tampering | Never derive the stored path from `req.file.originalname`; server-generates every filename via `crypto.randomUUID()` |
| Content-type/extension spoofing (malicious payload disguised as an image) | Tampering | `file-type` magic-byte sniff is the sole authority; reject on `undefined` or mismatch, regardless of the declared header |
| Oversized upload / storage exhaustion (DoS) | Denial of Service | multer `limits.fileSize` (5 MB) enforced at the parser level, before the full body is buffered in memory |
| Privilege escalation — uploading a photo for a member outside one's editable scope | Elevation of Privilege | Reuse `computeEditableScope`/`requireFamilyAccess` exactly as every Phase 14 mutation does — no new authz logic invented for this route |
| JWT leakage via URL (if the token-query-param D-09 alternative were chosen instead) | Information Disclosure | Avoided entirely by recommending fetch-blob-to-objectURL instead — flagged explicitly so the planner doesn't reach for the query-param approach without weighing this |

## Sources

### Primary (HIGH confidence)
- `github.com/expressjs/multer` (README) — `multer(options)` API, `diskStorage`/`memoryStorage`, `limits` object, `fileFilter` signature
- `github.com/sindresorhus/file-type` (README) — `fileTypeFromBuffer`/`fileTypeFromFile` signatures, ESM-only status, supported format list (jpg/png/webp confirmed)
- Live `npm view` calls against the npm registry for `multer`, `file-type`, `react-easy-crop`, `react-image-crop`, `busboy`, `uuid` — versions, dependencies, `engines`, `scripts.postinstall`, publish dates
- Direct reads of this repo's own source: `backend/src/server.js`, `backend/src/utils/auth.js`, `backend/src/services/familyMember.service.js`, `backend/src/models/{User,FamilyMember}.js`, `backend/src/models/index.js`, `backend/src/resolvers/familyMember.resolver.js`, `backend/src/schemas/familyMember.schema.js`, `backend/vitest.config.js`, `backend/test/{helpers.js,globalSetup.js,init/01-create-test-db.sh}`, `backend/migrations/manual/012-add-users-family-member-id.sql`, `docker-compose.yml`, `backend/Dockerfile`, `frontend/Dockerfile`, `frontend/src/api/graphqlClient.js`, `frontend/src/components/manage/MemberCard.jsx`, `.gitignore`, `backend/package.json`, `frontend/package.json`, root `package.json`
- `slopcheck install multer file-type react-easy-crop` — direct tool execution, `[OK]` for all three

### Secondary (MEDIUM confidence)
- WebSearch: supertest `.attach(field, buffer, { filename, contentType })` content-type override support since supertest v3.x — cross-verified against this project's actual supertest version (7.2.2) via `npm view`
- WebFetch of `github.com/9elements/react-easy-crop` — Cropper props, `onCropComplete` dual percentage/pixel output (npmjs.com page itself returned HTTP 403 to WebFetch; GitHub README used instead)

### Tertiary (LOW confidence)
- WebSearch aggregated summaries on "authenticated `<img>` serving patterns" (signed URL / token-query-param / auth-cookie / fetch-blob tradeoffs) — general web consensus, not tied to a single authoritative source; used to inform the D-09 recommendation's reasoning, not as a factual claim about this codebase

## Metadata

**Confidence breakdown:**
- Standard stack (multer/file-type/react-easy-crop choice, versions): HIGH — verified against official READMEs, live registry checks, and slopcheck
- Architecture (route placement, storage layout, Docker volume, migration pattern): HIGH — directly derived from this codebase's own established precedents (Phase 12/13 migration pattern, existing `getUserFromRequest`/`computeEditableScope` reuse, existing Dockerfile/compose structure)
- D-09 serving-auth mechanism recommendation: MEDIUM — a genuine architectural tradeoff among four legitimate options, not a single objectively-correct answer; flagged for explicit confirmation, not silent adoption
- Pitfalls (path traversal, multer error propagation, orphaned files, migration gap, EXIF residual risk): HIGH — each is either a direct extraction from this codebase's own prior-phase precedent or a well-documented, uncontested upload-security concern

**Research date:** 2026-07-23
**Valid until:** 30 days (stable ecosystem — multer/file-type/react-easy-crop are mature, slow-moving packages; re-verify versions if planning is delayed past ~2026-08-22)
