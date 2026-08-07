// =============================================
// File: app/wiki/lib/documentCache.ts
// 전체 신규 파일
//
// 문서 열람 API와 검색 API가 동일한 문서별 공유 캐시를 사용합니다.
// 캐시 함수는 모듈 최상단에서 한 번만 생성하고 문서 ID를 인자로 전달합니다.
// 캐시는 24시간 유지되며 문서 저장/삭제 직후 본문 캐시 태그를 무효화합니다.
// =============================================

import 'server-only';

import {
  revalidateTag,
  unstable_cache,
} from 'next/cache';

import {
  runDbRead,
  sql,
} from '@/wiki/lib/db';

export const DOCUMENT_DETAIL_CACHE_SECONDS =
  60 * 60 * 24;

const DOCUMENT_DETAIL_CACHE_VERSION =
  'document:detail:v5';

const DOCUMENT_CONTENT_CACHE_TAG =
  'document:content:v5';

export type CachedDocument = {
  id: number;
  title: string;
  path: string | number | null;
  icon?: string | null;
  tags: string[];
  created_at?: unknown;
  updated_at?: unknown;
  special: string | null;
  order: number;
  content: unknown[];
};

type DocumentRow = {
  id: number;
  title: string;
  path: string | number | null;
  icon?: string | null;
  tags?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  special?: string | null;
  order?: number | string | null;
  content?: unknown;
};

/**
 * 기존 호출부 호환용입니다.
 *
 * 고정된 unstable_cache 함수에서는 options.tags를 문서 ID별로
 * 동적으로 만들 수 없으므로 문서 본문 전체가 하나의 태그를 공유합니다.
 * 캐시 키 자체에는 함수 인자 id가 포함되므로 문서별 결과는 분리됩니다.
 */
export function documentCacheTag(
  _id: number,
) {
  return DOCUMENT_CONTENT_CACHE_TAG;
}

function toContentArray(
  value: unknown,
): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string') {
    try {
      const parsed =
        JSON.parse(value);

      return Array.isArray(parsed)
        ? parsed
        : [];
    } catch {
      return [];
    }
  }

  return [];
}

function normalizeTags(
  value: unknown,
): string[] {
  if (Array.isArray(value)) {
    return value
      .map(String)
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return [];
  }

  return String(value)
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function serializeDocument(
  row: DocumentRow,
): CachedDocument {
  return {
    id: Number(row.id),
    title: String(
      row.title ?? '',
    ),
    path: row.path,
    icon: row.icon ?? null,
    tags: normalizeTags(
      row.tags,
    ),
    created_at:
      row.created_at,
    updated_at:
      row.updated_at,
    special:
      row.special ?? null,
    order: Number(
      row.order ?? 0,
    ),
    content:
      toContentArray(
        row.content ?? [],
      ),
  };
}

/**
 * 캐시를 거치지 않는 실제 DB 조회입니다.
 * 관리자 검증이나 캐시 내부 로더에서만 사용합니다.
 */
export async function getDocumentByIdFresh(
  id: number,
): Promise<CachedDocument | null> {
  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {
    return null;
  }

  const rows =
    (await runDbRead(
      `document-cache:get:${id}`,
      async () => {
        return await sql`
          SELECT
            d.id,
            d.title,
            d.path,
            d.icon,
            d.tags,
            d.created_at,
            d.updated_at,
            d.special,
            d."order",
            dc.content
          FROM documents d
          LEFT JOIN document_contents dc
            ON dc.document_id = d.id
          WHERE d.id = ${id}
          LIMIT 1
        `;
      },
      1,
    )) as unknown as DocumentRow[];

  const row = rows[0];

  return row
    ? serializeDocument(row)
    : null;
}

/**
 * 모듈이 로드될 때 한 번만 생성되는 고정 Data Cache 함수입니다.
 *
 * Next.js unstable_cache는 호출 인자를 캐시 키에 포함하므로
 * 문서별 결과는 id 기준으로 서로 분리됩니다.
 */
const loadCachedDocumentById =
  unstable_cache(
    async (
      id: number,
    ): Promise<CachedDocument | null> =>
      await getDocumentByIdFresh(
        id,
      ),
    [
      DOCUMENT_DETAIL_CACHE_VERSION,
    ],
    {
      revalidate:
        DOCUMENT_DETAIL_CACHE_SECONDS,
      tags: [
        DOCUMENT_CONTENT_CACHE_TAG,
      ],
    },
  );

/**
 * 문서 ID별 24시간 공유 Data Cache입니다.
 *
 * 검색과 문서 열람이 이 함수를 함께 사용하므로,
 * 검색에서 캐시된 문서를 열 때나 열람한 문서를 검색할 때
 * Supabase 본문을 다시 전송받지 않습니다.
 */
export async function getCachedDocumentById(
  id: number,
): Promise<CachedDocument | null> {
  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {
    return null;
  }

  return await loadCachedDocumentById(
    id,
  );
}

/**
 * 검색 후보 문서를 제한된 동시성으로 불러옵니다.
 *
 * 캐시 적중 문서는 병렬로 빠르게 반환하고,
 * 배포 직후 캐시 미스가 여러 건이어도 DB에 과도한 동시 요청을 만들지 않습니다.
 * 개별 문서 조회 실패가 전체 검색 결과를 없애지 않도록 null로 격리합니다.
 */
export async function getCachedDocumentsByIds(
  rawIds: number[],
  concurrency = 6,
): Promise<
  Map<number, CachedDocument | null>
> {
  const ids = Array.from(
    new Set(
      rawIds.filter(
        (id) =>
          Number.isInteger(id) &&
          id > 0,
      ),
    ),
  );

  const result =
    new Map<
      number,
      CachedDocument | null
    >();

  if (ids.length === 0) {
    return result;
  }

  let cursor = 0;
  const workerCount =
    Math.min(
      Math.max(
        1,
        Math.trunc(concurrency),
      ),
      ids.length,
    );

  const workers =
    Array.from(
      {
        length: workerCount,
      },
      async () => {
        while (true) {
          const index =
            cursor++;

          if (
            index >= ids.length
          ) {
            return;
          }

          const id = ids[index];

          try {
            result.set(
              id,
              await getCachedDocumentById(
                id,
              ),
            );
          } catch (error) {
            console.error(
              `[document-cache] 문서 ${id} 조회 실패:`,
              error,
            );

            result.set(
              id,
              null,
            );
          }
        }
      },
    );

  await Promise.all(workers);

  return result;
}

/**
 * 문서 저장/삭제 직후 호출합니다.
 *
 * 수정은 상대적으로 드문 관리 작업이므로 문서 하나가 바뀌면
 * 공유 본문 태그를 비웁니다. 다음 실제 열람/검색 시 필요한 문서만
 * 다시 채워지며 브라우저/API 응답은 계속 no-store입니다.
 */
export function invalidateDocumentCache(
  id: number,
) {
  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {
    return;
  }

  revalidateTag(
    DOCUMENT_CONTENT_CACHE_TAG,
  );
}
