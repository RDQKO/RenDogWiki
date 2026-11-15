// =============================================
// File: app/api/profile/minecraft-name/route.ts
// =============================================
/**
 * 마인크래프트 닉네임 변경
 * - PATCH body -> { newName }
 * - 절차 -> 인증 → 형식 체크 → Mojang UUID 검증 → 중복 검사 → 업데이트 → 새 JWT 재발급
 * - 응답은 실시간 갱신 성격 -> 캐시 금지
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/wiki/lib/db';
import { getAuthUser } from '@/app/wiki/lib/auth';
import jwt from 'jsonwebtoken';
import { logActivity } from '@wiki/lib/activity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const JWT_SECRET: string = (() => {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error('JWT_SECRET is not set');
  return value;
})();
// 자바 에디션 닉네임 규칙: 영문/숫자/언더스코어, 3~16자
const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;

// Mojang API 호출 유틸(타임아웃 포함)
async function verifyMojangName(name: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000); // 7초 제한

  try {
    const res = await fetch(
      `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`,
      { method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store', signal: controller.signal }
    );
    clearTimeout(timeout);

    // 존재하지 않으면 204 또는 404가 올 수 있음
    if (res.status === 204 || res.status === 404) return false;
    if (!res.ok) throw new Error(`mojang upstream ${res.status}`);
    // 형식만 대략 확인(응답 본문 없이도 ok면 존재로 간주 가능하지만 안정적으로 본문 체크)
    const data = await res.json().catch(() => null as any);
    return typeof data?.id === 'string' && data.id.length >= 16;
  } catch {
    clearTimeout(timeout);
    throw new Error('mojang-failed');
  }
}

export async function PATCH(req: NextRequest) {
  try {
    // 1) 인증
    const auth = await getAuthUser();
    if (!auth) {
      return NextResponse.json(
        { error: '인증 필요' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // 2) 입력 파싱/검증
    const body = await req.json().catch(() => null);
    const raw = typeof body?.newName === 'string' ? body.newName : '';
    const newName = raw.trim();

    if (!newName) {
      return NextResponse.json(
        { error: '새 닉네임을 입력하세요.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    if (!NAME_RE.test(newName)) {
      return NextResponse.json(
        { error: '닉네임 형식이 올바르지 않습니다.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // 3) Mojang 검증 -> 존재하지 않으면 400, 통신 실패면 502
    try {
      const ok = await verifyMojangName(newName);
      if (!ok) {
        return NextResponse.json(
          { error: '유효하지 않은 닉네임입니다.' },
          { status: 400, headers: { 'Cache-Control': 'no-store' } }
        );
      }
    } catch {
      return NextResponse.json(
        { error: 'Mojang API 오류' },
        { status: 502, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // 4) 중복 검사(본인 제외)
    const dup = await sql`
      SELECT id FROM users WHERE minecraft_name = ${newName} AND id <> ${auth.id}
    `;
    if (Array.isArray(dup) && dup.length > 0) {
      return NextResponse.json(
        { error: '이미 사용 중인 닉네임입니다.' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // 5) 업데이트
    await sql`UPDATE users SET minecraft_name = ${newName} WHERE id = ${auth.id}`;

    // 6) 최신 유저 조회
    const rows = await sql`
      SELECT id, username, email, minecraft_name
      FROM users
      WHERE id = ${auth.id}
      LIMIT 1
    `;
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: '사용자 조회 실패' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    const user = rows[0];

    // 7) 새 JWT 재발급 -> 쿠키 저장
    const token = jwt.sign(
      { id: user.id, username: user.username, minecraft_name: user.minecraft_name, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const res = NextResponse.json(
      { message: '닉네임 변경 완료', user },
      { headers: { 'Cache-Control': 'no-store' } }
    );
    res.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7일
    });

    // 8) 활동 로그
    await logActivity({
      action: 'user.rename',
      username: auth.minecraft_name ?? req.headers.get('x-wiki-username') ?? null,
      targetType: 'user',
      targetId: user.id,
      targetName: user.minecraft_name,
      targetPath: null,
      meta: { before: auth.minecraft_name ?? null, after: user.minecraft_name },
    });

    return res;
  } catch (err) {
    console.error('[profile/minecraft-name PATCH] unexpected error:', err);
    return NextResponse.json(
      { error: 'Server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
