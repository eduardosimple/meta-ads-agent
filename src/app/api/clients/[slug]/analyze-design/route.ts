import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getClientBySlug } from "@/lib/clients";
import { getAdCreativeId, getCreativeThumbnail } from "@/lib/meta-api";
import { saveDesignBrief } from "@/lib/design-briefs";

export const maxDuration = 60;

// POST /api/clients/[slug]/analyze-design
// Body: { ad_id: string }  — the best-performing ad to analyze
export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const cronKey = req.headers.get("x-cron-key");
  const reportKey = req.headers.get("x-report-key");
  const secret = process.env.CRON_SECRET;
  const reportSecret = process.env.REPORT_VIEW_SECRET;
  const valid =
    (cronKey && cronKey === secret) ||
    (reportKey && reportSecret && reportKey === reportSecret);
  if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ad_id } = await req.json() as { ad_id: string };
  if (!ad_id) return NextResponse.json({ error: "ad_id required" }, { status: 400 });

  const client = await getClientBySlug(params.slug);
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const { access_token } = client.meta;

  // 1. Get creative_id from ad
  let thumbnailUrl: string | null = null;
  let creativeType = "unknown";
  try {
    const creativeId = await getAdCreativeId(ad_id, access_token);
    if (creativeId) {
      const { thumbnail_url, type } = await getCreativeThumbnail(creativeId, access_token);
      thumbnailUrl = thumbnail_url;
      creativeType = type;
    }
  } catch (e) {
    console.error("Meta API error fetching creative:", e);
  }

  // 2. Analyze with Claude Vision (or text-only if no thumbnail)
  const anthropic = new Anthropic();

  const systemPrompt = `Você é um especialista em design de criativos para Meta Ads.
Analise o criativo fornecido e extraia as diretrizes de design em JSON estruturado.
Foque em: cores, tipografia, composição, estilo visual e o que faz esse criativo performar bem.
Retorne SOMENTE JSON válido.`;

  const analysisPrompt = `Analise este criativo de alto desempenho para o cliente "${client.nome}" (${client.contexto.segmento}, ${client.contexto.cidade}).

${thumbnailUrl ? "Veja a imagem do criativo e extraia:" : "Baseado no segmento e contexto, sugira diretrizes de design:"}

1. cores_dominantes: array com hex das 3 cores principais
2. estilo_fundo: "foto_produto" | "foto_pessoa" | "gradiente" | "solido" | "textura" | "misto"
3. tipografia: descrição do estilo (ex: "bold branco grande, subtítulo cinza claro")
4. composicao: descrição do layout (ex: "imagem à direita, texto à esquerda, CTA amarelo no rodapé")
5. elementos_visuais: array de elementos presentes (logo, ícones, produto, pessoa, etc.)
6. tom_visual: "profissional" | "dinamico" | "acolhedor" | "urgente" | "aspiracional"
7. diretriz_para_novos: 2-3 frases com orientações para criar novos criativos que replicam o estilo

JSON esperado:
{"cores_dominantes":[],"estilo_fundo":"","tipografia":"","composicao":"","elementos_visuais":[],"tom_visual":"","diretriz_para_novos":""}`;

  let analysis: DesignAnalysis;
  try {
    const messages: Anthropic.MessageParam[] = [];

    if (thumbnailUrl) {
      // Download thumbnail and encode as base64
      const imgRes = await fetch(thumbnailUrl);
      if (imgRes.ok) {
        const imgBuf = Buffer.from(await imgRes.arrayBuffer());
        const b64 = imgBuf.toString("base64");
        const mimeType = imgRes.headers.get("content-type") ?? "image/jpeg";
        messages.push({
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                data: b64,
              },
            },
            { type: "text", text: analysisPrompt },
          ],
        });
      }
    }

    if (messages.length === 0) {
      messages.push({ role: "user", content: analysisPrompt });
    }

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    const text = response.content.find(b => b.type === "text")?.text ?? "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    analysis = JSON.parse(jsonMatch?.[0] ?? "{}") as DesignAnalysis;
  } catch (e) {
    return NextResponse.json({ error: `Claude analysis failed: ${e}` }, { status: 500 });
  }

  // 3. Save to Supabase
  const brief = {
    client_slug: params.slug,
    updated_at: new Date().toISOString(),
    source_ad_id: ad_id,
    source_ad_name: `ad_${ad_id}`,
    thumbnail_url: thumbnailUrl,
    analysis,
  };

  await saveDesignBrief(brief);

  return NextResponse.json({ ok: true, brief });
}

interface DesignAnalysis {
  cores_dominantes: string[];
  estilo_fundo: string;
  tipografia: string;
  composicao: string;
  elementos_visuais: string[];
  tom_visual: string;
  diretriz_para_novos: string;
}
