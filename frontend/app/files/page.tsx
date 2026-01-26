"use client";

import { useState, useEffect, useCallback } from 'react';
import { FileUploader } from '@/components/FileUploader';
import { listFiles, deleteFile, formatFileSize, type UploadedFile, type FileListResponse } from '@/lib/files';
import { Trash2, ExternalLink, Copy, Check, RefreshCw, File } from 'lucide-react';

export default function FilesPage() {
  const [files, setFiles] = useState<FileListResponse['blobs']>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null);

  const fetchFiles = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await listFiles({ limit: 100 });
      setFiles(response.blobs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleUpload = useCallback((file: UploadedFile) => {
    setFiles(prev => [file, ...prev]);
  }, []);

  const handleDelete = useCallback(async (url: string) => {
    if (!confirm('Are you sure you want to delete this file?')) return;

    try {
      setDeletingUrl(url);
      await deleteFile(url);
      setFiles(prev => prev.filter(f => f.url !== url));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete file');
    } finally {
      setDeletingUrl(null);
    }
  }, []);

  const copyToClipboard = useCallback(async (url: string) => {
    await navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  }, []);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">File Storage</h1>
          <p className="text-gray-500 mt-1">Upload and manage files up to 100MB</p>
        </div>
        <button
          onClick={fetchFiles}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Upload section */}
      <div className="glass-panel rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Upload File</h2>
        <FileUploader onUpload={handleUpload} />
      </div>

      {/* Files list */}
      <div className="glass-panel rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">
          Uploaded Files {files.length > 0 && <span className="text-gray-500">({files.length})</span>}
        </h2>

        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm mb-4">
            {error}
          </div>
        )}

        {loading && files.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <div className="animate-spin w-8 h-8 border-2 border-gray-600 border-t-primary rounded-full mx-auto mb-3" />
            Loading files...
          </div>
        ) : files.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <File className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No files uploaded yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {files.map((file) => (
              <div
                key={file.url}
                className="flex items-center gap-4 p-4 bg-black/20 rounded-lg border border-white/5 hover:border-white/10 transition-colors"
              >
                <div className="p-2 bg-white/5 rounded-lg">
                  <File className="w-5 h-5 text-gray-400" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {file.pathname}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {formatFileSize(file.size)}{file.contentType ? ` · ${file.contentType}` : ''} · {new Date(file.uploadedAt).toLocaleString()}
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => copyToClipboard(file.url)}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors text-gray-400 hover:text-white"
                    title="Copy URL"
                  >
                    {copiedUrl === file.url ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>

                  <a
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors text-gray-400 hover:text-white"
                    title="Open file"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>

                  <button
                    onClick={() => handleDelete(file.url)}
                    disabled={deletingUrl === file.url}
                    className="p-2 hover:bg-red-500/20 rounded-lg transition-colors text-gray-400 hover:text-red-400 disabled:opacity-50"
                    title="Delete file"
                  >
                    {deletingUrl === file.url ? (
                      <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
