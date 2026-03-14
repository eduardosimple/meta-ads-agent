import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthFromRequest } from "@/lib/auth";
import { getClientBySlug } from "@/lib/clients";
import type { Client } from "@/types/client";
import fs from "fs";
import path from "path";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const META_API_VERSION = "v19.0";
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

function getClaudeMd(): string {
  try {
    const claudePath = path.join(process.cwd(), ".claude", "CLAUDE.md");
    return fs.readFileSync(claudePath, "utf-8");
  } catch {
    return "";
  }
}

async function buildSystemPrompt(clientSlug: string): Promise<string> {
  const claudeMd = getClaudeMd();
  const client = await getClientBySlug(clientSlug);

  let clientContext = "";
  if (client) {
    clientContext = `
## Cliente Ativo: ${client.nome}

**Conta de Anúncios:** ${client.meta.ad_account_id}
**Página:** ${client.meta.page_name} (ID: ${client.meta.page_id})
**App ID:** ${client.meta.app_id}

**Contexto do Cliente:**
- Segmento: ${client.contexto.segmento}
- Localização: ${client.contexto.cidade}, ${client.contexto.estado}
- Público-alvo: ${client.contexto.publico_alvo}
- Orçamento diário padrão: R$ ${(client.contexto.orcamento_diario_padrao / 100).toFixed(2)}
- Objetivo padrão: ${client.contexto.objetivo_padrao}
- Status: ${client.ativo ? "Ativo" : "Inativo"}
`;
  } else {
    clientContext =
      "\n## Nenhum cliente selecionado\nAguardando seleção de cliente para iniciar operações.\n";
  }

  const webInstructions = `
---

## INSTRUÇÕES DO AMBIENTE WEB

Você está rodando dentro de uma interface web com ferramentas (tools) que executam operações reais na Meta API.

**NUNCA use Bash, bash, curl, Read, ou qualquer ferramenta de sistema.** Você não tem acesso a terminal ou arquivos.

**Ferramentas disponíveis (use estas e somente estas):**
- \`buscar_cidade\` — busca o key de uma cidade para segmentação geográfica
- \`criar_campanha\` — cria campanha no Meta Ads (sempre PAUSED)
- \`criar_adset\` — cria conjunto de anúncios
- \`criar_criativo\` — cria criativo (copy + link)
- \`criar_anuncio\` — cria anúncio vinculando adset e criativo
- \`ativar_campanha\` — ativa campanha após aprovação explícita do usuário

**Fluxo obrigatório:**
1. \`buscar_cidade\` (se precisar segmentar por cidade)
2. \`criar_campanha\` → obtém campaign_id
3. \`criar_adset\` → obtém adset_id
4. \`criar_criativo\` → obtém creative_id
5. \`criar_anuncio\` → usa adset_id + creative_id
6. Apresenta resumo e pede aprovação → \`ativar_campanha\` apenas se aprovado

**As credenciais do cliente já estão no contexto — não precisa buscá-las.**
`;

  return `${claudeMd}\n\n${webInstructions}\n\n---\n${clientContext}`;
}

// ─── Tool definitions ────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: "buscar_cidade",
    description:
      "Busca o key de uma cidade brasileira para usar na segmentação geográfica do Meta Ads",
    input_schema: {
      type: "object" as const,
      properties: {
        nome: {
          type: "string",
          description: "Nome da cidade (ex: Chapecó, São Paulo)",
        },
      },
      required: ["nome"],
    },
  },
  {
    name: "criar_campanha",
    description: "Cria uma campanha no Meta Ads com status PAUSED",
    input_schema: {
      type: "object" as const,
      properties: {
        nome: { type: "string", description: "Nome da campanha" },
        objetivo: {
          type: "string",
          enum: [
            "OUTCOME_LEADS",
            "OUTCOME_TRAFFIC",
            "OUTCOME_SALES",
            "OUTCOME_AWARENESS",
          ],
          description: "Objetivo da campanha",
        },
        orcamento_diario_reais: {
          type: "number",
          description: "Orçamento diário em reais (ex: 50 para R$50)",
        },
        categoria_especial: {
          type: "string",
          enum: ["NONE", "HOUSING", "EMPLOYMENT", "CREDIT"],
          description:
            "Categoria especial de anúncio. Use HOUSING apenas para imóveis, NONE para todos os outros (padrão: NONE)",
        },
      },
      required: ["nome", "objetivo", "orcamento_diario_reais"],
    },
  },
  {
    name: "criar_adset",
    description: "Cria um conjunto de anúncios vinculado a uma campanha",
    input_schema: {
      type: "object" as const,
      properties: {
        nome: { type: "string", description: "Nome do conjunto de anúncios" },
        campaign_id: {
          type: "string",
          description: "ID da campanha criada anteriormente",
        },
        cidade_key: {
          type: "string",
          description: "Key da cidade obtida via buscar_cidade (opcional)",
        },
        raio_km: {
          type: "number",
          description: "Raio em km ao redor da cidade (padrão 10)",
        },
        idade_minima: {
          type: "number",
          description:
            "Idade mínima do público (18-65). Não use em campanhas HOUSING.",
        },
        idade_maxima: {
          type: "number",
          description:
            "Idade máxima do público (18-65). Não use em campanhas HOUSING.",
        },
        campaign_objetivo: {
          type: "string",
          enum: [
            "OUTCOME_LEADS",
            "OUTCOME_TRAFFIC",
            "OUTCOME_SALES",
            "OUTCOME_AWARENESS",
          ],
          description:
            "Objetivo da campanha pai. Usado para derivar o optimization_goal correto automaticamente.",
        },
        objetivo_otimizacao: {
          type: "string",
          description:
            "Sobrescreve o optimization_goal derivado. Use apenas se souber o valor exato.",
        },
        page_id: {
          type: "string",
          description:
            "ID da página Facebook. Incluído automaticamente para OUTCOME_LEADS.",
        },
      },
      required: ["nome", "campaign_id", "campaign_objetivo"],
    },
  },
  {
    name: "criar_criativo",
    description: "Cria um criativo de anúncio com copy e link de destino",
    input_schema: {
      type: "object" as const,
      properties: {
        nome: { type: "string", description: "Nome do criativo" },
        link: { type: "string", description: "URL de destino do anúncio" },
        titulo: { type: "string", description: "Título do anúncio" },
        texto: {
          type: "string",
          description: "Texto principal (body copy) do anúncio",
        },
        descricao: {
          type: "string",
          description: "Descrição adicional (opcional)",
        },
        cta: {
          type: "string",
          enum: [
            "LEARN_MORE",
            "SIGN_UP",
            "CONTACT_US",
            "GET_QUOTE",
            "DOWNLOAD",
            "SHOP_NOW",
          ],
          description: "Tipo de call-to-action",
        },
        image_hash: {
          type: "string",
          description: "Hash da imagem carregada (opcional)",
        },
        formato: {
          type: "string",
          enum: ["image", "carousel"],
          description: "Formato do criativo (padrão: image)",
        },
      },
      required: ["nome", "link", "titulo", "texto", "cta"],
    },
  },
  {
    name: "criar_anuncio",
    description: "Cria um anúncio vinculando conjunto de anúncios e criativo",
    input_schema: {
      type: "object" as const,
      properties: {
        nome: { type: "string", description: "Nome do anúncio" },
        adset_id: { type: "string", description: "ID do conjunto de anúncios" },
        creative_id: { type: "string", description: "ID do criativo" },
      },
      required: ["nome", "adset_id", "creative_id"],
    },
  },
  {
    name: "ativar_campanha",
    description:
      "Ativa uma campanha (PAUSED → ACTIVE). Só usar após aprovação explícita do usuário.",
    input_schema: {
      type: "object" as const,
      properties: {
        campaign_id: {
          type: "string",
          description: "ID da campanha a ativar",
        },
      },
      required: ["campaign_id"],
    },
  },
];

// ─── Tool execution ──────────────────────────────────────────────────────────

function metaError(
  err: { message?: string; code?: number; error_subcode?: number; error_user_msg?: string } | undefined,
  fallback: string
): string {
  if (!err) return fallback;
  const parts: string[] = [];
  if (err.message) parts.push(err.message);
  if (err.error_user_msg && err.error_user_msg !== err.message)
    parts.push(`(${err.error_user_msg})`);
  if (err.code) parts.push(`[code ${err.code}${err.error_subcode ? `.${err.error_subcode}` : ""}]`);
  return parts.length ? parts.join(" ") : fallback;
}

async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  client: Client
): Promise<unknown> {
  const accessToken = client.meta.access_token;
  const adAccountId = client.meta.ad_account_id;

  switch (toolName) {
    case "buscar_cidade": {
      const query = encodeURIComponent(String(input.nome));
      const url = `${META_API_BASE}/search?type=adgeolocation&q=${query}&location_types=%5B%22city%22%5D&country_code=BR&access_token=${accessToken}`;
      const res = await fetch(url);
      const data = (await res.json()) as {
        data?: Array<{ key: string; name: string; region: string }>;
      };
      if (data.data && data.data.length > 0) {
        const top = data.data.slice(0, 3).map((c) => ({
          key: c.key,
          nome: c.name,
          estado: c.region,
        }));
        return { cidades: top, recomendado: top[0] };
      }
      return {
        erro: "Cidade não encontrada",
        sugestao: "Tente sem acentos ou verifique o nome",
      };
    }

    case "criar_campanha": {
      const specialCat = String(input.categoria_especial ?? "NONE");
      const payload = {
        name: input.nome,
        objective: input.objetivo,
        status: "PAUSED",
        special_ad_categories:
          specialCat === "NONE" ? [] : [specialCat],
        daily_budget: String(
          Math.round((input.orcamento_diario_reais as number) * 100)
        ),
        access_token: accessToken,
      };
      const res = await fetch(`${META_API_BASE}/${adAccountId}/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        id?: string;
        error?: { message: string; code?: number; error_subcode?: number; error_user_msg?: string };
      };
      if (!res.ok || data.error)
        throw new Error(metaError(data.error, "Erro ao criar campanha"));
      return { campaign_id: data.id, nome: input.nome, status: "PAUSED" };
    }

    case "criar_adset": {
      // Only include age if explicitly provided — HOUSING campaigns forbid age targeting
      const targetingSpec: Record<string, unknown> = {};
      if (input.idade_minima) targetingSpec.age_min = input.idade_minima;
      if (input.idade_maxima) targetingSpec.age_max = input.idade_maxima;

      if (input.cidade_key) {
        targetingSpec.geo_locations = {
          cities: [
            {
              key: input.cidade_key,
              radius: input.raio_km ?? 10,
              distance_unit: "kilometer",
            },
          ],
        };
      } else {
        targetingSpec.geo_locations = { countries: ["BR"] };
      }

      // Derive optimization_goal from campaign objective unless overridden
      const objectiveGoalMap: Record<string, string> = {
        OUTCOME_LEADS: "LEAD_GENERATION",
        OUTCOME_TRAFFIC: "LINK_CLICKS",
        OUTCOME_SALES: "OFFSITE_CONVERSIONS",
        OUTCOME_AWARENESS: "REACH",
      };
      const campaignObj = String(input.campaign_objetivo ?? "OUTCOME_TRAFFIC");
      const optGoal = String(
        input.objetivo_otimizacao ?? objectiveGoalMap[campaignObj] ?? "LINK_CLICKS"
      );

      const adsetPayload: Record<string, unknown> = {
        name: input.nome,
        campaign_id: input.campaign_id,
        status: "PAUSED",
        optimization_goal: optGoal,
        billing_event: "IMPRESSIONS",
        targeting: targetingSpec,
        access_token: accessToken,
      };

      // promoted_object required only for LEAD_GENERATION (OUTCOME_LEADS)
      if (optGoal === "LEAD_GENERATION") {
        const pageId = String(input.page_id ?? client.meta.page_id);
        adsetPayload.promoted_object = { page_id: pageId };
      }

      const payloadToSend = { ...adsetPayload };
      // Never log access_token
      const logPayload = { ...payloadToSend, access_token: "[redacted]" };
      console.log("[criar_adset] payload:", JSON.stringify(logPayload, null, 2));

      const res = await fetch(`${META_API_BASE}/${adAccountId}/adsets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadToSend),
      });
      const rawText = await res.text();
      console.log("[criar_adset] meta response:", rawText);

      let data: { id?: string; error?: { message: string; code?: number; error_subcode?: number; error_user_msg?: string; error_data?: unknown } };
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error(`Meta API resposta inválida: ${rawText}`);
      }

      if (!res.ok || data.error) {
        const errMsg = metaError(data.error, "Erro ao criar adset");
        // Return full error details so agent can diagnose
        throw new Error(`${errMsg} | payload: ${JSON.stringify(logPayload)}`);
      }
      return { adset_id: data.id, nome: input.nome, status: "PAUSED" };
    }

    case "criar_criativo": {
      const linkData: Record<string, unknown> = {
        link: input.link,
        message: input.texto,
        name: input.titulo,
        description: input.descricao ?? "",
        call_to_action: { type: input.cta, value: { link: input.link } },
      };
      if (input.image_hash) linkData.image_hash = input.image_hash;
      const payload = {
        name: input.nome,
        object_story_spec: {
          page_id: client.meta.page_id,
          link_data: linkData,
        },
        access_token: accessToken,
      };
      const res = await fetch(
        `${META_API_BASE}/${adAccountId}/adcreatives`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = (await res.json()) as {
        id?: string;
        error?: { message: string; code?: number; error_subcode?: number; error_user_msg?: string };
      };
      if (!res.ok || data.error)
        throw new Error(metaError(data.error, "Erro ao criar criativo"));
      return { creative_id: data.id, nome: input.nome };
    }

    case "criar_anuncio": {
      const payload = {
        name: input.nome,
        adset_id: input.adset_id,
        creative: { creative_id: input.creative_id },
        status: "PAUSED",
        access_token: accessToken,
      };
      const res = await fetch(`${META_API_BASE}/${adAccountId}/ads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        id?: string;
        error?: { message: string; code?: number; error_subcode?: number; error_user_msg?: string };
      };
      if (!res.ok || data.error)
        throw new Error(metaError(data.error, "Erro ao criar anúncio"));
      return { ad_id: data.id, nome: input.nome, status: "PAUSED" };
    }

    case "ativar_campanha": {
      const res = await fetch(`${META_API_BASE}/${input.campaign_id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ACTIVE", access_token: accessToken }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        error?: { message: string; code?: number; error_subcode?: number; error_user_msg?: string };
      };
      if (!res.ok || data.error)
        throw new Error(metaError(data.error, "Erro ao ativar campanha"));
      return { campaign_id: input.campaign_id, status: "ACTIVE", sucesso: true };
    }

    default:
      throw new Error(`Ferramenta desconhecida: ${toolName}`);
  }
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { message, clientSlug, history } = await req.json();

  if (!message) {
    return NextResponse.json({ error: "Mensagem obrigatória" }, { status: 400 });
  }

  const client = clientSlug ? await getClientBySlug(clientSlug) : null;

  try {
    const systemPrompt = await buildSystemPrompt(clientSlug ?? "");

    const initialMessages: Anthropic.MessageParam[] = [
      ...(history ?? []).map((h: { role: string; content: string }) => ({
        role: h.role as "user" | "assistant",
        content: h.content,
      })),
      { role: "user" as const, content: message },
    ];

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          const messages: Anthropic.MessageParam[] = [...initialMessages];

          // Agent loop — handles multi-turn tool use
          while (true) {
            const stream = anthropic.messages.stream({
              model: "claude-sonnet-4-6",
              max_tokens: 4096,
              system: systemPrompt,
              tools: client ? TOOLS : [],
              messages,
            });

            // Stream text chunks to the client as they arrive
            for await (const chunk of stream) {
              if (
                chunk.type === "content_block_delta" &&
                chunk.delta.type === "text_delta"
              ) {
                controller.enqueue(encoder.encode(chunk.delta.text));
              }
            }

            const finalMsg = await stream.finalMessage();

            if (finalMsg.stop_reason === "tool_use") {
              // Append assistant turn with all content blocks
              messages.push({ role: "assistant", content: finalMsg.content });

              // Execute each tool call and collect results
              const toolResults: Anthropic.ToolResultBlockParam[] = [];

              for (const block of finalMsg.content) {
                if (block.type !== "tool_use") continue;

                controller.enqueue(
                  encoder.encode(`\n\n_🔧 Executando \`${block.name}\`..._\n\n`)
                );

                try {
                  if (!client) throw new Error("Nenhum cliente selecionado");
                  const result = await executeTool(
                    block.name,
                    block.input as Record<string, unknown>,
                    client
                  );
                  toolResults.push({
                    type: "tool_result",
                    tool_use_id: block.id,
                    content: JSON.stringify(result),
                  });
                } catch (err) {
                  const msg =
                    err instanceof Error ? err.message : "Erro na ferramenta";
                  toolResults.push({
                    type: "tool_result",
                    tool_use_id: block.id,
                    content: JSON.stringify({ erro: msg }),
                    is_error: true,
                  });
                }
              }

              messages.push({ role: "user", content: toolResults });
              // Continue agent loop with tool results
            } else {
              // stop_reason === "end_turn" — done
              break;
            }
          }

          controller.close();
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Erro interno";
          console.error("[chat] stream error:", msg);
          controller.enqueue(encoder.encode(`\n\n⚠️ Erro: ${msg}`));
          controller.close();
        }
      },
    });

    return new NextResponse(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    console.error("[chat] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
