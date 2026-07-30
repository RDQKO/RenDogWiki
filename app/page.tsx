// =============================================
// File: app/page.tsx
// 전체 코드
//
// - 루트 경로(/)에서 RDWIKI Home 페이지 렌더
// - 최근 업데이트 문서와 대표 카테고리 링크 병렬 조회
// - 인기 문서는 HomePage에서 별도 API로 조회
// =============================================

import HomePage from '@/components/home/HomePage';
import {
  getHomeCategoryLinks,
  getRecentHomeDocuments,
} from '@/components/home/homeData';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [
    recentDocuments,
    categoryLinks,
  ] = await Promise.all([
    getRecentHomeDocuments(5),
    getHomeCategoryLinks(),
  ]);

  return (
    <HomePage
      recentDocuments={recentDocuments}
      categoryLinks={categoryLinks}
    />
  );
}