import type { ClientGoogle } from "@/types/client";
import type { DailyMetric, GoogleAdMetrics } from "@/types/metrics";

const GOOGLE_ADS_API_BASE = "https://googleads.googleapis.com/v18";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

function normalizeCustomerId(id: string): string {
  return id.replace(/-/g, "");
}

async function getAccessToken(google: ClientGoogle): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: google.client_id,
      client_secret: google.client_secret,
      refresh_token: google.refresh_token,
    }),
  });
  const data = await res.json() as { access_token?: string; error?: string; error_description?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description ?? data.error ?? "Falha ao obter access token do Google");
  }
  return data.access_token;
}

async function gaqlQuery<T>(
  google: ClientGoogle,
  accessToken: string,
  query: string
): Promise<T[]> {
  const customerId = normalizeCustomerId(google.customer_id);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${accessToken}`,
    "developer-token": google.developer_token,
  };
  if (google.manager_customer_id) {
    headers["login-customer-id"] = normalizeCustomerId(google.manager_customer_id);
  }

  const res = await fetch(`${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:search`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query }),
  });

  const data = await res.json() as { results?: T[]; error?: { message?: string; details?: Array<{ errors?: Array<{ message?: string }> }> } };

  if (!res.ok || data.error) {
    const detail = data.error?.details?.[0]?.errors?.[0]?.message;
    const msg = detail ?? data.error?.message ?? `Google Ads API error: ${res.status}`;
    throw new Error(msg);
  }

  return data.results ?? [];
}

export async function validateGoogleAdsToken(google: ClientGoogle): Promise<boolean> {
  try {
    const accessToken = await getAccessToken(google);
    await gaqlQuery(google, accessToken, "SELECT customer.id FROM customer LIMIT 1");
    return true;
  } catch {
    return false;
  }
}

export interface GoogleCampaign {
  id: string;
  name: string;
  status: string;
}

export async function getGoogleCampaigns(google: ClientGoogle): Promise<GoogleCampaign[]> {
  const accessToken = await getAccessToken(google);
  const results = await gaqlQuery<{
    campaign: { id: string; name: string; status: string };
  }>(google, accessToken, `
    SELECT campaign.id, campaign.name, campaign.status
    FROM campaign
    WHERE campaign.status != 'REMOVED'
    ORDER BY campaign.name
  `);
  return results.map(r => ({
    id: r.campaign.id,
    name: r.campaign.name,
    status: r.campaign.status,
  }));
}

export async function getGoogleCampaignInsights(
  google: ClientGoogle,
  dateFrom: string,
  dateTo: string
): Promise<DailyMetric[]> {
  const accessToken = await getAccessToken(google);
  const results = await gaqlQuery<{
    segments: { date: string };
    metrics: {
      impressions: string;
      clicks: string;
      costMicros: string;
      ctr: string;
      averageCpc: string;
      conversions: string;
    };
  }>(google, accessToken, `
    SELECT
      segments.date,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.ctr,
      metrics.average_cpc,
      metrics.conversions
    FROM campaign
    WHERE segments.date BETWEEN '${dateFrom}' AND '${dateTo}'
      AND campaign.status != 'REMOVED'
    ORDER BY segments.date
  `);

  // Aggregate by date (multiple campaigns per day → sum)
  const byDate = new Map<string, DailyMetric>();
  for (const r of results) {
    const date = r.segments.date;
    const spend = parseInt(r.metrics.costMicros ?? "0") / 1_000_000;
    const impressions = parseInt(r.metrics.impressions ?? "0");
    const clicks = parseInt(r.metrics.clicks ?? "0");
    const conversions = parseFloat(r.metrics.conversions ?? "0");

    const existing = byDate.get(date);
    if (existing) {
      existing.spend += spend;
      existing.impressions += impressions;
      existing.clicks += clicks;
      existing.leads += Math.round(conversions);
    } else {
      byDate.set(date, {
        date,
        spend,
        impressions,
        clicks,
        reach: 0, // not available at campaign level in GAQL
        ctr: clicks > 0 && impressions > 0 ? (clicks / impressions) * 100 : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
        leads: Math.round(conversions),
      });
    }
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export async function getGoogleAdGroupInsights(
  google: ClientGoogle,
  dateFrom: string,
  dateTo: string
): Promise<GoogleAdMetrics[]> {
  const accessToken = await getAccessToken(google);
  const results = await gaqlQuery<{
    adGroup: { id: string; name: string; status: string };
    campaign: { id: string; name: string };
    metrics: {
      impressions: string;
      clicks: string;
      costMicros: string;
      ctr: string;
      averageCpc: string;
      conversions: string;
      costPerConversion: string;
    };
  }>(google, accessToken, `
    SELECT
      ad_group.id,
      ad_group.name,
      ad_group.status,
      campaign.id,
      campaign.name,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.ctr,
      metrics.average_cpc,
      metrics.conversions,
      metrics.cost_per_conversion
    FROM ad_group
    WHERE segments.date BETWEEN '${dateFrom}' AND '${dateTo}'
      AND campaign.status != 'REMOVED'
      AND ad_group.status != 'REMOVED'
  `);

  // Aggregate by ad_group_id (sum across date range)
  const byAdGroup = new Map<string, GoogleAdMetrics>();
  for (const r of results) {
    const id = r.adGroup.id;
    const spend = parseInt(r.metrics.costMicros ?? "0") / 1_000_000;
    const impressions = parseInt(r.metrics.impressions ?? "0");
    const clicks = parseInt(r.metrics.clicks ?? "0");
    const conversions = parseFloat(r.metrics.conversions ?? "0");

    const existing = byAdGroup.get(id);
    if (existing) {
      existing.spend += spend;
      existing.impressions += impressions;
      existing.clicks += clicks;
      existing.conversions += conversions;
    } else {
      byAdGroup.set(id, {
        ad_group_id: id,
        ad_group_name: r.adGroup.name,
        campaign_id: r.campaign.id,
        campaign_name: r.campaign.name,
        status: r.adGroup.status,
        spend,
        impressions,
        clicks,
        ctr: clicks > 0 && impressions > 0 ? (clicks / impressions) * 100 : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
        conversions,
        cost_per_conversion: conversions > 0 ? spend / conversions : 0,
      });
    }
  }

  // Recalculate derived metrics after aggregation
  return Array.from(byAdGroup.values()).map(ag => ({
    ...ag,
    ctr: ag.impressions > 0 ? (ag.clicks / ag.impressions) * 100 : 0,
    cpc: ag.clicks > 0 ? ag.spend / ag.clicks : 0,
    cost_per_conversion: ag.conversions > 0 ? ag.spend / ag.conversions : 0,
  }));
}
