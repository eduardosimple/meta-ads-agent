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
  pausar: "Pausar", ajustar: "Ajustar", testar_variacao: "Testar variação",
  escalar: "Escalar", manter: "Manter",
};
const verdictColor: Record<string, string> = {
  pausar: "bg-red-100 text-red-700", ajustar: "bg-yellow-100 text-yellow-700",
  testar_variacao: "bg-purple-100 text-purple-700", escalar: "bg-green-100 text-green-700",
  manter: "bg-blue-100 text-blue-700",
};
const verdictBorder: Record<string, string> = {
  pausar: "border-l-red-400", ajustar: "border-l-yellow-400",
  testar_variacao: "border-l-purple-400", escalar: "border-l-green-400",
  manter: "border-l-blue-300",
};

/** Group proposals by campaign → adset */
function groupProposals(proposals: Proposal[]) {
  const campaigns = new Map<string, { campaign_name: string; adsets: Map<string, { adset_name: string; proposals: Proposal[] }> }>();
  for (const p of proposals) {
    if (!campaigns.has(p.campaign_name)) {
      campaigns.set(p.campaign_name, { campaign_name: p.campaign_name, adsets: new Map() });
    }
    const camp = campaigns.get(p.campaign_name)!;
    if (!camp.adsets.has(p.adset_name)) {
      camp.adsets.set(p.adset_name, { adset_name: p.adset_name, proposals: [] });
    }
    camp.adsets.get(p.adset_name)!.proposals.push(p);
  }
  return campaigns;
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
    <div className={`border-l-4 ${verdictBorder[p.verdict] ?? "border-l-gray-200"} pl-3 py-2 space-y-1`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-gray-800 flex-1 min-w-0 truncate">{p.ad_name}</p>
        <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded-full font-medium ${verdictColor[p.verdict] ?? ""}`}>
          {verdictLabel[p.verdict] ?? p.verdict}
        </span>
      </div>
      <p className="text-xs text-gray-500 line-clamp-2">{p.diagnostico}</p>
      {p.metricas_problema.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {p.metricas_problema.slice(0, 3).map((m, i) => (
            <span key={i} className="text-xs px-1 py-0.5 bg-gray-100 rounded text-gray-500">{m}</span>
          ))}
        </div>
      )}
      {p.acao_sugerida && (
        <p className="text-xs text-gray-400 italic">{p.acao_sugerida}</p>
      )}

      {/* Action area */}
      {p.status === "approved" && (
        <p className="text-xs text-green-600 font-medium">Executado — {p.result_message}</p>
      )}
      {p.status === "rejected" && (
        <p className="text-xs text-gray-400">Ignorado.</p>
      )}

      {/* Creative adjustment: copy_sugerida present */}
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
      {/* Creative adjustment: needs copy generation */}
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
      {/* Audience/adset update — automated via Meta API */}
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
      {/* Manual adjustment (lance/configuracao) OR público sem targeting spec */}
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

      {/* Pause / Scale buttons */}
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

  const totalSpend = reports.reduce((s, r) => s + (r.meta?.spend_7d ?? 0) + (r.google?.spend_7d ?? 0), 0);
  const totalPending = reports.reduce((n, r) => {
    return n +
      (r.meta?.proposals ?? []).filter(p => p.status === "pending").length +
      (r.google?.proposals ?? []).filter(p => p.status === "pending").length;
  }, 0);
  const criticalCount = reports.filter(r =>
    r.meta?.proposals.some(p => p.verdict === "pausar" && p.status === "pending") ||
    r.google?.proposals.some(p => p.verdict === "pausar" && p.status === "pending")
  ).length;

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
              <p className={`text-lg font-bold ${totalPending > 0 ? "text-orange-600" : "text-gray-900"}`}>{totalPending}</p>
            </div>
          </div>
        </div>

        {reports.length === 0 && (
          <div className="bg-white rounded-2xl p-10 text-center border border-gray-100">
            <p className="text-gray-400 text-sm">Nenhum relatório para {fmtDate(date)}.</p>
            <p className="text-xs text-gray-300 mt-1">O cron executa diariamente a partir das 6h.</p>
          </div>
        )}

        {/* Per-client cards */}
        {reports.map((report, reportIdx) => {
          const metaProposals = report.meta?.proposals ?? [];
          const googleProposals = report.google?.proposals ?? [];
          const allPending = [...metaProposals, ...googleProposals].filter(p => p.status === "pending");
          const hasCritical = allPending.some(p => p.verdict === "pausar");
          const topAction = report.meta?.plano_de_acao?.[0];
          const brief = briefs[reportIdx];

          // For CreateCreativeCard: find worst and best
          const allProposals = [...metaProposals, ...googleProposals];
          const worstAd = allProposals.find(p => (p.verdict === "pausar" || p.verdict === "ajustar") && p.status === "pending");
          const bestAd = allProposals.find(p => p.verdict === "escalar" || p.verdict === "manter");

          // Group Meta proposals by campaign → adset (only pending, non-manter)
          const actionableMetaProposals = metaProposals.filter(p => p.verdict !== "manter" && p.status === "pending");
          const metaGrouped = groupProposals(actionableMetaProposals);

          // Group Google proposals similarly
          const actionableGoogleProposals = googleProposals.filter(p => p.verdict !== "manter" && p.status === "pending");
          const googleGrouped = groupProposals(actionableGoogleProposals);

          return (
            <div
              key={report.id}
              className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${hasCritical ? "border-red-200" : "border-gray-100"}`}
            >
              {/* Client header */}
              <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{report.client_name}</p>
                  <div className="flex gap-2 mt-0.5">
                    {report.meta && <span className="text-xs text-blue-500 font-medium">Meta</span>}
                    {report.google && <span className="text-xs text-orange-500 font-medium">Google</span>}
                  </div>
                </div>
                <div>
                  {hasCritical
                    ? <span className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded-full font-medium">Crítico</span>
                    : allPending.length > 0
                    ? <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full font-medium">{allPending.length} ação{allPending.length !== 1 ? "ões" : ""}</span>
                    : <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full font-medium">Normal</span>
                  }
                </div>
              </div>

              <div className="p-4 space-y-4">
                {/* KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  {report.meta && (
                    <>
                      <div className="bg-gray-50 rounded-xl py-2">
                        <p className="text-xs text-gray-400">Gasto Meta</p>
                        <p className="text-sm font-bold text-gray-800">{fmtBRL(report.meta.spend_7d ?? 0)}</p>
                      </div>
                      <div className="bg-gray-50 rounded-xl py-2">
                        <p className="text-xs text-gray-400">Leads</p>
                        <p className="text-sm font-bold text-gray-800">{report.meta.leads_7d ?? 0}</p>
                      </div>
                    </>
                  )}
                  {report.google && (
                    <>
                      <div className="bg-orange-50 rounded-xl py-2">
                        <p className="text-xs text-gray-400">Gasto Google</p>
                        <p className="text-sm font-bold text-gray-800">{fmtBRL(report.google.spend_7d ?? 0)}</p>
                      </div>
                      <div className="bg-orange-50 rounded-xl py-2">
                        <p className="text-xs text-gray-400">Conversões</p>
                        <p className="text-sm font-bold text-gray-800">{(report.google.conversions_7d ?? 0).toFixed(0)}</p>
                      </div>
                    </>
                  )}
                </div>

                {/* Summaries */}
                {report.meta?.summary_text && (
                  <p className="text-xs text-gray-600 leading-relaxed">
                    <span className="font-semibold text-blue-600">Meta — </span>{report.meta.summary_text}
                  </p>
                )}
                {report.google?.summary_text && (
                  <p className="text-xs text-gray-600 leading-relaxed">
                    <span className="font-semibold text-orange-500">Google — </span>{report.google.summary_text}
                  </p>
                )}

                {/* Top plano action */}
                {topAction && (
                  <div className={`rounded-xl px-3 py-2.5 text-xs border ${
                    topAction.impacto === "alto" ? "bg-red-50 border-red-200 text-red-700" :
                    topAction.impacto === "medio" ? "bg-yellow-50 border-yellow-200 text-yellow-700" :
                    "bg-gray-50 border-gray-200 text-gray-600"
                  }`}>
                    <span className="font-semibold">#{topAction.prioridade} {topAction.titulo}</span>
                    {" — "}{topAction.descricao}
                  </div>
                )}

                {/* ─── Meta hierarchy ─── */}
                {metaGrouped.size > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Meta — otimizações</p>
                    {Array.from(metaGrouped.values()).map(campaign => (
                      <div key={campaign.campaign_name} className="rounded-xl border border-gray-100 overflow-hidden">
                        {/* Campaign row */}
                        <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                          <p className="text-xs font-semibold text-gray-700 truncate">📢 {campaign.campaign_name}</p>
                        </div>
                        {/* Adsets */}
                        {Array.from(campaign.adsets.values()).map(adset => (
                          <div key={adset.adset_name} className="border-b border-gray-50 last:border-0">
                            <div className="px-3 py-1.5 bg-gray-50/50">
                              <p className="text-xs text-gray-500 truncate">👥 {adset.adset_name}</p>
                            </div>
                            <div className="px-3 py-2 space-y-3">
                              {adset.proposals.map(p => (
                                <ProposalRow
                                  key={p.id}
                                  p={p}
                                  clientSlug={report.client_slug}
                                  date={date}
                                  reportKey={reportKey}
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                {/* ─── Google hierarchy ─── */}
                {googleGrouped.size > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-orange-500 uppercase tracking-wide">Google — otimizações</p>
                    {Array.from(googleGrouped.values()).map(campaign => (
                      <div key={campaign.campaign_name} className="rounded-xl border border-orange-100 overflow-hidden">
                        <div className="px-3 py-2 bg-orange-50 border-b border-orange-100">
                          <p className="text-xs font-semibold text-orange-700 truncate">📢 {campaign.campaign_name}</p>
                        </div>
                        {Array.from(campaign.adsets.values()).map(adset => (
                          <div key={adset.adset_name} className="border-b border-orange-50 last:border-0">
                            <div className="px-3 py-1.5 bg-orange-50/30">
                              <p className="text-xs text-gray-500 truncate">👥 {adset.adset_name}</p>
                            </div>
                            <div className="px-3 py-2 space-y-3">
                              {adset.proposals.map(p => (
                                <ProposalRow
                                  key={p.id}
                                  p={p}
                                  clientSlug={report.client_slug}
                                  date={date}
                                  reportKey={reportKey}
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                {/* CreateCreativeCard */}
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
              </div>
            </div>
          );
        })}

        <p className="text-center text-xs text-gray-300 pb-6">
          Simple MKT Digital · Relatório automático
        </p>
      </div>
    </div>
  );
}
