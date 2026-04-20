import { NextRequest, NextResponse } from "next/server";
import { getClients } from "@/lib/clients";
import { saveReport, getReportsByDate } from "@/lib/reports-store";
import { getGoogleCampaignsWithMetrics } from "@/lib/google-ads-api";
import { analyzeMetaAds, analyzeGoogleAds } from "@/lib/analysis";
import type { DailyReport } from "@/lib/reports-store";
import { randomUUID } from "crypto";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clients = await getClients();
  const activeClients = clients.filter(c => c.ativo);

  const today = new Date().toISOString().split("T")[0];
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  // Single query to get all today's reports — avoids 98 individual round-trips
  let todayReports: DailyReport[] = [];
  let dbError: string | null = null;
  try {
    todayReports = await getReportsByDate(today);
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }
  const existingMap = new Map<string, DailyReport>(todayReports.map(r => [r.client_slug, r]));

  // Sort: no row (0) → meta=null retry (1) → already complete/skipped (2)
  const sortedClients = [...activeClients].sort((a, b) => {
    const ra = existingMap.get(a.slug);
    const rb = existingMap.get(b.slug);
    const pa = !ra ? 0 : !ra.meta ? 1 : 2;
    const pb = !rb ? 0 : !rb.meta ? 1 : 2;
    return pa - pb;
  });

  // Optional limit for debugging / partial runs
  const limitParam = req.nextUrl.searchParams.get("limit");
  const workList = limitParam ? sortedClients.slice(0, parseInt(limitParam)) : sortedClients;

  const debug = {
    date: today,
    active_clients: activeClients.length,
    db_reports_found: todayReports.length,
    db_error: dbError,
    priority_counts: {
      no_row: sortedClients.filter(c => !existingMap.get(c.slug)).length,
      meta_null: sortedClients.filter(c => { const r = existingMap.get(c.slug); return r && !r.meta; }).length,
      complete: sortedClients.filter(c => !!existingMap.get(c.slug)?.meta).length,
    },
    first_5_clients: workList.slice(0, 5).map(c => ({ slug: c.slug, priority: !existingMap.get(c.slug) ? 0 : !existingMap.get(c.slug)?.meta ? 1 : 2 })),
  };

  const results = [];

  for (const client of workList) {
    try {
      const existing = existingMap.get(client.slug) ?? undefined;
      const needsMeta = !existing?.meta;
      const needsGoogle = client.google ? !existing?.google : false;
      if (!needsMeta && !needsGoogle) {
        results.push({ client: client.slug, status: "skipped", date: today });
        continue;
      }

      const report: DailyReport = existing ?? {
        id: randomUUID(),
        client_slug: client.slug,
        client_name: client.nome,
        date: today,
        created_at: new Date().toISOString(),
      };

      // ── Meta analysis ──
      if (needsMeta) try {
        const analysis = await analyzeMetaAds(client, sevenDaysAgo, today);
        report.meta = {
          ...analysis,
          spend_7d: analysis.spend_7d ?? 0,
          leads_7d: analysis.leads_7d ?? 0,
          avg_ctr: analysis.avg_ctr ?? 0,
        };
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        console.error(`[cron] meta analysis error for ${client.slug}:`, reason);
        results.push({ client: client.slug, status: "meta_error", error: reason, date: today });
      }

      // ── Google analysis ──
      if (needsGoogle && client.google) {
        try {
          const [analysis, gMetrics] = await Promise.allSettled([
            analyzeGoogleAds(client, sevenDaysAgo, today),
            getGoogleCampaignsWithMetrics(client.google, sevenDaysAgo, today),
          ]);

          if (analysis.status === "fulfilled") {
            const g = gMetrics.status === "fulfilled" ? gMetrics.value : [];
            const gSpend = g.reduce((s, c) => s + c.spend, 0);
            const gConversions = g.reduce((s, c) => s + c.conversions, 0);
            report.google = {
              ...analysis.value,
              spend_7d: gSpend,
              conversions_7d: gConversions,
              avg_ctr: g.length > 0 ? g.reduce((s, c) => s + c.ctr, 0) / g.length : 0,
              cost_per_conversion: gConversions > 0 ? gSpend / gConversions : 0,
            };
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`[cron] google analysis error for ${client.slug}:`, msg);
          results.push({ client: client.slug, status: "google_error", error: msg, date: today });
        }
      }

      await saveReport(report);
      results.push({ client: client.slug, status: "ok", date: today });
    } catch (e) {
      console.error(`[cron] error for ${client.slug}:`, e);
      results.push({ client: client.slug, status: "error" });
    }
  }

  return NextResponse.json({ processed: results, debug, at: new Date().toISOString() });
}
