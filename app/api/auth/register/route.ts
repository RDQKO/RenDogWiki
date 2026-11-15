// File: app/api/auth/register/route.ts
/**
 * 회원가입 API
 * - POST body -> { email, username, password, minecraftName }
 * - 중복 검사 -> 이메일/아이디/마크닉 중 하나라도 존재하면 409 + fields 플래그
 * - 비밀번호는 bcrypt 해시로 저장, 인증 토큰 생성 후 메일 발송
 * - 응답은 실시간 성격이라 no-store 로 캐시 방지
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/wiki/lib/db';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { sendVerificationMail } from '@/wiki/lib/sendVerificationMail';

// 아주 느슨한 이메일 형태 검증(서버에서 포맷만 가볍게 확인)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    // 1) 입력 파싱 -> 타입/누락/트림 처리
    const body = await req.json().catch(() => null);
    const emailRaw = typeof body?.email === 'string' ? body.email.trim() : '';
    const username = typeof body?.username === 'string' ? body.username.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    const minecraftName =
      typeof body?.minecraftName === 'string' ? body.minecraftName.trim() : '';

    if (!emailRaw || !username || !password || !minecraftName) {
      return NextResponse.json(
        { error: '모든 항목을 입력해주세요.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    if (!EMAIL_RE.test(emailRaw)) {
      return NextResponse.json(
        { error: '이메일 형식이 올바르지 않습니다.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72 || username.length > 64 || emailRaw.length > 254 || !/^[A-Za-z0-9_]{3,16}$/.test(minecraftName)) {
      return NextResponse.json({ error: '비밀번호는 8자 이상, UTF-8 기준 72바이트 이내여야 하며 닉네임은 영문·숫자·밑줄 3~16자여야 합니다.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }

    // 2) 중복 검사 -> 이메일은 대소문자 무시, 나머지는 정확 일치
    const existing = (await sql`
      SELECT email, username, minecraft_name
      FROM users
      WHERE LOWER(email) = LOWER(${emailRaw})
         OR username = ${username}
         OR minecraft_name = ${minecraftName}
    `) as unknown as { email: string; username: string; minecraft_name: string }[];

    if (Array.isArray(existing) && existing.length > 0) {
      const emailTaken = existing.some((r) => r.email.toLowerCase() === emailRaw.toLowerCase());
      const usernameTaken = existing.some((r) => r.username === username);
      const minecraftTaken = existing.some((r) => r.minecraft_name === minecraftName);

      return NextResponse.json(
        {
          error: '중복된 항목이 있습니다.',
          fields: {
            email: emailTaken,
            username: usernameTaken,
            minecraftName: minecraftTaken,
          },
        },
        { status: 409, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // 3) 비밀번호 해시 -> bcrypt
    const hashed = await bcrypt.hash(password, 10);

    // 4) 이메일 인증 토큰 생성
    const token = crypto.randomBytes(32).toString('hex');

    // 5) 사용자 저장 -> 가입 직후 verified=false, verification_token 저장
    await sql`
      INSERT INTO users (email, username, password_hash, minecraft_name, verified, verification_token)
      VALUES (${emailRaw}, ${username}, ${hashed}, ${minecraftName}, false, ${token})
    `;

    // 6) 인증 메일 발송 -> 실패 시 예외로 잡힘
    await sendVerificationMail(emailRaw, token);

    // 7) 성공 응답
    return NextResponse.json(
      { message: '회원가입 성공. 이메일을 확인해주세요.' },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (e: any) {
    // 고유 제약 위반(UNIQUE) -> 중복으로 응답
    // e.code는 PostgreSQL 오류 코드, 23505는 unique_violation
    if (e?.code === '23505') {
      const constraint: string | undefined = e?.constraint;
      const fields = {
        email: !!constraint && /email/i.test(constraint),
        username: !!constraint && /username/i.test(constraint),
        minecraftName: !!constraint && /minecraft[_]?name/i.test(constraint),
      };
      return NextResponse.json(
        { error: '중복된 항목이 있습니다.', fields },
        { status: 409, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    console.error('[auth/register] error:', e);
    return NextResponse.json(
      { error: '서버 내부 오류 (로그를 확인하세요)' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
