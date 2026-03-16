import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getClients } from "@/lib/clients";
import { getAdInsights } from "@/lib/meta-api";
import { getGoogleAdGroupInsights, getLastGoogleChange } from "@/lib/google-ads-api";
import type { AdMetrics, GoogleAdMetrics } from "@/types/metrics";

export const maxDuration = 60;

export interface LastChange {
  at: string;           // ISO timestamp
  entity_name: string;  // campaign/adset/ad name
  entity_type: string;  // "campanha" | "conjunto" | "anúncio"
  via: "sistema" | "gerenciador";
}

export interface ClientOverview {
  slug: string;
  nome: string;
  ativo: boolean;
  status: "ok" | "razoavel" | "critical" | "no_data";
  issues: string[];
  spend_7d: number;
  active_ads: number;
  avg_ctr: number;
  avg_cpm: number;
  avg_cpc: number;
  avg_frequency: number;
  leads_7d: number;
  cpl: number;
  last_meta_change: LastChange | null;
  last_google_change: LastChange | null;
  // Google Ads summary
  google_spend_7d?: number;
  google_active_ad_groups?: number;
  google_avg_ctr?: number;
  google_conversions_7d?: number;
  google_cost_per_conversion?: number;
  google_error?: string;
  error?: string;
}

function computeStatus(ads: AdMetrics[]): { status: ClientOverview["status"]; issues: string[] } {
  if (ads.length === 0) return { status: "no_data", issues: [] };

  const issues: string[] = [];
  let hasCritical = false;
  let hasRazoavel = false;

  for (const ad of ads) {
    if (ad.cpm > 30) { issues.push(`CPM crítico: R$${ad.cpm.toFixed(0)} (${ad.ad_name})`); hasCritical = true; }
    else if (ad.cpm > 20) { issues.push(`CPM alto: R$${ad.cpm.toFixed(0)} (${ad.ad_name})`); hasRazoavel = true; }

    if (ad.cpc > 7) { issues.push(`CPC crítico: R$${ad.cpc.toFixed(2)} (${ad.ad_name})`); hasCritical = true; }
    else if (ad.cpc > 5) { issues.push(`CPC alto: R$${ad.cpc.toFixed(2)} (${ad.ad_name})`); hasRazoavel = true; }

    if (ad.impressions > 1000 && ad.ctr < 0.5) { issues.push(`CTR crítico: ${ad.ctr.toFixed(2)}% (${ad.ad_name})`); hasCritical = true; }
    else if (ad.impressions > 1000 && ad.ctr < 0.8) { issues.push(`CTR baixo: ${ad.ctr.toFixed(2)}% (${ad.ad_name})`); hasRazoavel = true; }

    if (ad.frequency > 4) { issues.push(`Frequência crítica: ${ad.frequency.toFixed(1)}x (${ad.ad_name})`); hasCritical = true; }
    else if (ad.frequency > 3.5) { issues.push(`Frequência alta: ${ad.frequency.toFixed(1)}x (${ad.ad_name})`); hasRazoavel = true; }

    if (ad.leads > 0 && ad.cpl > 150) { issues.push(`CPL crítico: R$${ad.cpl.toFixed(0)} (${ad.ad_name})`); hasCritical = true; }
    else if (ad.leads > 0 && ad.cpl > 100) { issues.push(`CPL alto: R$${ad.cpl.toFixed(0)} (${ad.ad_name})`); hasRazoavel = true; }
  }

  const seen = new Set<string>();
  const uniqueIssues = issues.filter(i => { if (seen.has(i)) return false; seen.add(i); return true; });

  return {
    status: hasCritical ? "critical" : hasRazoavel ? "razoavel" : "ok",
    issues: uniqueIssues.slice(0, 5),
  };
}

async function getLastMetaChange(
  adAccountId: string,
  accessToken: string
): Promise<LastChange | null> {
  const META_API_BASE = "https://graph.facebook.com/v19.0";
  const token = encodeURIComponent(accessToken);

  let latest: { at: Date; entity_name: string; entity_type: string } | null = null;

  function track(name: string, type: string, updatedTime: string | undefined) {
    if (!updatedTime) return;
    const d = new Date(updatedTime);
    if (!latest || d > latest.at) {
      latest = { at: d, entity_name: name, entity_type: type };
    }
  }

  try {
    // Fetch campaigns updated_time
    const camps = await fetch(
      `${META_API_BASE}/${adAccountId}/campaigns?fields=name,updated_time&access_token=${token}&limit=50`
    ).then(r => r.json()) as { data?: Array<{ name: string; updated_time?: string }> };
    for (const c of camps.data ?? []) track(c.name, "campanha", c.updated_time);

    // Fetch adsets updated_time
    const adsets = await fetch(
      `${META_API_BASE}/${adAccountId}/adsets?fields=name,updated_time&access_token=${token}&limit=100`
    ).then(r => r.json()) as { data?: Array<{ name: string; updated_time?: string }> };
    for (const a of adsets.data ?? []) track(a.name, "conjunto", a.updated_time);

    // Fetch ads updated_time
    const ads = await fetch(
      `${META_API_BASE}/${adAccountId}/ads?fields=name,updated_time&access_token=${token}&limit=100`
    ).then(r => r.json()) as { data?: Array<{ name: string; updated_time?: string }> };
    for (const a of ads.data ?? []) track(a.name, "anúncio", a.updated_time);
  } catch {
    return null;
  }

  if (!latest) return null;

  return {
    at: (latest as { at: Date }).at.toISOString(),
    entity_name: (latest as { entity_name: string }).entity_name,
    entity_type: (latest as { entity_type: string }).entity_type,
    via: "gerenciador", // default — frontend will override if system timestamp is more recent
  };
}

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const clients = await getClients();
  const activeClients = clients.filter(c => c.ativo);

  const now = new Date();
  const dateTo = now.toISOString().split("T")[0];
  const dateFrom = new Date(now.setDate(now.getDate() - 7)).toISOString().split("T")[0];

  const results = await Promise.allSettled(
    activeClients.map(async (client): Promise<ClientOverview> => {
      let ads: AdMetrics[] = [];
      let error: string | undefined;

      const [insightsResult, lastMetaChange, googleInsightsResult, lastGoogleChangeResult] = await Promise.allSettled([
        getAdInsights(client.meta.ad_account_id, client.meta.access_token, dateFrom, dateTo),
        getLastMetaChange(client.meta.ad_account_id, client.meta.access_token),
        client.google
          ? getGoogleAdGroupInsights(client.google, dateFrom, dateTo)
          : Promise.resolve(null),
        client.google
          ? getLastGoogleChange(client.google, dateFrom)
          : Promise.resolve(null),
      ]);

      if (insightsResult.status === "fulfilled") {
        ads = insightsResult.value;
      } else {
        error = insightsResult.reason instanceof Error
          ? insightsResult.reason.message
          : "Erro ao buscar dados";
      }

      const activeAds = ads.filter(a => a.status === "ACTIVE");
      const totalSpend = ads.reduce((s, a) => s + a.spend, 0);
      const totalLeads = ads.reduce((s, a) => s + a.leads, 0);
      const avgCtr = ads.length > 0 ? ads.reduce((s, a) => s + a.ctr, 0) / ads.length : 0;
      const avgCpm = ads.length > 0 ? ads.reduce((s, a) => s + a.cpm, 0) / ads.length : 0;
      const avgCpc = ads.length > 0 ? ads.reduce((s, a) => s + a.cpc, 0) / ads.length : 0;
      const avgFreq = ads.length > 0 ? ads.reduce((s, a) => s + a.frequency, 0) / ads.length : 0;

      const { status, issues } = error
        ? { status: "no_data" as const, issues: [`Erro: ${error}`] }
        : computeStatus(ads);

      // Google Ads summary
      let googleFields: Partial<ClientOverview> = {};
      if (client.google) {
        if (googleInsightsResult.status === "fulfilled" && googleInsightsResult.value) {
          const gAds = googleInsightsResult.value as GoogleAdMetrics[];
          const activeGroups = gAds.filter(ag => ag.status === "ENABLED");
          const gSpend = gAds.reduce((s, ag) => s + ag.spend, 0);
          const gConversions = gAds.reduce((s, ag) => s + ag.conversions, 0);
          const gAvgCtr = gAds.length > 0 ? gAds.reduce((s, ag) => s + ag.ctr, 0) / gAds.length : 0;
          googleFields = {
            google_spend_7d: gSpend,
            google_active_ad_groups: activeGroups.length,
            google_avg_ctr: gAvgCtr,
            google_conversions_7d: gConversions,
            google_cost_per_conversion: gConversions > 0 ? gSpend / gConversions : 0,
          };
        } else if (googleInsightsResult.status === "rejected") {
          googleFields = {
            google_error: googleInsightsResult.reason instanceof Error
              ? googleInsightsResult.reason.message
              : "Erro ao buscar Google Ads",
          };
        }
      }

      return {
        slug: client.slug,
        nome: client.nome,
        ativo: client.ativo,
        status,
        issues,
        spend_7d: totalSpend,
        active_ads: activeAds.length,
        avg_ctr: avgCtr,
        avg_cpm: avgCpm,
        avg_cpc: avgCpc,
        avg_frequency: avgFreq,
        leads_7d: totalLeads,
        cpl: totalLeads > 0 ? totalSpend / totalLeads : 0,
        last_meta_change: lastMetaChange.status === "fulfilled" ? lastMetaChange.value : null,
        last_google_change: lastGoogleChangeResult.status === "fulfilled" ? lastGoogleChangeResult.value : null,
        ...googleFields,
        error,
      };
    })
  );

  const overview: ClientOverview[] = results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return {
      slug: activeClients[i].slug,
      nome: activeClients[i].nome,
      ativo: activeClients[i].ativo,
      status: "no_data" as const,
      issues: ["Erro ao carregar dados"],
      spend_7d: 0,
      active_ads: 0,
      avg_ctr: 0,
      avg_cpm: 0,
      avg_cpc: 0,
      avg_frequency: 0,
      leads_7d: 0,
      cpl: 0,
      last_meta_change: null,
      last_google_change: null,
      error: "Erro inesperado",
    };
  });

  return NextResponse.json({ overview, fetched_at: new Date().toISOString() });
}
