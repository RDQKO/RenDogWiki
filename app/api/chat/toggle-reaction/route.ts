// File: app/api/chat/toggle-reaction/route.ts
/**
 * 채팅 메시지 반응 토글
 * - POST body -> { message_id: number, type: 'like' | 'dislike' }
 * - 규칙 -> 같은 반응을 다시 누르면 해제, 다른 반응을 누르면 기존 반응 제거 후 새 반응 추가(상호배타)
 * - 배열 컬럼이 null이어도 동작하도록 COALESCE 처리
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/wiki/lib/db';
import { requireAuth } from '@/wiki/lib/requireRole';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const gate = await requireAuth();
    if (!gate.ok) {
      return NextResponse.json(
        { error: 'unauthorized' },
        { status: 401, headers: { 'Cache-Control': 'no-store', 'X-App-Cache': 'OFF' } }
      );
    }
    const me = gate.user;

    // 입력 파싱 -> message_id는 정수/양수, type은 like|dislike
    const body = await req.json().catch(() => null);
    const messageId = Number(body?.message_id);
    const rawType = typeof body?.type === 'string' ? body.type.trim().toLowerCase() : '';
    const kind = rawType === 'dislike' ? 'dislike' : rawType === 'like' ? 'like' : '';

    if (!Number.isSafeInteger(messageId) || messageId <= 0) {
      return NextResponse.json(
        { error: 'bad-id' },
        { status: 400, headers: { 'Cache-Control': 'no-store', 'X-App-Cache': 'OFF' } }
      );
    }
    if (!kind) {
      return NextResponse.json(
        { error: 'bad-type' },
        { status: 400, headers: { 'Cache-Control': 'no-store', 'X-App-Cache': 'OFF' } }
      );
    }

    // 한 번의 UPDATE로 상호배타 토글 -> 배열이 null이면 빈 배열로 간주
    const rows = (await sql/*sql*/`
      UPDATE chat_messages
      SET
        liked_by =
          CASE
            WHEN ${kind} = 'like' THEN
              CASE
                WHEN ${me.id} = ANY(COALESCE(liked_by, '{}'::int[]))
                  THEN array_remove(COALESCE(liked_by, '{}'::int[]), ${me.id})
                ELSE array_append(array_remove(COALESCE(liked_by, '{}'::int[]), ${me.id}), ${me.id})
              END
            ELSE array_remove(COALESCE(liked_by, '{}'::int[]), ${me.id})
          END,
        disliked_by =
          CASE
            WHEN ${kind} = 'dislike' THEN
              CASE
                WHEN ${me.id} = ANY(COALESCE(disliked_by, '{}'::int[]))
                  THEN array_remove(COALESCE(disliked_by, '{}'::int[]), ${me.id})
                ELSE array_append(array_remove(COALESCE(disliked_by, '{}'::int[]), ${me.id}), ${me.id})
              END
            ELSE array_remove(COALESCE(disliked_by, '{}'::int[]), ${me.id})
          END
      WHERE id = ${messageId} AND deleted_at IS NULL
      RETURNING
        cardinality(COALESCE(liked_by, '{}'::int[]))    AS like_count,
        cardinality(COALESCE(disliked_by, '{}'::int[])) AS dislike_count,
        COALESCE(${me.id} = ANY(liked_by), false)       AS i_liked,
        COALESCE(${me.id} = ANY(disliked_by), false)    AS i_disliked
    `) as unknown as Array<{
      like_count: number;
      dislike_count: number;
      i_liked: boolean;
      i_disliked: boolean;
    }>;

    const row = rows[0];
    if (!row) {
      return NextResponse.json(
        { error: 'not-found' },
        { status: 404, headers: { 'Cache-Control': 'no-store', 'X-App-Cache': 'OFF' } }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        like_count: row.like_count,
        dislike_count: row.dislike_count,
        i_liked: row.i_liked,
        i_disliked: row.i_disliked,
      },
      { headers: { 'Cache-Control': 'no-store', 'X-App-Cache': 'OFF' } }
    );
  } catch (e: any) {
    console.error('/api/chat/toggle-reaction error:', e);
    return NextResponse.json(
      { error: 'toggle-failed', detail: String(e?.message || e) },
      { status: 500, headers: { 'Cache-Control': 'no-store', 'X-App-Cache': 'OFF' } }
    );
  }
}
