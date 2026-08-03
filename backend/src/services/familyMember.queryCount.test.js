import { describe, it, expect, beforeEach } from 'vitest';
import { sequelize, models } from '../models/index.js';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';
import { buildGenerationFixture } from '../../test/familyTreeFactory.js';
import { env } from '../config/env.js';

beforeEach(resetTables);

// Swaps sequelize.options.logging to a counting no-op for the duration of
// `fn`, restoring the original value in a finally block (verified recipe,
// RESEARCH.md "Measuring resolved SQL query count").
async function countQueries(fn) {
  const original = sequelize.options.logging;
  let count = 0;
  sequelize.options.logging = () => {
    count += 1;
  };
  try {
    await fn();
  } finally {
    sequelize.options.logging = original;
  }
  return count;
}

function buildNestedChildrenSelection(remainingLevels) {
  if (remainingLevels === 0) return 'id';
  return `id children { ${buildNestedChildrenSelection(remainingLevels - 1)} }`;
}

function buildDeepChildrenQuery(nestingLevels) {
  return `
    query DeepTree($id: ID!) {
      familyMember(id: $id) {
        ${buildNestedChildrenSelection(nestingLevels)}
      }
    }
  `;
}

function countNodes(node) {
  if (!node) return 0;
  let count = 1;
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      count += countNodes(child);
    }
  }
  return count;
}

// D-06 read shape: direct children, each annotated with its own nested
// children ids (for client-derived counts, D-05) and its spouses. Built
// directly via models.FamilyMember.create()/models.Spouse.create() --
// buildGenerationFixture (familyTreeFactory.js) produces a single-lineage
// tree with NO spouse rows, so it cannot exercise the `spouses { id }` leg
// of this shape (see 24-02-PLAN.md interfaces).
const CHILDREN_SPOUSES_QUERY = `
  query ChildrenSpouses($id: ID!) {
    familyMember(id: $id) {
      id
      children {
        id
        children { id }
        spouses { id }
      }
    }
  }
`;

async function buildChildrenWithSpousesFixture(childCount) {
  const root = await models.FamilyMember.create({ firstname: 'Root', lastname: 'Person', gender: 'Other' });

  const children = [];
  for (let i = 0; i < childCount; i += 1) {
    const child = await models.FamilyMember.create({
      firstname: `Child${i}`,
      lastname: 'Person',
      gender: 'Other',
      motherId: root.id
    });
    children.push(child);

    for (let g = 0; g < 2; g += 1) {
      await models.FamilyMember.create({
        firstname: `Grandchild${i}_${g}`,
        lastname: 'Person',
        gender: 'Other',
        motherId: child.id
      });
    }
  }

  // At least one married-in spouse, attached to the first child.
  const spouse = await models.FamilyMember.create({ firstname: 'Spouse', lastname: 'InLaw', gender: 'Other' });
  await models.Spouse.create({ memberAId: children[0].id, memberBId: spouse.id });

  return { root, children };
}

describe('SC-5: FamilyMember relationship query safety', () => {
  it('resolves a deep, wide fixture (8 generations, 255 nodes) through nested children fields with the expected shape', async () => {
    const { root } = await buildGenerationFixture({ depth: 8, childrenPerNode: 2 });
    const admin = await createTestUser({ role: 'ADMIN', familyMemberId: null });

    // 7 nested `children` levels reach generation 8 from the root (generation 1).
    const { data, errors } = await graphql(buildDeepChildrenQuery(7), { id: root.id }, admin);

    expect(errors).toBeUndefined();
    expect(countNodes(data.familyMember)).toBe(255);
  });

  it('resolves the same nested deep-tree query with a flat, bounded SQL query count (not proportional to the 255-node fixture size)', async () => {
    const { root } = await buildGenerationFixture({ depth: 8, childrenPerNode: 2 });
    const admin = await createTestUser({ role: 'ADMIN', familyMemberId: null });

    let result;
    const queryCount = await countQueries(async () => {
      result = await graphql(buildDeepChildrenQuery(7), { id: root.id }, admin);
    });

    expect(result.errors).toBeUndefined();
    expect(countNodes(result.data.familyMember)).toBe(255);
    // Bounded by depth (one batched query per nesting level, plus the root
    // lookup), NOT by the 255-node fixture's total size -- an unbatched N+1
    // implementation would turn this into hundreds of queries.
    expect(queryCount).toBeLessThan(20);
  });

  it('rejects a real recursive-field query nesting `children` beyond env.maxQueryDepth as a validation error', async () => {
    const { root } = await buildGenerationFixture({ depth: 2, childrenPerNode: 1 });
    const admin = await createTestUser({ role: 'ADMIN', familyMemberId: null });

    const overDepthQuery = buildDeepChildrenQuery(env.maxQueryDepth + 10);

    const { data, errors } = await graphql(overDepthQuery, { id: root.id }, admin);

    expect(errors).toBeDefined();
    expect(errors[0].extensions.code).toBe('GRAPHQL_VALIDATION_FAILED');
    expect(data == null).toBe(true);
  });

  // SC-4/PERF-02 (D-05/D-06): proves the /detail direct-children read shape --
  // children, each with its own nested children ids (for client-derived
  // counts) and spouses -- resolves in a flat, bounded SQL-statement count
  // that does NOT grow as the number of direct children scales from ~3 to
  // ~10, reusing the existing childrenByParentId/spousesByMemberId loaders
  // unmodified.
  it('resolves direct children with nested children ids and spouses in a bounded SQL query count that does not grow with child count', async () => {
    const admin = await createTestUser({ role: 'ADMIN', familyMemberId: null });

    const small = await buildChildrenWithSpousesFixture(3);
    let smallResult;
    const smallQueryCount = await countQueries(async () => {
      smallResult = await graphql(CHILDREN_SPOUSES_QUERY, { id: small.root.id }, admin);
    });

    expect(smallResult.errors).toBeUndefined();
    expect(smallResult.data.familyMember.children).toHaveLength(3);
    for (const child of smallResult.data.familyMember.children) {
      expect(child.children).toHaveLength(2);
    }
    const smallSpouseCounts = smallResult.data.familyMember.children.map((child) => child.spouses.length);
    expect(smallSpouseCounts.filter((count) => count === 1)).toHaveLength(1);
    expect(smallSpouseCounts.filter((count) => count === 0)).toHaveLength(2);
    expect(smallQueryCount).toBeLessThan(10);

    await resetTables();

    const large = await buildChildrenWithSpousesFixture(10);
    let largeResult;
    const largeQueryCount = await countQueries(async () => {
      largeResult = await graphql(CHILDREN_SPOUSES_QUERY, { id: large.root.id }, admin);
    });

    expect(largeResult.errors).toBeUndefined();
    expect(largeResult.data.familyMember.children).toHaveLength(10);
    for (const child of largeResult.data.familyMember.children) {
      expect(child.children).toHaveLength(2);
    }
    const largeSpouseCounts = largeResult.data.familyMember.children.map((child) => child.spouses.length);
    expect(largeSpouseCounts.filter((count) => count === 1)).toHaveLength(1);
    expect(largeSpouseCounts.filter((count) => count === 0)).toHaveLength(9);

    // The concrete flat/bounded proof: scaling direct children ~3x (3 -> 10)
    // must NOT increase the SQL-statement count -- an unbatched N+1
    // implementation would grow linearly with child count instead.
    expect(largeQueryCount).toBeLessThanOrEqual(smallQueryCount);
    expect(largeQueryCount).toBeLessThan(10);
  });
});
