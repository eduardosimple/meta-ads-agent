import { NextRequest, NextResponse } from "next/server";
import { getReport, saveReport } from "@/lib/reports-store";
import { getClientBySlug } from "@/lib/clients";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// POST /api/daily-reports/[slug]/proposals/generate-copy
// Body: { date, ad_id, platform }
export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const reportKey = req.headers.get("x-report-key");
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  const reportSecret = process.env.REPORT_VIEW_SECRET;
  const valid =
    (!!reportKey && !!reportSecret && reportKey === reportSecret) ||
    (!!authHeader && authHeader === `Bearer ${secret}`);
  if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { date: string; ad_id: string; platform: "meta" | "google" };
  const { date, ad_id, platform } = body;
  if (!date || !ad_id || !platform)
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const report = await getReport(params.slug, date);
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  const analysis = platform === "meta" ? report.meta : report.google;
  if (!analysis) return NextResponse.json({ error: "No platform data" }, { status: 404 });

  const propIdx = analysis.proposals.findIndex(p => p.ad_id === ad_id);
  if (propIdx === -1) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

  const proposal = analysis.proposals[propIdx];
  if (!["ajustar", "testar_variacao"].includes(proposal.verdict))
    return NextResponse.json({ error: "Apenas ajustar/testar_variacao suportam geração de copy" }, { status: 400 });

  if (proposal.verdict === "ajustar" && proposal.ajuste_tipo && proposal.ajuste_tipo !== "criativo")
    return NextResponse.json({ error: `ajuste_tipo="${proposal.ajuste_tipo}" não requer geração de copy — ação manual no Meta Ads` }, { status: 400 });

  const client = await getClientBySlug(params.slug);
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  // Try n8n webhook first (returns versao_a, versao_b, image_base64)
  let copy: { versao_a: { headline: string; texto: string; cta: string }; versao_b: { headline: string; texto: string; cta: string }; image_base64?: string } | null = null;

  try {
    const adData = platform === "meta" ? report.meta?.proposals.find(p => p.ad_id === ad_id) : null;
    const n8nRes = await fetch("https://n8n.mktsimple.com.br/webhook/criativo-reformulado", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cliente: params.slug,
        criativo_id: ad_id,
        ad_name: proposal.ad_name,
        veredito: proposal.verdict,
        problema: proposal.diagnostico,
        metricas: { ctr: 0, frequencia: 0, cpm: 0, cpl: 0 },
        objetivo: client.contexto.objetivo_padrao,
        contexto_cliente: `${client.contexto.segmento} ${client.contexto.cidade}/${client.contexto.estado}`,
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (n8nRes.ok) {
      const n8nData = await n8nRes.json() as { versao_a?: { headline: string; texto: string; cta: string }; versao_b?: { headline: string; texto: string; cta: string }; image_base64?: string };
      if (n8nData.versao_a && n8nData.versao_b) {
        copy = { versao_a: n8nData.versao_a, versao_b: n8nData.versao_b, image_base64: n8nData.image_base64 };
      }
    }
  } catch {
    // n8n unavailable — fall through to Haiku
  }

  // Fallback: generate text-only copy via Haiku
  if (!copy) {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: `Especialista em copy para Meta Ads. Segmento: ${client.contexto.segmento}. Praça: ${client.contexto.cidade}/${client.contexto.estado}. Público: ${client.contexto.publico_alvo}. Crie copies diretas, sem enrolação, que geram cliques.`,
      tools: [{
        name: "retornar_copy",
        description: "Retorna duas versões de copy para o anúncio",
        input_schema: {
          type: "object" as const,
          properties: {
            versao_a: { type: "object", properties: { headline: { type: "string" }, texto: { type: "string" }, cta: { type: "string" } }, required: ["headline","texto","cta"] },
            versao_b: { type: "object", properties: { headline: { type: "string" }, texto: { type: "string" }, cta: { type: "string" } }, required: ["headline","texto","cta"] },
          },
          required: ["versao_a","versao_b"],
        },
      }],
      tool_choice: { type: "tool", name: "retornar_copy" },
      messages: [{
        role: "user",
        content: `Anúncio: "${proposal.ad_name}"\nDiagnóstico: ${proposal.diagnostico}\nAção sugerida: ${proposal.acao_sugerida}\nVeredito: ${proposal.verdict === "ajustar" ? "Ajustar — versao_a corrige o problema; versao_b é variação com ângulo diferente." : "Testar variação — versao_a refina ângulo atual; versao_b testa ângulo diferente."}\nRegras: headline máx 40 chars, texto máx 125 chars, cta curto.`,
      }],
    });

    const toolUse = response.content.find(b => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use")
      return NextResponse.json({ error: "Falha ao gerar copy" }, { status: 500 });

    copy = toolUse.input as { versao_a: { headline: string; texto: string; cta: string }; versao_b: { headline: string; texto: string; cta: string } };
  }

  analysis.proposals[propIdx].copy_sugerida = copy;
  await saveReport(report);

  return NextResponse.json({ ok: true, copy_sugerida: copy });
}
