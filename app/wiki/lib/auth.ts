// =============================================
// File: app/wiki/lib/auth.ts (전체 코드)
// =============================================
import { cookies } from 'next/headers';
import jwt, { type JwtPayload } from 'jsonwebtoken';

export type AuthUser = {
  id: number;
  username: string;
  email: string;
  minecraft_name: string;
};

function mustGetEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

const JWT_SECRET = mustGetEnv('JWT_SECRET');

function isAuthUserPayload(v: unknown): v is AuthUser {
  if (!v || typeof v !== 'object') return false;
  const o = v as any;
  return (
    Number.isSafeInteger(o.id) && o.id > 0 &&
    typeof o.username === 'string' &&
    typeof o.email === 'string' &&
    typeof o.minecraft_name === 'string'
  );
}

/**
 * [서버 사이드] 로그인 유저 정보 반환
 * - 쿠키의 token JWT 검증 후 AuthUser 반환
 * - 검증 실패/형식 불일치면 null
 */
export async function getAuthUser(): Promise<AuthUser | null> {
  const token = (await cookies()).get('token')?.value;
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as string | JwtPayload;

    // payload가 string일 수도 있어서 방어
    if (!decoded || typeof decoded === 'string') return null;

    // JwtPayload 안에 커스텀 필드가 들어있다는 가정이므로 타입가드로 검증
    if (!isAuthUserPayload(decoded)) return null;

    return decoded;
  } catch {
    return null;
  }
}
