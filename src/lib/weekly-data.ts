/**
 * Builder do dataset Otimização Semanal — busca janela 7d, computa baselines,
 * classifica candidatos a AUTO-APLICAR (regras seguras) e candidatos a
 * PROPOSTA (mudanças estratégicas que precisam de aprovação humana).
 *
 * Auto-apply rules (decididas em 2026-05-25):
 *  - pause_ad: CPA ≥ 3× benchmark + spend ≥ R$50 + 4+ dias
 *  - scale_budget: realocar +20% pra adset com CPA ≤ 50% benchmark
 *
 * Propostas estratégicas (sempre humano):
 *  - novo público pra GA saturado (freq > 3,5)
 *  - novo GA pra campanha com <2 GAs
 *  - troca de objetivo se conta toda performa mal
 *  - solicitar criativos novos se GA com <2 ads
 */
import { getAdInsights, getCampaignData, getAdsetData } from "@/lib/meta-api";
import { lastWeekWindow } from "@/lib/week-br";
import type { Client } from "@/types/client";
import type { AdMetrics } from "@/types/metrics";

/** Benchmarks defaults — podem virar campo do cliente no futuro. */
const BENCH = {
  cpl_max: 80,           // R$ — acima disso é "ruim"
  cpl_excelente: 30,     // R$ — abaixo disso é "excelente"
  ctr_min: 0.8,          // %  — abaixo disso é "ruim"
  frequencia_max: 3.5,   // freq — acima disso é "saturado"
};

export interface WeeklyAutoAction {
  type: "pause_ad" | "scale_budget";
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_name?: string;
  current_daily_budget_cents?: number;
  new_daily_budget_cents?: number;
  metric_cpl?: number;
  metric_spend_7d?: number;
  metric_days_running?: number;
  reason: string;
}

export interface WeeklyProposal {
  type: "novo_publico" | "novo_ga" | "trocar_objetivo" | "solicitar_criativos" | "pausar_publico_saturado";
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  targeting_summary_atual?: string;
  motivo: string;
  sugestao: string;
}

export interface WeeklyDataset {
  client_slug: string;
  client_name: string;
  window: { dateFrom: string; dateTo: string };
  /** Estado da conta nessa janela. */
  meta_aggregates: {
    spend: number;
    leads: number;
    whatsapp: number;
    ctr: number;
    cpl: number;
    impressions: number;
    active_campaigns: number;
    active_adsets: number;
    active_ads: number;
  };
  /** Top campanhas pra contexto humano. */
  campaigns_resumo: Array<{
    campaign_id: string;
    campaign_name: string;
    spend: number;
    leads: number;
    cpl: number;
    status: string;
  }>;
  /** Ações que cumprem regras seguras e podem ser auto-aplicadas. */
  auto_candidates: WeeklyAutoAction[];
  /** Análises estratégicas que precisam humano. */
  proposals: WeeklyProposal[];
  empty_reason?: string;
}

/**
 * Heurística simplificada de "dias rodando" — usa spend > 0 dividido por
 * spend médio diário. Não temos timestamp de start por ad disponível na
 * lib atual; tier rigoroso já exige 4 dias na própria regra.
 */
function estimateDaysRunning(spend7d: number): number {
  if (spend7d <= 0) return 0;
  // se spend = 100% em 7d → assume 7 dias. Se spend bem alto pode ter rodado <7.
  return Math.min(7, Math.max(1, Math.round(spend7d / Math.max(10, spend7d / 7))));
}

export async function buildWeeklyDataset(client: Client): Promise<WeeklyDataset> {
  const { dateFrom, dateTo } = lastWeekWindow();
  const empty = (msg: string): WeeklyDataset => ({
    client_slug: client.slug, client_name: client.nome,
    window: { dateFrom, dateTo },
    meta_aggregates: { spend: 0, leads: 0, whatsapp: 0, ctr: 0, cpl: 0, impressions: 0, active_campaigns: 0, active_adsets: 0, active_ads: 0 },
    campaigns_resumo: [], auto_candidates: [], proposals: [],
    empty_reason: msg,
  });

  if (!client.meta?.ad_account_id || !client.meta?.access_token) {
    return empty("Cliente sem credenciais Meta cadastradas.");
  }

  const [adsRes, campRes, adsetRes] = await Promise.allSettled([
    getAdInsights(client.meta.ad_account_id, client.meta.access_token, dateFrom, dateTo),
    getCampaignData(client.meta.ad_account_id, client.meta.access_token, dateFrom, dateTo),
    getAdsetData(client.meta.ad_account_id, client.meta.access_token, dateFrom, dateTo),
  ]);
  if (adsRes.status !== "fulfilled" || campRes.status !== "fulfilled" || adsetRes.status !== "fulfilled") {
    return empty(`Falha Meta API: ${adsRes.status === "rejected" ? adsRes.reason : campRes.status === "rejected" ? campRes.reason : adsetRes.status === "rejected" ? adsetRes.reason : "?"}`);
  }
  const ads: AdMetrics[] = adsRes.value;
  const campaigns = campRes.value;
  const adsets = adsetRes.value;
  if (ads.length === 0 && campaigns.length === 0) return empty("Sem ads/campanhas ativas nos últimos 7 dias.");
  const totalSpend = ads.reduce((s, m) => s + m.spend, 0) || campaigns.reduce((s, c) => s + c.spend, 0);
  if (totalSpend < 1) return empty("Sem gastos nos últimos 7 dias.");

  const totalLeads = ads.reduce((s, m) => s + m.leads, 0) || campaigns.reduce((s, c) => s + c.leads, 0);
  const totalWA = ads.reduce((s, m) => s + m.whatsapp_conversations, 0) || campaigns.reduce((s, c) => s + c.whatsapp_conversations, 0);
  const totalImp = ads.reduce((s, m) => s + m.impressions, 0) || campaigns.reduce((s, c) => s + c.impressions, 0);
  const totalClicks = ads.reduce((s, m) => s + m.clicks, 0) || campaigns.reduce((s, c) => s + c.clicks, 0);
  const avgCtr = totalImp > 0 ? (totalClicks / totalImp) * 100 : 0;
  const avgCpl = totalLeads > 0 ? totalSpend / totalLeads : 0;

  const auto_candidates: WeeklyAutoAction[] = [];

  // Regra auto-apply 1: pause_ad com CPA ≥ 3× benchmark + spend ≥ R$50 + 4+ dias
  const cpl_pause_threshold = BENCH.cpl_max * 3;
  for (const m of ads) {
    if (m.status !== "ACTIVE") continue;
    if (m.spend < 50) continue;
    const days = estimateDaysRunning(m.spend);
    if (days < 4) continue;
    const cpl = m.leads > 0 ? m.spend / m.leads : Infinity;
    if (cpl >= cpl_pause_threshold) {
      auto_candidates.push({
        type: "pause_ad",
        ad_id: m.ad_id,
        ad_name: m.ad_name,
        adset_id: m.adset_id,
        metric_cpl: cpl === Infinity ? 9999 : cpl,
        metric_spend_7d: m.spend,
        metric_days_running: days,
        reason: cpl === Infinity
          ? `0 leads em R$${m.spend.toFixed(0)} (${days}d) — pausa segura.`
          : `CPL R$${cpl.toFixed(0)} ≥ 3× benchmark (R$${cpl_pause_threshold}). spend R$${m.spend.toFixed(0)} em ${days}d.`,
      });
    }
  }

  // Regra auto-apply 2: scale_budget +20% no ADSET vencedor (CPL ≤ 50% benchmark)
  // Pega o adset com melhor CPL, dentro do orçamento mensal.
  const cpl_scale_threshold = BENCH.cpl_max * 0.5;
  const orcamentoMensal = (client.contexto.orcamento_mensal_cents ?? 0) / 100;
  const projecaoMensal = totalSpend * (30 / 7);
  const folga = orcamentoMensal > 0 ? orcamentoMensal - projecaoMensal : Infinity;

  if (folga > 100) { // pelo menos R$100 de folga pra escalar
    const adsetsAtivos = adsets
      .filter(a => a.status === "ACTIVE" && a.leads > 0 && a.daily_budget && a.daily_budget > 0)
      .map(a => ({ ...a, cpl: a.spend / a.leads }))
      .filter(a => a.cpl <= cpl_scale_threshold)
      .sort((a, b) => a.cpl - b.cpl);
    // Pega top 1 (mais vencedor)
    const winner = adsetsAtivos[0];
    if (winner && winner.daily_budget) {
      const newBudget = Math.round(winner.daily_budget * 1.2);
      const newMonthlyProjection = projecaoMensal + (newBudget - winner.daily_budget) * 30;
      if (orcamentoMensal === 0 || newMonthlyProjection <= orcamentoMensal) {
        auto_candidates.push({
          type: "scale_budget",
          adset_id: winner.adset_id,
          adset_name: winner.adset_name,
          campaign_name: winner.campaign_id, // simplificação, na UI buscar nome
          current_daily_budget_cents: Math.round(winner.daily_budget * 100),
          new_daily_budget_cents: newBudget * 100,
          metric_cpl: winner.cpl,
          metric_spend_7d: winner.spend,
          reason: `CPL R$${winner.cpl.toFixed(0)} ≤ 50% benchmark (R$${cpl_scale_threshold}). Escala R$${winner.daily_budget.toFixed(0)}→R$${newBudget}/d (+20%). ${orcamentoMensal > 0 ? `Folga orçamento mensal: R$${folga.toFixed(0)}.` : "Orçamento mensal não cadastrado — escala sem limite."}`,
        });
      }
    }
  }

  // Propostas estratégicas (humano aprova)
  const proposals: WeeklyProposal[] = [];

  // Adsets saturados → propor novo público (frequência média dos ads filhos)
  const freqByAdset = new Map<string, { sumSpend: number; sumFreqWeighted: number }>();
  for (const ad of ads) {
    if (ad.status !== "ACTIVE") continue;
    const cur = freqByAdset.get(ad.adset_id) ?? { sumSpend: 0, sumFreqWeighted: 0 };
    cur.sumSpend += ad.spend;
    cur.sumFreqWeighted += ad.frequency * ad.spend;
    freqByAdset.set(ad.adset_id, cur);
  }
  for (const a of adsets) {
    if (a.status !== "ACTIVE") continue;
    const f = freqByAdset.get(a.adset_id);
    if (!f || f.sumSpend < 30) continue;
    const avgFreq = f.sumFreqWeighted / f.sumSpend;
    if (avgFreq <= BENCH.frequencia_max) continue;
    proposals.push({
      type: "novo_publico",
      campaign_id: a.campaign_id,
      adset_id: a.adset_id,
      adset_name: a.adset_name,
      targeting_summary_atual: a.targeting_summary,
      motivo: `Frequência média ${avgFreq.toFixed(1)} > ${BENCH.frequencia_max} — público saturado, leads ficando caros.`,
      sugestao: `Criar novo adset paralelo com público diferente (LAL, interesse adjacente ou demográfico). Manter o atual ATIVO mas pausá-lo se CPL não melhorar em 5 dias.`,
    });
  }
  // Campanhas com <2 GAs ATIVOS → propor novo GA
  const adsetsPerCampaign = new Map<string, number>();
  for (const a of adsets) {
    if (a.status === "ACTIVE") {
      adsetsPerCampaign.set(a.campaign_id, (adsetsPerCampaign.get(a.campaign_id) ?? 0) + 1);
    }
  }
  for (const c of campaigns) {
    if (c.status !== "ACTIVE") continue;
    const n = adsetsPerCampaign.get(c.campaign_id) ?? 0;
    if (n < 2) {
      proposals.push({
        type: "novo_ga",
        campaign_id: c.campaign_id,
        campaign_name: c.campaign_name,
        motivo: `Campanha com apenas ${n} GA(s) ativo(s) — pouca margem pra otimização.`,
        sugestao: `Criar pelo menos 1 novo GA com público alternativo ao do GA existente.`,
      });
    }
  }
  // Ads com <2 ativos por GA → solicitar criativos
  const adsPerAdset = new Map<string, number>();
  for (const ad of ads) {
    if (ad.status === "ACTIVE") {
      adsPerAdset.set(ad.adset_id, (adsPerAdset.get(ad.adset_id) ?? 0) + 1);
    }
  }
  for (const a of adsets) {
    if (a.status !== "ACTIVE") continue;
    const n = adsPerAdset.get(a.adset_id) ?? 0;
    if (n < 2) {
      proposals.push({
        type: "solicitar_criativos",
        adset_id: a.adset_id,
        adset_name: a.adset_name,
        motivo: `GA com apenas ${n} criativo(s) ativo(s).`,
        sugestao: `Solicitar ao design 2-4 criativos novos pra testar e atingir 2-6 ativos por GA.`,
      });
    }
  }
  // Conta toda performando mal → propor troca de objetivo
  if (avgCpl > BENCH.cpl_max * 1.5 && totalLeads < 10) {
    proposals.push({
      type: "trocar_objetivo",
      motivo: `Conta como um todo: CPL médio R$${avgCpl.toFixed(0)} (>${BENCH.cpl_max * 1.5}) e apenas ${totalLeads} leads em 7d.`,
      sugestao: `Considerar trocar objetivo de campanha (LEADS → ENGAGEMENT como recall, ou TRAFFIC pra abastecer remarketing).`,
    });
  }

  const campaigns_resumo = [...campaigns]
    .filter(c => c.spend > 0)
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 10)
    .map(c => ({
      campaign_id: c.campaign_id,
      campaign_name: c.campaign_name,
      spend: c.spend,
      leads: c.leads,
      cpl: c.leads > 0 ? c.spend / c.leads : 0,
      status: c.status,
    }));

  return {
    client_slug: client.slug,
    client_name: client.nome,
    window: { dateFrom, dateTo },
    meta_aggregates: {
      spend: totalSpend, leads: totalLeads, whatsapp: totalWA, ctr: avgCtr, cpl: avgCpl,
      impressions: totalImp,
      active_campaigns: campaigns.filter(c => c.status === "ACTIVE").length,
      active_adsets: adsets.filter(a => a.status === "ACTIVE").length,
      active_ads: ads.filter(a => a.status === "ACTIVE").length,
    },
    campaigns_resumo,
    auto_candidates,
    proposals,
  };
}
