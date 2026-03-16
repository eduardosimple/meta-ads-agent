import { NextRequest, NextResponse } from "next/server";
import { getClients } from "@/lib/clients";
import { saveReport } from "@/lib/reports-store";
import { getAdInsights } from "@/lib/meta-api";
import { getGoogleCampaignsWithMetrics } from "@/lib/google-ads-api";
import type { DailyReport } from "@/lib/reports-store";
import type { AnalysisResult } from "@/types/metrics";
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

  const results = [];

  for (const client of activeClients) {
    try {
      const report: DailyReport = {
        id: randomUUID(),
        client_slug: client.slug,
        client_name: client.nome,
        date: today,
        created_at: new Date().toISOString(),
      };

      // ── Meta analysis ──
      try {
        const [analysisRes, metricsRes] = await Promise.allSettled([
          fetch(`${req.nextUrl.origin}/api/analysis`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-cron-key": process.env.CRON_SECRET ?? "" },
            body: JSON.stringify({ clientSlug: client.slug }),
          }),
          getAdInsights(client.meta.ad_account_id, client.meta.access_token, sevenDaysAgo, today),
        ]);

        if (analysisRes.status === "fulfilled" && analysisRes.value.ok) {
          const data: AnalysisResult = await analysisRes.value.json();
          const metrics = metricsRes.status === "fulfilled" ? metricsRes.value : [];
          report.meta = {
            ...data,
            spend_7d: metrics.reduce((s, a) => s + a.spend, 0),
            leads_7d: metrics.reduce((s, a) => s + a.leads, 0),
            avg_ctr: metrics.length > 0 ? metrics.reduce((s, a) => s + a.ctr, 0) / metrics.length : 0,
          };
        }
      } catch (e) {
        console.error(`[cron] meta analysis error for ${client.slug}:`, e);
      }

      // ── Google analysis ──
      if (client.google) {
        try {
          const [analysisRes, metricsRows] = await Promise.allSettled([
            fetch(`${req.nextUrl.origin}/api/google/analysis`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-cron-key": process.env.CRON_SECRET ?? "" },
              body: JSON.stringify({ clientSlug: client.slug }),
            }),
            getGoogleCampaignsWithMetrics(client.google, sevenDaysAgo, today),
          ]);

          if (analysisRes.status === "fulfilled" && analysisRes.value.ok) {
            const data: AnalysisResult = await analysisRes.value.json();
            const gMetrics = metricsRows.status === "fulfilled" ? metricsRows.value : [];
            const gSpend = gMetrics.reduce((s, c) => s + c.spend, 0);
            const gConversions = gMetrics.reduce((s, c) => s + c.conversions, 0);
            const gAvgCtr = gMetrics.length > 0 ? gMetrics.reduce((s, c) => s + c.ctr, 0) / gMetrics.length : 0;
            report.google = {
              ...data,
              spend_7d: gSpend,
              conversions_7d: gConversions,
              avg_ctr: gAvgCtr,
              cost_per_conversion: gConversions > 0 ? gSpend / gConversions : 0,
            };
          }
        } catch (e) {
          console.error(`[cron] google analysis error for ${client.slug}:`, e);
        }
      }

      await saveReport(report);
      const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
      const anonKey = process.env.SUPABASE_ANON_KEY ?? "";
      results.push({ client: client.slug, status: "ok", date: today, svcKeyLen: svcKey.length, anonKeyLen: anonKey.length, svcKeyStart: svcKey.slice(0,20) });
    } catch (e) {
      console.error(`[cron] error for ${client.slug}:`, e);
      results.push({ client: client.slug, status: "error" });
    }
  }

  return NextResponse.json({ processed: results, at: new Date().toISOString() });
}
