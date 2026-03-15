import { NextRequest, NextResponse } from "next/server";
import { getClientBySlug, getClients } from "@/lib/clients";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("key") !== "debug2025") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const slug = searchParams.get("slug") ?? "";
  const campaignId = searchParams.get("campaign_id") ?? "";
  const apiVersion = searchParams.get("v") ?? "v19.0";

  // Diagnose Supabase connection
  const supabaseUrl = process.env.SUPABASE_URL ?? "NOT_SET";
  const supabaseKey = process.env.SUPABASE_ANON_KEY ?? "NOT_SET";

  const supabaseDiag: Record<string, unknown> = {
    url_set: supabaseUrl !== "NOT_SET",
    url_length: supabaseUrl.length,
    url_has_newline: supabaseUrl.includes("\n"),
    url_preview: supabaseUrl.slice(0, 40),
  };

  // Try raw Supabase query with explicit error capture
  try {
    const sb = createClient(supabaseUrl, supabaseKey);
    const { data, error, status, statusText } = await sb
      .from("meta_ads_clients")
      .select("nome, slug")
      .limit(10);
    supabaseDiag.query_status = status;
    supabaseDiag.query_statusText = statusText;
    supabaseDiag.query_error = error ?? null;
    supabaseDiag.rows_found = data?.length ?? 0;
    supabaseDiag.rows = data ?? [];
  } catch (e) {
    supabaseDiag.query_exception = e instanceof Error ? e.message : String(e);
  }

  if ((supabaseDiag.rows_found as number) === 0) {
    return NextResponse.json({ supabase_diagnostico: supabaseDiag });
  }

  const allClients = await getClients();
  const slugsAvailable = allClients.map(c => ({ nome: c.nome, slug: c.slug }));

  const client = await getClientBySlug(slug);
  if (!client) {
    return NextResponse.json({ error: "Cliente não encontrado", slug_tentado: slug, slugs_disponiveis: slugsAvailable });
  }

  const results: Record<string, unknown> = {
    cliente: client.nome,
    ad_account_id: client.meta.ad_account_id,
    page_id: client.meta.page_id,
    token_prefix: client.meta.access_token.slice(0, 15) + "...",
    token_length: client.meta.access_token.length,
    token_has_newline: client.meta.access_token.includes("\n"),
  };

  // Test 1: minimal OUTCOME_TRAFFIC adset
  const payload1 = {
    name: "DEBUG ADSET TRAFFIC",
    campaign_id: campaignId,
    status: "PAUSED",
    optimization_goal: "LINK_CLICKS",
    billing_event: "IMPRESSIONS",
    destination_type: "WEBSITE",
    daily_budget: "1000",
    targeting: { geo_locations: { countries: ["BR"] } },
    access_token: client.meta.access_token,
  };

  const r1 = await fetch(
    `https://graph.facebook.com/${apiVersion}/${client.meta.ad_account_id}/adsets`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload1),
    }
  );
  results.test_traffic = await r1.json();

  // Test 2: OUTCOME_AWARENESS adset
  const payload2 = {
    name: "DEBUG ADSET AWARENESS",
    campaign_id: campaignId,
    status: "PAUSED",
    optimization_goal: "REACH",
    billing_event: "IMPRESSIONS",
    daily_budget: "1000",
    targeting: { geo_locations: { countries: ["BR"] } },
    access_token: client.meta.access_token,
  };

  const r2 = await fetch(
    `https://graph.facebook.com/${apiVersion}/${client.meta.ad_account_id}/adsets`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload2),
    }
  );
  results.test_awareness = await r2.json();

  return NextResponse.json(results, { status: 200 });
}
