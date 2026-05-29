/**
 * GET /api/cron/monthly-data?slug=X
 * Dataset da Otimização Mensal — 30d × 30d anteriores + auditoria pixel +
 * propostas estratégicas. Não chama Claude.
 */
import { NextRequest, NextResponse } from "next/server";
import { getClientBySlug } from "@/lib/clients";
import { buildMonthlyDataset } from "@/lib/monthly-data";

export const maxDuration = 90;

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
  const client = await getClientBySlug(slug);
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  if (!client.ativo) return NextResponse.json({ status: "inactive" });
  try {
    const dataset = await buildMonthlyDataset(client);
    return NextResponse.json(dataset);
  } catch (e) {
    return NextResponse.json({ error: "build_failed", message: String(e) }, { status: 500 });
  }
}
