export type DocumentSaveAttempt = { snapshot: string; body: string };

export function createDocumentSaveAttempt(snapshot: string): DocumentSaveAttempt {
  return { snapshot, body: JSON.stringify({ ...JSON.parse(snapshot), saveRequestId: crypto.randomUUID() }) };
}

/** Reuse the exact request ID after a lost response; the server records it with the write. */
export async function sendDocumentSave(attempt: DocumentSaveAttempt) {
  for (let retry = 0; ; retry++) {
    try {
      const response = await fetch('/api/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: attempt.body, credentials: 'include',
      });
      const saved = await response.json().catch(() => null);
      if (retry === 0 && [500, 502, 503, 504].includes(response.status)) {
        await new Promise(resolve => setTimeout(resolve, 600));
        continue;
      }
      return { response, saved };
    } catch (error) {
      if (retry > 0) throw error;
      await new Promise(resolve => setTimeout(resolve, 600));
    }
  }
}
