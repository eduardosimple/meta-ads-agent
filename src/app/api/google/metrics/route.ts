import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getClientBySlug } from "@/lib/clients";
import { getGoogleCampaignInsights } from "@/lib/google-ads-api";
import type { MetricsResponse } from "@/types/metrics";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientSlug = searchParams.get("clientSlug");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");

  if (!clientSlug || !dateFrom || !dateTo) {
    return NextResponse.json({ error: "clientSlug, dateFrom e dateTo são obrigatórios" }, { status: 400 });
  }

  const client = await getClientBySlug(clientSlug);
  if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  if (!client.google) return NextResponse.json({ error: "Cliente sem credenciais Google Ads" }, { status: 400 });

  try {
    const daily = await getGoogleCampaignInsights(client.google, dateFrom, dateTo);

    const summary = {
      total_spend: daily.reduce((s, d) => s + d.spend, 0),
      total_impressions: daily.reduce((s, d) => s + d.impressions, 0),
      total_clicks: daily.reduce((s, d) => s + d.clicks, 0),
      total_reach: 0,
      total_leads: daily.reduce((s, d) => s + d.leads, 0),
      avg_ctr: daily.length > 0 ? daily.reduce((s, d) => s + d.ctr, 0) / daily.length : 0,
      avg_cpc: daily.length > 0 ? daily.reduce((s, d) => s + d.cpc, 0) / daily.filter(d => d.cpc > 0).length || 0 : 0,
      cpl: 0,
    };
    const totalLeads = summary.total_leads;
    summary.cpl = totalLeads > 0 ? summary.total_spend / totalLeads : 0;

    const response: MetricsResponse = { summary, daily, date_from: dateFrom, date_to: dateTo };
    return NextResponse.json(response);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao buscar dados do Google Ads";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
