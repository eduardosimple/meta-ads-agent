/**
 * GET /api/cron/weekly-data?slug=X
 * Devolve dataset Otimização Semanal pronto pra skill local raciocinar.
 */
import { NextRequest, NextResponse } from "next/server";
import { getClientBySlug } from "@/lib/clients";
import { buildWeeklyDataset } from "@/lib/weekly-data";

export const maxDuration = 60;

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
    const dataset = await buildWeeklyDataset(client);
    return NextResponse.json(dataset);
  } catch (e) {
    return NextResponse.json({ error: "build_failed", message: String(e) }, { status: 500 });
  }
}
