import { boundedInteger } from '@/wiki/lib/apiInput';
// =============================================
// File: app/api/chat/history/route.ts
// =============================================
/**
 * 채팅 메시지 히스토리 조회
 * - GET -> 최신 메시지부터 역순 페이징
 * - query -> limit(1~100, 기본 50), cursor(ISO 문자열, created_at 보다 과거)
 * - 로그인 상태에 따라 i_liked / i_disliked 계산(배열 ANY)
 * - 응답은 캐시 금지
 */

import { NextResponse } from 'next/server';
import { sql } from '@/wiki/lib/db';
import { getAuthUser } from '@/wiki/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    // limit -> 숫자 아니면 기본값 50, 1~100로 클램프
    const limit = boundedInteger(searchParams.get('limit'), 50, 1, 100);

    // cursor -> ISO 날짜 문자열만 허용(유효성 검사 실패 시 무시)
    const cursorRaw = searchParams.get('cursor');
    const cursor =
      cursorRaw && !Number.isNaN(Date.parse(cursorRaw)) ? cursorRaw : null;

    const me = await getAuthUser();
    const uid = me?.id ?? null;

    // 최신 메시지부터 가져오고, cursor가 있으면 그보다 과거만
    const rows = await sql/*sql*/`
      SELECT
        cm.id,
        cm.user_id,
        u.username AS name,
        NULL::text AS avatar_url,            -- users.avatar_url 사용 시 컬럼 맞춰서 변경
        cm.text,
        cm.reply_to_id,
        cardinality(cm.liked_by)    AS like_count,
        cardinality(cm.disliked_by) AS dislike_count,
        CASE WHEN ${uid}::int IS NULL THEN false ELSE ${uid} = ANY(cm.liked_by) END    AS i_liked,
        CASE WHEN ${uid}::int IS NULL THEN false ELSE ${uid} = ANY(cm.disliked_by) END AS i_disliked,
        cm.created_at
      FROM chat_messages cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.deleted_at IS NULL
        ${cursor ? sql`AND cm.created_at < ${cursor}` : sql``}
      ORDER BY cm.created_at DESC
      LIMIT ${limit}
    `;

    const items = (rows as any[]).map((r) => ({
      id: r.id,
      user: { id: r.user_id, name: r.name, avatar_url: r.avatar_url },
      text: r.text,
      reply_to_id: r.reply_to_id,
      like_count: r.like_count,
      dislike_count: r.dislike_count,
      i_liked: r.i_liked,
      i_disliked: r.i_disliked,
      created_at: r.created_at,
    }));

    const nextCursor = items.length ? items[items.length - 1].created_at : null;

    return NextResponse.json(
      { items, nextCursor },
      { headers: { 'Cache-Control': 'no-store', 'X-App-Cache': 'OFF' } }
    );
  } catch (err) {
    console.error('[chat/history GET] unexpected error:', err);
    return NextResponse.json(
      { error: '메시지 조회 중 오류가 발생했습니다.' },
      { status: 500, headers: { 'Cache-Control': 'no-store', 'X-App-Cache': 'OFF' } }
    );
  }
}
