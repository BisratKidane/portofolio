import DataLoader from 'dataloader';
import { Op } from 'sequelize';

// cacheKeyFn: (key) => String(key) is set on every loader below as a
// defensive normalization against the string-`ID!`-vs-numeric-FK cache-key
// mismatch (GraphQL `ID!` arguments deserialize as strings; Sequelize
// INTEGER.UNSIGNED primary keys are returned as numbers -- DataLoader's
// default cache key is reference/value equality, so "5" and 5 would
// otherwise be treated as different cache entries and silently defeat
// batching for exactly the call sites that should share a key).
//
// createLoaders must be called fresh per request (or per graphql() test
// call) -- never construct a DataLoader at module scope, which would leak
// one caller's cached rows into another caller's resolved fields (D-07).
export function createLoaders(models) {
  return {
    memberById: new DataLoader(
      async (ids) => {
        const rows = await models.FamilyMember.findAll({ where: { id: ids } });
        const byId = new Map(rows.map((row) => [String(row.id), row]));
        return ids.map((id) => byId.get(String(id)) ?? null);
      },
      { cacheKeyFn: (key) => String(key) }
    ),

    childrenByParentId: new DataLoader(
      async (parentIds) => {
        const rows = await models.FamilyMember.findAll({
          where: { [Op.or]: [{ motherId: parentIds }, { fatherId: parentIds }] }
        });
        const byParent = new Map(parentIds.map((id) => [String(id), []]));
        for (const row of rows) {
          if (row.motherId != null && byParent.has(String(row.motherId))) {
            byParent.get(String(row.motherId)).push(row);
          }
          if (row.fatherId != null && byParent.has(String(row.fatherId))) {
            byParent.get(String(row.fatherId)).push(row);
          }
        }
        return parentIds.map((id) => byParent.get(String(id)));
      },
      { cacheKeyFn: (key) => String(key) }
    ),

    spousesByMemberId: new DataLoader(
      async (memberIds) => {
        const rows = await models.Spouse.findAll({
          where: { [Op.or]: [{ memberAId: memberIds }, { memberBId: memberIds }] },
          include: [{ association: 'memberA' }, { association: 'memberB' }]
        });
        const byMember = new Map(memberIds.map((id) => [String(id), []]));
        for (const row of rows) {
          if (byMember.has(String(row.memberAId))) byMember.get(String(row.memberAId)).push(row.memberB);
          if (byMember.has(String(row.memberBId))) byMember.get(String(row.memberBId)).push(row.memberA);
        }
        return memberIds.map((id) => byMember.get(String(id)));
      },
      { cacheKeyFn: (key) => String(key) }
    )
  };
}
