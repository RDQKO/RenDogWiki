// =============================================
// 실제 적용 경로:
// app/api/search/commit/route.ts
//
// 전체 신규 파일
//
// 검색어를 입력한 뒤 문서, FAQ 또는 퀘스트 NPC를 실제로 선택했을 때만 집계.
// 같은 검색 세션 ID는 DB에서도 한 번만 반영된다.
// =============================================

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import { sql } from '@/wiki/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type SearchResultType =
  | 'document'
  | 'faq'
  | 'quest';

type CommitResultRow = {
  counted: boolean;
};

function noStoreHeaders() {
  return {
    'Cache-Control':
      'no-store, no-cache, must-revalidate, max-age=0',
  };
}

function normalizeKeyword(
  value: unknown
) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function createKeywordKey(
  keyword: string
) {
  return keyword
    .toLocaleLowerCase('ko-KR')
    .replace(/\s+/g, '');
}

function normalizeResultType(
  value: unknown
): SearchResultType | null {
  if (
    value === 'document' ||
    value === 'faq' ||
    value === 'quest'
  ) {
    return value;
  }

  return null;
}

function normalizeSessionId(
  value: unknown
) {
  const sessionId =
    String(value ?? '').trim();

  if (
    sessionId.length < 8 ||
    sessionId.length > 128 ||
    !/^[a-zA-Z0-9_-]+$/.test(
      sessionId
    )
  ) {
    return null;
  }

  return sessionId;
}

export async function POST(
  request: NextRequest
) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: 'invalid_json',
      },
      {
        status: 400,
        headers: noStoreHeaders(),
      }
    );
  }

  const payload =
    body && typeof body === 'object'
      ? body as Record<
          string,
          unknown
        >
      : {};

  const keyword =
    normalizeKeyword(payload.keyword);
  const keywordKey =
    createKeywordKey(keyword);
  const sessionId =
    normalizeSessionId(
      payload.sessionId
    );
  const resultType =
    normalizeResultType(
      payload.resultType
    );

  if (
    keywordKey.length < 2 ||
    !sessionId ||
    !resultType
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: 'invalid_payload',
      },
      {
        status: 400,
        headers: noStoreHeaders(),
      }
    );
  }

  const documentIncrement =
    resultType === 'document'
      ? 1
      : 0;
  const faqIncrement =
    resultType === 'faq'
      ? 1
      : 0;
  const questIncrement =
    resultType === 'quest'
      ? 1
      : 0;

  try {
    /*
     * 한 SQL 문장 안에서:
     * 1. 30일이 지난 중복 방지 세션 정리
     * 2. 검색 세션 최초 반영 여부 결정
     * 3. 누적 통계 증가
     * 4. 오늘 통계 증가
     *
     * 같은 session_id 요청이 재전송되어도
     * accepted가 비어 있으므로 통계는 다시 증가하지 않는다.
     */
    const rows =
      await sql<CommitResultRow[]>`
        WITH cleaned AS (
          DELETE FROM
            search_keyword_commits
          WHERE
            created_at <
              NOW() -
              INTERVAL '30 days'
        ),
        accepted AS (
          INSERT INTO
            search_keyword_commits (
              session_id,
              keyword_key,
              created_at
            )
          VALUES (
            ${sessionId},
            ${keywordKey},
            NOW()
          )
          ON CONFLICT (
            session_id
          )
          DO NOTHING
          RETURNING session_id
        ),
        total_upsert AS (
          INSERT INTO
            search_keyword_stats_total (
              keyword_key,
              keyword,
              searches,
              document_searches,
              faq_searches,
              quest_searches,
              updated_at
            )
          SELECT
            ${keywordKey},
            ${keyword},
            1,
            ${documentIncrement},
            ${faqIncrement},
            ${questIncrement},
            NOW()
          FROM accepted
          ON CONFLICT (
            keyword_key
          )
          DO UPDATE SET
            keyword =
              EXCLUDED.keyword,
            searches =
              search_keyword_stats_total.searches +
              1,
            document_searches =
              search_keyword_stats_total.document_searches +
              EXCLUDED.document_searches,
            faq_searches =
              search_keyword_stats_total.faq_searches +
              EXCLUDED.faq_searches,
            quest_searches =
              search_keyword_stats_total.quest_searches +
              EXCLUDED.quest_searches,
            updated_at = NOW()
          RETURNING keyword_key
        ),
        daily_upsert AS (
          INSERT INTO
            search_keyword_stats_daily (
              day,
              keyword_key,
              keyword,
              searches,
              document_searches,
              faq_searches,
              quest_searches,
              updated_at
            )
          SELECT
            CURRENT_DATE,
            ${keywordKey},
            ${keyword},
            1,
            ${documentIncrement},
            ${faqIncrement},
            ${questIncrement},
            NOW()
          FROM accepted
          ON CONFLICT (
            day,
            keyword_key
          )
          DO UPDATE SET
            keyword =
              EXCLUDED.keyword,
            searches =
              search_keyword_stats_daily.searches +
              1,
            document_searches =
              search_keyword_stats_daily.document_searches +
              EXCLUDED.document_searches,
            faq_searches =
              search_keyword_stats_daily.faq_searches +
              EXCLUDED.faq_searches,
            quest_searches =
              search_keyword_stats_daily.quest_searches +
              EXCLUDED.quest_searches,
            updated_at = NOW()
          RETURNING keyword_key
        )
        SELECT EXISTS (
          SELECT 1
          FROM accepted
        ) AS counted
      `;

    return NextResponse.json(
      {
        ok: true,
        counted:
          Boolean(rows[0]?.counted),
      },
      {
        headers: noStoreHeaders(),
      }
    );
  } catch (error) {
    console.error(
      '[search/commit] 검색어 집계 실패:',
      error
    );

    /*
     * 검색 이동은 클라이언트에서 이미 진행되므로
     * 통계 실패만 별도로 기록한다.
     */
    return NextResponse.json(
      {
        ok: false,
        error: 'server_error',
      },
      {
        status: 500,
        headers: noStoreHeaders(),
      }
    );
  }
}
