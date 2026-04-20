"use client";

import { useState, useEffect, useCallback } from "react";
import { useAppContext } from "@/context/AppContext";
import type { DailyReport } from "@/lib/reports-store";
import type { Proposal, ActionItem } from "@/types/metrics";

function fmt(n: number) {
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}
function timeAgoDate(d: string) {
  const today = new Date().toISOString().split("T")[0];
  if (d === today) return "Hoje";
  const diff = Math.round((new Date(today).getTime() - new Date(d).getTime()) / 86400000);
  if (diff === 1) return "Ontem";
  return `${diff} dias atrás`;
}

const verdictConfig: Record<string, { label: string; color: string }> = {
  escalar:        { label: "Escalar",        color: "bg-green-100 text-green-700" },
  manter:         { label: "Manter",         color: "bg-blue-100 text-blue-700" },
  testar_variacao:{ label: "Testar",         color: "bg-purple-100 text-purple-700" },
  ajustar:        { label: "Ajustar",        color: "bg-yellow-100 text-yellow-700" },
  pausar:         { label: "Pausar",         color: "bg-red-100 text-red-700" },
};
const alertColor: Record<string, string> = {
  critical: "bg-red-50 border-red-200 text-red-700",
  warning:  "bg-yellow-50 border-yellow-200 text-yellow-700",
  info:     "bg-blue-50 border-blue-200 text-blue-600",
};

export default function RelatoriosPage() {
  const { token, selectedClient } = useAppContext();
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [selected, setSelected] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    if (!token || !selectedClient) return;
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`/api/daily-reports?clientSlug=${selectedClient.slug}&limit=14`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setFetchError(data.error ?? "Erro ao buscar relatórios");
        return;
      }
      const list: DailyReport[] = data.reports ?? [];
      setReports(list);
      if (list.length > 0 && !selected) setSelected(list[0]);
    } catch {
      setFetchError("Erro de conexão ao buscar relatórios");
    } finally {
      setLoading(false);
    }
  }, [token, selectedClient]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  async function approveProposal(proposal: Proposal, isReject: boolean, reportDate: string) {
    if (!token || !selectedClient) return;
    setApproving(proposal.id);
    try {
      const res = await fetch("/api/proposals/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ 
          clientSlug: selectedClient.slug, 
          date: reportDate,
          proposalId: proposal.id,
          action: proposal.action,
          reject: isReject 
        }),
      });
      const data = await res.json();
      const msg = res.ok ? data.message : `Erro: ${data.error}`;
      const finalStatus = isReject ? "ignored" : "approved";
      // Update proposal status in selected report
      if (selected) {
        const update = (r: DailyReport) => ({
          ...r,
          meta: r.meta ? {
            ...r.meta,
            proposals: r.meta.proposals.map(p => p.id === proposal.id ? { ...p, status: finalStatus as any, result_message: msg } : p),
          } : r.meta,
          google: r.google ? {
            ...r.google,
            proposals: r.google.proposals.map(p => p.id === proposal.id ? { ...p, status: finalStatus as any, result_message: msg } : p),
          } : r.google,
        });
        setSelected(update(selected));
        setReports(prev => prev.map(r => r.id === selected.id ? update(r) : r));
      }
    } finally {
      setApproving(null);
    }
  }

  if (!selectedClient) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="bg-white rounded-2xl p-12 text-center border border-gray-100 shadow-sm">
          <p className="text-gray-400 text-sm">Selecione um cliente para ver os relatórios</p>
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-4">
        <h1 className="text-xl font-bold text-gray-900">Relatórios Diários</h1>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
          <p className="font-semibold text-red-800">Erro ao carregar relatórios</p>
          <p className="text-sm text-red-700 mt-1">{fetchError}</p>
          <button onClick={fetchReports} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Relatórios Diários</h1>
          <p className="text-sm text-gray-500">{selectedClient.nome} · últimos 14 dias</p>
        </div>
        <button onClick={fetchReports} disabled={loading}
          className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
          Atualizar
        </button>
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin border-blue-500" />
        </div>
      )}

      {!loading && reports.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <p className="text-gray-400 text-sm">Nenhum relatório disponível ainda.</p>
          <p className="text-gray-300 text-xs mt-1">Os relatórios são gerados automaticamente todo dia às 9h.</p>
        </div>
      )}

      {!loading && reports.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
          {/* Sidebar — date list */}
          <div className="space-y-2">
            {reports.map(r => (
              <button
                key={r.id}
                onClick={() => setSelected(r)}
                className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                  selected?.id === r.id
                    ? "border-blue-300 bg-blue-50"
                    : "border-gray-100 bg-white hover:bg-gray-50"
                }`}
              >
                <p className="text-sm font-semibold text-gray-800">{fmtDate(r.date)}</p>
                <p className="text-xs text-gray-400">{timeAgoDate(r.date)}</p>
                <div className="flex gap-2 mt-1">
                  {r.meta && (
                    <span className="text-xs text-blue-600 font-medium">Meta</span>
                  )}
                  {r.google && (
                    <span className="text-xs text-orange-500 font-medium">Google</span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Main content */}
          {selected && (
            <div className="lg:col-span-3 space-y-5">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-gray-900">{fmtDate(selected.date)}</h2>
                <span className="text-sm text-gray-400">{timeAgoDate(selected.date)}</span>
              </div>

              {/* Metrics summary bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {selected.meta && (
                  <>
                    <div className="bg-white border border-gray-100 rounded-xl p-3 text-center shadow-sm">
                      <p className="text-xs text-gray-400">Meta · Gasto 7d</p>
                      <p className="text-sm font-bold text-gray-900 mt-0.5">{fmt(selected.meta.spend_7d ?? 0)}</p>
                    </div>
                    <div className="bg-white border border-gray-100 rounded-xl p-3 text-center shadow-sm">
                      <p className="text-xs text-gray-400">Meta · Leads 7d</p>
                      <p className="text-sm font-bold text-gray-900 mt-0.5">{selected.meta.leads_7d ?? 0}</p>
                    </div>
                  </>
                )}
                {selected.google && (
                  <>
                    <div className="bg-white border border-blue-100 rounded-xl p-3 text-center shadow-sm">
                      <p className="text-xs text-gray-400">Google · Gasto 7d</p>
                      <p className="text-sm font-bold text-gray-900 mt-0.5">{fmt(selected.google.spend_7d ?? 0)}</p>
                    </div>
                    <div className="bg-white border border-blue-100 rounded-xl p-3 text-center shadow-sm">
                      <p className="text-xs text-gray-400">Google · Conv. 7d</p>
                      <p className="text-sm font-bold text-gray-900 mt-0.5">{(selected.google.conversions_7d ?? 0).toFixed(0)}</p>
                    </div>
                  </>
                )}
              </div>

              {/* Meta analysis */}
              {selected.meta && (
                <ReportSection
                  platform="Meta Ads"
                  platformColor="text-blue-600"
                  borderColor="border-blue-100"
                  analysis={selected.meta}
                  approving={approving}
                  onApprove={(p, isReject) => approveProposal(p, isReject, selected.date)}
                />
              )}

              {/* Google analysis */}
              {selected.google && (
                <ReportSection
                  platform="Google Ads"
                  platformColor="text-orange-600"
                  borderColor="border-orange-100"
                  analysis={selected.google}
                  approving={approving}
                  onApprove={(p, isReject) => approveProposal(p, isReject, selected.date)}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReportSection({ platform, platformColor, borderColor, analysis, approving, onApprove }: {
  platform: string;
  platformColor: string;
  borderColor: string;
  analysis: DailyReport["meta"] | DailyReport["google"];
  approving: string | null;
  onApprove: (p: Proposal, reject: boolean) => void;
}) {
  if (!analysis) return null;
  const pending = analysis.proposals.filter(p => p.status === "pending");
  const resolved = analysis.proposals.filter(p => p.status !== "pending");

  return (
    <div className={`bg-white rounded-2xl border ${borderColor} shadow-sm overflow-hidden`}>
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <span className={`font-semibold text-sm ${platformColor}`}>{platform}</span>
        <span className="text-xs text-gray-400">
          {pending.length > 0 && <span className="text-orange-500 font-medium">{pending.length} pendente{pending.length > 1 ? "s" : ""} · </span>}
          {analysis.alerts.length} alerta{analysis.alerts.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="p-5 space-y-4">
        {/* Summary */}
        {analysis.summary_text ? (
          <p className="text-sm text-gray-700 leading-relaxed">{analysis.summary_text}</p>
        ) : analysis.alerts.length === 0 && analysis.proposals.length === 0 ? (
          <p className="text-sm text-green-700 bg-green-50 rounded-xl px-3 py-2.5 border border-green-100">
            Todas as campanhas estão performando dentro dos benchmarks. Nenhuma ação necessária no momento.
          </p>
        ) : null}

        {/* Alerts */}
        {analysis.alerts.length > 0 && (
          <div className="space-y-2">
            {analysis.alerts.map(alert => (
              <div key={alert.id} className={`rounded-xl px-3 py-2.5 border text-xs ${alertColor[alert.level] ?? alertColor.info}`}>
                <span className="font-semibold">{alert.title}</span>
                {" · "}{alert.message}
              </div>
            ))}
          </div>
        )}

        {/* Pending proposals */}
        {pending.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Propostas pendentes</p>
            {pending.map(p => {
              const vc = verdictConfig[p.verdict] ?? { label: p.verdict, color: "bg-gray-100 text-gray-600" };
              const isAction = p.action.type !== "none";
              return (
                <div key={p.id} className="rounded-xl border border-gray-100 p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${vc.color}`}>{vc.label}</span>
                        <span className="text-sm font-semibold text-gray-800">{p.titulo}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{p.ad_name}</p>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      <button
                        onClick={() => onApprove(p, false)}
                        disabled={approving === p.id}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all disabled:opacity-50 ${
                          isAction
                            ? "bg-green-600 text-white hover:bg-green-700"
                            : "bg-blue-600 text-white hover:bg-blue-700"
                        }`}
                      >
                        {approving === p.id ? "..." : isAction ? "✓ Aplicar" : "✓ Registrar"}
                      </button>
                      <button
                        onClick={() => onApprove(p, true)}
                        disabled={approving === p.id}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all disabled:opacity-50 border border-gray-200 text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                      >
                        ✕ Recusar
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-600">{p.diagnostico}</p>
                  <p className="text-xs text-gray-500 italic">{p.acao_sugerida}</p>
                </div>
              );
            })}
          </div>
        )}

        {/* Plano de ação */}
        {analysis.plano_de_acao && analysis.plano_de_acao.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Plano de Implementação</p>
            <div className="space-y-2">
              {analysis.plano_de_acao.map((item: ActionItem) => {
                const impactColor = item.impacto === "alto" ? "bg-red-50 border-red-200" : item.impacto === "medio" ? "bg-yellow-50 border-yellow-200" : "bg-gray-50 border-gray-200";
                const nivelLabel: Record<string, string> = { campanha: "Campanha", conjunto: "Conjunto", anuncio: "Anúncio", publico: "Público" };
                const esforcoLabel: Record<string, string> = { simples: "Simples", medio: "Médio", complexo: "Complexo" };
                return (
                  <div key={item.prioridade} className={`rounded-xl border px-4 py-3 ${impactColor}`}>
                    <div className="flex items-start gap-3">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-white border border-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">{item.prioridade}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-gray-800">{item.titulo}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-500">{nivelLabel[item.nivel] ?? item.nivel}</span>
                          <span className="text-xs text-gray-400">{esforcoLabel[item.esforco] ?? item.esforco}</span>
                        </div>
                        <p className="text-xs text-gray-600 mt-1 leading-relaxed">{item.descricao}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Resolved proposals */}
        {resolved.length > 0 && (
          <details className="group">
            <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 list-none flex items-center gap-1">
              <span className="group-open:rotate-90 transition-transform inline-block">›</span>
              {resolved.length} proposta{resolved.length > 1 ? "s" : ""} resolvida{resolved.length > 1 ? "s" : ""}
            </summary>
            <div className="mt-2 space-y-1.5">
              {resolved.map(p => (
                <div key={p.id} className={`rounded-lg px-3 py-2 text-xs border ${
                  p.status === "ignored" ? "bg-gray-50 border-gray-100 text-gray-400" : "bg-green-50 border-green-100 text-green-700"
                }`}>
                  <span className="font-medium">{p.titulo}</span>
                  {p.result_message && <span className="ml-2 opacity-75">· {p.result_message}</span>}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
