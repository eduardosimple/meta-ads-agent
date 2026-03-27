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
  // Supabase takes priority
  if (supabaseUrl && supabaseKey) {
    try {
      const { data, error } = await getSupabase()
        .from("clients")
        .select("*")
        .order("nome");
      if (!error && data && data.length > 0) return data.map(rowToClient);
    } catch {
      // ignore, fallback silently
    }
  }

  // Fallback: CLIENTS_JSON
  const fromEnv = getClientsFromEnv();
  if (fromEnv.length > 0) return fromEnv;

  return [];
}

export async function getClientBySlug(slug: string): Promise<Client | null> {
  // Supabase takes priority
  if (supabaseUrl && supabaseKey) {
    try {
      const { data, error } = await getSupabase()
        .from("clients")
        .select("*")
        .eq("slug", slug)
        .single();
      if (!error && data) return rowToClient(data);
    } catch {
      // ignore, fallback silently
    }
  }

  // Fallback: CLIENTS_JSON
  const fromEnv = getClientsFromEnv();
  if (fromEnv.length > 0) return fromEnv.find((c) => c.slug === slug) ?? null;

  return null;
}

async function saveClientsToVercel(clients: Client[]): Promise<void> {
  const apiToken = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;
  const envId = process.env.CLIENTS_JSON_ENV_ID;

  if (!apiToken || !projectId || !teamId || !envId) {
    throw new Error("Variáveis VERCEL_API_TOKEN, VERCEL_PROJECT_ID, VERCEL_TEAM_ID ou CLIENTS_JSON_ENV_ID não configuradas.");
  }

  const newValue = JSON.stringify({ clientes: clients });

  const res = await fetch(
    `https://api.vercel.com/v9/projects/${projectId}/env/${envId}?teamId=${teamId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ value: newValue }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `Erro ao salvar no Vercel: ${res.status}`);
  }
}

export async function upsertClient(client: Client): Promise<void> {
  // Supabase takes priority
  if (supabaseUrl && supabaseKey) {
    try {
      const { error } = await getSupabase()
        .from("clients")
        .upsert(clientToRow(client), { onConflict: "slug" });
      if (error) throw new Error(error.message ?? JSON.stringify(error));
      return; // Realizado com sucesso no Supabase
    } catch (e) {
      if (e instanceof Error) throw e;
      throw new Error(typeof e === "object" ? JSON.stringify(e) : String(e));
    }
  }

  // Fallback: Vercel API
  const existing = getClientsFromEnv();
  if (existing.length > 0 || process.env.CLIENTS_JSON) {
    const all = getClientsFromEnv();
    const idx = all.findIndex(c => c.slug === client.slug);
    if (idx >= 0) {
      all[idx] = client;
    } else {
      all.push(client);
    }
    await saveClientsToVercel(all);
    return;
  }

  throw new Error("Nenhum método de persistência configurado.");
}

export async function deleteClientBySlug(slug: string): Promise<boolean> {
  // Supabase takes priority
  if (supabaseUrl && supabaseKey) {
    const { error, count } = await getSupabase()
      .from("clients")
      .delete({ count: "exact" })
      .eq("slug", slug);
    if (!error && (count ?? 0) > 0) return true;
    if (error) throw new Error(error.message ?? JSON.stringify(error));
  }

  // Fallback: Vercel API
  const existing = getClientsFromEnv();
  if (existing.length > 0 || process.env.CLIENTS_JSON) {
    const all = getClientsFromEnv();
    const filtered = all.filter(c => c.slug !== slug);
    if (filtered.length === all.length) return false;
    await saveClientsToVercel(filtered);
    return true;
  }

  return false;
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
