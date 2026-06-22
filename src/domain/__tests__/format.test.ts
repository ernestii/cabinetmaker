import { describe, expect, it } from 'vitest';
import { feetInches, money, parseInches, toFraction } from '../format';

describe('format: money', () => {
  it('formats with two decimals and a leading $', () => {
    expect(money(0)).toBe('$0.00');
    expect(money(12.5)).toBe('$12.50');
    expect(money(1234.567)).toBe('$1234.57');
  });
});

describe('format: feetInches', () => {
  it('shows bare inches under a foot', () => {
    expect(feetInches(8)).toBe('8"');
    expect(feetInches(0)).toBe('0"');
  });

  it('splits into feet and rounded inches at/above a foot', () => {
    expect(feetInches(12)).toBe("1' 0\"");
    expect(feetInches(30)).toBe("2' 6\"");
    expect(feetInches(30.4)).toBe("2' 6\"");
  });
});

describe('format: fraction round-trip (sanity)', () => {
  it('parses what toFraction prints', () => {
    expect(parseInches(toFraction(23.25))).toBeCloseTo(23.25);
  });
});

describe('format: parseInches (units + arithmetic)', () => {
  it('still parses plain inches and fractions', () => {
    expect(parseInches('30')).toBe(30);
    expect(parseInches('23.25')).toBeCloseTo(23.25);
    expect(parseInches('23 1/4')).toBeCloseTo(23.25);
    expect(parseInches('1/2')).toBeCloseTo(0.5);
    expect(parseInches('24"')).toBe(24);
    expect(parseInches('')).toBeNull();
    expect(parseInches('abc')).toBeNull();
    expect(parseInches('1/0')).toBeNull();
    expect(parseInches('1 1/0')).toBeNull();
  });

  it('parses feet and feet-inches', () => {
    expect(parseInches('6ft')).toBe(72);
    expect(parseInches('6.5ft')).toBeCloseTo(78);
    expect(parseInches("6'")).toBe(72);
    expect(parseInches("6'3\"")).toBeCloseTo(75);
    expect(parseInches("6' 3 1/2\"")).toBeCloseTo(75.5);
  });

  it('parses metric', () => {
    expect(parseInches('254mm')).toBeCloseTo(10);
    expect(parseInches('30cm')).toBeCloseTo(11.811, 2);
    expect(parseInches('1m')).toBeCloseTo(39.3701, 3);
  });

  it('evaluates arithmetic, including across units', () => {
    expect(parseInches('24+12')).toBe(36);
    expect(parseInches('(48-1)/2')).toBeCloseTo(23.5);
    expect(parseInches('2*15')).toBe(30);
    expect(parseInches("6' - 2")).toBeCloseTo(70);
    expect(parseInches('24++')).toBeNull();
  });
});
