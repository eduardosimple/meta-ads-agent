"use client";

import { useState } from "react";

interface Props {
  slug: string;
  date: string;
  proposalId: string;
  viewKey: string;
}

/** Desfaz uma ação que o agente já EXECUTOU automaticamente
 *  (pausar→retomar, escalar→budget antigo). Chama o endpoint /undo
 *  que já existe e, em sucesso, recarrega a página. */
export default function UndoButton({ slug, date, proposalId, viewKey }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function undo() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/daily-reports/${slug}/proposals/undo?view_key=${encodeURIComponent(viewKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, proposal_id: proposalId }),
        },
      );
      const data = await res.json();
      if (data.ok) {
        location.reload();
      } else {
        setError(data.message ?? data.error ?? "Erro ao desfazer.");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-2 space-y-1">
      {error && <p className="text-xs text-rose-400">{error}</p>}
      <button
        onClick={undo}
        disabled={loading}
        className="px-3 py-1.5 rounded-xl text-xs font-medium text-zinc-300 bg-zinc-800/60 hover:bg-zinc-700/60 disabled:opacity-50 transition-colors"
      >
        {loading ? "Desfazendo..." : "Desfazer"}
      </button>
    </div>
  );
}
