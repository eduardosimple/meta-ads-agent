"use client";

import { useAppContext } from "@/context/AppContext";
import type { ClientPublic } from "@/types/client";

export function useSelectedClient() {
  const { selectedClient, setSelectedClient } = useAppContext();

  const selectClient = (client: ClientPublic | null) => {
    setSelectedClient(client);
  };

  const clearClient = () => {
    setSelectedClient(null);
  };

  return {
    selectedClient,
    selectClient,
    clearClient,
    hasClient: !!selectedClient,
  };
}
