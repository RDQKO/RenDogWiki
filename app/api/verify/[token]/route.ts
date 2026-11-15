// =============================================
// File: app/api/verify/[token]/route.ts
// =============================================
/**
 * 이메일 인증 토큰 처리
 * - GET /api/verify/[token]
 * - 동작 -> 토큰으로 사용자 1건 업데이트(verified=true, verification_token=null) -> 성공/에러 응답
 * - 선조회 없이 UPDATE ... RETURNING 으로 처리해서 왕복/경쟁조건 줄임
 * - 응답은 캐시 금지
 */

import { sql } from '@/wiki/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { logActivity } from '@wiki/lib/activity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  _req: NextRequest,
  { params: pendingParams }: { params: Promise<{ token: string }> }
) {
  const params = await pendingParams;
  try {
    const raw = params?.token ?? '';
    const token = String(raw).trim();
    if (!token) {
      return NextResponse.json(
        { error: '유효하지 않은 토큰입니다.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // 토큰으로 바로 인증 처리(없으면 0행)
    const updated = (await sql/*sql*/`
      UPDATE users
      SET
        verified = TRUE,
        verification_token = NULL
      WHERE verification_token = ${token}
      RETURNING id, username, email, minecraft_name
    `) as unknown as Array<{
      id: number;
      username: string;
      email: string;
      minecraft_name: string | null;
    }>;

    if (!Array.isArray(updated) || updated.length === 0) {
      return NextResponse.json(
        { error: '유효하지 않은 토큰입니다.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const u = updated[0];

    // 활동 로그(간단 요약)
    await logActivity({
      action: 'user.verify',
      username: u.minecraft_name ?? u.username ?? null,
      targetType: 'user',
      targetId: u.id,
      targetName: u.username ?? null,
      targetPath: null,
      meta: null,
    });

    return NextResponse.json(
      { message: '이메일 인증이 완료되었습니다.' },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[verify GET] unexpected error:', err);
    return NextResponse.json(
      { error: '서버 내부 오류' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
