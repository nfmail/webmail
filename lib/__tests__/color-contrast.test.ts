import { describe, it, expect } from 'vitest';
import {
  pickForeground,
  contrastRatio,
  FOREGROUND_LIGHT,
  FOREGROUND_DARK,
} from '../color-contrast';

describe('contrastRatio', () => {
  it('is 21 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });

  it('is 1 for identical colors', () => {
    expect(contrastRatio('#3b82f6', '#3b82f6')).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#0d9488', '#ffffff')).toBeCloseTo(
      contrastRatio('#ffffff', '#0d9488'),
      5,
    );
  });

  it('parses rgb() and hsl() inputs', () => {
    expect(contrastRatio('rgb(13,148,136)', '#ffffff')).toBeCloseTo(
      contrastRatio('#0d9488', '#ffffff'),
      1,
    );
    // hsl(0,100%,50%) === pure red
    expect(contrastRatio('hsl(0, 100%, 50%)', '#000000')).toBeCloseTo(
      contrastRatio('#ff0000', '#000000'),
      1,
    );
  });
});

describe('pickForeground', () => {
  it('picks white on dark saturated backgrounds', () => {
    expect(pickForeground('#1d4ed8')).toBe(FOREGROUND_LIGHT); // blue-700
    expect(pickForeground('#7e22ce')).toBe(FOREGROUND_LIGHT); // purple-700
    expect(pickForeground('#000000')).toBe(FOREGROUND_LIGHT);
  });

  it('picks near-black on light backgrounds', () => {
    expect(pickForeground('#fde047')).toBe(FOREGROUND_DARK); // yellow-300
    expect(pickForeground('#a7f3d0')).toBe(FOREGROUND_DARK); // emerald-200
    expect(pickForeground('#ffffff')).toBe(FOREGROUND_DARK);
  });

  it('always yields an AA-passing (>=4.5) foreground for its background', () => {
    for (const bg of ['#0d9488', '#65a30d', '#ea580c', '#3b82f6', '#facc15', '#111827']) {
      const fg = pickForeground(bg);
      expect(contrastRatio(bg, fg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('is deterministic', () => {
    expect(pickForeground('#0891b2')).toBe(pickForeground('#0891b2'));
  });

  it('falls back to near-black for unparseable input', () => {
    expect(pickForeground('not-a-color')).toBe(FOREGROUND_DARK);
  });
});
