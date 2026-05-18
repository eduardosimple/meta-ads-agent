import { NextRequest, NextResponse } from "next/server";
import { getReportsByDate } from "@/lib/reports-store";

export const maxDuration = 30;

// GET /api/cron/pending-creatives?days=2
// Lista proposals com status "creative_requested" (pedidos de recriação de
// criativo feitos no portal) para o poller local acionar o orquestrador.
// Auth: Bearer CRON_SECRET.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const days = Math.min(7, Math.max(1, parseInt(req.nextUrl.searchParams.get("days") ?? "2", 10)));
  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    dates.push(new Date(Date.now() - i * 86400000).toISOString().split("T")[0]);
  }

  const pending: Array<{
    slug: string;
    client_name: string;
    date: string;
    platform: "meta" | "google";
    worst_ad_id: string;
    worst_ad_name: string;
    diagnostico: string;
    best_ad_id?: string;
  }> = [];

  for (const date of dates) {
    let reports;
    try {
      reports = await getReportsByDate(date);
    } catch {
      continue;
    }
    for (const r of reports) {
      for (const platform of ["meta", "google"] as const) {
        const analysis = r[platform];
        if (!analysis) continue;
        for (const p of analysis.proposals) {
          if (p.status === "creative_requested") {
            pending.push({
              slug: r.client_slug,
              client_name: r.client_name,
              date,
              platform,
              worst_ad_id: p.ad_id,
              worst_ad_name: p.ad_name,
              diagnostico: p.diagnostico,
              best_ad_id: p.best_ad_id,
            });
          }
        }
      }
    }
  }

  return NextResponse.json({ pending, count: pending.length, at: new Date().toISOString() });
}
