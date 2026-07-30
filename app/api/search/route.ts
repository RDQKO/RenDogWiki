import { NextRequest, NextResponse } from 'next/server';
import { Element as SlateElement, Node, type Descendant } from 'slate';
import { sql, runDbRead, isTransientDbError } from '@/wiki/lib/db';
import { extractHeadings } from '@/wiki/lib/extractHeadings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type SearchRow = {
  id: number;
  title: string;
  path: string | number;
  icon?: string | null;
  tags?: string | string[] | null;
  match_type: 'title' | 'tags' | 'content';
  content?: string | null;
  category_breadcrumb?: string | null;
  score?: number | null;
  section_heading?: string | null;
  section_dom_id?: string | null;
  section_level?: 1 | 2 | 3 | null;
  section_snippet?: string | null;
  section_match_source?: 'heading' | 'body' | null;
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
  sectionMatchSource: 'heading' | 'body';
  score: number;
};

type SectionMeta = Pick<
  SearchRow,
  'section_heading' | 'section_dom_id' | 'section_level' | 'section_snippet' | 'section_match_source'
>;

function compactSearchText(v: string) {
  return String(v ?? '').toLowerCase().replace(/\s+/g, '').trim();
}

function normalizeSearchText(v: string) {
  return String(v ?? '').toLowerCase().trim();
}

function shouldUseTrgm(raw: string) {
  return compactSearchText(raw).length >= 3;
}

function shouldUseLooseRegex(raw: string) {
  return compactSearchText(raw).length >= 2;
}

function escapeRegexChar(ch: string) {
  return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function makeLooseRegex(raw: string) {
  const compact = compactSearchText(raw);
  if (!compact) return '';
  return compact.split('').map(escapeRegexChar).join('.*');
}

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((v) => String(v ?? '').trim()).filter(Boolean);
  }

  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return [];

    if (s.startsWith('{') && s.endsWith('}')) {
      return s
        .slice(1, -1)
        .split(',')
        .map((v) => v.replace(/^"(.*)"$/, '$1').trim())
        .filter(Boolean);
    }

    return s
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }

  return [];
}

function cleanText(v: string) {
  return String(v ?? '').replace(/\s+/g, ' ').trim();
}

function buildCompactIndexMap(text: string) {
  const compactChars: string[] = [];
  const indexMap: number[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (/\s/.test(ch)) continue;
    compactChars.push(ch.toLowerCase());
    indexMap.push(i);
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
  const idx = compact.indexOf(compactKeyword);
  if (idx < 0) return null;

  const start = indexMap[idx];
  const endCompactIdx = idx + compactKeyword.length - 1;
  const end = (indexMap[endCompactIdx] ?? start) + 1;

  return { start, end };
}

function findDirectMatchRange(
  text: string,
  keyword: string,
): { start: number; end: number } | null {
  const source = String(text ?? '');
  const query = String(keyword ?? '').trim();
  if (!source || !query) return null;

  const lowerSource = source.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerSource.indexOf(lowerQuery);
  if (idx < 0) return null;

  return { start: idx, end: idx + query.length };
}

function makeSnippetFromText(text: string, keyword: string, radius = 40) {
  const range = findDirectMatchRange(text, keyword) ?? findLooseMatchRange(text, keyword);
  if (!range) return null;

  const start = Math.max(0, range.start - radius);
  const end = Math.min(text.length, range.end + radius);
  const prefix = start > 0 ? '… ' : '';
  const suffix = end < text.length ? ' …' : '';

  return `${prefix}${text.slice(start, end)}${suffix}`;
}

function extractSearchSections(value: Descendant[]): SearchSection[] {
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
        headingText: cleanText(meta?.text ?? Node.string(node)),
        domId: meta?.domId ?? '',
        level: meta?.level ?? 0,
        plainText: '',
      };
      continue;
    }

    const text = cleanText(Node.string(node));
    if (!text) continue;

    current.plainText = current.plainText
      ? `${current.plainText} ${text}`
      : text;
  }

  pushCurrent();
  return sections;
}

function isTitleMatchedForSectionSuppression(title: string, query: string) {
  const normalizedTitle = normalizeSearchText(title);
  const normalizedQuery = normalizeSearchText(query);
  const compactTitle = compactSearchText(title);
  const compactQuery = compactSearchText(query);

  if (!normalizedTitle || !compactQuery) return false;
  if (normalizedQuery && normalizedTitle.includes(normalizedQuery)) return true;
  if (compactTitle && compactTitle.includes(compactQuery)) return true;
  return false;
}

function getHeadingMatchScore(heading: string, query: string) {
  const normalizedHeading = normalizeSearchText(heading);
  const normalizedQuery = normalizeSearchText(query);
  const compactHeading = compactSearchText(heading);
  const compactQuery = compactSearchText(query);

  if (!normalizedHeading || !compactQuery) return 0;

  if (normalizedHeading === normalizedQuery) return 160;
  if (compactHeading === compactQuery) return 150;
  if (normalizedQuery && normalizedHeading.startsWith(normalizedQuery)) return 140;
  if (normalizedQuery && normalizedHeading.includes(normalizedQuery)) return 130;
  return 0;
}

function getBodyMatchScore(body: string, query: string) {
  const normalizedBody = normalizeSearchText(body);
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedBody || !normalizedQuery) return 0;
  if (!normalizedBody.includes(normalizedQuery)) return 0;

  if (normalizedBody === normalizedQuery) return 100;
  if (normalizedBody.startsWith(normalizedQuery)) return 90;
  return 80;
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
    const headingScore = getHeadingMatchScore(section.headingText, query);
    const bodyScore = getBodyMatchScore(section.plainText, query);
    const score = Math.max(headingScore, bodyScore);

    if (score <= 0) continue;

    const snippetSource = bodyScore > headingScore
      ? section.plainText
      : cleanText(`${section.headingText} ${section.plainText}`);

    const snippet =
      makeSnippetFromText(snippetSource, query, 40) ??
      makeSnippetFromText(section.headingText, query, 40) ??
      snippetSource.slice(0, 120);

    const candidate: SearchSectionMatch = {
      sectionHeading: section.headingText,
      sectionDomId: section.domId,
      sectionLevel:
        section.level === 1 || section.level === 2 || section.level === 3
          ? section.level
          : null,
      sectionSnippet: snippet,
      sectionMatchSource: headingScore >= bodyScore ? 'heading' : 'body',
      score,
    };

    if (
      !best ||
      candidate.score > best.score ||
      (candidate.score === best.score &&
        candidate.sectionHeading.length < best.sectionHeading.length)
    ) {
      best = candidate;
    }
  }

  return best;
}

function toSearchRows(rows: Iterable<unknown> | null | undefined): SearchRow[] {
  return Array.from(rows ?? []).map((row) => row as SearchRow);
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const raw = (sp.get('query') ?? '').trim();
    const lim = Number(sp.get('limit'));
    const limit = Number.isFinite(lim)
      ? Math.min(50, Math.max(1, Math.trunc(lim)))
      : 50;

    if (!raw) {
      return NextResponse.json([], {
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    const normalizedRaw = normalizeSearchText(raw);
    const compactRaw = compactSearchText(raw);
    const pattern = `%${raw}%`;
    const compactPattern = `%${compactRaw}%`;
    const useTrgm = shouldUseTrgm(raw);
    const useLooseRegex = shouldUseLooseRegex(raw);
    const looseRegex = makeLooseRegex(raw);

    const breadcrumbExpr = sql/* sql */`
      (
        WITH parts AS (
          SELECT regexp_split_to_array(
            regexp_replace(COALESCE((path)::text, ''), '^/+|/+$', '', 'g'),
            '/+'
          ) AS pp
        ),
        ids AS (
          SELECT (pp[i])::bigint AS cid, i AS ord
          FROM parts, generate_subscripts(pp, 1) AS g(i)
          WHERE pp[i] ~ '^[0-9]+$'
        )
        SELECT COALESCE(string_agg(c.name, ' > ' ORDER BY ids.ord), '')
        FROM ids
        JOIN categories c ON c.id = ids.cid
      )
    `;

    const dbRows = await runDbRead('search:all', async () => {
      const titlePromise = sql/* sql */`
        SELECT
          d.id,
          d.title,
          d.path,
          d.icon,
          d.tags,
          'title' AS match_type,
          ${breadcrumbExpr} AS category_breadcrumb,
          GREATEST(
            CASE
              WHEN LOWER(COALESCE(d.title, '')) = ${normalizedRaw} THEN 100
              WHEN LOWER(COALESCE(d.title, '')) LIKE LOWER(${pattern}) THEN 80
              WHEN regexp_replace(LOWER(COALESCE(d.title, '')), '\\s+', '', 'g') LIKE ${compactPattern} THEN 72
              WHEN ${useLooseRegex} AND regexp_replace(LOWER(COALESCE(d.title, '')), '\\s+', '', 'g') ~ ${looseRegex} THEN 66
              ELSE 0
            END,
            CASE
              WHEN ${useTrgm} THEN similarity(LOWER(COALESCE(d.title, '')), ${normalizedRaw}) * 60
              ELSE 0
            END
          ) AS score
        FROM documents d
        WHERE
          LOWER(COALESCE(d.title, '')) LIKE LOWER(${pattern})
          OR regexp_replace(LOWER(COALESCE(d.title, '')), '\\s+', '', 'g') LIKE ${compactPattern}
          OR (
            ${useLooseRegex}
            AND regexp_replace(LOWER(COALESCE(d.title, '')), '\\s+', '', 'g') ~ ${looseRegex}
          )
          OR (
            ${useTrgm}
            AND similarity(LOWER(COALESCE(d.title, '')), ${normalizedRaw}) >= 0.2
          )
        ORDER BY score DESC, d.updated_at DESC NULLS LAST, d.id DESC
        LIMIT ${limit}
      `;

      const tagPromise = sql/* sql */`
        SELECT
          d.id,
          d.title,
          d.path,
          d.icon,
          d.tags,
          'tags' AS match_type,
          ${breadcrumbExpr} AS category_breadcrumb,
          GREATEST(
            CASE
              WHEN LOWER(COALESCE(d.tags::text, '')) LIKE LOWER(${pattern}) THEN 60
              WHEN regexp_replace(LOWER(COALESCE(d.tags::text, '')), '\\s+', '', 'g') LIKE ${compactPattern} THEN 54
              WHEN ${useLooseRegex} AND regexp_replace(LOWER(COALESCE(d.tags::text, '')), '\\s+', '', 'g') ~ ${looseRegex} THEN 50
              ELSE 0
            END,
            CASE
              WHEN ${useTrgm} THEN similarity(LOWER(COALESCE(d.tags::text, '')), ${normalizedRaw}) * 45
              ELSE 0
            END
          ) AS score
        FROM documents d
        WHERE
          LOWER(COALESCE(d.tags::text, '')) LIKE LOWER(${pattern})
          OR regexp_replace(LOWER(COALESCE(d.tags::text, '')), '\\s+', '', 'g') LIKE ${compactPattern}
          OR (
            ${useLooseRegex}
            AND regexp_replace(LOWER(COALESCE(d.tags::text, '')), '\\s+', '', 'g') ~ ${looseRegex}
          )
          OR (
            ${useTrgm}
            AND similarity(LOWER(COALESCE(d.tags::text, '')), ${normalizedRaw}) >= 0.2
          )
        ORDER BY score DESC, d.updated_at DESC NULLS LAST, d.id DESC
        LIMIT ${limit}
      `;

      const contentPromise = sql/* sql */`
        SELECT
          d.id,
          d.title,
          d.path,
          d.icon,
          d.tags,
          'content' AS match_type,
          dc.content AS content,
          (
            WITH parts AS (
              SELECT regexp_split_to_array(
                regexp_replace(COALESCE((d.path)::text, ''), '^/+|/+$', '', 'g'),
                '/+'
              ) AS pp
            ),
            ids AS (
              SELECT (pp[i])::bigint AS cid, i AS ord
              FROM parts, generate_subscripts(pp, 1) AS g(i)
              WHERE pp[i] ~ '^[0-9]+$'
            )
            SELECT COALESCE(string_agg(c.name, ' > ' ORDER BY ids.ord), '')
            FROM ids
            JOIN categories c ON c.id = ids.cid
          ) AS category_breadcrumb,
          CASE
            WHEN LOWER(COALESCE(dc.content, '')) LIKE LOWER(${pattern}) THEN 30
            WHEN regexp_replace(LOWER(COALESCE(dc.content, '')), '\\s+', '', 'g') LIKE ${compactPattern} THEN 28
            ELSE 0
          END AS score
        FROM documents d
        JOIN document_contents dc ON d.id = dc.document_id
        WHERE
          LOWER(COALESCE(dc.content, '')) LIKE LOWER(${pattern})
          OR regexp_replace(LOWER(COALESCE(dc.content, '')), '\\s+', '', 'g') LIKE ${compactPattern}
        ORDER BY score DESC, d.updated_at DESC NULLS LAST, d.id DESC
        LIMIT ${limit}
      `;

      const [titleRowsRaw, tagRowsRaw, contentRowsRaw] = await Promise.all([
        titlePromise,
        tagPromise,
        contentPromise,
      ]);

      return {
        titleRows: toSearchRows(titleRowsRaw),
        tagRows: toSearchRows(tagRowsRaw),
        contentRows: toSearchRows(contentRowsRaw),
      };
    });

    const titleRows = dbRows?.titleRows ?? [];
    const tagRows = dbRows?.tagRows ?? [];
    const contentRows = dbRows?.contentRows ?? [];

    const contentMetaById = new Map<number, SectionMeta>();

    const enrichedContentRows: SearchRow[] = contentRows.map((row) => {
      const next: SearchRow = {
        ...row,
        section_heading: null,
        section_dom_id: null,
        section_level: null,
        section_snippet: null,
        section_match_source: null,
      };

      const rawContent = typeof row.content === 'string' ? row.content : '';
      if (!rawContent) {
        contentMetaById.set(Number(next.id), {
          section_heading: null,
          section_dom_id: null,
          section_level: null,
          section_snippet: null,
          section_match_source: null,
        });
        return next;
      }

      try {
        const parsed = JSON.parse(rawContent) as Descendant[];
        const best = findBestSectionMatch(parsed, raw);
        const shouldSuppressSection = isTitleMatchedForSectionSuppression(next.title, raw);

        if (best && !shouldSuppressSection) {
          next.section_heading = best.sectionHeading || null;
          next.section_dom_id = best.sectionDomId || null;
          next.section_level = best.sectionLevel;
          next.section_snippet = best.sectionSnippet || null;
          next.section_match_source = best.sectionMatchSource;
        }
      } catch {
        // noop
      }

      contentMetaById.set(Number(next.id), {
        section_heading: next.section_heading ?? null,
        section_dom_id: next.section_dom_id ?? null,
        section_level: next.section_level ?? null,
        section_snippet: next.section_snippet ?? null,
        section_match_source: next.section_match_source ?? null,
      });

      return next;
    });

    const matchedSectionRows = enrichedContentRows.filter(
      (row) => !!String(row.section_dom_id ?? '').trim(),
    );

    const headingMatchedSectionRows = matchedSectionRows.filter(
      (row) => row.section_match_source === 'heading',
    );

    const bodyMatchedSectionRows = matchedSectionRows.filter(
      (row) => row.section_match_source === 'body',
    );

    const seen = new Set<number>();
    const merged: SearchRow[] = [];

    const withSectionMeta = (row: SearchRow): SearchRow => {
      const meta = contentMetaById.get(Number(row.id));
      if (!meta) {
        return {
          ...row,
          section_heading: row.section_heading ?? null,
          section_dom_id: row.section_dom_id ?? null,
          section_level: row.section_level ?? null,
          section_snippet: row.section_snippet ?? null,
          section_match_source: row.section_match_source ?? null,
        };
      }

      return {
        ...row,
        section_heading: meta.section_heading ?? row.section_heading ?? null,
        section_dom_id: meta.section_dom_id ?? row.section_dom_id ?? null,
        section_level: meta.section_level ?? row.section_level ?? null,
        section_snippet: meta.section_snippet ?? row.section_snippet ?? null,
        section_match_source: meta.section_match_source ?? row.section_match_source ?? null,
      };
    };

    const pushUnique = (rows: SearchRow[]) => {
      for (const row of rows) {
        const id = Number(row.id);
        if (seen.has(id)) continue;

        const enriched = withSectionMeta(row);
        const { content: _content, ...safeRow } = enriched;

        merged.push({
          ...safeRow,
          tags: parseTags(enriched.tags),
          category_breadcrumb: enriched.category_breadcrumb
            ? String(enriched.category_breadcrumb)
            : '',
        });

        seen.add(id);
        if (merged.length >= limit) break;
      }
    };

    pushUnique(titleRows);
    if (merged.length < limit) pushUnique(headingMatchedSectionRows);
    if (merged.length < limit) pushUnique(tagRows);
    if (merged.length < limit) pushUnique(bodyMatchedSectionRows);
    if (merged.length < limit) pushUnique(enrichedContentRows);

    return NextResponse.json(merged, {
      headers: {
        'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=120',
      },
    });
  } catch (err) {
    console.error('[search GET] unexpected error:', err);

    if (isTransientDbError(err)) {
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
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
