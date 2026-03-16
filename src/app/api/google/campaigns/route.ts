import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getClientBySlug } from "@/lib/clients";
import { getGoogleCampaignsWithMetrics, setGoogleCampaignStatus } from "@/lib/google-ads-api";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientSlug = searchParams.get("clientSlug");
  if (!clientSlug) return NextResponse.json({ error: "clientSlug obrigatório" }, { status: 400 });

  const now = new Date();
  const dateTo = searchParams.get("dateTo") ?? now.toISOString().split("T")[0];
  const dateFrom = searchParams.get("dateFrom") ?? new Date(now.setDate(now.getDate() - 7)).toISOString().split("T")[0];

  const client = await getClientBySlug(clientSlug);
  if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  if (!client.google) return NextResponse.json({ error: "Cliente sem credenciais Google Ads" }, { status: 400 });

  try {
    const campaigns = await getGoogleCampaignsWithMetrics(client.google, dateFrom, dateTo);
    return NextResponse.json({ campaigns, date_from: dateFrom, date_to: dateTo });
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
