import { createClient } from "@supabase/supabase-js";

export interface DesignBrief {
  client_slug: string;
  updated_at: string;
  source_ad_id: string;
  source_ad_name: string;
  thumbnail_url: string | null;
  analysis: {
    cores_dominantes: string[];
    estilo_fundo: string;
    tipografia: string;
    composicao: string;
    elementos_visuais: string[];
    tom_visual: string;
    diretriz_para_novos: string;
  };
  approved_guidelines?: string;
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function saveDesignBrief(brief: DesignBrief): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.from("client_design_briefs").upsert(
    { ...brief },
    { onConflict: "client_slug" }
  );
  if (error && error.code !== "PGRST205") console.error("saveDesignBrief error:", error.message);
}

export async function getDesignBrief(slug: string): Promise<DesignBrief | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("client_design_briefs")
    .select("*")
    .eq("client_slug", slug)
    .single();
  if (error && (error.code === "PGRST116" || error.code === "PGRST205")) return null;
  return data ?? null;
}

export async function appendApprovedGuideline(slug: string, guideline: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const existing = await getDesignBrief(slug);
  const current = existing?.approved_guidelines ?? "";
  const updated = current ? `${current}\n\n---\n\n${guideline}` : guideline;
  await sb.from("client_design_briefs").upsert(
    {
      client_slug: slug,
      approved_guidelines: updated,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "client_slug" }
  );
}
