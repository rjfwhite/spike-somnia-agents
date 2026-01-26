import { upload } from '@vercel/blob/client';

export interface UploadedFile {
  url: string;
  pathname: string;
  size: number;
  uploadedAt: Date;
  contentType?: string;
}

export interface FileListResponse {
  blobs: UploadedFile[];
  cursor: string | null;
  hasMore: boolean;
}

/**
 * Upload a file to Vercel Blob storage (supports up to 100MB)
 *
 * @param file - The file to upload
 * @param options - Optional configuration
 * @returns The uploaded blob metadata including the public URL
 *
 * @example
 * ```ts
 * const blob = await uploadFile(file);
 * console.log(blob.url); // Use this URL to access the file
 * ```
 */
export async function uploadFile(
  file: File,
  options?: {
    /** Custom pathname/folder for the file */
    pathname?: string;
    /** Called with upload progress (0-100) */
    onProgress?: (progress: number) => void;
  }
): Promise<UploadedFile> {
  const pathname = options?.pathname || file.name;

  const blob = await upload(pathname, file, {
    access: 'public',
    handleUploadUrl: '/api/files/upload',
    onUploadProgress: (event) => {
      if (options?.onProgress && event.total) {
        const progress = Math.round((event.loaded / event.total) * 100);
        options.onProgress(progress);
      }
    },
  });

  return {
    url: blob.url,
    pathname: blob.pathname,
    size: file.size,
    uploadedAt: new Date(),
    contentType: blob.contentType || file.type,
  };
}

/**
 * List files from Vercel Blob storage
 *
 * @param options - Query options
 * @returns List of files with pagination info
 */
export async function listFiles(options?: {
  prefix?: string;
  limit?: number;
  cursor?: string;
}): Promise<FileListResponse> {
  const params = new URLSearchParams();
  if (options?.prefix) params.set('prefix', options.prefix);
  if (options?.limit) params.set('limit', options.limit.toString());
  if (options?.cursor) params.set('cursor', options.cursor);

  const response = await fetch(`/api/files?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Failed to list files: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Delete a file from Vercel Blob storage
 *
 * @param url - The blob URL to delete
 */
export async function deleteFile(url: string): Promise<void> {
  const response = await fetch('/api/files', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    throw new Error(`Failed to delete file: ${response.statusText}`);
  }
}

/**
 * Format file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
