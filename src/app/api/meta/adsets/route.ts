import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getClientBySlug } from "@/lib/clients";

const META_API_VERSION = "v19.0";
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

interface TargetingPayload {
  cityKey?: string;
  cityName?: string;
  radiusKm?: number;
  ageMin?: number;
  ageMax?: number;
}

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = await req.json();
  const {
    clientSlug,
    campaignId,
    name,
    targeting,
    optimizationGoal,
    startTime,
    endTime,
  } = body as {
    clientSlug: string;
    campaignId: string;
    name: string;
    targeting: TargetingPayload;
    optimizationGoal: string;
    startTime?: string;
    endTime?: string;
  };

  if (!clientSlug || !campaignId || !name) {
    return NextResponse.json(
      { error: "clientSlug, campaignId e name são obrigatórios" },
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
    // Build targeting spec
    const targetingSpec: Record<string, unknown> = {
      age_min: targeting?.ageMin ?? 25,
      age_max: targeting?.ageMax ?? 65,
    };

    if (targeting?.cityKey) {
      targetingSpec.geo_locations = {
        cities: [
          {
            key: targeting.cityKey,
            radius: targeting.radiusKm ?? 10,
            distance_unit: "kilometer",
          },
        ],
      };
    } else if (targeting?.cityName) {
      // Fallback: use custom_locations with name
      targetingSpec.geo_locations = {
        custom_locations: [
          {
            address_string: targeting.cityName,
            radius: targeting.radiusKm ?? 10,
            distance_unit: "kilometer",
          },
        ],
      };
    }

    const payload: Record<string, unknown> = {
      name,
      campaign_id: campaignId,
      status: "PAUSED",
      optimization_goal: optimizationGoal ?? "LEAD_GENERATION",
      billing_event: "IMPRESSIONS",
      bid_amount: 200, // R$ 2.00 default, in cents
      targeting: targetingSpec,
      access_token: client.meta.access_token,
    };

    if (startTime) payload.start_time = startTime;
    if (endTime) payload.end_time = endTime;

    const url = `${META_API_BASE}/${client.meta.ad_account_id}/adsets`;
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
