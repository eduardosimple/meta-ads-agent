/**
 * Phase 2 — devolve o INPUT pré-montado pra análise meta de UM cliente.
 * Faz fetch Meta + monta prompt + histórico, MAS não chama Claude (a análise
 * acontece local via skill `analise-diaria` usando plano Claude Code).
 *
 * Resposta:
 *   {
 *     slug, date_from, date_to,
 *     system_prompt: string,
 *     user_message: string,
 *     aggregates: { spend_7d, leads_7d, whatsapp_7d, avg_ctr } -- pra save
 *     adset_status: Record<adset_id, status>  -- pro filtro pausar-paused
 *     ad_metrics_lite: Array<{ad_id, ad_name, spend, ctr, cpl, frequency, ...}>
 *   }
 *
 * Em fluxo "sem dados" devolve { empty_reason } e o skill pula direto pro save
 * com o relatório-mensagem.
 */
import { NextRequest, NextResponse } from "next/server";
import { getClientBySlug } from "@/lib/clients";
import { buildMetaAnalysisInput } from "@/lib/analysis-build";
import { todayBR, nDaysAgoBR } from "@/lib/date-br";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
  const dateTo = req.nextUrl.searchParams.get("date") || todayBR();
  const dateFrom = nDaysAgoBR(7);

  const client = await getClientBySlug(slug);
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  if (!client.ativo) return NextResponse.json({ status: "inactive" });

  let input;
  try {
    input = await buildMetaAnalysisInput(client, dateFrom, dateTo);
  } catch (e) {
    return NextResponse.json({ error: "build_failed", message: String(e) }, { status: 500 });
  }

  if (input.emptyReason) {
    return NextResponse.json({
      slug, date_from: dateFrom, date_to: dateTo,
      empty_reason: input.emptyReason,
      client_name: client.nome,
    });
  }

  // Aggregates pro save (idênticos ao que analyzeMetaAds calcula)
  const adMetrics = input.raw.adMetrics;
  const campaignData = input.raw.campaignData;
  const totalSpend = adMetrics.reduce((s, m) => s + m.spend, 0) || campaignData.reduce((s, c) => s + c.spend, 0);
  const totalLeads = adMetrics.reduce((s, m) => s + m.leads, 0) || campaignData.reduce((s, c) => s + c.leads, 0);
  const totalWhats = adMetrics.reduce((s, m) => s + m.whatsapp_conversations, 0) || campaignData.reduce((s, c) => s + c.whatsapp_conversations, 0);
  const totalImp = adMetrics.reduce((s, m) => s + m.impressions, 0) || campaignData.reduce((s, c) => s + c.impressions, 0);
  const totalClicks = adMetrics.reduce((s, m) => s + m.clicks, 0) || campaignData.reduce((s, c) => s + c.clicks, 0);
  const avgCtr = totalImp > 0 ? (totalClicks / totalImp) * 100 : 0;

  // Snapshots leves pro save endpoint reconstruir (sem reenviar tudo)
  const adsetStatus: Record<string, string> = {};
  for (const a of input.raw.adsetData) adsetStatus[a.adset_id] = a.status;

  const adMetricsLite = input.raw.adMetrics.map(m => ({
    ad_id: m.ad_id,
    ad_name: m.ad_name,
    adset_id: m.adset_id,
    spend: m.spend,
    impressions: m.impressions,
    ctr: m.ctr,
    cpl: m.cpl,
    frequency: m.frequency,
    leads: m.leads,
  }));

  return NextResponse.json({
    slug,
    client_name: client.nome,
    date_from: dateFrom,
    date_to: dateTo,
    system_prompt: input.systemPrompt,
    user_message: input.userMessage,
    schema_hint: input.toolSchema,
    aggregates: {
      spend_7d: totalSpend,
      leads_7d: totalLeads,
      whatsapp_7d: totalWhats,
      avg_ctr: avgCtr,
    },
    adset_status: adsetStatus,
    ad_metrics_lite: adMetricsLite,
  });
}
