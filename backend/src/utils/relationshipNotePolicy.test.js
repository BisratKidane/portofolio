import { describe, it, expect } from 'vitest';
import { assertRelationshipNoteLength } from './relationshipNotePolicy.js';

describe('assertRelationshipNoteLength', () => {
  it('does not throw for exactly 499 characters', () => {
    expect(() => assertRelationshipNoteLength('x'.repeat(499))).not.toThrow();
  });

  it('does not throw for exactly 500 characters (boundary)', () => {
    expect(() => assertRelationshipNoteLength('x'.repeat(500))).not.toThrow();
  });

  it('throws for exactly 501 characters', () => {
    expect(() => assertRelationshipNoteLength('x'.repeat(501))).toThrow(
      'Relationship note must be 500 characters or fewer.'
    );
  });

  it('does not throw for null (optional field, note && short-circuit)', () => {
    expect(() => assertRelationshipNoteLength(null)).not.toThrow();
  });

  it('does not throw for undefined (optional field, note && short-circuit)', () => {
    expect(() => assertRelationshipNoteLength(undefined)).not.toThrow();
  });

  it('does not throw for an empty string (optional field, note && short-circuit)', () => {
    expect(() => assertRelationshipNoteLength('')).not.toThrow();
  });

  // WR-08 (documented, out of this gap closure's scope): `.length` counts
  // UTF-16 code units, not characters. A 4-byte astral character (like an
  // emoji) is a surrogate pair -- 2 code units each -- so 501 emoji is 1002
  // code units and gets rejected even though the column would hold them.
  // This is the CURRENT, intentional (safe-direction, over-rejecting)
  // behavior -- pinned here explicitly rather than left unpinned.
  it('throws for 501 astral (4-byte) characters -- over-rejects under the current UTF-16-length implementation (WR-08, documented)', () => {
    const astralNote = '😀'.repeat(501);
    expect(astralNote.length).toBe(1002); // sanity: surrogate pairs, not 501
    expect(() => assertRelationshipNoteLength(astralNote)).toThrow(
      'Relationship note must be 500 characters or fewer.'
    );
  });
});
