import { describe, it, expect, beforeEach } from 'vitest';
import { sequelize } from '../models/index.js';
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
});
