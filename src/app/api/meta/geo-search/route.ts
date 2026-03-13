import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getClientBySlug } from "@/lib/clients";

const META_API_VERSION = "v19.0";
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

interface GeoLocation {
  key: string;
  name: string;
  type: string;
  country_code: string;
  country_name: string;
  region?: string;
  region_id?: number;
}

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  const clientSlug = searchParams.get("clientSlug");

  if (!q || !clientSlug) {
    return NextResponse.json(
      { error: "q e clientSlug são obrigatórios" },
      { status: 400 }
    );
  }

  const client = getClientBySlug(clientSlug);
  if (!client) {
    return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  }

  try {
    const params = new URLSearchParams({
      type: "adgeolocation",
      q,
      location_types: '["city"]',
      access_token: client.meta.access_token,
    });

    const url = `${META_API_BASE}/search?${params}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok || data.error) {
      throw new Error(data.error?.message ?? `Meta API error: ${res.status}`);
    }

    const locations: GeoLocation[] = (data.data ?? []).map(
      (item: GeoLocation) => ({
        key: item.key,
        name: item.name,
        country_code: item.country_code,
        region: item.region,
      })
    );

    return NextResponse.json({ locations });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro na busca";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
