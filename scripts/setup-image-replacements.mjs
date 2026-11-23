// Additive schema for the server's existing custom-auth/Postgres connection.
// Run against the intended database before enabling replacement writes.
import { pathToFileURL } from 'node:url';
import postgres from 'postgres';

export const imageReplacementSchema = `
ALTER TABLE public.images ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0;
ALTER TABLE public.images ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE TABLE IF NOT EXISTS public.image_versions (
  id bigserial PRIMARY KEY,
  image_id integer NOT NULL REFERENCES public.images(id) ON DELETE CASCADE,
  s3_key text NOT NULL UNIQUE,
  url text NOT NULL,
  mime_type text NOT NULL,
  name text NOT NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS image_versions_image_id_idx ON public.image_versions(image_id, id DESC);
CREATE TABLE IF NOT EXISTS public.image_variants (
  image_id integer NOT NULL REFERENCES public.images(id) ON DELETE CASCADE,
  style text NOT NULL CHECK (style IN ('vanilla', '3d')),
  s3_key text NOT NULL UNIQUE,
  url text NOT NULL,
  mime_type text NOT NULL,
  name text NOT NULL,
  PRIMARY KEY (image_id, style)
);
ALTER TABLE public.image_variants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.image_variants FROM PUBLIC;
ALTER TABLE public.image_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.image_versions FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.image_versions_id_seq FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.image_variants FROM anon;
    REVOKE ALL ON public.image_versions FROM anon;
    REVOKE ALL ON SEQUENCE public.image_versions_id_seq FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.image_variants FROM authenticated;
    REVOKE ALL ON public.image_versions FROM authenticated;
    REVOKE ALL ON SEQUENCE public.image_versions_id_seq FROM authenticated;
  END IF;
END $$;
`;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1,
    ssl: process.env.DB_SSL === 'disable' && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname) ? false : 'require' });
  try {
    await sql.begin(tx => tx.unsafe(imageReplacementSchema));
    console.log('Image replacement schema is ready. No images or document content were changed.');
  } finally { await sql.end(); }
}
