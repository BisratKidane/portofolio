# Milestone: Invitation-Based Registration & Approval

Branch: `invitation-registration`

## Goal
Only invited, admin-approved family members can access the platform. Public
self-registration is disabled. Active members can invite; admins approve/reject
every new account before it becomes active.

## Locked decisions (from user)
- **WhatsApp**: Full Business API chosen — build a provider-abstracted sender,
  config-driven like the Resend mailer. **Dormant until credentials are provided.**
- **Who can invite**: any Active linked family member (admins approve).
- **Email verification**: KEPT — two gates (verify email AND admin approval).
- **Approval notice**: email auto; WhatsApp-invited → admin gets a copyable wa.me
  message (until/if we auto-send via the API).

## Phases
1. **Foundation** — `invitations` + `audit_logs` tables, `users.status`
   (Pending/Active/Rejected/Disabled); migrations 015–017; auth gating so only
   Active users authenticate; audit-log helper. Existing users backfilled Active.
2. **Invitations** — createInvitation mutation (Active-member permission, secure
   one-time token, hash-at-rest, configurable expiry, rate limit); dispatch
   abstraction (Resend email + WhatsApp adapter); admin invite list; audit on create.
3. **Register via invite** — register(token, …) validates/expires/one-time →
   Pending user, keeps email verification, marks invitation Registered + timestamp;
   DISABLE public registration + gate register page on a valid token; admin notify.
4. **Approval** — admin dashboard (pending list w/ inviter, relationship, note);
   approve / reject(reason); activation email; WhatsApp copy-link; audit logging.
5. **Hardening** — registration rate limiting, replay protection, full audit
   coverage, README migration runbook, e2e verification, deploy.

## Data model
- `users.status` ENUM('Pending','Active','Rejected','Disabled') NOT NULL DEFAULT
  'Pending' (existing rows backfilled 'Active'). Only Active may authenticate.
- `invitations`: id, tokenHash, inviterId, invitedName, invitedEmail, invitedPhone,
  invitationMethod('email'|'whatsapp'), relationshipToFamily, invitationNote,
  expiresAt, registeredAt, registeredUserId, approvedAt, rejectedAt, approvedBy,
  rejectionReason, status('Pending'|'Registered'|'Approved'|'Rejected'|'Expired'),
  createdAt, updatedAt.
- `audit_logs`: id, action, actorUserId, invitationId, targetUserId, metadata(JSON),
  createdAt. Records invite create / register / approve / reject.

## Notes
- Bootstrap: existing admin remains (backfilled Active). A brand-new install would
  need a seeded admin — documented in the hardening phase.
- WhatsApp send is stubbed/logged until a Business API provider + credentials exist.
