import Anthropic from "@anthropic-ai/sdk";
import { getAdInsights, getCampaignData, getAdsetData, getCustomAudiences } from "@/lib/meta-api";
import { getGoogleAdGroupInsights, normalizeCustomerId } from "@/lib/google-ads-api";
import type { Client } from "@/types/client";
import type { AdMetrics, GoogleAdMetrics, AnalysisResult, Proposal, Alert, ActionItem } from "@/types/metrics";
import type { CustomAudience } from "@/lib/meta-api";
import { randomUUID } from "crypto";

function compactTargeting(t: Record<string, unknown>, knownAudiences: CustomAudience[]): string {
  const parts: string[] = [];
  const ageMin = t.age_min as number | undefined;
  const ageMax = t.age_max as number | undefined;
  if (ageMin || ageMax) parts.push(`${ageMin ?? 18}-${ageMax ?? "65+"}anos`);
  const genders = t.genders as number[] | undefined;
  if (genders?.length === 1) parts.push(genders[0] === 1 ? "M" : "F");
  const ca = (t.custom_audiences as Array<{ id: string; name?: string }> ?? []);
  if (ca.length) {
    const names = ca.map(a => {
      const found = knownAudiences.find(k => k.id === a.id);
      return found ? found.name : a.name ?? a.id;
    });
    parts.push(`CA:[${names.join(",")}]`);
  }
  const exc = (t.excluded_custom_audiences as Array<{ id: string; name?: string }> ?? []);
  if (exc.length) parts.push(`EXC:[${exc.map(a => a.name ?? a.id).join(",")}]`);
  const interests = (t.interests as Array<{ name: string }> ?? []).slice(0, 3).map(i => i.name);
  if (interests.length) parts.push(`INT:${interests.join("&")}`);
  const tgtOpt = t.targeting_optimization as string | undefined;
  if (tgtOpt) parts.push(`ADV+:${tgtOpt}`);
  return parts.join(" | ") || "amplo";
}

// Score composto (0-100) — quanto MAIOR melhor
function calcScore(ad: AdMetrics): number {
  // CPL normalizado (inverted — menor CPL = mais pontos)
  const cplScore = ad.cpl > 0 ? Math.max(0, 100 - (ad.cpl / 50) * 40) : 50;
  // CTR (0.5% = 20pts, 2% = 80pts)
  const ctrScore = Math.min(100, (ad.ctr / 2) * 80);
  // Frequência (< 3 = bom, > 5 = ruim)
  const freqScore = ad.frequency > 0 ? Math.max(0, 100 - ((ad.frequency - 3) / 3) * 60) : 60;
  // Peso: 50% CPL, 30% CTR, 20% frequência
  return Math.round(cplScore * 0.5 + ctrScore * 0.3 + freqScore * 0.2);
}

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

  // Fetch all levels + custom audiences in parallel
  const [adMetricsRes, campaignDataRes, adsetDataRes, customAudiencesRes] = await Promise.allSettled([
    getAdInsights(client.meta.ad_account_id, client.meta.access_token, dateFrom, dateTo),
    getCampaignData(client.meta.ad_account_id, client.meta.access_token, dateFrom, dateTo),
    getAdsetData(client.meta.ad_account_id, client.meta.access_token, dateFrom, dateTo),
    getCustomAudiences(client.meta.ad_account_id, client.meta.access_token),
  ]);

  const adMetrics: AdMetrics[] = adMetricsRes.status === "fulfilled" ? adMetricsRes.value : [];
  const campaignData = campaignDataRes.status === "fulfilled" ? campaignDataRes.value : [];
  const adsetData = adsetDataRes.status === "fulfilled" ? adsetDataRes.value : [];
  const customAudiences = customAudiencesRes.status === "fulfilled" ? customAudiencesRes.value : [];

  if (adMetrics.length === 0 && campaignData.length === 0) {
    return empty("Não há dados de anúncios ativos nos últimos 7 dias.");
  }

  // Fast path: skip Claude if no meaningful spend
  const totalSpendCheck = adMetrics.reduce((s, m) => s + m.spend, 0);
  if (totalSpendCheck < 1 && adMetrics.length === 0) {
    return empty("Nenhum gasto registrado nos últimos 7 dias.");
  }

  // Top N by spend — compact limits to control token cost
  const topCampaigns = [...campaignData].sort((a, b) => b.spend - a.spend).slice(0, 8);
  const topAdsets = [...adsetData].sort((a, b) => b.spend - a.spend).slice(0, 12);
  const topAds = [...adMetrics].sort((a, b) => b.spend - a.spend).slice(0, 15);

  // Compact format — removes targeting_summary, alcance, days_running, post_engagements
  const campaignText = topCampaigns.length > 0
    ? "CAMPANHAS\n" + topCampaigns.map(c => {
        const bud = c.daily_budget ? `R$${c.daily_budget.toFixed(0)}/d` : c.lifetime_budget ? `R$${c.lifetime_budget.toFixed(0)}vit` : "s/orç";
        const conv = [c.leads > 0 ? `L:${c.leads}` : "", c.whatsapp_conversations > 0 ? `WA:${c.whatsapp_conversations}` : ""].filter(Boolean).join(" ") || "0conv";
        return `[${c.campaign_id}] "${c.campaign_name}" ${c.status} ${bud} obj:${c.objective}\n  G:R$${c.spend.toFixed(0)} imp:${c.impressions} CTR:${c.ctr.toFixed(1)}% ${conv}`;
      }).join("\n")
    : "";

  const adsetText = topAdsets.length > 0
    ? "\nCONJUNTOS\n" + topAdsets.map(a => {
        const bud = a.daily_budget ? `R$${a.daily_budget.toFixed(0)}/d` : "camp";
        const conv = [a.leads > 0 ? `L:${a.leads}` : "", a.whatsapp_conversations > 0 ? `WA:${a.whatsapp_conversations}` : ""].filter(Boolean).join(" ") || "0conv";
        // Compact targeting: only key fields to avoid blowing up prompt size
        const tgtCompact = a.targeting_raw ? compactTargeting(a.targeting_raw, customAudiences) : a.targeting_summary;
        return `[${a.adset_id}] "${a.adset_name}" camp:[${a.campaign_id}] ${a.status} ${bud} ${a.optimization_goal}${a.bid_strategy ? ` ${a.bid_strategy}` : ""}\n  G:R$${a.spend.toFixed(0)} imp:${a.impressions} CTR:${a.ctr.toFixed(1)}% ${conv}\n  SEG:${tgtCompact}`;
      }).join("\n")
    : "";

  const adText = topAds.length > 0
    ? "\nANÚNCIOS\n" + topAds.map(m => {
        const conv = [
          m.leads > 0 ? `L:${m.leads} CPL:R$${m.cpl.toFixed(0)}` : "",
          m.whatsapp_conversations > 0 ? `WA:${m.whatsapp_conversations} CPconv:R$${(m.spend / m.whatsapp_conversations).toFixed(0)}` : "",
        ].filter(Boolean).join(" ") || "0conv";
        return `[${m.ad_id}] "${m.ad_name}" conj:[${m.adset_id}] ${m.status}\n  G:R$${m.spend.toFixed(0)} imp:${m.impressions} CTR:${m.ctr.toFixed(1)}% CPC:R$${m.cpc.toFixed(1)} CPM:R$${m.cpm.toFixed(0)} Freq:${m.frequency.toFixed(1)} ${conv}`;
      }).join("\n")
    : "";

  const metricsText = [campaignText, adsetText, adText].filter(Boolean).join("\n");

  const orcamentoMensal = client.contexto.orcamento_mensal_cents
    ? `\nOrçamento mensal do cliente: R$${(client.contexto.orcamento_mensal_cents / 100).toFixed(0)}. Ao sugerir escalonamento, calcule new_budget_cents de forma que o gasto projetado no mês não ultrapasse esse limite. Nunca sugira escalonamento que resulte em gasto mensal projetado (novo_daily_budget × dias_restantes + gasto_atual) acima desse valor.`
    : "";

  const customAudienceText = customAudiences.length > 0
    ? `\nPÚBLICOS DISPONÍVEIS (use IDs em create_adset):\n${customAudiences.slice(0, 15).map(a => `[${a.id}] ${a.name}`).join("\n")}`
    : "";

  const systemPrompt = `Especialista Meta Ads (metodologia 12345 Pedro Sobral) — segmento: ${client.contexto.segmento}, praça: ${client.contexto.cidade}/${client.contexto.estado}.${orcamentoMensal}

METODOLOGIA 12345 — siga SEMPRE essa ordem de otimização:
1.ORÇAMENTOS: resultado bom→escalar 20-30% | ruim→pausar. Escalar só com R$50+ gasto e dentro do orçamento mensal.
2.PÚBLICOS: CPM alto→ampliar público (criar novo conjunto) | saturado(freq>3,5 ou alcance<500)→expandir janela/novo público | muitos cliques sem conversão→restringir. Sempre criar novo conjunto ao trocar público — nunca modificar o existente.
3.CRIATIVOS: CTR<0,8%→novo gancho/copy | frequência>3,5→variação visual | hook rate baixo→nova abertura. Ao pausar um anúncio, sempre subir um novo.
4.ESTRUTURA: revisar agrupamento por aquecimento (Q/F) e posicionamento a cada 7-14-21 dias.
5.DESTINO: se CTR ok mas CPL alto → problema na LP ou atendimento (ajuste_tipo:"configuracao").

Benchmarks: CPM R$5-15(⚠>20) | CPC R$0,5-3(⚠>5) | CTR 1-2%(⚠<0,8%) | Freq 1,5-2,5(⚠>3,5) | CPL R$30-80(⚠>100) | CPconv WA R$5-25(⚠>40)
Período mínimo: pausar só após 4-5 dias E R$30+ gasto. Escalar só com R$50+ gasto.
Vereditos: escalar|manter|testar_variacao|ajustar|pausar
Actions: pausar→{type:"pause_ad",ad_id} | escalar→{type:"scale_budget",adset_id,new_budget_cents} | ajustar público→{type:"create_adset",campaign_id,adset_name,targeting,optimization_goal,bid_strategy?,daily_budget_cents?,targeting_summary_new} | demais→{type:"none"}
NOMENCLATURA grupos de anúncio: "NN – [POSICIONAMENTO] [GÊNERO/IDADE se específico] – Nome do público" (NN=próximo sequencial, ex:"01 – [AUTO] – Envolvimento IG/FB – 365D").
ajuste_tipo: OBRIGATÓRIO para ajustar — "criativo"(copy/gancho/visual) | "publico"(segmentação/janela/saturação) | "lance"(CPM/CPC) | "configuracao"(objetivo/LP/destino).
copy_sugerida: SOMENTE quando ajuste_tipo="criativo" ou verdict="testar_variacao". versao_a=criativo corrigido, versao_b=variação diferente. headline≤40ch, texto≤125ch, cta curto.
IMPORTANTE create_adset: targeting=objeto JSON completo válido Meta API. Use IDs dos públicos disponíveis. Conjunto criado PAUSADO.
summary_text: OBRIGATÓRIO — 2-3 frases: gasto total, CTR médio, leads/WA, pontos críticos.
plano_de_acao: máx 5 ações priorizadas, seguindo ordem 12345, específicas (cite IDs).`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
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
            acao_sugerida: { type: "string" },
            action: { type: "object", properties: {
              type: { type: "string", enum: ["pause_ad","scale_budget","create_adset","none"] },
              ad_id: { type: "string" },
              adset_id: { type: "string" },
              new_budget_cents: { type: "number" },
              campaign_id: { type: "string" },
              adset_name: { type: "string" },
              targeting: { type: "object" },
              optimization_goal: { type: "string" },
              bid_strategy: { type: "string" },
              daily_budget_cents: { type: "number" },
              targeting_summary_new: { type: "string" },
            }, required: ["type"] },
            ajuste_tipo: { type: "string", enum: ["criativo","publico","lance","configuracao"] },
            copy_sugerida: { type: "object", properties: {
              versao_a: { type: "object", properties: { headline: { type: "string" }, texto: { type: "string" }, cta: { type: "string" } }, required: ["headline","texto","cta"] },
              versao_b: { type: "object", properties: { headline: { type: "string" }, texto: { type: "string" }, cta: { type: "string" } }, required: ["headline","texto","cta"] },
            }, required: ["versao_a","versao_b"] },
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
    messages: [{ role: "user", content: `Analise as campanhas Meta Ads dos últimos 7 dias:\n\n${metricsText}${customAudienceText}` }],
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

  // Build proposals with score and escalar enrichment
  const adMetricsMap = new Map<string, AdMetrics>(adMetrics.map(m => [m.ad_id, m]));

  const proposals: Proposal[] = (parsed.proposals ?? []).map(p => {
    const adData = adMetricsMap.get(p.ad_id);
    const score = adData ? calcScore(adData) : 50;

    let acao_sugerida = p.acao_sugerida;
    let budget_sugerido_cents: number | undefined;

    if (p.verdict === "escalar" && adData) {
      const CPL_THRESHOLD = 80; // reference threshold in BRL
      const cplGoodThreshold = CPL_THRESHOLD * 0.6;
      if (adData.cpl > 0 && adData.cpl < cplGoodThreshold) {
        // budget_estimado = (spend / 7) * 1.5 — safety margin estimate
        const budgetEstimadoDiario = (adData.spend / 7) * 1.5;
        const budgetAtualCents = Math.round(budgetEstimadoDiario * 100);
        const budgetSugeridoCents = Math.round(budgetAtualCents * 1.2);
        budget_sugerido_cents = budgetSugeridoCents;
        const pctBelow = Math.round((1 - adData.cpl / CPL_THRESHOLD) * 100);
        acao_sugerida = `Escalar: aumentar budget do conjunto de R$${(budgetAtualCents / 100).toFixed(2)} para R$${(budgetSugeridoCents / 100).toFixed(2)} (+20%). CPL atual R$${adData.cpl.toFixed(2)} está ${pctBelow}% abaixo do limite.`;
      }
    }

    return {
      ...p,
      id: randomUUID(),
      status: "pending" as const,
      created_at: now_iso,
      score,
      acao_sugerida,
      ...(budget_sugerido_cents !== undefined ? { budget_sugerido_cents } : {}),
    };
  });

  // Sort proposals by score DESC (best performing first)
  proposals.sort((a, b) => (b.score ?? 50) - (a.score ?? 50));

  return {
    client_slug: client.slug,
    analyzed_at: now_iso,
    proposals,
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

  const metricsText = adGroups.map(ag =>
    `[${ag.ad_group_id}] "${ag.ad_group_name}" camp:[${ag.campaign_id}] "${ag.campaign_name}" ${ag.status}\n  G:R$${ag.spend.toFixed(0)} imp:${ag.impressions} CTR:${ag.ctr.toFixed(1)}% CPC:R$${ag.cpc.toFixed(1)} conv:${ag.conversions.toFixed(0)}${ag.cost_per_conversion > 0 ? ` CPconv:R$${ag.cost_per_conversion.toFixed(0)}` : ""}`
  ).join("\n");

  const systemPrompt = `Especialista Google Ads — segmento: ${client.contexto.segmento}, praça: ${client.contexto.cidade}/${client.contexto.estado}.
Benchmarks: CPC R$0,8-4(⚠>8) | CTR 2-6%(⚠<1,5%) | CPconv R$50-150(⚠>200) | TxConv 2-5%(⚠<1%)
Vereditos: escalar|manter|testar_variacao|ajustar|pausar
action_type: pause_ad_group(pausar)|pause_campaign(pausar toda camp)|none
summary_text: OBRIGATÓRIO — 2-3 frases: gasto, conversões, CPC médio, pontos críticos.`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
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
    messages: [{ role: "user", content: `Google Ads últimos 7 dias:\n\n${metricsText}` }],
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
