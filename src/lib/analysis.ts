import Anthropic from "@anthropic-ai/sdk";
import { getAdInsights, getCampaignData, getAdsetData, getCustomAudiences } from "@/lib/meta-api";
import { getRecentReports } from "@/lib/reports-store";
import { getGoogleAdGroupInsights, normalizeCustomerId } from "@/lib/google-ads-api";
import type { Client } from "@/types/client";
import type { AdMetrics, GoogleAdMetrics, AnalysisResult, Proposal, Alert, ActionItem, CampaignAnalysis } from "@/types/metrics";
import type { CustomAudience } from "@/lib/meta-api";
import { randomUUID } from "crypto";

/** Monta um bloco compacto de "HISTÓRICO" a partir dos últimos N reports do
 * cliente, pra Claude fundamentar verdicts atuais ("já vimos esse público
 * saturar há 3 dias", "essa campanha foi pausada após R$X sem conversão"). */
async function buildHistoricalContext(slug: string, todayISO: string): Promise<string> {
  let recent;
  try {
    recent = await getRecentReports(slug, 8); // 7 dias + hoje
  } catch {
    return "";
  }
  // Excluir o report do dia (estamos refazendo) e pegar até 7 dias anteriores
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
  return `\n\nHISTÓRICO RECENTE (últimos ${lines.length} dias — use para fundamentar verdicts atuais, mencione padrões repetidos):\n${lines.join("\n")}\nInstrução: se algum padrão deste histórico contradiz uma proposta sua (ex: público já saturou, campanha já foi pausada e voltou pior), MENCIONE explicitamente em pontos_ruins ou o_que_mudar.`;
}

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

  // Fetch all levels + custom audiences + histórico em paralelo
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

  // Root cause fix: NÃO mascarar erro de fetch da Meta como "sem dados".
  // Se as buscas críticas (ad-insights + campanha) FALHARAM (rejected),
  // lançar erro para o analysis-single retornar meta_error e NÃO persistir
  // uma row vazia enganosa — o próximo ciclo do cron re-tenta (autocura).
  // Vazio genuíno (fetch ok, retornou []) continua caindo no empty() abaixo.
  const adFailed = adMetricsRes.status === "rejected";
  const campFailed = campaignDataRes.status === "rejected";
  if (adMetrics.length === 0 && campaignData.length === 0) {
    if (adFailed || campFailed) {
      const why = [
        adFailed ? `ad-insights: ${adMetricsRes.reason instanceof Error ? adMetricsRes.reason.message : String(adMetricsRes.reason)}` : null,
        campFailed ? `campanha: ${campaignDataRes.reason instanceof Error ? campaignDataRes.reason.message : String(campaignDataRes.reason)}` : null,
      ].filter(Boolean).join(" | ");
      throw new Error(`Falha ao buscar dados Meta — nao persistir vazio: ${why}`);
    }
    return empty("Não há dados de anúncios ativos nos últimos 7 dias.");
  }

  // "Sem gasto" só se ad-level E campaign-level não tiverem gasto. Antes
  // olhava apenas ad-level e zerava contas cujo gasto aparece em campanha.
  const adSpendCheck = adMetrics.reduce((s, m) => s + m.spend, 0);
  const campSpendCheck = campaignData.reduce((s, c) => s + c.spend, 0);
  if (adSpendCheck < 1 && campSpendCheck < 1) {
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

  // Mapa de empreendimentos/produtos — Claude usa para casar ad_name → produto
  // e NÃO generalizar pela cidade do cliente (ex: famex tem Turmalina em Pato
  // Branco mesmo sendo de Chapecó). Sem isso, sugestões viram genéricas.
  const empreendimentos = client.contexto.empreendimentos ?? [];
  const empreendimentosText = empreendimentos.length > 0
    ? `\nEMPREENDIMENTOS/PRODUTOS DO CLIENTE — case o nome do anúncio com o produto e use a localização/tipo CORRETOS (NÃO assuma que tudo é em ${client.contexto.cidade}):\n${empreendimentos.map(e => `- ${e.nome} | ${e.localizacao}${e.tipo ? " | " + e.tipo : ""}${e.status ? " | " + e.status : ""}${e.observacoes ? " | " + e.observacoes : ""}`).join("\n")}\nAo propor copy/criativo/diagnóstico, SEMPRE referencie a localização e o tipo do empreendimento correto detectado no nome do anúncio. Se o nome do anúncio não casar com nenhum produto da lista, diga isso explicitamente em vez de chutar.`
    : "";

  // TIER por gasto recente — eleva rigor da análise para contas grandes
  // (FAMEX gasta ~R$30k/mês = ~R$7k/7d). Conservador onde dói mais.
  const recentSpend = adMetrics.reduce((s, m) => s + m.spend, 0)
    || campaignData.reduce((s, c) => s + c.spend, 0);
  const tier: "leve" | "padrao" | "rigoroso" =
    recentSpend > 3000 ? "rigoroso" : recentSpend > 500 ? "padrao" : "leve";
  const tierContext = tier === "rigoroso"
    ? `\nTIER RIGOROSO (gasto 7d R$${recentSpend.toFixed(0)} — conta grande, baixa tolerância a erro):
- Toda decisão de pausar/escalar OBRIGA evidência: mínimo R$30 gasto E ≥4 dias rodando.
- Quando incerto entre "manter" e "ajustar", prefira "manter" (vida-mais-vida > experimentar-e-quebrar).
- "substituir" campanha só com evidência grosseira: campanha inteira sem conversão e gasto >R$200.
- Justificativa em pontos_ruins/o_que_mudar DEVE citar números específicos (R$, CTR, CPL, dias) — nunca prosa vaga.
- Rebalanceio de público SEMPRE em conjunto novo; jamais editar conjunto que está convertendo.`
    : tier === "padrao"
    ? `\nTIER PADRÃO (gasto 7d R$${recentSpend.toFixed(0)}): seguir benchmarks normalmente, justificar verdicts com números do período.`
    : `\nTIER LEVE (gasto 7d R$${recentSpend.toFixed(0)} — conta pequena): sugestões diretas, evite over-engineering.`;

  const systemPrompt = `Especialista Meta Ads (metodologia 12345 Pedro Sobral) — segmento: ${client.contexto.segmento}, praça: ${client.contexto.cidade}/${client.contexto.estado}.${orcamentoMensal}${empreendimentosText}${tierContext}${historicoText}

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
plano_de_acao: máx 5 ações priorizadas, seguindo ordem 12345, específicas (cite IDs).

ANÁLISE POR CAMPANHA — OBRIGATÓRIA:
Antes de listar proposals por anúncio, PREENCHA campaigns_analysis com UMA entrada por campanha ATIVA presente nos dados. Para cada uma:
- verdict: "manter"(boa, sem ação) | "ajustar"(mudar criativo/público/conjunto dentro dela) | "substituir"(criar nova trocando) | "pausar"(parar).
- pontos_bons: array de strings curtas com o que está funcionando, sempre com número (ex: "CPM R$11 dentro do benchmark").
- pontos_ruins: array com o que está ruim e por quê, SEMPRE com NÚMEROS (ex: "CTR 0,5% bem abaixo do mínimo 0,8%").
- o_que_mudar: array com recomendações CONCRETAS e EXECUTÁVEIS (ex: "Pausar AD12 e subir variação com gancho de urgência baseado em AD06").
- anuncios: OBRIGATÓRIO — array com TODOS os anúncios DESSA campanha presentes nos dados. **REGRA CRÍTICA: cada ad_id aparece UMA ÚNICA VEZ no array — NUNCA duplicar o mesmo ad_id com papéis diferentes.** Se houver tensão, escolha o papel mais crítico (pausar > substituir > escalar > testar > manter). Cada entrada {ad_id, ad_name, papel, motivo}: papel∈"manter"(ok, deixar)|"escalar"(perf top, aumentar)|"pausar"(perf ruim, parar)|"substituir"(pausar e subir variação)|"testar"(rodar paralelo pra validar). Motivo cita números.
- publicos: OBRIGATÓRIO — array com TODOS os conjuntos (adsets) DESSA campanha. **REGRA CRÍTICA: cada adset_id aparece UMA ÚNICA VEZ.** Cada entrada {adset_id, adset_name, papel, motivo}: papel∈"manter"|"trocar". Se papel="trocar", PREENCHA substituir_por:{targeting_summary, racional} com a especificação do novo público (não modifica o atual, cria novo conjunto pausado) — E ESTE PÚBLICO TROCAR DEVE TER PROPOSAL CORRESPONDENTE em proposals[] com action=create_adset.
- nova_estrutura: SOMENTE quando verdict="substituir" — {nome, objetivo, daily_budget_cents, adsets:[{nome,targeting_summary,daily_budget_cents}], ads:[{nome_proposto, referencia_ad_id?, copy:{headline,texto,cta}, notas_visual?}], notas}. Inclua ads referenciando o vencedor relacionado da conta (referencia_ad_id) + copy nova baseada nele.
DEPOIS, derive proposals[] OBRIGATÓRIO 1:1 com as ações executáveis:
- Para CADA anúncio em campaigns_analysis.anuncios com papel ∈ {pausar, escalar, substituir, testar}: EMITA uma entrada em proposals[] referenciando o MESMO ad_id, verdict equivalente (pausar/escalar/testar_variacao/ajustar) e action concreta (pause_ad, scale_budget, ou ajuste_tipo=criativo).
- **Quando papel ∈ {substituir, testar} ou verdict ∈ {testar_variacao, ajustar(criativo)}: PREENCHA copy_sugerida com versao_a e versao_b (headline ≤40ch + texto ≤125ch + cta) da variação proposta.** Se o resumo BOM/RUIM/MUDAR diz "criar variação de ADxx", a variação tem que vir no copy_sugerida do proposal — não basta texto.
- Para CADA público em campaigns_analysis.publicos com papel="trocar": EMITA proposal verdict=ajustar, ajuste_tipo=publico, action=create_adset {campaign_id, adset_name (nomenclatura padrão), targeting (objeto Meta válido), optimization_goal, daily_budget_cents razoável, targeting_summary_new=publico.substituir_por.targeting_summary}. **CRUCIAL: o p.adset_name do proposal = adset_name ANTIGO (o que vai ser substituído, igual ao publico.adset_name), e action.adset_name = nome do NOVO conjunto.** Use o ad_id de UM anúncio dentro do conjunto antigo como p.ad_id.
- **CONSISTÊNCIA RESUMO ↔ AÇÃO:** todo item em o_que_mudar que cite ad_id/adset/anúncio específico DEVE ter proposal correspondente. O resumo não pode mencionar uma ação sem o botão equivalente em proposals[].
Ações genuinamente manuais ("verificar status no gerenciador"): coloque só como nota textual em o_que_mudar, sem citar ID.

Campanhas PAUSED/ARCHIVED não precisam estar em campaigns_analysis (mas o histórico recente delas no HISTÓRICO acima é útil pra fundamentar decisões).`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    // Subido de 4096 → 16384 porque o novo schema (anuncios[]+publicos[] por
    // campanha) gera muito mais output e estava truncando (campaigns_analysis
    // vazio para contas com 8+ campanhas).
    max_tokens: 16384,
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
          campaigns_analysis: { type: "array", items: { type: "object", properties: {
            campaign_id: { type: "string" },
            campaign_name: { type: "string" },
            verdict: { type: "string", enum: ["manter","ajustar","substituir","pausar"] },
            pontos_bons: { type: "array", items: { type: "string" } },
            pontos_ruins: { type: "array", items: { type: "string" } },
            o_que_mudar: { type: "array", items: { type: "string" } },
            anuncios: { type: "array", items: { type: "object", properties: {
              ad_id: { type: "string" },
              ad_name: { type: "string" },
              papel: { type: "string", enum: ["manter","escalar","pausar","substituir","testar"] },
              motivo: { type: "string" },
              score: { type: "number" },
            }, required: ["ad_id","ad_name","papel","motivo"] } },
            publicos: { type: "array", items: { type: "object", properties: {
              adset_id: { type: "string" },
              adset_name: { type: "string" },
              papel: { type: "string", enum: ["manter","trocar"] },
              motivo: { type: "string" },
              substituir_por: { type: "object", properties: {
                targeting_summary: { type: "string" },
                racional: { type: "string" },
              }, required: ["targeting_summary","racional"] },
            }, required: ["adset_id","adset_name","papel","motivo"] } },
            nova_estrutura: { type: "object", properties: {
              nome: { type: "string" },
              objetivo: { type: "string" },
              daily_budget_cents: { type: "number" },
              adsets: { type: "array", items: { type: "object", properties: {
                nome: { type: "string" },
                targeting_summary: { type: "string" },
                daily_budget_cents: { type: "number" },
              }, required: ["nome","targeting_summary"] } },
              ads: { type: "array", items: { type: "object", properties: {
                nome_proposto: { type: "string" },
                referencia_ad_id: { type: "string" },
                copy: { type: "object", properties: {
                  headline: { type: "string" },
                  texto: { type: "string" },
                  cta: { type: "string" },
                }, required: ["headline","texto","cta"] },
                notas_visual: { type: "string" },
              }, required: ["nome_proposto","copy"] } },
              notas: { type: "string" },
            }, required: ["nome","objetivo","daily_budget_cents","adsets"] },
          }, required: ["campaign_id","campaign_name","verdict","pontos_bons","pontos_ruins","o_que_mudar","anuncios","publicos"] } },
        },
        required: ["proposals","alerts","summary_text","plano_de_acao","campaigns_analysis"],
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
    campaigns_analysis?: CampaignAnalysis[];
  };

  const now_iso = new Date().toISOString();
  // Totais por ad-level; fallback para campaign-level quando não há linhas de
  // anúncio (ads pausados, posts impulsionados, fetch ad-level parcial) —
  // antes spend_7d/leads/ctr saíam 0 mesmo com gasto registrado em campanha.
  const useCampFallback = adMetrics.length === 0 && campaignData.length > 0;
  const totalSpend = useCampFallback
    ? campaignData.reduce((s, c) => s + c.spend, 0)
    : adMetrics.reduce((s, m) => s + m.spend, 0);
  const totalLeads = useCampFallback
    ? campaignData.reduce((s, c) => s + c.leads, 0)
    : adMetrics.reduce((s, m) => s + m.leads, 0);
  const totalWhatsapp = useCampFallback
    ? campaignData.reduce((s, c) => s + (c.whatsapp_conversations ?? 0), 0)
    : adMetrics.reduce((s, m) => s + m.whatsapp_conversations, 0);
  const avgCtr = useCampFallback
    ? (campaignData.length > 0 ? campaignData.reduce((s, c) => s + c.ctr, 0) / campaignData.length : 0)
    : (adMetrics.length > 0 ? adMetrics.reduce((s, m) => s + m.ctr, 0) / adMetrics.length : 0);
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

  // Drop "pausar" propostas cujo conjunto pai não está ACTIVE — pausar um ad
  // que já não entrega (conjunto PAUSED/ARCHIVED/DELETED) é no-op confuso. O
  // diagnóstico do Claude às vezes flagra esse caso mas insiste em pausar;
  // filtramos aqui para limpar a fila de ações do relatório.
  const adsetStatusMap = new Map(adsetData.map(a => [a.adset_id, a.status]));
  const proposalsClean = proposals.filter(p => {
    if (p.verdict !== "pausar") return true;
    const ad = adMetricsMap.get(p.ad_id);
    if (!ad) return true; // sem info do ad, manter conservador
    const adsetStatus = adsetStatusMap.get(ad.adset_id);
    if (adsetStatus && adsetStatus !== "ACTIVE") return false; // pai já não-ativo
    return true;
  });

  return {
    client_slug: client.slug,
    analyzed_at: now_iso,
    proposals: proposalsClean,
    alerts: (parsed.alerts ?? []).map(a => ({ ...a, id: randomUUID() })),
    summary_text: parsed.summary_text || defaultSummary,
    plano_de_acao: parsed.plano_de_acao ?? [],
    campaigns_analysis: parsed.campaigns_analysis ?? [],
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
