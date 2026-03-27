import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getClientBySlug } from "@/lib/clients";
import { getReport } from "@/lib/reports-store";
import { analyzeMetaAds } from "@/lib/analysis";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  const cronKey = req.headers.get("x-cron-key");
  const validCron = cronKey && cronKey === process.env.CRON_SECRET;
  if (!auth && !validCron) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { clientSlug } = await req.json();
  if (!clientSlug) return NextResponse.json({ error: "clientSlug obrigatório" }, { status: 400 });

  // Return today's cached report if available (user-triggered only)
  if (!validCron) {
    const today = new Date().toISOString().split("T")[0];
    const cached = await getReport(clientSlug, today).catch(() => null);
    if (cached?.meta) return NextResponse.json(cached.meta);
  }

  const client = await getClientBySlug(clientSlug);
  if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  const now = new Date();
  const dateTo = now.toISOString().split("T")[0];
  const dateFrom = new Date(now.setDate(now.getDate() - 7)).toISOString().split("T")[0];

  try {
    const result = await analyzeMetaAds(client, dateFrom, dateTo);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro na análise";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
