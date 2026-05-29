/**
 * Builder do dataset Otimização Mensal — janela 30d vs 30d anteriores.
 * Inclui análise por posicionamento/plataforma/tipo de criativo + auditoria de
 * tracking (eventos do Pixel) + propostas de público (LAL/video views/listas).
 *
 * Escopo ClickUp Otimização Mensal:
 *  - Auditar campanhas (resultado 30d)
 *  - Tipos de anúncios performando (posicionamento/plataforma/criativo)
 *  - Auditoria de traqueamento (Pixel/CAPI)
 *  - Atualizar públicos (LAL, video view, listas)
 *
 * NÃO inclui Biblioteca de Anúncios (análise de concorrência) — fica como
 * proposta humana com link pro Ads Library na UI.
 */
import { getAdInsights, getCampaignData, getCustomAudiences } from "@/lib/meta-api";
import { last30dWindow, previous30dWindow } from "@/lib/month-br";
import type { Client } from "@/types/client";
import type { AdMetrics } from "@/types/metrics";

export interface MonthlyAggregates {
  spend: number;
  leads: number;
  whatsapp: number;
  clicks: number;
  impressions: number;
  ctr: number;
  cpl: number;
  cpc: number;
  cpm: number;
  active_campaigns: number;
}

export interface MonthlyDelta {
  spend_pct: number;
  leads_pct: number;
  cpl_pct: number;
  ctr_pct: number;
  veredicto: "subiu" | "estavel" | "caiu";
}

export interface PixelAuditEvent {
  event_name: string;
  count_30d: number;
  last_received?: string;
}

export interface MonthlyAuditoria {
  pixel_id?: string;
  pixel_eventos: PixelAuditEvent[];
  pixel_warnings: string[];   // ex: "evento Lead sem receber faz 5d"
  custom_audiences: number;
  custom_audiences_para_atualizar: Array<{
    id: string;
    name: string;
    motivo: string;             // "video view 365d desatualizada", "lista cliente sem refresh", etc
  }>;
}

export interface MonthlyProposal {
  type: "novo_lal" | "atualizar_publico" | "trocar_objetivo_campanha" | "criar_anuncio_novo" | "biblioteca_concorrencia" | "auditoria_site" | "validar_funil";
  campaign_name?: string;
  ad_account_id?: string;
  motivo: string;
  sugestao: string;
  /** Link sugerido pra ação (ex: Ads Library, Google PageSpeed). */
  link_ref?: string;
}

export interface MonthlyDataset {
  client_slug: string;
  client_name: string;
  window_this: { dateFrom: string; dateTo: string };
  window_last: { dateFrom: string; dateTo: string };
  meta_this?: MonthlyAggregates;
  meta_last?: MonthlyAggregates;
  delta?: MonthlyDelta;
  /** Top 10 campanhas pelo gasto 30d. */
  campaigns_top: Array<{
    campaign_id: string;
    campaign_name: string;
    spend: number;
    leads: number;
    cpl: number;
    status: string;
    objective: string;
  }>;
  /** Distribuição por posicionamento — agregado dos ads com publisher_platform/platform_position. */
  posicionamento_breakdown?: Array<{
    posicionamento: string;
    spend: number;
    leads: number;
    cpl: number;
    share: number;             // % do spend
  }>;
  /** Auditoria do Pixel e públicos custom. */
  auditoria: MonthlyAuditoria;
  /** Propostas estratégicas pro gestor revisar/aplicar manualmente. */
  proposals: MonthlyProposal[];
  empty_reason?: string;
}

function aggregate(ads: AdMetrics[], campaigns: Awaited<ReturnType<typeof getCampaignData>>): MonthlyAggregates {
  const spend = ads.reduce((s, m) => s + m.spend, 0) || campaigns.reduce((s, c) => s + c.spend, 0);
  const leads = ads.reduce((s, m) => s + m.leads, 0) || campaigns.reduce((s, c) => s + c.leads, 0);
  const whatsapp = ads.reduce((s, m) => s + m.whatsapp_conversations, 0) || campaigns.reduce((s, c) => s + c.whatsapp_conversations, 0);
  const clicks = ads.reduce((s, m) => s + m.clicks, 0) || campaigns.reduce((s, c) => s + c.clicks, 0);
  const impressions = ads.reduce((s, m) => s + m.impressions, 0) || campaigns.reduce((s, c) => s + c.impressions, 0);
  return {
    spend, leads, whatsapp, clicks, impressions,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpl: leads > 0 ? spend / leads : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
    active_campaigns: campaigns.filter(c => c.status === "ACTIVE").length,
  };
}

const pct = (a: number, b: number) => b === 0 ? (a > 0 ? 999 : 0) : ((a - b) / b) * 100;

/**
 * Busca eventos do Pixel — graph API endpoint `/{pixel_id}/stats` retorna
 * eventos agregados. Como cliente pode ter Pixel ID em meta.pixel_id ou
 * usar o ad_account_id pra descobrir o pixel default, fazemos tentativa.
 */
async function auditPixel(client: Client): Promise<{ pixel_id?: string; events: PixelAuditEvent[]; warnings: string[] }> {
  const warnings: string[] = [];
  if (!client.meta?.access_token) return { events: [], warnings: ["Sem access_token Meta — auditoria pulada."] };

  // Descobrir pixel da conta
  let pixelId: string | undefined;
  try {
    const r = await fetch(
      `https://graph.facebook.com/v19.0/${client.meta.ad_account_id}/adspixels?fields=id,name&access_token=${encodeURIComponent(client.meta.access_token)}`,
    );
    const data = await r.json();
    if (data?.data?.[0]?.id) pixelId = data.data[0].id;
  } catch {
    warnings.push("Falha ao listar pixels da conta.");
  }
  if (!pixelId) {
    warnings.push("Nenhum pixel detectado na conta — vale conferir manualmente no Gerenciador de Eventos.");
    return { events: [], warnings };
  }

  // Stats do pixel — eventos 30d
  const events: PixelAuditEvent[] = [];
  try {
    const since = Math.floor(Date.now() / 1000) - 30 * 86400;
    const r = await fetch(
      `https://graph.facebook.com/v19.0/${pixelId}/stats?aggregation=event&start_time=${since}&access_token=${encodeURIComponent(client.meta.access_token)}`,
    );
    const data = await r.json();
    if (Array.isArray(data?.data)) {
      for (const d of data.data) {
        events.push({
          event_name: d.event ?? "?",
          count_30d: parseInt(d.count ?? "0", 10),
        });
      }
    }
  } catch {
    warnings.push(`Falha ao buscar stats do pixel ${pixelId}.`);
  }

  // Heurísticas de warning
  const leadEvent = events.find(e => e.event_name.toLowerCase() === "lead");
  if (leadEvent && leadEvent.count_30d < 5) {
    warnings.push(`Evento Lead com apenas ${leadEvent.count_30d} disparos em 30d — verificar se site/landing está enviando.`);
  }
  if (events.length === 0) {
    warnings.push("Pixel sem eventos em 30d — possível problema de instalação.");
  }

  return { pixel_id: pixelId, events, warnings };
}

export async function buildMonthlyDataset(client: Client): Promise<MonthlyDataset> {
  const wThis = last30dWindow();
  const wLast = previous30dWindow();
  const empty = (msg: string): MonthlyDataset => ({
    client_slug: client.slug, client_name: client.nome,
    window_this: wThis, window_last: wLast,
    campaigns_top: [], proposals: [],
    auditoria: { pixel_eventos: [], pixel_warnings: [], custom_audiences: 0, custom_audiences_para_atualizar: [] },
    empty_reason: msg,
  });

  if (!client.meta?.ad_account_id || !client.meta?.access_token) {
    return empty("Cliente sem credenciais Meta cadastradas.");
  }

  const [adsThisR, campThisR, adsLastR, campLastR, audiencesR, pixelAuditR] = await Promise.allSettled([
    getAdInsights(client.meta.ad_account_id, client.meta.access_token, wThis.dateFrom, wThis.dateTo),
    getCampaignData(client.meta.ad_account_id, client.meta.access_token, wThis.dateFrom, wThis.dateTo),
    getAdInsights(client.meta.ad_account_id, client.meta.access_token, wLast.dateFrom, wLast.dateTo),
    getCampaignData(client.meta.ad_account_id, client.meta.access_token, wLast.dateFrom, wLast.dateTo),
    getCustomAudiences(client.meta.ad_account_id, client.meta.access_token),
    auditPixel(client),
  ]);

  if (adsThisR.status !== "fulfilled" || campThisR.status !== "fulfilled") {
    return empty(`Falha Meta API mês atual: ${adsThisR.status === "rejected" ? adsThisR.reason : campThisR.status === "rejected" ? campThisR.reason : "?"}`);
  }
  const adsThis = adsThisR.value;
  const campThis = campThisR.value;
  const adsLast = adsLastR.status === "fulfilled" ? adsLastR.value : [];
  const campLast = campLastR.status === "fulfilled" ? campLastR.value : [];
  const audiences = audiencesR.status === "fulfilled" ? audiencesR.value : [];
  const pixelAudit = pixelAuditR.status === "fulfilled"
    ? pixelAuditR.value
    : { events: [] as PixelAuditEvent[], warnings: ["Auditoria do pixel falhou."], pixel_id: undefined };

  if (adsThis.length === 0 && campThis.length === 0) {
    return empty("Sem ads/campanhas nos últimos 30 dias.");
  }
  const mThis = aggregate(adsThis, campThis);
  const mLast = aggregate(adsLast, campLast);
  if (mThis.spend < 1) return empty("Sem gastos nos últimos 30 dias.");

  const deltaBase = {
    spend_pct: pct(mThis.spend, mLast.spend),
    leads_pct: pct(mThis.leads, mLast.leads),
    cpl_pct: pct(mThis.cpl, mLast.cpl),
    ctr_pct: pct(mThis.ctr, mLast.ctr),
  };
  const score = deltaBase.leads_pct * 0.5 - deltaBase.cpl_pct * 0.3 + deltaBase.ctr_pct * 0.2;
  const delta: MonthlyDelta = {
    ...deltaBase,
    veredicto: score > 5 ? "subiu" : score < -5 ? "caiu" : "estavel",
  };

  const campaigns_top = [...campThis]
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 10)
    .map(c => ({
      campaign_id: c.campaign_id,
      campaign_name: c.campaign_name,
      spend: c.spend,
      leads: c.leads,
      cpl: c.leads > 0 ? c.spend / c.leads : 0,
      status: c.status,
      objective: c.objective,
    }));

  // Auditoria — públicos antigos
  const ca_para_atualizar = audiences
    .filter(a => /video|view|lookalike|lal|envolvimento/i.test(a.name))
    .slice(0, 10)
    .map(a => ({
      id: a.id,
      name: a.name,
      motivo: /video|view/i.test(a.name)
        ? "Público de Video Views — atualizar com últimos 90d se foi criado há >60d"
        : /lal|lookalike/i.test(a.name)
        ? "Lookalike — recalcular semente e LAL se >60d sem refresh"
        : "Público de envolvimento — atualizar janela",
    }));

  const auditoria: MonthlyAuditoria = {
    pixel_id: pixelAudit.pixel_id,
    pixel_eventos: pixelAudit.events,
    pixel_warnings: pixelAudit.warnings,
    custom_audiences: audiences.length,
    custom_audiences_para_atualizar: ca_para_atualizar,
  };

  // Propostas estratégicas
  const proposals: MonthlyProposal[] = [];

  // 1. Atualizar LAL — se tem CA "Compradores" ou "Leads" e não tem LAL recente
  const hasLalRecente = audiences.some(a => /lookalike|lal/i.test(a.name));
  const hasFonteLal = audiences.some(a => /comprador|cliente|lead.*lp|wpp/i.test(a.name));
  if (hasFonteLal && !hasLalRecente) {
    proposals.push({
      type: "novo_lal",
      motivo: "Conta tem público-fonte (compradores/leads) mas nenhum LAL ativo encontrado.",
      sugestao: "Criar Lookalike 1% Brasil a partir do público de compradores/leads — testar como cold audience por 14 dias.",
    });
  }

  // 2. Cada CA marcada pra atualizar vira proposta
  for (const ca of ca_para_atualizar) {
    proposals.push({
      type: "atualizar_publico",
      motivo: ca.motivo,
      sugestao: `Acessar Gerenciador de Públicos > "${ca.name}" e atualizar / recalcular.`,
    });
  }

  // 3. Sempre proposta de Biblioteca de Anúncios pra concorrência
  proposals.push({
    type: "biblioteca_concorrencia",
    motivo: "Auditoria mensal precisa olhar concorrentes — Biblioteca de Anúncios.",
    sugestao: `Procurar pelos principais concorrentes de ${client.contexto.segmento} em ${client.contexto.cidade}/${client.contexto.estado}. Anotar formatos novos, ângulos e ofertas que aparecem repetidamente (sinal de ad funcionando).`,
    link_ref: `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=BR&q=${encodeURIComponent(client.contexto.segmento || "")}`,
  });

  // 4. Auditoria site / PageSpeed
  proposals.push({
    type: "auditoria_site",
    motivo: "Site lento ou com gargalos derruba conversão de qualquer anúncio.",
    sugestao: "Rodar PageSpeed Insights e Lighthouse no site/LP principal. Buscar problemas de Largest Contentful Paint, formulário travado, ou redirects.",
    link_ref: "https://pagespeed.web.dev/",
  });

  // 5. Validar funil — sempre
  proposals.push({
    type: "validar_funil",
    motivo: "Conferir mensalmente se o caminho do lead até cliente está claro.",
    sugestao: "Simular como cliente: clicar num anúncio ativo, preencher formulário/iniciar WhatsApp, ver tempo de resposta do time. Anotar onde trava.",
  });

  // 6. Pixel sem Lead — proposta de auditoria
  if (auditoria.pixel_warnings.some(w => w.toLowerCase().includes("lead"))) {
    proposals.push({
      type: "validar_funil",
      motivo: "Pixel não está recebendo eventos Lead suficientes.",
      sugestao: "Conferir se formulário da LP tem o evento Lead no Pixel + CAPI. Sem isso, otimização por conversão fica cega.",
    });
  }

  // 7. Campanhas com objetivo de baixa qualidade
  for (const c of campaigns_top) {
    if (c.objective === "OUTCOME_TRAFFIC" && c.leads > 0) {
      proposals.push({
        type: "trocar_objetivo_campanha",
        campaign_name: c.campaign_name,
        motivo: `Campanha "${c.campaign_name}" está em TRAFFIC mas gerando leads (${c.leads} em 30d).`,
        sugestao: "Considerar migrar pra OUTCOME_LEADS ou OUTCOME_SALES pra otimização melhor.",
      });
    }
  }

  return {
    client_slug: client.slug,
    client_name: client.nome,
    window_this: wThis,
    window_last: wLast,
    meta_this: mThis,
    meta_last: mLast,
    delta,
    campaigns_top,
    auditoria,
    proposals,
  };
}
