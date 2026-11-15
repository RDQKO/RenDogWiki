// A URL's old TOC hash is not a request to scroll a newly opened document.
// Search records its deliberate heading target separately, for one navigation only.
let pending: { documentId: number; domId: string; expiresAt: number } | null = null;

export function setNextDocumentHeading(documentId: number, domId: string | null | undefined) {
  pending = domId ? { documentId, domId, expiresAt: Date.now() + 30_000 } : null;
}

export function consumeNextDocumentHeading(documentId: number): string {
  if (!pending) return '';
  if (pending.expiresAt < Date.now()) { pending = null; return ''; }
  if (pending.documentId !== documentId) return '';
  const domId = pending.domId;
  pending = null;
  return `#${domId}`;
}
