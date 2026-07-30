// =============================================
// File: app/components/home/homeData.ts
// 전체 교체용 코드
//
// 카테고리 대표 문서 연결은 기존 CategoryTree와 동일한 방식:
// 1. /api/bootstrap과 동일한 categories/documents 데이터를 조회
// 2. buildCategoryTree로 동일한 카테고리 트리를 구성
// 3. CategoryTree와 동일한 mode_tags 상속 필터 적용
// 4. 카테고리의 document_id를 그대로 대표 문서 ID로 사용
// 5. allDocuments 전체에서 대표 문서 메타를 찾음
//    (is_featured 문서도 제외하지 않음)
// 6. 대표 문서가 없을 때 임의의 첫 문서로 대체하지 않음
// 7. 최근 7일 조회수 기준 인기 문서 제공
// =============================================

import 'server-only';

import { cached } from '@/wiki/lib/cache';
import { runDbRead, sql } from '@/wiki/lib/db';
import { buildCategoryTree } from '@/wiki/lib/buildCategoryTree';

export type HomeRecentDocument = {
  id: number;
  title: string;
  category: string;
  href: string;
  updatedAt: string;
  updatedLabel: string;
};

export type HomePopularDocument = {
  id: number;
  title: string;
  category: string;
  href: string;
  views: number;
};

export type HomeCategoryKey =
  | 'content'
  | 'system'
  | 'price'
  | 'policy';

export type HomeCategoryLink = {
  key: HomeCategoryKey;
  title: string;
  href: string;
  categoryId: number | null;
  documentId: number | null;
};

type RecentDocumentRow = {
  id: number | string;
  title: string;
  path: string | number | null;
  updated_at: string | Date | null;
  category_name: string | null;
};

type PopularDocumentRow = {
  id: number | string;
  title: string;
  path: string | number | null;
  category_name: string | null;
  views: number | string | bigint;
};

type BootstrapCategoryRow = {
  id: number | string;
  name: string;
  parent_id: number | string | null;
  order: number | string | null;
  document_id: number | string | null;
  icon?: string | null;
  mode_tags?: string[] | null;
};

type BootstrapDocumentRow = {
  id: number | string;
  title: string;
  path: string | number | null;
  icon?: string | null;
  is_featured?: boolean | null;
  special?: string | null;
  order?: number | string | null;
  updated_at?: string | Date | null;
};

type CategoryNode = {
  id: number;
  name: string;
  parent_id: number | null;
  order: number;
  document_id?: number | null;
  icon?: string | null;
  mode_tags?: string[] | null;
  children?: CategoryNode[];
};

type BootstrapDocument = {
  id: number;
  title: string;
  path: string | number | null;
  icon?: string | null;
  is_featured: boolean;
  special?: string | null;
  order: number;
  updated_at?: string | Date | null;
};

const HOME_MODE = 'RPG';
const LEGACY_HOME_DOCUMENT_ID = 73;

const HOME_CATEGORY_DEFINITIONS: ReadonlyArray<{
  key: HomeCategoryKey;
  title: string;
}> = [
  {
    key: 'content',
    title: '컨텐츠',
  },
  {
    key: 'system',
    title: '시스템',
  },
  {
    key: 'price',
    title: '시세표',
  },
  {
    key: 'policy',
    title: '법전',
  },
];

const homeDateFormatter =
  new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
  });

function normalizeDate(
  value: string | Date | null
) {
  if (!value) {
    return null;
  }

  const date =
    value instanceof Date
      ? value
      : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function formatDateLabel(date: Date) {
  const parts =
    homeDateFormatter.formatToParts(date);

  const month =
    parts.find(
      (part) => part.type === 'month'
    )?.value ?? '--';

  const day =
    parts.find(
      (part) => part.type === 'day'
    )?.value ?? '--';

  return `${month}.${day}`;
}

function toPositiveInteger(
  value: unknown
): number | null {
  const parsed = Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed <= 0
  ) {
    return null;
  }

  return parsed;
}

function toFiniteNumber(
  value: unknown,
  fallback = 0
) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function createWikiDocumentHref(
  documentId: number,
  categoryId: number,
  documentTitle: string
) {
  const searchParams =
    new URLSearchParams({
      id: String(documentId),
      path: String(categoryId),
      title: documentTitle,
      mode: HOME_MODE,
    });

  return `/wiki?${searchParams.toString()}`;
}

function createRecentDocumentHref(
  documentId: number,
  path: string | number | null,
  documentTitle: string
) {
  const searchParams =
    new URLSearchParams({
      id: String(documentId),
      path: String(path ?? 0),
      title: documentTitle,
      mode: HOME_MODE,
    });

  return `/wiki?${searchParams.toString()}`;
}

function createEmptyCategoryLinks(): HomeCategoryLink[] {
  return HOME_CATEGORY_DEFINITIONS.map(
    (definition) => ({
      key: definition.key,
      title: definition.title,
      href: '/wiki',
      categoryId: null,
      documentId: null,
    })
  );
}

/**
 * CategoryTree.tsx의 filterTreeByMode와 같은 규칙.
 *
 * - 부모가 현재 모드에 포함되면 하위 카테고리도 포함
 * - 본인이 현재 모드 태그를 가지면 포함
 * - 포함되는 자식이 있으면 부모도 경로 유지를 위해 포함
 */
function filterTreeByMode(
  nodes: CategoryNode[],
  mode: string,
  parentIncluded = false
): CategoryNode[] {
  const modeLower = String(mode)
    .trim()
    .toLowerCase();

  const output: CategoryNode[] = [];

  for (const node of nodes) {
    const ownTags =
      Array.isArray(node.mode_tags)
        ? node.mode_tags
        : [];

    const ownIncluded =
      parentIncluded ||
      ownTags.some(
        (tag) =>
          String(tag)
            .trim()
            .toLowerCase() ===
          modeLower
      );

    const nextChildren =
      node.children?.length
        ? filterTreeByMode(
            node.children,
            mode,
            ownIncluded
          )
        : [];

    if (
      ownIncluded ||
      nextChildren.length > 0
    ) {
      output.push({
        ...node,
        children: nextChildren,
      });
    }
  }

  return output;
}

function findCategoryByName(
  nodes: CategoryNode[],
  exactName: string
): CategoryNode | null {
  for (const node of nodes) {
    if (
      String(node.name).trim() ===
      exactName
    ) {
      return node;
    }

    if (node.children?.length) {
      const childMatch =
        findCategoryByName(
          node.children,
          exactName
        );

      if (childMatch) {
        return childMatch;
      }
    }
  }

  return null;
}

function normalizeBootstrapDocuments(
  rows: BootstrapDocumentRow[]
): BootstrapDocument[] {
  return rows
    .map(
      (
        row
      ): BootstrapDocument | null => {
        const id =
          toPositiveInteger(row.id);

        const title = String(
          row.title ?? ''
        ).trim();

        if (!id || !title) {
          return null;
        }

        return {
          id,
          title,
          path: row.path,
          icon: row.icon ?? null,
          is_featured:
            Boolean(row.is_featured),
          special:
            row.special ?? null,
          order:
            toFiniteNumber(
              row.order,
              0
            ),
          updated_at:
            row.updated_at ?? null,
        };
      }
    )
    .filter(
      (
        document
      ): document is BootstrapDocument =>
        document !== null
    );
}

export async function getRecentHomeDocuments(
  requestedLimit = 4
): Promise<HomeRecentDocument[]> {
  const limit = Math.min(
    Math.max(
      Math.trunc(requestedLimit),
      1
    ),
    10
  );

  try {
    return await cached(
      `home:recent-documents:${limit}`,
      {
        ttlSec: 60,
        tags: ['doc:list'],
      },
      async () => {
        const rows = (await runDbRead(
          'home:recent-documents',
          async () => {
            return await sql`
              SELECT
                d.id,
                d.title,
                d.path,
                d.updated_at,
                COALESCE(
                  c.name,
                  '문서'
                ) AS category_name
              FROM documents d
              LEFT JOIN categories c
                ON c.id::text =
                  d.path::text
              WHERE
                d.updated_at IS NOT NULL
              ORDER BY
                d.updated_at DESC,
                d.id DESC
              LIMIT ${limit}
            `;
          }
        )) as unknown as RecentDocumentRow[];

        return rows
          .map(
            (
              row
            ): HomeRecentDocument | null => {
              const id =
                toPositiveInteger(row.id);

              const updatedDate =
                normalizeDate(
                  row.updated_at
                );

              if (
                !id ||
                !row.title ||
                !updatedDate
              ) {
                return null;
              }

              return {
                id,
                title: row.title,
                category:
                  row.category_name ||
                  '문서',
                href:
                  createRecentDocumentHref(
                    id,
                    row.path,
                    row.title
                  ),
                updatedAt:
                  updatedDate.toISOString(),
                updatedLabel:
                  formatDateLabel(
                    updatedDate
                  ),
              };
            }
          )
          .filter(
            (
              document
            ): document is HomeRecentDocument =>
              document !== null
          );
      }
    );
  } catch (error) {
    console.error(
      '[home] 최근 업데이트 문서 조회 실패:',
      error
    );

    return [];
  }
}


/**
 * 최근 7일간 실제 문서 조회수 합계를 기준으로 인기 문서를 가져온다.
 *
 * 기존 /api/view/popular?range=week 로직과 같은 기간을 사용하되,
 * Home은 서버 컴포넌트이므로 내부 API를 다시 호출하지 않고
 * 문서/카테고리 메타까지 한 번의 DB 조회로 결합한다.
 */
export async function getPopularHomeDocuments(
  requestedLimit = 5
): Promise<HomePopularDocument[]> {
  const limit = Math.min(
    Math.max(
      Math.trunc(requestedLimit),
      1
    ),
    10
  );

  /*
   * 대표 문서와 73번을 제외한 뒤에도 limit만큼 남도록
   * 먼저 조회수 상위 후보를 넉넉하게 제한한다.
   */
  const candidateLimit = Math.min(
    Math.max(limit * 10, 30),
    100
  );

  try {
    return await cached(
      `home:popular-documents:week:${limit}:v4`,
      {
        ttlSec: 300,
        tags: ['doc:list'],
      },
      async () => {
        const rows = (await runDbRead(
          'home:popular-documents:week:v4',
          async () => {
            return await sql`
              WITH ranked_views AS (
                SELECT
                  document_id,
                  SUM(views)::bigint AS views
                FROM document_stats_daily
                WHERE
                  day >= (
                    CURRENT_DATE -
                    INTERVAL '6 days'
                  )
                GROUP BY document_id
                ORDER BY
                  views DESC
                LIMIT ${candidateLimit}
              )
              SELECT
                d.id,
                d.title,
                d.path,
                '문서'::text
                  AS category_name,
                ranked_views.views
              FROM ranked_views
              JOIN documents d
                ON d.id =
                  ranked_views.document_id
              WHERE
                d.id <>
                  ${LEGACY_HOME_DOCUMENT_ID}
                AND d.is_featured
                  IS NOT TRUE
              ORDER BY
                ranked_views.views DESC,
                d.updated_at DESC
                  NULLS LAST,
                d.id DESC
              LIMIT ${limit}
            `;
          },

          /*
           * 인기 문서는 부가 정보이므로 연결 실패 시 재시도 때문에
           * Home 전체 응답이 지연되지 않게 재시도를 하지 않는다.
           */
          0
        )) as unknown as PopularDocumentRow[];

        return rows
          .map(
            (
              row
            ): HomePopularDocument | null => {
              const id =
                toPositiveInteger(row.id);

              const title = String(
                row.title ?? ''
              ).trim();

              const views =
                toFiniteNumber(
                  row.views,
                  0
                );

              if (
                !id ||
                !title ||
                views <= 0
              ) {
                return null;
              }

              return {
                id,
                title,
                category:
                  row.category_name ||
                  '문서',
                href:
                  createRecentDocumentHref(
                    id,
                    row.path,
                    title
                  ),
                views,
              };
            }
          )
          .filter(
            (
              document
            ): document is HomePopularDocument =>
              document !== null
          );
      }
    );
  } catch (error) {
    console.error(
      '[home] 인기 문서 조회 실패:',
      error
    );

    return [];
  }
}

export async function getHomeCategoryLinks(): Promise<
  HomeCategoryLink[]
> {
  try {
    return await cached(
      'home:category-links:v6',
      {
        ttlSec: 60,
        tags: [
          'category:list',
          'category:tree',
          'doc:list',
        ],
      },
      async () => {
        /*
         * /api/bootstrap과 동일한 두 목록을 사용한다.
         * CategoryTree도 이 데이터로 대표 문서를 연다.
         */
        const [
          rawCategoryRows,
          rawDocumentRows,
        ] = await Promise.all([
          runDbRead(
            'home:category-links:categories:v6',
            async () => {
              return await sql`
                SELECT
                  id,
                  name,
                  parent_id,
                  "order",
                  document_id,
                  icon,
                  mode_tags
                FROM categories
                ORDER BY
                  parent_id,
                  "order"
              `;
            }
          ),
          runDbRead(
            'home:category-links:documents:v6',
            async () => {
              return await sql`
                SELECT
                  id,
                  title,
                  path,
                  icon,
                  is_featured,
                  special,
                  "order",
                  updated_at
                FROM documents
              `;
            }
          ),
        ]);

        const categoryRows =
          rawCategoryRows as unknown as BootstrapCategoryRow[];

        const documentRows =
          rawDocumentRows as unknown as BootstrapDocumentRow[];

        /*
         * buildCategoryTree는 각 원본 row를 spread하기 때문에
         * document_id와 mode_tags도 그대로 유지된다.
         */
        const completeTree =
          buildCategoryTree(
            categoryRows.map(
              (row) => ({
                ...row,
                id:
                  toFiniteNumber(
                    row.id
                  ),
                parent_id:
                  row.parent_id == null
                    ? null
                    : toFiniteNumber(
                        row.parent_id
                      ),
                order:
                  toFiniteNumber(
                    row.order,
                    0
                  ),
                document_id:
                  row.document_id == null
                    ? null
                    : toFiniteNumber(
                        row.document_id
                      ),

                /*
                 * buildCategoryTree의 Category 타입은
                 * icon?: string 이므로 DB의 null을 undefined로 정규화한다.
                 */
                icon:
                  row.icon ?? undefined,

                /*
                 * mode_tags 역시 null 대신 빈 배열로 정규화한다.
                 */
                mode_tags:
                  Array.isArray(
                    row.mode_tags
                  )
                    ? row.mode_tags
                    : [],
              })
            )
          ) as unknown as CategoryNode[];

        const visibleRpgTree =
          filterTreeByMode(
            completeTree,
            HOME_MODE
          );

        /*
         * 중요:
         * CategoryTree의 repFromList는 allDocuments 전체에서 찾는다.
         * 따라서 여기서도 is_featured 문서를 제외하면 안 된다.
         */
        const allDocuments =
          normalizeBootstrapDocuments(
            documentRows
          );

        return HOME_CATEGORY_DEFINITIONS.map(
          (definition) => {
            const category =
              findCategoryByName(
                visibleRpgTree,
                definition.title
              );

            if (!category) {
              console.error(
                `[home] RPG 카테고리를 찾지 못했습니다: ${definition.title}`
              );

              return {
                key: definition.key,
                title: definition.title,
                href: '/wiki',
                categoryId: null,
                documentId: null,
              };
            }

            const representativeId =
              toPositiveInteger(
                category.document_id
              );

            /*
             * 기존 CategoryTree는 document_id가 없으면
             * 첫 문서를 대신 열지 않고 트리만 펼친다.
             * Home에서도 임의 fallback을 만들지 않는다.
             */
            if (!representativeId) {
              console.error(
                `[home] 카테고리에 대표 문서가 없습니다: ${definition.title}`,
                {
                  categoryId:
                    category.id,
                }
              );

              return {
                key: definition.key,
                title: definition.title,
                href: '/wiki',
                categoryId:
                  category.id,
                documentId: null,
              };
            }

            /*
             * CategoryTree의
             * allDocuments.find(d => d.id === repId)
             * 와 동일한 조회.
             */
            const representative =
              allDocuments.find(
                (document) =>
                  document.id ===
                  representativeId
              ) ?? null;

            if (!representative) {
              console.error(
                `[home] 대표 문서 메타를 찾지 못했습니다: ${definition.title}`,
                {
                  categoryId:
                    category.id,
                  representativeId,
                }
              );

              return {
                key: definition.key,
                title: definition.title,
                href: '/wiki',
                categoryId:
                  category.id,
                documentId:
                  representativeId,
              };
            }

            return {
              key: definition.key,
              title: definition.title,
              href:
                createWikiDocumentHref(
                  representative.id,
                  category.id,
                  representative.title
                ),
              categoryId:
                category.id,
              documentId:
                representative.id,
            };
          }
        );
      }
    );
  } catch (error) {
    console.error(
      '[home] 대표 카테고리 연결 조회 실패:',
      error
    );

    return createEmptyCategoryLinks();
  }
}
