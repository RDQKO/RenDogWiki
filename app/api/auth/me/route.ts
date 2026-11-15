// =============================================
// File: app/api/auth/me/route.ts
// (전체 코드)
// - GET: 로그인 여부/유저 정보 반환
// - DELETE: 회원 탈퇴
// - 개선:
//   1) GET은 기본적으로 JWT + role 쿠키로 빠르게 응답
//   2) role 쿠키가 없을 때만 DB 조회
//   3) DB CONNECT_TIMEOUT 시 guest로 강등하되 200 응답
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/wiki/lib/db';
import { getAuthUser } from '@/wiki/lib/auth';
import bcrypt from 'bcryptjs';

type Role = 'guest' | 'writer' | 'admin';

const ROLE_COOKIE = 'rd_role';

function noStoreHeaders() {
  return {
    'Cache-Control': 'no-store',
    'X-App-Cache': 'OFF',
  };
}

function normalizeRole(v: unknown): Role {
  const s = String(v ?? '').toLowerCase();
  return s === 'admin' || s === 'writer' ? s : 'guest';
}

function isConnectTimeoutError(err: unknown) {
  const e = err as any;
  return (
    e?.code === 'CONNECT_TIMEOUT' ||
    e?.errno === 'CONNECT_TIMEOUT' ||
    String(e?.message ?? '').includes('CONNECT_TIMEOUT')
  );
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser();

    if (!auth) {
      return NextResponse.json(
        {
          loggedIn: false,
          user: null,
          role: 'guest',
          roles: [],
          permissions: [],
        },
        { status: 200, headers: noStoreHeaders() }
      );
    }

    // The role cookie is a UI hint only. Always load the current account/role.
    try {
      const rows = await sql<{
        id: number;
        username: string;
        email: string;
        minecraft_name: string;
        role?: string | null;
        verified: boolean;
      }[]>`
        SELECT id, username, email, minecraft_name, role, verified
        FROM users
        WHERE id = ${auth.id}
        LIMIT 1
      `;

      const row = rows?.[0];
      if (!row || !row.verified) {
        const response = NextResponse.json({ loggedIn: false, user: null, role: 'guest', roles: [], permissions: [] }, { headers: noStoreHeaders() });
        response.cookies.delete('token');
        response.cookies.delete(ROLE_COOKIE);
        return response;
      }
      const role = normalizeRole(row.role);

      const res = NextResponse.json(
        {
          loggedIn: true,
          user: row
            ? {
                id: row.id,
                username: row.username,
                email: row.email,
                minecraft_name: row.minecraft_name,
                role,
              }
            : {
                ...auth,
                role,
              },
          role,
          roles: role === 'guest' ? [] : [role],
          permissions: role === 'guest' ? [] : [role],
          roleSource: 'db',
        },
        { status: 200, headers: noStoreHeaders() }
      );

      res.cookies.set(ROLE_COOKIE, role, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60, // 1시간
      });

      return res;
    } catch (err) {
      // 3) DB가 죽어도 위키 진입 자체는 막지 않음
      if (isConnectTimeoutError(err)) {
        console.warn('[auth/me:GET] DB timeout, falling back to token-only mode');

        return NextResponse.json(
          {
            loggedIn: true,
            user: {
              ...auth,
              role: 'guest',
            },
            role: 'guest',
            roles: [],
            permissions: [],
            degraded: true,
            roleSource: 'token-fallback',
          },
          { status: 200, headers: noStoreHeaders() }
        );
      }

      throw err;
    }
  } catch (err) {
    console.error('[auth/me:GET] unexpected error:', err);
    return NextResponse.json(
      { error: '사용자 정보를 불러오는 중 오류가 발생했습니다.' },
      { status: 500, headers: noStoreHeaders() }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await getAuthUser();
    if (!auth) {
      return NextResponse.json(
        { error: '인증 필요' },
        { status: 401, headers: noStoreHeaders() }
      );
    }

    const body = await req.json().catch(() => null);
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!password) {
      return NextResponse.json(
        { error: '비밀번호가 필요합니다.' },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    const rows = await sql<{ id: number; password_hash: string }[]>`
      SELECT id, password_hash
      FROM users
      WHERE id = ${auth.id}
      LIMIT 1
    `;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: '사용자를 찾을 수 없습니다.' },
        { status: 404, headers: noStoreHeaders() }
      );
    }

    const ok = await bcrypt.compare(password, rows[0].password_hash);
    if (!ok) {
      return NextResponse.json(
        { error: '비밀번호가 일치하지 않습니다.' },
        { status: 401, headers: noStoreHeaders() }
      );
    }

    await sql`DELETE FROM users WHERE id = ${auth.id}`;

    const res = NextResponse.json(
      { message: '탈퇴 완료' },
      { status: 200, headers: noStoreHeaders() }
    );

    res.cookies.set('token', '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
      expires: new Date(0),
    });

    res.cookies.set(ROLE_COOKIE, '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
      expires: new Date(0),
    });

    return res;
  } catch (err) {
    console.error('[auth/me:DELETE] unexpected error:', err);
    return NextResponse.json(
      { error: '탈퇴 처리 중 오류가 발생했습니다.' },
      { status: 500, headers: noStoreHeaders() }
    );
  }
}