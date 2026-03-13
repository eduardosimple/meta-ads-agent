import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthFromRequest } from "@/lib/auth";
import { getClientBySlug } from "@/lib/clients";
import fs from "fs";
import path from "path";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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
    clientContext = "\n## Nenhum cliente selecionado\nAguardando seleção de cliente para iniciar operações.\n";
  }

  const webInstructions = `
---

## INSTRUÇÕES DO AMBIENTE WEB

Você está rodando como agente dentro de uma interface web — NÃO tem acesso a terminal, bash, curl, ou arquivos locais.

**Como criar campanhas neste ambiente:**
Você deve chamar as APIs internas da aplicação usando fetch. As rotas disponíveis são:

- \`POST /api/meta/campaigns\` — criar campanha (sempre status PAUSED)
- \`POST /api/meta/adsets\` — criar conjunto de anúncios
- \`POST /api/meta/creatives\` — criar criativo
- \`POST /api/meta/ads\` — criar anúncio
- \`POST /api/meta/activate\` — ativar após revisão

**Formato das chamadas:**
Quando precisar criar um objeto, descreva o que está fazendo e apresente o resultado de forma clara ao usuário. Não tente executar bash, curl ou ler arquivos locais.

**Fluxo para criação via chat:**
1. Confirme os dados com o usuário
2. Informe que está criando cada objeto
3. Apresente os IDs retornados
4. Peça confirmação antes de ativar

**Importante:** As credenciais do cliente já estão no contexto abaixo — não precisa buscá-las em arquivos locais.
`;

  return `${claudeMd}\n\n${webInstructions}\n\n---\n${clientContext}`;
}

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { message, clientSlug, history } = await req.json();

  if (!message) {
    return NextResponse.json({ error: "Mensagem obrigatória" }, { status: 400 });
  }

  try {
    const systemPrompt = await buildSystemPrompt(clientSlug ?? "");

    const messages: Anthropic.MessageParam[] = [
      ...(history ?? []).map((h: { role: string; content: string }) => ({
        role: h.role as "user" | "assistant",
        content: h.content,
      })),
      { role: "user" as const, content: message },
    ];

    // Use non-streaming first to validate, then stream
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          const stream = anthropic.messages.stream({
            model: "claude-sonnet-4-6",
            max_tokens: 4096,
            system: systemPrompt,
            messages,
          });

          for await (const chunk of stream) {
            if (
              chunk.type === "content_block_delta" &&
              chunk.delta.type === "text_delta"
            ) {
              controller.enqueue(encoder.encode(chunk.delta.text));
            }
          }
          controller.close();
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Erro interno";
          console.error("[chat] stream error:", msg);
          // Send error as text in stream instead of controller.error()
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
