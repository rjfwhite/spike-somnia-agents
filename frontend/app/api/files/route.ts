import { list, del } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/files
 *
 * Lists all uploaded files in Vercel Blob storage.
 *
 * Query parameters:
 * - prefix: Filter files by prefix/folder (optional)
 * - limit: Maximum number of files to return (default: 100)
 * - cursor: Pagination cursor for next page
 *
 * Response:
 * {
 *   blobs: [{ url, pathname, size, uploadedAt, contentType }],
 *   cursor: "..." // for pagination, null if no more pages
 *   hasMore: boolean
 * }
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = request.nextUrl.searchParams;
    const prefix = searchParams.get('prefix') || undefined;
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const cursor = searchParams.get('cursor') || undefined;

    const { blobs, cursor: nextCursor, hasMore } = await list({
      prefix,
      limit,
      cursor,
    });

    return NextResponse.json({
      blobs: blobs.map((blob) => ({
        url: blob.url,
        pathname: blob.pathname,
        size: blob.size,
        uploadedAt: blob.uploadedAt,
      })),
      cursor: nextCursor,
      hasMore,
    });
  } catch (error) {
    console.error('List files error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/files
 *
 * Deletes a file from Vercel Blob storage.
 *
 * Request body:
 * { url: "https://....blob.vercel-storage.com/..." }
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    await del(url);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete file error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
