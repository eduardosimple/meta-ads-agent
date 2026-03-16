"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAppContext } from "@/context/AppContext";
import CampaignTable from "@/components/campanhas/CampaignTable";
import type { Campaign } from "@/types/campaign";

type Platform = "meta" | "google";

export default function CampanhasPage() {
  const { token, selectedClient } = useAppContext();
  const router = useRouter();
  const [platform, setPlatform] = useState<Platform>("meta");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCampaigns = useCallback(async () => {
    if (!token || !selectedClient) return;
    setLoading(true);
    setError(null);
    setCampaigns([]);
    try {
      const endpoint = platform === "google"
        ? `/api/google/campaigns?clientSlug=${selectedClient.slug}`
        : `/api/meta/campaigns?clientSlug=${selectedClient.slug}`;
      const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao buscar campanhas");

      if (platform === "google") {
        // Map GoogleCampaign to Campaign shape
        const mapped: Campaign[] = (data.campaigns ?? []).map((c: { id: string; name: string; status: string }) => ({
          id: c.id,
          name: c.name,
          status: c.status === "ENABLED" ? "ACTIVE" : c.status as Campaign["status"],
          objective: "—",
        }));
        setCampaigns(mapped);
      } else {
        setCampaigns(data.campaigns ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, [token, selectedClient, platform]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  if (!selectedClient) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="bg-white rounded-2xl p-12 text-center border border-gray-100 shadow-sm">
          <p className="text-gray-400 text-sm">Selecione um cliente para ver as campanhas</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Campanhas</h1>
          <p className="text-sm text-gray-500">{selectedClient.nome}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchCampaigns}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm
                       text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
            </svg>
            Atualizar
          </button>
          {platform === "meta" && (
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-white font-medium
                         hover:opacity-90 transition-opacity"
              style={{ background: "linear-gradient(135deg, #1877f2 0%, #42b72a 100%)" }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
              </svg>
              Nova Campanha (Chat)
            </button>
          )}
        </div>
      </div>

      {/* Platform tabs */}
      {selectedClient.google && (
        <div className="bg-white rounded-xl border border-gray-100 p-1 flex gap-1 w-fit shadow-sm">
          <button
            onClick={() => setPlatform("meta")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              platform === "meta" ? "bg-blue-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <svg viewBox="0 0 20 20" className="w-4 h-4" fill="currentColor">
              <path d="M10 2C5.03 2 1 6.03 1 11c0 3.87 2.33 7.21 5.71 8.71L10 18l3.29 1.71C16.67 18.21 19 14.87 19 11c0-4.97-4.03-9-9-9z"/>
            </svg>
            Meta Ads
          </button>
          <button
            onClick={() => setPlatform("google")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              platform === "google" ? "bg-white shadow-sm text-blue-600 border border-gray-200" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none">
              <path d="M15 8.17c0-.52-.05-1.02-.13-1.5H8v2.84h3.94c-.17.91-.69 1.68-1.47 2.2v1.85h2.38C14.12 12.38 15 10.44 15 8.17z" fill="#4285F4"/>
              <path d="M8 15c1.78 0 3.27-.59 4.37-1.59l-2.38-1.85c-.66.44-1.49.7-2.47.7-1.9 0-3.5-1.28-4.08-3.01H1.4v1.9C2.5 13.23 5.07 15 8 15z" fill="#34A853"/>
              <path d="M3.92 9.25A4.7 4.7 0 013.68 8c0-.43.08-.85.24-1.25V4.9H1.4A7 7 0 001 8c0 1.12.27 2.18.4 3.14l2.52-1.89z" fill="#FBBC05"/>
              <path d="M8 3.25c1.08 0 2.04.37 2.8 1.09l2.1-2.1C11.61 1.06 9.96.33 8 .33 5.07.33 2.5 2.1 1.4 4.67l2.52 1.9C4.5 5 6.1 3.72 8 3.72V3.25z" fill="#EA4335"/>
            </svg>
            Google Ads
          </button>
        </div>
      )}

      {/* Table */}
      <CampaignTable
        campaigns={campaigns}
        loading={loading}
        error={error}
        platform={platform}
      />
    </div>
  );
}
