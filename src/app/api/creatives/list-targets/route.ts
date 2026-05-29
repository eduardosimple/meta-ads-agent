/**
 * GET /api/creatives/list-targets?slug=X&view_key=Y
 * Lista campanhas ATIVAS e adsets ATIVOS do cliente — pra popular o select
 * do modal de upload de criativo.
 */
import { NextRequest, NextResponse } from "next/server";
import { getClientBySlug } from "@/lib/clients";
import { getCampaignData, getAdsetData } from "@/lib/meta-api";
import { todayBR, nDaysAgoBR } from "@/lib/date-br";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const viewKey = req.nextUrl.searchParams.get("view_key");
  if (viewKey !== process.env.REPORT_VIEW_SECRET) {
    return NextResponse.json({ error: "invalid_view_key" }, { status: 401 });
  }
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
  const client = await getClientBySlug(slug);
  if (!client) return NextResponse.json({ error: "client_not_found" }, { status: 404 });
  if (!client.meta?.access_token || !client.meta?.ad_account_id) {
    return NextResponse.json({ error: "no_meta_creds" }, { status: 400 });
  }
  const dateTo = todayBR(); const dateFrom = nDaysAgoBR(7);
  const [campRes, adsetRes] = await Promise.allSettled([
    getCampaignData(client.meta.ad_account_id, client.meta.access_token, dateFrom, dateTo),
    getAdsetData(client.meta.ad_account_id, client.meta.access_token, dateFrom, dateTo),
  ]);
  if (campRes.status !== "fulfilled" || adsetRes.status !== "fulfilled") {
    return NextResponse.json({ error: "meta_fetch_failed" }, { status: 502 });
  }
  const campaigns = campRes.value
    .filter(c => c.status === "ACTIVE")
    .map(c => ({
      id: c.campaign_id, name: c.campaign_name, objective: c.objective,
    }));
  const adsets = adsetRes.value
    .filter(a => a.status === "ACTIVE")
    .map(a => ({
      id: a.adset_id, name: a.adset_name, campaign_id: a.campaign_id,
      optimization_goal: a.optimization_goal,
    }));
  return NextResponse.json({ campaigns, adsets });
}
