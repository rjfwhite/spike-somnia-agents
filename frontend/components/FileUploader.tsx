"use client";

import { useState, useCallback } from 'react';
import { Upload, X, File, Check, Loader2, Copy, ExternalLink } from 'lucide-react';
import { uploadFile, formatFileSize, type UploadedFile } from '@/lib/files';

interface FileUploaderProps {
  /** Called when a file is successfully uploaded */
  onUpload?: (file: UploadedFile) => void;
  /** Maximum file size in bytes (default: 100MB) */
  maxSize?: number;
  /** Accepted file types (e.g., "image/*,.pdf") */
  accept?: string;
  /** Custom pathname prefix for uploaded files */
  pathPrefix?: string;
}

export function FileUploader({
  onUpload,
  maxSize = 100 * 1024 * 1024,
  accept,
  pathPrefix,
}: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [copied, setCopied] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setUploadedFile(null);

    if (file.size > maxSize) {
      setError(`File too large. Maximum size is ${formatFileSize(maxSize)}`);
      return;
    }

    try {
      setUploadProgress(0);

      const pathname = pathPrefix ? `${pathPrefix}/${file.name}` : undefined;

      const result = await uploadFile(file, {
        pathname,
        onProgress: setUploadProgress,
      });

      setUploadedFile(result);
      setUploadProgress(null);
      onUpload?.(result);
    } catch (err) {
      console.error('Upload error:', err);
      setError(err instanceof Error ? err.message : 'Upload failed');
      setUploadProgress(null);
    }
  }, [maxSize, onUpload, pathPrefix]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }, [handleFile]);

  const copyToClipboard = useCallback(async () => {
    if (!uploadedFile?.url) return;
    await navigator.clipboard.writeText(uploadedFile.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [uploadedFile?.url]);

  const reset = useCallback(() => {
    setUploadedFile(null);
    setError(null);
    setUploadProgress(null);
  }, []);

  return (
    <div className="w-full space-y-4">
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          relative border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer
          ${isDragging
            ? 'border-primary bg-primary/10'
            : 'border-white/20 hover:border-white/40 bg-black/20'
          }
          ${uploadProgress !== null ? 'pointer-events-none' : ''}
        `}
      >
        <input
          type="file"
          onChange={handleInputChange}
          accept={accept}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={uploadProgress !== null}
        />

        {uploadProgress !== null ? (
          <div className="space-y-3">
            <Loader2 className="w-10 h-10 mx-auto text-primary animate-spin" />
            <p className="text-sm text-gray-400">Uploading... {uploadProgress}%</p>
            <div className="w-full max-w-xs mx-auto bg-white/10 rounded-full h-2 overflow-hidden">
              <div
                className="bg-primary h-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Upload className="w-10 h-10 mx-auto text-gray-500" />
            <div>
              <p className="text-sm text-white font-medium">
                Drop a file here or click to browse
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Max size: {formatFileSize(maxSize)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          <X className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto hover:text-red-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Success - uploaded file */}
      {uploadedFile && (
        <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg space-y-3">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <Check className="w-5 h-5 text-green-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {uploadedFile.pathname}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {formatFileSize(uploadedFile.size)} · {uploadedFile.contentType}
              </p>
            </div>
            <button
              onClick={reset}
              className="text-gray-500 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1 bg-black/30 rounded px-3 py-2 font-mono text-xs text-secondary truncate">
              {uploadedFile.url}
            </div>
            <button
              onClick={copyToClipboard}
              className="p-2 bg-black/30 rounded hover:bg-black/50 transition-colors text-gray-400 hover:text-white"
              title="Copy URL"
            >
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
            <a
              href={uploadedFile.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 bg-black/30 rounded hover:bg-black/50 transition-colors text-gray-400 hover:text-white"
              title="Open in new tab"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
