import { NextRequest, NextResponse } from "next/server";
import { getReportsByDate } from "@/lib/reports-store";
import { todayBR, nDaysAgoBR } from "@/lib/date-br";

export const maxDuration = 30;

const STALE_GENERATING_MIN = 15;

/**
 * GET /api/cron/pending-creatives?days=2&include_stale=true
 *  - status="creative_requested" → pedido novo (CreateCreativeCard click).
 *  - status="generating" com resolved_at > 15min (se include_stale) → órfão; retry.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const days = Math.min(7, Math.max(1, parseInt(req.nextUrl.searchParams.get("days") ?? "2", 10)));
  const includeStale = req.nextUrl.searchParams.get("include_stale") === "true";
  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    dates.push(i === 0 ? todayBR() : nDaysAgoBR(i));
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
    refinement_feedback?: string;
    status: string;
    stale?: boolean;
    /** "replace_ad" (default — substitui criativo do ad existente)
     *  | "new_ad_in_adset" (cria ad NOVO no adset; worst_ad_id é o adset_id) */
    request_target?: "replace_ad" | "new_ad_in_adset";
    target_adset_id?: string;
  }> = [];

  const staleCutoff = Date.now() - STALE_GENERATING_MIN * 60 * 1000;

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
          let stale = false;
          if (p.status === "creative_requested") {
            // sempre inclui
          } else if (p.status === "generating" && includeStale) {
            const resolvedAt = p.resolved_at ? new Date(p.resolved_at).getTime() : 0;
            if (resolvedAt > 0 && resolvedAt < staleCutoff) {
              stale = true;
            } else {
              continue;
            }
          } else {
            continue;
          }
          // Flags pra discriminar replace_ad (default) de new_ad_in_adset
          const extraneousP = p as unknown as { request_target?: string; target_adset_id?: string };
          const requestTarget = extraneousP.request_target === "new_ad_in_adset"
            ? "new_ad_in_adset"
            : "replace_ad";
          pending.push({
            slug: r.client_slug,
            client_name: r.client_name,
            date,
            platform,
            worst_ad_id: p.ad_id,
            worst_ad_name: p.ad_name,
            diagnostico: p.diagnostico,
            best_ad_id: p.best_ad_id,
            refinement_feedback: p.refinement_feedback,
            status: p.status,
            request_target: requestTarget,
            target_adset_id: extraneousP.target_adset_id,
            ...(stale ? { stale: true } : {}),
          });
        }
      }
    }
  }

  return NextResponse.json({ pending, count: pending.length, at: new Date().toISOString() });
}
