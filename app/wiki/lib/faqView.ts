// =============================================
// File: app/wiki/lib/faqView.ts
// 전체 신규 파일
//
// 일반 문서 조회수와 같은 방식으로 FAQ 열람을 기록한다.
// 실제 중복 방지와 일간/누적 집계는 서버 API가 담당한다.
// =============================================

export type FaqViewSource =
  | 'list'
  | 'search'
  | 'home'
  | 'other';

const ALLOWED_SOURCES = new Set<FaqViewSource>([
  'list',
  'search',
  'home',
  'other',
]);

function normalizeSource(
  source: FaqViewSource
): FaqViewSource {
  return ALLOWED_SOURCES.has(source)
    ? source
    : 'other';
}

export async function recordFaqView(
  faqId: number,
  source: FaqViewSource = 'other'
): Promise<void> {
  if (
    !Number.isInteger(faqId) ||
    faqId <= 0
  ) {
    return;
  }

  try {
    await fetch('/api/faq/view', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        faqId,
        source: normalizeSource(source),
      }),
      cache: 'no-store',
      keepalive: true,
    });
  } catch {
    /*
     * 조회수 기록은 부가 기능이다.
     * 기록 실패가 FAQ 상세 열람을 막으면 안 된다.
     */
  }
}
