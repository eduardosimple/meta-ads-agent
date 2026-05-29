/**
 * POST /api/cron/weekly-apply
 * Executa as ações marcadas como auto_apply de uma Otimização Semanal.
 * Body: { slug, week, actions: WeeklyAutoAction[], dry_run: boolean }
 *
 * Em dry_run=true (default), NÃO chama Meta API — só simula e retorna os
 * comandos que rodariam. Útil pra validar antes de ligar o auto-apply
 * real do piloto.
 *
 * Em dry_run=false, executa via pauseEntity / updateAdsetBudget e devolve
 * o resultado de cada uma. Falha numa não interrompe as outras.
 */
import { NextRequest, NextResponse } from "next/server";
import { getClientBySlug } from "@/lib/clients";
import { pauseEntity, updateAdsetBudget } from "@/lib/meta-api";
import type { WeeklyAutoAction } from "@/lib/weekly-data";

export const maxDuration = 90;

function authOK(req: NextRequest) {
  return req.headers.get("x-cron-key") === process.env.CRON_SECRET
    || req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
}

interface ApplyResult extends WeeklyAutoAction {
  ok: boolean;
  applied_at?: string;
  error?: string;
  dry_run?: boolean;
}

export async function POST(req: NextRequest) {
  if (!authOK(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { slug: string; week: string; actions: WeeklyAutoAction[]; dry_run?: boolean };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  if (!body.slug || !body.week || !Array.isArray(body.actions)) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  const dry = body.dry_run !== false; // default true por segurança

  const client = await getClientBySlug(body.slug);
  if (!client) return NextResponse.json({ error: "client_not_found" }, { status: 404 });
  if (!client.meta?.access_token) {
    return NextResponse.json({ error: "no_meta_token" }, { status: 400 });
  }

  const results: ApplyResult[] = [];
  for (const a of body.actions) {
    if (dry) {
      results.push({ ...a, ok: true, dry_run: true, applied_at: new Date().toISOString() });
      continue;
    }
    try {
      if (a.type === "pause_ad") {
        if (!a.ad_id) throw new Error("ad_id required");
        await pauseEntity(a.ad_id, client.meta.access_token);
        results.push({ ...a, ok: true, applied_at: new Date().toISOString() });
      } else if (a.type === "scale_budget") {
        if (!a.adset_id || !a.new_daily_budget_cents) throw new Error("adset_id and new_daily_budget_cents required");
        await updateAdsetBudget(a.adset_id, a.new_daily_budget_cents, client.meta.access_token);
        results.push({ ...a, ok: true, applied_at: new Date().toISOString() });
      } else {
        results.push({ ...a, ok: false, error: `tipo desconhecido: ${a.type}` });
      }
    } catch (e) {
      results.push({ ...a, ok: false, error: String(e) });
    }
  }

  const summary = {
    total: body.actions.length,
    success: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    dry_run: dry,
  };
  return NextResponse.json({ ok: true, slug: body.slug, week: body.week, summary, results });
}
