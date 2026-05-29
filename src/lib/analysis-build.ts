/**
 * Versão "build-only" do analyzer Meta — busca dados + monta o prompt sem
 * chamar a API Anthropic. Usado pelo fluxo Phase 2 (subagentes Claude Code,
 * via plano em vez de API).
 *
 * O endpoint /api/cron/analysis-input usa isto pra entregar ao poller local
 * a entrada pronta. O skill `analisar-cliente` produz o resultado via Claude
 * Code e o endpoint /api/cron/analysis-save recebe e persiste.
 *
 * IMPORTANTE: mantém a mesma lógica de fetch/prompt-build do `analyzeMetaAds`
 * em analysis.ts pra produzir resultados idênticos.
 */
import {
  getAdInsights, getCampaignData, getAdsetData, getCustomAudiences,
  type CustomAudience,
} from "@/lib/meta-api";
import { getRecentReports } from "@/lib/reports-store";
import type { Client } from "@/types/client";
import type { AdMetrics } from "@/types/metrics";

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
  const interests = (t.interests as Array<{ name: string }> ?? []).slice(0, 3).map(i => i.name);
  if (interests.length) parts.push(`INT:${interests.join("&")}`);
  return parts.join(" | ") || "amplo";
}

async function buildHistoricalContext(slug: string, todayISO: string): Promise<string> {
  let recent;
  try {
    recent = await getRecentReports(slug, 8);
  } catch {
    return "";
  }
  const past = recent.filter(r => r.date !== todayISO).slice(0, 7);
  if (past.length === 0) return "";
  const lines: string[] = [];
  for (const r of past) {
    const m = r.meta;
    if (!m) continue;
    const verdicts = (m.campaigns_analysis ?? []).map(c => `${c.campaign_name.slice(0, 40)}=${c.verdict}`).slice(0, 5).join(" · ");
    const spend = (m.spend_7d ?? 0).toFixed(0);
    const leads = m.leads_7d ?? 0;
    const summary = (m.summary_text ?? "").replace(/\s+/g, " ").slice(0, 140);
    lines.push(`- ${r.date}: gasto7d=R$${spend} leads=${leads}${verdicts ? " | " + verdicts : ""}${summary ? " | " + summary : ""}`);
  }
  if (lines.length === 0) return "";
  return `\n\nHISTÓRICO RECENTE (últimos ${lines.length} dias):\n${lines.join("\n")}`;
}

export interface MetaAnalysisInput {
  /** Dados brutos pra post-processamento depois (preservados pro save endpoint). */
  raw: {
    adMetrics: AdMetrics[];
    campaignData: Awaited<ReturnType<typeof getCampaignData>>;
    adsetData: Awaited<ReturnType<typeof getAdsetData>>;
    customAudiences: CustomAudience[];
    adFailed: boolean;
    campFailed: boolean;
  };
  systemPrompt: string;
  userMessage: string;
  toolSchema: Record<string, unknown>;
  /** Status: se vazio retornar empty(), skip Claude. */
  emptyReason?: string;
}

export async function buildMetaAnalysisInput(
  client: Client,
  dateFrom: string,
  dateTo: string,
): Promise<MetaAnalysisInput> {
  const [adMetricsRes, campaignDataRes, adsetDataRes, customAudiencesRes, historicoRes] = await Promise.allSettled([
    getAdInsights(client.meta.ad_account_id, client.meta.access_token, dateFrom, dateTo),
    getCampaignData(client.meta.ad_account_id, client.meta.access_token, dateFrom, dateTo),
    getAdsetData(client.meta.ad_account_id, client.meta.access_token, dateFrom, dateTo),
    getCustomAudiences(client.meta.ad_account_id, client.meta.access_token),
    buildHistoricalContext(client.slug, dateTo),
  ]);
  const adMetrics: AdMetrics[] = adMetricsRes.status === "fulfilled" ? adMetricsRes.value : [];
  const campaignData = campaignDataRes.status === "fulfilled" ? campaignDataRes.value : [];
  const adsetData = adsetDataRes.status === "fulfilled" ? adsetDataRes.value : [];
  const customAudiences = customAudiencesRes.status === "fulfilled" ? customAudiencesRes.value : [];
  const historicoText: string = historicoRes.status === "fulfilled" ? historicoRes.value : "";
  const adFailed = adMetricsRes.status === "rejected";
  const campFailed = campaignDataRes.status === "rejected";
  const raw = { adMetrics, campaignData, adsetData, customAudiences, adFailed, campFailed };

  if (adMetrics.length === 0 && campaignData.length === 0) {
    return {
      raw,
      systemPrompt: "",
      userMessage: "",
      toolSchema: {},
      emptyReason: adFailed || campFailed
        ? `Falha ao buscar dados Meta (não persistir vazio)`
        : "Não há dados de anúncios ativos nos últimos 7 dias.",
    };
  }
  const adSpendCheck = adMetrics.reduce((s, m) => s + m.spend, 0);
  const campSpendCheck = campaignData.reduce((s, c) => s + c.spend, 0);
  if (adSpendCheck < 1 && campSpendCheck < 1) {
    return { raw, systemPrompt: "", userMessage: "", toolSchema: {}, emptyReason: "Nenhum gasto registrado nos últimos 7 dias." };
  }

  const topCampaigns = [...campaignData].sort((a, b) => b.spend - a.spend).slice(0, 15);
  const topAdsets = [...adsetData].sort((a, b) => b.spend - a.spend).slice(0, 20);
  const topAds = [...adMetrics].sort((a, b) => b.spend - a.spend).slice(0, 30);

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
    ? `\nOrçamento mensal: R$${(client.contexto.orcamento_mensal_cents / 100).toFixed(0)}. Não escalonar acima.`
    : "";
  const customAudienceText = customAudiences.length > 0
    ? `\nPÚBLICOS DISPONÍVEIS:\n${customAudiences.slice(0, 15).map(a => `[${a.id}] ${a.name}`).join("\n")}`
    : "";
  const empreendimentos = client.contexto.empreendimentos ?? [];
  const empreendimentosText = empreendimentos.length > 0
    ? `\nEMPREENDIMENTOS/PRODUTOS:\n${empreendimentos.map(e => `- ${e.nome} | ${e.localizacao}${e.tipo ? " | " + e.tipo : ""}${e.observacoes ? " | " + e.observacoes : ""}`).join("\n")}\nSEMPRE referencie a localização correta detectada no nome do anúncio.`
    : "";
  const recentSpend = adMetrics.reduce((s, m) => s + m.spend, 0) || campaignData.reduce((s, c) => s + c.spend, 0);
  const tier = recentSpend > 3000 ? "rigoroso" : recentSpend > 500 ? "padrao" : "leve";
  const tierContext = tier === "rigoroso"
    ? `\nTIER RIGOROSO (gasto 7d R$${recentSpend.toFixed(0)}): evidência obrigatória (R$30+ E ≥4d), prefere "manter" quando incerto.`
    : tier === "padrao"
    ? `\nTIER PADRÃO (gasto 7d R$${recentSpend.toFixed(0)}).`
    : `\nTIER LEVE (gasto 7d R$${recentSpend.toFixed(0)}).`;

  const systemPrompt = `Especialista Meta Ads — Revisão Diária. Segmento: ${client.contexto.segmento}, praça: ${client.contexto.cidade}/${client.contexto.estado}.${orcamentoMensal}${empreendimentosText}${tierContext}${historicoText}

OBJETIVO: produzir o **checklist da revisão diária** seguindo EXATAMENTE as 5 ações abaixo. Pra cada ação responda no formato { status, resumo, sub_acoes[] }. NÃO MISTURAR com otimização semanal/mensal.

AÇÕES DO CHECKLIST (ordem fixa):

1. "Verificar se as campanhas tiveram veiculação ontem e hoje"
   - SE todas campanhas ativas tiveram veiculação → status="check", resumo="N campanhas ativas, todas veiculando."
   - SE alguma sem veiculação → status="atencao", resumo="X de N sem veiculação", sub_acoes[] com campanha + causa provável + solução proposta.

2. "Verificar se existem criativos ou públicos com CPA muito acima da média e pausar"
   - SE nenhum CPA absurdo (≥3× benchmark + spend ≥R$50 + 4+ dias) → status="check".
   - SE houver → status="atencao", sub_acoes[] = lista de ads pra pausar com {ad_id, adset_id (SEMPRE, o conjunto do ad), ad_name, cpl_atual, motivo, sugestao_novo_criativo, sugestao_novo_publico, action:{type:"pause_ad", ad_id}}.
   - A pausa É a ação (executada pelo portal), não só recomendação: SEMPRE preencha action.type="pause_ad" e adset_id em cada sub_acao desta ação.

3. "Subir criativos enviados pelo cliente"
   - Você não tem acesso ao Drive — sempre marque status="verificar_manual", resumo="Conferir pasta Drive do cliente. Se houver, decidir em qual campanha subir antes de upload.".
   - sub_acoes vazias (humano resolve).

4. "Verificar se as campanhas com mais performance estão recebendo o maior investimento (realocar 20%/20%)"
   - SE balanceamento ok (top performers já têm mais budget proporcionalmente) → status="check".
   - SE houver desbalanceamento → status="atencao", sub_acoes[] = realocações sugeridas {adset_id, adset_name, daily_budget_atual, daily_budget_sugerido, motivo}. Apenas ±20% por adset por dia. Respeitar orçamento mensal.

5. "Garantir pelo menos 4 criativos ativos por conjunto de anúncios"
   - Conte ads ATIVOS por adset. Se TODOS adsets ativos têm ≥4 ads → status="check".
   - SE algum adset tem <4 ads → status="atencao", sub_acoes[] = pedidos de criativo {adset_id, adset_name, ads_ativos_atual, ads_faltantes, sugestao: "solicitar ao cliente" OU "gerar via design_agent"}.

REGRAS:
- Cada ação SEMPRE aparece, mesmo se status="check".
- Vereditos no campaigns_analysis (legado, mantém pra compatibilidade): apenas manter | ajustar | pausar.
- Papel ads: apenas manter | escalar | pausar.
- NÃO preencher publicos[] / nova_estrutura / copy_sugerida — isso é semanal/mensal.
- Proposals tradicionais (proposals[]) derive APENAS dos sub_acoes da ação 2 (pausar) + ação 4 (escalar). 1:1.
- AÇÃO EXECUTÁVEL OBRIGATÓRIA em cada proposal (a UI executa via portal — nunca deixe só texto):
  · Ação 2 → { verdict:"pausar", ad_id:<id do ad>, action:{type:"pause_ad", ad_id:<mesmo id>} }.
  · Ação 4 → { verdict:"escalar", ad_id:<id de um ad do conjunto>, action:{type:"scale_budget", adset_id:<id do conjunto>, new_budget_cents:<INTEIRO em centavos = daily_budget_sugerido×100, OBRIGATÓRIO, JAMAIS null/ausente/0> } }.
- new_budget_cents NUNCA pode faltar num scale_budget — sem ele o botão "Escalar" quebra. Calcule sempre a partir do daily_budget_sugerido.${customAudienceText}`;

  const userMessage = `Analise as campanhas Meta Ads dos últimos 7 dias:\n\n${metricsText}`;

  // Schema mais simples que o de tool_use (Claude Code skill produz JSON puro)
  const toolSchema = {
    type: "object",
    properties: {
      checklist: { type: "array" },        // 5 ações ClickUp (formato ChecklistAction)
      proposals: { type: "array" },
      alerts: { type: "array" },
      summary_text: { type: "string" },
      plano_de_acao: { type: "array" },
      campaigns_analysis: { type: "array" },
    },
    required: ["checklist", "proposals", "alerts", "summary_text", "plano_de_acao", "campaigns_analysis"],
  };

  return { raw, systemPrompt, userMessage, toolSchema };
}
