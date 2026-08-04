// =============================================
// File: app/api/faq/route.ts
// 전체 교체용 코드
//
// - FAQ 목록/검색/생성
// - 기존 제목/태그/본문 검색과 정렬 유지
// - 같은 검색 조건을 60초간 인스턴스 간 공유 캐시
// - FAQ 생성 직후 관련 공유 캐시 즉시 무효화
// =============================================

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  isTransientDbError,
  runDbRead,
  sql,
} from '@/wiki/lib/db';

import {
  cached,
  cacheKey,
  invalidate,
} from '@/wiki/lib/cache';

import {
  requireRole,
} from '@/app/wiki/lib/requireRole';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE_HEADERS = {
  'Cache-Control':
    'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
};

function compactSearchText(
  value: string,
) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .trim();
}

function normalizeSearchText(
  value: string,
) {
  return String(value ?? '')
    .toLowerCase()
    .trim();
}

function shouldUseTrgm(
  raw: string,
) {
  return (
    compactSearchText(raw)
      .length >= 3
  );
}

function shouldUseLooseRegex(
  raw: string,
) {
  return (
    compactSearchText(raw)
      .length >= 2
  );
}

function escapeRegexChar(
  character: string,
) {
  return character.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&',
  );
}

function makeLooseRegex(
  raw: string,
) {
  const compact =
    compactSearchText(raw);

  if (!compact) {
    return '';
  }

  return compact
    .split('')
    .map(escapeRegexChar)
    .join('.*');
}

function pgArrayToJs(
  input: unknown,
): string[] {
  if (Array.isArray(input)) {
    return input
      .map(String)
      .map((value) =>
        value.trim(),
      )
      .filter(Boolean);
  }

  if (
    typeof input !== 'string'
  ) {
    return [];
  }

  const source =
    input.trim();

  if (
    !source.startsWith('{') ||
    !source.endsWith('}')
  ) {
    return source
      ? [source]
      : [];
  }

  const inner =
    source.slice(1, -1);

  if (!inner) {
    return [];
  }

  const output: string[] = [];
  let current = '';
  let quoted = false;

  for (
    let index = 0;
    index < inner.length;
    index += 1
  ) {
    const character =
      inner[index];

    if (
      character === '"' &&
      inner[index - 1] !== '\\'
    ) {
      quoted = !quoted;
      continue;
    }

    if (
      character === ',' &&
      !quoted
    ) {
      output.push(
        current.replace(
          /\\"/g,
          '"',
        ),
      );

      current = '';
      continue;
    }

    current += character;
  }

  output.push(
    current.replace(
      /\\"/g,
      '"',
    ),
  );

  return output
    .map((value) =>
      value.trim(),
    )
    .filter(Boolean);
}

function normalizeTags(
  tags: unknown,
): string[] {
  if (Array.isArray(tags)) {
    return Array.from(
      new Set(
        tags
          .map(String)
          .map((value) =>
            value.trim(),
          )
          .filter(Boolean),
      ),
    );
  }

  if (
    typeof tags === 'string'
  ) {
    return Array.from(
      new Set(
        tags
          .split(',')
          .map((value) =>
            value.trim(),
          )
          .filter(Boolean),
      ),
    );
  }

  return [];
}

function normalizeTagFilter(
  raw: string,
) {
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((value) =>
          value.trim(),
        )
        .filter(Boolean),
    ),
  )
    .sort((a, b) =>
      a.localeCompare(
        b,
        'ko-KR',
      ),
    )
    .join(',');
}

async function readFaqList(
  q: string,
  tagsCsv: string,
  limit: number,
  offset: number,
) {
  const normalizedQ =
    normalizeSearchText(q);

  const compactQ =
    compactSearchText(q);

  const pattern =
    `%${q}%`;

  const compactPattern =
    `%${compactQ}%`;

  const useTrgm =
    shouldUseTrgm(q);

  const useLooseRegex =
    shouldUseLooseRegex(q);

  const looseRegex =
    makeLooseRegex(q);

  const [
    rows,
    totalRows,
  ] = await runDbRead(
    'faq:list',
    async () => {
      const rowsPromise =
        sql`
          SELECT
            f.id,
            f.title,
            f.content,
            f.tags,
            f.uploader,
            f.created_at,
            f.updated_at,
            CASE
              WHEN ${q} = ''
                THEN 999
              ELSE GREATEST(
                CASE
                  WHEN
                    LOWER(
                      COALESCE(
                        f.title,
                        ''
                      )
                    ) = ${normalizedQ}
                    THEN 100
                  WHEN
                    LOWER(
                      COALESCE(
                        f.title,
                        ''
                      )
                    ) LIKE
                      LOWER(${pattern})
                    THEN 80
                  WHEN
                    regexp_replace(
                      LOWER(
                        COALESCE(
                          f.title,
                          ''
                        )
                      ),
                      '\\s+',
                      '',
                      'g'
                    ) LIKE
                      ${compactPattern}
                    THEN 72
                  WHEN
                    ${useLooseRegex}
                    AND regexp_replace(
                      LOWER(
                        COALESCE(
                          f.title,
                          ''
                        )
                      ),
                      '\\s+',
                      '',
                      'g'
                    ) ~ ${looseRegex}
                    THEN 66
                  WHEN
                    LOWER(
                      COALESCE(
                        array_to_string(
                          f.tags,
                          ' '
                        ),
                        ''
                      )
                    ) LIKE
                      LOWER(${pattern})
                    THEN 60
                  WHEN
                    regexp_replace(
                      LOWER(
                        COALESCE(
                          array_to_string(
                            f.tags,
                            ' '
                          ),
                          ''
                        )
                      ),
                      '\\s+',
                      '',
                      'g'
                    ) LIKE
                      ${compactPattern}
                    THEN 54
                  WHEN
                    ${useLooseRegex}
                    AND regexp_replace(
                      LOWER(
                        COALESCE(
                          array_to_string(
                            f.tags,
                            ' '
                          ),
                          ''
                        )
                      ),
                      '\\s+',
                      '',
                      'g'
                    ) ~ ${looseRegex}
                    THEN 50
                  WHEN
                    LOWER(
                      COALESCE(
                        f.content,
                        ''
                      )
                    ) LIKE
                      LOWER(${pattern})
                    THEN 30
                  WHEN
                    regexp_replace(
                      LOWER(
                        COALESCE(
                          f.content,
                          ''
                        )
                      ),
                      '\\s+',
                      '',
                      'g'
                    ) LIKE
                      ${compactPattern}
                    THEN 28
                  ELSE 0
                END,
                CASE
                  WHEN ${useTrgm}
                    THEN GREATEST(
                      similarity(
                        LOWER(
                          COALESCE(
                            f.title,
                            ''
                          )
                        ),
                        ${normalizedQ}
                      ) * 60,
                      similarity(
                        LOWER(
                          COALESCE(
                            array_to_string(
                              f.tags,
                              ' '
                            ),
                            ''
                          )
                        ),
                        ${normalizedQ}
                      ) * 45
                    )
                  ELSE 0
                END
              )
            END AS score
          FROM faq_questions f
          WHERE
            (
              ${q} = ''
              OR LOWER(
                COALESCE(
                  f.title,
                  ''
                )
              ) LIKE
                LOWER(${pattern})
              OR regexp_replace(
                LOWER(
                  COALESCE(
                    f.title,
                    ''
                  )
                ),
                '\\s+',
                '',
                'g'
              ) LIKE
                ${compactPattern}
              OR (
                ${useLooseRegex}
                AND regexp_replace(
                  LOWER(
                    COALESCE(
                      f.title,
                      ''
                    )
                  ),
                  '\\s+',
                  '',
                  'g'
                ) ~ ${looseRegex}
              )
              OR LOWER(
                COALESCE(
                  array_to_string(
                    f.tags,
                    ' '
                  ),
                  ''
                )
              ) LIKE
                LOWER(${pattern})
              OR regexp_replace(
                LOWER(
                  COALESCE(
                    array_to_string(
                      f.tags,
                      ' '
                    ),
                    ''
                  )
                ),
                '\\s+',
                '',
                'g'
              ) LIKE
                ${compactPattern}
              OR (
                ${useLooseRegex}
                AND regexp_replace(
                  LOWER(
                    COALESCE(
                      array_to_string(
                        f.tags,
                        ' '
                      ),
                      ''
                    )
                  ),
                  '\\s+',
                  '',
                  'g'
                ) ~ ${looseRegex}
              )
              OR LOWER(
                COALESCE(
                  f.content,
                  ''
                )
              ) LIKE
                LOWER(${pattern})
              OR regexp_replace(
                LOWER(
                  COALESCE(
                    f.content,
                    ''
                  )
                ),
                '\\s+',
                '',
                'g'
              ) LIKE
                ${compactPattern}
              OR (
                ${useTrgm}
                AND (
                  similarity(
                    LOWER(
                      COALESCE(
                        f.title,
                        ''
                      )
                    ),
                    ${normalizedQ}
                  ) >= 0.2
                  OR similarity(
                    LOWER(
                      COALESCE(
                        array_to_string(
                          f.tags,
                          ' '
                        ),
                        ''
                      )
                    ),
                    ${normalizedQ}
                  ) >= 0.2
                )
              )
            )
            AND (
              ${tagsCsv} = ''
              OR EXISTS (
                SELECT 1
                FROM
                  unnest(
                    f.tags
                  ) AS tag
                JOIN
                  unnest(
                    string_to_array(
                      ${tagsCsv},
                      ','
                    )
                  ) AS input_tag
                  ON TRUE
                WHERE
                  REPLACE(
                    tag,
                    ' ',
                    ''
                  ) =
                  REPLACE(
                    TRIM(
                      input_tag
                    ),
                    ' ',
                    ''
                  )
              )
            )
          ORDER BY
            CASE
              WHEN ${q} = ''
                THEN f.created_at
            END DESC,
            score DESC,
            f.created_at DESC,
            f.id DESC
          LIMIT ${limit}
          OFFSET ${offset}
        `;

      const totalPromise =
        sql`
          SELECT
            COUNT(*) AS cnt
          FROM faq_questions f
          WHERE
            (
              ${q} = ''
              OR LOWER(
                COALESCE(
                  f.title,
                  ''
                )
              ) LIKE
                LOWER(${pattern})
              OR regexp_replace(
                LOWER(
                  COALESCE(
                    f.title,
                    ''
                  )
                ),
                '\\s+',
                '',
                'g'
              ) LIKE
                ${compactPattern}
              OR (
                ${useLooseRegex}
                AND regexp_replace(
                  LOWER(
                    COALESCE(
                      f.title,
                      ''
                    )
                  ),
                  '\\s+',
                  '',
                  'g'
                ) ~ ${looseRegex}
              )
              OR LOWER(
                COALESCE(
                  array_to_string(
                    f.tags,
                    ' '
                  ),
                  ''
                )
              ) LIKE
                LOWER(${pattern})
              OR regexp_replace(
                LOWER(
                  COALESCE(
                    array_to_string(
                      f.tags,
                      ' '
                    ),
                    ''
                  )
                ),
                '\\s+',
                '',
                'g'
              ) LIKE
                ${compactPattern}
              OR (
                ${useLooseRegex}
                AND regexp_replace(
                  LOWER(
                    COALESCE(
                      array_to_string(
                        f.tags,
                        ' '
                      ),
                      ''
                    )
                  ),
                  '\\s+',
                  '',
                  'g'
                ) ~ ${looseRegex}
              )
              OR LOWER(
                COALESCE(
                  f.content,
                  ''
                )
              ) LIKE
                LOWER(${pattern})
              OR regexp_replace(
                LOWER(
                  COALESCE(
                    f.content,
                    ''
                  )
                ),
                '\\s+',
                '',
                'g'
              ) LIKE
                ${compactPattern}
              OR (
                ${useTrgm}
                AND (
                  similarity(
                    LOWER(
                      COALESCE(
                        f.title,
                        ''
                      )
                    ),
                    ${normalizedQ}
                  ) >= 0.2
                  OR similarity(
                    LOWER(
                      COALESCE(
                        array_to_string(
                          f.tags,
                          ' '
                        ),
                        ''
                      )
                    ),
                    ${normalizedQ}
                  ) >= 0.2
                )
              )
            )
            AND (
              ${tagsCsv} = ''
              OR EXISTS (
                SELECT 1
                FROM
                  unnest(
                    f.tags
                  ) AS tag
                JOIN
                  unnest(
                    string_to_array(
                      ${tagsCsv},
                      ','
                    )
                  ) AS input_tag
                  ON TRUE
                WHERE
                  REPLACE(
                    tag,
                    ' ',
                    ''
                  ) =
                  REPLACE(
                    TRIM(
                      input_tag
                    ),
                    ' ',
                    ''
                  )
              )
            )
        `;

      return await Promise.all([
        rowsPromise,
        totalPromise,
      ]);
    },
  );

  return {
    items:
      (rows ?? []).map(
        (row: any) => ({
          id: row.id,
          title: row.title,
          content: row.content,
          tags:
            pgArrayToJs(
              row.tags,
            ),
          uploader:
            row.uploader,
          created_at:
            row.created_at,
          updated_at:
            row.updated_at,
        }),
      ),
    total:
      Number(
        totalRows?.[0]?.cnt ??
          0,
      ),
  };
}

export async function GET(
  request: NextRequest,
) {
  try {
    const searchParams =
      request.nextUrl
        .searchParams;

    const q =
      (
        searchParams.get('q') ??
        ''
      ).trim();

    const tagsCsv =
      normalizeTagFilter(
        (
          searchParams.get(
            'tags',
          ) ?? ''
        ).trim(),
      );

    const limit =
      Math.max(
        1,
        Math.min(
          100,
          Number(
            searchParams.get(
              'limit',
            ) ?? 20,
          ),
        ),
      );

    const offset =
      Math.max(
        0,
        Number(
          searchParams.get(
            'offset',
          ) ?? 0,
        ),
      );

    const data =
      await cached(
        cacheKey(
          'faq',
          'list',
          'v2',
          normalizeSearchText(q),
          tagsCsv,
          limit,
          offset,
        ),
        {
          ttlSec: 60,
          tags: [
            'faq:list',
          ],
        },
        async () =>
          await readFaqList(
            q,
            tagsCsv,
            limit,
            offset,
          ),
      );

    return NextResponse.json(
      data,
      {
        headers:
          NO_STORE_HEADERS,
      },
    );
  } catch (error) {
    console.error(
      'FAQ 목록 실패:',
      error,
    );

    if (
      isTransientDbError(
        error,
      )
    ) {
      return NextResponse.json(
        {
          items: [],
          total: 0,
          degraded: true,
        },
        {
          status: 200,
          headers: {
            ...NO_STORE_HEADERS,
            'X-FAQ-Degraded': '1',
          },
        },
      );
    }

    return NextResponse.json(
      {
        error: 'Server error',
      },
      {
        status: 500,
        headers:
          NO_STORE_HEADERS,
      },
    );
  }
}

export async function POST(
  request: Request,
) {
  const gate =
    await requireRole([
      'writer',
      'admin',
    ]);

  if (!gate.ok) {
    return new Response(
      JSON.stringify({
        error:
          gate.error,
      }),
      {
        status:
          gate.status,
        headers: {
          'content-type':
            'application/json',
        },
      },
    );
  }

  const uploader =
    gate.dbUser.minecraft_name ||
    gate.dbUser.username ||
    'unknown';

  try {
    const body =
      await request.json();

    const title =
      String(
        body?.title ?? '',
      ).trim();

    const content =
      String(
        body?.content ?? '',
      ).trim();

    const tagsCsv =
      normalizeTags(
        body?.tags,
      ).join(',');

    if (
      !title ||
      !content
    ) {
      return NextResponse.json(
        {
          error:
            'Missing title/content',
        },
        {
          status: 400,
          headers:
            NO_STORE_HEADERS,
        },
      );
    }

    const rows =
      await sql`
        INSERT INTO faq_questions (
          title,
          content,
          tags,
          uploader
        )
        VALUES (
          ${title},
          ${content},
          string_to_array(
            ${tagsCsv},
            ','
          ),
          ${uploader}
        )
        RETURNING
          id,
          title,
          content,
          tags,
          uploader,
          created_at,
          updated_at
      `;

    const row =
      rows[0] as any;

    invalidate(
      'faq:list',
      'faq:detail',
      'home:faq',
    );

    return NextResponse.json(
      {
        id: row.id,
        title: row.title,
        content:
          row.content,
        tags:
          pgArrayToJs(
            row.tags,
          ),
        uploader:
          row.uploader,
        created_at:
          row.created_at,
        updated_at:
          row.updated_at,
      },
      {
        status: 201,
        headers:
          NO_STORE_HEADERS,
      },
    );
  } catch (error) {
    console.error(
      'FAQ 생성 실패:',
      error,
    );

    return NextResponse.json(
      {
        error: 'Server error',
      },
      {
        status: 500,
        headers:
          NO_STORE_HEADERS,
      },
    );
  }
}
