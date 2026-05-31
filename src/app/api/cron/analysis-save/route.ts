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
import { executeAutoActions } from "@/lib/auto-executor";
import { getAdInsights } from "@/lib/meta-api";
import { getGoogleAdGroupInsights } from "@/lib/google-ads-api";
import { todayBR, nDaysAgoBR } from "@/lib/date-br";

// 120s: além do I/O, busca métricas do cliente (para os gates) e executa as
// ações automáticas via Meta/Google API antes de persistir.
export const maxDuration = 120;

/**
 * Busca spend/days_running por ad_id (Meta) ou spend por ad_group + spend por
 * campanha (Google) e anexa em proposal.gate_inputs. Necessário porque as
 * proposals vindas da skill local não trazem esses números, e o auto-executor
 * precisa deles para avaliar os gates 12345. Falha não-fatal: sem métricas,
 * gate_inputs fica vazio e o auto-executor apenas pula (nada é executado).
 */
async function attachGateInputs(
  client: Awaited<ReturnType<typeof getClientBySlug>>,
  platform: "meta" | "google",
  proposals: Proposal[],
): Promise<Proposal[]> {
  if (!client) return proposals;
  const dateTo = todayBR();
  const dateFrom = nDaysAgoBR(7);
  try {
    if (platform === "meta" && client.meta?.ad_account_id && client.meta?.access_token) {
      const ads = await getAdInsights(client.meta.ad_account_id, client.meta.access_token, dateFrom, dateTo);
      const byAd = new Map(ads.map(m => [m.ad_id, m]));
      return proposals.map(p => {
        const m = byAd.get(p.ad_id);
        return { ...p, gate_inputs: { spend: m?.spend ?? 0, days_running: m?.days_running ?? 0 } };
      });
    }
    if (platform === "google" && client.google) {
      const groups = await getGoogleAdGroupInsights(client.google, dateFrom, dateTo);
      const adGroupSpend = new Map<string, number>();
      const campaignSpend = new Map<string, number>();
      for (const g of groups) {
        adGroupSpend.set(g.ad_group_id, g.spend);
        campaignSpend.set(g.campaign_id, (campaignSpend.get(g.campaign_id) ?? 0) + g.spend);
      }
      return proposals.map(p => {
        const a = p.action;
        const campId = (a.type === "scale_google_campaign" || a.type === "pause_google_campaign") ? a.campaign_id : undefined;
        return {
          ...p,
          gate_inputs: {
            spend: adGroupSpend.get(p.ad_id) ?? 0,
            campaign_spend: campId ? (campaignSpend.get(campId) ?? 0) : 0,
          },
        };
      });
    }
  } catch {
    // métricas indisponíveis → segue sem gate_inputs (auto-executor pula tudo)
  }
  return proposals;
}

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

  // Anexa spend/days/campaign_spend para os gates do auto-executor.
  const proposalsWithGates = await attachGateInputs(client, platform, proposals);

  const alerts: Alert[] = (a.alerts ?? []).map(al => ({
    ...al,
    id: al.id || randomUUID(),
  }));

  const finalAnalysis: AnalysisResult = {
    client_slug: body.slug,
    analyzed_at: a.analyzed_at || new Date().toISOString(),
    proposals: proposalsWithGates,
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

  // Executa as ações automáticas elegíveis (pausar/escalar dentro dos gates)
  // e resolve o status de cada proposal antes de persistir. Nunca lança.
  const executedAnalysis = await executeAutoActions(client, finalAnalysis);

  // Merge no relatório existente (preserva outras plataformas)
  const existing = (await getReportsByDate(body.date)).find(r => r.client_slug === body.slug);
  const report: DailyReport = existing ?? {
    id: randomUUID(),
    client_slug: body.slug,
    client_name: client.nome,
    date: body.date,
    created_at: new Date().toISOString(),
  };

  if (platform === "meta") report.meta = executedAnalysis;
  else report.google = executedAnalysis;

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
