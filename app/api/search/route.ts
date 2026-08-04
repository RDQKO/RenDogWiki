import { unstable_cache } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

import {
  isTransientDbError,
  runDbRead,
  sql,
} from '@/wiki/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SEARCH_CACHE_SECONDS = 60;
const SEARCH_CACHE_TAG = 'search:index';
const SEARCH_CACHE_VERSION = 'search:compat-v1';

type MatchType = 'title' | 'tags' | 'content';
type SectionMatchSource = 'heading' | 'body';

type SearchRow = {
  id: number;
  title: string;
  path: string | number;
  icon?: string | null;
  tags?: string | string[] | null;
  match_type: MatchType;
  category_breadcrumb?: string | null;
  score?: number | string | null;
  section_heading?: string | null;
  section_dom_id?: string | null;
  section_level?: number | string | null;
  section_text?: string | null;
  section_snippet?: string | null;
  section_match_source?: SectionMatchSource | null;
};

type SectionMeta = Pick<
  SearchRow,
  | 'section_heading'
  | 'section_dom_id'
  | 'section_level'
  | 'section_snippet'
  | 'section_match_source'
>;

function compactSearchText(value: string) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .trim();
}

function normalizeSearchText(value: string) {
  return String(value ?? '')
    .toLowerCase()
    .trim();
}

function shouldUseTrgm(raw: string) {
  return compactSearchText(raw).length >= 3;
}

function shouldUseLooseRegex(raw: string) {
  return compactSearchText(raw).length >= 2;
}

function escapeRegexChar(char: string) {
  return char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function makeLooseRegex(raw: string) {
  const compact = compactSearchText(raw);
  if (!compact) return '';

  return compact
    .split('')
    .map(escapeRegexChar)
    .join('.*');
}

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((value) => String(value ?? '').trim())
      .filter(Boolean);
  }

  if (typeof raw === 'string') {
    const value = raw.trim();
    if (!value) return [];

    if (value.startsWith('{') && value.endsWith('}')) {
      return value
        .slice(1, -1)
        .split(',')
        .map((tag) => tag.replace(/^"(.*)"$/, '$1').trim())
        .filter(Boolean);
    }

    return value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  return [];
}

function cleanText(value: unknown) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildCompactIndexMap(text: string) {
  const compactChars: string[] = [];
  const indexMap: number[] = [];

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (/\s/.test(char)) continue;

    compactChars.push(char.toLowerCase());
    indexMap.push(index);
  }

  return {
    compact: compactChars.join(''),
    indexMap,
  };
}

function findLooseMatchRange(
  text: string,
  keyword: string,
): { start: number; end: number } | null {
  if (!text || !keyword) return null;

  const compactKeyword = compactSearchText(keyword);
  if (!compactKeyword) return null;

  const { compact, indexMap } = buildCompactIndexMap(text);
  const index = compact.indexOf(compactKeyword);
  if (index < 0) return null;

  const start = indexMap[index];
  const endCompactIndex = index + compactKeyword.length - 1;
  const end = (indexMap[endCompactIndex] ?? start) + 1;

  return { start, end };
}

function findDirectMatchRange(
  text: string,
  keyword: string,
): { start: number; end: number } | null {
  const source = String(text ?? '');
  const query = String(keyword ?? '').trim();

  if (!source || !query) return null;

  const index = source.toLowerCase().indexOf(query.toLowerCase());
  if (index < 0) return null;

  return {
    start: index,
    end: index + query.length,
  };
}

function makeSnippetFromText(
  text: string,
  keyword: string,
  radius = 40,
) {
  const range =
    findDirectMatchRange(text, keyword) ??
    findLooseMatchRange(text, keyword);

  if (!range) return null;

  const start = Math.max(0, range.start - radius);
  const end = Math.min(text.length, range.end + radius);
  const prefix = start > 0 ? '… ' : '';
  const suffix = end < text.length ? ' …' : '';

  return `${prefix}${text.slice(start, end)}${suffix}`;
}

function isTitleMatchedForSectionSuppression(
  title: string,
  query: string,
) {
  const normalizedTitle = normalizeSearchText(title);
  const normalizedQuery = normalizeSearchText(query);
  const compactTitle = compactSearchText(title);
  const compactQuery = compactSearchText(query);

  if (!normalizedTitle || !compactQuery) return false;
  if (
    normalizedQuery &&
    normalizedTitle.includes(normalizedQuery)
  ) {
    return true;
  }

  return Boolean(
    compactTitle &&
    compactTitle.includes(compactQuery),
  );
}

function toSearchRows(
  rows: Iterable<unknown> | null | undefined,
): SearchRow[] {
  return Array.from(rows ?? []).map(
    (row) => row as SearchRow,
  );
}

function normalizeSectionLevel(
  value: number | string | null | undefined,
): 1 | 2 | 3 | null {
  const level = Number(value);

  return level === 1 || level === 2 || level === 3
    ? level
    : null;
}

function enrichSectionRow(
  row: SearchRow,
  raw: string,
): SearchRow {
  const matchSource: SectionMatchSource | null =
    row.section_match_source === 'heading'
      ? 'heading'
      : row.section_match_source === 'body'
        ? 'body'
        : null;

  // 검색 전용 문단 인덱스가 비어 있거나 해당 문단을 찾지 못해도
  // 원본 본문 검색 결과 자체는 유지합니다.
  if (!matchSource) {
    return {
      ...row,
      section_heading: null,
      section_dom_id: null,
      section_level: null,
      section_snippet: null,
      section_match_source: null,
    };
  }

  if (
    isTitleMatchedForSectionSuppression(
      String(row.title ?? ''),
      raw,
    )
  ) {
    return {
      ...row,
      section_heading: null,
      section_dom_id: null,
      section_level: null,
      section_snippet: null,
      section_match_source: null,
    };
  }

  const heading = cleanText(row.section_heading);
  const body = cleanText(row.section_text);
  const source =
    matchSource === 'heading'
      ? cleanText(`${heading} ${body}`)
      : body;

  const snippet =
    makeSnippetFromText(source, raw, 40) ??
    makeSnippetFromText(heading, raw, 40) ??
    source.slice(0, 120);

  return {
    ...row,
    section_heading: heading || null,
    section_dom_id:
      cleanText(row.section_dom_id) || null,
    section_level: normalizeSectionLevel(
      row.section_level,
    ),
    section_snippet: snippet || null,
    section_match_source: matchSource,
  };
}

async function searchDocuments(
  raw: string,
  limit: number,
): Promise<SearchRow[]> {
  const normalizedRaw = normalizeSearchText(raw);
  const compactRaw = compactSearchText(raw);
  const pattern = `%${raw}%`;
  const normalizedPattern = `%${normalizedRaw}%`;
  const compactPattern = `%${compactRaw}%`;
  const normalizedPrefix = `${normalizedRaw}%`;
  const useTrgm = shouldUseTrgm(raw);
  const useLooseRegex = shouldUseLooseRegex(raw);
  const looseRegex = makeLooseRegex(raw);

  const dbRows = await runDbRead(
    'search:index',
    async () => {
      const titlePromise = sql`
        SELECT
          d.id,
          d.title,
          d.path,
          d.icon,
          d.tags,
          'title' AS match_type,
          (
            WITH parts AS (
              SELECT regexp_split_to_array(
                regexp_replace(
                  COALESCE((d.path)::text, ''),
                  '^/+|/+$',
                  '',
                  'g'
                ),
                '/+'
              ) AS pp
            ),
            ids AS (
              SELECT
                (pp[i])::bigint AS cid,
                i AS ord
              FROM parts,
                generate_subscripts(pp, 1) AS g(i)
              WHERE pp[i] ~ '^[0-9]+$'
            )
            SELECT COALESCE(
              string_agg(c.name, ' > ' ORDER BY ids.ord),
              ''
            )
            FROM ids
            JOIN categories c
              ON c.id = ids.cid
          ) AS category_breadcrumb,
          GREATEST(
            CASE
              WHEN LOWER(COALESCE(d.title, '')) = ${normalizedRaw}
                THEN 100
              WHEN LOWER(COALESCE(d.title, '')) LIKE LOWER(${pattern})
                THEN 80
              WHEN regexp_replace(
                LOWER(COALESCE(d.title, '')),
                '\\s+',
                '',
                'g'
              ) LIKE ${compactPattern}
                THEN 72
              WHEN ${useLooseRegex}
                AND regexp_replace(
                  LOWER(COALESCE(d.title, '')),
                  '\\s+',
                  '',
                  'g'
                ) ~ ${looseRegex}
                THEN 66
              ELSE 0
            END,
            CASE
              WHEN ${useTrgm}
                THEN similarity(
                  LOWER(COALESCE(d.title, '')),
                  ${normalizedRaw}
                ) * 60
              ELSE 0
            END
          ) AS score
        FROM documents d
        WHERE
          LOWER(COALESCE(d.title, '')) LIKE LOWER(${pattern})
          OR regexp_replace(
            LOWER(COALESCE(d.title, '')),
            '\\s+',
            '',
            'g'
          ) LIKE ${compactPattern}
          OR (
            ${useLooseRegex}
            AND regexp_replace(
              LOWER(COALESCE(d.title, '')),
              '\\s+',
              '',
              'g'
            ) ~ ${looseRegex}
          )
          OR (
            ${useTrgm}
            AND similarity(
              LOWER(COALESCE(d.title, '')),
              ${normalizedRaw}
            ) >= 0.2
          )
        ORDER BY
          score DESC,
          d.updated_at DESC NULLS LAST,
          d.id DESC
        LIMIT ${limit}
      `;

      const tagPromise = sql`
        SELECT
          d.id,
          d.title,
          d.path,
          d.icon,
          d.tags,
          'tags' AS match_type,
          (
            WITH parts AS (
              SELECT regexp_split_to_array(
                regexp_replace(
                  COALESCE((d.path)::text, ''),
                  '^/+|/+$',
                  '',
                  'g'
                ),
                '/+'
              ) AS pp
            ),
            ids AS (
              SELECT
                (pp[i])::bigint AS cid,
                i AS ord
              FROM parts,
                generate_subscripts(pp, 1) AS g(i)
              WHERE pp[i] ~ '^[0-9]+$'
            )
            SELECT COALESCE(
              string_agg(c.name, ' > ' ORDER BY ids.ord),
              ''
            )
            FROM ids
            JOIN categories c
              ON c.id = ids.cid
          ) AS category_breadcrumb,
          GREATEST(
            CASE
              WHEN LOWER(COALESCE(d.tags::text, '')) LIKE LOWER(${pattern})
                THEN 60
              WHEN regexp_replace(
                LOWER(COALESCE(d.tags::text, '')),
                '\\s+',
                '',
                'g'
              ) LIKE ${compactPattern}
                THEN 54
              WHEN ${useLooseRegex}
                AND regexp_replace(
                  LOWER(COALESCE(d.tags::text, '')),
                  '\\s+',
                  '',
                  'g'
                ) ~ ${looseRegex}
                THEN 50
              ELSE 0
            END,
            CASE
              WHEN ${useTrgm}
                THEN similarity(
                  LOWER(COALESCE(d.tags::text, '')),
                  ${normalizedRaw}
                ) * 45
              ELSE 0
            END
          ) AS score
        FROM documents d
        WHERE
          LOWER(COALESCE(d.tags::text, '')) LIKE LOWER(${pattern})
          OR regexp_replace(
            LOWER(COALESCE(d.tags::text, '')),
            '\\s+',
            '',
            'g'
          ) LIKE ${compactPattern}
          OR (
            ${useLooseRegex}
            AND regexp_replace(
              LOWER(COALESCE(d.tags::text, '')),
              '\\s+',
              '',
              'g'
            ) ~ ${looseRegex}
          )
          OR (
            ${useTrgm}
            AND similarity(
              LOWER(COALESCE(d.tags::text, '')),
              ${normalizedRaw}
            ) >= 0.2
          )
        ORDER BY
          score DESC,
          d.updated_at DESC NULLS LAST,
          d.id DESC
        LIMIT ${limit}
      `;

      /**
       * 호환 우선 본문 검색
       *
       * 기존처럼 document_contents.content 원본 JSON 문자열을 DB 안에서 검색하되,
       * content 자체는 SELECT 결과로 반환하지 않습니다.
       *
       * 따라서 일반 본문, 소제목, 무기 카드, 정보 박스 등 기존에 검색되던
       * 모든 JSON 속성값의 검색 범위는 유지하면서 Supabase -> Vercel 본문
       * 전체 전송만 제거합니다.
       *
       * document_search_sections는 결과 노출 여부를 결정하지 않고,
       * 문단 제목·DOM ID·미리보기 보강에만 사용합니다.
       */
      const sectionPromise = sql`
        WITH content_matches AS (
          SELECT
            d.id,
            d.title,
            d.path,
            d.icon,
            d.tags,
            d.updated_at,
            CASE
              WHEN LOWER(
                COALESCE(dc.content::text, '')
              ) LIKE ${normalizedPattern}
                THEN 30
              WHEN regexp_replace(
                LOWER(COALESCE(dc.content::text, '')),
                '\\s+',
                '',
                'g'
              ) LIKE ${compactPattern}
                THEN 28
              ELSE 0
            END AS content_score,
            (
              WITH parts AS (
                SELECT regexp_split_to_array(
                  regexp_replace(
                    COALESCE((d.path)::text, ''),
                    '^/+|/+$',
                    '',
                    'g'
                  ),
                  '/+'
                ) AS pp
              ),
              ids AS (
                SELECT
                  (pp[i])::bigint AS cid,
                  i AS ord
                FROM parts,
                  generate_subscripts(pp, 1) AS g(i)
                WHERE pp[i] ~ '^[0-9]+$'
              )
              SELECT COALESCE(
                string_agg(c.name, ' > ' ORDER BY ids.ord),
                ''
              )
              FROM ids
              JOIN categories c
                ON c.id = ids.cid
            ) AS category_breadcrumb
          FROM documents d
          JOIN document_contents dc
            ON dc.document_id = d.id
          WHERE
            LOWER(
              COALESCE(dc.content::text, '')
            ) LIKE ${normalizedPattern}
            OR regexp_replace(
              LOWER(COALESCE(dc.content::text, '')),
              '\\s+',
              '',
              'g'
            ) LIKE ${compactPattern}
          ORDER BY
            content_score DESC,
            d.updated_at DESC NULLS LAST,
            d.id DESC
          LIMIT ${limit}
        )
        SELECT
          cm.id,
          cm.title,
          cm.path,
          cm.icon,
          cm.tags,
          'content' AS match_type,
          cm.category_breadcrumb,
          cm.content_score AS score,
          matched.section_heading,
          matched.section_dom_id,
          matched.section_level,
          matched.section_text,
          matched.section_match_source
        FROM content_matches cm
        LEFT JOIN LATERAL (
          SELECT
            s.heading_text AS section_heading,
            s.dom_id AS section_dom_id,
            s.level AS section_level,
            s.plain_text AS section_text,
            CASE
              WHEN
                LOWER(s.heading_text) = ${normalizedRaw}
                OR s.heading_compact = ${compactRaw}
                OR LOWER(s.heading_text) LIKE ${normalizedPrefix}
                OR LOWER(s.heading_text) LIKE ${normalizedPattern}
                OR s.heading_compact LIKE ${compactPattern}
                THEN 'heading'
              ELSE 'body'
            END AS section_match_source,
            CASE
              WHEN LOWER(s.heading_text) = ${normalizedRaw}
                THEN 160
              WHEN s.heading_compact = ${compactRaw}
                THEN 150
              WHEN LOWER(s.heading_text) LIKE ${normalizedPrefix}
                THEN 140
              WHEN LOWER(s.heading_text) LIKE ${normalizedPattern}
                THEN 130
              WHEN s.heading_compact LIKE ${compactPattern}
                THEN 125
              WHEN LOWER(s.plain_text) = ${normalizedRaw}
                THEN 100
              WHEN LOWER(s.plain_text) LIKE ${normalizedPrefix}
                THEN 90
              WHEN LOWER(s.plain_text) LIKE ${normalizedPattern}
                THEN 80
              WHEN s.compact_text LIKE ${compactPattern}
                THEN 75
              ELSE 0
            END AS section_score
          FROM document_search_sections s
          WHERE
            s.document_id = cm.id
            AND (
              LOWER(s.heading_text) LIKE ${normalizedPattern}
              OR s.heading_compact LIKE ${compactPattern}
              OR LOWER(s.plain_text) LIKE ${normalizedPattern}
              OR s.compact_text LIKE ${compactPattern}
            )
          ORDER BY
            section_score DESC,
            s.section_order ASC
          LIMIT 1
        ) matched ON TRUE
        ORDER BY
          cm.content_score DESC,
          cm.updated_at DESC NULLS LAST,
          cm.id DESC
      `;

      const [titleRowsRaw, tagRowsRaw, sectionRowsRaw] =
        await Promise.all([
          titlePromise,
          tagPromise,
          sectionPromise,
        ]);

      return {
        titleRows: toSearchRows(titleRowsRaw),
        tagRows: toSearchRows(tagRowsRaw),
        sectionRows: toSearchRows(sectionRowsRaw),
      };
    },
  );

  const titleRows = dbRows?.titleRows ?? [];
  const tagRows = dbRows?.tagRows ?? [];
  const sectionRows = (dbRows?.sectionRows ?? []).map(
    (row) => enrichSectionRow(row, raw),
  );

  const sectionMetaById = new Map<number, SectionMeta>();

  for (const row of sectionRows) {
    sectionMetaById.set(Number(row.id), {
      section_heading: row.section_heading ?? null,
      section_dom_id: row.section_dom_id ?? null,
      section_level: row.section_level ?? null,
      section_snippet: row.section_snippet ?? null,
      section_match_source:
        row.section_match_source ?? null,
    });
  }

  const headingMatchedSectionRows = sectionRows.filter(
    (row) => row.section_match_source === 'heading',
  );
  const bodyMatchedSectionRows = sectionRows.filter(
    (row) => row.section_match_source === 'body',
  );

  const seen = new Set<number>();
  const merged: SearchRow[] = [];

  const withSectionMeta = (row: SearchRow): SearchRow => {
    const meta = sectionMetaById.get(Number(row.id));

    if (!meta) {
      return {
        ...row,
        section_heading: row.section_heading ?? null,
        section_dom_id: row.section_dom_id ?? null,
        section_level: row.section_level ?? null,
        section_snippet: row.section_snippet ?? null,
        section_match_source:
          row.section_match_source ?? null,
      };
    }

    return {
      ...row,
      section_heading:
        meta.section_heading ??
        row.section_heading ??
        null,
      section_dom_id:
        meta.section_dom_id ??
        row.section_dom_id ??
        null,
      section_level:
        meta.section_level ??
        row.section_level ??
        null,
      section_snippet:
        meta.section_snippet ??
        row.section_snippet ??
        null,
      section_match_source:
        meta.section_match_source ??
        row.section_match_source ??
        null,
    };
  };

  const pushUnique = (rows: SearchRow[]) => {
    for (const row of rows) {
      const id = Number(row.id);
      if (seen.has(id)) continue;

      const enriched = withSectionMeta(row);
      const {
        section_text: _sectionText,
        ...safeRow
      } = enriched;

      merged.push({
        ...safeRow,
        tags: parseTags(enriched.tags),
        score:
          enriched.score == null
            ? null
            : Number(enriched.score),
        section_level: normalizeSectionLevel(
          enriched.section_level,
        ),
        category_breadcrumb:
          enriched.category_breadcrumb
            ? String(enriched.category_breadcrumb)
            : '',
      });

      seen.add(id);
      if (merged.length >= limit) break;
    }
  };

  // 기존 UX 순서 유지: 제목 → 제목 문단 → 태그 → 본문 문단.
  pushUnique(titleRows);
  if (merged.length < limit) {
    pushUnique(headingMatchedSectionRows);
  }
  if (merged.length < limit) {
    pushUnique(tagRows);
  }
  if (merged.length < limit) {
    pushUnique(bodyMatchedSectionRows);
  }
  if (merged.length < limit) {
    pushUnique(sectionRows);
  }

  return merged;
}

async function searchCached(
  raw: string,
  limit: number,
) {
  const normalizedKey = compactSearchText(raw);

  return unstable_cache(
    async () => searchDocuments(raw, limit),
    [
      SEARCH_CACHE_VERSION,
      normalizedKey,
      String(limit),
    ],
    {
      revalidate: SEARCH_CACHE_SECONDS,
      tags: [SEARCH_CACHE_TAG, SEARCH_CACHE_VERSION],
    },
  )();
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const raw = (searchParams.get('query') ?? '').trim();
    const requestedLimit = Number(
      searchParams.get('limit'),
    );
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(
          50,
          Math.max(1, Math.trunc(requestedLimit)),
        )
      : 50;

    if (!raw) {
      return NextResponse.json([], {
        headers: {
          'Cache-Control': 'no-store',
        },
      });
    }

    const results = await searchCached(raw, limit);

    return NextResponse.json(results, {
      headers: {
        'Cache-Control':
          'public, max-age=0, s-maxage=60, stale-while-revalidate=120',
      },
    });
  } catch (error) {
    console.error('[search GET] unexpected error:', error);

    if (isTransientDbError(error)) {
      return NextResponse.json([], {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
          'X-Search-Degraded': '1',
        },
      });
    }

    return NextResponse.json(
      { error: 'server error' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}