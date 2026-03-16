"use client";

import { useState, useEffect, useCallback } from "react";
import { useAppContext } from "@/context/AppContext";
import MetricCard from "@/components/dashboard/MetricCard";
import PerformanceChart from "@/components/dashboard/PerformanceChart";
import DateRangePicker from "@/components/dashboard/DateRangePicker";
import type { MetricsResponse, AnalysisResult, Proposal } from "@/types/metrics";

function getDefaultDates() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return {
    from: from.toISOString().split("T")[0],
    to: to.toISOString().split("T")[0],
  };
}

function formatCurrency(value: number): string {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNumber(value: number): string {
  return value.toLocaleString("pt-BR");
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

const verdictConfig: Record<string, { label: string; color: string; emoji: string }> = {
  escalar: { label: "Escalar", color: "bg-green-100 text-green-800", emoji: "✅" },
  manter: { label: "Manter", color: "bg-blue-100 text-blue-800", emoji: "⏸️" },
  testar_variacao: { label: "Testar Variação", color: "bg-purple-100 text-purple-800", emoji: "🔄" },
  ajustar: { label: "Ajustar", color: "bg-yellow-100 text-yellow-800", emoji: "⚠️" },
  pausar: { label: "Pausar", color: "bg-red-100 text-red-800", emoji: "❌" },
};

const alertConfig = {
  info: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-800", icon: "ℹ️" },
  warning: { bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-800", icon: "⚠️" },
  critical: { bg: "bg-red-50", border: "border-red-200", text: "text-red-800", icon: "🚨" },
};

const SpendIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
    <path d="M10.75 10.818v2.614A3.13 3.13 0 0011.888 13c.482-.315.612-.648.612-.875 0-.227-.13-.56-.612-.875a3.13 3.13 0 00-1.138-.432zM8.33 8.62c.053.055.115.11.184.164.208.16.46.284.736.363V6.603a2.45 2.45 0 00-.35.13c-.14.065-.27.143-.386.233-.377.292-.514.627-.514.909 0 .184.058.39.33.615z" />
    <path fillRule="evenodd" d="M9.99 2a8 8 0 110 16A8 8 0 019.99 2zM10 4.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zm0 1.5a.75.75 0 01.75.75v.25a2.99 2.99 0 011.77 1.006c.293.363.28.887-.052 1.148-.33.26-.807.246-1.1-.117a1.5 1.5 0 00-.618-.473V9.78c.34.082.662.2.962.35.602.302 1.208.88 1.208 1.87s-.606 1.568-1.208 1.87c-.3.15-.622.268-.962.35v.28a.75.75 0 01-1.5 0v-.28a3.15 3.15 0 01-1.977-1.152.75.75 0 111.172-.937c.246.309.578.495.805.553v-2.11a5.03 5.03 0 01-.827-.282c-.552-.277-1.173-.836-1.173-1.797 0-.96.621-1.52 1.173-1.797a5.03 5.03 0 01.827-.282V6.75A.75.75 0 0110 6z" clipRule="evenodd" />
  </svg>
);

const ImpressionIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
    <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
    <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41z" clipRule="evenodd" />
  </svg>
);

const ClickIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
    <path fillRule="evenodd" d="M6.672 1.911a1 1 0 10-1.932.518l.259.966a1 1 0 001.932-.518l-.26-.966zM2.429 4.74a1 1 0 10-.517 1.932l.966.259a1 1 0 00.517-1.932l-.966-.26zm8.814-.569a1 1 0 00-1.415-1.414l-.707.707a1 1 0 101.415 1.415l.707-.708zm-7.071 7.072l.707-.707A1 1 0 003.465 9.12l-.708.707a1 1 0 001.415 1.415zm3.2-5.171a1 1 0 00-1.3 1.3l4 10a1 1 0 001.823.075l1.38-2.759 3.018 3.02a1 1 0 001.414-1.415l-3.019-3.02 2.76-1.379a1 1 0 00-.076-1.822l-10-4z" clipRule="evenodd" />
  </svg>
);

const CTRIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
    <path fillRule="evenodd" d="M12.577 4.878a.75.75 0 01.919-.53l4.78 1.281a.75.75 0 01.531.919l-1.281 4.78a.75.75 0 01-1.449-.387l.81-3.022a19.407 19.407 0 00-5.594 5.203.75.75 0 01-1.139.093L7 10.06l-4.72 4.72a.75.75 0 01-1.06-1.061l5.25-5.25a.75.75 0 011.06 0l3.074 3.073a20.923 20.923 0 015.545-4.931l-3.042-.815a.75.75 0 01-.53-.918z" clipRule="evenodd" />
  </svg>
);

const CPLIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
    <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
  </svg>
);

function storageKey(slug: string) {
  return `analysis_history_${slug}`;
}

function loadHistory(slug: string): Proposal[] {
  try {
    const raw = localStorage.getItem(storageKey(slug));
    return raw ? (JSON.parse(raw) as Proposal[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(slug: string, proposals: Proposal[]) {
  const resolved = proposals.filter(p => p.status !== "pending");
  // Keep only last 50 resolved proposals
  const trimmed = resolved.slice(-50);
  localStorage.setItem(storageKey(slug), JSON.stringify(trimmed));
}

type Platform = "meta" | "google";

function platformStorageKey(slug: string, platform: Platform) {
  return platform === "google" ? `analysis_history_google_${slug}` : `analysis_history_${slug}`;
}

export default function DashboardPage() {
  const { token, selectedClient } = useAppContext();
  const { from: defaultFrom, to: defaultTo } = getDefaultDates();
  const [platform, setPlatform] = useState<Platform>("meta");
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(defaultTo);
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [history, setHistory] = useState<Proposal[]>([]);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    if (!token || !selectedClient) return;
    setLoading(true);
    setError(null);
    setMetrics(null);
    try {
      const params = new URLSearchParams({ clientSlug: selectedClient.slug, dateFrom, dateTo });
      const endpoint = platform === "google" ? "/api/google/metrics" : "/api/meta/metrics";
      const res = await fetch(`${endpoint}?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao buscar métricas");
      setMetrics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, [token, selectedClient, dateFrom, dateTo, platform]);

  useEffect(() => {
    fetchMetrics();
    setAnalysis(null);
    setProposals([]);
    if (selectedClient) {
      const histKey = platformStorageKey(selectedClient.slug, platform);
      try { setHistory(JSON.parse(localStorage.getItem(histKey) ?? "[]")); } catch { setHistory([]); }
    }
  }, [fetchMetrics, selectedClient, platform]);

  async function runAnalysis() {
    if (!token || !selectedClient) return;
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const endpoint = platform === "google" ? "/api/google/analysis" : "/api/analysis";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ clientSlug: selectedClient.slug }),
      });
      const data: AnalysisResult = await res.json();
      if (!res.ok) throw new Error((data as unknown as { error: string }).error ?? "Erro na análise");
      setAnalysis(data);
      setProposals(data.proposals.filter(p => p.status === "pending"));
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : "Erro na análise");
    } finally {
      setAnalyzing(false);
    }
  }

  function persistResolved(updated: Proposal[]) {
    if (!selectedClient) return;
    const key = platformStorageKey(selectedClient.slug, platform);
    const existing: Proposal[] = (() => { try { return JSON.parse(localStorage.getItem(key) ?? "[]"); } catch { return []; } })();
    const allHistory = [
      ...existing.filter(h => !updated.find(u => u.id === h.id)),
      ...updated.filter(p => p.status !== "pending"),
    ].slice(-50);
    localStorage.setItem(key, JSON.stringify(allHistory));
    setHistory(allHistory);
  }

  async function approveProposal(proposal: Proposal) {
    if (!token || !selectedClient) return;
    setApprovingId(proposal.id);
    try {
      const res = await fetch("/api/proposals/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ clientSlug: selectedClient.slug, action: proposal.action }),
      });
      const data = await res.json();
      const resolved_at = new Date().toISOString();
      const errMsg = !res.ok ? (data.error ?? "Erro ao aprovar") : null;
      const resultMsg = errMsg
        ? `Erro: ${errMsg}`
        : (data.message ?? (proposal.action.type === "none" ? "Registrado" : "Ação aplicada com sucesso"));
      const resolved = { ...proposal, status: "approved" as const, resolved_at, result_message: resultMsg };
      setProposals(prev => prev.map(p => p.id === proposal.id ? resolved : p));
      persistResolved([resolved]);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Erro ao aprovar proposta";
      const resolved = { ...proposal, status: "approved" as const, resolved_at: new Date().toISOString(), result_message: `Erro: ${errMsg}` };
      setProposals(prev => prev.map(p => p.id === proposal.id ? resolved : p));
      persistResolved([resolved]);
    } finally {
      setApprovingId(null);
    }
  }

  function rejectProposal(id: string) {
    const resolved_at = new Date().toISOString();
    setProposals(prev => {
      const updated = prev.map(p => p.id === id ? { ...p, status: "ignored" as const, resolved_at } : p);
      const resolvedProposal = updated.find(p => p.id === id);
      if (resolvedProposal) persistResolved([resolvedProposal]);
      return updated;
    });
  }

  if (!selectedClient) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="bg-white rounded-2xl p-12 text-center border border-gray-100 shadow-sm">
          <p className="text-gray-400 text-sm">
            Selecione um cliente para ver as métricas do dashboard
          </p>
        </div>
      </div>
    );
  }

  const s = metrics?.summary;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">{selectedClient.nome}</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Platform toggle — only show if client has Google Ads configured */}
          {selectedClient.google && (
            <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
              <button
                onClick={() => setPlatform("meta")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  platform === "meta" ? "bg-white shadow text-blue-600" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <span className="text-sm">f</span> Meta
              </button>
              <button
                onClick={() => setPlatform("google")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  platform === "google" ? "bg-white shadow text-blue-600" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <svg viewBox="0 0 20 20" className="w-3.5 h-3.5" fill="none">
                  <path d="M19.5 10.2c0-.65-.06-1.28-.17-1.88H10v3.56h5.33c-.23 1.14-.92 2.1-1.96 2.74v2.28h3.17c1.85-1.7 2.96-4.2 2.96-6.7z" fill="#4285F4"/>
                  <path d="M10 20c2.67 0 4.92-.88 6.56-2.38l-3.17-2.28c-.88.59-2 .94-3.39.94-2.6 0-4.81-1.76-5.6-4.12H1.13v2.35C2.77 17.84 6.14 20 10 20z" fill="#34A853"/>
                  <path d="M4.4 12.16A5.63 5.63 0 014.1 10c0-.75.13-1.48.3-2.16V5.49H1.13A9.99 9.99 0 000 10c0 1.6.38 3.1 1.13 4.51L4.4 12.16z" fill="#FBBC05"/>
                  <path d="M10 3.97c1.48 0 2.8.51 3.85 1.5l2.87-2.87C14.92 1.09 12.67 0 10 0 6.14 0 2.77 2.16 1.13 5.49l3.27 2.35C5.19 5.73 7.4 3.97 10 3.97z" fill="#EA4335"/>
                </svg>
                Google
              </button>
            </div>
          )}

          <DateRangePicker
            dateFrom={dateFrom}
            dateTo={dateTo}
            onChangeFrom={setDateFrom}
            onChangeTo={setDateTo}
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <MetricCard
          icon={<SpendIcon />}
          label="Gasto Total"
          value={s ? formatCurrency(s.total_spend) : loading ? "..." : "R$ 0,00"}
        />
        <MetricCard
          icon={<ImpressionIcon />}
          label="Impressões"
          value={s ? formatNumber(s.total_impressions) : loading ? "..." : "0"}
        />
        <MetricCard
          icon={<ClickIcon />}
          label="Cliques"
          value={s ? formatNumber(s.total_clicks) : loading ? "..." : "0"}
        />
        <MetricCard
          icon={<CTRIcon />}
          label="CTR Médio"
          value={s ? formatPercent(s.avg_ctr) : loading ? "..." : "0,00%"}
        />
        <MetricCard
          icon={<CPLIcon />}
          label={platform === "google" ? "Custo/Conversão" : "CPL"}
          value={s ? (s.cpl > 0 ? formatCurrency(s.cpl) : "—") : loading ? "..." : "—"}
          changeLabel={s && s.total_leads > 0 ? `${s.total_leads} ${platform === "google" ? "conversões" : "leads"}` : undefined}
        />
      </div>

      {/* Chart */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          Desempenho por Dia
        </h2>
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div
              className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: "#1877f2", borderTopColor: "transparent" }}
            />
          </div>
        ) : (
          <PerformanceChart data={metrics?.daily ?? []} />
        )}
      </div>

      {/* Analysis Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">Análise e Otimizações</h2>
            {analysis && (
              <p className="text-xs text-gray-400 mt-0.5">
                Analisado em {new Date(analysis.analyzed_at).toLocaleString("pt-BR")}
              </p>
            )}
          </div>
          <button
            onClick={runAnalysis}
            disabled={analyzing}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {analyzing ? (
              <>
                <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                Analisando...
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
                </svg>
                Analisar Campanhas
              </>
            )}
          </button>
        </div>

        {analysisError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">
            {analysisError}
          </div>
        )}

        {!analysis && !analyzing && (
          <p className="text-sm text-gray-400 text-center py-6">
            Clique em &quot;Analisar Campanhas&quot; para gerar diagnóstico e propostas de otimização com base nos últimos 7 dias.
          </p>
        )}

        {analysis && (
          <>
            {/* Summary */}
            <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-700">
              {analysis.summary_text}
            </div>

            {/* Alerts */}
            {analysis.alerts.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Alertas</h3>
                {analysis.alerts.map(alert => {
                  const cfg = alertConfig[alert.level];
                  return (
                    <div key={alert.id} className={`${cfg.bg} ${cfg.border} border rounded-xl p-3`}>
                      <div className="flex items-start gap-2">
                        <span>{cfg.icon}</span>
                        <div>
                          <p className={`text-sm font-medium ${cfg.text}`}>{alert.title}</p>
                          <p className={`text-xs ${cfg.text} opacity-80 mt-0.5`}>{alert.message}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pending Proposals */}
            {proposals.filter(p => p.status === "pending").length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Propostas de Otimização ({proposals.filter(p => p.status === "pending").length})
                </h3>
                {proposals.filter(p => p.status === "pending").map(proposal => {
                  const cfg = verdictConfig[proposal.verdict] ?? verdictConfig.manter;
                  const isApproving = approvingId === proposal.id;
                  return (
                    <div key={proposal.id} className="border border-gray-200 rounded-xl p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
                              {cfg.emoji} {cfg.label}
                            </span>
                            <span className="text-sm font-medium text-gray-800">{proposal.titulo}</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            {proposal.ad_name} · {proposal.adset_name}
                          </p>
                        </div>
                      </div>

                      <p className="text-sm text-gray-600">{proposal.diagnostico}</p>

                      {proposal.metricas_problema.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {proposal.metricas_problema.map((m, i) => (
                            <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                              {m}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="bg-blue-50 rounded-lg p-3">
                        <p className="text-xs font-medium text-blue-700">Ação sugerida</p>
                        <p className="text-sm text-blue-900 mt-0.5">{proposal.acao_sugerida}</p>
                      </div>

                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => approveProposal(proposal)}
                          disabled={isApproving}
                          className="flex-1 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                        >
                          {isApproving ? "Aplicando..." : proposal.action.type === "none" ? "✓ Registrar" : "✓ Aprovar e Aplicar"}
                        </button>
                        <button
                          onClick={() => rejectProposal(proposal.id)}
                          disabled={isApproving}
                          className="flex-1 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
                        >
                          ✕ Ignorar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {proposals.filter(p => p.status === "pending").length === 0 && analysis.proposals.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">
                Nenhuma proposta de otimização necessária no momento.
              </p>
            )}

            {/* History (persisted across sessions) */}
            {history.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Histórico de Otimizações ({history.length})
                </h3>
                {[...history].reverse().map(proposal => {
                  const cfg = verdictConfig[proposal.verdict] ?? verdictConfig.manter;
                  const isApproved = proposal.status === "approved";
                  const hasError = isApproved && proposal.result_message?.startsWith("Erro:");
                  return (
                    <div
                      key={proposal.id}
                      className={`border rounded-xl p-3 space-y-1.5 opacity-80 ${
                        hasError
                          ? "border-red-200 bg-red-50"
                          : isApproved
                          ? "border-green-200 bg-green-50"
                          : "border-gray-200 bg-gray-50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
                            {cfg.emoji} {cfg.label}
                          </span>
                          <span className="text-sm font-medium text-gray-700">{proposal.titulo}</span>
                        </div>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          hasError
                            ? "bg-red-100 text-red-700"
                            : isApproved
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-200 text-gray-500"
                        }`}>
                          {hasError ? "Erro" : isApproved ? "Aplicado" : "Ignorado"}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">
                        {proposal.ad_name} · {proposal.adset_name}
                      </p>
                      {proposal.result_message && (
                        <p className={`text-xs ${hasError ? "text-red-600" : "text-green-700"}`}>
                          {proposal.result_message}
                        </p>
                      )}
                      {proposal.resolved_at && (
                        <p className="text-xs text-gray-400">
                          {new Date(proposal.resolved_at).toLocaleString("pt-BR")}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
