import { readLocalStorage, writeLocalStorage } from './browserStorage';

export const DOC_FAVORITES_STORAGE_KEY = 'wiki:doc-favorites';
export const DOC_BADGE_MODE_STORAGE_KEY = 'wiki:doc-badge-mode';
export const DOC_BADGE_MODE_EVENT = 'wiki-doc-badge-mode-change';
export const DOC_FAVORITES_EVENT = 'wiki-doc-favorites-change';

export type DocBadgeMode = 'quick' | 'favorites';

export type StoredDocFavorite = {
  id: number;
  title: string;
  href: string;
  emoji: string;
  icon?: string | null;
  addedAt: number;
  updatedAt?: string | null;
};

export function isDocBadgeMode(value: unknown): value is DocBadgeMode {
  return value === 'quick' || value === 'favorites';
}

export function readDocBadgeMode(): DocBadgeMode {
  if (typeof window === 'undefined') return 'quick';
  const raw = readLocalStorage(DOC_BADGE_MODE_STORAGE_KEY);
  return isDocBadgeMode(raw) ? raw : 'quick';
}

export function writeDocBadgeMode(mode: DocBadgeMode) {
  if (typeof window === 'undefined') return;
  writeLocalStorage(DOC_BADGE_MODE_STORAGE_KEY, mode);
  window.dispatchEvent(
    new CustomEvent(DOC_BADGE_MODE_EVENT, {
      detail: { mode },
    }),
  );
}

export function sanitizeDocFavorites(input: unknown): StoredDocFavorite[] {
  if (!Array.isArray(input)) return [];

  const dedup = new Map<number, StoredDocFavorite>();

  for (const row of input) {
    if (!row || typeof row !== 'object') continue;

    const id = Number((row as any).id);
    const title = String((row as any).title ?? '').trim();
    const href = String((row as any).href ?? '').trim();
    const emoji = String((row as any).emoji ?? '⭐').trim() || '⭐';
    const addedAtRaw = Number((row as any).addedAt);
    const updatedAt = (row as any).updatedAt == null ? null : String((row as any).updatedAt);
    const icon = (row as any).icon == null ? null : String((row as any).icon);

    if (!Number.isFinite(id) || id <= 0) continue;
    if (!title || !href) continue;

    dedup.set(id, {
      id,
      title,
      href,
      emoji,
      addedAt: Number.isFinite(addedAtRaw) ? addedAtRaw : Date.now(),
      icon,
      updatedAt,
    });
  }

  return [...dedup.values()].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
}

export function readDocFavorites(): StoredDocFavorite[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = readLocalStorage(DOC_FAVORITES_STORAGE_KEY);
    if (!raw) return [];
    return sanitizeDocFavorites(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function writeDocFavorites(items: StoredDocFavorite[]) {
  if (typeof window === 'undefined') return;
  const safe = sanitizeDocFavorites(items);
  writeLocalStorage(DOC_FAVORITES_STORAGE_KEY, JSON.stringify(safe));
  window.dispatchEvent(
    new CustomEvent(DOC_FAVORITES_EVENT, {
      detail: { items: safe },
    }),
  );
}

export function upsertDocFavorite(
  items: StoredDocFavorite[],
  nextItem: Omit<StoredDocFavorite, 'addedAt'> & { addedAt?: number },
): StoredDocFavorite[] {
  const safe = sanitizeDocFavorites(items);
  const mapped = new Map<number, StoredDocFavorite>(safe.map((item) => [item.id, item]));
  const prev = mapped.get(nextItem.id);

  mapped.set(nextItem.id, {
    id: nextItem.id,
    title: String(nextItem.title ?? '').trim(),
    href: String(nextItem.href ?? '').trim(),
    emoji: String(nextItem.emoji ?? '⭐').trim() || '⭐',
    addedAt: prev?.addedAt ?? nextItem.addedAt ?? Date.now(),
    icon: nextItem.icon ?? prev?.icon ?? null,
    updatedAt: nextItem.updatedAt ?? prev?.updatedAt ?? null,
  });

  return sanitizeDocFavorites([...mapped.values()]);
}

export function removeDocFavorite(items: StoredDocFavorite[], id: number): StoredDocFavorite[] {
  return sanitizeDocFavorites(items).filter((item) => item.id !== id);
}

export function hasDocFavorite(items: StoredDocFavorite[], id: number): boolean {
  return sanitizeDocFavorites(items).some((item) => item.id === id);
}
