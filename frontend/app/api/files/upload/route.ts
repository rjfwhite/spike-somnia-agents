import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';

/**
 * POST /api/files/upload
 *
 * Handles client-side uploads to Vercel Blob storage.
 * Supports files up to 100MB (configurable via maxSize).
 *
 * Client usage:
 * ```ts
 * import { upload } from '@vercel/blob/client';
 *
 * const blob = await upload(file.name, file, {
 *   access: 'public',
 *   handleUploadUrl: '/api/files/upload',
 * });
 * console.log(blob.url); // The public URL to access the file
 * ```
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // Authenticate and authorize the upload request here
        // For now, we allow all uploads - add auth as needed

        return {
          allowedContentTypes: [
            // Images
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp',
            'image/svg+xml',
            // Documents
            'application/pdf',
            'application/json',
            'text/plain',
            'text/markdown',
            // Archives
            'application/zip',
            'application/gzip',
            'application/x-tar',
            // Docker/Container images
            'application/octet-stream',
            // Any other type (remove this line to restrict to above types only)
            '*/*',
          ],
          maximumSizeInBytes: 100 * 1024 * 1024, // 100MB
          tokenPayload: JSON.stringify({
            uploadedAt: new Date().toISOString(),
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Called after the file is uploaded to Vercel Blob
        // You can store metadata in a database here if needed
        console.log('Upload completed:', {
          url: blob.url,
          pathname: blob.pathname,
          tokenPayload,
        });
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}
