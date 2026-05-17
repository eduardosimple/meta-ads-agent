import { NextRequest, NextResponse } from "next/server";
import { syncAccounts } from "@/lib/account-sync";

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await syncAccounts();
  return NextResponse.json({ ...result, at: new Date().toISOString() });
}
