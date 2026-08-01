import { describe, it, expect } from 'vitest';
import theme from './theme.js';

describe('theme font stack', () => {
  it('includes Abyssinica SIL in FONT_SANS after the Latin font and before OS fallbacks', () => {
    const stack = theme.typography.fontFamily;
    const inter = stack.indexOf('Inter');
    const ethiopic = stack.indexOf('Abyssinica SIL');
    const systemUi = stack.indexOf('system-ui');

    expect(ethiopic).toBeGreaterThan(-1);
    expect(ethiopic).toBeGreaterThan(inter);
    expect(ethiopic).toBeLessThan(systemUi);
  });

  it('includes Abyssinica SIL in FONT_DISPLAY (h1) after Sora and before Inter/system-ui', () => {
    const stack = theme.typography.h1.fontFamily;
    const sora = stack.indexOf('Sora');
    const ethiopic = stack.indexOf('Abyssinica SIL');
    const systemUi = stack.indexOf('system-ui');

    expect(ethiopic).toBeGreaterThan(-1);
    expect(ethiopic).toBeGreaterThan(sora);
    expect(ethiopic).toBeLessThan(systemUi);
  });
});
