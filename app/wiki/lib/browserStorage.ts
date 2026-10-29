/**
 * Optional UI preferences must not prevent a page from rendering when browser
 * storage is full or disabled. Failed writes stay available until this page
 * is reloaded; persisted data, including editor drafts, is never evicted.
 */
const fallbackValues = new Map<string, string>();

export function getLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readLocalStorage(key: string): string | null {
  if (typeof window === 'undefined') return null;

  if (fallbackValues.has(key)) {
    return fallbackValues.get(key)!;
  }

  try {
    return getLocalStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeLocalStorage(key: string, value: string): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const storage = getLocalStorage();
    if (storage) {
      storage.setItem(key, value);
      fallbackValues.delete(key);
      return true;
    }
  } catch {
    // Keep the preference usable in this tab without deleting stored data.
  }

  fallbackValues.set(key, value);
  return false;
}
