import { pathToFileURL } from 'node:url';
import postgres from 'postgres';

export const documentSaveRequestSchema = `
CREATE TABLE IF NOT EXISTS public.document_save_requests (
  request_id uuid PRIMARY KEY,
  actor_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  request_hash text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS document_save_requests_actor_idx ON public.document_save_requests(actor_id);
ALTER TABLE public.document_save_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.document_save_requests FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.document_save_requests FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.document_save_requests FROM authenticated;
  END IF;
END $$;
`;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const db = postgres(process.env.DATABASE_URL, { max: 1, prepare: false,
    ssl: process.env.DB_SSL === 'disable' && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname) ? false : 'require' });
  try { await db.begin(tx => tx.unsafe(documentSaveRequestSchema)); console.log('Document save request schema is ready.'); }
  finally { await db.end(); }
}
