import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getClientBySlug } from "@/lib/clients";
import { getCampaigns, updateCampaignStatus } from "@/lib/meta-api";
import type { CampaignStatus } from "@/types/campaign";

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const clientSlug = searchParams.get("clientSlug");

  if (!clientSlug) {
    return NextResponse.json({ error: "clientSlug obrigatório" }, { status: 400 });
  }

  const client = getClientBySlug(clientSlug);
  if (!client) {
    return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  }

  if (!client.ativo) {
    return NextResponse.json({ error: "Cliente inativo" }, { status: 403 });
  }

  try {
    const campaigns = await getCampaigns(
      client.meta.ad_account_id,
      client.meta.access_token
    );
    return NextResponse.json({ campaigns });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro na Meta API";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { campaignId, status, clientSlug } = await req.json();

  if (!campaignId || !status || !clientSlug) {
    return NextResponse.json(
      { error: "campaignId, status e clientSlug são obrigatórios" },
      { status: 400 }
    );
  }

  const allowedStatuses: CampaignStatus[] = ["ACTIVE", "PAUSED"];
  if (!allowedStatuses.includes(status)) {
    return NextResponse.json({ error: "Status inválido" }, { status: 400 });
  }

  const client = getClientBySlug(clientSlug);
  if (!client) {
    return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  }

  try {
    await updateCampaignStatus(campaignId, status as CampaignStatus, client.meta.access_token);
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro na Meta API";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
