import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getClientBySlug } from "@/lib/clients";
import { getGoogleAdGroupInsights } from "@/lib/google-ads-api";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientSlug = searchParams.get("clientSlug");
  const now = new Date();
  const dateTo = searchParams.get("dateTo") ?? now.toISOString().split("T")[0];
  const dateFrom = searchParams.get("dateFrom") ?? new Date(now.setDate(now.getDate() - 7)).toISOString().split("T")[0];

  if (!clientSlug) return NextResponse.json({ error: "clientSlug obrigatório" }, { status: 400 });

  const client = await getClientBySlug(clientSlug);
  if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  if (!client.google) return NextResponse.json({ error: "Cliente sem credenciais Google Ads" }, { status: 400 });

  try {
    const adGroups = await getGoogleAdGroupInsights(client.google, dateFrom, dateTo);
    return NextResponse.json({ data: adGroups, date_from: dateFrom, date_to: dateTo });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao buscar grupos de anúncios";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
