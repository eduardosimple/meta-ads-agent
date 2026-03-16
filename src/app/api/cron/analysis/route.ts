import { NextRequest, NextResponse } from "next/server";
import { getClients } from "@/lib/clients";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Verify Vercel cron secret
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clients = await getClients();
  const activeClients = clients.filter(c => c.ativo);

  const results = [];
  for (const client of activeClients) {
    try {
      const res = await fetch(`${req.nextUrl.origin}/api/analysis`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Use internal auth - we skip auth for cron internal calls
          "x-cron-key": process.env.CRON_SECRET ?? "",
        },
        body: JSON.stringify({ clientSlug: client.slug }),
      });
      results.push({ client: client.slug, status: res.ok ? "ok" : "error" });
    } catch {
      results.push({ client: client.slug, status: "error" });
    }
  }

  return NextResponse.json({ processed: results, at: new Date().toISOString() });
}
