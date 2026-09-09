import { requireAdmin } from '../utils/auth.js';
import { writeAuditLog } from '../utils/audit.js';
import { isPublicRegistrationEnabled, getPublicRegistrationSettingRow, PUBLIC_REGISTRATION_KEY } from '../utils/appSettings.js';

// Builds the PublicRegistrationSetting payload used by both the admin query
// and the flip mutation's return value. `enabled` is derived ONLY through
// isPublicRegistrationEnabled(models) -- never by reading row.value here --
// that is the D-07 divergence this file must not recreate. The row is read
// ONLY through getPublicRegistrationSettingRow(models) -- this file never
// calls the model's findByPk method directly -- and used strictly for
// updatedAt/updatedById attribution, never to recompute `enabled` (that would
// be a third independent derivation of the predicate, the exact bug class
// D-07 Layer 1 exists to prevent).
//
// Both reads run inside one transaction (34-REVIEW.md WR-01): without it, a
// flip committed between the `enabled` read and the row read pairs one
// state's `enabled` with the OTHER state's attribution -- e.g. "Opened by
// Alice on 9 Sep" when Alice actually closed it. MySQL's REPEATABLE READ
// gives every statement in this transaction the same snapshot, so no lock
// is needed on this read-only path.
async function buildPublicRegistrationSettingPayload(models) {
  const sequelize = models.AppSetting.sequelize;
  return sequelize.transaction(async (t) => {
    const opts = { transaction: t };
    const enabled = await isPublicRegistrationEnabled(models, opts);
    const row = await getPublicRegistrationSettingRow(models, opts);

    if (!row || row.updatedById === null) {
      // "Not changed since setup." -- either the row is absent (migration 021
      // never applied) or it still carries the migration-seeded updatedById
      // IS NULL state.
      return { enabled, updatedAt: null, updatedByName: null };
    }

    const actor = await models.User.findByPk(row.updatedById, opts);
    // Returning the raw Date: GraphQL's String coercion calls valueOf() and
    // yields an epoch-ms string (e.g. "1757404800000") -- the exact shape
    // AdminMemberTable.jsx's formatWhen already parses.
    return { enabled, updatedAt: row.updatedAt, updatedByName: actor?.name ?? null };
  });
}

export const settingResolvers = {
  Query: {
    // Deliberately UNGUARDED -- no requireAuth/requireAdmin call at all. D-07
    // requires the /register page to be able to choose its surface before
    // anyone is logged in. This is one of the seven names on plan 34-07's
    // public allowlist.
    publicRegistrationEnabled: async (_parent, _args, { models }) => {
      return isPublicRegistrationEnabled(models);
    },

    publicRegistrationSetting: async (_parent, _args, { models, user }) => {
      requireAdmin(user);
      return buildPublicRegistrationSettingPayload(models);
    }
  },
  Mutation: {
    setPublicRegistrationEnabled: async (_parent, { enabled }, { models, user }) => {
      requireAdmin(user);

      const sequelize = models.AppSetting.sequelize;
      await sequelize.transaction(async (t) => {
        // Captures the pre-flip value for the audit's from->to record. This
        // read DOES join the transaction, under a row lock (SELECT ... FOR
        // UPDATE): it must observe the value THIS transaction is about to
        // overwrite, and the lock serialises concurrent flips on this row so
        // a second flip's `previous` is the first flip's committed `to`, not
        // a value read before either flip started (34-REVIEW.md CR-01 -- a
        // prior version of this comment claimed an unlocked, out-of-
        // transaction read was correct here; it was not: two concurrent
        // flips both observed the same pre-flip value and produced an
        // unreconstructible audit history). A read failure here now
        // propagates (isPublicRegistrationEnabled rethrows when
        // options.transaction is set) instead of being swallowed to `false`,
        // so a transient DB error rolls back the flip instead of recording a
        // fabricated `from`.
        const previous = await isPublicRegistrationEnabled(models, { transaction: t, lock: t.LOCK.UPDATE });

        // upsert, not update -- D-02 allows the row to be absent, and an
        // admin flipping on a row-less database must CREATE it rather than
        // silently no-op. On a row-less DB, two concurrent flips both take
        // an InnoDB gap lock on the (absent) primary key via the FOR UPDATE
        // read above; the second transaction's upsert then deadlocks and
        // throws (ER_LOCK_DEADLOCK) instead of corrupting anything -- one
        // admin sees an error, the door state stays consistent. No retry
        // logic is added for this case.
        await models.AppSetting.upsert(
          { settingKey: PUBLIC_REGISTRATION_KEY, value: enabled ? 'true' : 'false', updatedById: user.id },
          { transaction: t }
        );

        // This is the codebase's FIRST awaited, in-transaction audit caller.
        // All five existing call sites (approval.resolver.js:53,:95,
        // invitation.resolver.js:62, user.resolver.js:233,:313,:535) record a
        // side-fact about an operation whose primary effect is durably
        // visible elsewhere (a status column, a sent email); this audit row
        // is the ONLY history of a value that overwrites itself (D-03), so a
        // fire-and-forget write here could commit the flip with no trace if
        // the write failed. audit.js's own header comment anticipates this
        // mode and already forwards `options` to AuditLog.create, so no
        // helper change is needed. A reviewer should read this divergence
        // from the fire-and-forget precedent as intentional, not as an
        // inconsistency.
        await writeAuditLog(
          models,
          {
            action: 'setting.public_registration_changed',
            actorUserId: user.id,
            metadata: { setting: PUBLIC_REGISTRATION_KEY, from: previous, to: enabled }
          },
          { transaction: t }
        );
      });

      // Do NOT depend on upsert's return value -- its [instance, created]
      // shape is unverified in this codebase (upsert is called nowhere else
      // in backend/src). Re-reading is deterministic and also resolves the
      // actor name.
      return buildPublicRegistrationSettingPayload(models);
    }
  }
};
