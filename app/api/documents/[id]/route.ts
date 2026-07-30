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
  if (!url.searchParams.has('id')) url.searchParams.set('id', id);
  return new NextRequest(url, {
    method: req.method,
    headers: req.headers,
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const hasExplicitLookup =
    req.nextUrl.searchParams.has('id') ||
    req.nextUrl.searchParams.has('path') ||
    req.nextUrl.searchParams.has('list') ||
    req.nextUrl.searchParams.has('all');

  return getDocuments(hasExplicitLookup ? req : requestWithDocumentId(req, params.id));
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return deleteDocument(requestWithDocumentId(req, params.id));
}
