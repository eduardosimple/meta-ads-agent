/**
 * GET /api/cron/pending-monthly?month=YYYY-MM
 * Lista clientes ativos com Meta que ainda não têm Otimização Mensal
 * gerada pra mês informado (consulta monthly_optimizations).
 * Consumido pelo mensal-poller.sh local — dia 1 08h BRT.
 */
import { NextRequest, NextResponse } from "next/server";
import { getClients } from "@/lib/clients";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 30;

function currentMonthKeyBR(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find(p => p.type === "year")!.value;
  const m = parts.find(p => p.type === "month")!.value;
  return `${y}-${m}`;
}

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const month = req.nextUrl.searchParams.get("month") || currentMonthKeyBR();

  const clients = await getClients();
  const active = clients.filter(c => c.ativo && c.meta?.ad_account_id && c.meta?.access_token);

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: existing, error } = await supabase
    .from("monthly_optimizations")
    .select("client_slug")
    .eq("month", month);
  if (error) return NextResponse.json({ error: "db", message: error.message, month }, { status: 500 });

  const have = new Set((existing ?? []).map(r => r.client_slug));
  const pending = active
    .filter(c => !have.has(c.slug))
    .map(c => ({ slug: c.slug, nome: c.nome }));

  return NextResponse.json({
    month,
    total_active_with_meta: active.length,
    pending_count: pending.length,
    pending,
  });
}
