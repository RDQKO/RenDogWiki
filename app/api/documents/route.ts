// app/api/documents/route.ts
// 문서 상세/목록/전체 조회 및 관리자 삭제 API
//
// 문서 본문 상세 조회는 항상 DB에서 최신 값을 읽는다.
// 목록/전체 문서 메타데이터 캐시는 기존대로 유지한다.

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  sql,
  runDbRead,
  isTransientDbError,
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
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const docTag = (id: number) => `doc:${id}`;
const listTag = (path: string | number) => `doclist:${String(path)}`;

const DELETE_PASSWORD =
  process.env.MANAGE_DELETE_PASSWORD ??
  '1290';

type DocumentRow = {
  id: number;
  title: string;
  path: string | number | null;
  icon?: string | null;
  tags?: string | null;
  created_at?: string;
  updated_at?: string;
  special?: string | null;
  is_featured?: boolean;
  order?: number | string | null;
  content?: unknown;
};

function toContentArray(
  raw: unknown,
): unknown[] {
  if (Array.isArray(raw)) {
    return raw;
  }

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);

      return Array.isArray(parsed)
        ? parsed
        : [];
    } catch {
      return [];
    }
  }

  return [];
}

function splitTags(
  raw: unknown,
): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map(String)
      .filter(Boolean);
  }

  if (
    raw === null ||
    raw === undefined ||
    raw === ''
  ) {
    return [];
  }

  return String(raw)
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function noStoreHeaders() {
  return {
    'Cache-Control':
      'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
  };
}

function transientDocUnavailable() {
  return NextResponse.json(
    {
      error:
        'Document DB temporarily unavailable',
      transient: true,
    },
    {
      status: 503,
      headers: noStoreHeaders(),
    },
  );
}

async function getDocumentByIdFresh(
  id: number,
) {
  const rows =
    (await runDbRead(
      'documents:getDocById',
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
      0,
    )) as unknown as DocumentRow[];

  const row = rows[0];

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    title: row.title,
    path: row.path,
    icon: row.icon,
    tags: splitTags(
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

export async function GET(
  req: NextRequest,
) {
  const searchParams =
    req.nextUrl.searchParams;

  /*
   * 문서 목록은 본문을 포함하지 않으므로 기존 캐시를 유지한다.
   */
  if (
    searchParams.get(
      'list',
    ) === '1'
  ) {
    try {
      const pathParam =
        (
          searchParams.get(
            'path',
          ) ?? '0'
        ).trim();

      const pathNorm =
        pathParam === ''
          ? '0'
          : pathParam;

      const data =
        await cached(
          cacheKey(
            'doclist',
            pathNorm,
          ),
          {
            ttlSec: 600,
            tags: [
              'doc:list',
              listTag(
                pathNorm,
              ),
            ],
          },
          async () => {
            let mainDocumentId:
              number | null =
              null;

            try {
              if (
                /^\d+$/.test(
                  pathNorm,
                )
              ) {
                const categoryRows =
                  (await runDbRead(
                    'documents:list:mainDocById',
                    async () => {
                      return await sql`
                        SELECT
                          document_id
                        FROM categories
                        WHERE id = ${Number(
                          pathNorm,
                        )}
                        LIMIT 1
                      `;
                    },
                  )) as unknown as Array<{
                    document_id:
                      number | null;
                  }>;

                mainDocumentId =
                  categoryRows?.[0]
                    ?.document_id ??
                  null;
              } else {
                const categoryRows =
                  (await runDbRead(
                    'documents:list:mainDocByName',
                    async () => {
                      return await sql`
                        SELECT
                          document_id
                        FROM categories
                        WHERE name = ${pathNorm}
                        LIMIT 1
                      `;
                    },
                  )) as unknown as Array<{
                    document_id:
                      number | null;
                  }>;

                mainDocumentId =
                  categoryRows?.[0]
                    ?.document_id ??
                  null;
              }
            } catch {
              mainDocumentId =
                null;
            }

            const rows =
              (await runDbRead(
                'documents:list:rows',
                async () => {
                  return await sql`
                    SELECT
                      id,
                      title,
                      path,
                      icon,
                      tags,
                      created_at,
                      updated_at,
                      is_featured,
                      special,
                      "order"
                    FROM documents
                    WHERE
                      path = ${pathNorm}
                      AND (
                        ${mainDocumentId}::int
                          IS NULL
                        OR id <> ${mainDocumentId}
                      )
                    ORDER BY
                      "order" ASC,
                      updated_at DESC,
                      id DESC
                  `;
                },
              )) as unknown as DocumentRow[];

            const items =
              rows.map(
                (row) => ({
                  id: row.id,
                  title:
                    row.title,
                  path: row.path,
                  icon: row.icon,
                  tags:
                    splitTags(
                      row.tags,
                    ),
                  created_at:
                    row.created_at,
                  updated_at:
                    row.updated_at,
                  special:
                    row.special ??
                    null,
                  is_featured:
                    Boolean(
                      row.is_featured,
                    ),
                  order:
                    Number(
                      row.order ??
                      0,
                    ),
                  is_main:
                    mainDocumentId !=
                      null &&
                    Number(
                      mainDocumentId,
                    ) ===
                      Number(
                        row.id,
                      ),
                }),
              );

            return {
              items,
              main_document_id:
                mainDocumentId,
            };
          },
        );

      return NextResponse.json(
        data,
        {
          headers: {
            'Cache-Control':
              'public, max-age=0, s-maxage=300, stale-while-revalidate=600',
          },
        },
      );
    } catch (error) {
      console.error(
        '[documents GET list] error:',
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
            main_document_id:
              null,
            degraded: true,
          },
          {
            status: 200,
            headers:
              noStoreHeaders(),
          },
        );
      }

      return NextResponse.json(
        {
          error:
            'Server error',
        },
        {
          status: 500,
          headers:
            noStoreHeaders(),
        },
      );
    }
  }

  const all =
    searchParams.get(
      'all',
    );

  const pathRaw =
    searchParams.get(
      'path',
    );

  const titleRaw =
    searchParams.get(
      'title',
    );

  const idRaw =
    searchParams.get(
      'id',
    );

  /*
   * 문서 본문 상세 조회:
   * - 서버 인스턴스 로컬 TTL 캐시 미사용
   * - CDN/브라우저 캐시 미사용
   */
  if (idRaw) {
    try {
      const id =
        Number(idRaw);

      if (
        !Number.isFinite(
          id,
        ) ||
        id <= 0
      ) {
        return NextResponse.json(
          {
            error:
              'Invalid id',
          },
          {
            status: 400,
            headers:
              noStoreHeaders(),
          },
        );
      }

      const data =
        await getDocumentByIdFresh(
          id,
        );

      if (!data) {
        return new NextResponse(
          null,
          {
            status: 204,
            headers:
              noStoreHeaders(),
          },
        );
      }

      return NextResponse.json(
        data,
        {
          headers:
            noStoreHeaders(),
        },
      );
    } catch (error) {
      console.error(
        '[documents GET by id] error:',
        error,
      );

      if (
        isTransientDbError(
          error,
        )
      ) {
        return transientDocUnavailable();
      }

      return NextResponse.json(
        {
          error:
            'Server error',
        },
        {
          status: 500,
          headers:
            noStoreHeaders(),
        },
      );
    }
  }

  /*
   * 전체 문서 메타데이터에는 본문이 없으므로 기존 캐시 유지.
   */
  if (all === '1') {
    try {
      const result =
        await cached(
          'doc:all',
          {
            ttlSec: 600,
            tags: [
              'doc:list',
            ],
          },
          async () => {
            const rows =
              (await runDbRead(
                'documents:all',
                async () => {
                  return await sql`
                    SELECT
                      id,
                      title,
                      path,
                      icon,
                      tags,
                      created_at,
                      updated_at,
                      is_featured,
                      special,
                      "order"
                    FROM documents
                  `;
                },
              )) as unknown as DocumentRow[];

            return rows.map(
              (row) => ({
                ...row,
                tags:
                  splitTags(
                    row.tags,
                  ),
                is_featured:
                  Boolean(
                    row.is_featured,
                  ),
                special:
                  row.special ??
                  null,
                order:
                  Number(
                    row.order ??
                    0,
                  ),
              }),
            );
          },
        );

      return NextResponse.json(
        result,
        {
          headers: {
            'Cache-Control':
              'public, max-age=0, s-maxage=300, stale-while-revalidate=600',
          },
        },
      );
    } catch (error) {
      console.error(
        '[documents GET all] error:',
        error,
      );

      if (
        isTransientDbError(
          error,
        )
      ) {
        return NextResponse.json(
          [],
          {
            status: 200,
            headers:
              noStoreHeaders(),
          },
        );
      }

      return NextResponse.json(
        {
          error:
            'Server error',
        },
        {
          status: 500,
          headers:
            noStoreHeaders(),
        },
      );
    }
  }

  const path =
    (
      pathRaw ?? ''
    ).trim();

  if (!path) {
    return NextResponse.json(
      {
        error:
          'Missing path',
      },
      {
        status: 400,
        headers:
          noStoreHeaders(),
      },
    );
  }

  try {
    const title =
      (
        titleRaw ?? ''
      ).trim();

    if (title) {
      const rows =
        (await runDbRead(
          'documents:getDocByPathTitle',
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
              WHERE
                d.path = ${path}
                AND d.title = ${title}
              LIMIT 1
            `;
          },
          0,
        )) as unknown as DocumentRow[];

      const row =
        rows[0];

      if (!row) {
        return new NextResponse(
          null,
          {
            status: 204,
            headers:
              noStoreHeaders(),
          },
        );
      }

      return NextResponse.json(
        {
          id: row.id,
          title:
            row.title,
          path: row.path,
          icon: row.icon,
          tags:
            splitTags(
              row.tags,
            ),
          created_at:
            row.created_at,
          updated_at:
            row.updated_at,
          special:
            row.special ??
            null,
          order:
            Number(
              row.order ??
              0,
            ),
          content:
            toContentArray(
              row.content ??
              [],
            ),
        },
        {
          headers:
            noStoreHeaders(),
        },
      );
    }

    const idRows =
      (await runDbRead(
        'documents:getIdByPath',
        async () => {
          return await sql`
            SELECT id
            FROM documents
            WHERE path = ${path}
            LIMIT 1
          `;
        },
        0,
      )) as unknown as Array<{
        id: number;
      }>;

    const documentId =
      idRows[0]?.id;

    if (!documentId) {
      return new NextResponse(
        null,
        {
          status: 204,
          headers:
            noStoreHeaders(),
        },
      );
    }

    const data =
      await getDocumentByIdFresh(
        Number(
          documentId,
        ),
      );

    if (!data) {
      return new NextResponse(
        null,
        {
          status: 204,
          headers:
            noStoreHeaders(),
        },
      );
    }

    return NextResponse.json(
      data,
      {
        headers:
          noStoreHeaders(),
      },
    );
  } catch (error) {
    console.error(
      '[documents GET by path/title] error:',
      error,
    );

    if (
      isTransientDbError(
        error,
      )
    ) {
      return transientDocUnavailable();
    }

    return NextResponse.json(
      {
        error:
          'Server error',
      },
      {
        status: 500,
        headers:
          noStoreHeaders(),
      },
    );
  }
}

export async function DELETE(
  req: NextRequest,
) {
  const gate =
    await requireRole([
      'admin',
    ]);

  if (!gate.ok) {
    return NextResponse.json(
      {
        error:
          gate.error,
      },
      {
        status:
          gate.status,
        headers:
          noStoreHeaders(),
      },
    );
  }

  if (
    req.headers.get(
      'x-rd-delete-password',
    ) !== DELETE_PASSWORD
  ) {
    return NextResponse.json(
      {
        error:
          '삭제 비밀번호가 올바르지 않습니다.',
      },
      {
        status: 403,
        headers:
          noStoreHeaders(),
      },
    );
  }

  const idRaw =
    req.nextUrl.searchParams.get(
      'id',
    );

  if (!idRaw) {
    return NextResponse.json(
      {
        error:
          'Missing id',
      },
      {
        status: 400,
        headers:
          noStoreHeaders(),
      },
    );
  }

  try {
    const id =
      Number(idRaw);

    if (
      !Number.isFinite(
        id,
      ) ||
      id <= 0
    ) {
      return NextResponse.json(
        {
          error:
            'Invalid id',
        },
        {
          status: 400,
          headers:
            noStoreHeaders(),
        },
      );
    }

    const beforeRows =
      (await sql`
        SELECT
          id,
          title,
          path,
          tags
        FROM documents
        WHERE id = ${id}
        LIMIT 1
      `) as unknown as DocumentRow[];

    const document =
      beforeRows[0];

    if (!document) {
      return NextResponse.json(
        {
          error:
            'not found',
        },
        {
          status: 404,
          headers:
            noStoreHeaders(),
        },
      );
    }

    await sql`
      DELETE FROM document_contents
      WHERE document_id = ${id}
    `;

    await sql`
      DELETE FROM documents
      WHERE id = ${id}
    `;

    invalidate(
      docTag(id),
      'doc:list',
      listTag(
        document.path ??
        '0',
      ),
    );

    const username =
      gate.dbUser.minecraft_name ||
      gate.dbUser.username ||
      'unknown';

    let targetPathLabel:
      string | null =
      null;

    const documentPath =
      document.path;

    if (
      documentPath === 0 ||
      documentPath === '0' ||
      documentPath == null
    ) {
      targetPathLabel =
        '루트 카테고리';
    } else if (
      /^\d+$/.test(
        String(
          documentPath,
        ),
      )
    ) {
      targetPathLabel =
        await resolveCategoryName(
          Number(
            documentPath,
          ),
        );
    } else {
      targetPathLabel =
        String(
          documentPath,
        );
    }

    await logActivity({
      action:
        'document.delete',
      username,
      targetType:
        'document',
      targetId: id,
      targetName:
        document.title ??
        null,
      targetPath:
        targetPathLabel,
      meta: {
        tags:
          document.tags ??
          null,
      },
    });

    return NextResponse.json(
      {
        message:
          'deleted',
      },
      {
        headers:
          noStoreHeaders(),
      },
    );
  } catch (error) {
    console.error(
      '[documents DELETE] error:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'Server error',
      },
      {
        status: 500,
        headers:
          noStoreHeaders(),
      },
    );
  }
}
