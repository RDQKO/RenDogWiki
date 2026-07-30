// =============================================
// 실제 적용 경로:
// app/wiki/lib/searchPopularity.ts
//
// 전체 신규 파일
//
// 검색 결과에서 문서, FAQ 또는 퀘스트 NPC를 실제로 선택했을 때만
// 인기 검색어 집계 API를 호출한다.
// =============================================

export type SearchCommitResultType =
  | 'document'
  | 'faq'
  | 'quest';

export const SEARCH_QUERY_REQUEST_EVENT =
  'rdwiki:request-search-query';

type RecordCommittedSearchInput = {
  keyword: string;
  sessionId: string;
  resultType: SearchCommitResultType;
};

export function createSearchSessionId() {
  if (
    typeof globalThis.crypto !==
      'undefined' &&
    typeof globalThis.crypto.randomUUID ===
      'function'
  ) {
    return globalThis.crypto.randomUUID();
  }

  return [
    Date.now().toString(36),
    Math.random()
      .toString(36)
      .slice(2),
    Math.random()
      .toString(36)
      .slice(2),
  ].join('-');
}

export function requestSearchQuery(
  keyword: string
) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(
      SEARCH_QUERY_REQUEST_EVENT,
      {
        detail: {
          keyword,
        },
      }
    )
  );
}

export async function recordCommittedSearch({
  keyword,
  sessionId,
  resultType,
}: RecordCommittedSearchInput) {
  const normalizedKeyword =
    String(keyword ?? '')
      .replace(/\s+/g, ' ')
      .trim();

  if (
    normalizedKeyword.length < 2 ||
    normalizedKeyword.length > 80 ||
    !sessionId
  ) {
    return;
  }

  try {
    await fetch('/api/search/commit', {
      method: 'POST',
      headers: {
        'Content-Type':
          'application/json',
      },
      body: JSON.stringify({
        keyword: normalizedKeyword,
        sessionId,
        resultType,
      }),
      cache: 'no-store',

      /*
       * 문서 이동 직전 호출되어도 요청이 취소되지 않도록 한다.
       */
      keepalive: true,
    });
  } catch {
    /*
     * 인기 검색어 기록은 부가 기능이다.
     * 기록 실패가 문서 이동이나 FAQ 열람을 막으면 안 된다.
     */
  }
}
