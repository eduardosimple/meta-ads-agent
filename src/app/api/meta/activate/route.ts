import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getClientBySlug } from "@/lib/clients";

const META_API_VERSION = "v19.0";
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

async function setStatus(
  objectId: string,
  status: string,
  accessToken: string
): Promise<void> {
  const url = `${META_API_BASE}/${objectId}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, access_token: accessToken }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(
      data.error?.message ?? `Meta API error activating ${objectId}: ${res.status}`
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = await req.json();
  const { clientSlug, campaignId, adsetId, adId } = body as {
    clientSlug: string;
    campaignId: string;
    adsetId: string;
    adId: string;
  };

  if (!clientSlug || !campaignId || !adsetId || !adId) {
    return NextResponse.json(
      { error: "clientSlug, campaignId, adsetId e adId são obrigatórios" },
      { status: 400 }
    );
  }

  const client = await getClientBySlug(clientSlug);
  if (!client) {
    return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  }
  if (!client.ativo) {
    return NextResponse.json({ error: "Cliente inativo" }, { status: 403 });
  }

  try {
    // Activate in order: campaign → adset → ad
    await setStatus(campaignId, "ACTIVE", client.meta.access_token);
    await setStatus(adsetId, "ACTIVE", client.meta.access_token);
    await setStatus(adId, "ACTIVE", client.meta.access_token);

    return NextResponse.json({
      success: true,
      campaignStatus: "ACTIVE",
      adsetStatus: "ACTIVE",
      adStatus: "ACTIVE",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro na ativação";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
