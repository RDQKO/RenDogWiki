import { createSqlConnection, type SQL } from './db';

/** A save must not wait behind page/search reads on the shared one-connection pool. */
export async function withSaveConnection<T>(operation: (db: SQL) => Promise<T>): Promise<T> {
  const db = createSqlConnection();
  try { return await operation(db); }
  finally {
    // Never turn an acknowledged COMMIT into a failed response because closing failed.
    try { await db.end({ timeout: 1 }); }
    catch (error) { console.error('[save] connection cleanup failed', error); }
  }
}
