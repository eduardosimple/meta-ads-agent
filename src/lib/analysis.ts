import Anthropic from "@anthropic-ai/sdk";
import { getAdInsights, getCampaignData, getAdsetData } from "@/lib/meta-api";
import { getGoogleAdGroupInsights, normalizeCustomerId } from "@/lib/google-ads-api";
import type { Client } from "@/types/client";
import type { AdMetrics, GoogleAdMetrics, AnalysisResult, Proposal, Alert, ActionItem } from "@/types/metrics";
import { randomUUID } from "crypto";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function analyzeMetaAds(client: Client, dateFrom: string, dateTo: string): Promise<AnalysisResult> {
  const empty = (msg: string): AnalysisResult => ({
    client_slug: client.slug,
    analyzed_at: new Date().toISOString(),
    proposals: [],
    alerts: [{ id: randomUUID(), level: "info", title: "Sem dados suficientes", message: msg, entity_name: client.nome }],
    summary_text: msg,
    plano_de_acao: [],
  });

  // Fetch all three levels in parallel
  const [adMetricsRes, campaignDataRes, adsetDataRes] = await Promise.allSettled([
    getAdInsights(client.meta.ad_account_id, client.meta.access_token, dateFrom, dateTo),
    getCampaignData(client.meta.ad_account_id, client.meta.access_token, dateFrom, dateTo),
    getAdsetData(client.meta.ad_account_id, client.meta.access_token, dateFrom, dateTo),
  ]);

  const adMetrics: AdMetrics[] = adMetricsRes.status === "fulfilled" ? adMetricsRes.value : [];
  const campaignData = campaignDataRes.status === "fulfilled" ? campaignDataRes.value : [];
  const adsetData = adsetDataRes.status === "fulfilled" ? adsetDataRes.value : [];

  if (adMetrics.length === 0 && campaignData.length === 0) {
    return empty("Não há dados de anúncios ativos nos últimos 7 dias.");
  }

  // Limit to top N by spend to control token usage
  const topCampaigns = [...campaignData].sort((a, b) => b.spend - a.spend).slice(0, 15);
  const topAdsets = [...adsetData].sort((a, b) => b.spend - a.spend).slice(0, 20);
  const topAds = [...adMetrics].sort((a, b) => b.spend - a.spend).slice(0, 30);

  // === CAMPAIGN LEVEL ===
  const campaignText = topCampaigns.length > 0
    ? "=== CAMPANHAS ===\n" + topCampaigns.map(c => {
        const budget = c.daily_budget ? `R$ ${c.daily_budget.toFixed(2)}/dia` : c.lifetime_budget ? `R$ ${c.lifetime_budget.toFixed(2)} vitalício` : "sem orçamento definido";
        const results: string[] = [];
        if (c.leads > 0) results.push(`Leads: ${c.leads}`);
        if (c.whatsapp_conversations > 0) results.push(`Conv. WhatsApp: ${c.whatsapp_conversations}`);
        return `Campanha: "${c.campaign_name}" (ID: ${c.campaign_id})
- Objetivo: ${c.objective} | Status: ${c.status} | Orçamento: ${budget}
- Gasto 7d: R$ ${c.spend.toFixed(2)} | Impressões: ${c.impressions} | CTR: ${c.ctr.toFixed(2)}%
- Resultados: ${results.length > 0 ? results.join(" | ") : "nenhuma conversão registrada"}`;
      }).join("\n---\n")
    : "";

  // === ADSET LEVEL ===
  const adsetText = topAdsets.length > 0
    ? "\n\n=== CONJUNTOS DE ANÚNCIOS ===\n" + topAdsets.map(a => {
        const budget = a.daily_budget ? `R$ ${a.daily_budget.toFixed(2)}/dia` : "orçamento da campanha";
        const results: string[] = [];
        if (a.leads > 0) results.push(`Leads: ${a.leads}`);
        if (a.whatsapp_conversations > 0) results.push(`Conv. WhatsApp: ${a.whatsapp_conversations}`);
        return `Conjunto: "${a.adset_name}" (ID: ${a.adset_id})
- Campanha: "${a.campaign_name}" | Status: ${a.status} | Orçamento: ${budget}
- Otimização: ${a.optimization_goal}${a.bid_strategy ? ` | Lance: ${a.bid_strategy}` : ""}
- Segmentação: ${a.targeting_summary}
- Gasto 7d: R$ ${a.spend.toFixed(2)} | Impressões: ${a.impressions} | CTR: ${a.ctr.toFixed(2)}%
- Resultados: ${results.length > 0 ? results.join(" | ") : "nenhuma conversão registrada"}`;
      }).join("\n---\n")
    : "";

  // === AD LEVEL ===
  const adText = topAds.length > 0
    ? "\n\n=== ANÚNCIOS ===\n" + topAds.map(m => {
        const conversions: string[] = [];
        if (m.leads > 0) conversions.push(`Leads: ${m.leads} | CPL: R$ ${m.cpl.toFixed(2)}`);
        if (m.whatsapp_conversations > 0) conversions.push(`Conv. WhatsApp: ${m.whatsapp_conversations} | CPConversa: R$ ${(m.spend / m.whatsapp_conversations).toFixed(2)}`);
        if (m.post_engagements > 0) conversions.push(`Engajamentos: ${m.post_engagements}`);
        const convLine = conversions.length > 0 ? conversions.join(" | ") : "nenhuma";
        return `Anúncio: "${m.ad_name}" (ID: ${m.ad_id})
- Conjunto: ${m.adset_name} | Campanha: ${m.campaign_name}
- Status: ${m.status} | ${m.days_running} dias no ar
- Gasto: R$ ${m.spend.toFixed(2)} | Impressões: ${m.impressions} | Alcance: ${m.reach}
- CTR: ${m.ctr.toFixed(2)}% | CPC: R$ ${m.cpc.toFixed(2)} | CPM: R$ ${m.cpm.toFixed(2)} | Frequência: ${m.frequency.toFixed(1)}
- Conversões: ${convLine}`;
      }).join("\n---\n")
    : "";

  const metricsText = campaignText + adsetText + adText;

  const systemPrompt = `Você é um especialista sênior em Meta Ads para o segmento ${client.contexto.segmento} em ${client.contexto.cidade}, ${client.contexto.estado}.

Faça uma análise COMPLETA e PROFUNDA em três níveis:
1. CAMPANHAS: objetivos, estrutura, orçamentos, resultados agregados
2. CONJUNTOS DE ANÚNCIOS: segmentação de público, sobreposição, bid strategy, otimização
3. ANÚNCIOS: performance criativa, CTR, CPM, frequência, criatividade saturada

Benchmarks Meta Ads (referência):
- CPM: R$ 5–15 (⚠ acima R$ 20)
- CPC: R$ 0,50–3 (⚠ acima R$ 5)
- CTR: 1%–2% (⚠ abaixo 0,8%)
- Frequência: 1,5–2,5 (⚠ acima 3,5)
- CPL: R$ 30–80 (⚠ acima R$ 100)
- CPConversa WhatsApp: R$ 5–25 (⚠ acima R$ 40)

Regras de decisão:
- Aguarde 4-5 dias antes de pausar anúncios com pouco gasto
- Não escale sem dados suficientes (mín. R$ 50 de gasto)
- Considere sobreposição de público entre conjuntos

Vereditos por anúncio: escalar | manter | testar_variacao | ajustar | pausar

Actions:
- verdict=pausar → {"type": "pause_ad", "ad_id": "ID"}
- verdict=escalar → {"type": "scale_budget", "adset_id": "ID", "new_budget_cents": VALOR}
- demais → {"type": "none"}

IMPORTANTE:
- summary_text: OBRIGATÓRIO, nunca vazio. Resumo executivo de 3-5 frases com visão geral da conta: gasto total, CTR médio, leads/conversas, pontos críticos e destaques.
- plano_de_acao: Liste as 5-10 ações mais importantes, priorizadas por impacto. Inclua ações em TODOS os níveis (campanha, conjunto, anúncio, público). Seja específico: mencione nomes de campanhas/conjuntos e o que exatamente deve ser feito.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    system: systemPrompt,
    tools: [{
      name: "retornar_analise",
      description: "Retorna a análise completa e estruturada de todas as campanhas Meta Ads",
      input_schema: {
        type: "object" as const,
        properties: {
          proposals: { type: "array", items: { type: "object", properties: {
            ad_id: { type: "string" }, ad_name: { type: "string" }, adset_name: { type: "string" },
            campaign_name: { type: "string" }, verdict: { type: "string", enum: ["escalar","manter","testar_variacao","ajustar","pausar"] },
            titulo: { type: "string" }, diagnostico: { type: "string" },
            metricas_problema: { type: "array", items: { type: "string" } },
            acao_sugerida: { type: "string" }, action: { type: "object" },
          }, required: ["ad_id","ad_name","adset_name","campaign_name","verdict","titulo","diagnostico","metricas_problema","acao_sugerida","action"] } },
          alerts: { type: "array", items: { type: "object", properties: {
            level: { type: "string", enum: ["info","warning","critical"] },
            title: { type: "string" }, message: { type: "string" }, entity_name: { type: "string" },
          }, required: ["level","title","message","entity_name"] } },
          summary_text: { type: "string" },
          plano_de_acao: { type: "array", items: { type: "object", properties: {
            prioridade: { type: "number" },
            titulo: { type: "string" },
            descricao: { type: "string" },
            nivel: { type: "string", enum: ["campanha","conjunto","anuncio","publico"] },
            impacto: { type: "string", enum: ["alto","medio","baixo"] },
            esforco: { type: "string", enum: ["simples","medio","complexo"] },
          }, required: ["prioridade","titulo","descricao","nivel","impacto","esforco"] } },
        },
        required: ["proposals","alerts","summary_text","plano_de_acao"],
      },
    }],
    tool_choice: { type: "tool", name: "retornar_analise" },
    messages: [{ role: "user", content: `Analise as campanhas Meta Ads dos últimos 7 dias e gere uma análise completa com plano de ação:\n\n${metricsText}` }],
  });

  const toolUse = response.content.find(b => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") throw new Error("Claude não retornou análise estruturada");

  const parsed = toolUse.input as {
    proposals: Array<Omit<Proposal, "id" | "status" | "created_at">>;
    alerts: Array<Omit<Alert, "id">>;
    summary_text: string;
    plano_de_acao: ActionItem[];
  };

  const now_iso = new Date().toISOString();
  const totalSpend = adMetrics.reduce((s, m) => s + m.spend, 0);
  const totalLeads = adMetrics.reduce((s, m) => s + m.leads, 0);
  const totalWhatsapp = adMetrics.reduce((s, m) => s + m.whatsapp_conversations, 0);
  const avgCtr = adMetrics.length > 0 ? adMetrics.reduce((s, m) => s + m.ctr, 0) / adMetrics.length : 0;
  const convSummary = totalLeads > 0 ? `Leads: ${totalLeads}.` : totalWhatsapp > 0 ? `Conversas WhatsApp: ${totalWhatsapp}.` : "Nenhuma conversão registrada.";
  const defaultSummary = `${campaignData.length} campanha(s), ${adsetData.length} conjunto(s) e ${adMetrics.length} anúncio(s) nos últimos 7 dias (top ${topCampaigns.length}/${topAdsets.length}/${topAds.length} por gasto analisados). Gasto total: R$ ${totalSpend.toFixed(2)}. CTR médio: ${avgCtr.toFixed(2)}%. ${convSummary}`;

  return {
    client_slug: client.slug,
    analyzed_at: now_iso,
    proposals: (parsed.proposals ?? []).map(p => ({ ...p, id: randomUUID(), status: "pending" as const, created_at: now_iso })),
    alerts: (parsed.alerts ?? []).map(a => ({ ...a, id: randomUUID() })),
    summary_text: parsed.summary_text || defaultSummary,
    plano_de_acao: parsed.plano_de_acao ?? [],
    spend_7d: totalSpend,
    leads_7d: totalLeads,
    whatsapp_7d: totalWhatsapp,
    avg_ctr: avgCtr,
  };
}

export async function analyzeGoogleAds(client: Client, dateFrom: string, dateTo: string): Promise<AnalysisResult> {
  if (!client.google) throw new Error("Cliente sem credenciais Google Ads");

  const empty = (msg: string): AnalysisResult => ({
    client_slug: client.slug,
    analyzed_at: new Date().toISOString(),
    proposals: [],
    alerts: [{ id: randomUUID(), level: "info", title: "Sem dados suficientes", message: msg, entity_name: client.nome }],
    summary_text: msg,
  });

  let adGroups: GoogleAdMetrics[] = [];
  try {
    adGroups = await getGoogleAdGroupInsights(client.google, dateFrom, dateTo);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      client_slug: client.slug,
      analyzed_at: new Date().toISOString(),
      proposals: [],
      alerts: [{ id: randomUUID(), level: "critical", title: "Erro ao buscar dados do Google Ads", message: msg, entity_name: client.nome }],
      summary_text: `Erro ao buscar dados: ${msg}`,
    };
  }

  if (adGroups.length === 0) return empty("Nenhum grupo de anúncios ativo encontrado nos últimos 7 dias.");

  const metricsText = adGroups.map(ag => `
Grupo de Anúncios: "${ag.ad_group_name}" (ID: ${ag.ad_group_id})
- Campanha: "${ag.campaign_name}" (ID: ${ag.campaign_id})
- Status: ${ag.status}
- Período: últimos 7 dias
- Gasto: R$ ${ag.spend.toFixed(2)}
- Impressões: ${ag.impressions} | Cliques: ${ag.clicks}
- CTR: ${ag.ctr.toFixed(2)}% | CPC: R$ ${ag.cpc.toFixed(2)}
- Conversões: ${ag.conversions.toFixed(1)}${ag.cost_per_conversion > 0 ? ` | Custo/Conversão: R$ ${ag.cost_per_conversion.toFixed(2)}` : ""}
`).join("\n---\n");

  const systemPrompt = `Você é um especialista em análise de campanhas Google Ads para o segmento ${client.contexto.segmento} em ${client.contexto.cidade}, ${client.contexto.estado}.

Benchmarks de referência para Google Ads:
- CPC: R$ 0,80 a R$ 4 (alerta acima de R$ 8)
- CTR Search: 2% a 6% (alerta abaixo de 1,5%)
- Custo/Conversão: R$ 50 a R$ 150 (alerta acima de R$ 200)
- Taxa de conversão: 2% a 5% (alerta abaixo de 1%)

Vereditos possíveis: escalar | manter | testar_variacao | ajustar | pausar
action_type: "pause_ad_group" quando verdict=pausar, "pause_campaign" apenas se toda campanha deve parar, "none" para os demais

IMPORTANTE: O campo summary_text é OBRIGATÓRIO e nunca pode ficar vazio. Sempre escreva um resumo executivo de 2-4 frases descrevendo o estado atual das campanhas, mesmo que tudo esteja dentro dos benchmarks. Mencione gasto total, conversões, CPC médio e principais pontos de atenção ou destaques.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: systemPrompt,
    tools: [{
      name: "retornar_analise",
      description: "Retorna a análise estruturada das campanhas Google Ads",
      input_schema: {
        type: "object" as const,
        properties: {
          proposals: { type: "array", items: { type: "object", properties: {
            ad_id: { type: "string" }, ad_name: { type: "string" }, adset_name: { type: "string" },
            campaign_name: { type: "string" }, campaign_id: { type: "string" },
            verdict: { type: "string", enum: ["escalar","manter","testar_variacao","ajustar","pausar"] },
            titulo: { type: "string" }, diagnostico: { type: "string" },
            metricas_problema: { type: "array", items: { type: "string" } },
            acao_sugerida: { type: "string" },
            action_type: { type: "string", enum: ["pause_ad_group","pause_campaign","none"] },
          }, required: ["ad_id","ad_name","adset_name","campaign_name","campaign_id","verdict","titulo","diagnostico","metricas_problema","acao_sugerida","action_type"] } },
          alerts: { type: "array", items: { type: "object", properties: {
            level: { type: "string", enum: ["info","warning","critical"] },
            title: { type: "string" }, message: { type: "string" }, entity_name: { type: "string" },
          }, required: ["level","title","message","entity_name"] } },
          summary_text: { type: "string" },
        },
        required: ["proposals","alerts","summary_text"],
      },
    }],
    tool_choice: { type: "tool", name: "retornar_analise" },
    messages: [{ role: "user", content: `Analise os seguintes grupos de anúncios do Google Ads dos últimos 7 dias e gere propostas de otimização:\n\n${metricsText}` }],
  });

  const toolUse = response.content.find(b => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") throw new Error("Claude não retornou análise estruturada");

  const parsed = toolUse.input as {
    proposals: Array<{ ad_id: string; ad_name: string; adset_name: string; campaign_name: string; campaign_id: string; verdict: string; titulo: string; diagnostico: string; metricas_problema: string[]; acao_sugerida: string; action_type: "pause_ad_group" | "pause_campaign" | "none" }>;
    alerts: Array<Omit<Alert, "id">>;
    summary_text: string;
  };

  const customerId = normalizeCustomerId(client.google.customer_id);
  const now_iso = new Date().toISOString();

  const totalSpendGoogle = adGroups.reduce((s, g) => s + g.spend, 0);
  const totalConversions = adGroups.reduce((s, g) => s + g.conversions, 0);
  const avgCtrGoogle = adGroups.length > 0 ? adGroups.reduce((s, g) => s + g.ctr, 0) / adGroups.length : 0;
  const defaultSummaryGoogle = `${adGroups.length} grupo(s) de anúncios analisado(s) nos últimos 7 dias. Gasto total: R$ ${totalSpendGoogle.toFixed(2)}. CTR médio: ${avgCtrGoogle.toFixed(2)}%. Conversões: ${totalConversions.toFixed(0)}. Nenhuma ação urgente identificada.`;

  return {
    client_slug: client.slug,
    analyzed_at: now_iso,
    proposals: (parsed.proposals ?? []).map(p => {
      let action: Proposal["action"];
      if (p.verdict === "pausar") {
        action = p.action_type === "pause_campaign"
          ? { type: "pause_google_campaign", campaign_id: p.campaign_id, customer_id: customerId }
          : { type: "pause_google_ad_group", ad_group_id: p.ad_id, customer_id: customerId };
      } else if (p.verdict === "escalar") {
        action = { type: "scale_google_campaign", campaign_id: p.campaign_id, customer_id: customerId };
      } else {
        action = { type: "none" };
      }
      return { ...p, verdict: p.verdict as Proposal["verdict"], action, id: randomUUID(), status: "pending" as const, created_at: now_iso };
    }),
    alerts: (parsed.alerts ?? []).map(a => ({ ...a, id: randomUUID() })),
    summary_text: parsed.summary_text || defaultSummaryGoogle,
  };
}
