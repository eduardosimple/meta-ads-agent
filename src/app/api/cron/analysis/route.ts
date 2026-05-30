import { NextRequest, NextResponse, after } from "next/server";
import { getClients } from "@/lib/clients";
import { getReportsByDate } from "@/lib/reports-store";
import { todayBR } from "@/lib/date-br";

export const maxDuration = 60;

// Quantos analysis-single rodam em paralelo dentro de uma chamada.
const CONCURRENCY = 5;
// Orçamento de tempo pra não estourar o maxDuration (deixa folga).
const TIME_BUDGET_MS = 50_000;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clients = await getClients();
  const activeClients = clients.filter(c => c.ativo);

  const today = todayBR();

  // Uma query pra pegar todos os reports de hoje
  let todayReports: Awaited<ReturnType<typeof getReportsByDate>> = [];
  let dbError: string | null = null;
  try {
    todayReports = await getReportsByDate(today);
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }
  const existingMap = new Map(todayReports.map(r => [r.client_slug, r]));

  // Prioriza quem ainda não tem report / está sem meta
  const sortedClients = [...activeClients].sort((a, b) => {
    const ra = existingMap.get(a.slug);
    const rb = existingMap.get(b.slug);
    const pa = !ra ? 0 : !ra.meta ? 1 : 2;
    const pb = !rb ? 0 : !rb.meta ? 1 : 2;
    return pa - pb;
  });

  const pending = sortedClients.filter(c => {
    const r = existingMap.get(c.slug);
    return !r?.meta || (c.google && !r?.google);
  });

  // limit opcional: limita o tamanho da fila desta chamada. Sem limit = todos
  // os pendentes (o TIME_BUDGET_MS é quem corta naturalmente por chamada).
  const limitParam = req.nextUrl.searchParams.get("limit");
  const parsed = limitParam ? parseInt(limitParam) : NaN;
  const cap = Number.isFinite(parsed) ? Math.max(0, parsed) : pending.length;
  const queue = pending.slice(0, cap).map(c => c.slug);

  const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  // CONFIÁVEL: processa DEPOIS de responder (after) — a Vercel mantém a função
  // viva até terminar (até maxDuration), então o cron-job.org não toma timeout
  // e nenhum disparo se perde. Worker pool AGUARDA cada analysis-single de
  // verdade (nada de fire-and-forget). Clientes com token quebrado falham
  // rápido e o worker já pega o próximo, sem travar a fila.
  after(async () => {
    const deadline = Date.now() + TIME_BUDGET_MS;
    const work = [...queue];
    async function worker() {
      while (work.length > 0 && Date.now() < deadline) {
        const slug = work.shift();
        if (!slug) break;
        try {
          await fetch(
            `${baseUrl}/api/cron/analysis-single?slug=${slug}`,
            { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }
          );
        } catch {
          /* analysis-single loga o próprio erro; segue p/ o próximo */
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker())
    );
  });

  return NextResponse.json({
    accepted: queue.length,
    pending_total: pending.length,
    skipped: activeClients.length - pending.length,
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
