// File: app/api/chat/send/route.ts
/**
 * 채팅 메시지 전송
 * - POST body -> { text: string, reply_to_id?: number }
 * - 흐름 -> 인증 확인 -> 본문 검증/정규화 -> DB 저장 -> 표시용 형태로 1건 재조회 -> Ably로 브로드캐스트 -> { ok, id } 반환
 * - 응답은 실시간 성격이라 캐시 금지
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/wiki/lib/db';
import { requireAuth } from '@/wiki/lib/requireRole';
import Ably from 'ably';

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

    // 입력 파싱 -> text는 문자열만 허용, 최대 2000자, 공백만이면 거부
    const body = await req.json().catch(() => null);
    const rawText = typeof body?.text === 'string' ? body.text : '';
    const text = rawText.slice(0, 2000);
    if (!text.trim()) {
      return NextResponse.json(
        { error: 'bad-request' },
        { status: 400, headers: { 'Cache-Control': 'no-store', 'X-App-Cache': 'OFF' } }
      );
    }

    // reply_to_id -> 숫자면 사용, 아니면 null
    const reply_to_id_input = body?.reply_to_id;
    const reply_to_id =
      reply_to_id_input !== undefined && reply_to_id_input !== null && Number.isFinite(Number(reply_to_id_input))
        ? Number(reply_to_id_input)
        : null;

    // 메시지 저장 -> 배열 컬럼은 기본 빈 배열로
    const inserted = (await sql`
      INSERT INTO chat_messages (user_id, text, reply_to_id, liked_by, disliked_by)
      VALUES (${me.id}, ${text}, ${reply_to_id}, '{}'::int[], '{}'::int[])
      RETURNING id
    `) as unknown as Array<{ id: number | string }>;

    const newId = Number(inserted[0].id);

    // 표시용 형태로 1건 재조회 -> 닉네임/카운트 포함
    const rows = (await sql`
      SELECT
        m.id, m.user_id, m.text, m.reply_to_id,
        COALESCE(m.liked_by, '{}'::int[])    AS liked_by,
        COALESCE(m.disliked_by, '{}'::int[]) AS disliked_by,
        m.created_at,
        COALESCE(u.minecraft_name, u.username) AS mc_name
      FROM chat_messages m
      LEFT JOIN users u ON u.id = m.user_id
      WHERE m.id = ${newId}
      LIMIT 1
    `) as unknown as any[];

    const r = rows[0];
    const name = r?.mc_name ?? `user#${Number(r?.user_id)}`;
    // 닉네임 기반 아바타(40px) -> Minotar helm 사용
    const avatar_url = name ? `https://minotar.net/helm/${encodeURIComponent(name)}/40.png` : null;

    const msg = {
      id: Number(r.id),
      user: { id: Number(r.user_id), name, avatar_url },
      text: r.text,
      reply_to_id: r.reply_to_id == null ? null : Number(r.reply_to_id),
      like_count: (r.liked_by ?? []).length,
      dislike_count: (r.disliked_by ?? []).length,
      created_at: r.created_at,
    };

    // 실시간 브로드캐스트(실패해도 요청 자체는 성공으로 처리 -> 기존 동작 유지)
    try {
      const key = process.env.ABLY_API_KEY;
      if (!key) {
        console.warn('[chat/send] ABLY_API_KEY is missing, skipping publish.');
      } else {
        const rest = new Ably.Rest(key);
        await rest.channels.get('rdwiki-chat').publish('new-message', JSON.stringify(msg));
      }
    } catch (e) {
      console.error('ably publish failed:', e);
    }

    return NextResponse.json(
      { ok: true, id: newId },
      { headers: { 'Cache-Control': 'no-store', 'X-App-Cache': 'OFF' } }
    );
  } catch (e: any) {
    console.error('/api/chat/send error:', e);
    return NextResponse.json(
      { error: 'send-failed', detail: String(e?.message || e) },
      { status: 500, headers: { 'Cache-Control': 'no-store', 'X-App-Cache': 'OFF' } }
    );
  }
}
