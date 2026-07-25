// Throwaway spike fixture generator (Phase 17, Plan 17-02, SC-1/D-11 gate).
// Plain in-memory JS, no backend/DB -- mirrors backend/test/familyTreeFactory.js's
// alternating-parent-FK generator SHAPE (parameterized depth, sequential ids),
// but produces the flat payload shape familyTree.assembly.js's buildForest()
// expects (17-RESEARCH.md Pattern 1: { id, mother: {id}|null, father: {id}|null,
// spouses: [{id}], children: [{id}] }), and ALSO gives every non-leaf node a
// spouse so union-node synthesis triggers at EVERY generation, not just plain
// parent-child edges.
//
// This file (and TreeSpikeHarness.jsx, and the temporary family-spike route in
// App.jsx) is explicitly temporary -- Plan 17-03 Task 1 deletes __spike/ and
// removes the route once the SC-1 checkpoint is approved.

let idCounter = 0;

function nextId() {
  idCounter += 1;
  return String(idCounter);
}

function makePerson(overrides = {}) {
  const id = nextId();
  return {
    id,
    firstname: overrides.firstname || `Person${id}`,
    lastname: 'Spike',
    fullname: `${overrides.firstname || `Person${id}`} Spike`,
    gender: overrides.gender || 'Other',
    birthdate: null,
    deathdate: null,
    photoUrl: null,
    mother: overrides.mother || null,
    father: overrides.father || null,
    spouses: [],
    children: []
  };
}

function marry(a, b) {
  a.spouses.push({ id: b.id });
  b.spouses.push({ id: a.id });
}

function haveChild(mother, father, overrides = {}) {
  const child = makePerson({ ...overrides, mother: { id: mother.id }, father: { id: father.id } });
  mother.children.push({ id: child.id });
  father.children.push({ id: child.id });
  return child;
}

/**
 * Generates a ~`generations`-deep synthetic flat FamilyMember list. Every
 * generation's "spine" couple has `sideChildrenPerCouple` children: one
 * designated "heir" who marries a brand-new (married-in, no linked parents --
 * the realistic norm) spouse and continues the spine into the next
 * generation, the rest are terminal leaves (no spouse, no children) so the
 * tree stays a manageable size while still reaching real depth.
 *
 * Returns a flat array of member objects (buildForest's expected input
 * shape). Default generations: 18 (within the 15-20 SC-1 target range).
 */
export function buildSpikeFixture({ generations = 18, sideChildrenPerCouple = 2 } = {}) {
  idCounter = 0;
  const members = [];

  let spineA = makePerson({ firstname: 'Apex-A', gender: 'Female' });
  let spineB = makePerson({ firstname: 'Apex-B', gender: 'Male' });
  marry(spineA, spineB);
  members.push(spineA, spineB);

  for (let gen = 1; gen < generations; gen += 1) {
    const children = [];
    for (let i = 0; i < sideChildrenPerCouple; i += 1) {
      const child = haveChild(spineA, spineB, {
        firstname: `Gen${gen + 1}-${i === 0 ? 'Heir' : `Sibling${i}`}`,
        gender: i % 2 === 0 ? 'Female' : 'Male'
      });
      children.push(child);
      members.push(child);
    }

    const heir = children[0];
    const inLawSpouse = makePerson({ firstname: `Gen${gen + 1}-InLaw`, gender: heir.gender === 'Female' ? 'Male' : 'Female' });
    marry(heir, inLawSpouse);
    members.push(inLawSpouse);

    spineA = heir;
    spineB = inLawSpouse;
  }

  return members;
}
