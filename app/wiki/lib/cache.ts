// =============================================
// File: app/wiki/lib/cache.ts
// 전체 교체용 코드
//
// - Next.js Data Cache를 사용한 인스턴스 간 공유 캐시
// - 같은 인스턴스의 동시 요청 single-flight
// - 공유 캐시 재검증 실패 시 마지막 로컬 값 반환
// - invalidate(tag) 호출 시 로컬/공유 캐시 동시 무효화
// =============================================

import 'server-only';

import {
  revalidateTag,
  unstable_cache,
} from 'next/cache';

type Fn<T> = () => Promise<T> | T;

type CacheEntry = {
  value: unknown;
  expiresAt: number;
  tags: string[];
};

type CacheOptions = {
  ttlSec?: number;
  tags?: string[];
};

declare global {
  // eslint-disable-next-line no-var
  var __wiki_local_cache__:
    | Map<string, CacheEntry>
    | undefined;

  // eslint-disable-next-line no-var
  var __wiki_local_cache_pending__:
    | Map<string, Promise<unknown>>
    | undefined;
}

function getStore() {
  if (!global.__wiki_local_cache__) {
    global.__wiki_local_cache__ =
      new Map<string, CacheEntry>();
  }

  return global.__wiki_local_cache__;
}

function getPendingStore() {
  if (!global.__wiki_local_cache_pending__) {
    global.__wiki_local_cache_pending__ =
      new Map<string, Promise<unknown>>();
  }

  return global.__wiki_local_cache_pending__;
}

function normalizeTags(
  tags: string[] | undefined,
) {
  return Array.from(
    new Set(
      (tags ?? [])
        .map((tag) => String(tag).trim())
        .filter(Boolean),
    ),
  );
}

export function cacheKey(
  ...parts: Array<
    string | number | null | undefined
  >
) {
  return parts
    .filter(
      (value) =>
        value !== null &&
        value !== undefined,
    )
    .join(':');
}

/**
 * 기존 cached() 호출 형식을 유지하면서 실제 저장소를
 * Next.js Data Cache로 전환합니다.
 *
 * 기존 호출부가 전달하는 key가 path, mode, limit 등을 이미 포함하므로
 * 해당 key를 공유 캐시 식별자로 그대로 사용합니다.
 */
export async function cached<T>(
  key: string,
  options: CacheOptions = {},
  fn?: Fn<T>,
): Promise<T> {
  if (!fn) {
    throw new Error(
      'cached() requires fn',
    );
  }

  const ttlSec = Math.max(
    0,
    Math.trunc(
      options.ttlSec ?? 300,
    ),
  );

  const tags =
    normalizeTags(options.tags);

  if (ttlSec <= 0) {
    return await Promise.resolve().then(
      fn,
    );
  }

  const store = getStore();
  const pendingStore =
    getPendingStore();

  /*
   * 로컬 값을 바로 반환하지 않습니다.
   *
   * 다른 Vercel 인스턴스에서 revalidateTag()가 실행됐을 때도
   * 매 요청이 공유 Data Cache를 확인해야 즉시 새 데이터로 바뀝니다.
   * 로컬 값은 공유 재검증이 실패했을 때의 stale fallback으로만 사용합니다.
   */
  const staleEntry =
    store.get(key);

  const pending =
    pendingStore.get(key);

  if (pending) {
    return await pending as T;
  }

  const sharedLoader =
    unstable_cache(
      async () =>
        await Promise.resolve().then(
          fn,
        ),
      [
        'rdwiki:shared-cache:v1',
        key,
      ],
      {
        revalidate: ttlSec,
        tags,
      },
    );

  const loader =
    sharedLoader()
      .then((value) => {
        store.set(key, {
          value,
          expiresAt:
            Date.now() +
            ttlSec * 1000,
          tags,
        });

        return value;
      })
      .catch((error) => {
        if (staleEntry) {
          console.warn(
            '[cache] shared refresh failed, serving local stale:',
            key,
            error,
          );

          return staleEntry.value as T;
        }

        throw error;
      })
      .finally(() => {
        pendingStore.delete(key);
      });

  pendingStore.set(
    key,
    loader as Promise<unknown>,
  );

  return await loader;
}

/**
 * 기존 로컬 캐시 태그와 Next.js 공유 캐시 태그를 함께 제거합니다.
 *
 * 캐시 무효화 실패 때문에 문서/FAQ 저장 자체가 실패하지 않도록
 * 공유 태그 무효화 오류는 로그만 남깁니다.
 */
export function invalidate(
  ...rawTags: string[]
) {
  const tags =
    normalizeTags(rawTags);

  if (tags.length === 0) {
    return;
  }

  const store = getStore();
  const pendingStore =
    getPendingStore();

  for (
    const [key, entry]
    of store.entries()
  ) {
    if (
      entry.tags.some(
        (tag: string) =>
          tags.includes(tag),
      )
    ) {
      store.delete(key);
      pendingStore.delete(key);
    }
  }

  for (const tag of tags) {
    try {
      revalidateTag(tag);
    } catch (error) {
      console.warn(
        '[cache] shared tag invalidation failed:',
        tag,
        error,
      );
    }
  }
}
