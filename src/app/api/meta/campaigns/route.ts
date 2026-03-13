import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getClientBySlug } from "@/lib/clients";
import { getCampaigns, updateCampaignStatus } from "@/lib/meta-api";
import type { CampaignStatus } from "@/types/campaign";

const META_API_VERSION = "v19.0";
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = await req.json();
  const {
    clientSlug,
    name,
    objective,
    dailyBudget,
    lifetimeBudget,
    startTime,
    endTime,
  } = body;

  if (!clientSlug || !name || !objective) {
    return NextResponse.json(
      { error: "clientSlug, name e objective são obrigatórios" },
      { status: 400 }
    );
  }

  const client = await getClientBySlug(clientSlug);
  if (!client) {
    return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  }
  if (!client.ativo) {
    return NextResponse.json({ error: "Cliente inativo" }, { status: 403 });
  }

  try {
    const payload: Record<string, unknown> = {
      name,
      objective,
      status: "PAUSED",
      special_ad_categories: ["HOUSING"],
      access_token: client.meta.access_token,
    };

    if (dailyBudget) payload.daily_budget = String(dailyBudget);
    if (lifetimeBudget) payload.lifetime_budget = String(lifetimeBudget);
    if (startTime) payload.start_time = startTime;
    if (endTime) payload.stop_time = endTime;

    const url = `${META_API_BASE}/${client.meta.ad_account_id}/campaigns`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error?.message ?? `Meta API error: ${res.status}`);
    }

    return NextResponse.json({ id: data.id, name, status: "PAUSED" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro na Meta API";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const clientSlug = searchParams.get("clientSlug");

  if (!clientSlug) {
    return NextResponse.json({ error: "clientSlug obrigatório" }, { status: 400 });
  }

  const client = await getClientBySlug(clientSlug);
  if (!client) {
    return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  }

  if (!client.ativo) {
    return NextResponse.json({ error: "Cliente inativo" }, { status: 403 });
  }

  try {
    const campaigns = await getCampaigns(
      client.meta.ad_account_id,
      client.meta.access_token
    );
    return NextResponse.json({ campaigns });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro na Meta API";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { campaignId, status, clientSlug } = await req.json();

  if (!campaignId || !status || !clientSlug) {
    return NextResponse.json(
      { error: "campaignId, status e clientSlug são obrigatórios" },
      { status: 400 }
    );
  }

  const allowedStatuses: CampaignStatus[] = ["ACTIVE", "PAUSED"];
  if (!allowedStatuses.includes(status)) {
    return NextResponse.json({ error: "Status inválido" }, { status: 400 });
  }

  const client = await getClientBySlug(clientSlug);
  if (!client) {
    return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  }

  try {
    await updateCampaignStatus(campaignId, status as CampaignStatus, client.meta.access_token);
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro na Meta API";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
