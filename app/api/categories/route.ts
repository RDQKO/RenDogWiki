/**
 * 카테고리 전체 조회/생성 API
 *
 * 전체 교체용 코드
 *
 * - 일반 조회는 10분 공유 Data Cache 사용
 * - 관리 페이지의 ?ts=... 또는 ?fresh=1 요청은 DB 최신값 직접 조회
 * - 응답 자체는 no-store
 * - 생성 직후 활동 로그보다 먼저 관련 캐시 무효화
 */

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  sql,
} from '@/wiki/lib/db';

import {
  logActivity,
  resolveCategoryName,
} from '@wiki/lib/activity';

import {
  cached,
  cacheKey,
  invalidate,
} from '@wiki/lib/cache';

import {
  requireRole,
} from '@/app/wiki/lib/requireRole';

export const runtime = 'nodejs';

/*
 * NextRequest URL을 읽는 동적 GET이고 응답은 no-store입니다.
 * force-dynamic/revalidate=0은 내부 공유 Data Cache까지 끄므로 사용하지 않습니다.
 */

const NO_STORE_HEADERS = {
  'Cache-Control':
    'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
};

function toNullableInt(
  value: unknown,
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const numberValue =
    Number(value);

  return Number.isFinite(
    numberValue,
  )
    ? Math.trunc(
        numberValue,
      )
    : null;
}

function parseModes(
  value: string | null,
): string[] {
  if (!value) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .split(',')
        .map((mode) =>
          mode
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    ),
  );
}

export async function GET(
  request: NextRequest,
) {
  try {
    const searchParams =
      request.nextUrl
        .searchParams;

    const modes =
      parseModes(
        searchParams.get(
          'modes',
        ),
      );

    /*
     * 관리 페이지는 기존부터 ts를 붙여 최신 조회를 요청합니다.
     * 이 요청만 Data Cache를 우회해 저장 직후 DB 값을 보장합니다.
     */
    const bypassCache =
      searchParams.has('ts') ||
      searchParams.get(
        'fresh',
      ) === '1';

    if (
      modes.length === 0
    ) {
      const rows =
        await cached(
          'category:all:v2',
          {
            ttlSec:
              bypassCache
                ? 0
                : 600,
            tags: [
              'category:list',
              'category:tree',
            ],
          },
          async () =>
            await sql`
              SELECT *
              FROM categories
              ORDER BY
                parent_id,
                "order"
            `,
        );

      return NextResponse.json(
        rows,
        {
          headers:
            NO_STORE_HEADERS,
        },
      );
    }

    const key =
      cacheKey(
        'category:tree',
        'v2',
        'modes',
        ...modes,
      );

    const rows =
      await cached(
        key,
        {
          ttlSec:
            bypassCache
              ? 0
              : 600,
          tags: [
            'category:tree',
            'category:list',
          ],
        },
        async () => {
          return await sql`
            WITH RECURSIVE roots AS (
              SELECT id
              FROM categories
              WHERE EXISTS (
                SELECT 1
                FROM unnest(
                  COALESCE(
                    mode_tags,
                    '{}'::text[]
                  )
                ) tag
                WHERE
                  tag = ANY(${modes})
              )
            ),
            tree AS (
              SELECT category.*
              FROM categories category
              JOIN roots
                ON roots.id =
                  category.id

              UNION ALL

              SELECT child.*
              FROM categories child
              JOIN tree parent
                ON child.parent_id =
                  parent.id
            )
            SELECT *
            FROM tree
            ORDER BY
              parent_id,
              "order"
          `;
        },
      );

    return NextResponse.json(
      rows,
      {
        headers:
          NO_STORE_HEADERS,
      },
    );
  } catch (error) {
    console.error(
      '[categories GET] unexpected error:',
      error,
    );

    return NextResponse.json(
      {
        error:
          '카테고리 목록을 가져오는 중 오류가 발생했습니다.',
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
  request: NextRequest,
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
          ...NO_STORE_HEADERS,
        },
      },
    );
  }

  try {
    const body =
      await request
        .json()
        .catch(() => null);

    const rawName =
      typeof body?.name ===
      'string'
        ? body.name
        : '';

    const name =
      rawName.trim();

    const parentId =
      toNullableInt(
        body?.parent_id,
      );

    const documentId =
      toNullableInt(
        body?.document_id,
      );

    const icon =
      typeof body?.icon ===
        'string' &&
      body.icon.trim() !== ''
        ? body.icon.trim()
        : null;

    const modeTags:
      string[] =
      Array.isArray(
        body?.mode_tags,
      )
        ? Array.from(
            new Set(
              body.mode_tags
                .map(
                  (
                    value:
                      unknown,
                  ) =>
                    typeof value ===
                    'string'
                      ? value
                          .trim()
                          .toLowerCase()
                      : '',
                )
                .filter(Boolean),
            ),
          )
        : [];

    if (!name) {
      return NextResponse.json(
        {
          error:
            'name is required',
        },
        {
          status: 400,
          headers:
            NO_STORE_HEADERS,
        },
      );
    }

    const orderRows =
      await sql`
        SELECT
          MAX("order")
            AS max_order
        FROM categories
        WHERE
          parent_id
          ${
            parentId === null
              ? sql`IS NULL`
              : sql`= ${parentId}`
          }
      ` as unknown as Array<{
        max_order:
          | number
          | string
          | null;
      }>;

    const maxOrder =
      orderRows[0]
        ?.max_order;

    const parsedMaxOrder =
      Number(maxOrder);

    const nextOrder =
      maxOrder !== null &&
      maxOrder !== undefined &&
      Number.isFinite(
        parsedMaxOrder,
      )
        ? parsedMaxOrder + 1
        : 0;

    const uploader =
      gate.dbUser
        .minecraft_name ??
      gate.dbUser.username;

    const insertRows =
      await sql`
        INSERT INTO categories (
          name,
          parent_id,
          "order",
          document_id,
          icon,
          mode_tags,
          uploader
        )
        VALUES (
          ${name},
          ${parentId},
          ${nextOrder},
          ${documentId},
          ${icon},
          ${modeTags},
          ${uploader}
        )
        RETURNING id
      ` as unknown as Array<{
        id:
          | number
          | string;
      }>;

    const newId =
      Number(
        insertRows[0]?.id,
      );

    /*
     * 데이터 반영 직후 먼저 무효화합니다.
     * 활동 로그가 늦거나 실패해도 새 카테고리가 이전 캐시에 가려지지 않습니다.
     *
     * doc:list도 함께 지워 홈 최근 문서의 카테고리 이름/경로를 갱신합니다.
     */
    invalidate(
      'category:list',
      'category:tree',
      'category:modes',
      'doc:list',
    );

    try {
      const parentLabel =
        await resolveCategoryName(
          parentId,
        );

      await logActivity({
        action:
          'category.create',
        username:
          uploader,
        targetType:
          'category',
        targetId:
          newId,
        targetName:
          name,
        targetPath:
          parentLabel,
        meta: {
          parent_id:
            parentId,
          order:
            nextOrder,
          document_id:
            documentId ??
            null,
          icon:
            icon ?? null,
          mode_tags:
            modeTags,
        },
      });
    } catch (logError) {
      console.error(
        '[categories POST] activity log failed:',
        logError,
      );
    }

    return NextResponse.json(
      {
        id: newId,
      },
      {
        headers:
          NO_STORE_HEADERS,
      },
    );
  } catch (error) {
    console.error(
      '[categories POST] unexpected error:',
      error,
    );

    return NextResponse.json(
      {
        error:
          '카테고리 생성 중 오류가 발생했습니다.',
      },
      {
        status: 500,
        headers:
          NO_STORE_HEADERS,
      },
    );
  }
}
