# Phase 16: Photo Upload - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-23
**Phase:** 16-photo-upload
**Areas discussed:** Upload control & UX, Formats & size limit, Photo visibility when served, Empty & replace states

---

## Upload control & UX

| Option | Description | Selected |
|--------|-------------|----------|
| Avatar click + crop/preview | Click the member's MemberCard avatar → file picker → crop/preview dialog before saving | ✓ |
| Avatar click, direct upload | Click avatar → pick file → uploads immediately, no crop step | |
| Field in EditMemberDialog | Upload as one field inside the existing edit form; no separate avatar control | |

**User's choice:** Avatar click + crop/preview
**Notes:** Crop is client-side; the cropped blob is what gets uploaded (D-01/D-02/D-03).

---

## Formats & size limit

| Option | Description | Selected |
|--------|-------------|----------|
| JPEG/PNG/WebP, 5MB, re-encode | Accept common types, cap 5MB, re-encode server-side (strips EXIF, neutralizes malformed files) | |
| JPEG/PNG/WebP, 5MB, store as-is | Same accept list + cap, store original bytes unchanged | ✓ |
| JPEG/PNG only, 2MB, re-encode | Stricter two-format, 2MB, re-encode | |

**User's choice:** JPEG/PNG/WebP, 5MB, store as-is
**Notes:** Store-as-is shifts the security burden onto validation — server MUST sniff real content-type from magic bytes, not the multipart header (recorded as hard constraint D-06). EXIF-retention risk flagged for research.

---

## Photo visibility when served

| Option | Description | Selected |
|--------|-------------|----------|
| In-scope / linked users only | Serving route requires JWT + per-member scope check | |
| Any logged-in user | Any authenticated user can view any member photo | ✓ |
| Public URL | No auth; anyone with the URL can load the image | |

**User's choice:** Any logged-in user
**Notes:** Viewing is broad, uploading stays scope-gated (D-07/D-08). The `<img>`-carries-auth mechanism (signed URL / token / cookie) is left to research (D-09).

---

## Empty & replace states

| Option | Description | Selected |
|--------|-------------|----------|
| Initials avatar, replace + remove | Colored initials placeholder; replace and remove allowed | |
| Generic icon, replace + remove | Generic person icon placeholder; replace and remove allowed | ✓ |
| Initials avatar, replace only | Initials placeholder; once set, replace only (no remove) | |

**User's choice:** Generic icon, replace + remove
**Notes:** Remove reverts to the generic icon; prior stored file should be cleaned up to avoid orphans (D-10/D-11).

---

## Claude's Discretion

- Route paths/naming, multipart parser (multer vs busboy), `profilePicture` column representation, crop-library choice, serving-auth mechanism (D-09), and storage layout under the volume — provided filenames stay server-generated (PHOTO-03).

## Deferred Ideas

- Server-side re-encoding / EXIF stripping / thumbnail generation (deferred by the store-as-is choice).
- Per-member photo view privacy (considered, rejected for this phase).
- External object storage / CDN (out of scope; phase uses a mounted Docker volume).
