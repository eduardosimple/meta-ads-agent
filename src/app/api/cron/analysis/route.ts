import { NextRequest, NextResponse } from "next/server";
import { getClients } from "@/lib/clients";
import { getReportsByDate } from "@/lib/reports-store";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clients = await getClients();
  const activeClients = clients.filter(c => c.ativo);

  const today = new Date().toISOString().split("T")[0];

  // Single query to get all today's reports
  let todayReports: Awaited<ReturnType<typeof getReportsByDate>> = [];
  let dbError: string | null = null;
  try {
    todayReports = await getReportsByDate(today);
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }
  const existingMap = new Map(todayReports.map(r => [r.client_slug, r]));

  const sortedClients = [...activeClients].sort((a, b) => {
    const ra = existingMap.get(a.slug);
    const rb = existingMap.get(b.slug);
    const pa = !ra ? 0 : !ra.meta ? 1 : 2;
    const pb = !rb ? 0 : !rb.meta ? 1 : 2;
    return pa - pb;
  });

  const limitParam = req.nextUrl.searchParams.get("limit");
  const workList = limitParam ? sortedClients.slice(0, parseInt(limitParam)) : sortedClients;

  const clientsNeedingWork = workList.filter(c => {
    const r = existingMap.get(c.slug);
    return !r?.meta || (c.google && !r?.google);
  });

  const skippedCount = workList.length - clientsNeedingWork.length;

  const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  // Fire-and-forget: dispatch all without awaiting
  for (const client of clientsNeedingWork) {
    fetch(
      `${baseUrl}/api/cron/analysis-single?slug=${client.slug}`,
      { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }
    ).catch(() => { /* ignore — each function logs its own errors */ });
  }

  return NextResponse.json({
    dispatched: clientsNeedingWork.map(c => c.slug),
    skipped: skippedCount,
    total_active: activeClients.length,
    db_error: dbError,
    debug: {
      no_row: sortedClients.filter(c => !existingMap.get(c.slug)).length,
      meta_null: sortedClients.filter(c => { const r = existingMap.get(c.slug); return r && !r.meta; }).length,
      complete: sortedClients.filter(c => !!existingMap.get(c.slug)?.meta).length,
    },
    at: new Date().toISOString(),
  });
}
