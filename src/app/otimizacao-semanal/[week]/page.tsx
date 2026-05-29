/**
 * /otimizacao-semanal/[week]
 * Relatório semanal por cliente: ações aplicadas (auto), propostas estratégicas
 * (humano aprova), métricas da semana, top campanhas.
 */
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import CopyButton from "@/components/checkin/CopyButton";
import ProposalActionsRow from "@/components/optimization/ProposalActionsRow";
import type { WeeklyDataset, WeeklyAutoAction, WeeklyProposal } from "@/lib/weekly-data";

export const dynamic = "force-dynamic";

interface Row {
  client_slug: string;
  client_name: string;
  week: string;
  date_from: string;
  date_to: string;
  dataset: WeeklyDataset;
  acoes_aplicadas: Array<WeeklyAutoAction & { ok?: boolean; applied_at?: string; error?: string; dry_run?: boolean }>;
  acoes_propostas: WeeklyProposal[];
  texto_resumo: string | null;
  dry_run: boolean;
  generated_at: string;
}

async function loadAll(week: string): Promise<Row[]> {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await supabase.from("weekly_optimizations").select("*").eq("week", week).order("client_name");
  if (error) { console.error(error); return []; }
  return (data ?? []) as Row[];
}

const money = (v?: number) => v == null ? "—" : `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
const num = (v?: number) => v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: v < 10 ? 2 : 0 });

function ActionBadge({ a }: { a: Row["acoes_aplicadas"][number] }) {
  const color = a.dry_run ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
    : a.ok ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
    : "border-rose-500/40 bg-rose-500/10 text-rose-300";
  const label = a.dry_run ? "DRY-RUN" : a.ok ? "APLICADO" : "FALHOU";
  return <span className={`text-[10px] px-1.5 py-0.5 rounded border ${color}`}>{label}</span>;
}

export default async function OtimizacaoSemanalPage({
  params, searchParams,
}: {
  params: Promise<{ week: string }>;
  searchParams: Promise<{ key?: string }>;
}) {
  const { week } = await params;
  const { key } = await searchParams;
  if (key !== process.env.REPORT_VIEW_SECRET) notFound();

  const rows = await loadAll(week);

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 px-6 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-baseline justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Otimização Semanal — {week}</h1>
            <p className="text-xs text-zinc-500 mt-1">Auto-apply: pausar CPL ≥3× benchmark · escalar +20% CPL ≤50%. Resto = propostas pra revisar.</p>
          </div>
          <span className="text-sm text-zinc-500">{rows.length} cliente(s)</span>
        </div>

        {rows.length === 0 && (
          <div className="text-zinc-500 text-sm p-12 text-center border border-zinc-800 rounded-lg">
            Nenhuma otimização semanal pra {week} ainda.
          </div>
        )}

        <div className="space-y-6">
          {rows.map(r => {
            const d = r.dataset;
            const m = d.meta_aggregates;
            return (
              <div key={r.client_slug} className="border border-zinc-800 rounded-xl bg-[#0e0e10] p-5">
                <div className="flex items-baseline justify-between mb-3">
                  <div>
                    <h2 className="text-lg font-medium">{r.client_name}</h2>
                    <p className="text-xs text-zinc-500">{d.window.dateFrom} → {d.window.dateTo}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.dry_run && <span className="text-[10px] px-2 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-300">DRY-RUN</span>}
                  </div>
                </div>

                {d.empty_reason && <p className="text-amber-400/80 text-sm">⚠ {d.empty_reason}</p>}

                {!d.empty_reason && (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4 text-sm">
                      <Metric label="Spend 7d" v={money(m.spend)} />
                      <Metric label="Leads" v={num(m.leads)} />
                      <Metric label="WhatsApp" v={num(m.whatsapp)} />
                      <Metric label="CTR" v={`${m.ctr.toFixed(2)}%`} />
                      <Metric label="CPL" v={money(m.cpl)} />
                      <Metric label="GAs ativos" v={String(m.active_adsets)} />
                    </div>

                    {/* Ações aplicadas */}
                    <Section title={`Ações aplicadas (${r.acoes_aplicadas.length})`}>
                      {r.acoes_aplicadas.length === 0
                        ? <p className="text-xs text-zinc-500 italic">Nenhuma ação aplicada (nada cumpriu critério auto-apply).</p>
                        : <ul className="space-y-1.5">
                            {r.acoes_aplicadas.map((a, i) => (
                              <li key={i} className="text-sm flex items-start gap-2 border-l-2 border-zinc-700 pl-3">
                                <ActionBadge a={a} />
                                <div className="flex-1">
                                  <span className="font-medium">{a.type === "pause_ad" ? "Pausar" : "Escalar"}</span>{" "}
                                  <span className="text-zinc-400">{a.ad_name ?? a.adset_name}</span>
                                  <p className="text-xs text-zinc-500">{a.reason}</p>
                                  {a.error && <p className="text-xs text-rose-400">Erro: {a.error}</p>}
                                </div>
                              </li>
                            ))}
                          </ul>}
                    </Section>

                    {/* Propostas */}
                    <Section title={`Propostas estratégicas (${r.acoes_propostas.length})`}>
                      {r.acoes_propostas.length === 0
                        ? <p className="text-xs text-zinc-500 italic">Nada estratégico essa semana.</p>
                        : <ul className="space-y-2">
                            {r.acoes_propostas.map((p, i) => {
                              const exec = (p as unknown as { executed?: boolean }).executed;
                              return (
                              <li key={i} className={`text-sm border-l-2 pl-3 ${exec ? "border-emerald-500/40 opacity-70" : "border-purple-500/40"}`}>
                                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                                  <div className="flex-1 min-w-0">
                                    <span className="font-medium text-purple-300">{p.type.replace(/_/g, " ")}</span>
                                    {p.adset_name && <span className="text-zinc-400"> — {p.adset_name}</span>}
                                    {p.campaign_name && !p.adset_name && <span className="text-zinc-400"> — {p.campaign_name}</span>}
                                  </div>
                                  <ProposalActionsRow
                                    p={p}
                                    slug={r.client_slug}
                                    week={r.week}
                                    proposalIndex={i}
                                    viewKey={key!}
                                    alreadyExecuted={exec}
                                  />
                                </div>
                                <p className="text-xs text-zinc-400 mt-0.5"><b>Motivo:</b> {p.motivo}</p>
                                <p className="text-xs text-zinc-300"><b>Sugestão:</b> {p.sugestao}</p>
                              </li>
                            );})}
                          </ul>}
                    </Section>

                    {/* Top campanhas */}
                    {d.campaigns_resumo.length > 0 && (
                      <Section title={`Top campanhas — ${d.campaigns_resumo.length}`}>
                        <table className="text-xs w-full">
                          <thead className="text-zinc-500">
                            <tr><th className="text-left py-1">Campanha</th><th className="text-right">Spend</th><th className="text-right">Leads</th><th className="text-right">CPL</th><th className="text-right">Status</th></tr>
                          </thead>
                          <tbody>
                            {d.campaigns_resumo.map(c => (
                              <tr key={c.campaign_id} className="border-t border-zinc-800/50">
                                <td className="py-1 truncate max-w-[400px]">{c.campaign_name}</td>
                                <td className="text-right">{money(c.spend)}</td>
                                <td className="text-right">{num(c.leads)}</td>
                                <td className="text-right">{c.leads > 0 ? money(c.cpl) : "—"}</td>
                                <td className="text-right text-zinc-500">{c.status}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </Section>
                    )}

                    {/* Texto resumo pro gestor/cliente */}
                    {r.texto_resumo && (
                      <Section title="Resumo da semana (pra gestor / cliente)">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-zinc-500">Texto pronto pra mandar ou postar</span>
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

function Metric({ label, v }: { label: string; v: string }) {
  return (
    <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-3">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="text-base text-zinc-100 mt-0.5">{v}</p>
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
