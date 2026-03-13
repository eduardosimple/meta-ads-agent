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
      <span className="text-white/80 text-sm font-medium hidden sm:block">
        Cliente:
      </span>
      <select
        value={selectedClient?.slug ?? ""}
        onChange={handleChange}
        disabled={loading}
        className="bg-white/10 text-white border border-white/20 rounded-lg px-3 py-1.5 text-sm
                   focus:outline-none focus:ring-2 focus:ring-white/30
                   hover:bg-white/20 transition-colors cursor-pointer
                   disabled:opacity-50 min-w-[160px]"
      >
        <option value="" className="text-gray-800 bg-white">
          {loading ? "Carregando..." : "Selecionar cliente"}
        </option>
        {clients.map((c: ClientPublic) => (
          <option key={c.slug} value={c.slug} className="text-gray-800 bg-white">
            {c.nome} {!c.ativo ? "(inativo)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
