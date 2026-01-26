import { put } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';

/**
 * PUT /api/files/put
 *
 * Simple file upload endpoint for CLI tools.
 * Accepts the file in the request body with pathname in query params.
 *
 * Query parameters:
 * - pathname: The path/filename for the uploaded file (required)
 *
 * Request body: Raw file content
 *
 * Response:
 * {
 *   url: "https://....blob.vercel-storage.com/...",
 *   pathname: "...",
 *   contentType: "..."
 * }
 */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const pathname = request.nextUrl.searchParams.get('pathname');

    if (!pathname) {
      return NextResponse.json(
        { error: 'pathname query parameter is required' },
        { status: 400 }
      );
    }

    const contentType = request.headers.get('content-type') || 'application/octet-stream';
    const body = await request.arrayBuffer();

    if (body.byteLength === 0) {
      return NextResponse.json(
        { error: 'Request body is empty' },
        { status: 400 }
      );
    }

    // Upload to Vercel Blob
    const blob = await put(pathname, Buffer.from(body), {
      access: 'public',
      contentType,
    });

    return NextResponse.json({
      url: blob.url,
      pathname: blob.pathname,
      contentType: blob.contentType,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/files/put
 *
 * Alternative using POST for compatibility.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  return PUT(request);
}
