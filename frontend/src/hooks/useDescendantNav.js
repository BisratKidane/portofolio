// First custom hook in this codebase: owns the /detail descendant navigation
// frame (Plan 27-01's pure navReducer) plus a session-scoped in-memory cache
// of already-fetched descendants and the expand-triggered GraphQL fetch.
// See 27-RESEARCH.md Pattern 2 (ref-vs-state cache split) and Pattern 3
// (why this file declares its own narrower query instead of extending
// DetailPage's initial-load person-by-id query).
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { graphqlRequest } from '../api/graphqlClient.js';
import { navReducer, initial } from './descendantNav.reducer.js';

// PERF-01: deliberately a SEPARATE, narrower query from DetailPage's
// initial-load query — fired only on expand, never on initial /detail load.
const EXPAND_CHILDREN_QUERY = `
  query ExpandChildren($id: ID!) {
    familyMember(id: $id) {
      children {
        id
        fullname
        geezFullname
        gender
        isAlive
        photoUrl
        canEdit
        spouses { id fullname geezFullname gender isAlive photoUrl }
        children { id }
      }
    }
  }
`;

// D-04: refreshEntry's own query — combines the target's OWN display fields
// (needed after an edit or add-spouse) with its full children set (needed
// after an add-child), reusing the exact field shapes already proven
// N+1-free by FAMILY_MEMBER_QUERY (DetailPage.jsx) and EXPAND_CHILDREN_QUERY
// above. Always issued fresh — never a cache-hit short-circuit.
const REFRESH_PERSON_QUERY = `
  query RefreshPerson($id: ID!) {
    familyMember(id: $id) {
      id
      fullname
      geezFullname
      gender
      isAlive
      photoUrl
      canEdit
      spouses { id fullname geezFullname gender isAlive photoUrl }
      children {
        id
        fullname
        geezFullname
        gender
        isAlive
        photoUrl
        canEdit
        spouses { id fullname geezFullname gender isAlive photoUrl }
        children { id }
      }
    }
  }
`;

export function useDescendantNav(mainPerson) {
  // PERF-03: the cache is a ref, never React state — a cache write alone
  // must never trigger a re-render. Entry shape: { self, children }, where
  // `children` stays undefined until the fetch resolves (cache miss), then
  // holds the fetched array (cache hit thereafter).
  const cache = useRef(new Map());
  const [state, dispatch] = useReducer(navReducer, mainPerson?.id, initial);
  const [loadingId, setLoadingId] = useState(null);

  // D-09: a search-driven mainPerson change resets the view frame alone —
  // cache.current is deliberately never cleared here, so previously-loaded
  // descendants stay cached across a main-person swap.
  useEffect(() => {
    dispatch({ type: 'RESET', id: mainPerson?.id });
    if (!mainPerson) return;
    const existing = cache.current.get(mainPerson.id);
    cache.current.set(mainPerson.id, { self: mainPerson, children: existing?.children });
  }, [mainPerson?.id]);

  const ensureEntry = useCallback((person) => {
    const existing = cache.current.get(person.id);
    if (existing?.children !== undefined) {
      // Cache hit — zero network call.
      return Promise.resolve();
    }
    // Seed/refresh `self` synchronously before the async call so it's
    // available immediately even while the fetch is in flight.
    cache.current.set(person.id, { self: person, children: existing?.children });
    setLoadingId(person.id);
    return graphqlRequest(EXPAND_CHILDREN_QUERY, { id: person.id })
      .then((data) => {
        cache.current.set(person.id, { self: person, children: data.familyMember?.children ?? [] });
      })
      .finally(() => {
        setLoadingId((current) => (current === person.id ? null : current));
      });
  }, []);

  const onExpandTop = useCallback(
    (person) => ensureEntry(person).then(() => dispatch({ type: 'EXPAND_TOP' })),
    [ensureEntry]
  );

  const onExpandChild = useCallback(
    (person) => ensureEntry(person).then(() => dispatch({ type: 'EXPAND_CHILD', id: person.id })),
    [ensureEntry]
  );

  const onExpandGrandchild = useCallback(
    (person) => ensureEntry(person).then(() => dispatch({ type: 'EXPAND_GRANDCHILD', id: person.id })),
    [ensureEntry]
  );

  // D-04: closes the Phase-27-deferred cache-invalidation gap. Unlike
  // ensureEntry, this ALWAYS issues a fresh request — never a cache-hit
  // short-circuit — and is fully id-agnostic (no branching on whether `id`
  // is state.topId, a gen1/gen2 descendant, or not yet cached at all).
  const refreshEntry = useCallback((id) => {
    setLoadingId(id);
    return graphqlRequest(REFRESH_PERSON_QUERY, { id })
      .then((data) => {
        const fresh = data.familyMember;
        if (!fresh) return null;
        const { children, ...self } = fresh;
        cache.current.set(id, { self, children: children ?? [] });
        dispatch({ type: 'REFRESH' });
        return fresh;
      })
      .finally(() => {
        setLoadingId((current) => (current === id ? null : current));
      });
  }, []);

  const topPerson = cache.current.get(state.topId)?.self ?? mainPerson;
  const gen1 = cache.current.get(state.topId)?.children ?? [];
  const gen2 = state.expandedChildId ? cache.current.get(state.expandedChildId)?.children ?? [] : [];

  return {
    topPerson,
    topExpanded: state.topExpanded,
    gen1,
    expandedChildId: state.expandedChildId,
    gen2,
    loadingId,
    onExpandTop,
    onExpandChild,
    onExpandGrandchild,
    refreshEntry
  };
}
