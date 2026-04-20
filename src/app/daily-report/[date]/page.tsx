import { getReportsByDate } from "@/lib/reports-store";
import { notFound } from "next/navigation";
import type { DailyReport } from "@/lib/reports-store";
import type { Proposal } from "@/types/metrics";

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
  pausar: "Pausar", ajustar: "Ajustar", testar_variacao: "Testar",
  escalar: "Escalar", manter: "Manter",
};
const verdictColor: Record<string, string> = {
  pausar: "bg-red-100 text-red-700", ajustar: "bg-yellow-100 text-yellow-700",
  testar_variacao: "bg-purple-100 text-purple-700", escalar: "bg-green-100 text-green-700",
  manter: "bg-blue-100 text-blue-700",
};

export default async function DailyReportPage({
  params,
  searchParams,
}: {
  params: { date: string };
  searchParams: { key?: string };
}) {
  const { date } = params;

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
  try {
    reports = await getReportsByDate(date);
  } catch {
    // show empty state
  }

  const needsCreative = reports.flatMap(r => {
    const items: Array<{ client: string; proposal: Proposal; platform: "Meta" | "Google" }> = [];
    (r.meta?.proposals ?? [])
      .filter(p => (p.verdict === "pausar" || p.verdict === "ajustar") && p.status === "pending")
      .forEach(p => items.push({ client: r.client_name, proposal: p, platform: "Meta" }));
    (r.google?.proposals ?? [])
      .filter(p => (p.verdict === "pausar" || p.verdict === "ajustar") && p.status === "pending")
      .forEach(p => items.push({ client: r.client_name, proposal: p, platform: "Google" }));
    return items;
  });

  const totalSpend = reports.reduce((s, r) => s + (r.meta?.spend_7d ?? 0) + (r.google?.spend_7d ?? 0), 0);
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
              <p className="text-xs text-gray-400">Criativos</p>
              <p className={`text-lg font-bold ${needsCreative.length > 0 ? "text-orange-600" : "text-gray-900"}`}>{needsCreative.length}</p>
            </div>
          </div>
        </div>

        {reports.length === 0 && (
          <div className="bg-white rounded-2xl p-10 text-center border border-gray-100">
            <p className="text-gray-400 text-sm">Nenhum relatório gerado para {fmtDate(date)}.</p>
            <p className="text-xs text-gray-300 mt-1">O cron executa diariamente às 9h.</p>
          </div>
        )}

        {/* Creatives needing change */}
        {needsCreative.length > 0 && (
          <div className="bg-orange-50 rounded-2xl border border-orange-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-orange-200">
              <p className="text-sm font-semibold text-orange-800">
                {needsCreative.length} criativo{needsCreative.length !== 1 ? "s" : ""} para substituir
              </p>
            </div>
            <div className="p-4 space-y-2">
              {needsCreative.map(({ client, proposal, platform }, idx) => (
                <div key={idx} className="bg-white rounded-xl p-3.5 border border-orange-100">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-400">{client} · {platform}</p>
                      <p className="text-sm font-semibold text-gray-800 mt-0.5 truncate">{proposal.ad_name}</p>
                      <p className="text-xs text-gray-600 mt-1 leading-relaxed">{proposal.diagnostico}</p>
                      {proposal.metricas_problema.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {proposal.metricas_problema.map((m, i) => (
                            <span key={i} className="text-xs px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">{m}</span>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-gray-400 mt-1.5 italic">{proposal.acao_sugerida}</p>
                    </div>
                    <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${verdictColor[proposal.verdict] ?? ""}`}>
                      {verdictLabel[proposal.verdict] ?? proposal.verdict}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Per-client cards */}
        {reports.map(report => {
          const allPending = [
            ...(report.meta?.proposals ?? []),
            ...(report.google?.proposals ?? []),
          ].filter(p => p.status === "pending");
          const hasCritical = allPending.some(p => p.verdict === "pausar");
          const topAction = report.meta?.plano_de_acao?.[0];

          return (
            <div
              key={report.id}
              className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${hasCritical ? "border-red-200" : "border-gray-100"}`}
            >
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
                    ? <span className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded-full font-medium">Critico</span>
                    : allPending.length > 0
                    ? <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full font-medium">{allPending.length} ajuste{allPending.length !== 1 ? "s" : ""}</span>
                    : <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full font-medium">Normal</span>
                  }
                </div>
              </div>

              <div className="p-5 space-y-3">
                {/* Spend / leads row */}
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
                        <p className="text-xs text-gray-400">Conversoes</p>
                        <p className="text-sm font-bold text-gray-800">{(report.google.conversions_7d ?? 0).toFixed(0)}</p>
                      </div>
                    </>
                  )}
                </div>

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
              </div>
            </div>
          );
        })}

        <p className="text-center text-xs text-gray-300 pb-6">
          Simple MKT Digital · Relatório automatico
        </p>
      </div>
    </div>
  );
}
