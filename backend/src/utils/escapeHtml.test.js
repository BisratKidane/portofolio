import { describe, it, expect } from 'vitest';
import { escapeHtml } from './escapeHtml.js';

describe('escapeHtml', () => {
  it('escapes < and > (source assertion on exact output)', () => {
    expect(escapeHtml('<b>')).toBe('&lt;b&gt;');
  });

  it('escapes a full script tag payload', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes ampersands', () => {
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
  });

  it('escapes double and single quotes', () => {
    expect(escapeHtml('"quoted" \'value\'')).toBe('&quot;quoted&quot; &#39;value&#39;');
  });

  it('is naive/single-pass, not idempotent-aware — already-escaped entities get their own & escaped again', () => {
    expect(escapeHtml('&lt;already&gt;')).toBe('&amp;lt;already&amp;gt;');
  });

  it('coerces null and undefined to an empty string', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('coerces non-string input instead of throwing', () => {
    expect(escapeHtml(42)).toBe('42');
  });
});
