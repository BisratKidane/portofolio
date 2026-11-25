import { describe, it, expect } from 'vitest';
import { buildMembersPdf, genderStyle, memberRowCells, fitFontSize, normalizeText, fontRuns } from './membersPdf.service.js';

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

describe('memberRowCells', () => {
  it('returns trimmed strings and the raw id', () => {
    const cells = memberRowCells(member({ id: 7, email: ' a@b.co ', phone: '+41 79 000' }));
    expect(cells).toEqual({
      id: '7',
      name: 'Ada Lovelace',
      geezName: 'ሰላም ተስፋዬ',
      mother: 'Anne',
      geezMother: 'አበባ',
      email: 'a@b.co',
      phone: '+41 79 000'
    });
  });

  it('leaves every empty value blank with no placeholder', () => {
    const sparse = {
      id: null,
      firstname: '  ',
      lastname: '',
      mothersname: undefined,
      geezFirstname: null,
      geezLastname: ' ',
      geezMothersname: '   ',
      email: '',
      phone: null
    };
    const cells = memberRowCells(sparse);
    for (const v of Object.values(cells)) expect(v).toBe('');
    expect(Object.keys(cells).sort()).toEqual(['email', 'geezMother', 'geezName', 'id', 'mother', 'name', 'phone']);
  });

  it('has no trailing space for a lone first name and works with get()', () => {
    expect(memberRowCells({ firstname: 'Ada' }).name).toBe('Ada');
    const row = { get: (k) => ({ id: 3, firstname: 'Bo', email: 'b@x.io' })[k] };
    expect(memberRowCells(row)).toMatchObject({ id: '3', name: 'Bo', email: 'b@x.io', phone: '' });
  });
});

describe('fitFontSize', () => {
  const measure = (t, s) => t.length * s * 0.5;
  it('keeps the start size when the text fits', () => {
    expect(fitFontSize(measure, 'abcd', 100)).toBe(10);
  });
  it('shrinks in 0.5 steps to the largest size that fits', () => {
    expect(fitFontSize(measure, 'a'.repeat(30), 100)).toBe(6.5);
  });
  it('returns the floor when nothing fits', () => {
    expect(fitFontSize(measure, 'a'.repeat(500), 100)).toBe(6);
  });
});

describe('buildMembersPdf contact column', () => {
  it('builds for long, phone-only, email-only and sparse members', async () => {
    const list = [
      member({ id: 1, email: `${'x'.repeat(70)}@example.com`, phone: '+41 79 123 45 67' }),
      member({ id: 2, email: null, phone: '+41 79 123 45 67' }),
      member({ id: 3, email: 'a@b.co', phone: '' }),
      { id: 99999999 }
    ];
    expect((await buildMembersPdf(list)).subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});

describe('normalizeText', () => {
  it('collapses tabs, newlines, NBSP, zero-width and control chars to one space', () => {
    expect(normalizeText('ኣብረሀት\t \n  ገረዝጊሄር')).toBe('ኣብረሀት ገረዝጊሄር');
    expect(normalizeText('a  b​c\u0000d\r\ne')).toBe('a b c d e');
    expect(normalizeText('\t\n  ')).toBe('');
    expect(normalizeText(null)).toBe('');
  });

  it('is applied to row cells so a row cannot carry newlines', () => {
    const cells = memberRowCells({ firstname: 'ኣብረሀት\t \n  ', lastname: ' ገረዝጊሄር' });
    expect(cells.name).toBe('ኣብረሀት ገረዝጊሄር');
    expect(memberRowCells({ firstname: '\n\t', email: '   ' })).toMatchObject({ name: '', email: '' });
  });
});

describe('fontRuns', () => {
  it('draws Ethiopic runs in the Ethiopic font and spaces/Latin in the Latin font', () => {
    expect(fontRuns('ኣብ ገረ x')).toEqual([
      { text: 'ኣብ', font: 'AbyssinicaEthiopic' },
      { text: ' ', font: 'AbyssinicaLatin' },
      { text: 'ገረ', font: 'AbyssinicaEthiopic' },
      { text: ' x', font: 'AbyssinicaLatin' }
    ]);
    expect(fontRuns('')).toEqual([]);
  });

  it('builds a PDF for a Ge\'ez Latin-field name with odd whitespace', async () => {
    const buf = await buildMembersPdf([member({ firstname: 'ኣብረሀት\t \n  ', lastname: ' ገረዝጊሄር' })]);
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
