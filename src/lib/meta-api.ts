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

export interface CampaignData {
  campaign_id: string;
  campaign_name: string;
  objective: string;
  status: string;
  daily_budget?: number;
  lifetime_budget?: number;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  leads: number;
  whatsapp_conversations: number;
}

export interface AdsetData {
  adset_id: string;
  adset_name: string;
  campaign_id: string;
  campaign_name: string;
  status: string;
  daily_budget?: number;
  optimization_goal: string;
  bid_strategy?: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  leads: number;
  whatsapp_conversations: number;
  targeting_summary: string;
}

function formatTargeting(t: Record<string, unknown> | undefined): string {
  if (!t) return "Segmentação ampla";
  const parts: string[] = [];
  const ageMin = t.age_min as number | undefined;
  const ageMax = t.age_max as number | undefined;
  if (ageMin || ageMax) parts.push(`Idade: ${ageMin ?? 18}-${ageMax ?? "65+"}`);
  const genders = t.genders as number[] | undefined;
  if (genders?.length === 1) parts.push(`Gênero: ${genders[0] === 1 ? "Masculino" : "Feminino"}`);
  else parts.push("Gênero: Todos");
  const geo = t.geo_locations as Record<string, unknown[]> | undefined;
  const cities = (geo?.cities as Array<{name: string}> ?? []).map(c => c.name).join(", ");
  const regions = (geo?.regions as Array<{name: string}> ?? []).map(r => r.name).join(", ");
  const geoStr = cities || regions;
  if (geoStr) parts.push(`Localização: ${geoStr}`);
  const interests = (t.interests as Array<{name: string}> ?? []).slice(0, 5).map(i => i.name);
  if (interests.length) parts.push(`Interesses: ${interests.join(", ")}`);
  const behaviors = (t.behaviors as Array<{name: string}> ?? []).slice(0, 3).map(b => b.name);
  if (behaviors.length) parts.push(`Comportamentos: ${behaviors.join(", ")}`);
  const audiences = (t.custom_audiences as Array<{name: string}> ?? []).slice(0, 3).map(a => a.name);
  if (audiences.length) parts.push(`Públicos customizados: ${audiences.join(", ")}`);
  const excluded = (t.excluded_custom_audiences as Array<{name: string}> ?? []).slice(0, 2).map(a => a.name);
  if (excluded.length) parts.push(`Excluídos: ${excluded.join(", ")}`);
  return parts.join(" | ") || "Segmentação ampla";
}

export async function getCampaignData(
  adAccountId: string,
  accessToken: string,
  dateFrom: string,
  dateTo: string
): Promise<CampaignData[]> {
  const [campaignsRes, insightsRes] = await Promise.allSettled([
    metaFetch<{ data: Array<{ id: string; name: string; status: string; objective: string; daily_budget?: string; lifetime_budget?: string }> }>(
      `/${adAccountId}/campaigns?fields=id,name,status,objective,daily_budget,lifetime_budget&access_token=${encodeURIComponent(accessToken)}&limit=200`
    ),
    metaFetch<{ data: Array<{ campaign_id: string; campaign_name: string; impressions?: string; clicks?: string; spend?: string; ctr?: string; actions?: Array<{ action_type: string; value: string }> }> }>(
      `/${adAccountId}/insights?fields=campaign_id,campaign_name,impressions,clicks,spend,ctr,actions&time_range={"since":"${dateFrom}","until":"${dateTo}"}&level=campaign&access_token=${encodeURIComponent(accessToken)}&limit=200`
    ),
  ]);
  const campaigns = campaignsRes.status === "fulfilled" ? campaignsRes.value.data : [];
  const insights = insightsRes.status === "fulfilled" ? insightsRes.value.data : [];
  const insightMap = new Map(insights.map(i => [i.campaign_id, i]));
  return campaigns.map(c => {
    const ins = insightMap.get(c.id);
    const leads = parseInt(ins?.actions?.find(a => a.action_type === "lead")?.value ?? "0", 10);
    const whatsapp = parseInt(ins?.actions?.find(a =>
      a.action_type === "onsite_conversion.messaging_conversation_started_7d" ||
      a.action_type === "onsite_conversion.total_messaging_connection"
    )?.value ?? "0", 10);
    return {
      campaign_id: c.id,
      campaign_name: c.name,
      objective: c.objective,
      status: c.status,
      daily_budget: c.daily_budget ? parseInt(c.daily_budget, 10) / 100 : undefined,
      lifetime_budget: c.lifetime_budget ? parseInt(c.lifetime_budget, 10) / 100 : undefined,
      spend: parseFloat(ins?.spend ?? "0"),
      impressions: parseInt(ins?.impressions ?? "0", 10),
      clicks: parseInt(ins?.clicks ?? "0", 10),
      ctr: parseFloat(ins?.ctr ?? "0"),
      leads,
      whatsapp_conversations: whatsapp,
    };
  });
}

export async function getAdsetData(
  adAccountId: string,
  accessToken: string,
  dateFrom: string,
  dateTo: string
): Promise<AdsetData[]> {
  const [adsetsRes, insightsRes] = await Promise.allSettled([
    metaFetch<{ data: Array<{ id: string; name: string; status: string; campaign_id: string; daily_budget?: string; optimization_goal: string; bid_strategy?: string; targeting?: Record<string, unknown> }> }>(
      `/${adAccountId}/adsets?fields=id,name,status,campaign_id,daily_budget,optimization_goal,bid_strategy,targeting&access_token=${encodeURIComponent(accessToken)}&limit=200`
    ),
    metaFetch<{ data: Array<{ adset_id: string; adset_name: string; campaign_id: string; campaign_name: string; impressions?: string; clicks?: string; spend?: string; ctr?: string; actions?: Array<{ action_type: string; value: string }> }> }>(
      `/${adAccountId}/insights?fields=adset_id,adset_name,campaign_id,campaign_name,impressions,clicks,spend,ctr,actions&time_range={"since":"${dateFrom}","until":"${dateTo}"}&level=adset&access_token=${encodeURIComponent(accessToken)}&limit=200`
    ),
  ]);
  const adsets = adsetsRes.status === "fulfilled" ? adsetsRes.value.data : [];
  const insights = insightsRes.status === "fulfilled" ? insightsRes.value.data : [];
  const insightMap = new Map(insights.map(i => [i.adset_id, i]));
  return adsets.map(a => {
    const ins = insightMap.get(a.id);
    const leads = parseInt(ins?.actions?.find(ac => ac.action_type === "lead")?.value ?? "0", 10);
    const whatsapp = parseInt(ins?.actions?.find(ac =>
      ac.action_type === "onsite_conversion.messaging_conversation_started_7d" ||
      ac.action_type === "onsite_conversion.total_messaging_connection"
    )?.value ?? "0", 10);
    return {
      adset_id: a.id,
      adset_name: a.name,
      campaign_id: a.campaign_id,
      campaign_name: ins?.campaign_name ?? "",
      status: a.status,
      daily_budget: a.daily_budget ? parseInt(a.daily_budget, 10) / 100 : undefined,
      optimization_goal: a.optimization_goal,
      bid_strategy: a.bid_strategy,
      spend: parseFloat(ins?.spend ?? "0"),
      impressions: parseInt(ins?.impressions ?? "0", 10),
      clicks: parseInt(ins?.clicks ?? "0", 10),
      ctr: parseFloat(ins?.ctr ?? "0"),
      leads,
      whatsapp_conversations: whatsapp,
      targeting_summary: formatTargeting(a.targeting),
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
