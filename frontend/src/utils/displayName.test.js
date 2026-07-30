import { describe, it, expect } from 'vitest';
import { getGeezDisplay, GEEZ_LANG } from './displayName.js';

describe('getGeezDisplay', () => {
  it('returns null when geezFullname is null (none case)', () => {
    expect(getGeezDisplay({ geezFullname: null })).toBeNull();
  });

  it('returns null when geezFullname is undefined (field omitted from selection)', () => {
    expect(getGeezDisplay({})).toBeNull();
  });

  it('returns null when geezFullname is an empty string (defensive, not just null-check)', () => {
    const result = getGeezDisplay({ geezFullname: '' });
    expect(result).toBeNull();
    expect(result).not.toBe('');
  });

  it('returns null when geezFullname is whitespace-only', () => {
    expect(getGeezDisplay({ geezFullname: '   ' })).toBeNull();
  });

  it("returns { text, lang } when a single Ge'ez part is present (partial case)", () => {
    const result = getGeezDisplay({ geezFullname: 'ጃነ' });
    expect(result).toEqual({ text: 'ጃነ', lang: 'ti' });
  });

  it("returns { text, lang } when both Ge'ez parts are present (all-filled case)", () => {
    const result = getGeezDisplay({ geezFullname: 'ጃነ ዶ' });
    expect(result).toEqual({ text: 'ጃነ ዶ', lang: 'ti' });
  });

  it('always tags the lang as the exported GEEZ_LANG constant, not a hard-coded literal', () => {
    const result = getGeezDisplay({ geezFullname: 'ጃነ ዶ' });
    expect(result.lang).toBe(GEEZ_LANG);
  });
});
