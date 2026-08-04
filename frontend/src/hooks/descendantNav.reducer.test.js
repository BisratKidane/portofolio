import { describe, it, expect } from 'vitest';
import { navReducer, initial } from './descendantNav.reducer.js';

describe('initial', () => {
  it('returns the base frame for a given topId', () => {
    expect(initial('1')).toEqual({
      topId: '1',
      topExpanded: false,
      expandedChildId: null,
      history: []
    });
  });
});

describe('navReducer', () => {
  it('RESET returns initial(newId) regardless of prior state', () => {
    const priorState = {
      topId: '1',
      topExpanded: true,
      expandedChildId: '2',
      history: [{ topId: '0', topExpanded: true, expandedChildId: '1', history: [] }]
    };

    const result = navReducer(priorState, { type: 'RESET', id: '99' });

    expect(result).toEqual(initial('99'));
  });

  it('EXPAND_TOP from a collapsed state sets topExpanded true, leaves everything else unchanged', () => {
    const state = initial('1');

    const result = navReducer(state, { type: 'EXPAND_TOP' });

    expect(result).toEqual({
      topId: '1',
      topExpanded: true,
      expandedChildId: null,
      history: []
    });
  });

  it('EXPAND_TOP from an expanded state with EMPTY history performs an ordinary collapse', () => {
    const state = {
      topId: '1',
      topExpanded: true,
      expandedChildId: '2',
      history: []
    };

    const result = navReducer(state, { type: 'EXPAND_TOP' });

    expect(result).toEqual({
      topId: '1',
      topExpanded: false,
      expandedChildId: null,
      history: []
    });
  });

  it('EXPAND_CHILD with a new id when expandedChildId is null sets it', () => {
    const state = { topId: '1', topExpanded: true, expandedChildId: null, history: [] };

    const result = navReducer(state, { type: 'EXPAND_CHILD', id: '2' });

    expect(result).toEqual({
      topId: '1',
      topExpanded: true,
      expandedChildId: '2',
      history: []
    });
  });

  it('EXPAND_CHILD with a DIFFERENT id replaces expandedChildId with the new id only (D-01)', () => {
    const state = { topId: '1', topExpanded: true, expandedChildId: '2', history: [] };

    const result = navReducer(state, { type: 'EXPAND_CHILD', id: '3' });

    // Structural proof: the result contains exactly the new id, not both —
    // an accumulated list would fail this exact-object assertion.
    expect(result).toEqual({
      topId: '1',
      topExpanded: true,
      expandedChildId: '3',
      history: []
    });
  });

  it('EXPAND_CHILD with the SAME id as current expandedChildId collapses it back to null (re-click toggle)', () => {
    const state = { topId: '1', topExpanded: true, expandedChildId: '2', history: [] };

    const result = navReducer(state, { type: 'EXPAND_CHILD', id: '2' });

    expect(result).toEqual({
      topId: '1',
      topExpanded: true,
      expandedChildId: null,
      history: []
    });
  });

  it('EXPAND_GRANDCHILD pushes the ENTIRE pre-action state object onto history and forward-shifts (D-03/NAV-04)', () => {
    const preShiftState = { topId: '1', topExpanded: true, expandedChildId: '2', history: [] };

    const result = navReducer(preShiftState, { type: 'EXPAND_GRANDCHILD', id: '3' });

    expect(result).toEqual({
      topId: '2',
      topExpanded: true,
      expandedChildId: '3',
      history: [preShiftState]
    });
  });

  it('symmetric undo (D-04): EXPAND_TOP on a shifted frame restores the EXACT pre-shift frame', () => {
    const preShiftState = navReducer(
      navReducer(initial('1'), { type: 'EXPAND_TOP' }),
      { type: 'EXPAND_CHILD', id: '2' }
    );
    const shiftedState = navReducer(preShiftState, { type: 'EXPAND_GRANDCHILD', id: '3' });

    const undoneState = navReducer(shiftedState, { type: 'EXPAND_TOP' });

    expect(undoneState).toEqual(preShiftState);
  });

  it('NAV-03 structural invariant: two consecutive shifts never introduce a new field and grow history by exactly 1 each', () => {
    const frame0 = navReducer(
      navReducer(initial('1'), { type: 'EXPAND_TOP' }),
      { type: 'EXPAND_CHILD', id: '2' }
    );
    const frame1 = navReducer(frame0, { type: 'EXPAND_GRANDCHILD', id: '3' });

    expect(Object.keys(frame1).sort()).toEqual(
      ['expandedChildId', 'history', 'topExpanded', 'topId'].sort()
    );
    expect(frame1.history.length).toBe(1);

    // Simulate drilling down again: expand a child of the new top, then
    // shift into a grandchild-of-that-child.
    const frame1WithChildExpanded = navReducer(frame1, { type: 'EXPAND_CHILD', id: '4' });
    const frame2 = navReducer(frame1WithChildExpanded, { type: 'EXPAND_GRANDCHILD', id: '5' });

    expect(Object.keys(frame2).sort()).toEqual(
      ['expandedChildId', 'history', 'topExpanded', 'topId'].sort()
    );
    expect(frame2.history.length).toBe(2);
  });

  it('an unknown action type returns the exact same state reference unchanged (default no-op)', () => {
    const state = { topId: '1', topExpanded: true, expandedChildId: '2', history: [] };

    const result = navReducer(state, { type: 'NOT_A_REAL_ACTION' });

    expect(result).toBe(state);
  });
});
