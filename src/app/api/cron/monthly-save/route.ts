/**
 * POST /api/cron/monthly-save
 * Persiste Otimização Mensal. Upsert por (client_slug, month).
 */
import { NextRequest, NextResponse } from "next/server";
import { getClientBySlug } from "@/lib/clients";
import { createClient } from "@supabase/supabase-js";
import type { MonthlyDataset, MonthlyAuditoria, MonthlyProposal } from "@/lib/monthly-data";

export const maxDuration = 30;

function authOK(req: NextRequest) {
  return req.headers.get("x-cron-key") === process.env.CRON_SECRET
    || req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
}

export async function POST(req: NextRequest) {
  if (!authOK(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: {
    slug: string; month: string;
    dataset: MonthlyDataset;
    auditoria?: MonthlyAuditoria;
    propostas?: MonthlyProposal[];
    texto_resumo?: string;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  if (!body.slug || !body.month || !body.dataset) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  const client = await getClientBySlug(body.slug);
  if (!client) return NextResponse.json({ error: "client_not_found" }, { status: 404 });

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { error } = await supabase.from("monthly_optimizations").upsert({
    client_slug: body.slug,
    client_name: client.nome,
    month: body.month,
    date_from: body.dataset.window_this.dateFrom,
    date_to: body.dataset.window_this.dateTo,
    dataset: body.dataset,
    auditoria: body.auditoria ?? body.dataset.auditoria,
    propostas: body.propostas ?? body.dataset.proposals,
    texto_resumo: body.texto_resumo ?? null,
    generated_at: new Date().toISOString(),
  }, { onConflict: "client_slug,month" });
  if (error) return NextResponse.json({ error: "save_failed", message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, slug: body.slug, month: body.month });
}
