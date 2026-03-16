"use client";

import { useState, useEffect } from "react";
import { useAppContext } from "@/context/AppContext";
import Link from "next/link";
import type { ClientOverview } from "@/app/api/overview/route";
import type { Proposal } from "@/types/metrics";

interface OverviewResponse {
  overview: ClientOverview[];
  fetched_at: string;
}

interface SystemOptimizationEntry {
  at: string;
  titulo: string;
  acao_sugerida: string;
  result_message: string;
  status: "approved" | "ignored";
  ad_name: string;
}

interface SystemOptimization {
  at: string;                         // most recent resolved_at
  titulo: string;                     // most recent titulo
  result_message: string;
  status: "approved" | "ignored";
  entries: SystemOptimizationEntry[]; // all entries from last session (same day)
  session_date: string;               // YYYY-MM-DD of last session
}

const statusConfig = {
  ok: {
    label: "Ok",
    bg: "bg-green-50",
    border: "border-green-200",
    badge: "bg-green-100 text-green-700",
    dot: "bg-green-500",
    icon: "✓",
  },
  razoavel: {
    label: "Razoável",
    bg: "bg-yellow-50",
    border: "border-yellow-200",
    badge: "bg-yellow-100 text-yellow-700",
    dot: "bg-yellow-500",
    icon: "~",
  },
  critical: {
    label: "Crítico",
    bg: "bg-red-50",
    border: "border-red-200",
    badge: "bg-red-100 text-red-700",
    dot: "bg-red-500 animate-pulse",
    icon: "!",
  },
  no_data: {
    label: "Sem dados",
    bg: "bg-gray-50",
    border: "border-gray-200",
    badge: "bg-gray-100 text-gray-500",
    dot: "bg-gray-400",
    icon: "–",
  },
};

function formatCurrency(v: number) {
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `há ${days} dia${days > 1 ? "s" : ""}`;
  if (hours > 0) return `há ${hours}h`;
  if (mins > 0) return `há ${mins}min`;
  return "agora mesmo";
}

function getSystemOptimization(slug: string): SystemOptimization | null {
  try {
    const raw = localStorage.getItem(`analysis_history_${slug}`);
    if (!raw) return null;
    const history: Proposal[] = JSON.parse(raw);
    const resolved = history.filter(p => p.resolved_at);
    if (resolved.length === 0) return null;
    resolved.sort((a, b) => new Date(b.resolved_at!).getTime() - new Date(a.resolved_at!).getTime());

    // Most recent entry
    const last = resolved[0];
    const sessionDate = last.resolved_at!.split("T")[0];

    // Group all entries from the same session day
    const sessionEntries: SystemOptimizationEntry[] = resolved
      .filter(p => p.resolved_at!.split("T")[0] === sessionDate)
      .map(p => ({
        at: p.resolved_at!,
        titulo: p.titulo,
        acao_sugerida: p.acao_sugerida,
        result_message: p.result_message ?? "",
        status: p.status as "approved" | "ignored",
        ad_name: p.ad_name,
      }));

    return {
      at: last.resolved_at!,
      titulo: last.titulo,
      result_message: last.result_message ?? "",
      status: last.status as "approved" | "ignored",
      entries: sessionEntries,
      session_date: sessionDate,
    };
  } catch {
    return null;
  }
}

interface ResolvedLastChange {
  at: string;
  via: "sistema" | "gerenciador";
  entity_name: string;
  entity_type?: string;
  titulo?: string;          // system only
  result_message?: string;  // system only
  status?: "approved" | "ignored"; // system only
}

function resolveLastChange(
  slug: string,
  last_meta_change: ClientOverview["last_meta_change"]
): ResolvedLastChange | null {
  const sys = getSystemOptimization(slug);

  if (!sys && !last_meta_change) return null;

  if (sys && !last_meta_change) {
    return { at: sys.at, via: "sistema", entity_name: sys.titulo, titulo: sys.titulo, result_message: sys.result_message, status: sys.status };
  }

  if (!sys && last_meta_change) {
    return { at: last_meta_change.at, via: "gerenciador", entity_name: last_meta_change.entity_name, entity_type: last_meta_change.entity_type };
  }

  // Both exist — compare timestamps
  const sysTime = new Date(sys!.at).getTime();
  const metaTime = new Date(last_meta_change!.at).getTime();

  if (sysTime >= metaTime) {
    return { at: sys!.at, via: "sistema", entity_name: sys!.titulo, titulo: sys!.titulo, result_message: sys!.result_message, status: sys!.status };
  } else {
    return { at: last_meta_change!.at, via: "gerenciador", entity_name: last_meta_change!.entity_name, entity_type: last_meta_change!.entity_type };
  }
}

function wasManuallyEditedAfterSystem(
  slug: string,
  last_meta_change: ClientOverview["last_meta_change"]
): boolean {
  if (!last_meta_change) return false;
  const sys = getSystemOptimization(slug);
  if (!sys) return true; // never optimized by system, Meta has changes
  return new Date(last_meta_change.at).getTime() > new Date(sys.at).getTime();
}

export default function VisaoGeralPage() {
  const { token } = useAppContext();
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // force re-render after hydration so localStorage is available
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => { setHydrated(true); }, []);

  async function fetchOverview() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/overview", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json: OverviewResponse = await res.json();
      if (!res.ok) throw new Error((json as unknown as { error: string }).error ?? "Erro ao buscar dados");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const counts = data && hydrated
    ? {
        critical: data.overview.filter(c => c.status === "critical").length,
        razoavel: data.overview.filter(c => c.status === "razoavel").length,
        ok: data.overview.filter(c => c.status === "ok").length,
        no_data: data.overview.filter(c => c.status === "no_data").length,
      }
    : null;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Visão Geral</h1>
          <p className="text-sm text-gray-500">
            {data
              ? `Atualizado em ${new Date(data.fetched_at).toLocaleString("pt-BR")} · últimos 7 dias`
              : "Panorama de todos os clientes ativos"}
          </p>
        </div>
        <button
          onClick={fetchOverview}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              Carregando...
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
              </svg>
              Atualizar
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">{error}</div>
      )}

      {/* Summary bar */}
      {counts && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(["critical", "razoavel", "ok", "no_data"] as const).map(s => {
            const cfg = statusConfig[s];
            const count = counts[s];
            return (
              <div key={s} className={`${cfg.bg} ${cfg.border} border rounded-xl p-4 flex items-center gap-3`}>
                <div className={`w-3 h-3 rounded-full ${cfg.dot}`} />
                <div>
                  <p className="text-lg font-bold text-gray-900">{count}</p>
                  <p className="text-xs text-gray-500">{cfg.label}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Skeleton */}
      {loading && !data && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white border border-gray-100 rounded-2xl p-5 animate-pulse space-y-3">
              <div className="h-4 bg-gray-200 rounded w-1/2" />
              <div className="h-3 bg-gray-100 rounded w-1/3" />
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3].map(j => <div key={j} className="h-10 bg-gray-100 rounded" />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Client cards */}
      {data && hydrated && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...data.overview]
            .sort((a, b) => {
              const order: Record<string, number> = { critical: 0, razoavel: 1, ok: 2, no_data: 3 };
              return (order[a.status] ?? 4) - (order[b.status] ?? 4);
            })
            .map(client => {
              const cfg = statusConfig[client.status];
              const lastChange = resolveLastChange(client.slug, client.last_meta_change);
              const manualAfterSystem = wasManuallyEditedAfterSystem(client.slug, client.last_meta_change);
              const sysOpt = getSystemOptimization(client.slug);

              return (
                <div
                  key={client.slug}
                  className={`bg-white border-2 ${cfg.border} rounded-2xl p-5 space-y-4 shadow-sm`}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot}`} />
                        <h2 className="text-sm font-bold text-gray-900 truncate">{client.nome}</h2>
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.badge}`}>
                          {cfg.icon} {cfg.label}
                        </span>
                        {client.active_ads > 0 && (
                          <span className="text-xs text-gray-500">
                            {client.active_ads} anúncio{client.active_ads > 1 ? "s" : ""} ativo{client.active_ads > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </div>
                    <Link
                      href="/dashboard"
                      className="shrink-0 text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors"
                    >
                      Ver →
                    </Link>
                  </div>

                  {/* Manual edit warning banner */}
                  {manualAfterSystem && client.last_meta_change && (
                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 flex items-start gap-2">
                      <span className="text-orange-500 text-sm shrink-0">✏️</span>
                      <div>
                        <p className="text-xs font-semibold text-orange-800">Alterado manualmente no Gerenciador</p>
                        <p className="text-xs text-orange-700 mt-0.5">
                          {client.last_meta_change.entity_type === "campanha" ? "Campanha" :
                           client.last_meta_change.entity_type === "conjunto" ? "Conjunto" : "Anúncio"}{" "}
                          <span className="font-medium">&ldquo;{client.last_meta_change.entity_name}&rdquo;</span>
                          {" "}alterado {timeAgo(client.last_meta_change.at)} ({formatDate(client.last_meta_change.at)})
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Metrics */}
                  {client.status !== "no_data" && (
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-gray-50 rounded-xl p-2.5 text-center">
                        <p className="text-xs text-gray-400">Gasto 7d</p>
                        <p className="text-sm font-semibold text-gray-800 mt-0.5">
                          {formatCurrency(client.spend_7d)}
                        </p>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-2.5 text-center">
                        <p className="text-xs text-gray-400">CTR médio</p>
                        <p className={`text-sm font-semibold mt-0.5 ${
                          client.avg_ctr < 0.8 ? "text-red-600" : client.avg_ctr < 1 ? "text-yellow-600" : "text-gray-800"
                        }`}>
                          {client.avg_ctr.toFixed(2)}%
                        </p>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-2.5 text-center">
                        <p className="text-xs text-gray-400">CPM médio</p>
                        <p className={`text-sm font-semibold mt-0.5 ${
                          client.avg_cpm > 20 ? "text-red-600" : client.avg_cpm > 15 ? "text-yellow-600" : "text-gray-800"
                        }`}>
                          {formatCurrency(client.avg_cpm)}
                        </p>
                      </div>
                      {client.leads_7d > 0 && (
                        <div className="bg-gray-50 rounded-xl p-2.5 text-center">
                          <p className="text-xs text-gray-400">Leads 7d</p>
                          <p className="text-sm font-semibold text-gray-800 mt-0.5">{client.leads_7d}</p>
                        </div>
                      )}
                      {client.cpl > 0 && (
                        <div className="bg-gray-50 rounded-xl p-2.5 text-center">
                          <p className="text-xs text-gray-400">CPL</p>
                          <p className={`text-sm font-semibold mt-0.5 ${
                            client.cpl > 100 ? "text-red-600" : client.cpl > 80 ? "text-yellow-600" : "text-gray-800"
                          }`}>
                            {formatCurrency(client.cpl)}
                          </p>
                        </div>
                      )}
                      <div className="bg-gray-50 rounded-xl p-2.5 text-center">
                        <p className="text-xs text-gray-400">Frequência</p>
                        <p className={`text-sm font-semibold mt-0.5 ${
                          client.avg_frequency > 3.5 ? "text-red-600" : client.avg_frequency > 2.5 ? "text-yellow-600" : "text-gray-800"
                        }`}>
                          {client.avg_frequency.toFixed(1)}x
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Issues */}
                  {client.issues.length > 0 && (
                    <div className="space-y-1">
                      {client.issues.map((issue, i) => (
                        <div key={i} className={`flex items-start gap-1.5 text-xs ${
                          client.status === "critical" ? "text-red-700" : "text-yellow-700"
                        }`}>
                          <span className="shrink-0 mt-0.5">{client.status === "critical" ? "●" : "○"}</span>
                          {issue}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* No data */}
                  {client.status === "no_data" && (
                    <p className="text-xs text-gray-400 text-center py-2">
                      {client.error ?? "Nenhum dado de campanha nos últimos 7 dias"}
                    </p>
                  )}

                  {/* Footer — last optimization info */}
                  <div className="pt-2 border-t border-gray-100 space-y-3">

                    {/* System optimization block */}
                    {sysOpt ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm">🤖</span>
                            <p className="text-xs font-semibold text-gray-700">Última otimização pelo sistema</p>
                          </div>
                          <span className="text-xs text-gray-400">{timeAgo(sysOpt.at)} · {formatDate(sysOpt.at)}</span>
                        </div>
                        {/* Each action from the last session */}
                        <div className="space-y-1.5 pl-5">
                          {sysOpt.entries.map((entry, i) => (
                            <div
                              key={i}
                              className={`rounded-lg p-2.5 text-xs border ${
                                entry.status === "ignored"
                                  ? "bg-gray-50 border-gray-200 text-gray-500"
                                  : entry.result_message.startsWith("Erro:")
                                  ? "bg-red-50 border-red-200 text-red-700"
                                  : "bg-green-50 border-green-200 text-green-800"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="font-medium">{entry.titulo}</span>
                                <span className={`shrink-0 px-1.5 py-0.5 rounded-full text-xs font-medium ${
                                  entry.status === "ignored"
                                    ? "bg-gray-200 text-gray-500"
                                    : entry.result_message.startsWith("Erro:")
                                    ? "bg-red-100 text-red-600"
                                    : "bg-green-100 text-green-700"
                                }`}>
                                  {entry.status === "ignored" ? "Ignorado" : entry.result_message.startsWith("Erro:") ? "Erro" : "Aplicado"}
                                </span>
                              </div>
                              <p className="mt-1 text-gray-500 line-clamp-1" title={entry.acao_sugerida}>
                                {entry.acao_sugerida}
                              </p>
                              {entry.result_message && entry.status !== "ignored" && (
                                <p className={`mt-0.5 font-medium ${entry.result_message.startsWith("Erro:") ? "text-red-600" : "text-green-700"}`}>
                                  {entry.result_message}
                                </p>
                              )}
                              <p className="mt-0.5 text-gray-400 italic">{entry.ad_name}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-300 text-sm">🤖</span>
                        <p className="text-xs text-gray-400">Nenhuma otimização pelo sistema registrada</p>
                      </div>
                    )}

                    {/* Last Meta change */}
                    {client.last_meta_change && (
                      <div className={`rounded-xl p-3 border flex items-start gap-2 ${
                        manualAfterSystem
                          ? "bg-orange-50 border-orange-200"
                          : "bg-gray-50 border-gray-200"
                      }`}>
                        <span className="text-sm shrink-0">{manualAfterSystem ? "⚠️" : "📋"}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <p className={`text-xs font-semibold ${manualAfterSystem ? "text-orange-800" : "text-gray-700"}`}>
                              {manualAfterSystem ? "Alterado manualmente no Gerenciador" : "Última alteração no Gerenciador"}
                            </p>
                            <span className={`text-xs ${manualAfterSystem ? "text-orange-600" : "text-gray-400"}`}>
                              {timeAgo(client.last_meta_change.at)}
                            </span>
                          </div>
                          <p className={`text-xs mt-0.5 ${manualAfterSystem ? "text-orange-700" : "text-gray-500"}`}>
                            {client.last_meta_change.entity_type === "campanha" ? "Campanha" :
                             client.last_meta_change.entity_type === "conjunto" ? "Conjunto" : "Anúncio"}{" "}
                            <span className="font-medium">&ldquo;{client.last_meta_change.entity_name}&rdquo;</span>
                          </p>
                          <p className={`text-xs mt-0.5 ${manualAfterSystem ? "text-orange-500" : "text-gray-400"}`}>
                            {formatDate(client.last_meta_change.at)}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {data && data.overview.length === 0 && (
        <div className="bg-white rounded-2xl p-12 text-center border border-gray-100 shadow-sm">
          <p className="text-gray-400 text-sm">Nenhum cliente ativo encontrado.</p>
        </div>
      )}
    </div>
  );
}
