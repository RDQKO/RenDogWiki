// =============================================
// File: app/api/realtime/token/route.ts
// =============================================
/**
 * Ably 실시간 토큰 발급
 * - GET -> 로그인된 유저의 id를 clientId로 사용해 TokenRequest 반환
 * - 실패 시 401(미인증) / 500(토큰 발급 실패)
 * - 응답은 캐시 금지
 */

import { NextResponse } from 'next/server';
// ⚠️ 상단 import 제거: import { ablyRest } from '@/wiki/lib/ably';
import { getAuthUser } from '@/wiki/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // ✅ 요청 시점에만 모듈 로드 (빌드 타임 import 실행 방지)
    const { ablyRest } = await import('@/wiki/lib/ably');
    if (!ablyRest) {
      throw new Error('Ably 클라이언트 초기화 실패(ablyRest 미존재). 환경변수를 확인하세요.');
    }

    const tokenRequest = await ablyRest.auth.createTokenRequest({
      clientId: String(user.id),
      ttl: 1000 * 60 * 60,
      capability: JSON.stringify({ 'rdwiki-chat': ['subscribe'] }),
    });

    return NextResponse.json(tokenRequest, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err: any) {
    console.error('[realtime/token GET] error:', err);
    return NextResponse.json(
      { error: 'token-request-failed', detail: String(err?.message || err) },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
