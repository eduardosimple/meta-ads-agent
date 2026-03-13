import fs from "fs";
import path from "path";
import type { Client, ClientsFile } from "@/types/client";

const CLIENTS_PATH = path.join(process.cwd(), "clients.json");
const EXAMPLE_PATH = path.join(process.cwd(), "clients.example.json");

function resolveClientsPath(): string {
  if (fs.existsSync(CLIENTS_PATH)) return CLIENTS_PATH;
  return EXAMPLE_PATH;
}

export function getClients(): Client[] {
  try {
    const filePath = resolveClientsPath();
    const raw = fs.readFileSync(filePath, "utf-8");
    const data: ClientsFile = JSON.parse(raw);
    return data.clientes ?? [];
  } catch {
    return [];
  }
}

export function saveClients(clientes: Client[]): void {
  const data: ClientsFile = { clientes };
  fs.writeFileSync(CLIENTS_PATH, JSON.stringify(data, null, 2), "utf-8");
}

export function getClientBySlug(slug: string): Client | null {
  const clients = getClients();
  return clients.find((c) => c.slug === slug) ?? null;
}

export function upsertClient(client: Client): void {
  const clients = getClients();
  const idx = clients.findIndex((c) => c.slug === client.slug);
  if (idx >= 0) {
    clients[idx] = client;
  } else {
    clients.push(client);
  }
  saveClients(clients);
}

export function deleteClientBySlug(slug: string): boolean {
  const clients = getClients();
  const filtered = clients.filter((c) => c.slug !== slug);
  if (filtered.length === clients.length) return false;
  saveClients(filtered);
  return true;
}
