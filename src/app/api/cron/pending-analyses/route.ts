/**
 * Phase 2 — lista clientes ativos sem análise meta completa pra data informada.
 * Consumido pelo skill local `analise-diaria` (Claude Code = plano, sem API).
 * Mantém cobertura TOTAL: enumera todos os clientes `ativo=true`.
 */
import { NextRequest, NextResponse } from "next/server";
import { getClients } from "@/lib/clients";
import { getReportsByDate } from "@/lib/reports-store";
import { todayBR } from "@/lib/date-br";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const date = req.nextUrl.searchParams.get("date") || todayBR();

  const clients = await getClients();
  const active = clients.filter(c => c.ativo);

  let reports;
  try {
    reports = await getReportsByDate(date);
  } catch (e) {
    return NextResponse.json({ error: "db", message: String(e), date }, { status: 500 });
  }
  const have = new Map(reports.map(r => [r.client_slug, r]));

  const pending = active
    .filter(c => {
      const r = have.get(c.slug);
      return !r?.meta || (c.google && !r?.google);
    })
    .map(c => ({
      slug: c.slug,
      nome: c.nome,
      needs_meta: !have.get(c.slug)?.meta,
      needs_google: !!c.google && !have.get(c.slug)?.google,
    }));

  return NextResponse.json({
    date,
    total_active: active.length,
    pending_count: pending.length,
    pending,
  });
}
