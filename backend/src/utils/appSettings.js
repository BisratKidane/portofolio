// THE single definition of "is the public door open?" (D-07 Layer 1). Three
// callers, all in future plans of this phase, import isPublicRegistrationEnabled
// from here and call it directly -- they never re-read the row or re-derive
// the predicate themselves:
//   - Query.publicRegistrationEnabled  (public, unauthenticated)
//   - Query.publicRegistrationSetting  (admin-only, with attribution)
//   - Mutation.register's tokenless branch
//
// user.resolver.js must NEVER import AppSetting, PUBLIC_REGISTRATION_KEY, or
// getPublicRegistrationSettingRow directly -- it imports and calls
// isPublicRegistrationEnabled(models), exactly like every other caller.
//
// Why this matters: an outer guard (the client-visible query) and an inner
// guard (the server-side check) reading the SAME stored value through
// DIFFERENT code paths is the exact bug class that has produced a blocker in
// this project four times over -- Phases 14, 15, 30, 31, 32 and 33, most
// recently 32-REVIEW.md CR-01, closed by .planning/quick/260908-geq-p33-validator-parity/
// with the identical remedy: call the same function instead of a second,
// hand-rolled approximation. Agreement here is guaranteed by construction --
// there being only one function that can answer the question -- not
// approximated by two implementations that are merely tested to agree today.
//
// Every function below takes `models` as its FIRST parameter and this module
// never imports AppSetting directly (mirrors utils/audit.js). That is what
// keeps this module spy-able on its ESM namespace (vi.spyOn(appSettings,
// 'isPublicRegistrationEnabled')) for plan 34-03's call-site proof, and
// testable without a real Sequelize model wired in.
//
// getPublicRegistrationSettingRow exists as its own export, separate from
// isPublicRegistrationEnabled, specifically so a future caller that needs the
// ROW for something other than the boolean (plan 34-03's admin-attribution
// payload: updatedAt/updatedById) has somewhere to go that is not "add a
// second findByPk call site". A second call site -- even a correct one -- is
// how this bug class starts. getPublicRegistrationSettingRow is the ONLY
// production call site of AppSetting.findByPk anywhere in backend/src.

export const PUBLIC_REGISTRATION_KEY = 'public_registration_enabled';

// Bare pass-through: no try/catch, no interpretation of the value, no
// default. Returns the row or null (or lets a throw propagate) and nothing
// else. isPublicRegistrationEnabled is the ONLY function permitted to turn
// this row into a boolean -- this accessor must never be used to derive the
// open/closed answer.
export async function getPublicRegistrationSettingRow(models) {
  return models.AppSetting.findByPk(PUBLIC_REGISTRATION_KEY);
}

// true  <=> the row exists AND row.value === 'true' (strict equality against
//           the exact string 'true' -- anything else, including 'TRUE', '1',
//           or an empty string, is closed)
// false <=> row absent | row.value is anything else | the read threw
//
// No cache of any kind: a cache is a second source of truth, which is
// exactly what D-07 forbids, and any TTL contradicts ADMIN-01's "a spam wave
// can be stopped in seconds".
export async function isPublicRegistrationEnabled(models) {
  try {
    const row = await getPublicRegistrationSettingRow(models);
    if (!row) {
      // D-02 fail-closed. Warn so a forgotten migration 021 leaves an
      // operator-visible trace without crashing the boot (E-8/E-9).
      console.warn(`app_settings row '${PUBLIC_REGISTRATION_KEY}' is absent -- defaulting to closed.`);
      return false;
    }
    return row.value === 'true';
  } catch (err) {
    // House error-logging form (user.resolver.js): never the whole error
    // object -- a Sequelize DatabaseError's .sql/.parameters can carry
    // sensitive data on other codepaths, and this one must fail closed
    // regardless (D-02).
    console.error('Failed to read public-registration setting:', err?.name, err?.message);
    return false;
  }
}

// Called ONLY from backend/test/globalSetup.js and backend/test/helpers.js.
// MUST NOT be called from initializeDatabase() -- a boot-time findOrCreate
// would silently re-open a door whose row was deliberately wiped, which is
// precisely the silent undo D-02 exists to forbid (E-9).
//
// Idempotent and non-clobbering by construction: findOrCreate only sets the
// defaults when no row exists, so calling this against an already-set-to-
// 'false' row leaves it 'false'.
export async function seedDefaultAppSettings(models) {
  await models.AppSetting.findOrCreate({
    where: { settingKey: PUBLIC_REGISTRATION_KEY },
    defaults: { value: 'true', updatedById: null }
  });
}
