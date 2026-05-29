/**
 * GET /api/cron/pending-weekly?week=YYYY-Www
 * Lista clientes ativos com Meta que ainda não têm Otimização Semanal
 * gerada pra semana informada (consulta weekly_optimizations).
 * Consumido pelo semanal-poller.sh local — segunda 08h BRT.
 */
import { NextRequest, NextResponse } from "next/server";
import { getClients } from "@/lib/clients";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 30;

function currentIsoWeekBR(): string {
  const tz = "America/Sao_Paulo";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const y = +parts.find(p => p.type === "year")!.value;
  const m = +parts.find(p => p.type === "month")!.value;
  const d = +parts.find(p => p.type === "day")!.value;
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const week = req.nextUrl.searchParams.get("week") || currentIsoWeekBR();

  const clients = await getClients();
  const active = clients.filter(c => c.ativo && c.meta?.ad_account_id && c.meta?.access_token);

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: existing, error } = await supabase
    .from("weekly_optimizations")
    .select("client_slug")
    .eq("week", week);
  if (error) return NextResponse.json({ error: "db", message: error.message, week }, { status: 500 });

  const have = new Set((existing ?? []).map(r => r.client_slug));
  const pending = active
    .filter(c => !have.has(c.slug))
    .map(c => ({ slug: c.slug, nome: c.nome }));

  return NextResponse.json({
    week,
    total_active_with_meta: active.length,
    pending_count: pending.length,
    pending,
  });
}
