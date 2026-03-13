import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getClientBySlug } from "@/lib/clients";
import { getCampaignInsights } from "@/lib/meta-api";
import type { MetricsResponse, MetricsSummary } from "@/types/metrics";

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const clientSlug = searchParams.get("clientSlug");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");

  if (!clientSlug) {
    return NextResponse.json({ error: "clientSlug obrigatório" }, { status: 400 });
  }

  const client = getClientBySlug(clientSlug);
  if (!client) {
    return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  }

  if (!client.ativo) {
    return NextResponse.json({ error: "Cliente inativo" }, { status: 403 });
  }

  const now = new Date();
  const defaultTo = now.toISOString().split("T")[0];
  const defaultFrom = new Date(now.setDate(now.getDate() - 30))
    .toISOString()
    .split("T")[0];

  const from = dateFrom ?? defaultFrom;
  const to = dateTo ?? defaultTo;

  try {
    const daily = await getCampaignInsights(
      client.meta.ad_account_id,
      client.meta.access_token,
      from,
      to
    );

    const summary: MetricsSummary = daily.reduce(
      (acc, d) => ({
        total_spend: acc.total_spend + d.spend,
        total_impressions: acc.total_impressions + d.impressions,
        total_clicks: acc.total_clicks + d.clicks,
        total_reach: acc.total_reach + d.reach,
        total_leads: acc.total_leads + d.leads,
        avg_ctr: 0,
        avg_cpc: 0,
        cpl: 0,
      }),
      {
        total_spend: 0,
        total_impressions: 0,
        total_clicks: 0,
        total_reach: 0,
        total_leads: 0,
        avg_ctr: 0,
        avg_cpc: 0,
        cpl: 0,
      }
    );

    summary.avg_ctr =
      summary.total_impressions > 0
        ? (summary.total_clicks / summary.total_impressions) * 100
        : 0;

    summary.avg_cpc =
      summary.total_clicks > 0
        ? summary.total_spend / summary.total_clicks
        : 0;

    summary.cpl =
      summary.total_leads > 0
        ? summary.total_spend / summary.total_leads
        : 0;

    const response: MetricsResponse = {
      summary,
      daily,
      date_from: from,
      date_to: to,
    };

    return NextResponse.json(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro na Meta API";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
