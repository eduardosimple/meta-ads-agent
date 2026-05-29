/**
 * POST /api/proposals/execute-public
 * Versão pública do execute — autenticado via view_key (mesmo de REPORT_VIEW_SECRET
 * que já protege as páginas). Não expõe CRON_SECRET no client.
 *
 * Internamente delega pro endpoint /api/proposals/execute usando CRON_SECRET
 * (que só existe no server side).
 *
 * Body: mesmo do execute + `view_key`.
 */
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const viewKey = body.view_key as string;
  if (viewKey !== process.env.REPORT_VIEW_SECRET) {
    return NextResponse.json({ error: "invalid_view_key" }, { status: 401 });
  }

  // Remove view_key antes de encaminhar
  const { view_key: _vk, ...payload } = body;
  void _vk;

  const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000";

  const r = await fetch(`${baseUrl}/api/proposals/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-cron-key": process.env.CRON_SECRET! },
    body: JSON.stringify(payload),
  });
  const data = await r.json();
  return NextResponse.json(data, { status: r.status });
}
