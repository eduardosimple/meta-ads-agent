import Anthropic from "@anthropic-ai/sdk";
import { getAdInsights } from "@/lib/meta-api";
import { getGoogleAdGroupInsights, normalizeCustomerId } from "@/lib/google-ads-api";
import type { Client } from "@/types/client";
import type { AdMetrics, GoogleAdMetrics, AnalysisResult, Proposal, Alert } from "@/types/metrics";
import { randomUUID } from "crypto";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function analyzeMetaAds(client: Client, dateFrom: string, dateTo: string): Promise<AnalysisResult> {
  const empty = (msg: string): AnalysisResult => ({
    client_slug: client.slug,
    analyzed_at: new Date().toISOString(),
    proposals: [],
    alerts: [{ id: randomUUID(), level: "info", title: "Sem dados suficientes", message: msg, entity_name: client.nome }],
    summary_text: msg,
  });

  let adMetrics: AdMetrics[] = [];
  try {
    adMetrics = await getAdInsights(client.meta.ad_account_id, client.meta.access_token, dateFrom, dateTo);
  } catch {
    return empty("Não há dados de anúncios ativos nos últimos 7 dias.");
  }

  if (adMetrics.length === 0) return empty("Nenhum anúncio ativo encontrado nos últimos 7 dias.");

  const metricsText = adMetrics.map(m => `
Anúncio: "${m.ad_name}" (ID: ${m.ad_id})
- Conjunto: ${m.adset_name} | Campanha: ${m.campaign_name}
- Status: ${m.status}
- Período: últimos 7 dias (${m.days_running} dias no ar)
- Gasto: R$ ${m.spend.toFixed(2)}
- Impressões: ${m.impressions} | Alcance: ${m.reach}
- CTR: ${m.ctr.toFixed(2)}% | CPC: R$ ${m.cpc.toFixed(2)} | CPM: R$ ${m.cpm.toFixed(2)}
- Frequência: ${m.frequency.toFixed(1)}
- Cliques: ${m.clicks}${m.leads > 0 ? ` | Leads: ${m.leads} | CPL: R$ ${m.cpl.toFixed(2)}` : ""}
`).join("\n---\n");

  const systemPrompt = `Você é um especialista em análise de campanhas Meta Ads para o segmento ${client.contexto.segmento} em ${client.contexto.cidade}, ${client.contexto.estado}.

Benchmarks de referência:
- CPM: R$ 5 a R$ 15 (alerta acima de R$ 20)
- CPC: R$ 0,50 a R$ 3 (alerta acima de R$ 5)
- CTR: 1% a 2% (alerta abaixo de 0,8%)
- Frequência: 1,5 a 2,5 (alerta acima de 3,5)
- CPL: R$ 30 a R$ 80 (alerta acima de R$ 100)

Período mínimo para decisão:
- Orçamento pequeno: 2-3 dias antes de otimizar
- Anúncios: 4-5 dias antes de pausar
- Não otimize antes do tempo

Vereditos possíveis: escalar | manter | testar_variacao | ajustar | pausar

Para actions:
- Se verdict=pausar: {"type": "pause_ad", "ad_id": "ID_DO_ANUNCIO"}
- Se verdict=escalar: {"type": "scale_budget", "adset_id": "ID_DO_ADSET", "new_budget_cents": VALOR_EM_CENTAVOS}
- Caso contrário: {"type": "none"}

IMPORTANTE: O campo summary_text é OBRIGATÓRIO e nunca pode ficar vazio. Sempre escreva um resumo executivo de 2-4 frases descrevendo o estado atual das campanhas, mesmo que tudo esteja dentro dos benchmarks. Mencione gasto total, CTR médio, quantidade de leads e se há pontos de atenção ou destaques positivos.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: systemPrompt,
    tools: [{
      name: "retornar_analise",
      description: "Retorna a análise estruturada das campanhas",
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
        },
        required: ["proposals","alerts","summary_text"],
      },
    }],
    tool_choice: { type: "tool", name: "retornar_analise" },
    messages: [{ role: "user", content: `Analise os seguintes anúncios dos últimos 7 dias e gere propostas de otimização:\n\n${metricsText}` }],
  });

  const toolUse = response.content.find(b => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") throw new Error("Claude não retornou análise estruturada");

  const parsed = toolUse.input as {
    proposals: Array<Omit<Proposal, "id" | "status" | "created_at">>;
    alerts: Array<Omit<Alert, "id">>;
    summary_text: string;
  };

  const now_iso = new Date().toISOString();
  const totalSpend = adMetrics.reduce((s, m) => s + m.spend, 0);
  const totalLeads = adMetrics.reduce((s, m) => s + m.leads, 0);
  const avgCtr = adMetrics.length > 0 ? adMetrics.reduce((s, m) => s + m.ctr, 0) / adMetrics.length : 0;
  const defaultSummary = `${adMetrics.length} anúncio(s) analisado(s) nos últimos 7 dias. Gasto total: R$ ${totalSpend.toFixed(2)}. CTR médio: ${avgCtr.toFixed(2)}%. Leads: ${totalLeads}. Nenhuma ação urgente identificada.`;

  return {
    client_slug: client.slug,
    analyzed_at: now_iso,
    proposals: (parsed.proposals ?? []).map(p => ({ ...p, id: randomUUID(), status: "pending" as const, created_at: now_iso })),
    alerts: (parsed.alerts ?? []).map(a => ({ ...a, id: randomUUID() })),
    summary_text: parsed.summary_text || defaultSummary,
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
