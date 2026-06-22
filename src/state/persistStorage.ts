import type { StateStorage } from 'zustand/middleware';

/** Autosave health, surfaced to the UI so the user can react to a full/broken store. */
export type StorageStatus = 'ok' | 'quota' | 'error';

type Listener = (status: StorageStatus) => void;
const listeners = new Set<Listener>();
let current: StorageStatus = 'ok';

export function getStorageStatus(): StorageStatus {
  return current;
}

/** Subscribe to autosave status changes; returns an unsubscribe fn. */
export function onStorageStatus(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function setStatus(s: StorageStatus) {
  if (s === current) return;
  current = s;
  for (const l of listeners) l(s);
}

const BACKUP_SUFFIX = ':backup';

function isQuotaError(e: unknown): boolean {
  return (
    e instanceof DOMException &&
    (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22)
  );
}

function safeGet(store: Storage, key: string): string | null {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

function isValidJSON(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * A localStorage-backed StateStorage for zustand persist that hardens autosave:
 *  - reads fall back to a `:backup` key when the primary entry is missing or corrupt,
 *  - every successful write is mirrored to the backup (rolling last-known-good),
 *  - a full quota or other write failure never throws; it flips a status flag the
 *    UI watches (so the user can be nudged to export) instead of crashing autosave.
 *
 * `backing` is injectable for tests; in the browser it defaults to localStorage.
 */
export function createResilientStorage(backing?: Storage): StateStorage {
  const store = backing ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
  return {
    getItem: (name) => {
      if (!store) return null;
      const primary = safeGet(store, name);
      if (primary != null && isValidJSON(primary)) return primary;
      // Primary missing or corrupt — recover from the last-known-good backup.
      const backup = safeGet(store, name + BACKUP_SUFFIX);
      return backup != null && isValidJSON(backup) ? backup : null;
    },
    setItem: (name, value) => {
      if (!store) return;
      try {
        store.setItem(name, value);
        // Mirror a known-good copy; a backup-only failure must not break the primary save.
        try {
          store.setItem(name + BACKUP_SUFFIX, value);
        } catch {
          /* backup is best-effort */
        }
        setStatus('ok');
      } catch (e) {
        // Out of space or storage disabled: keep the app running, flag the UI.
        setStatus(isQuotaError(e) ? 'quota' : 'error');
      }
    },
    removeItem: (name) => {
      if (!store) return;
      try {
        store.removeItem(name);
        store.removeItem(name + BACKUP_SUFFIX);
      } catch {
        /* ignore */
      }
    },
  };
}
