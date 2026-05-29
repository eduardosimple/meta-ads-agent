/**
 * /checkin-semanal/[week]
 * Lista os check-ins semanais de todos os clientes na semana informada.
 * Cada card mostra: métricas comparativas (esta sem. × anterior) + texto pronto
 * pra copiar e colar no WhatsApp do cliente.
 *
 * Acesso por chave `?key=REPORT_VIEW_SECRET` (igual /daily-report).
 */
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import type { CheckinDataset } from "@/lib/checkin-data";
import CopyButton from "@/components/checkin/CopyButton";

export const dynamic = "force-dynamic";

interface CheckinRow {
  client_slug: string;
  client_name: string;
  week: string;
  date_from: string;
  date_to: string;
  dataset: CheckinDataset;
  texto_cliente: string | null;
  generated_at: string;
}

async function loadCheckins(week: string): Promise<CheckinRow[]> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data, error } = await supabase
    .from("weekly_checkins")
    .select("*")
    .eq("week", week)
    .order("client_name");
  if (error) {
    console.error("[checkin-semanal] load error:", error);
    return [];
  }
  return (data ?? []) as CheckinRow[];
}

function fmtMoney(v?: number) {
  if (v === undefined || v === null) return "—";
  return `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}
function fmtNum(v?: number) {
  if (v === undefined || v === null) return "—";
  return v.toLocaleString("pt-BR", { maximumFractionDigits: v < 10 ? 2 : 0 });
}
function fmtPct(v?: number) {
  if (v === undefined || v === null) return "—";
  const arrow = v > 0 ? "↑" : v < 0 ? "↓" : "·";
  const color = v > 5 ? "text-emerald-400" : v < -5 ? "text-rose-400" : "text-zinc-400";
  return <span className={color}>{arrow} {Math.abs(v).toFixed(1)}%</span>;
}

function VeredictoBadge({ v }: { v?: string }) {
  const map: Record<string, string> = {
    subiu: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    estavel: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
    caiu: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  };
  const cls = map[v ?? "estavel"] ?? map.estavel;
  return (
    <span className={`text-xs px-2 py-0.5 rounded border ${cls}`}>{v ?? "—"}</span>
  );
}

export default async function CheckinSemanalPage({
  params, searchParams,
}: {
  params: Promise<{ week: string }>;
  searchParams: Promise<{ key?: string }>;
}) {
  const { week } = await params;
  const { key } = await searchParams;
  if (key !== process.env.REPORT_VIEW_SECRET) notFound();

  const rows = await loadCheckins(week);

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 px-6 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-baseline justify-between mb-6">
          <h1 className="text-2xl font-semibold">Check-in Semanal — {week}</h1>
          <span className="text-sm text-zinc-500">{rows.length} cliente(s)</span>
        </div>

        {rows.length === 0 && (
          <div className="text-zinc-500 text-sm p-12 text-center border border-zinc-800 rounded-lg">
            Nenhum check-in gerado pra {week} ainda. O poller roda segundas 11:00 BRT.
          </div>
        )}

        <div className="space-y-4">
          {rows.map(r => {
            const d = r.dataset;
            const mt = d.meta_this;
            const ml = d.meta_last;
            const dl = d.delta;
            return (
              <div key={r.client_slug} className="border border-zinc-800 rounded-xl bg-[#0e0e10] p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h2 className="text-lg font-medium">{r.client_name}</h2>
                    <p className="text-xs text-zinc-500">
                      {d.window_this.dateFrom} → {d.window_this.dateTo} (vs {d.window_last.dateFrom} → {d.window_last.dateTo})
                    </p>
                  </div>
                  <VeredictoBadge v={dl?.veredicto} />
                </div>

                {d.empty_reason && (
                  <p className="text-amber-400/80 text-sm">⚠ {d.empty_reason}</p>
                )}

                {mt && ml && dl && (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-2 mb-4 text-sm">
                    <Metric label="Investimento" cur={fmtMoney(mt.spend)} prev={fmtMoney(ml.spend)} delta={fmtPct(dl.spend_pct)} />
                    <Metric label="Leads" cur={fmtNum(mt.leads)} prev={fmtNum(ml.leads)} delta={fmtPct(dl.leads_pct)} />
                    <Metric label="WhatsApp" cur={fmtNum(mt.whatsapp)} prev={fmtNum(ml.whatsapp)} delta={fmtPct(dl.whatsapp_pct)} />
                    <Metric label="CTR" cur={`${mt.ctr.toFixed(2)}%`} prev={`${ml.ctr.toFixed(2)}%`} delta={fmtPct(dl.ctr_pct)} />
                    <Metric label="CPL" cur={fmtMoney(mt.cpl)} prev={fmtMoney(ml.cpl)} delta={fmtPct(-dl.cpl_pct)} />
                  </div>
                )}

                {r.texto_cliente && (
                  <div className="mt-4 border-t border-zinc-800 pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-medium text-zinc-300">Texto pronto pro cliente</h3>
                      <CopyButton text={r.texto_cliente} />
                    </div>
                    <pre className="text-sm text-zinc-200 whitespace-pre-wrap font-sans bg-zinc-900/50 border border-zinc-800 rounded p-3">{r.texto_cliente}</pre>
                  </div>
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
      <p className="text-[11px] text-zinc-500 mt-0.5">ant: {prev} · {delta}</p>
    </div>
  );
}
