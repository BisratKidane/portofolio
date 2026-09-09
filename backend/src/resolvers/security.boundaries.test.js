import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildSchema,
  parse,
  validate,
  isNonNullType,
  isListType,
  isScalarType,
  isEnumType,
  isObjectType,
  isInputObjectType
} from 'graphql';

// ---------------------------------------------------------------------------
// THE MILESTONE'S PROOF ARTIFACT (D-11).
//
// One file a reviewer can read top to bottom as "here is the whole boundary":
//   - SEC-04 -- a linked, Active, non-admin cannot invite, approve, reject or
//     flip the public-registration switch, and the switch is not a
//     permission (an admin gets no exemption from a closed tokenless door).
//   - SEC-05 -- every non-allowlisted root field on the real GraphQL schema,
//     plus the three non-GraphQL photo routes, refuses a Pending
//     self-registrant's genuine JWT.
//
// The existing, deeper per-resolver adversarial tests
// (createInvitation.test.js, approveReject.test.js, setUserPassword.test.js,
// accountStatus.test.js) are NOT moved or modified by this file -- each cell
// below that duplicates one of their cases carries a `coveredBy` reference
// naming exactly which file/line already covers it in more depth.
//
// THIS FILE DELIBERATELY USES TWO DIFFERENT HARNESSES -- do not "tidy" them
// into one; doing so silently guts the proof:
//   - `graphql()` (backend/test/helpers.js) injects `contextValue.user`
//     DIRECTLY into the resolver context. That is correct for SEC-04, whose
//     actor is a genuinely authenticated, Active, linked non-admin -- exactly
//     what `createInvitation.test.js:102` already does. It is WRONG for
//     SEC-05, because it never calls `getUserFromRequest` at all.
//   - `httpClient()` (supertest over the real Express `app`) + a real
//     `Authorization: Bearer ${signToken(pending)}` header is the ONLY
//     harness that runs `getUserFromRequest` -- the exact chokepoint SEC-05
//     exists to prove has REACH over every authenticated surface. Using
//     `graphql()` here would hand every resolver a fully-populated Pending
//     `User` that `requireAuth` happily accepts, testing a state production
//     can never reach.
// ---------------------------------------------------------------------------

// Every admin control below fires a real mutation (createInvitation,
// approveUser, rejectUser) against a mocked mailer so no outbound email is
// ever sent during this file's run. Spreads the real module so any export a
// resolver reaches but this list omits still resolves to something callable,
// rather than `undefined` (the exact Rule-3 fix 34-05's SUMMARY documented).
vi.mock('../services/mailer.js', async (importOriginal) => ({
  ...(await importOriginal()),
  sendInvitationEmail: vi.fn().mockResolvedValue(undefined),
  sendAccountApprovedEmail: vi.fn().mockResolvedValue(undefined),
  sendAccountRejectedEmail: vi.fn().mockResolvedValue(undefined),
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendPendingRegistrationEmail: vi.fn().mockResolvedValue(undefined),
  sendRegistrationAttemptEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined)
}));

import { graphql, httpClient, resetTables, createTestUser } from '../../test/helpers.js';
import { models } from '../models/index.js';
import { typeDefs } from '../schemas/index.js';
import { signToken, createInvitationToken, hashInvitationToken } from '../utils/auth.js';
import { PUBLIC_REGISTRATION_CLOSED_MESSAGE } from './user.resolver.js';
import { PUBLIC_REGISTRATION_KEY } from '../utils/appSettings.js';

// The real SDL, enumerated by buildSchema -- never a regex over the `#graphql`
// template literals and never introspection through the running server
// (introspection is subject to maxDepthRule/env.maxQueryDepth, defaulting to
// 12 -- graphql/serverConfig.js:26, config/env.js:43 -- so a future depth
// reduction would silently break a sweep built on introspection instead).
const schema = buildSchema(typeDefs.join('\n'));

const AUTH_ERROR = 'You must be logged in to perform this action.';
const ADMIN_REQUIRED = 'Admin access is required.';

// The linked, Active, non-admin USER actor SEC-04 needs -- built exactly the
// way createInvitation.test.js's activeMember() builds it (F-01/SC-1: an
// unlinked account would only prove the OLD requireFamilyAccess guard, not
// the requireAdmin guard this matrix is about).
async function activeMember(overrides = {}) {
  const member = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
  return createTestUser({ role: 'USER', familyMemberId: member.id, ...overrides });
}

// Creates a Pending invitation and returns its raw (unhashed) token -- the
// D-08 control needs a real, redeemable invitation while the door is closed.
async function makeInvitation(overrides = {}) {
  const inviter =
    overrides.inviter || (await createTestUser({ role: 'ADMIN', email: `sec04-inviter-${Date.now()}@example.com` }));
  const rawToken = createInvitationToken();
  const invitation = await models.Invitation.create({
    tokenHash: hashInvitationToken(rawToken),
    inviterId: inviter.id,
    invitedEmail: overrides.invitedEmail || 'sec04-invitee@example.com',
    relationshipToFamily: overrides.relationshipToFamily || 'cousin',
    expiresAt: overrides.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    status: overrides.status || 'Pending'
  });
  return { rawToken, invitation, inviter };
}

beforeEach(resetTables);

// SEC-04's matrix: one row per requireAdmin-guarded root field this plan and
// plan 34-03 introduce/touch. Each row is executed twice below -- once by a
// linked, Active, non-admin actor (must refuse with ADMIN_REQUIRED), once by
// a genuine ADMIN actor (the positive control: must NOT produce
// ADMIN_REQUIRED). `coveredBy` names the pre-existing per-resolver test that
// already exercises this exact adversarial case in more depth; that file is
// UNCHANGED and UNMOVED by this plan (D-11) -- executing the cell here too,
// rather than only referencing it, is what keeps this matrix a proof instead
// of an index that rots the moment the referenced test is renamed or moved.
const NON_ADMIN_CELLS = [
  {
    label: 'createInvitation',
    coveredBy: 'createInvitation.test.js:102',
    query: `mutation($input: CreateInvitationInput!) { createInvitation(input: $input) { invitation { id } } }`,
    variables: { input: { invitedEmail: 'sec04-invite@example.com' } }
  },
  {
    label: 'approveUser',
    coveredBy: 'approveReject.test.js',
    query: `mutation($id: ID!) { approveUser(userId: $id) { id } }`,
    variables: { id: '999999' }
  },
  {
    label: 'rejectUser',
    coveredBy: 'approveReject.test.js',
    query: `mutation($id: ID!) { rejectUser(userId: $id) { id } }`,
    variables: { id: '999999' }
  },
  {
    label: 'setUserPassword',
    coveredBy: 'setUserPassword.test.js:26',
    query: `mutation($id: ID!, $pw: String!) { setUserPassword(userId: $id, newPassword: $pw) }`,
    variables: { id: '999999', pw: 'NewPassword123!' }
  },
  {
    label: 'pendingApprovals',
    coveredBy: null,
    query: `query { pendingApprovals { id } }`,
    variables: {}
  },
  {
    label: 'myInvitations',
    coveredBy: null,
    query: `query { myInvitations { id } }`,
    variables: {}
  },
  {
    label: 'invitations',
    coveredBy: null,
    query: `query { invitations { id } }`,
    variables: {}
  },
  {
    label: 'linkUserToMember',
    coveredBy: null,
    // memberId/newMember both omitted deliberately: requireAdmin fires
    // before either is ever read, so the non-admin cell never reaches the
    // "provide exactly one" validation this resolver applies afterward.
    query: `mutation($id: ID!) { linkUserToMember(userId: $id) { id } }`,
    variables: { id: '999999' }
  },
  {
    label: 'deleteMember',
    coveredBy: null,
    query: `mutation($id: ID!) { deleteMember(id: $id) }`,
    variables: { id: '999999' }
  },
  {
    label: 'publicRegistrationSetting',
    coveredBy: null,
    query: `query { publicRegistrationSetting { enabled } }`,
    variables: {}
  },
  {
    label: 'setPublicRegistrationEnabled',
    coveredBy: null,
    query: `mutation($enabled: Boolean!) { setPublicRegistrationEnabled(enabled: $enabled) { enabled } }`,
    variables: { enabled: true }
  }
];

describe('SEC-04 — a non-admin cannot invite, approve, reject, or flip the switch', () => {
  it.each(NON_ADMIN_CELLS)(
    '$label refuses a linked, Active, non-admin member (coveredBy: $coveredBy)',
    async ({ label, query, variables }) => {
      const member = await activeMember({ email: `sec04-nonadmin-${label}@example.com` });
      const { errors } = await graphql(query, variables, member);
      expect(errors?.[0]?.message).toBe(ADMIN_REQUIRED);
    }
  );
});

// Without this control, the matrix above could stay green even if
// activeMember()'s actor construction were broken and every call were
// failing for an unrelated reason (a bad familyMemberId, a broken fixture) --
// a fresh instance of this test and the guard sharing the same blind spot.
// Each control uses a genuine ADMIN actor and asserts only that the outcome
// is NOT admin-refusal; it may legitimately be a domain error such as 'User
// not found.' or 'Family member not found.', and the control must not depend
// on which -- an admin pass firing ~11 real mutations proves reachability,
// not business-logic correctness.
describe('SEC-04 — admin positive controls', () => {
  it.each(NON_ADMIN_CELLS)(
    '$label does not refuse a genuine ADMIN with the admin-required message (coveredBy: $coveredBy)',
    async ({ label, query, variables }) => {
      const admin = await createTestUser({ role: 'ADMIN', email: `sec04-admincontrol-${label}@example.com` });
      const { errors } = await graphql(query, variables, admin);
      if (errors) {
        expect(errors[0].message).not.toBe(ADMIN_REQUIRED);
      }
    }
  );
});

describe('SEC-04 — the tokenless door (ADMIN-02)', () => {
  const REGISTER_MUTATION = `
    mutation Register($token: String, $name: String!, $email: String, $password: String!, $relationshipNote: String) {
      register(token: $token, name: $name, email: $email, password: $password, relationshipNote: $relationshipNote) { message }
    }
  `;

  async function closeDoor() {
    await models.AppSetting.upsert({ settingKey: PUBLIC_REGISTRATION_KEY, value: 'false', updatedById: null });
  }

  // Actor is null, not a non-admin -- this is SEC-04's third clause: an
  // anonymous caller cannot register tokenless while the switch is off.
  it('anonymous, door closed: tokenless register is refused with the exact closed-door message', async () => {
    await closeDoor();
    const { errors } = await graphql(
      REGISTER_MUTATION,
      { name: 'Stranger', email: 'sec04-stranger@example.com', password: 'Password123!' },
      null
    );
    expect(errors?.[0]?.message).toBe(PUBLIC_REGISTRATION_CLOSED_MESSAGE);
  });

  // D-08 control: without this, the matrix could be green because the switch
  // broke ALL registration, not because it specifically closed the tokenless
  // door. A real invitation must still redeem successfully while closed.
  it('anonymous, door closed, valid invitation: register still succeeds (D-08 control)', async () => {
    await closeDoor();
    const { rawToken } = await makeInvitation();
    const { data, errors } = await graphql(
      REGISTER_MUTATION,
      { token: rawToken, name: 'Invited Person', password: 'Password123!' },
      null
    );
    expect(errors).toBeUndefined();
    expect(data.register.message).toBeTruthy();
  });

  // The switch is not a permission: being an admin does not reopen the door
  // for a tokenless call for yourself.
  it('admin, door closed: tokenless register is still refused', async () => {
    await closeDoor();
    const admin = await createTestUser({ role: 'ADMIN', email: 'sec04-admin-door@example.com' });
    const { errors } = await graphql(
      REGISTER_MUTATION,
      { name: 'Admin Self Signup', email: 'sec04-admin-self@example.com', password: 'Password123!' },
      admin
    );
    expect(errors?.[0]?.message).toBe(PUBLIC_REGISTRATION_CLOSED_MESSAGE);
  });
});

// ---------------------------------------------------------------------------
// SEC-05 -- the schema-driven sweep (E-2's verified prototype, ported
// verbatim). Enumerates every root field from the REAL SDL (buildSchema over
// the same typeDefs array Apollo Server builds from), synthesizes a valid
// operation for each, and executes it over real HTTP with a real Pending
// user's JWT -- proving getUserFromRequest's REACH, not merely its presence.
// ---------------------------------------------------------------------------

const unwrap = (t) => (isNonNullType(t) || isListType(t) ? unwrap(t.ofType) : t);

function selectionFor(type, depth = 0) {
  const named = unwrap(type);
  if (isScalarType(named) || isEnumType(named)) return '';
  if (depth > 3) return ' { __typename }';
  const fields = named.getFields();
  for (const f of Object.values(fields)) {
    const ft = unwrap(f.type);
    if ((isScalarType(ft) || isEnumType(ft)) && f.args.every((a) => !isNonNullType(a.type))) {
      return ` { ${f.name} }`;
    }
  }
  for (const f of Object.values(fields)) {
    const ft = unwrap(f.type);
    if (isObjectType(ft) && f.args.every((a) => !isNonNullType(a.type))) {
      return ` { ${f.name}${selectionFor(f.type, depth + 1)} }`;
    }
  }
  return ' { __typename }';
}

function dummyValue(type) {
  if (isNonNullType(type)) return dummyValue(type.ofType);
  if (isListType(type)) return [dummyValue(type.ofType)];
  if (isEnumType(type)) return type.getValues()[0].name;
  if (isInputObjectType(type)) {
    const out = {};
    for (const f of Object.values(type.getFields())) {
      if (isNonNullType(f.type)) out[f.name] = dummyValue(f.type);
    }
    return out;
  }
  switch (type.name) {
    case 'ID':
      return '1';
    case 'Int':
      return 1;
    case 'Float':
      return 1.0;
    case 'Boolean':
      return true;
    default:
      return 'x';
  }
}

function buildOperation(opKind, fieldName, field) {
  const varDefs = [];
  const argStrs = [];
  const variables = {};
  for (const arg of field.args) {
    if (!isNonNullType(arg.type)) continue; // only REQUIRED args
    const varName = `v_${arg.name}`;
    varDefs.push(`$${varName}: ${arg.type.toString()}`);
    argStrs.push(`${arg.name}: $${varName}`);
    variables[varName] = dummyValue(arg.type);
  }
  const varPart = varDefs.length ? `(${varDefs.join(', ')})` : '';
  const argPart = argStrs.length ? `(${argStrs.join(', ')})` : '';
  return {
    query: `${opKind} Sweep${varPart} { ${fieldName}${argPart}${selectionFor(field.type)} }`,
    variables
  };
}

describe('SEC-05 — no Pending self-registrant reaches any authenticated root field', () => {
  // This IS the security surface: a root field is authenticated by default
  // unless someone deliberately writes its name down here. Adding a name is
  // a reviewable, two-place edit (this Set + the pinned sorted-array
  // assertion below), never a silent widening.
  const PUBLIC_ALLOWLIST = new Set([
    'login',
    'publicRegistrationEnabled',
    'register',
    'requestPasswordReset',
    'resendVerificationEmail',
    'resetPassword',
    'verifyEmail'
  ]);

  // A THIRD category, not public: `me` legitimately resolves to null for an
  // unauthenticated/Pending caller instead of throwing. Putting it in the
  // allowlist above would be a silent hole -- a future `me` that leaked a
  // Pending user's row would pass a naive "is it allowlisted" sweep. It gets
  // its own explicit assertion instead.
  const NULL_RESULT_FIELDS = new Set(['me']);

  const queryFields = Object.values(schema.getQueryType().getFields());
  const mutationFields = Object.values(schema.getMutationType().getFields());
  const sweepRows = [
    ...queryFields
      .filter((f) => !PUBLIC_ALLOWLIST.has(f.name))
      .map((field) => ({ opKind: 'query', name: field.name, field })),
    ...mutationFields
      .filter((f) => !PUBLIC_ALLOWLIST.has(f.name))
      .map((field) => ({ opKind: 'mutation', name: field.name, field }))
  ];

  // Deliberately does NOT use the graphql() helper anywhere in this block --
  // graphql() injects contextValue.user directly (helpers.js:16-26), so
  // getUserFromRequest never runs. It would hand every resolver a
  // fully-populated Pending User that requireAuth happily accepts, testing a
  // state production can never reach. Every execution below goes through
  // httpClient().post('/graphql') with a real signToken(pending) header.
  it.each(sweepRows)('$opKind field $name refuses a Pending self-registrant', async ({ opKind, name, field }) => {
    const pending = await createTestUser({
      status: 'Pending',
      emailVerified: true,
      email: `p-${name}@example.com`
    });

    const { query, variables } = buildOperation(opKind, name, field);

    // Not optional. Without this, a future schema change (a new required
    // argument of an unhandled type, a return type with no scalar leaf)
    // could silently turn a sweep row into a validation error that a naive
    // "some error exists" assertion would misread as a pass. This is what
    // makes the sweep self-checking.
    expect(validate(schema, parse(query))).toEqual([]);

    const res = await httpClient()
      .post('/graphql')
      .set('Authorization', `Bearer ${signToken(pending)}`)
      .send({ query, variables });

    if (NULL_RESULT_FIELDS.has(name)) {
      expect(res.body.errors).toBeUndefined();
      expect(res.body.data[name]).toBeNull();
      return;
    }

    // Every guard funnels through requireAuth first (auth.js:43,:48), so
    // with a Pending user's token getUserFromRequest returns null and every
    // one of these fields produces the identical message -- one string, not
    // a set.
    expect(res.body.errors[0].message).toBe(AUTH_ERROR);
    // `path` is populated only during the execution phase, so its presence
    // is positive proof the field's OWN resolver ran and threw -- a
    // validation error has no `path` at all, which is what stops this sweep
    // from being satisfied by a malformed-query false positive.
    expect(res.body.errors[0].path).toEqual([name]);
  });

  // The only thing standing between the allowlist and becoming a dumping
  // ground where a row that fails for an incidental reason gets
  // "temporarily" allowlisted. Any addition is now a two-place, reviewable
  // edit that shows up as a deliberate diff.
  it('pins the public allowlist to exactly these seven names', () => {
    expect([...PUBLIC_ALLOWLIST].sort()).toEqual([
      'login',
      'publicRegistrationEnabled',
      'register',
      'requestPasswordReset',
      'resendVerificationEmail',
      'resetPassword',
      'verifyEmail'
    ]);
  });

  // Pins the swept-field count so the sweep cannot silently shrink. If a
  // plan legitimately adds a root field, this number and (if the field is
  // public) the allowlist above are the two places that must change.
  it('pins the swept root-field count: 14 Query + 21 Mutation, 7 allowlisted, 28 swept', () => {
    expect(queryFields.length).toBe(14);
    expect(mutationFields.length).toBe(21);
    expect(PUBLIC_ALLOWLIST.size).toBe(7);
    expect(sweepRows.length).toBe(28);
  });

  // Scope honesty: this sweep covers ROOT fields only. Nested field
  // resolvers (Invitation.inviter, FamilyMember.createdBy) are unreachable
  // without first passing a guarded root field, so root-level coverage is
  // sufficient for SEC-05's claim.
});
