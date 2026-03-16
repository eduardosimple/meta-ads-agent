import { createClient } from "@supabase/supabase-js";
import type { Client, ClientsFile } from "@/types/client";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseKey = process.env.SUPABASE_ANON_KEY ?? "";

function getSupabase() {
  return createClient(supabaseUrl, supabaseKey);
}

// Fallback: read clients from CLIENTS_JSON env var (JSON string)
function getClientsFromEnv(): Client[] {
  const raw = process.env.CLIENTS_JSON;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ClientsFile;
    return parsed.clientes ?? [];
  } catch {
    return [];
  }
}

export async function getClients(): Promise<Client[]> {
  // CLIENTS_JSON takes priority — always works, no DB dependency
  const fromEnv = getClientsFromEnv();
  if (fromEnv.length > 0) return fromEnv;

  // Fallback: Supabase
  if (supabaseUrl && supabaseKey) {
    try {
      const { data, error } = await getSupabase()
        .from("clients")
        .select("*")
        .order("nome");
      if (!error && data && data.length > 0) return data.map(rowToClient);
    } catch {
      // ignore
    }
  }
  return [];
}

export async function getClientBySlug(slug: string): Promise<Client | null> {
  // CLIENTS_JSON takes priority
  const fromEnv = getClientsFromEnv();
  if (fromEnv.length > 0) return fromEnv.find((c) => c.slug === slug) ?? null;

  // Fallback: Supabase
  if (supabaseUrl && supabaseKey) {
    try {
      const { data, error } = await getSupabase()
        .from("clients")
        .select("*")
        .eq("slug", slug)
        .single();
      if (!error && data) return rowToClient(data);
    } catch {
      // ignore
    }
  }
  return null;
}

export async function upsertClient(client: Client): Promise<void> {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase não configurado. Adicione SUPABASE_URL e SUPABASE_ANON_KEY nas variáveis de ambiente do Vercel.");
  }
  try {
    const { error } = await getSupabase()
      .from("clients")
      .upsert(clientToRow(client), { onConflict: "slug" });
    if (error) throw new Error(error.message ?? JSON.stringify(error));
  } catch (e) {
    if (e instanceof Error) throw e;
    throw new Error(typeof e === "object" ? JSON.stringify(e) : String(e));
  }
}

export async function deleteClientBySlug(slug: string): Promise<boolean> {
  const { error, count } = await getSupabase()
    .from("clients")
    .delete({ count: "exact" })
    .eq("slug", slug);
  if (error) throw new Error(error.message ?? JSON.stringify(error));
  return (count ?? 0) > 0;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function rowToClient(row: Record<string, unknown>): Client {
  return {
    nome: row.nome as string,
    slug: row.slug as string,
    ativo: row.ativo as boolean,
    meta: row.meta as Client["meta"],
    google: row.google as Client["google"] | undefined,
    contexto: row.contexto as Client["contexto"],
  };
}

function clientToRow(client: Client) {
  return {
    nome: client.nome,
    slug: client.slug,
    ativo: client.ativo,
    meta: client.meta,
    google: client.google ?? null,
    contexto: client.contexto,
  };
}
