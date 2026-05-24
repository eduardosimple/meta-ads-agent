"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  clientName: string;
}
interface State {
  hasError: boolean;
  message?: string;
}

/**
 * Error boundary por cliente. Isola crashes durante render — um cliente
 * com dado malformado mostra um card de erro local e os demais seguem
 * renderizando normalmente em vez de tudo cair na error.tsx do route.
 */
export default class ClientErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown): State {
    const m = error instanceof Error ? error.message : String(error);
    return { hasError: true, message: m };
  }

  componentDidCatch(error: unknown) {
    const m = error instanceof Error ? error.message : String(error);
    const s = error instanceof Error ? error.stack : "";
    // Mostra no console do server (Vercel logs) e do client (devtools)
    console.error(`[daily-report] crash client=${this.props.clientName}`, m, "\n", s);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-[#18181b] border border-rose-500/30 rounded-2xl p-4 space-y-1.5">
          <p className="text-[11px] tracking-[0.22em] uppercase text-rose-400 font-medium">Erro neste cliente</p>
          <p className="text-sm text-zinc-100 font-semibold">{this.props.clientName}</p>
          <p className="text-xs text-zinc-400 font-mono break-all">{this.state.message ?? "erro desconhecido"}</p>
        </div>
      );
    }
    return this.props.children;
  }
}
