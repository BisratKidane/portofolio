---
quick_id: 260727-byh
slug: manage-forms
description: "/manage forms pass 1: role clarity (name active member), <=2 columns + MUI X DatePicker for dates, photo-on-create, creative account<->member connection card"
status: planned
created: 2026-07-27
branch: manage-forms
---

# Quick Task 260727-byh — /manage forms improvements (part 1)

Frontend-only. Four asks against three forms: `AddRelativeDialog`,
`EditMemberDialog`, and the admin "Link accounts" row `UnlinkedUserRow`
(in `frontend/src/pages/ManagePage.jsx`). Keep the full frontend suite green.

Decisions (locked by the user):
- Dates → **MUI X DatePicker** (`@mui/x-date-pickers` + `dayjs`).
- Connection UI → **side-by-side connection card** (avatars + link icon + Connect).
- Photo-on-create → **all create-a-member forms** (AddRelative + admin create-and-link).

## Task 1 — Dependencies + LocalizationProvider
**Files:** `frontend/package.json`, `frontend/src/main.jsx`
- `npm install --workspace frontend @mui/x-date-pickers dayjs` (x-date-pickers v7 is
  compatible with MUI 6).
- Wrap the app once in `main.jsx`:
  `<LocalizationProvider dateAdapter={AdapterDayjs}> … </LocalizationProvider>`
  (inside ThemeProvider, around the Router/AuthProvider tree).
**Done:** DatePicker usable anywhere; `npm run build --workspace frontend` compiles.

## Task 2 — Shared `MemberFields` component (≤2 columns + date pickers + optional photo)
**Files:** NEW `frontend/src/components/manage/MemberFields.jsx` (+ test)
- Presentational fields block for creating/editing a member, used by all three forms.
- Props: `{ form, onChange, withPhoto?, photoPreviewUrl?, onPickPhoto?, onClearPhoto? }`.
  `onChange(field, value)` updates one field.
- Layout — **max two columns** (`Stack direction={{ xs:'column', sm:'row' }}` pairs,
  or a 2-col MUI Grid):
  - First name | Last name
  - Gender (select) | Mother's name
  - Birthdate (**DatePicker**) | Deathdate (**DatePicker**)
  - Email | Phone
  - Address (full width)
- **DatePicker wiring:** store dates as `'YYYY-MM-DD'` strings in `form` (backend
  DATEONLY). `value={form.birthdate ? dayjs(form.birthdate) : null}`,
  `onChange={(v) => onChange('birthdate', v && v.isValid() ? v.format('YYYY-MM-DD') : '')}`.
  Render via `slotProps={{ textField: { fullWidth: true } }}`. Do the same for deathdate.
- **Photo (when `withPhoto`):** a `MemberAvatarImage`-style preview (or the picked
  image) + a "Add photo" / camera button that opens a hidden file input → routes the
  file to `PhotoCropDialog` in **deferred mode** (Task 3). Show a small "Remove" when a
  photo is picked. The parent owns the cropped-blob state; `MemberFields` just renders
  the control and calls `onPickPhoto(file)` / `onClearPhoto()`.
**Done:** one component renders every member field in ≤2 columns with calendar dates.

## Task 3 — PhotoCropDialog: deferred (return-blob) mode
**Files:** `frontend/src/components/manage/PhotoCropDialog.jsx` (+ test)
- Current API uploads immediately (`{ open, file, member, onClose, onUploaded }` →
  `uploadMemberPhoto(member.id, blob)`). Add a **deferred mode**: when a new
  `onCropped` prop is provided (or `member` is absent), crop to the 512×512 JPEG blob
  and call `onCropped(blob)` **without** uploading. Keep the existing upload-now path
  (member present + `onUploaded`) unchanged so MemberCard/edit still work.
**Done:** create forms can obtain a cropped blob before a member id exists.

## Task 4 — AddRelativeDialog: role clarity + MemberFields + photo-on-create
**Files:** `frontend/src/components/manage/AddRelativeDialog.jsx` (+ test),
`frontend/src/pages/ManagePage.jsx` (pass the active member's name)
- **Role clarity (#1):** accept a new `targetName` prop (the active member's fullname).
  The Mother/Father select must name the active member:
  - parent: label/helperText → "Is this person the mother or father of **{targetName}**?"
  - child: helperText → "**{targetName}** is this child's mother / father".
  Pass `targetName` from BOTH ManagePage branches (MemberBranch + AdminBranch) — it's the
  focused/self member whose `targetId` is already passed.
- Replace the inline 3-column fields with `<MemberFields withPhoto … />`.
- **Photo-on-create (#3):** hold the deferred cropped blob in state; after the add
  mutation returns `{ id }`, if a blob exists call
  `uploadMemberPhoto(created.id, blob)` (from `photoClient.js`) before `onCreated()`.
  A photo-upload failure must not lose the created member — surface a non-fatal
  warning but still treat the member as created.
**Done:** role names the active member; ≤2 cols; a photo can be attached at creation.

## Task 5 — EditMemberDialog: MemberFields (≤2 cols + date pickers)
**Files:** `frontend/src/components/manage/EditMemberDialog.jsx` (+ test)
- Swap the inline 3-column fields for `<MemberFields />` (no `withPhoto` — edit already
  has avatar upload via the member card). Preserve the existing edit mutation + D-06
  behavior.
**Done:** edit form is ≤2 cols with calendar dates.

## Task 6 — UnlinkedUserRow: side-by-side connection card (#4) + create-and-link photo
**Files:** `frontend/src/pages/ManagePage.jsx` (+ any ManagePage test)
- **Pick mode → connection card:** render the user account (initials avatar + name +
  email) on the left, a **link/chain icon** (e.g. `LinkRoundedIcon`) in the middle, and
  the member picker on the right. The Autocomplete options render **member avatars +
  fullname + a secondary line** (gender · birth year) via `renderOption`; once selected,
  show the chosen member as an avatar+name preview card. Primary action button reads
  "**Connect account → member**" (calls the existing `handleLink`). Keep "Create new
  member instead".
- **Create-and-link:** use `<MemberFields withPhoto />`; after `linkUserToMember` returns
  the linked member id, upload the deferred blob via `uploadMemberPhoto` (same pattern as
  Task 4). (The mutation returns `{ id, familyMemberId }` — use `familyMemberId` for the
  photo upload.)
**Done:** the account↔member connection is visually explicit with avatars + a link cue.

## Task 7 — Tests green
- Update the affected tests for the new structure: `EditMemberDialog.test`,
  `AddRelativeDialog.test`, `PhotoCropDialog.test`, and any ManagePage/UnlinkedUser test.
  DatePickers render an accessible textbox — query by the field label and use
  `fireEvent.change`/typing on the input, or assert via the field's value. Add a
  `MemberFields.test` for the ≤2-col + date-string round-trip.
- `npm test --workspace frontend -- --run` fully green.

## Out of scope
- No backend/GraphQL/schema/DB changes (mutations already accept these fields + photo).
- Later /manage passes will cover the rest; this is part 1.
