/**
 * Builder do dataset Check-in Semanal — busca Meta (e Google se cliente tem)
 * em DUAS janelas: semana fechada mais recente (D-7→D-1) e semana anterior
 * (D-14→D-8). Devolve o comparativo absoluto + delta percentual.
 *
 * Não chama Claude. O texto pra cliente é produzido na skill local
 * `checkin-cliente-semanal` (plano em vez de API).
 */
import { getCampaignData } from "@/lib/meta-api";
import { lastWeekWindow, previousWeekWindow } from "@/lib/week-br";
import type { Client } from "@/types/client";

export interface WeeklyMetrics {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  leads: number;
  whatsapp: number;
  cpl: number;
  cpc: number;
  cpm: number;
  active_campaigns: number;
}

export interface CheckinDelta {
  spend_pct: number;        // (this - last) / last * 100
  leads_pct: number;
  whatsapp_pct: number;
  ctr_pct: number;
  cpl_pct: number;
  /** "subiu" | "estavel" | "caiu" baseado em soma ponderada (leads dominante). */
  veredicto: "subiu" | "estavel" | "caiu";
}

export interface CheckinDataset {
  client_slug: string;
  client_name: string;
  window_this: { dateFrom: string; dateTo: string };
  window_last: { dateFrom: string; dateTo: string };
  meta_this?: WeeklyMetrics;
  meta_last?: WeeklyMetrics;
  delta?: CheckinDelta;
  campaigns_resumo?: Array<{
    campaign_name: string;
    spend: number;
    leads: number;
    cpl: number;
    status: string;
  }>;
  empty_reason?: string;
}

function aggregate(campaigns: Awaited<ReturnType<typeof getCampaignData>>): WeeklyMetrics {
  const spend = campaigns.reduce((s, c) => s + c.spend, 0);
  const impressions = campaigns.reduce((s, c) => s + c.impressions, 0);
  const clicks = campaigns.reduce((s, c) => s + c.clicks, 0);
  const leads = campaigns.reduce((s, c) => s + c.leads, 0);
  const whatsapp = campaigns.reduce((s, c) => s + c.whatsapp_conversations, 0);
  const active = campaigns.filter(c => c.status === "ACTIVE").length;
  return {
    spend,
    impressions,
    clicks,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    leads,
    whatsapp,
    cpl: leads > 0 ? spend / leads : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
    active_campaigns: active,
  };
}

function pct(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 999 : 0;
  return ((curr - prev) / prev) * 100;
}

function vereditoFrom(d: CheckinDelta): "subiu" | "estavel" | "caiu" {
  // Leads é o sinal dominante; CTR/CPL ajudam a desempatar
  const score = d.leads_pct * 0.5 + (d.whatsapp_pct || 0) * 0.3 - d.cpl_pct * 0.2;
  if (score > 5) return "subiu";
  if (score < -5) return "caiu";
  return "estavel";
}

export async function buildCheckinDataset(client: Client): Promise<CheckinDataset> {
  const wThis = lastWeekWindow();
  const wLast = previousWeekWindow();

  if (!client.meta?.ad_account_id || !client.meta?.access_token) {
    return {
      client_slug: client.slug,
      client_name: client.nome,
      window_this: wThis,
      window_last: wLast,
      empty_reason: "Cliente sem credenciais Meta cadastradas.",
    };
  }

  const [thisRes, lastRes] = await Promise.allSettled([
    getCampaignData(client.meta.ad_account_id, client.meta.access_token, wThis.dateFrom, wThis.dateTo),
    getCampaignData(client.meta.ad_account_id, client.meta.access_token, wLast.dateFrom, wLast.dateTo),
  ]);
  if (thisRes.status !== "fulfilled" || lastRes.status !== "fulfilled") {
    return {
      client_slug: client.slug,
      client_name: client.nome,
      window_this: wThis,
      window_last: wLast,
      empty_reason: `Falha Meta API: ${thisRes.status === "rejected" ? thisRes.reason : lastRes.status === "rejected" ? lastRes.reason : "?"}`,
    };
  }
  const thisCampaigns = thisRes.value;
  const lastCampaigns = lastRes.value;
  const metaThis = aggregate(thisCampaigns);
  const metaLast = aggregate(lastCampaigns);

  if (metaThis.spend < 1 && metaLast.spend < 1) {
    return {
      client_slug: client.slug,
      client_name: client.nome,
      window_this: wThis,
      window_last: wLast,
      empty_reason: "Sem gastos nas duas semanas — não há o que comparar.",
    };
  }

  const deltaBase = {
    spend_pct: pct(metaThis.spend, metaLast.spend),
    leads_pct: pct(metaThis.leads, metaLast.leads),
    whatsapp_pct: pct(metaThis.whatsapp, metaLast.whatsapp),
    ctr_pct: pct(metaThis.ctr, metaLast.ctr),
    cpl_pct: pct(metaThis.cpl, metaLast.cpl),
    veredicto: "estavel" as const,
  };
  const delta: CheckinDelta = { ...deltaBase, veredicto: vereditoFrom(deltaBase) };

  const campaigns_resumo = [...thisCampaigns]
    .filter(c => c.spend > 0)
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 8)
    .map(c => ({
      campaign_name: c.campaign_name,
      spend: c.spend,
      leads: c.leads,
      cpl: c.leads > 0 ? c.spend / c.leads : 0,
      status: c.status,
    }));

  return {
    client_slug: client.slug,
    client_name: client.nome,
    window_this: wThis,
    window_last: wLast,
    meta_this: metaThis,
    meta_last: metaLast,
    delta,
    campaigns_resumo,
  };
}
