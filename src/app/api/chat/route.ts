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

function buildSystemPrompt(clientSlug: string): string {
  const claudeMd = getClaudeMd();
  const client = getClientBySlug(clientSlug);

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

  return `${claudeMd}\n\n---\n${clientContext}`;
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

  const systemPrompt = buildSystemPrompt(clientSlug ?? "");

  const messages: Anthropic.MessageParam[] = [
    ...(history ?? []).map((h: { role: string; content: string }) => ({
      role: h.role as "user" | "assistant",
      content: h.content,
    })),
    { role: "user" as const, content: message },
  ];

  const stream = await anthropic.messages.stream({
    model: "claude-opus-4-5",
    max_tokens: 4096,
    system: systemPrompt,
    messages,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
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
        controller.error(err);
      }
    },
  });

  return new NextResponse(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
