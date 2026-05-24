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
import CampaignCard from "@/components/report/CampaignCard";
import ClientErrorBoundary from "@/components/report/ClientErrorBoundary";

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
  pausar: "bg-rose-500/15 text-rose-300 border border-rose-500/30",
  ajustar: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
  testar_variacao: "bg-violet-500/15 text-violet-300 border border-violet-500/30",
  escalar: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
  manter: "bg-zinc-500/15 text-zinc-300 border border-zinc-500/30",
};
const verdictUrgency: Record<string, number> = {
  pausar: 0, ajustar: 1, testar_variacao: 2, escalar: 3, manter: 4,
};

type StatusLevel = "red" | "yellow" | "green";

function clientStatus(pending: Proposal[]): { level: StatusLevel; dot: string; ring: string; label: string } {
  const hasPausar = pending.some(p => p.verdict === "pausar");
  const hasAdjust = pending.some(p => p.verdict === "ajustar" || p.verdict === "testar_variacao");
  if (hasPausar) return { level: "red", dot: "bg-rose-500", ring: "border-rose-500/30", label: "Crítico" };
  if (hasAdjust) return { level: "yellow", dot: "bg-amber-400", ring: "border-amber-500/30", label: "Ajustar" };
  return { level: "green", dot: "bg-emerald-500", ring: "border-[#1c1c20]", label: "Ok" };
}

function scoreColor(score: number) {
  if (score < 40) return { bar: "bg-rose-500", text: "text-rose-300" };
  if (score < 70) return { bar: "bg-amber-400", text: "text-amber-300" };
  return { bar: "bg-emerald-500", text: "text-emerald-300" };
}

function ScoreBar({ score }: { score: number }) {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  const filled = Math.round(s / 10);
  const c = scoreColor(s);
  return (
    <div className="flex items-center gap-2 shrink-0">
      <div className="flex gap-[2px]" aria-label={`score ${s}`}>
        {Array.from({ length: 10 }).map((_, i) => (
          <span key={i} className={`w-1.5 h-3.5 rounded-[1px] ${i < filled ? c.bar : "bg-zinc-800"}`} />
        ))}
      </div>
      <span className={`text-xs font-bold tabular-nums font-mono ${c.text}`}>{s}</span>
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
  const action = p.action ?? { type: "none" as const };
  const scaleBudget = action.type === "scale_budget" ? action : null;
  const metricas = p.metricas_problema ?? [];

  return (
    <div className="rounded-xl border border-[#1c1c20] bg-[#0f0f12] px-3 py-2.5 space-y-1.5">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold text-zinc-100 flex-1 min-w-0 truncate">{p.ad_name}</p>
        <ScoreBar score={pScore(p)} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-zinc-500 truncate min-w-0 font-mono">
          {p.campaign_name}{p.adset_name ? ` · ${p.adset_name}` : ""}
        </p>
        <span className={`shrink-0 text-[10px] tracking-[0.12em] px-2 py-0.5 rounded-md font-bold ${verdictTag[p.verdict] ?? "bg-zinc-500/15 text-zinc-300 border border-zinc-500/30"}`}>
          {verdictLabel[p.verdict] ?? p.verdict.toUpperCase()}
        </span>
      </div>
      <p className="text-xs text-zinc-300 leading-snug">{p.diagnostico}</p>
      {metricas.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {metricas.slice(0, 4).map((m, i) => (
            <span key={i} className="text-[10px] px-1.5 py-0.5 bg-zinc-800/60 border border-zinc-800 rounded text-zinc-400 font-mono">{m}</span>
          ))}
        </div>
      )}
      {p.acao_sugerida && (
        <p className="text-xs text-zinc-200 font-medium">→ {p.acao_sugerida}</p>
      )}

      {p.status === "approved" && (
        <p className="text-xs text-emerald-400 font-medium">Executado — {p.result_message}</p>
      )}
      {p.status === "rejected" && (
        <p className="text-xs text-zinc-500">Ignorado.</p>
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
      {p.status === "pending" && isManualAdjust && p.ajuste_tipo === "publico" && (action.type === "create_adset" || action.type === "update_adset_targeting") && (
        <TargetingChangeCard
          clientSlug={clientSlug}
          date={date}
          adId={p.ad_id}
          reportKey={reportKey}
          targetingSummaryOld={p.adset_name}
          targetingSummaryNew={action.targeting_summary_new}
          adsetNameNew={action.type === "create_adset" ? action.adset_name : undefined}
          actionType={action.type === "create_adset" ? "create_adset" : "update_targeting"}
          initialStatus={p.status}
          initialResultMessage={p.result_message}
        />
      )}
      {p.status === "pending" && isManualAdjust && (p.ajuste_tipo !== "publico" || (action.type !== "create_adset" && action.type !== "update_adset_targeting")) && (
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
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <p className="text-zinc-500 text-sm">Acesso não autorizado.</p>
      </div>
    );
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return notFound();

  let reports: DailyReport[] = [];
  try { reports = await getReportsByDate(date); } catch { /* empty state */ }

  const briefs = await Promise.all(reports.map(r => getDesignBrief(r.client_slug).catch(() => null)));

  const enriched = reports.map((report, idx) => {
    const metaProposals = report.meta?.proposals ?? [];
    const googleProposals = report.google?.proposals ?? [];
    const pending = [...metaProposals, ...googleProposals].filter(p => p.status === "pending");
    const pendingActionable = pending.filter(p => p.verdict !== "manter");
    const status = clientStatus(pendingActionable);
    const spend = (report.meta?.spend_7d ?? 0) + (report.google?.spend_7d ?? 0);
    return { report, idx, metaProposals, googleProposals, pending, pendingActionable, status, spend };
  });

  const statusRank: Record<StatusLevel, number> = { red: 0, yellow: 1, green: 2 };
  enriched.sort((a, b) =>
    statusRank[a.status.level] - statusRank[b.status.level] || b.spend - a.spend
  );

  const totalSpend = enriched.reduce((s, e) => s + e.spend, 0);
  const totalPending = enriched.reduce((n, e) => n + e.pending.length, 0);
  const criticalCount = enriched.filter(e => e.status.level === "red").length;

  const pendingCreativeReqs = enriched.flatMap(({ report }) => {
    const all = [...(report.meta?.proposals ?? []), ...(report.google?.proposals ?? [])];
    return all
      .filter(p => p.status === "creative_requested" || p.status === "generating")
      .map(p => ({
        client_name: report.client_name,
        client_slug: report.client_slug,
        ad_name: p.ad_name,
        status: p.status as "creative_requested" | "generating",
      }));
  });

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-200">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-5">

        {/* Header */}
        <div className="bg-[#0f0f12] border border-[#1c1c20] rounded-2xl p-5">
          <p className="text-[11px] text-zinc-500 uppercase tracking-[0.22em] font-medium">Simple MKT Digital</p>
          <h1 className="text-2xl font-semibold text-zinc-50 mt-1 tracking-tight">Relatório diário</h1>
          <p className="text-sm text-zinc-400 mt-0.5 font-mono">{fmtDate(date)}</p>
          <div className="grid grid-cols-4 gap-3 mt-4 pt-4 border-t border-[#1c1c20] text-center">
            <Kpi label="Clientes" value={String(reports.length)} />
            <Kpi label="Gasto 7d" value={fmtBRL(totalSpend)} mono />
            <Kpi label="Críticos" value={String(criticalCount)} tone={criticalCount > 0 ? "rose" : undefined} />
            <Kpi label="Ações" value={String(totalPending)} tone={totalPending > 0 ? "amber" : undefined} />
          </div>
        </div>

        {reports.length === 0 && (
          <div className="bg-[#0f0f12] border border-[#1c1c20] rounded-2xl p-10 text-center">
            <p className="text-zinc-500 text-sm">Nenhum relatório para {fmtDate(date)}.</p>
            <p className="text-xs text-zinc-600 mt-1">O cron executa diariamente a partir das 6h.</p>
          </div>
        )}

        {pendingCreativeReqs.length > 0 && (
          <div className="bg-amber-500/5 border border-amber-500/30 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-bold text-amber-300 uppercase tracking-[0.22em]">
                Pedidos de criativo na fila ({pendingCreativeReqs.length})
              </p>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-200 font-bold border border-amber-500/30">
                Pipeline em manutenção
              </span>
            </div>
            <p className="text-xs text-amber-200/80">
              Você solicitou novos criativos abaixo. O pipeline de geração está em manutenção e <b>pode não processar agora</b> — os pedidos ficam aqui até reativarmos.
            </p>
            <ul className="text-xs text-amber-100 space-y-1 pt-1">
              {pendingCreativeReqs.map((r, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded font-bold border ${
                    r.status === "generating"
                      ? "bg-blue-500/15 text-blue-300 border-blue-500/30"
                      : "bg-amber-500/15 text-amber-200 border-amber-500/30"
                  }`}>
                    {r.status === "generating" ? "GERANDO" : "NA FILA"}
                  </span>
                  <span className="font-semibold">{r.client_name}</span>
                  <span className="text-amber-200/70 truncate">— {r.ad_name}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Clientes — ErrorBoundary por cliente: um malformado não derruba o resto */}
        {enriched.map(({ report, idx, metaProposals, googleProposals, pending, pendingActionable, status }) => {
          try {
          const brief = briefs[idx];
          const metaCampaigns = report.meta?.campaigns_analysis ?? [];
          const googleCampaigns = report.google?.campaigns_analysis ?? [];
          const hasCampaignAnalysis = metaCampaigns.length + googleCampaigns.length > 0;

          const sortedActions = [...pendingActionable].sort((a, b) =>
            pScore(a) - pScore(b) ||
            (verdictUrgency[a.verdict] ?? 9) - (verdictUrgency[b.verdict] ?? 9)
          );

          const metaPropsByCamp = groupBy(metaProposals, p => p.campaign_name);
          const googlePropsByCamp = groupBy(googleProposals, p => p.campaign_name);
          const metaPlatform = new Set(metaProposals.map(p => p.id));

          const allProposals = [...metaProposals, ...googleProposals];
          const worstAd = allProposals.find(p => (p.verdict === "pausar" || p.verdict === "ajustar") && p.status === "pending");
          const bestAd = allProposals.find(p => p.verdict === "escalar" || p.verdict === "manter");

          const infoAlerts = [
            ...(report.meta?.alerts ?? []),
            ...(report.google?.alerts ?? []),
          ];
          const planoAcao = report.meta?.plano_de_acao ?? [];

          return (
            <ClientErrorBoundary key={report.id} clientName={report.client_name}>
            <details
              className={`group bg-[#18181b] rounded-2xl border-2 overflow-hidden ${status.ring}`}
            >
              <summary className="px-5 py-3.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden hover:bg-zinc-900/40 transition-colors group-open:border-b group-open:border-[#1c1c20]">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${status.dot}`} />
                    <p className="font-semibold text-zinc-50 text-sm truncate">{report.client_name}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                      status.level === "red" ? "bg-rose-500/15 text-rose-300 border-rose-500/30" :
                      status.level === "yellow" ? "bg-amber-500/15 text-amber-300 border-amber-500/30" :
                      "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                    }`}>
                      {status.label}
                    </span>
                    <span className="text-zinc-500 text-xs transition-transform group-open:rotate-90">▸</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] font-mono">
                  {report.meta && (
                    <>
                      <span className="text-zinc-500">meta <span className="font-semibold text-zinc-200">{fmtBRL(report.meta.spend_7d ?? 0)}</span></span>
                      <span className="text-zinc-500">leads <span className="font-semibold text-zinc-200">{report.meta.leads_7d ?? 0}</span></span>
                      <span className="text-zinc-500">ctr <span className="font-semibold text-zinc-200">{(report.meta.avg_ctr ?? 0).toFixed(2)}%</span></span>
                    </>
                  )}
                  {report.google && (
                    <>
                      <span className="text-zinc-500">google <span className="font-semibold text-zinc-200">{fmtBRL(report.google.spend_7d ?? 0)}</span></span>
                      <span className="text-zinc-500">conv <span className="font-semibold text-zinc-200">{(report.google.conversions_7d ?? 0).toFixed(0)}</span></span>
                    </>
                  )}
                  <span className="text-zinc-500">ações <span className={`font-bold ${pending.length > 0 ? "text-amber-300" : "text-zinc-200"}`}>{pending.length}</span></span>
                </div>
              </summary>

              <div className="p-4 space-y-3">
                {/* VIEW NOVO: por campanha */}
                {hasCampaignAnalysis && (
                  <div className="space-y-3">
                    {metaCampaigns.map(c => (
                      <CampaignCard
                        key={`meta-${c.campaign_id}`}
                        analysis={c}
                        proposals={(metaPropsByCamp.get(c.campaign_name) ?? []).filter(p => p.status === "pending")}
                        renderProposal={(p) => (
                          <ProposalRow
                            p={p}
                            clientSlug={report.client_slug}
                            date={date}
                            reportKey={reportKey}
                            platform="meta"
                          />
                        )}
                      />
                    ))}
                    {googleCampaigns.map(c => (
                      <CampaignCard
                        key={`google-${c.campaign_id}`}
                        analysis={c}
                        proposals={(googlePropsByCamp.get(c.campaign_name) ?? []).filter(p => p.status === "pending")}
                        renderProposal={(p) => (
                          <ProposalRow
                            p={p}
                            clientSlug={report.client_slug}
                            date={date}
                            reportKey={reportKey}
                            platform="google"
                          />
                        )}
                      />
                    ))}
                  </div>
                )}

                {/* VIEW FALLBACK (compat com reports antigos) */}
                {!hasCampaignAnalysis && sortedActions.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] tracking-[0.22em] font-medium text-zinc-500 uppercase">
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
                )}

                {!hasCampaignAnalysis && sortedActions.length === 0 && (
                  <p className="text-xs text-zinc-500">Nenhuma ação pendente — conta saudável.</p>
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

                {/* Contexto */}
                {(report.meta?.summary_text || report.google?.summary_text || infoAlerts.length > 0 || planoAcao.length > 0) && (
                  <details className="group/ctx">
                    <summary className="text-[10px] tracking-[0.22em] uppercase text-zinc-500 cursor-pointer select-none hover:text-zinc-300 list-none [&::-webkit-details-marker]:hidden flex items-center gap-1.5">
                      <span className="group-open/ctx:rotate-90 transition-transform">▸</span> Contexto e resumo
                    </summary>
                    <div className="mt-2 space-y-2 pl-3 border-l-2 border-[#1c1c20]">
                      {report.meta?.summary_text && (
                        <p className="text-xs text-zinc-400 leading-relaxed">
                          <span className="font-semibold text-blue-400">Meta — </span>{report.meta.summary_text}
                        </p>
                      )}
                      {report.google?.summary_text && (
                        <p className="text-xs text-zinc-400 leading-relaxed">
                          <span className="font-semibold text-orange-400">Google — </span>{report.google.summary_text}
                        </p>
                      )}
                      {planoAcao.slice(0, 3).map((a, i) => (
                        <p key={i} className="text-xs text-zinc-400">
                          <span className="font-semibold text-zinc-200">#{a.prioridade} {a.titulo}</span> — {a.descricao}
                        </p>
                      ))}
                      {infoAlerts.slice(0, 4).map((al, i) => (
                        <p key={i} className="text-xs text-zinc-500">{al.title}: {al.message}</p>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </details>
            </ClientErrorBoundary>
          );
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            const stack = e instanceof Error ? (e.stack ?? "") : "";
            console.error(`[daily-report] crash client=${report.client_slug}`, msg, "\n", stack);
            return (
              <div key={report.id} className="bg-[#18181b] border border-rose-500/30 rounded-2xl p-4 space-y-1.5">
                <p className="text-[11px] tracking-[0.22em] uppercase text-rose-400 font-medium">Erro neste cliente</p>
                <p className="text-sm text-zinc-100 font-semibold">{report.client_name}</p>
                <p className="text-xs text-zinc-400 font-mono break-all">{msg}</p>
              </div>
            );
          }
        })}

        <p className="text-center text-[10px] tracking-[0.22em] uppercase text-zinc-700 pb-6">
          Simple MKT Digital · Relatório automático
        </p>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone, mono }: { label: string; value: string; tone?: "rose" | "amber"; mono?: boolean }) {
  const toneCls = tone === "rose" ? "text-rose-400" : tone === "amber" ? "text-amber-400" : "text-zinc-50";
  return (
    <div>
      <p className="text-[10px] text-zinc-500 uppercase tracking-[0.18em] font-medium">{label}</p>
      <p className={`text-lg font-semibold mt-0.5 ${toneCls} ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

function groupBy<T, K>(arr: T[], keyFn: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const item of arr) {
    const k = keyFn(item);
    const cur = m.get(k);
    if (cur) cur.push(item); else m.set(k, [item]);
  }
  return m;
}
