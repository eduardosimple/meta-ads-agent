import { NextRequest, NextResponse } from "next/server";
import { getClients } from "@/lib/clients";
import { saveReport } from "@/lib/reports-store";
import { getAdInsights } from "@/lib/meta-api";
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
        const [analysis, metrics] = await Promise.allSettled([
          analyzeMetaAds(client, sevenDaysAgo, today),
          getAdInsights(client.meta.ad_account_id, client.meta.access_token, sevenDaysAgo, today),
        ]);

        if (analysis.status === "fulfilled") {
          const m = metrics.status === "fulfilled" ? metrics.value : [];
          report.meta = {
            ...analysis.value,
            spend_7d: m.reduce((s, a) => s + a.spend, 0),
            leads_7d: m.reduce((s, a) => s + a.leads, 0),
            avg_ctr: m.length > 0 ? m.reduce((s, a) => s + a.ctr, 0) / m.length : 0,
          };
        } else {
          const reason = analysis.reason instanceof Error ? analysis.reason.message : String(analysis.reason);
          console.error(`[cron] meta analysis rejected for ${client.slug}:`, reason);
          results.push({ client: client.slug, status: "meta_error", error: reason, date: today });
        }
      } catch (e) {
        console.error(`[cron] meta analysis error for ${client.slug}:`, e);
      }

      // ── Google analysis ──
      if (client.google) {
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

  return NextResponse.json({ processed: results, at: new Date().toISOString() });
}
