// =============================================
// File: app/api/auth/password/route.ts
// =============================================
/**
 * 비밀번호 변경 API
 * - PUT body -> { currentPassword, newPassword }
 * - 흐름 -> 인증 확인 -> 현재 비밀번호 검증 -> 새 비밀번호 검증 -> 해시 갱신
 * - 주의 -> 민감 데이터라 응답은 no-store로 처리
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/wiki/lib/db';
import { getAuthUser } from '@/app/wiki/lib/auth';
import bcrypt from 'bcryptjs';

const MIN_LENGTH = 8;

export async function PUT(req: NextRequest) {
  try {
    // 1) 인증 확인
    const auth = await getAuthUser();
    if (!auth) {
      return NextResponse.json(
        { error: '인증 필요' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // 2) 입력 파싱 -> 타입/누락 검증
    const body = await req.json().catch(() => null);
    const currentPassword =
      typeof body?.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword =
      typeof body?.newPassword === 'string' ? body.newPassword : '';

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: '현재/새 비밀번호를 입력하세요.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (newPassword.length < MIN_LENGTH || Buffer.byteLength(newPassword, 'utf8') > 72) {
      return NextResponse.json(
        { error: `새 비밀번호는 ${MIN_LENGTH}자 이상, UTF-8 기준 72바이트 이내여야 합니다.` },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (newPassword === currentPassword) {
      return NextResponse.json(
        { error: '새 비밀번호가 현재 비밀번호와 동일합니다.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // 3) 현재 비밀번호 검증
    const rows = (await sql`
      SELECT password_hash
      FROM users
      WHERE id = ${auth.id}
      LIMIT 1
    `) as unknown as { password_hash: string }[];

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: '사용자를 찾을 수 없습니다.' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const ok = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!ok) {
      return NextResponse.json(
        { error: '현재 비밀번호가 일치하지 않습니다.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // 4) 새 비밀번호 해시 후 저장
    const hashed = await bcrypt.hash(newPassword, 10);
    await sql`UPDATE users SET password_hash = ${hashed} WHERE id = ${auth.id}`;

    // 5) 성공 응답
    return NextResponse.json(
      { message: '비밀번호가 변경되었습니다.' },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[auth/password:PUT] unexpected error:', err);
    return NextResponse.json(
      { error: '비밀번호 변경 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
