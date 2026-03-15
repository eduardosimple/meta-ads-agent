import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getClientBySlug } from "@/lib/clients";

const META_API_BASE = "https://graph.facebook.com/v19.0";

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { clientSlug, campaignId } = await req.json();
  const client = await getClientBySlug(clientSlug);
  if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  const adAccountId = client.meta.ad_account_id;
  const accessToken = client.meta.access_token;

  // Minimal possible adset payload
  const payload = {
    name: "DEBUG TEST ADSET",
    campaign_id: campaignId,
    status: "PAUSED",
    optimization_goal: "LINK_CLICKS",
    billing_event: "IMPRESSIONS",
    destination_type: "WEBSITE",
    targeting: { geo_locations: { countries: ["BR"] } },
    access_token: accessToken,
  };

  const res = await fetch(`${META_API_BASE}/${adAccountId}/adsets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const rawText = await res.text();
  let parsed: unknown;
  try { parsed = JSON.parse(rawText); } catch { parsed = rawText; }

  return NextResponse.json({
    status: res.status,
    payload_sent: { ...payload, access_token: "[redacted]" },
    meta_response: parsed,
  });
}
