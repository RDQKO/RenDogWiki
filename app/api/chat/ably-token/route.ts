// =============================================
// File: app/api/chat/ably-token/route.ts
// =============================================
/**
 * Ably 토큰 요청 엔드포인트
 * - GET -> Ably REST SDK로 tokenRequest 생성 후 그대로 반환
 * - clientId -> 로그인 유저면 "user:<id>", 아니면 "anon"
 * - capability -> 채팅 채널 구독만 허용; 발행은 인증된 서버 API에서 처리
 * - 응답은 실시간 성격이라 캐시 금지
 */

import { NextResponse } from 'next/server';
import { getAuthUser } from '@/wiki/lib/auth';

// 빌드/프리렌더 단계에서 정적 개입을 막고, Ably는 Node 런타임에서만 다룸
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1) 환경 변수 확인
    const KEY = process.env.ABLY_API_KEY;
    if (!KEY) {
      return NextResponse.json(
        { error: 'no-ably-key' },
        { status: 500, headers: { 'Cache-Control': 'no-store', 'X-App-Cache': 'OFF' } }
      );
    }

    // 2) 사용자 식별 -> 토큰 clientId
    const me = await getAuthUser();
    const clientId = me ? `user:${me.id}` : 'anon';

    // 3) Ably SDK를 요청 시점에만 로드(빌드 타임 실행 방지)
    const Ably = (await import('ably')).default; // promises 빌드 사용
    const client = new Ably.Rest({ key: KEY });

    // 4) capability: 필요한 채널만 권한 부여
    const capability = JSON.stringify({
      'rdwiki-chat': ['subscribe'],
    });

    // 5) 토큰 요청 생성 (1시간 유효)
    const tokenRequest = await client.auth.createTokenRequest({
      clientId,
      ttl: 1000 * 60 * 60,
      capability,
    });

    return NextResponse.json(tokenRequest, {
      headers: { 'Cache-Control': 'no-store', 'X-App-Cache': 'OFF' },
    });
  } catch (e: any) {
    console.error('/api/chat/ably-token error:', e);
    return NextResponse.json(
      { error: 'ably-token-failed', detail: String(e?.message || e) },
      { status: 500, headers: { 'Cache-Control': 'no-store', 'X-App-Cache': 'OFF' } }
    );
  }
}
