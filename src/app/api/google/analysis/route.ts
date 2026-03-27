import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getClientBySlug } from "@/lib/clients";
import { getReport } from "@/lib/reports-store";
import { analyzeGoogleAds } from "@/lib/analysis";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthFromRequest(req);
    const cronKey = req.headers.get("x-cron-key");
    const validCron = cronKey && cronKey === process.env.CRON_SECRET;
    if (!auth && !validCron) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    let clientSlug: string;
    try {
      const body = await req.json();
      clientSlug = body.clientSlug;
    } catch {
      return NextResponse.json({ error: "Body inválido" }, { status: 400 });
    }
    if (!clientSlug) return NextResponse.json({ error: "clientSlug obrigatório" }, { status: 400 });

    // Return today's cached report if available (user-triggered only)
    if (!validCron) {
      const today = new Date().toISOString().split("T")[0];
      const cached = await getReport(clientSlug, today).catch(() => null);
      if (cached?.google) return NextResponse.json(cached.google);
    }

    const client = await getClientBySlug(clientSlug);
    if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    if (!client.google) return NextResponse.json({ error: "Cliente sem credenciais Google Ads" }, { status: 400 });

    const now = new Date();
    const dateTo = now.toISOString().split("T")[0];
    const dateFrom = new Date(now.setDate(now.getDate() - 7)).toISOString().split("T")[0];

    const result = await analyzeGoogleAds(client, dateFrom, dateTo);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Erro interno: ${msg}` }, { status: 500 });
  }
}
