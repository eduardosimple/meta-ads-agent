"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAppContext } from "@/context/AppContext";
import CampaignTable from "@/components/campanhas/CampaignTable";
import type { Campaign } from "@/types/campaign";
import type { GoogleCampaignWithMetrics } from "@/lib/google-ads-api";

type Platform = "meta" | "google";

function fmt(n: number) {
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function GoogleCampaignsTable({
  campaigns, loading, error, onToggle,
}: {
  campaigns: GoogleCampaignWithMetrics[];
  loading: boolean;
  error: string | null;
  onToggle: (id: string, status: "ENABLED" | "PAUSED") => Promise<void>;
}) {
  const [toggling, setToggling] = useState<string | null>(null);

  if (loading) return (
    <div className="bg-white rounded-2xl border border-gray-100 p-8 flex justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "#4285F4", borderTopColor: "transparent" }} />
    </div>
  );
  if (error) return <div className="bg-white rounded-2xl border border-red-100 p-6 text-red-500 text-sm">{error}</div>;
  if (!campaigns.length) return <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400 text-sm">Nenhuma campanha com dados nos últimos 7 dias.</div>;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Campanha</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Gasto</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Impressões</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Cliques</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">CTR</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">CPC</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Conv.</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Custo/Conv.</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Ações</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map(c => {
              const isEnabled = c.status === "ENABLED";
              return (
                <tr key={c.id} className="border-b border-gray-100 hover:bg-blue-50/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-800 max-w-xs truncate" title={c.name}>{c.name}</div>
                    <div className="text-xs text-gray-400 mt-0.5">ID: {c.id}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${isEnabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${isEnabled ? "bg-green-500" : "bg-gray-400"}`} />
                      {isEnabled ? "Ativo" : "Pausado"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700">{fmt(c.spend)}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-600">{c.impressions.toLocaleString("pt-BR")}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-600">{c.clicks.toLocaleString("pt-BR")}</td>
                  <td className="px-4 py-3 text-sm text-right">
                    <span className={c.ctr < 1.5 && c.impressions > 500 ? "text-red-600 font-semibold" : "text-gray-600"}>
                      {c.ctr.toFixed(2)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    <span className={c.cpc > 8 ? "text-red-600 font-semibold" : c.cpc > 4 ? "text-yellow-600" : "text-gray-600"}>
                      {c.cpc > 0 ? fmt(c.cpc) : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-600">{c.conversions > 0 ? c.conversions.toFixed(1) : "—"}</td>
                  <td className="px-4 py-3 text-sm text-right">
                    <span className={c.cost_per_conversion > 200 ? "text-red-600 font-semibold" : c.cost_per_conversion > 150 ? "text-yellow-600" : "text-gray-600"}>
                      {c.conversions > 0 ? fmt(c.cost_per_conversion) : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      disabled={toggling === c.id}
                      onClick={async () => {
                        setToggling(c.id);
                        await onToggle(c.id, isEnabled ? "PAUSED" : "ENABLED");
                        setToggling(null);
                      }}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all disabled:opacity-50 ${
                        isEnabled ? "border-gray-300 text-gray-600 hover:bg-gray-100" : "border-blue-300 text-blue-600 hover:bg-blue-50"
                      }`}
                    >
                      {toggling === c.id ? "..." : isEnabled ? "Pausar" : "Ativar"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
        <p className="text-xs text-gray-400">{campaigns.length} campanha{campaigns.length !== 1 ? "s" : ""} · últimos 7 dias</p>
      </div>
    </div>
  );
}

export default function CampanhasPage() {
  const { token, selectedClient } = useAppContext();
  const router = useRouter();
  const [platform, setPlatform] = useState<Platform>("meta");
  const [metaCampaigns, setMetaCampaigns] = useState<Campaign[]>([]);
  const [googleCampaigns, setGoogleCampaigns] = useState<GoogleCampaignWithMetrics[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCampaigns = useCallback(async () => {
    if (!token || !selectedClient) return;
    setLoading(true);
    setError(null);
    try {
      if (platform === "google") {
        const res = await fetch(`/api/google/campaigns?clientSlug=${selectedClient.slug}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Erro ao buscar campanhas");
        setGoogleCampaigns(data.campaigns ?? []);
      } else {
        const res = await fetch(`/api/meta/campaigns?clientSlug=${selectedClient.slug}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Erro ao buscar campanhas");
        setMetaCampaigns(data.campaigns ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, [token, selectedClient, platform]);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  async function handleGoogleToggle(campaignId: string, status: "ENABLED" | "PAUSED") {
    if (!token || !selectedClient) return;
    const res = await fetch("/api/google/campaigns", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ clientSlug: selectedClient.slug, campaignId, status }),
    });
    if (res.ok) {
      setGoogleCampaigns(prev => prev.map(c => c.id === campaignId ? { ...c, status } : c));
    }
  }

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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Campanhas</h1>
          <p className="text-sm text-gray-500">{selectedClient.nome}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchCampaigns}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
            </svg>
            Atualizar
          </button>
          {platform === "meta" && (
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-white font-medium hover:opacity-90 transition-opacity"
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

      {platform === "google" ? (
        <GoogleCampaignsTable
          campaigns={googleCampaigns}
          loading={loading}
          error={error}
          onToggle={handleGoogleToggle}
        />
      ) : (
        <CampaignTable campaigns={metaCampaigns} loading={loading} error={error} platform="meta" />
      )}
    </div>
  );
}
