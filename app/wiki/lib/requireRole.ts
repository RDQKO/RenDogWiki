import { getAuthUser } from '@/app/wiki/lib/auth';
import { sql, runDbRead, type SQL } from '@/app/wiki/lib/db';

export type Role = 'guest' | 'writer' | 'admin';
type CurrentUser = {
  id: number;
  username: string;
  email: string;
  minecraft_name: string;
  role: Role;
  verified: boolean;
};

/** Recheck the account as well as the JWT: deleted/unverified accounts cannot write. */
export async function requireAuth(db: SQL = sql) {
  const tokenUser = await getAuthUser();
  if (!tokenUser) {
    return { ok: false as const, status: 401, error: 'UNAUTHORIZED' as const };
  }
  const rows = await runDbRead('auth:require', () => db<CurrentUser[]>`
    SELECT id, username, email, minecraft_name, role, verified
    FROM users WHERE id = ${tokenUser.id} LIMIT 1
  `);
  const row = rows[0];
  if (!row || !row.verified) {
    return { ok: false as const, status: 401, error: 'UNAUTHORIZED' as const };
  }
  const role: Role = row.role === 'admin' || row.role === 'writer' ? row.role : 'guest';
  return { ok: true as const, user: row, dbUser: { ...row, role } };
}

export async function requireRole(allow: Role[], db: SQL = sql) {
  const auth = await requireAuth(db);
  if (!auth.ok) return auth;
  if (!allow.includes(auth.dbUser.role)) {
    return { ok: false as const, status: 403, error: 'FORBIDDEN' as const };
  }
  return auth;
}

/** Matches the manager UI's uploader rule; empty names never own rows. */
export function canDeleteUploaded(
  user: { role: Role; minecraft_name?: string | null },
  ...uploaders: unknown[]
): boolean {
  if (user.role === 'admin') return true;
  const name = String(user.minecraft_name ?? '').trim().toLowerCase();
  return user.role === 'writer' && !!name && uploaders.some(
    (uploader) => typeof uploader === 'string' && uploader.trim().toLowerCase() === name,
  );
}
