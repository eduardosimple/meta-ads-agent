import { getReportsByDate } from "@/lib/reports-store";
import { getDesignBrief } from "@/lib/design-briefs";
import { notFound } from "next/navigation";
import type { DailyReport } from "@/lib/reports-store";
import type { Proposal } from "@/types/metrics";
import ApprovalCard from "@/components/report/ApprovalCard";
import CreateCreativeCard from "@/components/report/CreateCreativeCard";
import ActionButton from "@/components/report/ActionButton";
import GenerateCopyButton from "@/components/report/GenerateCopyButton";
import MarkDoneButton from "@/components/report/MarkDoneButton";
import TargetingChangeCard from "@/components/report/TargetingChangeCard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function fmtBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function fmtDate(date: string) {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

const verdictLabel: Record<string, string> = {
  pausar: "PAUSAR", ajustar: "AJUSTAR", testar_variacao: "TESTAR",
  escalar: "ESCALAR", manter: "MANTER",
};
const verdictTag: Record<string, string> = {
  pausar: "bg-red-600 text-white",
  ajustar: "bg-amber-500 text-white",
  testar_variacao: "bg-violet-600 text-white",
  escalar: "bg-emerald-600 text-white",
  manter: "bg-slate-400 text-white",
};
// Quão urgente é cada verdict (menor = mais urgente) — desempate da ordenação
const verdictUrgency: Record<string, number> = {
  pausar: 0, ajustar: 1, testar_variacao: 2, escalar: 3, manter: 4,
};

type StatusLevel = "red" | "yellow" | "green";

/** Status do cliente para triagem: vermelho queima dinheiro, amarelo precisa de ajuste, verde ok. */
function clientStatus(pending: Proposal[]): { level: StatusLevel; dot: string; ring: string; label: string } {
  const hasPausar = pending.some(p => p.verdict === "pausar");
  const hasAdjust = pending.some(p => p.verdict === "ajustar" || p.verdict === "testar_variacao");
  if (hasPausar) return { level: "red", dot: "bg-red-500", ring: "border-red-200", label: "Crítico" };
  if (hasAdjust) return { level: "yellow", dot: "bg-amber-400", ring: "border-amber-200", label: "Ajustar" };
  return { level: "green", dot: "bg-emerald-500", ring: "border-gray-100", label: "Ok" };
}

function scoreColor(score: number): { bar: string; text: string; dot: string } {
  if (score < 40) return { bar: "bg-red-500", text: "text-red-600", dot: "🔴" };
  if (score < 70) return { bar: "bg-amber-400", text: "text-amber-600", dot: "🟡" };
  return { bar: "bg-emerald-500", text: "text-emerald-600", dot: "🟢" };
}

/** Barra de 10 blocos proporcional ao score (0-100), colorida por faixa. */
function ScoreBar({ score }: { score: number }) {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  const filled = Math.round(s / 10);
  const c = scoreColor(s);
  return (
    <div className="flex items-center gap-2 shrink-0">
      <div className="flex gap-[2px]" aria-label={`score ${s}`}>
        {Array.from({ length: 10 }).map((_, i) => (
          <span
            key={i}
            className={`w-1.5 h-3.5 rounded-[1px] ${i < filled ? c.bar : "bg-gray-200"}`}
          />
        ))}
      </div>
      <span className={`text-xs font-bold tabular-nums ${c.text}`}>{s}</span>
      <span className="text-xs leading-none">{c.dot}</span>
    </div>
  );
}

function pScore(p: Proposal): number {
  return typeof p.score === "number" ? p.score : 50;
}

function ProposalRow({
  p, clientSlug, date, reportKey, platform = "meta",
}: {
  p: Proposal; clientSlug: string; date: string; reportKey: string; platform?: "meta" | "google";
}) {
  const isPauseScale = p.verdict === "pausar" || p.verdict === "escalar";
  const isCreativeAdjust = p.verdict === "testar_variacao" || (p.verdict === "ajustar" && (!p.ajuste_tipo || p.ajuste_tipo === "criativo"));
  const isManualAdjust = p.verdict === "ajustar" && p.ajuste_tipo && p.ajuste_tipo !== "criativo";
  const scaleBudget = p.action.type === "scale_budget" ? p.action : null;

  return (
    <div className="rounded-xl border border-gray-100 bg-white px-3 py-2.5 space-y-1.5">
      {/* Linha 1: nome + barra de score + selo de ação */}
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold text-gray-900 flex-1 min-w-0 truncate">{p.ad_name}</p>
        <ScoreBar score={pScore(p)} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-gray-400 truncate min-w-0">
          {p.campaign_name}{p.adset_name ? ` · ${p.adset_name}` : ""}
        </p>
        <span className={`shrink-0 text-[10px] tracking-wide px-2 py-0.5 rounded-md font-bold ${verdictTag[p.verdict] ?? "bg-gray-400 text-white"}`}>
          {verdictLabel[p.verdict] ?? p.verdict.toUpperCase()}
        </span>
      </div>

      {/* Diagnóstico + métricas */}
      <p className="text-xs text-gray-600 leading-snug">{p.diagnostico}</p>
      {p.metricas_problema.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {p.metricas_problema.slice(0, 4).map((m, i) => (
            <span key={i} className="text-[10px] px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">{m}</span>
          ))}
        </div>
      )}
      {p.acao_sugerida && (
        <p className="text-xs text-gray-700 font-medium">→ {p.acao_sugerida}</p>
      )}

      {/* ───── Action area (preservada — interatividade intacta) ───── */}
      {p.status === "approved" && (
        <p className="text-xs text-emerald-600 font-medium">Executado — {p.result_message}</p>
      )}
      {p.status === "rejected" && (
        <p className="text-xs text-gray-400">Ignorado.</p>
      )}

      {p.status === "pending" && p.copy_sugerida && (
        <ApprovalCard
          clientSlug={clientSlug}
          date={date}
          adId={p.ad_id}
          platform={platform}
          adName={p.ad_name}
          imageBase64={p.copy_sugerida.image_base64}
          versaoA={p.copy_sugerida.versao_a}
          versaoB={p.copy_sugerida.versao_b}
          initialStatus={p.status}
          resultMessage={p.result_message}
          reportKey={reportKey}
        />
      )}
      {p.status === "pending" && !p.copy_sugerida && isCreativeAdjust && (
        <GenerateCopyButton
          clientSlug={clientSlug}
          date={date}
          adId={p.ad_id}
          platform={platform}
          reportKey={reportKey}
          verdict={p.verdict as "ajustar" | "testar_variacao"}
        />
      )}
      {p.status === "pending" && isManualAdjust && p.ajuste_tipo === "publico" && (p.action.type === "create_adset" || p.action.type === "update_adset_targeting") && (
        <TargetingChangeCard
          clientSlug={clientSlug}
          date={date}
          adId={p.ad_id}
          reportKey={reportKey}
          targetingSummaryOld={p.adset_name}
          targetingSummaryNew={p.action.targeting_summary_new}
          adsetNameNew={p.action.type === "create_adset" ? p.action.adset_name : undefined}
          actionType={p.action.type === "create_adset" ? "create_adset" : "update_targeting"}
          initialStatus={p.status}
          initialResultMessage={p.result_message}
        />
      )}
      {p.status === "pending" && isManualAdjust && (p.ajuste_tipo !== "publico" || (p.action.type !== "create_adset" && p.action.type !== "update_adset_targeting")) && (
        <MarkDoneButton
          clientSlug={clientSlug}
          date={date}
          adId={p.ad_id}
          platform={platform}
          reportKey={reportKey}
          ajusteTipo={p.ajuste_tipo!}
        />
      )}
      {p.status === "pending" && !p.copy_sugerida && isPauseScale && (
        <ActionButton
          clientSlug={clientSlug}
          date={date}
          adId={p.ad_id}
          platform={platform}
          actionType={p.verdict === "pausar" ? "pause" : "scale"}
          label={
            p.verdict === "pausar"
              ? "Pausar anúncio"
              : scaleBudget
              ? `Escalar para ${(scaleBudget.new_budget_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/dia`
              : "Escalar"
          }
          reportKey={reportKey}
          initialStatus={p.status}
          initialResultMessage={p.result_message}
        />
      )}
    </div>
  );
}

export default async function DailyReportPage({
  params,
  searchParams,
}: {
  params: { date: string };
  searchParams: { key?: string; [k: string]: string | undefined };
}) {
  const { date } = params;
  const reportKey = searchParams.key ?? "";

  const secret = process.env.REPORT_VIEW_SECRET;
  if (secret && searchParams.key !== secret) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Acesso não autorizado.</p>
      </div>
    );
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return notFound();

  let reports: DailyReport[] = [];
  try { reports = await getReportsByDate(date); } catch { /* empty state */ }

  const briefs = await Promise.all(reports.map(r => getDesignBrief(r.client_slug).catch(() => null)));

  // Pré-computa status/ordenação por cliente
  const enriched = reports.map((report, idx) => {
    const metaProposals = report.meta?.proposals ?? [];
    const googleProposals = report.google?.proposals ?? [];
    const pending = [...metaProposals, ...googleProposals].filter(p => p.status === "pending");
    const pendingActionable = pending.filter(p => p.verdict !== "manter");
    const status = clientStatus(pendingActionable);
    const spend = (report.meta?.spend_7d ?? 0) + (report.google?.spend_7d ?? 0);
    return { report, idx, metaProposals, googleProposals, pending, pendingActionable, status, spend };
  });

  // Triagem: vermelho → amarelo → verde; dentro, maior gasto primeiro
  const statusRank: Record<StatusLevel, number> = { red: 0, yellow: 1, green: 2 };
  enriched.sort((a, b) =>
    statusRank[a.status.level] - statusRank[b.status.level] || b.spend - a.spend
  );

  const totalSpend = enriched.reduce((s, e) => s + e.spend, 0);
  const totalPending = enriched.reduce((n, e) => n + e.pending.length, 0);
  const criticalCount = enriched.filter(e => e.status.level === "red").length;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">

        {/* Header */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <p className="text-xs text-gray-400 uppercase tracking-wider font-medium">Simple MKT Digital</p>
          <h1 className="text-xl font-bold text-gray-900 mt-1">Relatório Diário</h1>
          <p className="text-sm text-gray-500 mt-0.5">{fmtDate(date)}</p>
          <div className="grid grid-cols-4 gap-3 mt-4 pt-4 border-t border-gray-100 text-center">
            <div>
              <p className="text-xs text-gray-400">Clientes</p>
              <p className="text-lg font-bold text-gray-900">{reports.length}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Gasto 7d</p>
              <p className="text-lg font-bold text-gray-900">{fmtBRL(totalSpend)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Críticos</p>
              <p className={`text-lg font-bold ${criticalCount > 0 ? "text-red-600" : "text-gray-900"}`}>{criticalCount}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Ações</p>
              <p className={`text-lg font-bold ${totalPending > 0 ? "text-amber-600" : "text-gray-900"}`}>{totalPending}</p>
            </div>
          </div>
        </div>

        {reports.length === 0 && (
          <div className="bg-white rounded-2xl p-10 text-center border border-gray-100">
            <p className="text-gray-400 text-sm">Nenhum relatório para {fmtDate(date)}.</p>
            <p className="text-xs text-gray-300 mt-1">O cron executa diariamente a partir das 6h.</p>
          </div>
        )}

        {/* Clientes — ordenados por urgência (triagem) */}
        {enriched.map(({ report, idx, metaProposals, googleProposals, pending, pendingActionable, status }) => {
          const brief = briefs[idx];

          // Itens acionáveis ordenados pior → melhor (score asc; desempate por urgência do verdict)
          const sortedActions = [...pendingActionable].sort((a, b) =>
            pScore(a) - pScore(b) ||
            (verdictUrgency[a.verdict] ?? 9) - (verdictUrgency[b.verdict] ?? 9)
          );
          const metaPlatform = new Set(metaProposals.map(p => p.id));

          // CreateCreativeCard: pior e melhor
          const allProposals = [...metaProposals, ...googleProposals];
          const worstAd = allProposals.find(p => (p.verdict === "pausar" || p.verdict === "ajustar") && p.status === "pending");
          const bestAd = allProposals.find(p => p.verdict === "escalar" || p.verdict === "manter");

          // Contexto de-enfatizado
          const infoAlerts = [
            ...(report.meta?.alerts ?? []),
            ...(report.google?.alerts ?? []),
          ];
          const planoAcao = report.meta?.plano_de_acao ?? [];

          return (
            <details
              key={report.id}
              className={`group bg-white rounded-2xl border-2 shadow-sm overflow-hidden ${status.ring}`}
            >
              {/* Linha do cliente (recolhida) — clicável para abrir as ações */}
              <summary className="px-5 py-3.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden hover:bg-gray-50/70 transition-colors group-open:border-b group-open:border-gray-100">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${status.dot}`} />
                    <p className="font-bold text-gray-900 text-sm truncate">{report.client_name}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      status.level === "red" ? "bg-red-100 text-red-700" :
                      status.level === "yellow" ? "bg-amber-100 text-amber-700" :
                      "bg-emerald-100 text-emerald-700"
                    }`}>
                      {status.label}
                    </span>
                    <span className="text-gray-400 text-xs transition-transform group-open:rotate-90">▸</span>
                  </div>
                </div>
                {/* KPIs em linha compacta */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs">
                  {report.meta && (
                    <>
                      <span className="text-gray-400">Meta <span className="font-bold text-gray-800">{fmtBRL(report.meta.spend_7d ?? 0)}</span></span>
                      <span className="text-gray-400">Leads <span className="font-bold text-gray-800">{report.meta.leads_7d ?? 0}</span></span>
                      <span className="text-gray-400">CTR <span className="font-bold text-gray-800">{(report.meta.avg_ctr ?? 0).toFixed(2)}%</span></span>
                    </>
                  )}
                  {report.google && (
                    <>
                      <span className="text-gray-400">Google <span className="font-bold text-gray-800">{fmtBRL(report.google.spend_7d ?? 0)}</span></span>
                      <span className="text-gray-400">Conv. <span className="font-bold text-gray-800">{(report.google.conversions_7d ?? 0).toFixed(0)}</span></span>
                    </>
                  )}
                  <span className="text-gray-400">Ações <span className={`font-bold ${pending.length > 0 ? "text-amber-600" : "text-gray-800"}`}>{pending.length}</span></span>
                </div>
              </summary>

              <div className="p-4 space-y-3">
                {/* Fila de ações priorizada (pior primeiro) */}
                {sortedActions.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                      O que fazer ({sortedActions.length})
                    </p>
                    {sortedActions.map(p => (
                      <ProposalRow
                        key={p.id}
                        p={p}
                        clientSlug={report.client_slug}
                        date={date}
                        reportKey={reportKey}
                        platform={metaPlatform.has(p.id) ? "meta" : "google"}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">Nenhuma ação pendente — conta saudável.</p>
                )}

                {/* CreateCreativeCard (preservado) */}
                {worstAd && bestAd && (
                  <CreateCreativeCard
                    clientSlug={report.client_slug}
                    clientName={report.client_name}
                    date={date}
                    worstAd={{ ad_id: worstAd.ad_id, ad_name: worstAd.ad_name, verdict: worstAd.verdict, diagnostico: worstAd.diagnostico, metricas_problema: worstAd.metricas_problema }}
                    bestAd={{ ad_id: bestAd.ad_id, ad_name: bestAd.ad_name, verdict: bestAd.verdict, diagnostico: bestAd.diagnostico, metricas_problema: bestAd.metricas_problema }}
                    bestThumbnailUrl={brief?.thumbnail_url ?? undefined}
                    hasBrief={!!brief}
                    reportKey={reportKey}
                  />
                )}

                {/* Contexto — de-enfatizado, colapsável */}
                {(report.meta?.summary_text || report.google?.summary_text || infoAlerts.length > 0 || planoAcao.length > 0) && (
                  <details className="group">
                    <summary className="text-[11px] text-gray-400 cursor-pointer select-none hover:text-gray-600 list-none flex items-center gap-1">
                      <span className="group-open:rotate-90 transition-transform">▸</span> Contexto e resumo
                    </summary>
                    <div className="mt-2 space-y-2 pl-3 border-l-2 border-gray-100">
                      {report.meta?.summary_text && (
                        <p className="text-xs text-gray-500 leading-relaxed">
                          <span className="font-semibold text-blue-500">Meta — </span>{report.meta.summary_text}
                        </p>
                      )}
                      {report.google?.summary_text && (
                        <p className="text-xs text-gray-500 leading-relaxed">
                          <span className="font-semibold text-orange-500">Google — </span>{report.google.summary_text}
                        </p>
                      )}
                      {planoAcao.slice(0, 3).map((a, i) => (
                        <p key={i} className="text-xs text-gray-500">
                          <span className="font-semibold">#{a.prioridade} {a.titulo}</span> — {a.descricao}
                        </p>
                      ))}
                      {infoAlerts.slice(0, 4).map((al, i) => (
                        <p key={i} className="text-xs text-gray-400">{al.title}: {al.message}</p>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </details>
          );
        })}

        <p className="text-center text-xs text-gray-300 pb-6">
          Simple MKT Digital · Relatório automático
        </p>
      </div>
    </div>
  );
}
