// Test suite specifying useDescendantNav's cache/fetch/derive contract before
// implementation exists (TDD RED). Mirrors DetailPage.test.jsx's
// graphqlRequest mock idiom (lines 12-20) and mock-chaining pattern, but uses
// renderHook (not a full component mount) since this is a hook-level unit.
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

  describe('sequential expand / cache / shift flow', () => {
    let hook;

    it('mounts with zero fetches showing only the top person', () => {
      hook = renderHook(() => useDescendantNav(MAIN_PERSON));

      expect(graphqlRequest).not.toHaveBeenCalled();
      expect(hook.result.current.topPerson).toEqual(MAIN_PERSON);
      expect(hook.result.current.gen1).toEqual([]);
      expect(hook.result.current.topExpanded).toBe(false);
    });

    it('onExpandTop fires exactly one graphqlRequest for the top person and populates gen1 on resolve (PERF-01)', async () => {
      graphqlRequest.mockResolvedValueOnce({ familyMember: { children: [CHILD] } });

      await act(async () => {
        hook.result.current.onExpandTop(MAIN_PERSON);
      });

      expect(graphqlRequest).toHaveBeenCalledTimes(1);
      expect(graphqlRequest.mock.calls[0][0]).toMatch(/children/i);
      expect(graphqlRequest.mock.calls[0][1]).toEqual({ id: '1' });

      await waitFor(() => expect(hook.result.current.topExpanded).toBe(true));
      expect(hook.result.current.gen1).toEqual([CHILD]);
    });

    it('repeat collapse/re-expand of an already-cached id serves from cache with zero additional graphqlRequest calls (PERF-03/D-09)', async () => {
      await act(async () => {
        hook.result.current.onExpandTop(MAIN_PERSON); // collapse
      });
      expect(hook.result.current.topExpanded).toBe(false);

      await act(async () => {
        hook.result.current.onExpandTop(MAIN_PERSON); // re-expand
      });
      expect(hook.result.current.topExpanded).toBe(true);

      expect(graphqlRequest).toHaveBeenCalledTimes(1);
    });

    it('onExpandChild fetches exactly once more and populates gen2', async () => {
      graphqlRequest.mockResolvedValueOnce({ familyMember: { children: [GRANDCHILD] } });

      await act(async () => {
        hook.result.current.onExpandChild(CHILD);
      });

      expect(graphqlRequest).toHaveBeenCalledTimes(2);
      expect(graphqlRequest.mock.calls[1][1]).toEqual({ id: '2' });
      expect(hook.result.current.expandedChildId).toBe(CHILD.id);
      expect(hook.result.current.gen2).toEqual([GRANDCHILD]);
    });

    it('onExpandGrandchild shifts the view forward with exactly one new fetch, resolving the promoted parent from cache (D-03/D-09)', async () => {
      graphqlRequest.mockResolvedValueOnce({ familyMember: { children: [GREAT_GRANDCHILD] } });
      const previousGen2 = hook.result.current.gen2;

      await act(async () => {
        hook.result.current.onExpandGrandchild(GRANDCHILD);
      });

      // Exactly one new call — for the grandchild's own children. The
      // promoted parent's (CHILD's) children were already cached by the
      // earlier onExpandChild call above; no second fetch for them.
      expect(graphqlRequest).toHaveBeenCalledTimes(3);
      expect(graphqlRequest.mock.calls[2][1]).toEqual({ id: GRANDCHILD.id });

      expect(hook.result.current.topPerson).toEqual(CHILD);
      expect(hook.result.current.gen1).toBe(previousGen2);
      expect(hook.result.current.gen2).toEqual([GREAT_GRANDCHILD]);
    });
  });

  it('a RESET (search-driven mainPerson swap) clears only the view frame — re-expanding a previously cached id fires no new fetch (D-09)', async () => {
    graphqlRequest.mockResolvedValueOnce({ familyMember: { children: [CHILD] } });
    const { result, rerender } = renderHook(({ mainPerson }) => useDescendantNav(mainPerson), {
      initialProps: { mainPerson: MAIN_PERSON }
    });

    await act(async () => {
      result.current.onExpandTop(MAIN_PERSON);
    });
    expect(graphqlRequest).toHaveBeenCalledTimes(1);
    expect(result.current.gen1).toEqual([CHILD]);

    rerender({ mainPerson: OTHER_MAIN_PERSON });
    expect(result.current.topPerson).toEqual(OTHER_MAIN_PERSON);
    expect(result.current.topExpanded).toBe(false);

    const callCountAfterSwap = graphqlRequest.mock.calls.length;

    await act(async () => {
      result.current.onExpandTop(MAIN_PERSON);
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
