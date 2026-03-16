import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthFromRequest } from "@/lib/auth";
import { getClientBySlug } from "@/lib/clients";
import { getGoogleCampaignsWithMetrics, setGoogleCampaignBudgetAmount, setGoogleCampaignStatus, pauseGoogleAdGroup } from "@/lib/google-ads-api";
import type { Client } from "@/types/client";
import fs from "fs";
import path from "path";

export const maxDuration = 60;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});
console.log("[chat] ANTHROPIC_API_KEY set:", !!process.env.ANTHROPIC_API_KEY, "length:", process.env.ANTHROPIC_API_KEY?.length ?? 0);

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

**Meta Ads — Conta de Anúncios:** ${client.meta.ad_account_id}
**Página:** ${client.meta.page_name} (ID: ${client.meta.page_id})
**App ID:** ${client.meta.app_id}
${client.google ? `\n**Google Ads — Customer ID:** ${client.google.customer_id}` : ""}

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

  const hasGoogle = !!client?.google;

  const webInstructions = `
---

## INSTRUÇÕES DO AMBIENTE WEB

Você está rodando dentro de uma interface web com ferramentas (tools) que executam operações reais nas APIs de anúncios.

**NUNCA use Bash, bash, curl, Read, ou qualquer ferramenta de sistema.** Você não tem acesso a terminal ou arquivos.

**Ferramentas Meta Ads disponíveis:**
- \`fazer_upload_imagem\` — baixa imagem de URL pública e faz upload para Meta (retorna image_hash)
- \`buscar_cidade\` — busca o key de uma cidade para segmentação geográfica
- \`criar_campanha\` — cria campanha no Meta Ads (sempre PAUSED)
- \`criar_adset\` — cria conjunto de anúncios
- \`criar_criativo\` — cria criativo (copy + link + imagem opcional)
- \`criar_anuncio\` — cria anúncio vinculando adset e criativo
- \`ativar_campanha\` — ativa campanha após aprovação explícita do usuário
${hasGoogle ? `
**Ferramentas Google Ads disponíveis:**
- \`listar_campanhas_google\` — lista campanhas Google Ads com métricas dos últimos 7 dias
- \`ajustar_orcamento_google\` — define o orçamento diário de uma campanha Google Ads
- \`pausar_campanha_google\` — pausa uma campanha Google Ads
- \`ativar_campanha_google\` — ativa uma campanha Google Ads
- \`pausar_grupo_anuncios_google\` — pausa um grupo de anúncios Google Ads

**Para operações Google Ads:** use \`listar_campanhas_google\` primeiro para obter os IDs das campanhas quando o usuário não especificar o ID.
` : ""}

**Fluxo obrigatório para criar campanha Meta:**
1. \`buscar_cidade\` (se precisar segmentar por cidade)
2. \`fazer_upload_imagem\` (se houver imagem — antes de criar o criativo)
3. \`criar_campanha\` → obtém campaign_id
4. \`criar_adset\` → obtém adset_id
5. \`criar_criativo\` → usa image_hash se disponível → obtém creative_id
6. \`criar_anuncio\` → usa adset_id + creative_id
7. Apresenta resumo e pede aprovação → \`ativar_campanha\` apenas se aprovado

**As credenciais do cliente já estão no contexto — não precisa buscá-las.**
`;

  return `${claudeMd}\n\n${webInstructions}\n\n---\n${clientContext}`;
}

// ─── Tool definitions ────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: "fazer_upload_imagem",
    description: "Baixa uma imagem de uma URL pública (Google Drive, S3, etc.) e faz upload para a conta de anúncios da Meta. Retorna o image_hash para usar no criativo.",
    input_schema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "URL pública da imagem. Para Google Drive, usar o formato: https://drive.google.com/uc?export=download&id=FILE_ID",
        },
      },
      required: ["url"],
    },
  },
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
        categoria_especial: {
          type: "string",
          enum: ["NONE", "HOUSING", "EMPLOYMENT", "CREDIT"],
          description:
            "Categoria especial de anúncio. Use HOUSING apenas para imóveis, NONE para todos os outros (padrão: NONE)",
        },
        orcamento_diario_reais: {
          type: "number",
          description: "Orçamento diário em reais (ex: 50 para R$50). Obrigatório.",
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
        orcamento_diario_reais: {
          type: "number",
          description: "Orçamento diário em reais (ex: 50 para R$50). Obrigatório.",
        },
        page_id: {
          type: "string",
          description:
            "ID da página Facebook. Incluído automaticamente para OUTCOME_LEADS.",
        },
      },
      required: ["nome", "campaign_id", "campaign_objetivo", "orcamento_diario_reais"],
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
        campaign_id: { type: "string", description: "ID da campanha a ativar" },
      },
      required: ["campaign_id"],
    },
  },
  // ── Google Ads tools ──
  {
    name: "listar_campanhas_google",
    description: "Lista todas as campanhas Google Ads do cliente com métricas agregadas dos últimos 7 dias (gasto, cliques, CTR, conversões, custo/conversão). Use para obter IDs de campanhas antes de outras operações.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "ajustar_orcamento_google",
    description: "Define o orçamento diário de uma campanha Google Ads para um valor específico em reais. Requer confirmação do usuário antes de executar.",
    input_schema: {
      type: "object" as const,
      properties: {
        campaign_id: { type: "string", description: "ID numérico da campanha Google Ads" },
        campaign_name: { type: "string", description: "Nome da campanha (para confirmação)" },
        orcamento_diario_reais: { type: "number", description: "Novo orçamento diário em reais (ex: 30 para R$30,00)" },
      },
      required: ["campaign_id", "campaign_name", "orcamento_diario_reais"],
    },
  },
  {
    name: "pausar_campanha_google",
    description: "Pausa uma campanha Google Ads. Requer confirmação do usuário antes de executar.",
    input_schema: {
      type: "object" as const,
      properties: {
        campaign_id: { type: "string", description: "ID numérico da campanha Google Ads" },
        campaign_name: { type: "string", description: "Nome da campanha (para confirmação)" },
      },
      required: ["campaign_id", "campaign_name"],
    },
  },
  {
    name: "ativar_campanha_google",
    description: "Ativa uma campanha Google Ads pausada. Requer confirmação do usuário antes de executar.",
    input_schema: {
      type: "object" as const,
      properties: {
        campaign_id: { type: "string", description: "ID numérico da campanha Google Ads" },
        campaign_name: { type: "string", description: "Nome da campanha (para confirmação)" },
      },
      required: ["campaign_id", "campaign_name"],
    },
  },
  {
    name: "pausar_grupo_anuncios_google",
    description: "Pausa um grupo de anúncios Google Ads. Requer confirmação do usuário antes de executar.",
    input_schema: {
      type: "object" as const,
      properties: {
        ad_group_id: { type: "string", description: "ID numérico do grupo de anúncios" },
        ad_group_name: { type: "string", description: "Nome do grupo (para confirmação)" },
      },
      required: ["ad_group_id", "ad_group_name"],
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
    case "fazer_upload_imagem": {
      const imageUrl = String(input.url).replace("export=view", "export=download");
      const imgRes = await fetch(imageUrl, { redirect: "follow" });
      if (!imgRes.ok) throw new Error(`Falha ao baixar imagem: HTTP ${imgRes.status}`);
      const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
      const buffer = await imgRes.arrayBuffer();
      const ext = contentType.includes("png") ? "png" : contentType.includes("gif") ? "gif" : "jpg";
      const metaForm = new FormData();
      metaForm.append("access_token", accessToken);
      metaForm.append("filename", new File([buffer], `upload.${ext}`, { type: contentType }), `upload.${ext}`);
      const upRes = await fetch(`${META_API_BASE}/${adAccountId}/adimages`, { method: "POST", body: metaForm });
      const upData = await upRes.json() as { images?: Record<string, { hash: string; url: string }>; error?: { message: string } };
      if (!upRes.ok || upData.error) throw new Error(upData.error?.message ?? "Erro no upload da imagem");
      const imageKey = Object.keys(upData.images!)[0];
      const { hash, url: metaUrl } = upData.images![imageKey];
      return { image_hash: hash, url: metaUrl };
    }

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
      const dailyBudgetReais = Number(input.orcamento_diario_reais ?? 10);
      // ABO: budget on adset, is_adset_budget_sharing_enabled=false, no campaign budget
      const formData = new URLSearchParams();
      formData.set("name", String(input.nome));
      formData.set("objective", String(input.objetivo));
      formData.set("status", "PAUSED");
      formData.set("special_ad_categories", JSON.stringify(specialCat === "NONE" ? [] : [specialCat]));
      formData.set("is_adset_budget_sharing_enabled", "false");
      formData.set("access_token", accessToken);
      console.log("[criar_campanha] form params:", formData.toString().replace(accessToken, "[redacted]"));
      const res = await fetch(`${META_API_BASE}/${adAccountId}/campaigns`, {
        method: "POST",
        body: formData,
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
        // Meta requires minimum 25km radius for Brazilian cities
        const radius = Math.max(Number(input.raio_km ?? 25), 25);
        targetingSpec.geo_locations = {
          cities: [
            {
              key: input.cidade_key,
              radius,
              distance_unit: "kilometer",
            },
          ],
        };
      } else {
        targetingSpec.geo_locations = { countries: ["BR"] };
      }

      // Required by Meta: explicitly enable or disable Advantage Audience
      targetingSpec.targeting_automation = { advantage_audience: 0 };

      // Derive optimization_goal from campaign objective unless overridden
      // OUTCOME_SALES uses LINK_CLICKS to avoid bid strategy requirements
      const objectiveGoalMap: Record<string, string> = {
        OUTCOME_LEADS: "LEAD_GENERATION",
        OUTCOME_TRAFFIC: "LINK_CLICKS",
        OUTCOME_SALES: "LINK_CLICKS",
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
        bid_strategy: "LOWEST_COST_WITHOUT_CAP",
        daily_budget: String(Math.round(Math.max(Number(input.orcamento_diario_reais) || 10, 6) * 100)),
        targeting: targetingSpec,
        access_token: accessToken,
      };

      // destination_type required for OUTCOME_TRAFFIC
      if (campaignObj === "OUTCOME_TRAFFIC") {
        adsetPayload.destination_type = "WEBSITE";
      }

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
        // Return full Meta API error as-is so it propagates to the chat
        throw new Error(`META_API_ERROR: ${rawText} | PAYLOAD: ${JSON.stringify(logPayload)}`);
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

    // ── Google Ads tools ──
    case "listar_campanhas_google": {
      if (!client.google) throw new Error("Cliente sem credenciais Google Ads");
      const now = new Date();
      const dateTo = now.toISOString().split("T")[0];
      const dateFrom = new Date(now.setDate(now.getDate() - 7)).toISOString().split("T")[0];
      const campaigns = await getGoogleCampaignsWithMetrics(client.google, dateFrom, dateTo);
      return { campaigns: campaigns.map(c => ({
        id: c.id, name: c.name, status: c.status,
        gasto: `R$ ${c.spend.toFixed(2)}`, cliques: c.clicks,
        ctr: `${c.ctr.toFixed(2)}%`, cpc: c.cpc > 0 ? `R$ ${c.cpc.toFixed(2)}` : "—",
        conversoes: c.conversions.toFixed(1),
        custo_por_conversao: c.cost_per_conversion > 0 ? `R$ ${c.cost_per_conversion.toFixed(2)}` : "—",
      })) };
    }

    case "ajustar_orcamento_google": {
      if (!client.google) throw new Error("Cliente sem credenciais Google Ads");
      const result = await setGoogleCampaignBudgetAmount(client.google, String(input.campaign_id), Number(input.orcamento_diario_reais));
      return { sucesso: true, campanha: input.campaign_name, orcamento_anterior: `R$ ${result.old_budget.toFixed(2)}/dia`, orcamento_novo: `R$ ${result.new_budget.toFixed(2)}/dia` };
    }

    case "pausar_campanha_google": {
      if (!client.google) throw new Error("Cliente sem credenciais Google Ads");
      await setGoogleCampaignStatus(client.google, String(input.campaign_id), "PAUSED");
      return { sucesso: true, campanha: input.campaign_name, status: "PAUSED" };
    }

    case "ativar_campanha_google": {
      if (!client.google) throw new Error("Cliente sem credenciais Google Ads");
      await setGoogleCampaignStatus(client.google, String(input.campaign_id), "ENABLED");
      return { sucesso: true, campanha: input.campaign_name, status: "ENABLED" };
    }

    case "pausar_grupo_anuncios_google": {
      if (!client.google) throw new Error("Cliente sem credenciais Google Ads");
      await pauseGoogleAdGroup(client.google, String(input.ad_group_id));
      return { sucesso: true, grupo: input.ad_group_name, status: "PAUSED" };
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
              tools: client ? (client.google ? TOOLS : TOOLS.filter(t => !t.name.endsWith("_google"))) : [],
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
                  // Emit raw error directly to stream so user sees it verbatim
                  controller.enqueue(
                    encoder.encode(`\n\n\`\`\`\nERRO_RAW: ${msg.slice(0, 800)}\n\`\`\`\n\n`)
                  );
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
          const msg = err instanceof Error ? err.message : String(err);
          const detail = err instanceof Error && err.cause ? ` | cause: ${JSON.stringify(err.cause)}` : "";
          console.error("[chat] stream error:", msg, detail);
          controller.enqueue(encoder.encode(`\n\n⚠️ Erro: ${msg}${detail}`));
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
