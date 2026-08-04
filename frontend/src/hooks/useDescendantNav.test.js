// Test suite specifying useDescendantNav's cache/fetch/derive contract before
// implementation exists (TDD RED). Mirrors DetailPage.test.jsx's
// graphqlRequest mock idiom (lines 12-20) and mock-chaining pattern, but uses
// renderHook (not a full component mount) since this is a hook-level unit.
// Each `it` renders its own fresh hook instance and replays only the prior
// steps it needs (frontend/test/setup.js runs RTL's global `cleanup()` after
// every test, which unmounts renderHook's host component — so state cannot
// be carried across `it` boundaries via a shared instance).
// Fixture chain models a 3-generation expand/shift walk:
//   MAIN_PERSON (id '1') -> CHILD (id '2') -> GRANDCHILD (id '3') -> GREAT_GRANDCHILD (id '4')
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useDescendantNav } from './useDescendantNav.js';

vi.mock('../api/graphqlClient.js', () => ({
  graphqlRequest: vi.fn()
}));

import { graphqlRequest } from '../api/graphqlClient.js';

const MAIN_PERSON = {
  id: '1',
  fullname: 'Main Person',
  geezFullname: null,
  gender: 'Male',
  isAlive: true,
  photoUrl: null,
  canEdit: false,
  spouses: [],
  children: [{ id: '2' }]
};

const OTHER_MAIN_PERSON = {
  id: '99',
  fullname: 'Other Person',
  geezFullname: null,
  gender: 'Female',
  isAlive: true,
  photoUrl: null,
  canEdit: false,
  spouses: [],
  children: []
};

const CHILD = {
  id: '2',
  fullname: 'Child Person',
  geezFullname: null,
  gender: 'Female',
  isAlive: true,
  photoUrl: null,
  canEdit: false,
  spouses: [],
  children: [{ id: '3' }]
};

const GRANDCHILD = {
  id: '3',
  fullname: 'Grandchild Person',
  geezFullname: null,
  gender: 'Male',
  isAlive: true,
  photoUrl: null,
  canEdit: false,
  spouses: [],
  children: [{ id: '4' }]
};

const GREAT_GRANDCHILD = {
  id: '4',
  fullname: 'Great Grandchild Person',
  geezFullname: null,
  gender: 'Female',
  isAlive: true,
  photoUrl: null,
  canEdit: false,
  spouses: [],
  children: []
};

// Replays "mount -> onExpandTop(MAIN_PERSON) -> onExpandChild(CHILD)" so
// tests needing the post-onExpandChild state don't repeat this boilerplate.
// Consumes 2 queued mock resolutions.
async function renderExpandedToChild() {
  graphqlRequest.mockResolvedValueOnce({ familyMember: { children: [CHILD] } });
  const { result } = renderHook(() => useDescendantNav(MAIN_PERSON));
  await act(async () => {
    await result.current.onExpandTop(MAIN_PERSON);
  });

  graphqlRequest.mockResolvedValueOnce({ familyMember: { children: [GRANDCHILD] } });
  await act(async () => {
    await result.current.onExpandChild(CHILD);
  });

  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useDescendantNav', () => {
  it('does not fetch on mount and derives topPerson/gen1/topExpanded from mainPerson alone (PERF-01)', () => {
    const { result } = renderHook(() => useDescendantNav(MAIN_PERSON));

    expect(graphqlRequest).not.toHaveBeenCalled();
    expect(result.current.topPerson).toEqual(MAIN_PERSON);
    expect(result.current.gen1).toEqual([]);
    expect(result.current.topExpanded).toBe(false);
  });

  it('onExpandTop fires exactly one graphqlRequest for the top person and populates gen1 on resolve (PERF-01)', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyMember: { children: [CHILD] } });
    const { result } = renderHook(() => useDescendantNav(MAIN_PERSON));

    await act(async () => {
      await result.current.onExpandTop(MAIN_PERSON);
    });

    expect(graphqlRequest).toHaveBeenCalledTimes(1);
    expect(graphqlRequest.mock.calls[0][0]).toMatch(/children/i);
    expect(graphqlRequest.mock.calls[0][1]).toEqual({ id: '1' });
    expect(result.current.topExpanded).toBe(true);
    expect(result.current.gen1).toEqual([CHILD]);
  });

  it('repeat collapse/re-expand of an already-cached id serves from cache with zero additional graphqlRequest calls (PERF-03/D-09)', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyMember: { children: [CHILD] } });
    const { result } = renderHook(() => useDescendantNav(MAIN_PERSON));

    await act(async () => {
      await result.current.onExpandTop(MAIN_PERSON); // initial expand — 1 fetch
    });
    expect(graphqlRequest).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.onExpandTop(MAIN_PERSON); // collapse — cache hit
    });
    expect(result.current.topExpanded).toBe(false);

    await act(async () => {
      await result.current.onExpandTop(MAIN_PERSON); // re-expand — cache hit
    });
    expect(result.current.topExpanded).toBe(true);

    expect(graphqlRequest).toHaveBeenCalledTimes(1);
  });

  it('onExpandChild fetches exactly once more and populates gen2', async () => {
    const result = await renderExpandedToChild();

    expect(graphqlRequest).toHaveBeenCalledTimes(2);
    expect(graphqlRequest.mock.calls[1][1]).toEqual({ id: CHILD.id });
    expect(result.current.expandedChildId).toBe(CHILD.id);
    expect(result.current.gen2).toEqual([GRANDCHILD]);
  });

  it('onExpandGrandchild shifts the view forward with exactly one new fetch, resolving the promoted parent from cache (D-03/D-09)', async () => {
    const result = await renderExpandedToChild();
    const previousGen2 = result.current.gen2;

    graphqlRequest.mockResolvedValueOnce({ familyMember: { children: [GREAT_GRANDCHILD] } });
    await act(async () => {
      await result.current.onExpandGrandchild(GRANDCHILD);
    });

    // Exactly one new call — for the grandchild's own children. The
    // promoted parent's (CHILD's) children were already cached by the
    // earlier onExpandChild call; no second fetch for them.
    expect(graphqlRequest).toHaveBeenCalledTimes(3);
    expect(graphqlRequest.mock.calls[2][1]).toEqual({ id: GRANDCHILD.id });

    expect(result.current.topPerson).toEqual(CHILD);
    expect(result.current.gen1).toBe(previousGen2);
    expect(result.current.gen2).toEqual([GREAT_GRANDCHILD]);
  });

  it('a RESET (search-driven mainPerson swap) clears only the view frame — re-expanding a previously cached id fires no new fetch (D-09)', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyMember: { children: [CHILD] } });
    const { result, rerender } = renderHook(({ mainPerson }) => useDescendantNav(mainPerson), {
      initialProps: { mainPerson: MAIN_PERSON }
    });

    await act(async () => {
      await result.current.onExpandTop(MAIN_PERSON);
    });
    expect(graphqlRequest).toHaveBeenCalledTimes(1);
    expect(result.current.gen1).toEqual([CHILD]);

    rerender({ mainPerson: OTHER_MAIN_PERSON });
    expect(result.current.topPerson).toEqual(OTHER_MAIN_PERSON);
    expect(result.current.topExpanded).toBe(false);

    const callCountAfterSwap = graphqlRequest.mock.calls.length;

    await act(async () => {
      await result.current.onExpandTop(MAIN_PERSON);
    });

    // The original main person's entry is still cached — no new network call.
    expect(graphqlRequest).toHaveBeenCalledTimes(callCountAfterSwap);
  });

  it('loadingId reflects the in-flight expanding id, then returns to null after it resolves', async () => {
    let resolveFetch;
    graphqlRequest.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );
    const { result } = renderHook(() => useDescendantNav(MAIN_PERSON));

    expect(result.current.loadingId).toBeNull();

    act(() => {
      result.current.onExpandTop(MAIN_PERSON);
    });

    await waitFor(() => expect(result.current.loadingId).toBe(MAIN_PERSON.id));

    await act(async () => {
      resolveFetch({ familyMember: { children: [CHILD] } });
    });

    await waitFor(() => expect(result.current.loadingId).toBeNull());
  });
});

// D-04 (Phase 27's deferred cache-invalidation gap) — refreshEntry(id) always
// issues a fresh combined familyMember+children request, writes cache.current
// unconditionally, and dispatches REFRESH so the write is actually visible.
// Revision note (plan-checker blocker): refreshEntry must be provably
// id-agnostic — the dedicated "refresh the current topId (head)" test below
// is the exact regression proof for that requirement.
describe('refreshEntry', () => {
  it('is included as a function on the object returned by useDescendantNav', () => {
    const { result } = renderHook(() => useDescendantNav(MAIN_PERSON));

    expect(typeof result.current.refreshEntry).toBe('function');
  });

  it('for an already-cached, currently-EXPANDED gen1 descendant (CHILD) issues exactly ONE combined familyMember+children request, immediately refreshes gen2 with the new children, resolves with the fresh payload, and the refreshed self becomes visible as topPerson/gen1 once forward-shifted into (no separate fetch needed for CHILD itself, proving its self+children were both cached)', async () => {
    const result = await renderExpandedToChild();
    expect(graphqlRequest).toHaveBeenCalledTimes(2);

    const UPDATED_CHILD_SELF = { ...CHILD, fullname: 'Child Person Updated' };
    delete UPDATED_CHILD_SELF.children;
    const UPDATED_GRANDCHILD = { ...GRANDCHILD, fullname: 'Grandchild Person Updated' };
    graphqlRequest.mockResolvedValueOnce({
      familyMember: { ...UPDATED_CHILD_SELF, children: [UPDATED_GRANDCHILD] }
    });

    let refreshResult;
    await act(async () => {
      refreshResult = await result.current.refreshEntry(CHILD.id);
    });

    expect(graphqlRequest).toHaveBeenCalledTimes(3);
    const [refreshQuery, refreshVars] = graphqlRequest.mock.calls[2];
    expect(refreshQuery).toMatch(/familyMember/i);
    expect(refreshQuery).toMatch(/children/i);
    expect(refreshVars).toEqual({ id: CHILD.id });

    // Immediate effect: CHILD is already `expandedChildId`, so gen2 (its
    // children) reflects the fresh array on the very next render.
    expect(result.current.gen2).toEqual([UPDATED_GRANDCHILD]);
    expect(refreshResult).toEqual({ ...UPDATED_CHILD_SELF, children: [UPDATED_GRANDCHILD] });

    // Forward-shift promotes CHILD to topId. No new fetch for CHILD itself —
    // refreshEntry already wrote its full { self, children } cache entry.
    graphqlRequest.mockResolvedValueOnce({ familyMember: { children: [] } });
    await act(async () => {
      await result.current.onExpandGrandchild(UPDATED_GRANDCHILD);
    });

    expect(graphqlRequest).toHaveBeenCalledTimes(4); // only the grandchild's own children fetch
    expect(result.current.topPerson.fullname).toBe('Child Person Updated');
    expect(result.current.gen1).toEqual([UPDATED_GRANDCHILD]);
  });

  it('(Revision — the head/topId case) refreshEntry(MAIN_PERSON.id), the id CURRENTLY at state.topId, with no forward-shift or descendant expansion, makes nav.topPerson.fullname reflect the new value WITHOUT ever re-rendering the hook with a new mainPerson argument', async () => {
    const { result } = renderHook(() => useDescendantNav(MAIN_PERSON));
    expect(result.current.topPerson).toEqual(MAIN_PERSON);

    const UPDATED_MAIN = { ...MAIN_PERSON, fullname: 'Main Person Updated' };
    delete UPDATED_MAIN.children;
    graphqlRequest.mockResolvedValueOnce({ familyMember: { ...UPDATED_MAIN, children: [CHILD] } });

    let refreshResult;
    await act(async () => {
      refreshResult = await result.current.refreshEntry(MAIN_PERSON.id);
    });

    expect(graphqlRequest).toHaveBeenCalledTimes(1);
    const [refreshQuery, refreshVars] = graphqlRequest.mock.calls[0];
    expect(refreshQuery).toMatch(/familyMember/i);
    expect(refreshQuery).toMatch(/children/i);
    expect(refreshVars).toEqual({ id: MAIN_PERSON.id });

    expect(result.current.topPerson.fullname).toBe('Main Person Updated');
    expect(result.current.gen1).toEqual([CHILD]);
    expect(refreshResult).toEqual({ ...UPDATED_MAIN, children: [CHILD] });
  });

  it('resolves null and makes NO cache write when the mocked response familyMember field is null (a later expand of the same id still fetches — proof nothing was cached)', async () => {
    const { result } = renderHook(() => useDescendantNav(MAIN_PERSON));
    graphqlRequest.mockResolvedValueOnce({ familyMember: null });

    let refreshResult;
    await act(async () => {
      refreshResult = await result.current.refreshEntry(MAIN_PERSON.id);
    });

    expect(refreshResult).toBeNull();
    expect(result.current.topPerson).toBe(MAIN_PERSON);

    graphqlRequest.mockResolvedValueOnce({ familyMember: { children: [CHILD] } });
    await act(async () => {
      await result.current.onExpandTop(MAIN_PERSON);
    });

    // A cache write from refreshEntry's null response would have marked
    // `children` as populated (cache hit) and skipped this second fetch.
    expect(graphqlRequest).toHaveBeenCalledTimes(2);
    expect(result.current.gen1).toEqual([CHILD]);
  });

  it('sets loadingId to the refreshed id while the promise is pending, then clears it back to null after resolve', async () => {
    let resolveFetch;
    graphqlRequest.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );
    const { result } = renderHook(() => useDescendantNav(MAIN_PERSON));

    expect(result.current.loadingId).toBeNull();

    act(() => {
      result.current.refreshEntry(MAIN_PERSON.id);
    });

    await waitFor(() => expect(result.current.loadingId).toBe(MAIN_PERSON.id));

    await act(async () => {
      resolveFetch({ familyMember: { ...MAIN_PERSON, children: [] } });
    });

    await waitFor(() => expect(result.current.loadingId).toBeNull());
  });

  it('for an id NOT previously in cache still performs the fetch and populates the cache from scratch (no crash on a cache-miss target)', async () => {
    const { result } = renderHook(() => useDescendantNav(MAIN_PERSON));

    const UNCACHED_PERSON = {
      id: '55',
      fullname: 'Fresh Person',
      geezFullname: null,
      gender: 'Male',
      isAlive: true,
      photoUrl: null,
      canEdit: false,
      spouses: []
    };
    graphqlRequest.mockResolvedValueOnce({ familyMember: { ...UNCACHED_PERSON, children: [CHILD] } });

    let refreshResult;
    await act(async () => {
      refreshResult = await result.current.refreshEntry('55');
    });

    expect(graphqlRequest).toHaveBeenCalledTimes(1);
    expect(refreshResult).toEqual({ ...UNCACHED_PERSON, children: [CHILD] });
    expect(result.current.loadingId).toBeNull();
  });
});
