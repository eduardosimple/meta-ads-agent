"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useClients } from "@/hooks/useClients";
import { useSelectedClient } from "@/hooks/useSelectedClient";
import type { ClientPublic } from "@/types/client";

export default function ClientSelector() {
  const { clients, loading, refetch } = useClients();
  const { selectedClient, selectClient } = useSelectedClient();
  const pathname = usePathname();

  // Refetch clients whenever the route changes so new clients appear immediately
  useEffect(() => {
    refetch();
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync selectedClient with fresh server data so cached localStorage doesn't go stale
  useEffect(() => {
    if (!selectedClient || clients.length === 0) return;
    const fresh = clients.find(c => c.slug === selectedClient.slug);
    if (fresh && JSON.stringify(fresh) !== JSON.stringify(selectedClient)) {
      selectClient(fresh);
    }
  }, [clients]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const slug = e.target.value;
    if (!slug) {
      selectClient(null);
      return;
    }
    const found = clients.find((c) => c.slug === slug) ?? null;
    selectClient(found);
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-zinc-400 text-sm font-medium hidden sm:block">
        Cliente:
      </span>
      <select
        value={selectedClient?.slug ?? ""}
        onChange={handleChange}
        disabled={loading}
        className="bg-[#18181b] text-zinc-100 border border-[#1c1c20] rounded-lg px-3 py-1.5 text-sm
                   focus:outline-none focus:ring-2 focus:ring-violet-500/40
                   hover:bg-[#27272a] transition-colors cursor-pointer
                   disabled:opacity-50 min-w-[160px]"
      >
        <option value="" className="text-zinc-100 bg-[#18181b]">
          {loading ? "Carregando..." : "Selecionar cliente"}
        </option>
        {clients.map((c: ClientPublic) => (
          <option key={c.slug} value={c.slug} className="text-zinc-100 bg-[#18181b]">
            {c.nome} {!c.ativo ? "(inativo)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
