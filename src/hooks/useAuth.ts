"use client";

import { useCallback } from "react";
import { useAppContext } from "@/context/AppContext";

export function useAuth() {
  const { isAuthenticated, token, login, logout } = useAppContext();

  const authenticate = useCallback(
    async (password: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const res = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });

        const data = await res.json();

        if (!res.ok) {
          return { success: false, error: data.error ?? "Autenticação falhou" };
        }

        login(data.token);
        return { success: true };
      } catch {
        return { success: false, error: "Erro de conexão" };
      }
    },
    [login]
  );

  return { isAuthenticated, token, authenticate, logout };
}
