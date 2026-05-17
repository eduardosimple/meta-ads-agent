import { getClients, getClientBySlug, upsertClient } from "@/lib/clients";
import type { Client } from "@/types/client";

const META_API_VERSION = "v19.0";
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

const DEFAULT_BLACKLIST = ["Eduardo Lippert", "Jean Negri"];

export interface BmAdAccount {
  id: string; // act_<id>
  name: string;
  account_status: number;
}

export interface SyncResult {
  registered: Array<{ slug: string; nome: string; ad_account_id: string }>;
  skipped: Array<{ id: string; name: string; reason: string }>;
  errors: string[];
}

/** Lista de nomes a ignorar. Editável via env ACCOUNT_SYNC_BLACKLIST (CSV). */
export function getBlacklist(): string[] {
  const raw = process.env.ACCOUNT_SYNC_BLACKLIST;
  if (!raw || !raw.trim()) return DEFAULT_BLACKLIST;
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}

/** Deriva slug a partir do nome da conta. Remove prefixo "CA - "/"CA-". */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^ca\s*-\s*/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

/** Garante slug único dado um conjunto de slugs já existentes. */
export function uniqueSlug(base: string, existing: Set<string>): string {
  if (!existing.has(base)) return base;
  let i = 2;
  while (existing.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

/** Pagina /me/adaccounts e retorna todas as contas acessíveis pelo token. */
export async function listBmAdAccounts(token: string): Promise<BmAdAccount[]> {
  const accounts: BmAdAccount[] = [];
  let url: string | null =
    `${META_API_BASE}/me/adaccounts?fields=id,name,account_status&limit=100&access_token=${token}`;
  while (url) {
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Graph /me/adaccounts ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      data?: BmAdAccount[];
      paging?: { next?: string };
    };
    accounts.push(...(json.data ?? []));
    url = json.paging?.next ?? null;
  }
  return accounts;
}

/**
 * Detecta contas do Business Manager ausentes do Supabase e cadastra
 * automaticamente as que passam nos filtros (status ACTIVE + fora da blacklist).
 * Idempotente: nunca duplica um ad_account_id já vinculado.
 */
export async function syncAccounts(): Promise<SyncResult> {
  const result: SyncResult = { registered: [], skipped: [], errors: [] };

  const base = await getClientBySlug("simple");
  if (!base?.meta?.access_token) {
    result.errors.push("Cliente 'simple' sem access_token — sync abortado.");
    return result;
  }

  let bmAccounts: BmAdAccount[];
  try {
    bmAccounts = await listBmAdAccounts(base.meta.access_token);
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : String(e));
    return result;
  }

  const clients = await getClients();
  const knownAccounts = new Set(
    clients.map(c => c.meta?.ad_account_id).filter(Boolean) as string[]
  );
  const usedSlugs = new Set(clients.map(c => c.slug));
  const blacklist = getBlacklist().map(b => b.toLowerCase());

  for (const acct of bmAccounts) {
    if (knownAccounts.has(acct.id)) continue; // já cadastrada

    if (acct.account_status !== 1) {
      result.skipped.push({ id: acct.id, name: acct.name, reason: `status ${acct.account_status} (não ACTIVE)` });
      continue;
    }
    const nameLc = (acct.name ?? "").toLowerCase();
    if (blacklist.some(b => nameLc.includes(b))) {
      result.skipped.push({ id: acct.id, name: acct.name, reason: "blacklist" });
      continue;
    }

    const slug = uniqueSlug(slugify(acct.name) || acct.id.replace("act_", "acct-"), usedSlugs);
    const newClient: Client = {
      nome: acct.name,
      slug,
      ativo: true,
      meta: { ...base.meta, ad_account_id: acct.id },
      contexto: {
        cidade: "Chapecó",
        estado: "SC",
        segmento: "A definir",
        publico_alvo: "18-65 anos",
        objetivo_padrao: "OUTCOME_LEADS",
        orcamento_diario_padrao: 2000,
      },
    };

    try {
      await upsertClient(newClient);
      usedSlugs.add(slug);
      knownAccounts.add(acct.id);
      result.registered.push({ slug, nome: acct.name, ad_account_id: acct.id });
    } catch (e) {
      result.errors.push(`upsert ${slug} (${acct.id}): ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return result;
}
