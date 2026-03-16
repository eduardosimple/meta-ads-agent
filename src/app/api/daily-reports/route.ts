import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getRecentReports, getReport } from "@/lib/reports-store";

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientSlug = searchParams.get("clientSlug");
  const date = searchParams.get("date");
  const limit = parseInt(searchParams.get("limit") ?? "7");

  if (!clientSlug) return NextResponse.json({ error: "clientSlug obrigatório" }, { status: 400 });

  try {
    if (date) {
      const report = await getReport(clientSlug, date);
      return NextResponse.json({ report });
    }
    const reports = await getRecentReports(clientSlug, limit);
    return NextResponse.json({ reports });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao buscar relatórios";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
