/**
 * Phase 2 — recebe o AnalysisResult produzido pelo skill local e persiste no
 * daily_reports do Supabase. Faz pós-processamento leve: garante IDs únicos
 * nos proposals/alerts, filtra `pausar` cujo adset pai já está PAUSED, ordena
 * por score↓, popula aggregates. Não chama Claude — só I/O.
 *
 * Body:
 *  {
 *    slug: string,
 *    date: string,                // YYYY-MM-DD
 *    platform: "meta" | "google",
 *    analysis: AnalysisResult,    // shape produzido pela skill
 *    aggregates?: { spend_7d, leads_7d, whatsapp_7d, avg_ctr },
 *    adset_status?: Record<adset_id, status>,
 *  }
 */
import { NextRequest, NextResponse } from "next/server";
import { saveReport, getReportsByDate, type DailyReport } from "@/lib/reports-store";
import { getClientBySlug } from "@/lib/clients";
import type { AnalysisResult, Proposal, Alert } from "@/types/metrics";
import { randomUUID } from "crypto";

export const maxDuration = 30;

function authOK(req: NextRequest): boolean {
  return req.headers.get("x-cron-key") === process.env.CRON_SECRET
    || req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
}

export async function POST(req: NextRequest) {
  if (!authOK(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    slug: string;
    date: string;
    platform?: "meta" | "google";
    analysis: AnalysisResult;
    aggregates?: { spend_7d?: number; leads_7d?: number; whatsapp_7d?: number; avg_ctr?: number };
    adset_status?: Record<string, string>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.slug || !body.date || !body.analysis) {
    return NextResponse.json({ error: "missing_fields", required: ["slug", "date", "analysis"] }, { status: 400 });
  }
  const platform = body.platform ?? "meta";

  const client = await getClientBySlug(body.slug);
  if (!client) return NextResponse.json({ error: "client_not_found" }, { status: 404 });

  // Normaliza analysis: garante IDs, status default, arrays não-nulos
  const a = body.analysis;
  const proposalsRaw: Proposal[] = (a.proposals ?? []).map(p => {
    let action = p.action ?? { type: "none" as const };
    // Sanitiza scale_budget sem new_budget_cents válido: sem isso a UI mostrava
    // "Escalar para R$ NaN/dia" e a execução quebrava. Vira "none" — o relatório
    // ainda mostra o diagnóstico/ação_sugerida, sem botão de escalonamento quebrado.
    if (action.type === "scale_budget") {
      const cents = (action as { new_budget_cents?: number }).new_budget_cents;
      if (typeof cents !== "number" || !Number.isFinite(cents) || cents <= 0) {
        action = { type: "none" };
      }
    }
    return {
      ...p,
      id: p.id || randomUUID(),
      status: p.status || "pending",
      created_at: p.created_at || new Date().toISOString(),
      metricas_problema: p.metricas_problema ?? [],
      action,
    };
  });

  // Filtra `pausar` cujo adset já está PAUSED no Meta
  const proposalsFiltered = body.adset_status
    ? proposalsRaw.filter(p => {
        if (p.verdict !== "pausar") return true;
        if (p.action.type !== "pause_adset") return true;
        const status = body.adset_status?.[p.action.adset_id];
        return status !== "PAUSED";
      })
    : proposalsRaw;

  // Ordena por score↓ quando presente (mantém ordem original como tiebreaker)
  const proposals = [...proposalsFiltered].sort((x, y) => (y.score ?? 0) - (x.score ?? 0));

  const alerts: Alert[] = (a.alerts ?? []).map(al => ({
    ...al,
    id: al.id || randomUUID(),
  }));

  const finalAnalysis: AnalysisResult = {
    client_slug: body.slug,
    analyzed_at: a.analyzed_at || new Date().toISOString(),
    proposals,
    alerts,
    summary_text: a.summary_text || "",
    plano_de_acao: a.plano_de_acao ?? [],
    checklist: a.checklist ?? [],
    campaigns_analysis: a.campaigns_analysis ?? [],
    spend_7d: body.aggregates?.spend_7d ?? a.spend_7d,
    leads_7d: body.aggregates?.leads_7d ?? a.leads_7d,
    whatsapp_7d: body.aggregates?.whatsapp_7d ?? a.whatsapp_7d,
    avg_ctr: body.aggregates?.avg_ctr ?? a.avg_ctr,
    conversions_7d: a.conversions_7d,
    cost_per_conversion: a.cost_per_conversion,
  };

  // Merge no relatório existente (preserva outras plataformas)
  const existing = (await getReportsByDate(body.date)).find(r => r.client_slug === body.slug);
  const report: DailyReport = existing ?? {
    id: randomUUID(),
    client_slug: body.slug,
    client_name: client.nome,
    date: body.date,
    created_at: new Date().toISOString(),
  };

  if (platform === "meta") report.meta = finalAnalysis;
  else report.google = finalAnalysis;

  try {
    await saveReport(report);
  } catch (e) {
    return NextResponse.json({ error: "save_failed", message: String(e) }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    slug: body.slug,
    date: body.date,
    platform,
    proposals_saved: proposals.length,
    alerts_saved: alerts.length,
    campaigns_saved: (finalAnalysis.campaigns_analysis ?? []).length,
  });
}
