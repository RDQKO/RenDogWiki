/** Invalid content is rejected instead of silently overwriting the document with []. */
export function parseDocumentContent(value: unknown): unknown[] | null {
  let parsed = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch { return null; }
  }
  if (!Array.isArray(parsed)) return null;
  let visited = 0;
  function validNode(node: unknown, depth: number): boolean {
    if (++visited > 100_000 || depth > 100 || !node || typeof node !== 'object' || Array.isArray(node)) return false;
    const record = node as Record<string, unknown>;
    if (typeof record.text === 'string') return !('children' in record);
    return typeof record.type === 'string' && Array.isArray(record.children) &&
      record.children.length > 0 && record.children.every((child) => validNode(child, depth + 1));
  }
  return parsed.every((node) => validNode(node, 0)) ? parsed : null;
}
