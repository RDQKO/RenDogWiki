import { unstable_cache } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import {
  Element as SlateElement,
  Node,
  type Descendant,
} from 'slate';

import {
  isTransientDbError,
  runDbRead,
  sql,
} from '@/wiki/lib/db';
import { extractHeadings } from '@/wiki/lib/extractHeadings';
import {
  getCachedDocumentsByIds,
} from '@/wiki/lib/documentCache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SEARCH_CACHE_SECONDS = 60;
const SEARCH_CACHE_TAG = 'search:index';
const SEARCH_CACHE_VERSION = 'search:hybrid-document-cache-v1';

type MatchType = 'title' | 'tags' | 'content';
type SectionMatchSource = 'heading' | 'body';

type SearchRow = {
  id: number;
  title: string;
  path: string | number;
  icon?: string | null;
  tags?: string | string[] | null;
  match_type: MatchType;
  content?: string | Descendant[] | null;
  category_breadcrumb?: string | null;
  score?: number | string | null;
  section_heading?: string | null;
  section_dom_id?: string | null;
  section_level?: number | string | null;
  section_text?: string | null;
  section_snippet?: string | null;
  section_match_source?: SectionMatchSource | null;
};

type SearchSection = {
  headingText: string;
  domId: string;
  level: 0 | 1 | 2 | 3;
  plainText: string;
};

type SearchSectionMatch = {
  sectionHeading: string;
  sectionDomId: string;
  sectionLevel: 1 | 2 | 3 | null;
  sectionSnippet: string;
  sectionMatchSource: SectionMatchSource;
  score: number;
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


function extractSearchSections(
  value: Descendant[],
): SearchSection[] {
  const headings = extractHeadings(value);
  const sections: SearchSection[] = [];

  let headingCursor = 0;
  let current: SearchSection = {
    headingText: '',
    domId: '',
    level: 0,
    plainText: '',
  };

  const pushCurrent = () => {
    const plainText = cleanText(current.plainText);
    if (!plainText) return;

    sections.push({
      ...current,
      plainText,
    });
  };

  for (const node of value) {
    if (!SlateElement.isElement(node)) continue;

    const isHeading =
      node.type === 'heading-one' ||
      node.type === 'heading-two' ||
      node.type === 'heading-three';

    if (isHeading) {
      pushCurrent();

      const meta = headings[headingCursor++];
      current = {
        headingText: cleanText(
          meta?.text ?? Node.string(node),
        ),
        domId: meta?.domId ?? '',
        level: meta?.level ?? 0,
        plainText: '',
      };
      continue;
    }

    const nodeText = cleanText(Node.string(node));
    if (!nodeText) continue;

    current.plainText = current.plainText
      ? `${current.plainText} ${nodeText}`
      : nodeText;
  }

  pushCurrent();
  return sections;
}

function getHeadingMatchScore(
  heading: string,
  query: string,
) {
  const normalizedHeading =
    normalizeSearchText(heading);
  const normalizedQuery =
    normalizeSearchText(query);
  const compactHeading =
    compactSearchText(heading);
  const compactQuery =
    compactSearchText(query);

  if (!normalizedHeading || !compactQuery) return 0;

  if (normalizedHeading === normalizedQuery) return 160;
  if (compactHeading === compactQuery) return 150;
  if (
    normalizedQuery &&
    normalizedHeading.startsWith(normalizedQuery)
  ) {
    return 140;
  }
  if (
    normalizedQuery &&
    normalizedHeading.includes(normalizedQuery)
  ) {
    return 130;
  }

  return 0;
}

function getBodyMatchScore(
  body: string,
  query: string,
) {
  const normalizedBody = normalizeSearchText(body);
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedBody || !normalizedQuery) return 0;
  if (!normalizedBody.includes(normalizedQuery)) {
    return 0;
  }

  if (normalizedBody === normalizedQuery) return 100;
  if (normalizedBody.startsWith(normalizedQuery)) {
    return 90;
  }

  return 80;
}

function toDescendants(
  value: SearchRow['content'],
): Descendant[] | null {
  if (Array.isArray(value)) {
    return value as Descendant[];
  }

  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? (parsed as Descendant[])
      : null;
  } catch {
    return null;
  }
}

function findBestSectionMatch(
  value: Descendant[] | null | undefined,
  query: string,
): SearchSectionMatch | null {
  if (!Array.isArray(value)) return null;

  const sections = extractSearchSections(value);
  if (sections.length === 0) return null;

  let best: SearchSectionMatch | null = null;

  for (const section of sections) {
    const headingScore = getHeadingMatchScore(
      section.headingText,
      query,
    );
    const bodyScore = getBodyMatchScore(
      section.plainText,
      query,
    );
    const score = Math.max(
      headingScore,
      bodyScore,
    );

    if (score <= 0) continue;

    const snippetSource =
      bodyScore > headingScore
        ? section.plainText
        : cleanText(
            `${section.headingText} ${section.plainText}`,
          );

    const snippet =
      makeSnippetFromText(
        snippetSource,
        query,
        40,
      ) ??
      makeSnippetFromText(
        section.headingText,
        query,
        40,
      ) ??
      snippetSource.slice(0, 120);

    const candidate: SearchSectionMatch = {
      sectionHeading: section.headingText,
      sectionDomId: section.domId,
      sectionLevel:
        section.level === 1 ||
        section.level === 2 ||
        section.level === 3
          ? section.level
          : null,
      sectionSnippet: snippet,
      sectionMatchSource:
        headingScore >= bodyScore
          ? 'heading'
          : 'body',
      score,
    };

    if (
      !best ||
      candidate.score > best.score ||
      (
        candidate.score === best.score &&
        candidate.sectionHeading.length <
          best.sectionHeading.length
      )
    ) {
      best = candidate;
    }
  }

  return best;
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

async function searchDocuments(
  raw: string,
  limit: number,
): Promise<SearchRow[]> {
  const normalizedRaw = normalizeSearchText(raw);
  const compactRaw = compactSearchText(raw);
  const pattern = `%${raw}%`;
  const compactPattern = `%${compactRaw}%`;
  const useTrgm = shouldUseTrgm(raw);
  const useLooseRegex = shouldUseLooseRegex(raw);
  const looseRegex = makeLooseRegex(raw);

  const dbRows = await runDbRead(
    'search:original-ux',
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
              string_agg(
                c.name,
                ' > '
                ORDER BY ids.ord
              ),
              ''
            )
            FROM ids
            JOIN categories c
              ON c.id = ids.cid
          ) AS category_breadcrumb,
          GREATEST(
            CASE
              WHEN LOWER(
                COALESCE(d.title, '')
              ) = ${normalizedRaw}
                THEN 100
              WHEN LOWER(
                COALESCE(d.title, '')
              ) LIKE LOWER(${pattern})
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
          LOWER(
            COALESCE(d.title, '')
          ) LIKE LOWER(${pattern})
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
              string_agg(
                c.name,
                ' > '
                ORDER BY ids.ord
              ),
              ''
            )
            FROM ids
            JOIN categories c
              ON c.id = ids.cid
          ) AS category_breadcrumb,
          GREATEST(
            CASE
              WHEN LOWER(
                COALESCE(d.tags::text, '')
              ) LIKE LOWER(${pattern})
                THEN 60
              WHEN regexp_replace(
                LOWER(
                  COALESCE(d.tags::text, '')
                ),
                '\\s+',
                '',
                'g'
              ) LIKE ${compactPattern}
                THEN 54
              WHEN ${useLooseRegex}
                AND regexp_replace(
                  LOWER(
                    COALESCE(d.tags::text, '')
                  ),
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
                  LOWER(
                    COALESCE(d.tags::text, '')
                  ),
                  ${normalizedRaw}
                ) * 45
              ELSE 0
            END
          ) AS score
        FROM documents d
        WHERE
          LOWER(
            COALESCE(d.tags::text, '')
          ) LIKE LOWER(${pattern})
          OR regexp_replace(
            LOWER(
              COALESCE(d.tags::text, '')
            ),
            '\\s+',
            '',
            'g'
          ) LIKE ${compactPattern}
          OR (
            ${useLooseRegex}
            AND regexp_replace(
              LOWER(
                COALESCE(d.tags::text, '')
              ),
              '\\s+',
              '',
              'g'
            ) ~ ${looseRegex}
          )
          OR (
            ${useTrgm}
            AND similarity(
              LOWER(
                COALESCE(d.tags::text, '')
              ),
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
       * 검색 대상과 점수 계산은 기존과 동일하게 원본 JSON 전체를 DB 안에서
       * 검사합니다. 단, dc.content 자체는 SELECT 결과로 반환하지 않습니다.
       *
       * 아래에서 후보 문서 ID를 공통 24시간 문서 캐시와 결합한 뒤,
       * 기존 목차 판정·본문 영역 판정·미리보기·정렬 코드를 그대로 실행합니다.
       */
      const contentPromise = sql`
        SELECT
          d.id,
          d.title,
          d.path,
          d.icon,
          d.tags,
          'content' AS match_type,
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
              string_agg(
                c.name,
                ' > '
                ORDER BY ids.ord
              ),
              ''
            )
            FROM ids
            JOIN categories c
              ON c.id = ids.cid
          ) AS category_breadcrumb,
          CASE
            WHEN LOWER(
              COALESCE(dc.content::text, '')
            ) LIKE LOWER(${pattern})
              THEN 30
            WHEN regexp_replace(
              LOWER(
                COALESCE(dc.content::text, '')
              ),
              '\\s+',
              '',
              'g'
            ) LIKE ${compactPattern}
              THEN 28
            ELSE 0
          END AS score
        FROM documents d
        JOIN document_contents dc
          ON d.id = dc.document_id
        WHERE
          LOWER(
            COALESCE(dc.content::text, '')
          ) LIKE LOWER(${pattern})
          OR regexp_replace(
            LOWER(
              COALESCE(dc.content::text, '')
            ),
            '\\s+',
            '',
            'g'
          ) LIKE ${compactPattern}
        ORDER BY
          score DESC,
          d.updated_at DESC NULLS LAST,
          d.id DESC
        LIMIT ${limit}
      `;

      const [
        titleRowsRaw,
        tagRowsRaw,
        contentRowsRaw,
      ] = await Promise.all([
        titlePromise,
        tagPromise,
        contentPromise,
      ]);

      return {
        titleRows: toSearchRows(titleRowsRaw),
        tagRows: toSearchRows(tagRowsRaw),
        contentRows: toSearchRows(contentRowsRaw),
      };
    },
  );

  const titleRows = dbRows?.titleRows ?? [];
  const tagRows = dbRows?.tagRows ?? [];
  const contentRows = dbRows?.contentRows ?? [];

  /*
   * 후보 ID와 점수는 기존 SQL 결과를 그대로 사용합니다.
   * Slate JSON만 문서 열람 API와 동일한 24시간 문서 캐시에서 가져옵니다.
   *
   * 따라서 아래의 목차 판정, 미리보기, section_dom_id, 결과 병합 순서는
   * 기존 코드와 동일하며 검색 UX가 바뀌지 않습니다.
   */
  const cachedDocuments =
    await getCachedDocumentsByIds(
      contentRows.map(
        (row) =>
          Number(row.id),
      ),
      6,
    );

  const hydratedContentRows:
    SearchRow[] =
    contentRows.map((row) => {
      const document =
        cachedDocuments.get(
          Number(row.id),
        );

      return {
        ...row,
        content:
          document
            ? (
                document.content as Descendant[]
              )
            : null,
      };
    });

  const contentMetaById =
    new Map<number, SectionMeta>();

  const enrichedContentRows: SearchRow[] =
    hydratedContentRows.map((row) => {
      const next: SearchRow = {
        ...row,
        section_heading: null,
        section_dom_id: null,
        section_level: null,
        section_snippet: null,
        section_match_source: null,
      };

      const descendants = toDescendants(
        row.content,
      );

      if (!descendants) {
        contentMetaById.set(Number(next.id), {
          section_heading: null,
          section_dom_id: null,
          section_level: null,
          section_snippet: null,
          section_match_source: null,
        });
        return next;
      }

      const best = findBestSectionMatch(
        descendants,
        raw,
      );
      const shouldSuppressSection =
        isTitleMatchedForSectionSuppression(
          next.title,
          raw,
        );

      if (best && !shouldSuppressSection) {
        next.section_heading =
          best.sectionHeading || null;
        next.section_dom_id =
          best.sectionDomId || null;
        next.section_level =
          best.sectionLevel;
        next.section_snippet =
          best.sectionSnippet || null;
        next.section_match_source =
          best.sectionMatchSource;
      }

      contentMetaById.set(Number(next.id), {
        section_heading:
          next.section_heading ?? null,
        section_dom_id:
          next.section_dom_id ?? null,
        section_level:
          next.section_level ?? null,
        section_snippet:
          next.section_snippet ?? null,
        section_match_source:
          next.section_match_source ?? null,
      });

      return next;
    });

  const matchedSectionRows =
    enrichedContentRows.filter(
      (row) =>
        Boolean(
          String(
            row.section_dom_id ?? '',
          ).trim(),
        ),
    );

  const headingMatchedSectionRows =
    matchedSectionRows.filter(
      (row) =>
        row.section_match_source === 'heading',
    );

  const bodyMatchedSectionRows =
    matchedSectionRows.filter(
      (row) =>
        row.section_match_source === 'body',
    );

  const seen = new Set<number>();
  const merged: SearchRow[] = [];

  const withSectionMeta = (
    row: SearchRow,
  ): SearchRow => {
    const meta = contentMetaById.get(
      Number(row.id),
    );

    if (!meta) {
      return {
        ...row,
        section_heading:
          row.section_heading ?? null,
        section_dom_id:
          row.section_dom_id ?? null,
        section_level:
          row.section_level ?? null,
        section_snippet:
          row.section_snippet ?? null,
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
        content: _content,
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
            ? String(
                enriched.category_breadcrumb,
              )
            : '',
      });

      seen.add(id);
      if (merged.length >= limit) break;
    }
  };

  // 최초 코드의 결과 우선순위를 그대로 복구합니다.
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
    pushUnique(enrichedContentRows);
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
          'no-store, no-cache, must-revalidate, max-age=0',
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
