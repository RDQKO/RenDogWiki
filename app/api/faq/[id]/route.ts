// =============================================
// File: app/api/faq/[id]/route.ts
// 전체 교체용 코드
//
// - FAQ 단건 조회/수정/삭제
// - 단건 조회를 5분간 인스턴스 간 공유 캐시
// - 수정/삭제 직후 목록/상세/Home FAQ 캐시 즉시 무효화
// - 브라우저 응답은 no-store 유지
// =============================================

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  runDbRead,
  sql,
} from '@/wiki/lib/db';

import {
  cached,
  cacheKey,
  invalidate,
} from '@/wiki/lib/cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE_HEADERS = {
  'Cache-Control':
    'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
};

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

function normalizeTagsToCsv(
  tags: unknown,
): string | null {
  if (tags == null) {
    return null;
  }

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
    ).join(',');
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
    ).join(',');
  }

  return null;
}

function normalizeDate(
  value: unknown,
): string | undefined {
  if (value == null) {
    return undefined;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const text =
    String(value).trim();

  return text || undefined;
}

function normalizeFaqRow(
  row: any,
) {
  return {
    id: Number(row.id),
    title:
      String(
        row.title ?? '',
      ),
    content:
      String(
        row.content ?? '',
      ),
    tags:
      pgArrayToJs(
        row.tags,
      ),
    uploader:
      String(
        row.uploader ?? '',
      ),
    created_at:
      normalizeDate(
        row.created_at,
      ),
    updated_at:
      normalizeDate(
        row.updated_at,
      ),
  };
}

async function readFaqDetail(
  id: number,
) {
  const rows =
    await runDbRead(
      `faq:detail:${id}`,
      async () =>
        await sql`
          SELECT
            id,
            title,
            content,
            tags,
            uploader,
            created_at,
            updated_at
          FROM faq_questions
          WHERE id = ${id}
          LIMIT 1
        `,
      2,
      300,
    );

  const row =
    rows[0];

  return row
    ? normalizeFaqRow(row)
    : null;
}

export async function GET(
  _: NextRequest,
  {
    params,
  }: {
    params: {
      id: string;
    };
  },
) {
  try {
    const id =
      Number(params.id);

    if (
      !Number.isInteger(id) ||
      id <= 0
    ) {
      return NextResponse.json(
        {
          error: 'Invalid id',
        },
        {
          status: 400,
          headers:
            NO_STORE_HEADERS,
        },
      );
    }

    const data =
      await cached(
        cacheKey(
          'faq',
          'detail',
          'v2',
          id,
        ),
        {
          ttlSec: 300,
          tags: [
            'faq:detail',
            `faq:${id}`,
          ],
        },
        async () =>
          await readFaqDetail(
            id,
          ),
      );

    if (!data) {
      return new NextResponse(
        null,
        {
          status: 204,
          headers:
            NO_STORE_HEADERS,
        },
      );
    }

    return NextResponse.json(
      data,
      {
        headers:
          NO_STORE_HEADERS,
      },
    );
  } catch (error) {
    console.error(
      'FAQ 단건 조회 실패:',
      error,
    );

    return NextResponse.json(
      {
        error: 'Server error',
      },
      {
        status: 503,
        headers: {
          ...NO_STORE_HEADERS,
          'Retry-After': '1',
        },
      },
    );
  }
}

export async function PUT(
  request: NextRequest,
  {
    params,
  }: {
    params: {
      id: string;
    };
  },
) {
  try {
    const id =
      Number(params.id);

    if (
      !Number.isInteger(id) ||
      id <= 0
    ) {
      return NextResponse.json(
        {
          error: 'Invalid id',
        },
        {
          status: 400,
          headers:
            NO_STORE_HEADERS,
        },
      );
    }

    const body =
      await request.json();

    const title =
      body?.title != null
        ? String(
            body.title,
          ).trim()
        : null;

    const content =
      body?.content != null
        ? String(
            body.content,
          ).trim()
        : null;

    const tagsCsv =
      normalizeTagsToCsv(
        body?.tags,
      );

    const rows =
      await sql`
        UPDATE faq_questions
        SET
          title =
            COALESCE(
              ${title}::text,
              title
            ),
          content =
            COALESCE(
              ${content}::text,
              content
            ),
          tags =
            CASE
              WHEN
                ${tagsCsv}::text
                IS NULL
                THEN tags
              WHEN
                ${tagsCsv}::text = ''
                THEN
                  ARRAY[]::text[]
              ELSE
                string_to_array(
                  ${tagsCsv}::text,
                  ','
                )
            END,
          updated_at =
            CURRENT_TIMESTAMP
        WHERE id = ${id}
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
      rows[0];

    if (!row) {
      return NextResponse.json(
        {
          error: 'not found',
        },
        {
          status: 404,
          headers:
            NO_STORE_HEADERS,
        },
      );
    }

    invalidate(
      'faq:list',
      'faq:detail',
      `faq:${id}`,
      'home:faq',
    );

    return NextResponse.json(
      normalizeFaqRow(row),
      {
        headers:
          NO_STORE_HEADERS,
      },
    );
  } catch (error) {
    console.error(
      'FAQ 수정 실패:',
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

export async function DELETE(
  _: NextRequest,
  {
    params,
  }: {
    params: {
      id: string;
    };
  },
) {
  try {
    const id =
      Number(params.id);

    if (
      !Number.isInteger(id) ||
      id <= 0
    ) {
      return NextResponse.json(
        {
          error: 'Invalid id',
        },
        {
          status: 400,
          headers:
            NO_STORE_HEADERS,
        },
      );
    }

    await sql`
      DELETE FROM faq_questions
      WHERE id = ${id}
    `;

    invalidate(
      'faq:list',
      'faq:detail',
      `faq:${id}`,
      'home:faq',
    );

    return NextResponse.json(
      {
        ok: true,
      },
      {
        headers:
          NO_STORE_HEADERS,
      },
    );
  } catch (error) {
    console.error(
      'FAQ 삭제 실패:',
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
