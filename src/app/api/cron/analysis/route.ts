import { NextRequest, NextResponse } from "next/server";
import { getClients } from "@/lib/clients";
import { getReportsByDate } from "@/lib/reports-store";

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
  let todayReports: Awaited<ReturnType<typeof getReportsByDate>> = [];
  let dbError: string | null = null;
  try {
    todayReports = await getReportsByDate(today);
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }
  const existingMap = new Map(todayReports.map(r => [r.client_slug, r]));

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

  // Fan-out: dispatch each client to /api/cron/analysis-single in parallel
  // Each single-client function has maxDuration=60 — no risk of the orchestrator timing out
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  const clientsNeedingWork = workList.filter(c => {
    const r = existingMap.get(c.slug);
    return !r?.meta || (c.google && !r?.google);
  });

  const skipped = workList.filter(c => {
    const r = existingMap.get(c.slug);
    return r?.meta && (!c.google || r?.google);
  });

  const results = await Promise.all([
    ...skipped.map(c => Promise.resolve({ client: c.slug, status: "skipped", date: today })),
    ...clientsNeedingWork.map(async (client) => {
      try {
        const res = await fetch(
          `${baseUrl}/api/cron/analysis-single?slug=${client.slug}`,
          { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }, signal: AbortSignal.timeout(55000) }
        );
        const data = await res.json() as { status: string; error?: string };
        return { client: client.slug, status: data.status, error: data.error, date: today };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[cron] dispatch error for ${client.slug}:`, msg);
        return { client: client.slug, status: "dispatch_error", error: msg, date: today };
      }
    }),
  ]);

  return NextResponse.json({ processed: results, debug, at: new Date().toISOString() });
}
