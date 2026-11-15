// =============================================
// File: app/api/auth/login/route.ts
// =============================================
/**
 * 로그인 API 라우트
 * - POST로 username/password를 받아 로그인 처리 -> 성공 시 JWT를 HttpOnly 쿠키로 반환
 * - 실패 케이스: 계정 없음 / 이메일 미인증 / 비밀번호 불일치
 * - 동작 보존 우선, 보안/안정성 보강
 *
 * 보강 내용
 * - IP 기준 rate limit
 * - IP + username 기준 rate limit
 * - 실패 시 짧은 지연 추가(브루트포스 완화)
 * - 존재하지 않는 아이디/비밀번호 불일치 응답 통일
 * - dummy bcrypt compare로 타이밍 차이 완화
 * - 성공 시 rd_role 쿠키도 함께 발급
 */

import { sql } from '@/wiki/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// JWT 비밀키
function mustGetEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

const JWT_SECRET = mustGetEnv('JWT_SECRET');

// DB 조회 결과 타입
type UserRow = {
  id: number;
  username: string;
  email: string;
  minecraft_name: string;
  password_hash: string;
  verified: boolean;
  role?: string | null;
};

// ---------------------------------------------
// 간단 메모리 기반 rate limit
// - 주의: 서버리스 환경에서는 인스턴스별 메모리라 완전한 글로벌 차단은 아님
// ---------------------------------------------
type RateEntry = {
  count: number;
  firstAt: number;
  blockedUntil: number;
};

const ipRateMap = new Map<string, RateEntry>();
const ipUserRateMap = new Map<string, RateEntry>();

const WINDOW_MS = 10 * 60 * 1000; // 10분
const BLOCK_MS = 15 * 60 * 1000; // 15분 차단
const MAX_IP_ATTEMPTS = 30; // IP 단위 허용 횟수
const MAX_IP_USER_ATTEMPTS = 8; // IP+아이디 단위 허용 횟수

const DUMMY_BCRYPT_HASH =
  '$2b$10$wQ7XvH0J0pY3N1m7NQ3q8e3eV8z7t5W2r1oJ8j0mG4VnM5jG9lY7K'; // 더미용 유효 bcrypt 해시 문자열

function now() {
  return Date.now();
}

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    return xff.split(',')[0].trim() || 'unknown';
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return 'unknown';
}

function touchRateLimit(
  store: Map<string, RateEntry>,
  key: string,
  limit: number
): { blocked: boolean; retryAfterSec?: number } {
  const current = now();
  const entry = store.get(key);

  if (!entry) {
    store.set(key, {
      count: 1,
      firstAt: current,
      blockedUntil: 0,
    });
    return { blocked: false };
  }

  // 차단 중
  if (entry.blockedUntil > current) {
    return {
      blocked: true,
      retryAfterSec: Math.ceil((entry.blockedUntil - current) / 1000),
    };
  }

  // 윈도우 만료 시 초기화
  if (current - entry.firstAt > WINDOW_MS) {
    store.set(key, {
      count: 1,
      firstAt: current,
      blockedUntil: 0,
    });
    return { blocked: false };
  }

  entry.count += 1;

  if (entry.count > limit) {
    entry.blockedUntil = current + BLOCK_MS;
    store.set(key, entry);
    return {
      blocked: true,
      retryAfterSec: Math.ceil(BLOCK_MS / 1000),
    };
  }

  store.set(key, entry);
  return { blocked: false };
}

function resetRateLimit(store: Map<string, RateEntry>, key: string) {
  store.delete(key);
}

function cleanupRateStore(store: Map<string, RateEntry>) {
  const current = now();
  for (const [key, entry] of store.entries()) {
    const expiredWindow = current - entry.firstAt > WINDOW_MS * 2;
    const expiredBlock = entry.blockedUntil > 0 && entry.blockedUntil < current;
    if (expiredWindow || expiredBlock) {
      store.delete(key);
    }
  }
}

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function failWithDelay(
  message: string,
  status: number,
  extra?: { retryAfterSec?: number }
) {
  // 실패 응답에 약간의 지연을 넣어 브루트포스/타이밍 분석 완화
  await wait(700);

  const res = NextResponse.json(
    { error: message },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        ...(extra?.retryAfterSec
          ? { 'Retry-After': String(extra.retryAfterSec) }
          : {}),
      },
    }
  );

  return res;
}

export async function POST(req: NextRequest) {
  try {
    cleanupRateStore(ipRateMap);
    cleanupRateStore(ipUserRateMap);

    const ip = getClientIp(req);

    // 1) 입력 파싱 -> json 파싱 실패/타입 불일치 대비
    const body = await req.json().catch(() => null);
    const rawUsername = typeof body?.username === 'string' ? body.username : '';
    const username = rawUsername.trim();
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!username || !password) {
      return NextResponse.json(
        { error: '아이디와 비밀번호를 입력해주세요.' },
        {
          status: 400,
          headers: {
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    // 2) rate limit 검사
    const ipCheck = touchRateLimit(ipRateMap, `ip:${ip}`, MAX_IP_ATTEMPTS);
    if (ipCheck.blocked) {
      return failWithDelay(
        '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.',
        429,
        { retryAfterSec: ipCheck.retryAfterSec }
      );
    }

    const ipUserKey = `ip:${ip}:username:${username.toLowerCase()}`;
    const ipUserCheck = touchRateLimit(
      ipUserRateMap,
      ipUserKey,
      MAX_IP_USER_ATTEMPTS
    );

    if (ipUserCheck.blocked) {
      return failWithDelay(
        '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.',
        429,
        { retryAfterSec: ipUserCheck.retryAfterSec }
      );
    }

    // 3) 사용자 조회 -> 필요한 컬럼만 + LIMIT 1
    const rows = (await sql`
      SELECT id, username, email, minecraft_name, password_hash, verified, role
      FROM users
      WHERE username = ${username}
      LIMIT 1
    `) as unknown as UserRow[];

    const user =
      Array.isArray(rows) && rows.length > 0
        ? rows[0]
        : null;

    // 4) dummy hash 포함 비밀번호 비교 -> 타이밍 차이 완화
    const hashToCompare = user?.password_hash || DUMMY_BCRYPT_HASH;
    const match = await bcrypt.compare(password, hashToCompare);

    // 5) 아이디 없음 / 비밀번호 불일치 통합 처리
    if (!user || !match) {
      return failWithDelay('아이디 또는 비밀번호가 올바르지 않습니다.', 401);
    }

    // 6) 인증 여부 확인
    if (!user.verified) {
      return failWithDelay('이메일 인증이 필요합니다.', 403);
    }

    // 7) 성공 시 해당 키 rate limit 해제
    resetRateLimit(ipUserRateMap, ipUserKey);

    // 8) JWT 생성 -> payload: id/username/minecraft_name/email, 유효 7일
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        minecraft_name: user.minecraft_name,
        email: user.email,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const role =
      String(user.role ?? '').toLowerCase() === 'admin'
        ? 'admin'
        : String(user.role ?? '').toLowerCase() === 'writer'
          ? 'writer'
          : 'guest';

    // 9) 쿠키 저장 -> httpOnly + sameSite=lax + (prod) secure, 전체 경로(/), 7일
    const res = NextResponse.json(
      { message: '로그인 성공', loggedIn: true, role, roleSource: 'db',
        user: { id: user.id, username: user.username, email: user.email, minecraft_name: user.minecraft_name, role } },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );

    res.cookies.set('token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    res.cookies.set('rd_role', role, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60, // 1시간
    });

    // 10) 성공 응답
    return res;
  } catch (err) {
    // 예기치 못한 오류 -> 서버 에러로 정리
    console.error('[auth/login] unexpected error:', err);

    return NextResponse.json(
      { error: '로그인 처리 중 오류가 발생했습니다.' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  }
}