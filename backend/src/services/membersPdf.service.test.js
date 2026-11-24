import { describe, it, expect } from 'vitest';
import { buildMembersPdf, genderStyle } from './membersPdf.service.js';

const member = (overrides = {}) => ({
  firstname: 'Ada',
  lastname: 'Lovelace',
  mothersname: 'Anne',
  geezFirstname: 'ሰላም',
  geezLastname: 'ተስፋዬ',
  geezMothersname: 'አበባ',
  gender: 'Female',
  ...overrides
});

describe('genderStyle', () => {
  it('returns a text label and a distinct color per gender', () => {
    expect(genderStyle('Male')).toEqual({ label: 'Male', color: '#1d4ed8' });
    expect(genderStyle('Female')).toEqual({ label: 'Female', color: '#be185d' });
    expect(genderStyle('Other')).toEqual({ label: 'Other', color: '#4b5563' });
  });

  it('falls back to Other for unknown values', () => {
    expect(genderStyle(null).label).toBe('Other');
  });
});

describe('buildMembersPdf', () => {
  it('returns a PDF buffer that embeds the Abyssinica font', async () => {
    const buf = await buildMembersPdf([member()]);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buf.toString('latin1')).toContain('Abyssinica');
  });

  it("does not throw for null Ge'ez / mother fields or an empty list", async () => {
    const sparse = member({
      mothersname: null,
      geezFirstname: null,
      geezLastname: null,
      geezMothersname: null,
      gender: 'Other'
    });
    expect((await buildMembersPdf([sparse])).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect((await buildMembersPdf([])).subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('paginates a long list without throwing', async () => {
    const many = Array.from({ length: 120 }, (_, i) => member({ firstname: `N${i}` }));
    expect((await buildMembersPdf(many)).length).toBeGreaterThan(1000);
  });
});
