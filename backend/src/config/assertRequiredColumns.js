// Fail-fast-at-boot check for a single, specific manual migration column --
// NOT a general schema-drift detector for every manual migration under
// backend/migrations/manual/. Scoped narrowly to migration 020
// (users.relationshipNote) because Plan 32-08's own CR-03 fix wraps
// models.User.create (and now findOne/createVerificationToken) inside the
// tokenless register branch's uniform-response guard: a missing-column
// error on an unmigrated deployment target now converts into the IDENTICAL
// success message returned on every other outcome. Without this check, an
// operator who forgets to apply
// backend/migrations/manual/020-add-users-relationship-note.sql would see
// the backend boot and serve traffic normally, while silently accepting and
// dropping every self-registration forever -- no signal to the caller (who
// gets the same "Registration received" success message as everyone else)
// and no signal to the operator (no error, no log, nothing). Failing loudly
// at boot instead converts that silent, unbounded data-loss window into an
// immediate, visible startup failure.
export async function assertRequiredColumns(sequelize) {
  const rows = await sequelize.query(
    "SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND COLUMN_NAME = 'relationshipNote'",
    { type: sequelize.QueryTypes.SELECT }
  );

  if (rows.length === 0) {
    throw new Error(
      'users.relationshipNote column is missing -- apply backend/migrations/manual/020-add-users-relationship-note.sql before starting the backend.'
    );
  }
}
