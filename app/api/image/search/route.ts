import { boundedInteger } from '@/wiki/lib/apiInput';
// =============================================
// File: app/api/image/search/route.ts
// =============================================
/**
 * 이미지 검색
 * - GET 쿼리
 *   - q: 검색어(부분 일치, 대소문자 무시)
 *   - limit: 1~500 (기본 200)
 * - q가 비어 있으면 빈 배열 반환 -> 불필요한 풀스캔 방지
 * - 응답은 캐시 금지
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/wiki/lib/db';

export const revalidate = 0;
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    // 검색어/limit 파싱
    const q = (searchParams.get('q') ?? '').trim();
    const limit = boundedInteger(searchParams.get('limit'), 200, 1, 500);

    // 검색어가 비어 있으면 바로 종료
    if (!q) {
      return NextResponse.json([], { headers: { 'Cache-Control': 'no-store' } });
    }

    // 부분 일치(ILIKE) 검색
    const pattern = `%${q}%`;
    const rows = await sql`
      SELECT id, name, url, folder_id
      FROM images
      WHERE name ILIKE ${pattern}
      ORDER BY id DESC
      LIMIT ${limit}
    `;

    return NextResponse.json(rows, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[image/search GET] unexpected error:', err);
    return NextResponse.json(
      { error: 'server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
