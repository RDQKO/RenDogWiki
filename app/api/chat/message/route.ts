// =============================================
// File: app/api/chat/message/route.ts  — 전체 코드 (교체용)
// =============================================
/**
 * 채팅 메시지 작성
 * - POST body -> { text, replyToId? }
 * - 인증 필요 -> getAuthUser()
 * - 동작 -> 메시지 저장 -> Ably 브로드캐스트('message.created') -> 저장된 메시지 반환
 * - 응답은 실시간 특성상 캐시 금지
 */

import { NextResponse } from 'next/server';
import { sql } from '@/wiki/lib/db';
import { requireAuth } from '@/wiki/lib/requireRole';

// 빌드/프리렌더 단계에서 정적 처리 시도를 막고 Node 런타임 고정
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const gate = await requireAuth();
    if (!gate.ok) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store', 'X-App-Cache': 'OFF' } });
    }
    const me = gate.user;

    // 입력 파싱 -> text는 2000자까지, 공백만 있으면 거부
    const body = await req.json().catch(() => null);
    const rawText = typeof body?.text === 'string' ? body.text : '';
    const text = String(rawText).slice(0, 2000);
    if (!text.trim()) {
      return NextResponse.json({ error: 'EMPTY' }, { status: 400, headers: { 'Cache-Control': 'no-store', 'X-App-Cache': 'OFF' } });
    }

    // replyToId -> 숫자면 사용, 아니면 null
    const replyToId = body?.replyToId;
    const reply =
      replyToId !== undefined && replyToId !== null && Number.isFinite(Number(replyToId))
        ? Number(replyToId)
        : null;

    // DB 저장 -> id, created_at 반환
    const inserted = (await sql/*sql*/`
      INSERT INTO chat_messages (user_id, text, reply_to_id)
      VALUES (${me.id}, ${text}, ${reply})
      RETURNING id, created_at
    `) as unknown as Array<{ id: number; created_at: string }>;
    const row = inserted[0];

    // 사용자 표시 정보 -> minecraft_name 우선, 없으면 username
    const displayName = (me as any).minecraft_name || me.username;
    const avatar_url = displayName
      ? `https://minotar.net/helm/${encodeURIComponent(displayName)}/40.png`
      : null;

    // 클라이언트가 즉시 렌더할 수 있게 구성
    const msg = {
      id: row.id,
      user: { id: me.id, name: displayName, avatar_url },
      text,
      reply_to_id: reply,
      like_count: 0,
      dislike_count: 0,
      i_liked: false,
      i_disliked: false,
      created_at: row.created_at,
    };

    try {
      const { ablyRest, GLOBAL_CHANNEL } = await import('@/wiki/lib/ably');
      await ablyRest.channels.get(GLOBAL_CHANNEL).publish('message.created', msg);
    } catch (error) { console.error('[chat/message] publish failed after save:', error); }

    return NextResponse.json(msg, {
      headers: { 'Cache-Control': 'no-store', 'X-App-Cache': 'OFF' },
    });
  } catch (e: any) {
    console.error('/api/chat/message error:', e);
    return NextResponse.json(
      { error: 'post-failed', detail: String(e?.message || e) },
      { status: 500, headers: { 'Cache-Control': 'no-store', 'X-App-Cache': 'OFF' } }
    );
  }
}
