"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export interface DriveFile {
  id: string;
  name: string;
  thumbnailLink: string | null;
  webContentLink: string | null;
  mimeType: string;
  size: string | null;
}

interface DriveFilePickerProps {
  onSelect: (file: DriveFile) => void;
}

function formatBytes(sizeStr: string | null): string {
  if (!sizeStr) return "";
  const bytes = parseInt(sizeStr, 10);
  if (isNaN(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DriveFilePicker({ onSelect }: DriveFilePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchFiles = useCallback(async (q: string, pageToken?: string) => {
    const isFirstPage = !pageToken;
    if (isFirstPage) setLoading(true);
    else setLoadingMore(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (pageToken) params.set("pageToken", pageToken);

      const res = await fetch(`/api/drive/files?${params.toString()}`);

      if (res.status === 401) {
        setIsAuthenticated(false);
        return;
      }

      if (!res.ok) {
        throw new Error("Erro ao buscar arquivos do Drive");
      }

      const data = (await res.json()) as {
        files: DriveFile[];
        nextPageToken: string | null;
      };

      setIsAuthenticated(true);
      if (isFirstPage) {
        setFiles(data.files);
      } else {
        setFiles((prev) => [...prev, ...data.files]);
      }
      setNextPageToken(data.nextPageToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  // When modal opens, check auth and fetch files
  useEffect(() => {
    if (isOpen) {
      fetchFiles(search);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (!isOpen) return;
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      fetchFiles(search);
    }, 400);
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function handleSelect(file: DriveFile) {
    onSelect(file);
    setIsOpen(false);
  }

  function handleConnectGoogle() {
    const returnTo = window.location.pathname;
    window.location.href = `/api/auth/google?returnTo=${encodeURIComponent(returnTo)}`;
  }

  return (
    <>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <svg className="w-4 h-4 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
          <path d="M4.433 22l3.59-6.218H22l-3.59 6.218H4.433zm-2.425-2.018L5.598 14H2l2.39-4.143h6.3L7.3 14h3.604L8.012 18.69 5.59 22H2.008zM9.007 2l3.59 6.218L8.008 14H15.6l4.59-7.93L16.6 2H9.006z"/>
        </svg>
        Buscar no Google Drive
      </button>

      {/* Modal */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M4.433 22l3.59-6.218H22l-3.59 6.218H4.433zm-2.425-2.018L5.598 14H2l2.39-4.143h6.3L7.3 14h3.604L8.012 18.69 5.59 22H2.008zM9.007 2l3.59 6.218L8.008 14H15.6l4.59-7.93L16.6 2H9.006z"/>
                </svg>
                <h2 className="text-base font-semibold text-gray-800">
                  Selecionar do Google Drive
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5">
              {isAuthenticated === false && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <svg className="w-12 h-12 text-gray-300 mb-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M4.433 22l3.59-6.218H22l-3.59 6.218H4.433zm-2.425-2.018L5.598 14H2l2.39-4.143h6.3L7.3 14h3.604L8.012 18.69 5.59 22H2.008zM9.007 2l3.59 6.218L8.008 14H15.6l4.59-7.93L16.6 2H9.006z"/>
                  </svg>
                  <p className="text-sm text-gray-500 mb-4">
                    Conecte sua conta Google para buscar imagens no Drive.
                  </p>
                  <button
                    type="button"
                    onClick={handleConnectGoogle}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M4.433 22l3.59-6.218H22l-3.59 6.218H4.433zm-2.425-2.018L5.598 14H2l2.39-4.143h6.3L7.3 14h3.604L8.012 18.69 5.59 22H2.008zM9.007 2l3.59 6.218L8.008 14H15.6l4.59-7.93L16.6 2H9.006z"/>
                    </svg>
                    Conectar Google Drive
                  </button>
                </div>
              )}

              {isAuthenticated === true && (
                <>
                  {/* Search */}
                  <div className="mb-4">
                    <div className="relative">
                      <svg
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar por nome..."
                        className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  {/* Error */}
                  {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex items-center justify-between">
                      <p className="text-sm text-red-700">{error}</p>
                      <button
                        type="button"
                        onClick={() => fetchFiles(search)}
                        className="text-xs text-red-600 underline ml-2"
                      >
                        Tentar novamente
                      </button>
                    </div>
                  )}

                  {/* Loading skeleton */}
                  {loading && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {Array.from({ length: 9 }).map((_, i) => (
                        <div key={i} className="animate-pulse">
                          <div className="bg-gray-200 rounded-lg aspect-square mb-2" />
                          <div className="bg-gray-200 rounded h-3 w-3/4" />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Files grid */}
                  {!loading && files.length === 0 && !error && (
                    <div className="text-center py-12 text-gray-400">
                      <svg
                        className="w-10 h-10 mx-auto mb-3 text-gray-300"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      <p className="text-sm">Nenhuma imagem encontrada</p>
                    </div>
                  )}

                  {!loading && files.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {files.map((file) => (
                        <button
                          key={file.id}
                          type="button"
                          onClick={() => handleSelect(file)}
                          className="group text-left rounded-lg border border-gray-200 overflow-hidden hover:border-blue-400 hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <div className="aspect-square bg-gray-100 overflow-hidden">
                            {file.thumbnailLink ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={file.thumbnailLink}
                                alt={file.name}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <svg
                                  className="w-10 h-10 text-gray-300"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={1.5}
                                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                  />
                                </svg>
                              </div>
                            )}
                          </div>
                          <div className="p-2">
                            <p
                              className="text-xs text-gray-700 font-medium truncate"
                              title={file.name}
                            >
                              {file.name}
                            </p>
                            {file.size && (
                              <p className="text-xs text-gray-400 mt-0.5">
                                {formatBytes(file.size)}
                              </p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Load more */}
                  {!loading && nextPageToken && (
                    <div className="mt-4 text-center">
                      <button
                        type="button"
                        onClick={() => fetchFiles(search, nextPageToken)}
                        disabled={loadingMore}
                        className="px-5 py-2 rounded-lg text-sm font-medium text-blue-600 border border-blue-300 hover:bg-blue-50 transition-colors disabled:opacity-50"
                      >
                        {loadingMore ? "Carregando..." : "Carregar mais"}
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* Initial loading state (auth check) */}
              {isAuthenticated === null && (
                <div className="flex items-center justify-center py-12">
                  <svg className="animate-spin w-6 h-6 text-blue-500" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
