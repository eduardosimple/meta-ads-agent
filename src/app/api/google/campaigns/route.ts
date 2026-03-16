import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getClientBySlug } from "@/lib/clients";
import { getGoogleCampaigns, setGoogleCampaignStatus } from "@/lib/google-ads-api";

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const clientSlug = new URL(req.url).searchParams.get("clientSlug");
  if (!clientSlug) return NextResponse.json({ error: "clientSlug obrigatório" }, { status: 400 });

  const client = await getClientBySlug(clientSlug);
  if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  if (!client.google) return NextResponse.json({ error: "Cliente sem credenciais Google Ads" }, { status: 400 });

  try {
    const campaigns = await getGoogleCampaigns(client.google);
    return NextResponse.json({ campaigns });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao buscar campanhas";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { clientSlug, campaignId, status }: { clientSlug: string; campaignId: string; status: "PAUSED" | "ENABLED" } = await req.json();

  const client = await getClientBySlug(clientSlug);
  if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  if (!client.google) return NextResponse.json({ error: "Cliente sem credenciais Google Ads" }, { status: 400 });

  try {
    await setGoogleCampaignStatus(client.google, campaignId, status);
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao atualizar status";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
