// =============================================
// File: app/api/chat/publish/route.ts
// =============================================
/**
 * 임의 이벤트를 Ably 채널로 브로드캐스트
 * - POST body -> { type: string, data?: any }
 * - 채널 -> 'rdwiki-chat'
 * - 보안 메모 -> 운영에서는 인증/권한 체크를 붙이는 것이 안전
 * - 응답은 실시간 특성이라 캐시 금지
 */

import { NextResponse } from 'next/server';
import Ably from 'ably';
import { requireRole } from '@/wiki/lib/requireRole';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CHANNEL = 'rdwiki-chat';
const MAX_PAYLOAD_BYTES = 64 * 1024; // 64KB

export async function POST(req: Request) {
  try {
    const gate = await requireRole(['admin']);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, {
        status: gate.status, headers: { 'Cache-Control': 'no-store' },
      });
    }
    // 1) 본문 파싱
    const body = await req.json().catch(() => ({} as any));
    const rawType = body?.type;
    const data = body?.data ?? {};

    // 2) type 검증 -> 문자열 1~128자
    const type = typeof rawType === 'string' ? rawType.trim() : '';
    if (!type || type.length > 128) {
      return NextResponse.json(
        { ok: false, error: 'type-required' },
        { status: 400, headers: { 'Cache-Control': 'no-store', 'X-App-Cache': 'OFF' } }
      );
    }

    // 3) 환경 변수 검증
    const key = process.env.ABLY_API_KEY;
    if (!key) {
      return NextResponse.json(
        { ok: false, error: 'ably-key-missing' },
        { status: 500, headers: { 'Cache-Control': 'no-store', 'X-App-Cache': 'OFF' } }
      );
    }

    // 4) payload 직렬화 및 크기 제한
    //    기존 코드와 동일하게 문자열(JSON)로 전송 -> 클라이언트 호환 유지
    const serialized = JSON.stringify(data);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_PAYLOAD_BYTES) {
      return NextResponse.json(
        { ok: false, error: 'payload-too-large' },
        { status: 413, headers: { 'Cache-Control': 'no-store', 'X-App-Cache': 'OFF' } }
      );
    }

    // 5) Ably publish
    const ably = new Ably.Rest({ key });
    const channel = ably.channels.get(CHANNEL);
    await channel.publish(type, serialized);

    return NextResponse.json(
      { ok: true },
      { headers: { 'Cache-Control': 'no-store', 'X-App-Cache': 'OFF' } }
    );
  } catch (err: any) {
    console.error('/api/chat/publish error', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'publish-failed' },
      { status: 500, headers: { 'Cache-Control': 'no-store', 'X-App-Cache': 'OFF' } }
    );
  }
}
