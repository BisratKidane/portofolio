import { describe, it, expect } from 'vitest';
import { orderDepthFirst } from './memberOrder.service.js';

const m = (id, fatherId = null, motherId = null, birthdate = null) => ({ id, fatherId, motherId, birthdate });
const ids = (list) => list.map((x) => Number(x.id));

describe('orderDepthFirst', () => {
  it('returns [] for an empty list', () => {
    expect(orderDepthFirst([], [])).toEqual([]);
  });

  it('walks a single chain root to leaf', () => {
    const list = [m(3, 2), m(1), m(2, 1)];
    expect(ids(orderDepthFirst(list, []))).toEqual([1, 2, 3]);
  });

  it('does not mutate the input and returns the same member objects', () => {
    const list = [m(2, 1), m(1)];
    const copy = [...list];
    const out = orderDepthFirst(list, []);
    expect(list).toEqual(copy);
    expect(list[0]).toBe(copy[0]);
    expect(out).toContain(list[0]);
  });

  it('orders siblings by birthdate asc, ties by id, unknown last', () => {
    const list = [
      m(1),
      m(2, 1, null, '2000-01-01'),
      m(3, 1, null, null),
      m(4, 1, null, '1990-05-05'),
      m(6, 1, null, '1995-01-01'),
      m(5, 1, null, '1995-01-01')
    ];
    expect(ids(orderDepthFirst(list, []))).toEqual([1, 4, 5, 6, 2, 3]);
  });

  it('completes each child subtree before the next sibling', () => {
    const list = [m(1), m(2, 1, null, '1990-01-01'), m(3, 1, null, '1991-01-01'), m(4, 2), m(5, 3)];
    expect(ids(orderDepthFirst(list, []))).toEqual([1, 2, 4, 3, 5]);
  });

  it('places a married-in spouse after the member and before the children', () => {
    const list = [m(1), m(2), m(3, 1, 2)];
    expect(ids(orderDepthFirst(list, [{ memberAId: 1, memberBId: 2 }]))).toEqual([1, 2, 3]);
    const list2 = [m(1), m(3, 1, 2), m(9, 1, null, '1980-01-01'), m(2)];
    expect(ids(orderDepthFirst(list2, [{ memberAId: 2, memberBId: 1 }]))).toEqual([1, 2, 9, 3]);
  });

  it('does not pull in a spouse who has a parent in the set', () => {
    const list = [m(1), m(5), m(6, 5), m(2, 1)];
    // 6 is married to 1 but is the child of 5, so stays under 5
    expect(ids(orderDepthFirst(list, [{ memberAId: 1, memberBId: 6 }]))).toEqual([1, 2, 5, 6]);
  });

  it('lists a child with two parents present exactly once, under the first reached', () => {
    const list = [m(1), m(2), m(3, 1, 2)];
    const out = ids(orderDepthFirst(list, []));
    expect(out).toEqual([1, 3, 2]);
    expect(out.filter((x) => x === 3)).toHaveLength(1);
  });

  it('visits multiple roots in ascending id order, subtrees complete', () => {
    const list = [m(10), m(4, 10), m(2), m(7, 2)];
    expect(ids(orderDepthFirst(list, []))).toEqual([2, 7, 10, 4]);
  });

  it('terminates on a cycle and lists every id once', () => {
    const list = [m(1, 2), m(2, 1), m(3)];
    const out = ids(orderDepthFirst(list, []));
    expect(out.sort()).toEqual([1, 2, 3]);
  });

  it('handles numeric-string ids and Date / string birthdates', () => {
    const list = [
      m('1'),
      m('2', '1', null, new Date('2001-01-01T00:00:00Z')),
      m('3', '1', null, '1999-12-31')
    ];
    expect(ids(orderDepthFirst(list, [{ memberAId: '1', memberBId: '9' }]))).toEqual([1, 3, 2]);
  });

  it('survives a very deep chain without overflowing the stack', () => {
    const list = [m(1)];
    for (let i = 2; i <= 20000; i += 1) list.push(m(i, i - 1));
    expect(orderDepthFirst(list, [])).toHaveLength(20000);
  });
});
