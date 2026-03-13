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
  const { clientSlug, name, adsetId, creativeId } = body as {
    clientSlug: string;
    name: string;
    adsetId: string;
    creativeId: string;
  };

  if (!clientSlug || !name || !adsetId || !creativeId) {
    return NextResponse.json(
      { error: "clientSlug, name, adsetId e creativeId são obrigatórios" },
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

  try {
    const payload = {
      name,
      adset_id: adsetId,
      creative: { creative_id: creativeId },
      status: "PAUSED",
      access_token: client.meta.access_token,
    };

    const url = `${META_API_BASE}/${client.meta.ad_account_id}/ads`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error?.message ?? `Meta API error: ${res.status}`);
    }

    return NextResponse.json({ id: data.id, name, status: "PAUSED" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro na Meta API";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
