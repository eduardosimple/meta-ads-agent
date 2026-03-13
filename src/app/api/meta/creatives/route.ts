import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getClientBySlug } from "@/lib/clients";

const META_API_VERSION = "v19.0";
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = await req.json();
  const {
    clientSlug,
    name,
    pageId,
    imageHash,
    link,
    message,
    title,
    description,
    ctaType,
    format,
  } = body as {
    clientSlug: string;
    name: string;
    pageId?: string;
    imageHash?: string;
    link: string;
    message: string;
    title: string;
    description?: string;
    ctaType: string;
    format: "image" | "carousel";
  };

  if (!clientSlug || !name || !link || !message) {
    return NextResponse.json(
      { error: "clientSlug, name, link e message são obrigatórios" },
      { status: 400 }
    );
  }

  const client = getClientBySlug(clientSlug);
  if (!client) {
    return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  }
  if (!client.ativo) {
    return NextResponse.json({ error: "Cliente inativo" }, { status: 403 });
  }

  const resolvedPageId = pageId ?? client.meta.page_id;

  try {
    let objectStorySpec: Record<string, unknown>;

    if (format === "carousel") {
      // Minimal carousel creative
      objectStorySpec = {
        page_id: resolvedPageId,
        link_data: {
          link,
          message,
          name: title,
          description: description ?? "",
          call_to_action: {
            type: ctaType,
            value: { link },
          },
          child_attachments: [
            {
              link,
              name: title,
              description: description ?? "",
              ...(imageHash ? { image_hash: imageHash } : {}),
            },
          ],
        },
      };
    } else {
      // Single image creative
      const linkData: Record<string, unknown> = {
        link,
        message,
        name: title,
        description: description ?? "",
        call_to_action: {
          type: ctaType,
          value: { link },
        },
      };

      if (imageHash) {
        linkData.image_hash = imageHash;
      }

      objectStorySpec = {
        page_id: resolvedPageId,
        link_data: linkData,
      };
    }

    const payload = {
      name,
      object_story_spec: objectStorySpec,
      access_token: client.meta.access_token,
    };

    const url = `${META_API_BASE}/${client.meta.ad_account_id}/adcreatives`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error?.message ?? `Meta API error: ${res.status}`);
    }

    return NextResponse.json({ id: data.id, name });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro na Meta API";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
