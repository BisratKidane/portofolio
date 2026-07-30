# Deferred Items — Phase 19

## Pre-existing flakes (out of scope, not touched by 19-01)

Full `npm test` run in `backend/` was executed twice during 19-01 verification:
- Run 1: 3 files failed, 390/393 tests passed
- Run 2: 2 files failed, 391/393 tests passed

Across both runs, every failure was one of these two pre-existing concurrency-race tests, both surfacing the identical underlying Sequelize error `Record has changed since last read in table '...'` (an optimistic-lock collision under real concurrent-transaction load, not an assertion-logic bug):

- **File:** `backend/src/services/familyMember.dedup.test.js`
  **Test:** `addChild REL-06 dedup guard (D-08/D-09/D-10/D-11) > (D-10 resolver-path TOCTOU, CR-01) detects a duplicate even when a plain read earlier in the SAME transaction froze the REPEATABLE READ snapshot`
  **Symptom:** Intermittently throws `Record has changed since last read in table 'family_members'` instead of the expected dedup-guard message.

- **File:** `backend/src/resolvers/verifyEmail.test.js`
  **Test:** `verifyEmail > lets two users racing to verify simultaneously each keep a usable session, with exactly one becoming ADMIN (VERIFY-04)`
  **Symptom:** Intermittently surfaces `Record has changed since last read in table 'users'` as a GraphQL error instead of both racers succeeding.

**Status:** Documented pre-existing concurrency/TOCTOU flakiness — PROJECT.md's Phase 18 completion note already references "2 remaining failures are documented pre-existing concurrency/TOCTOU flakes." Confirmed unrelated to 19-01's changes: neither test file intersects the schema/resolver/model files this plan touched (`familyMember.schema.js`, `user.resolver.js`'s `OPTIONAL_FAMILY_MEMBER_FIELDS`, `FamilyMember.js`'s `geezFullname` VIRTUAL type declaration). Re-running the isolated task-scoped test commands (`familyMember`, `FamilyMember.test`, `familyMember.geez`) is stable/green; only the full-suite run under real concurrent DB load exhibits this pre-existing flakiness. Not fixed per SCOPE BOUNDARY — out of scope for Phase 19.
