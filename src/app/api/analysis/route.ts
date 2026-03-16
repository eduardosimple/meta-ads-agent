import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthFromRequest } from "@/lib/auth";
import { getClientBySlug } from "@/lib/clients";
import { getAdInsights } from "@/lib/meta-api";
import type { AdMetrics, AnalysisResult, Proposal, Alert } from "@/types/metrics";
import { randomUUID } from "crypto";

export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  const cronKey = req.headers.get("x-cron-key");
  const validCron = cronKey && cronKey === process.env.CRON_SECRET;
  if (!auth && !validCron) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { clientSlug } = await req.json();
  if (!clientSlug) return NextResponse.json({ error: "clientSlug obrigatório" }, { status: 400 });

  const client = await getClientBySlug(clientSlug);
  if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  const now = new Date();
  const dateTo = now.toISOString().split("T")[0];
  const dateFrom = new Date(now.setDate(now.getDate() - 7)).toISOString().split("T")[0];

  let adMetrics: AdMetrics[] = [];
  try {
    adMetrics = await getAdInsights(client.meta.ad_account_id, client.meta.access_token, dateFrom, dateTo);
  } catch {
    const empty: AnalysisResult = {
      client_slug: clientSlug,
      analyzed_at: new Date().toISOString(),
      proposals: [],
      alerts: [{ id: randomUUID(), level: "info", title: "Sem dados suficientes", message: "Não há dados de anúncios ativos nos últimos 7 dias.", entity_name: client.nome }],
      summary_text: "Nenhum anúncio ativo encontrado nos últimos 7 dias."
    };
    return NextResponse.json(empty);
  }

  if (adMetrics.length === 0) {
    const empty: AnalysisResult = {
      client_slug: clientSlug,
      analyzed_at: new Date().toISOString(),
      proposals: [],
      alerts: [{ id: randomUUID(), level: "info", title: "Sem dados suficientes", message: "Não há dados de anúncios ativos nos últimos 7 dias.", entity_name: client.nome }],
      summary_text: "Nenhum anúncio ativo encontrado nos últimos 7 dias."
    };
    return NextResponse.json(empty);
  }

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

IMPORTANTE: Responda APENAS com um JSON válido, sem texto antes ou depois, seguindo exatamente este formato:
{
  "proposals": [
    {
      "ad_id": "string",
      "ad_name": "string",
      "adset_name": "string",
      "campaign_name": "string",
      "verdict": "escalar|manter|testar_variacao|ajustar|pausar",
      "titulo": "string curto ex: CTR abaixo do benchmark",
      "diagnostico": "string explicando o problema ou oportunidade",
      "metricas_problema": ["ex: CTR 0.5% (benchmark: 1%)", "CPM R$25 (acima do limite)"],
      "acao_sugerida": "string descrevendo a ação recomendada",
      "action": {"type": "none"}
    }
  ],
  "alerts": [
    {
      "level": "info|warning|critical",
      "title": "string",
      "message": "string",
      "entity_name": "string"
    }
  ],
  "summary_text": "string com resumo geral de 2-3 frases"
}

Para actions:
- Se verdict=pausar: {"type": "pause_ad", "ad_id": "ID_DO_ANUNCIO"}
- Se verdict=escalar: {"type": "scale_budget", "adset_id": "ID_DO_ADSET", "new_budget_cents": VALOR_EM_CENTAVOS}
- Caso contrário: {"type": "none"}`;

  const userMessage = `Analise os seguintes anúncios dos últimos 7 dias e gere propostas de otimização:\n\n${metricsText}`;

  try {
    // Use tool_use to force structured JSON output — avoids JSON parsing errors
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
            proposals: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  ad_id: { type: "string" },
                  ad_name: { type: "string" },
                  adset_name: { type: "string" },
                  campaign_name: { type: "string" },
                  verdict: { type: "string", enum: ["escalar", "manter", "testar_variacao", "ajustar", "pausar"] },
                  titulo: { type: "string" },
                  diagnostico: { type: "string" },
                  metricas_problema: { type: "array", items: { type: "string" } },
                  acao_sugerida: { type: "string" },
                  action: { type: "object" },
                },
                required: ["ad_id", "ad_name", "adset_name", "campaign_name", "verdict", "titulo", "diagnostico", "metricas_problema", "acao_sugerida", "action"],
              },
            },
            alerts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  level: { type: "string", enum: ["info", "warning", "critical"] },
                  title: { type: "string" },
                  message: { type: "string" },
                  entity_name: { type: "string" },
                },
                required: ["level", "title", "message", "entity_name"],
              },
            },
            summary_text: { type: "string" },
          },
          required: ["proposals", "alerts", "summary_text"],
        },
      }],
      tool_choice: { type: "tool", name: "retornar_analise" },
      messages: [{ role: "user", content: userMessage }],
    });

    const toolUse = response.content.find(b => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") throw new Error("Claude não retornou análise estruturada");

    const parsed = toolUse.input as {
      proposals: Array<Omit<Proposal, "id" | "status" | "created_at">>;
      alerts: Array<Omit<Alert, "id">>;
      summary_text: string;
    };

    const now_iso = new Date().toISOString();
    const result: AnalysisResult = {
      client_slug: clientSlug,
      analyzed_at: now_iso,
      proposals: (parsed.proposals ?? []).map(p => ({
        ...p,
        id: randomUUID(),
        status: "pending" as const,
        created_at: now_iso,
      })),
      alerts: (parsed.alerts ?? []).map(a => ({ ...a, id: randomUUID() })),
      summary_text: parsed.summary_text ?? "",
    };

    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro na análise";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
