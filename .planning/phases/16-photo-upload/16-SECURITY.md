---
phase: 16
slug: photo-upload
status: verified
threats_open: 0
asvs_level: 1
created: 2026-07-24
---

# Phase 16 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

Register origin: authored at plan time (all 7 PLAN files carried a `<threat_model>` block). Audit mode: **verify mitigations exist** — no retroactive-STRIDE scan required. Verified by `gsd-security-auditor` against the implementation on 2026-07-24.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Deploy-time schema change | The manual `013` ALTER runs against an already-provisioned DB outside CI's force-recreate path | `family_members.profilePicture` column definition |
| Filesystem write/delete surface | `photoStorage.service.js` is the only backend code that touches `photoStorageConfig.photosDir` directly | Image bytes on the durable volume |
| Container rebuild | Writable container layer is ephemeral; only the named volume is durable | Stored photo files |
| Client → upload route | Multipart body, `Content-Type` header, and filename are all untrusted | Raw image bytes, declared mime/filename |
| Member-user → another member's record | Editable scope is the write-authorization boundary | Upload/remove authorization |
| Any authenticated user → any member's photo (read) | D-07's deliberately broad view boundary — no scope check by design | Photo bytes on GET |
| Browser localStorage → Authorization header | Same trust model `graphqlClient.js` already uses; no new mechanism | JWT bearer token |
| UI-declared vs. server-enforced authorization | UI `locked`/scope gating is a UX affordance only; real write-authz is server-side | Action-button visibility |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-16-01 | Tampering | `family_members.profilePicture` schema drift (test vs deployed DB) | mitigate | Manual `013` migration + boot round-trip test (`database.test.js:98-122`, `FamilyMember.js:51-54`) | closed |
| T-16-02 | Tampering | Test fixtures not representing real image bytes | mitigate | `images.test.js:16-37` verifies every fixture's magic-byte type via `file-type` | closed |
| T-16-03 | Tampering | `generatePhotoFilename`/`resolvePhotoPath` filename injection | mitigate | Filename = `crypto.randomUUID()` + detected ext; no client input at this layer (`photoStorage.service.js:9-15`) | closed |
| T-16-04 | Denial of Service | Orphaned files accumulating on the volume | mitigate | `finalizePhotoReplacement` write→commit→delete ordering; new file discarded on commit failure (`photoStorage.service.js:31-47`) | closed |
| T-16-05 | Repudiation | Silent data loss if `deletePhotoFile` swallows a non-ENOENT error | mitigate | Only `err.code === 'ENOENT'` caught; all other fs errors rethrow (`photoStorage.service.js:24-28`) | closed |
| T-16-06 | Denial of Service (data loss) | Photos on container writable layer instead of a volume | mitigate | Named `photo_uploads` volume + `__dirname`-anchored path; rebuild proof script (`docker-compose.yml:42,65`, `photoStorage.js:11`) | closed |
| T-16-07 | Tampering | Verification script destroying the volume it proves persists | mitigate | Script uses `docker compose down` (no `-v`); no `down -v`/`volume rm` (`verify-photo-persistence.sh:53`) | closed |
| T-16-08 | Tampering | Path traversal via multipart filename | mitigate | multer memoryStorage; `req.file.originalname` never read; filename exclusively generated (`photo.routes.js:94-102`) | closed |
| T-16-09 | Tampering | Content-type/extension spoofing | mitigate | `fileTypeFromBuffer` sole authority; reject on `undefined` or mime mismatch (`photo.routes.js:68-73`) | closed |
| T-16-10 | Denial of Service | Oversized upload / memory exhaustion | mitigate | multer `limits.fileSize` 5 MB, `files:1`; `multerErrorHandler` returns clean 400 (`photo.routes.js:39,189-196`) | closed |
| T-16-11 | Elevation of Privilege | Upload for a member outside actor's editable scope | mitigate | Reuses `computeEditableScope`/`requireFamilyAccess` from Phase 14 (`photo.routes.js`, `familyMember.service.js:180`) | closed |
| T-16-12 | Repudiation | Replace/remove orphaning the previous file | mitigate | Unmanaged txn commits before delete-old; rollback guarded on `!t.finished` (`photo.routes.js:86-102`) | closed |
| T-16-13 | Information Disclosure | Unauthenticated read of a member's photo | mitigate | `requireAuth` gates GET; 401 before any file served (`photo.routes.js:168-172`) | closed |
| T-16-14 | Elevation of Privilege | Remove photo for a member outside editable scope | mitigate | Identical `computeEditableScope`/`scope.ids.has` check as upload (`photo.routes.js:130-135`) | closed |
| T-16-15 | Information Disclosure | Any authenticated user can view ANY member's photo | accept | D-07 locked product decision; GET omits scope check by design, writes stay scope-gated (`photo.routes.js:157-160`) | closed |
| T-16-16 | Information Disclosure | JWT leakage via URL | accept (avoided) | Header-based Bearer only; token never placed in URL (`photoClient.js:3-11`) | closed |
| T-16-17 | Spoofing (of authorization) | Client-side bypass of hidden/disabled avatar trigger | accept | UX-only gating; server-side `computeEditableScope` is the real enforcement (see T-16-11/14) (`MemberCard.jsx:48-51`) | closed |
| T-16-18 | Repudiation | Naming collision "Remove photo" vs "Remove" (member) | mitigate | Distinct dialog titles + button colors, never abbreviated (`ManagePage.jsx:228,568,599`, `MemberCard.jsx:124,134`) | closed |
| T-16-SC-01 | Tampering | npm supply-chain risk from `multer`/`file-type` | accept | slopcheck-vetted, install scoped to backend workspace, no `postinstall` (`backend/package.json`) | closed |
| T-16-SC-06 | Tampering | npm supply-chain risk from `react-easy-crop` | accept | slopcheck-vetted, no `postinstall` (`frontend/package.json`) | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-16-01 | T-16-15 | D-07 locked product decision: all authenticated users are trusted family for *viewing* any member photo; write/delete remains scope-gated | Bisrat Kidane (D-07) | 2026-07-24 |
| AR-16-02 | T-16-16 | JWT-in-URL avoided by design — `fetchMemberPhotoBlob` uses header Bearer per D-09 | Bisrat Kidane (D-09) | 2026-07-24 |
| AR-16-03 | T-16-17 | Avatar-trigger gating is cosmetic; server-side `computeEditableScope` is the real backstop, matching all other action buttons | Bisrat Kidane | 2026-07-24 |
| AR-16-04 | T-16-SC-01 | `multer` / `file-type` vetted `[OK]` by slopcheck (mature `expressjs`/`sindresorhus` orgs, no postinstall); backend-scoped | Bisrat Kidane | 2026-07-24 |
| AR-16-05 | T-16-SC-06 | `react-easy-crop` vetted `[OK]` by slopcheck; no postinstall | Bisrat Kidane | 2026-07-24 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-24 | 20 | 20 | 0 | gsd-security-auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-24
