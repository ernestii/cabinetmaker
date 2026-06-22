import { beforeEach, describe, expect, it } from 'vitest';
import { createResilientStorage, getStorageStatus } from '../persistStorage';

/** Minimal in-memory Storage with an optional "disk full" switch for setItem. */
class MockStorage implements Storage {
  private map = new Map<string, string>();
  full = false;

  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    if (this.full) {
      const e = new DOMException('full', 'QuotaExceededError');
      throw e;
    }
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

const KEY = 'cabinetmaker-project';

describe('resilient storage', () => {
  let mock: MockStorage;

  beforeEach(() => {
    mock = new MockStorage();
  });

  it('mirrors every write to a backup key', () => {
    const s = createResilientStorage(mock);
    s.setItem(KEY, '{"a":1}');
    expect(mock.getItem(KEY)).toBe('{"a":1}');
    expect(mock.getItem(KEY + ':backup')).toBe('{"a":1}');
    expect(getStorageStatus()).toBe('ok');
  });

  it('falls back to the backup when the primary entry is corrupt', () => {
    const s = createResilientStorage(mock);
    s.setItem(KEY, '{"good":true}'); // writes primary + backup
    mock.setItem(KEY, '{ broken json'); // corrupt the primary only
    expect(s.getItem(KEY)).toBe('{"good":true}');
  });

  it('falls back to the backup when the primary entry is missing', () => {
    const s = createResilientStorage(mock);
    s.setItem(KEY, '{"good":true}');
    mock.removeItem(KEY);
    expect(s.getItem(KEY)).toBe('{"good":true}');
  });

  it('returns null when neither primary nor backup is usable', () => {
    const s = createResilientStorage(mock);
    expect(s.getItem(KEY)).toBeNull();
  });

  it('does not throw on a quota error and flags status as "quota"', () => {
    const s = createResilientStorage(mock);
    mock.full = true;
    expect(() => s.setItem(KEY, '{"a":1}')).not.toThrow();
    expect(getStorageStatus()).toBe('quota');
  });
});
