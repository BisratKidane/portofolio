// D-05: caps a self-registrant's free-text relationship note at 500 chars,
// matching migration 020's users.relationshipNote VARCHAR(500) column.
// The `note &&` short-circuit is required because D-06 makes the note
// optional -- unlike assertPasswordStrength, which has no such guard since
// password is always required.
export function assertRelationshipNoteLength(note) {
  if (note && note.length > 500) throw new Error('Relationship note must be 500 characters or fewer.');
}
