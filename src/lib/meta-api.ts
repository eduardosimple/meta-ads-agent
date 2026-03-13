import type { Campaign, CampaignStatus } from "@/types/campaign";
import type { DailyMetric } from "@/types/metrics";

const META_API_VERSION = "v19.0";
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

async function metaFetch<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${META_API_BASE}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });

  const data = await res.json();

  if (!res.ok || data.error) {
    const errMsg = data.error?.message ?? `Meta API error: ${res.status}`;
    throw new Error(errMsg);
  }

  return data as T;
}

export async function validateToken(accessToken: string): Promise<boolean> {
  try {
    await metaFetch<{ id: string }>(
      `/me?access_token=${encodeURIComponent(accessToken)}&fields=id`
    );
    return true;
  } catch {
    return false;
  }
}

export async function getCampaigns(
  adAccountId: string,
  accessToken: string
): Promise<Campaign[]> {
  const fields = "id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time,updated_time";
  const data = await metaFetch<{ data: Campaign[] }>(
    `/${adAccountId}/campaigns?fields=${fields}&access_token=${encodeURIComponent(accessToken)}&limit=200`
  );
  return data.data ?? [];
}

export async function getCampaignInsights(
  adAccountId: string,
  accessToken: string,
  dateFrom: string,
  dateTo: string
): Promise<DailyMetric[]> {
  const fields = "impressions,clicks,spend,reach,ctr,cpc,actions,date_start,date_stop";
  const data = await metaFetch<{
    data: Array<{
      impressions?: string;
      clicks?: string;
      spend?: string;
      reach?: string;
      ctr?: string;
      cpc?: string;
      actions?: Array<{ action_type: string; value: string }>;
      date_start: string;
      date_stop: string;
    }>;
  }>(
    `/${adAccountId}/insights?fields=${fields}&time_range={"since":"${dateFrom}","until":"${dateTo}"}&time_increment=1&level=account&access_token=${encodeURIComponent(accessToken)}&limit=90`
  );

  return (data.data ?? []).map((item) => {
    const leads =
      item.actions?.find((a) => a.action_type === "lead")?.value ?? "0";
    return {
      date: item.date_start,
      spend: parseFloat(item.spend ?? "0"),
      impressions: parseInt(item.impressions ?? "0", 10),
      clicks: parseInt(item.clicks ?? "0", 10),
      reach: parseInt(item.reach ?? "0", 10),
      ctr: parseFloat(item.ctr ?? "0"),
      cpc: parseFloat(item.cpc ?? "0"),
      leads: parseInt(leads, 10),
    };
  });
}

export async function updateCampaignStatus(
  campaignId: string,
  status: CampaignStatus,
  accessToken: string
): Promise<boolean> {
  await metaFetch<{ success: boolean }>(`/${campaignId}`, {
    method: "POST",
    body: JSON.stringify({
      status,
      access_token: accessToken,
    }),
  });
  return true;
}
