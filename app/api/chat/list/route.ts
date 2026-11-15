import { boundedInteger } from '@/wiki/lib/apiInput';
// =============================================
// File: app/api/chat/list/route.ts
// =============================================
/**
 * 채팅 메시지 목록 조회
 * - GET 쿼리
 *   - limit: 1~200 (기본 100)
 *   - before_id: 해당 id 미만의 과거 메시지
 *   - after_id: 해당 id 초과의 최신 메시지 (둘 다 오면 before 우선)
 * - 응답 정렬
 *   - 클라이언트는 오름차순을 기대 -> after 모드가 아니면 서버에서 역순 뒤집어서 반환
 * - 사용자 정보
 *   - 표시 이름: minecraft_name -> 없으면 username
 *   - 아바타: Minotar 헬름(닉네임 기반)
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/wiki/lib/db';
import { getAuthUser } from '@/wiki/lib/auth';

type Row = {
  id: number | string;
  user_id: number | string;
  text: string;
  reply_to_id: number | string | null;
  liked_by: number[] | null;
  disliked_by: number[] | null;
  created_at: string;
  mc_name: string | null;
  reply_user_id: number | string | null;
  username?: string | null;
};

export async function GET(req: NextRequest) {
  try {
    const me = await getAuthUser();
    const { searchParams } = new URL(req.url);

    // limit -> 숫자 아니면 기본 100, 1~200로 클램프
    const limit = boundedInteger(searchParams.get('limit'), 100, 1, 200);

    // 커서 파라미터
    const beforeIdStr = searchParams.get('before_id');
    const afterIdStr = searchParams.get('after_id');

    const beforeId = beforeIdStr != null ? Number(beforeIdStr) : null;
    const afterId = afterIdStr != null ? Number(afterIdStr) : null;

    const hasBefore = beforeId != null && Number.isFinite(beforeId);
    // 둘 다 오면 before 우선 -> hasAfter는 hasBefore가 아닐 때만 true
    const hasAfter = !hasBefore && afterId != null && Number.isFinite(afterId);

    // WHERE/ORDER 절 합성
    const cursorSql =
      hasBefore ? sql`AND m.id < ${beforeId}` :
      hasAfter  ? sql`AND m.id > ${afterId}`  :
                  sql``;

    const orderSql = hasAfter ? sql`ORDER BY m.id ASC` : sql`ORDER BY m.id DESC`;

    const rows = (await sql`
      SELECT
        m.id,
        m.user_id,
        m.text,
        m.reply_to_id,
        COALESCE(m.liked_by, '{}'::int[])     AS liked_by,
        COALESCE(m.disliked_by, '{}'::int[])  AS disliked_by,
        m.created_at,
        COALESCE(u.minecraft_name, u.username) AS mc_name,
        r.user_id AS reply_user_id
      FROM chat_messages m
      LEFT JOIN users u ON u.id = m.user_id
      LEFT JOIN chat_messages r ON r.id = m.reply_to_id
      WHERE m.deleted_at IS NULL
      ${cursorSql}
      ${orderSql}
      LIMIT ${limit};
    `) as unknown as Row[];

    const meId = me?.id ?? null;

    // after 모드(ASC)면 그대로, 아니면 ASC로 뒤집어서 반환 -> 클라 일관성
    const rowsAsc = hasAfter ? rows : rows.slice().reverse();

    const messages = rowsAsc.map((r) => {
      const id = Number(r.id);
      const userId = Number(r.user_id);
      const liked = Array.isArray(r.liked_by) ? r.liked_by : [];
      const disliked = Array.isArray(r.disliked_by) ? r.disliked_by : [];
      const name = r.mc_name ?? `user#${userId}`;

      // 닉네임 기반 아바타(40px) -> Minotar
      const avatar_url = name
        ? `https://minotar.net/helm/${encodeURIComponent(name)}/40.png`
        : null;

      const replyUserId = r.reply_user_id == null ? null : Number(r.reply_user_id);

      return {
        id,
        user: { id: userId, name, avatar_url },
        text: r.text,
        reply_to_id: r.reply_to_id == null ? null : Number(r.reply_to_id),
        like_count: liked.length,
        dislike_count: disliked.length,
        i_liked: !!(me && liked.includes(me.id)),
        i_disliked: !!(me && disliked.includes(me.id)),
        created_at: r.created_at,
        reply_to_me: !!(meId && replyUserId && replyUserId === meId),
      };
    });

    return NextResponse.json(
      { me_id: meId, messages },
      { headers: { 'Cache-Control': 'no-store', 'X-App-Cache': 'OFF' } }
    );
  } catch (e: any) {
    console.error('/api/chat/list error:', e);
    return NextResponse.json(
      { error: 'list-failed', detail: String(e?.message || e) },
      { status: 500, headers: { 'Cache-Control': 'no-store', 'X-App-Cache': 'OFF' } }
    );
  }
}
