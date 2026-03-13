"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import type { ClientPublic } from "@/types/client";

interface AppContextValue {
  selectedClient: ClientPublic | null;
  setSelectedClient: (client: ClientPublic | null) => void;
  isAuthenticated: boolean;
  token: string | null;
  login: (token: string) => void;
  logout: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [selectedClient, setSelectedClientState] = useState<ClientPublic | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const storedToken = localStorage.getItem("auth_token");
    const storedClient = localStorage.getItem("selected_client");

    if (storedToken) setToken(storedToken);
    if (storedClient) {
      try {
        setSelectedClientState(JSON.parse(storedClient));
      } catch {
        localStorage.removeItem("selected_client");
      }
    }
    setHydrated(true);
  }, []);

  const setSelectedClient = useCallback((client: ClientPublic | null) => {
    setSelectedClientState(client);
    if (client) {
      localStorage.setItem("selected_client", JSON.stringify(client));
    } else {
      localStorage.removeItem("selected_client");
    }
  }, []);

  const login = useCallback((newToken: string) => {
    setToken(newToken);
    localStorage.setItem("auth_token", newToken);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setSelectedClientState(null);
    localStorage.removeItem("auth_token");
    localStorage.removeItem("selected_client");
  }, []);

  if (!hydrated) return null;

  return (
    <AppContext.Provider
      value={{
        selectedClient,
        setSelectedClient,
        isAuthenticated: !!token,
        token,
        login,
        logout,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used within AppProvider");
  return ctx;
}
