import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthFromRequest } from "@/lib/auth";
import { getClientBySlug } from "@/lib/clients";
import { getGoogleAdGroupInsights } from "@/lib/google-ads-api";
import type { GoogleAdMetrics, AnalysisResult, Proposal, Alert } from "@/types/metrics";
import { randomUUID } from "crypto";

export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
  const auth = await getAuthFromRequest(req);
  const cronKey = req.headers.get("x-cron-key");
  const validCron = cronKey && cronKey === process.env.CRON_SECRET;
  if (!auth && !validCron) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  let clientSlug: string;
  try {
    const body = await req.json();
    clientSlug = body.clientSlug;
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  if (!clientSlug) return NextResponse.json({ error: "clientSlug obrigatório" }, { status: 400 });

  const client = await getClientBySlug(clientSlug);
  if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  if (!client.google) return NextResponse.json({ error: "Cliente sem credenciais Google Ads" }, { status: 400 });

  const now = new Date();
  const dateTo = now.toISOString().split("T")[0];
  const dateFrom = new Date(now.setDate(now.getDate() - 7)).toISOString().split("T")[0];

  let adGroups: GoogleAdMetrics[] = [];
  try {
    adGroups = await getGoogleAdGroupInsights(client.google, dateFrom, dateTo);
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    const empty: AnalysisResult = {
      client_slug: clientSlug,
      analyzed_at: new Date().toISOString(),
      proposals: [],
      alerts: [{ id: randomUUID(), level: "critical", title: "Erro ao buscar dados do Google Ads", message: errMsg, entity_name: client.nome }],
      summary_text: `Erro ao buscar dados: ${errMsg}`,
    };
    return NextResponse.json(empty);
  }

  if (adGroups.length === 0) {
    const empty: AnalysisResult = {
      client_slug: clientSlug,
      analyzed_at: new Date().toISOString(),
      proposals: [],
      alerts: [{ id: randomUUID(), level: "info", title: "Sem dados suficientes", message: "Não há dados de grupos de anúncios ativos nos últimos 7 dias.", entity_name: client.nome }],
      summary_text: "Nenhum grupo de anúncios ativo encontrado nos últimos 7 dias.",
    };
    return NextResponse.json(empty);
  }

  const metricsText = adGroups.map(ag => `
Grupo de Anúncios: "${ag.ad_group_name}" (ID: ${ag.ad_group_id})
- Campanha: ${ag.campaign_name}
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
- CTR Display: 0,05% a 0,3% (alerta abaixo de 0,03%)
- Custo/Conversão: R$ 50 a R$ 150 (alerta acima de R$ 200)
- Taxa de conversão: 2% a 5% (alerta abaixo de 1%)

Período mínimo para decisão:
- Grupos novos: 5-7 dias antes de otimizar
- Não otimize antes do tempo

Vereditos possíveis: escalar | manter | testar_variacao | ajustar | pausar

IMPORTANTE: Responda APENAS via tool retornar_analise. Os campos ad_id e ad_name devem usar o ID e nome do grupo de anúncios.`;

  const userMessage = `Analise os seguintes grupos de anúncios do Google Ads dos últimos 7 dias e gere propostas de otimização:\n\n${metricsText}`;

  try {
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
        action: { type: "none" as const },
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

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Erro interno: ${msg}` }, { status: 500 });
  }
}
