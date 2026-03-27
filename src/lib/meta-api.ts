import type { Campaign, CampaignStatus } from "@/types/campaign";
import type { DailyMetric, AdMetrics } from "@/types/metrics";

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

export async function getAdInsights(
  adAccountId: string,
  accessToken: string,
  dateFrom: string,
  dateTo: string
): Promise<AdMetrics[]> {
  const fields = "ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,impressions,clicks,spend,reach,ctr,cpc,cpm,frequency,actions";
  const data = await metaFetch<{
    data: Array<{
      ad_id: string;
      ad_name: string;
      adset_id: string;
      adset_name: string;
      campaign_id: string;
      campaign_name: string;
      impressions?: string;
      clicks?: string;
      spend?: string;
      reach?: string;
      ctr?: string;
      cpc?: string;
      cpm?: string;
      frequency?: string;
      actions?: Array<{ action_type: string; value: string }>;
    }>;
  }>(
    `/${adAccountId}/insights?fields=${fields}&time_range={"since":"${dateFrom}","until":"${dateTo}"}&level=ad&access_token=${encodeURIComponent(accessToken)}&limit=200`
  );

  // Also fetch ad statuses
  const adsData = await metaFetch<{
    data: Array<{ id: string; name: string; status: string; created_time: string; adset_id: string }>;
  }>(
    `/${adAccountId}/ads?fields=id,name,status,created_time,adset_id&access_token=${encodeURIComponent(accessToken)}&limit=200`
  );

  const adStatusMap = new Map(adsData.data.map(a => [a.id, { status: a.status, created_time: a.created_time }]));

  return (data.data ?? []).map((item) => {
    const leads = item.actions?.find((a) => a.action_type === "lead")?.value ?? "0";
    const whatsappConvs = item.actions?.find((a) =>
      a.action_type === "onsite_conversion.messaging_conversation_started_7d" ||
      a.action_type === "onsite_conversion.total_messaging_connection"
    )?.value ?? "0";
    const postEngagements = item.actions?.find((a) => a.action_type === "post_engagement")?.value ?? "0";
    const spend = parseFloat(item.spend ?? "0");
    const leadsNum = parseInt(leads, 10);
    const whatsappNum = parseInt(whatsappConvs, 10);
    const engagementNum = parseInt(postEngagements, 10);
    const adInfo = adStatusMap.get(item.ad_id);
    const daysRunning = adInfo?.created_time
      ? Math.floor((Date.now() - new Date(adInfo.created_time).getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    return {
      ad_id: item.ad_id,
      ad_name: item.ad_name,
      adset_id: item.adset_id,
      adset_name: item.adset_name,
      campaign_id: item.campaign_id,
      campaign_name: item.campaign_name,
      status: adInfo?.status ?? "UNKNOWN",
      spend,
      impressions: parseInt(item.impressions ?? "0", 10),
      clicks: parseInt(item.clicks ?? "0", 10),
      ctr: parseFloat(item.ctr ?? "0"),
      cpc: parseFloat(item.cpc ?? "0"),
      cpm: parseFloat(item.cpm ?? "0"),
      reach: parseInt(item.reach ?? "0", 10),
      frequency: parseFloat(item.frequency ?? "0"),
      leads: leadsNum,
      whatsapp_conversations: whatsappNum,
      post_engagements: engagementNum,
      cpl: leadsNum > 0 ? spend / leadsNum : 0,
      days_running: daysRunning,
    };
  });
}

export async function updateAdsetBudget(
  adsetId: string,
  dailyBudgetCents: number,
  accessToken: string
): Promise<boolean> {
  await metaFetch<{ success: boolean }>(`/${adsetId}`, {
    method: "POST",
    body: JSON.stringify({
      daily_budget: String(dailyBudgetCents),
      access_token: accessToken,
    }),
  });
  return true;
}

export async function pauseEntity(
  entityId: string,
  accessToken: string
): Promise<boolean> {
  await metaFetch<{ success: boolean }>(`/${entityId}`, {
    method: "POST",
    body: JSON.stringify({
      status: "PAUSED",
      access_token: accessToken,
    }),
  });
  return true;
}
