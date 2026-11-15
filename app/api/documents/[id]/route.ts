import { NextRequest } from 'next/server';
import {
  GET as getDocuments,
  DELETE as deleteDocument,
} from '../route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function requestWithDocumentId(req: NextRequest, id: string): NextRequest {
  const url = new URL(req.url);
  url.searchParams.set('id', id);
  return new NextRequest(url, {
    method: req.method,
    headers: req.headers,
  });
}

export async function GET(
  req: NextRequest,
  { params: pendingParams }: { params: Promise<{ id: string }> }
) {
  const params = await pendingParams;
  return getDocuments(requestWithDocumentId(req, params.id));
}

export async function DELETE(
  req: NextRequest,
  { params: pendingParams }: { params: Promise<{ id: string }> }
) {
  const params = await pendingParams;
  return deleteDocument(requestWithDocumentId(req, params.id));
}
