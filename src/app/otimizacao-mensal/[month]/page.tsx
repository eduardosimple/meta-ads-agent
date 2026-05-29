/**
 * /otimizacao-mensal/[month]
 * Relatório mensal: agregados 30d vs 30d anteriores, auditoria de tracking,
 * propostas estratégicas (LAL, públicos, biblioteca de anúncios, etc).
 */
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import CopyButton from "@/components/checkin/CopyButton";
import ProposalActionsRow from "@/components/optimization/ProposalActionsRow";
import type { MonthlyDataset, MonthlyAuditoria, MonthlyProposal } from "@/lib/monthly-data";

export const dynamic = "force-dynamic";

interface Row {
  client_slug: string;
  client_name: string;
  month: string;
  date_from: string;
  date_to: string;
  dataset: MonthlyDataset;
  auditoria: MonthlyAuditoria;
  propostas: MonthlyProposal[];
  texto_resumo: string | null;
  generated_at: string;
}

async function loadAll(month: string): Promise<Row[]> {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await supabase
    .from("monthly_optimizations").select("*").eq("month", month).order("client_name");
  if (error) { console.error(error); return []; }
  return (data ?? []) as Row[];
}

const money = (v?: number) => v == null ? "—" : `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
const num = (v?: number) => v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: v < 10 ? 2 : 0 });
const pct = (v?: number) => {
  if (v == null) return "—";
  const arrow = v > 0 ? "↑" : v < 0 ? "↓" : "·";
  const color = v > 5 ? "text-emerald-400" : v < -5 ? "text-rose-400" : "text-zinc-400";
  return <span className={color}>{arrow} {Math.abs(v).toFixed(1)}%</span>;
};

function VeredictoBadge({ v }: { v?: string }) {
  const map: Record<string, string> = {
    subiu: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    estavel: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
    caiu: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  };
  return <span className={`text-xs px-2 py-0.5 rounded border ${map[v ?? "estavel"]}`}>{v ?? "—"}</span>;
}

export default async function OtimizacaoMensalPage({
  params, searchParams,
}: {
  params: Promise<{ month: string }>;
  searchParams: Promise<{ key?: string }>;
}) {
  const { month } = await params;
  const { key } = await searchParams;
  if (key !== process.env.REPORT_VIEW_SECRET) notFound();
  const rows = await loadAll(month);

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 px-6 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-baseline justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Otimização Mensal — {month}</h1>
            <p className="text-xs text-zinc-500 mt-1">Auditoria 30d × 30d anteriores. Inclui pixel + públicos + propostas estratégicas (sem auto-apply — mensal é decisão humana).</p>
          </div>
          <span className="text-sm text-zinc-500">{rows.length} cliente(s)</span>
        </div>

        {rows.length === 0 && (
          <div className="text-zinc-500 text-sm p-12 text-center border border-zinc-800 rounded-lg">
            Nenhuma otimização mensal pra {month}.
          </div>
        )}

        <div className="space-y-6">
          {rows.map(r => {
            const d = r.dataset;
            const mt = d.meta_this; const ml = d.meta_last; const dl = d.delta;
            const aud = r.auditoria;
            return (
              <div key={r.client_slug} className="border border-zinc-800 rounded-xl bg-[#0e0e10] p-5">
                <div className="flex items-baseline justify-between mb-3">
                  <div>
                    <h2 className="text-lg font-medium">{r.client_name}</h2>
                    <p className="text-xs text-zinc-500">{d.window_this.dateFrom} → {d.window_this.dateTo}</p>
                  </div>
                  <VeredictoBadge v={dl?.veredicto} />
                </div>

                {d.empty_reason && <p className="text-amber-400/80 text-sm">⚠ {d.empty_reason}</p>}

                {!d.empty_reason && mt && ml && dl && (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4 text-sm">
                      <Metric label="Investimento" cur={money(mt.spend)} prev={money(ml.spend)} delta={pct(dl.spend_pct)} />
                      <Metric label="Leads" cur={num(mt.leads)} prev={num(ml.leads)} delta={pct(dl.leads_pct)} />
                      <Metric label="CTR" cur={`${mt.ctr.toFixed(2)}%`} prev={`${ml.ctr.toFixed(2)}%`} delta={pct(dl.ctr_pct)} />
                      <Metric label="CPL" cur={money(mt.cpl)} prev={money(ml.cpl)} delta={pct(-dl.cpl_pct)} />
                      <Metric label="WhatsApp" cur={num(mt.whatsapp)} prev={num(ml.whatsapp)} delta="" />
                    </div>

                    {/* Auditoria de tracking */}
                    <Section title="Auditoria — Pixel & Tracking">
                      {aud.pixel_id ? (
                        <p className="text-xs text-zinc-400 mb-2">Pixel: <code className="text-zinc-300">{aud.pixel_id}</code> · {aud.pixel_eventos.length} evento(s) detectado(s) em 30d</p>
                      ) : (
                        <p className="text-xs text-zinc-500 italic mb-2">Pixel não detectado.</p>
                      )}
                      {aud.pixel_eventos.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {aud.pixel_eventos.slice(0, 8).map(e => (
                            <span key={e.event_name} className="text-xs border border-zinc-700 bg-zinc-900/40 rounded px-2 py-0.5">
                              {e.event_name}: {num(e.count_30d)}
                            </span>
                          ))}
                        </div>
                      )}
                      {aud.pixel_warnings.length > 0 && (
                        <ul className="space-y-0.5 text-xs text-amber-300">
                          {aud.pixel_warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}
                        </ul>
                      )}
                    </Section>

                    {/* Custom audiences pra atualizar */}
                    {aud.custom_audiences_para_atualizar.length > 0 && (
                      <Section title={`Públicos pra atualizar (${aud.custom_audiences_para_atualizar.length})`}>
                        <ul className="space-y-1 text-xs">
                          {aud.custom_audiences_para_atualizar.map(c => (
                            <li key={c.id} className="border-l-2 border-zinc-700 pl-2">
                              <span className="text-zinc-300">{c.name}</span>
                              <span className="text-zinc-500"> — {c.motivo}</span>
                            </li>
                          ))}
                        </ul>
                      </Section>
                    )}

                    {/* Top campanhas */}
                    <Section title={`Top campanhas (${d.campaigns_top.length})`}>
                      <table className="text-xs w-full">
                        <thead className="text-zinc-500">
                          <tr><th className="text-left py-1">Campanha</th><th className="text-left">Objetivo</th><th className="text-right">Spend</th><th className="text-right">Leads</th><th className="text-right">CPL</th></tr>
                        </thead>
                        <tbody>
                          {d.campaigns_top.map(c => (
                            <tr key={c.campaign_id} className="border-t border-zinc-800/50">
                              <td className="py-1 truncate max-w-[350px]">{c.campaign_name}</td>
                              <td className="text-zinc-500 text-[10px]">{c.objective.replace("OUTCOME_", "")}</td>
                              <td className="text-right">{money(c.spend)}</td>
                              <td className="text-right">{num(c.leads)}</td>
                              <td className="text-right">{c.leads > 0 ? money(c.cpl) : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </Section>

                    {/* Propostas estratégicas */}
                    <Section title={`Propostas estratégicas (${r.propostas.length})`}>
                      <ul className="space-y-2">
                        {r.propostas.map((p, i) => {
                          const exec = (p as unknown as { executed?: boolean }).executed;
                          return (
                          <li key={i} className={`text-sm border-l-2 pl-3 ${exec ? "border-emerald-500/40 opacity-70" : "border-purple-500/40"}`}>
                            <div className="flex items-baseline justify-between gap-2 flex-wrap">
                              <div className="flex-1 min-w-0">
                                <span className="font-medium text-purple-300">{p.type.replace(/_/g, " ")}</span>
                                {p.campaign_name && <span className="text-zinc-400"> — {p.campaign_name}</span>}
                              </div>
                              <ProposalActionsRow
                                p={p}
                                slug={r.client_slug}
                                month={r.month}
                                proposalIndex={i}
                                viewKey={key!}
                                alreadyExecuted={exec}
                              />
                            </div>
                            <p className="text-xs text-zinc-400 mt-0.5"><b>Motivo:</b> {p.motivo}</p>
                            <p className="text-xs text-zinc-300"><b>Sugestão:</b> {p.sugestao}</p>
                            {p.link_ref && (
                              <a href={p.link_ref} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:underline">→ abrir referência</a>
                            )}
                          </li>
                        );})}
                      </ul>
                    </Section>

                    {/* Texto resumo */}
                    {r.texto_resumo && (
                      <Section title="Resumo do mês (pra gestor)">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-zinc-500">Texto pronto pra revisar</span>
                          <CopyButton text={r.texto_resumo} />
                        </div>
                        <pre className="text-sm text-zinc-200 whitespace-pre-wrap font-sans bg-zinc-900/50 border border-zinc-800 rounded p-3">{r.texto_resumo}</pre>
                      </Section>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, cur, prev, delta }: { label: string; cur: React.ReactNode; prev: React.ReactNode; delta: React.ReactNode }) {
  return (
    <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-3">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="text-base text-zinc-100 mt-0.5">{cur}</p>
      <p className="text-[11px] text-zinc-500 mt-0.5">ant: {prev} {delta}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 border-t border-zinc-800 pt-3">
      <h3 className="text-sm font-medium text-zinc-300 mb-2">{title}</h3>
      {children}
    </div>
  );
}
