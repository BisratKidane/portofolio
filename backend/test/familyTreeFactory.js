import { models } from '../src/models/index.js';

let sequenceCounter = 0;

function nextSequence() {
  sequenceCounter += 1;
  return sequenceCounter;
}

/**
 * Builds a single-lineage N-generation FamilyMember tree, starting from one
 * root row and looping `depth - 1` times: at each level, every node in the
 * current generation gets `childrenPerNode` new child rows, and the parent
 * FK used (motherId vs fatherId) alternates by level (odd levels link via
 * motherId, even levels via fatherId) -- an arbitrary, documented choice;
 * this fixture is not exercising gender-consistency rules, only the
 * either-parent-FK query/loader shape.
 *
 * Follows createTestUser's "options object with defaults, returns created
 * Sequelize instance(s)" convention (backend/test/helpers.js).
 *
 * For depth: 8, childrenPerNode: 2 this produces a 255-node, 8-generation
 * tree (root counts as generation 1; total nodes = childrenPerNode^depth - 1
 * for childrenPerNode = 2, i.e. sum_{i=0}^{depth-1} childrenPerNode^i).
 *
 * Returns { root } -- the root FamilyMember instance.
 */
export async function buildGenerationFixture({ depth, childrenPerNode }) {
  const root = await models.FamilyMember.create({
    firstname: `Root${nextSequence()}`,
    lastname: 'Fixture',
    gender: 'Other'
  });

  let currentGeneration = [root];

  for (let level = 1; level < depth; level += 1) {
    const useMother = level % 2 === 1;
    const nextGeneration = [];

    for (const parent of currentGeneration) {
      for (let i = 0; i < childrenPerNode; i += 1) {
        const child = await models.FamilyMember.create({
          firstname: `Gen${level + 1}Node${nextSequence()}`,
          lastname: 'Fixture',
          gender: 'Other',
          motherId: useMother ? parent.id : null,
          fatherId: useMother ? null : parent.id
        });
        nextGeneration.push(child);
      }
    }

    currentGeneration = nextGeneration;
  }

  return { root };
}
