// app/wiki/lib/activity.ts
import { sql } from './db';
import 'server-only';

export type LogAction =
  | 'document.create' | 'document.update' | 'document.delete'
  | 'category.create' | 'category.update' | 'category.delete' | 'category.reorder'
  | 'folder.create'   | 'folder.rename'   | 'folder.move'     | 'folder.delete'
  | 'image.upload'    | 'image.rename'    | 'image.delete' | 'image.replace' | 'image.restore'
  | 'npc.create'      | 'npc.update'      | 'npc.delete'
  | 'head.create'     | 'head.update'     | 'head.delete'
  | 'user.rename'     | 'user.verify'
  | 'village.create'  | 'village.update'  | 'village.delete';

export type TargetType =
  | 'document' | 'category' | 'folder' | 'image' | 'npc' | 'head'
  | 'user' | 'village';

type LogInput = {
  action: LogAction;
  username?: string | null;
  targetType: TargetType;
  targetId?: string | number | null;
  targetName?: string | null;
  targetPath?: string | null;
  meta?: Record<string, unknown> | null;
};

export async function logActivity(input: LogInput): Promise<void> {
  const {
    action,
    username = null,
    targetType,
    targetId = null,
    targetName = null,
    targetPath = null,
    meta = null,
  } = input;

  try {
    await sql`
      INSERT INTO activity_logs
        (action, username, target_type, target_id, target_name, target_path, meta)
      VALUES
        (${action},
         ${username},
         ${targetType},
         ${targetId == null ? null : String(targetId)},
         ${targetName},
         ${targetPath},
         ${meta ? JSON.stringify(meta) : null}::jsonb)
    `;
  } catch (e) {
    console.error('[logActivity] insert failed', e);
  }
}

export async function resolveFolderName(folderId: number | null | undefined) {
  if (folderId == null) return '루트';
  const rows = await sql`SELECT name FROM image_folders WHERE id = ${folderId}`;
  return rows[0]?.name ?? String(folderId);
}

export async function resolveCategoryName(categoryId: number | null | undefined) {
  if (categoryId == null) return '루트';
  const rows = await sql`SELECT name FROM categories WHERE id = ${categoryId}`;
  return rows[0]?.name ?? String(categoryId);
}

export async function resolveVillageName(villageId: number | null | undefined) {
  if (villageId == null) return '알 수 없는 마을';
  const rows = await sql`SELECT name FROM village WHERE id = ${villageId}`;
  return rows[0]?.name ?? String(villageId);
}
