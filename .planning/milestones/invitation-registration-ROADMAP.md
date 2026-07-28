# Milestone: Invitation-Based Registration & Approval

Branch: `invitation-registration`

## Goal
Only invited, admin-approved family members can access the platform. Public
self-registration is disabled. Active members can invite; admins approve/reject
every new account before it becomes active.

## Locked decisions (from user)
- **Channel**: EMAIL ONLY. WhatsApp was removed entirely for now (may return as a
  future enhancement).
- **Who can invite**: any Active linked family member (admins approve).
- **Email verification**: KEPT — two gates (verify email AND admin approval).
- **Approval notice**: automated email on approve/reject.

## Phases
1. **Foundation** — `invitations` + `audit_logs` tables, `users.status`
   (Pending/Active/Rejected/Disabled); migrations 015–017; auth gating so only
   Active users authenticate; audit-log helper. Existing users backfilled Active.
2. **Invitations** — createInvitation mutation (Active-member permission, secure
   one-time token, hash-at-rest, configurable expiry, rate limit); Resend email
   dispatch; admin invite list; audit on create. (EMAIL ONLY.)
3. **Register via invite** — register(token, …) validates/expires/one-time →
   Pending user, keeps email verification, marks invitation Registered + timestamp;
   DISABLE public registration + gate register page on a valid token; admin notify.
4. **Approval** — admin dashboard (pending list w/ inviter, relationship, note);
   approve / reject(reason); activation + rejection emails; audit logging.
5. **Hardening** — registration rate limiting, replay protection, full audit
   coverage, README migration runbook, e2e verification, deploy.

## Data model
- `users.status` ENUM('Pending','Active','Rejected','Disabled') NOT NULL DEFAULT
  'Pending' (existing rows backfilled 'Active'). Only Active may authenticate.
- `invitations`: id, tokenHash, inviterId, invitedName, invitedEmail,
  relationshipToFamily, invitationNote, expiresAt, registeredAt, registeredUserId,
  approvedAt, rejectedAt, approvedBy, rejectionReason,
  status('Pending'|'Registered'|'Approved'|'Rejected'|'Expired'), createdAt, updatedAt.
- `audit_logs`: id, action, actorUserId, invitationId, targetUserId, metadata(JSON),
  createdAt. Records invite create / register / approve / reject.

## Notes
- Bootstrap: existing admin remains (backfilled Active). A brand-new install would
  need a seeded admin — documented in the hardening phase.
- WhatsApp is intentionally out of scope for this milestone (email invitations only).
