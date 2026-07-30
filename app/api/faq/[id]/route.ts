// =============================================
// File: app/api/faq/[id]/route.ts
// 전체 교체용 코드
//
// - FAQ 단건 조회/수정/삭제
// - 단건 GET은 최신 내용만 반환
// - 실제 조회수는 POST /api/faq/view에서 별도 기록
// - no-store / dynamic 유지
// =============================================

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import { sql } from '@/wiki/lib/db';

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
  input: unknown
): string[] {
  if (Array.isArray(input)) {
    return input as string[];
  }

  if (typeof input !== 'string') {
    return [];
  }

  const source = input.trim();

  if (
    !source.startsWith('{') ||
    !source.endsWith('}')
  ) {
    return source ? [source] : [];
  }

  const inner = source.slice(1, -1);

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
    const character = inner[index];

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
        current.replace(/\\"/g, '"')
      );
      current = '';
      continue;
    }

    current += character;
  }

  output.push(
    current.replace(/\\"/g, '"')
  );

  return output
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalizeTagsToCsv(
  tags: unknown
): string | null {
  if (tags == null) {
    return null;
  }

  if (Array.isArray(tags)) {
    return [
      ...new Set(
        tags
          .map(String)
          .map((value) => value.trim())
          .filter(Boolean)
      ),
    ].join(',');
  }

  if (typeof tags === 'string') {
    return [
      ...new Set(
        tags
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      ),
    ].join(',');
  }

  return null;
}

function normalizeFaqRow(row: any) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    tags: pgArrayToJs(row.tags),
    uploader: row.uploader,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function GET(
  _: NextRequest,
  {
    params,
  }: {
    params: {
      id: string;
    };
  }
) {
  try {
    const id = Number(params.id);

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
          headers: NO_STORE_HEADERS,
        }
      );
    }
    /*
     * 상세 조회와 조회수 기록을 분리한다.
     * 관리자 수정용 조회는 통계에 포함되지 않는다.
     */
    const rows = await sql`
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
    `;

    const row = rows[0];

    if (!row) {
      return new NextResponse(
        null,
        {
          status: 204,
          headers: NO_STORE_HEADERS,
        }
      );
    }

    return NextResponse.json(
      normalizeFaqRow(row),
      {
        headers: NO_STORE_HEADERS,
      }
    );
  } catch (error) {
    console.error(
      'FAQ 단건 조회 실패:',
      error
    );

    return NextResponse.json(
      {
        error: 'Server error',
      },
      {
        status: 500,
        headers: NO_STORE_HEADERS,
      }
    );
  }
}

export async function PUT(
  req: NextRequest,
  {
    params,
  }: {
    params: {
      id: string;
    };
  }
) {
  try {
    const id = Number(params.id);

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
          headers: NO_STORE_HEADERS,
        }
      );
    }

    const body = await req.json();

    const title =
      body?.title != null
        ? String(body.title).trim()
        : null;

    const content =
      body?.content != null
        ? String(body.content).trim()
        : null;

    const tagsCsv =
      normalizeTagsToCsv(body?.tags);

    const rows = await sql`
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
            WHEN ${tagsCsv}::text
              IS NULL
              THEN tags
            WHEN ${tagsCsv}::text = ''
              THEN ARRAY[]::text[]
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

    const row = rows[0];

    if (!row) {
      return NextResponse.json(
        {
          error: 'not found',
        },
        {
          status: 404,
          headers: NO_STORE_HEADERS,
        }
      );
    }

    return NextResponse.json(
      normalizeFaqRow(row),
      {
        headers: NO_STORE_HEADERS,
      }
    );
  } catch (error) {
    console.error(
      'FAQ 수정 실패:',
      error
    );

    return NextResponse.json(
      {
        error: 'Server error',
      },
      {
        status: 500,
        headers: NO_STORE_HEADERS,
      }
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
  }
) {
  try {
    const id = Number(params.id);

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
          headers: NO_STORE_HEADERS,
        }
      );
    }

    await sql`
      DELETE FROM faq_questions
      WHERE id = ${id}
    `;

    return NextResponse.json(
      {
        ok: true,
      },
      {
        headers: NO_STORE_HEADERS,
      }
    );
  } catch (error) {
    console.error(
      'FAQ 삭제 실패:',
      error
    );

    return NextResponse.json(
      {
        error: 'Server error',
      },
      {
        status: 500,
        headers: NO_STORE_HEADERS,
      }
    );
  }
}
