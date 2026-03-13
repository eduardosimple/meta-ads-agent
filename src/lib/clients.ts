import { createClient } from "@supabase/supabase-js";
import type { Client } from "@/types/client";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_ANON_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseKey);
}

export async function getClients(): Promise<Client[]> {
  try {
    const { data, error } = await getSupabase()
      .from("meta_ads_clients")
      .select("*")
      .order("nome");
    if (error) throw error;
    return (data ?? []).map(rowToClient);
  } catch {
    return [];
  }
}

export async function getClientBySlug(slug: string): Promise<Client | null> {
  const { data, error } = await getSupabase()
    .from("meta_ads_clients")
    .select("*")
    .eq("slug", slug)
    .single();
  if (error || !data) return null;
  return rowToClient(data);
}

export async function upsertClient(client: Client): Promise<void> {
  const { error } = await getSupabase()
    .from("meta_ads_clients")
    .upsert(clientToRow(client), { onConflict: "slug" });
  if (error) throw error;
}

export async function deleteClientBySlug(slug: string): Promise<boolean> {
  const { error, count } = await getSupabase()
    .from("meta_ads_clients")
    .delete({ count: "exact" })
    .eq("slug", slug);
  if (error) throw error;
  return (count ?? 0) > 0;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function rowToClient(row: Record<string, unknown>): Client {
  return {
    nome: row.nome as string,
    slug: row.slug as string,
    ativo: row.ativo as boolean,
    meta: row.meta as Client["meta"],
    contexto: row.contexto as Client["contexto"],
  };
}

function clientToRow(client: Client) {
  return {
    nome: client.nome,
    slug: client.slug,
    ativo: client.ativo,
    meta: client.meta,
    contexto: client.contexto,
  };
}
