"use client";

import { useState } from "react";

interface Props {
  slug: string;
  date: string;
  adId: string;
  platform: "meta" | "google";
  /** Derivado do tipo da action da proposta (pause / scale / update_targeting / create_adset). */
  actionType: "pause" | "scale" | "update_targeting" | "create_adset";
  viewKey: string;
}

/** Aprova (1 clique) uma proposta "awaiting_approval".
 *  Reusa o endpoint /proposals/execute que já existe (mesmo usado pelo
 *  ActionButton/TargetingChangeCard) — auth via header x-report-key, body
 *  { date, ad_id, platform, action_type }. Em sucesso, recarrega a página. */
export default function ApproveButton({ slug, date, adId, platform, actionType, viewKey }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function approve() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/daily-reports/${slug}/proposals/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-report-key": viewKey },
        body: JSON.stringify({ date, ad_id: adId, platform, action_type: actionType }),
      });
      const data = await res.json();
      if (data.ok) {
        location.reload();
      } else {
        setError(data.message ?? data.error ?? "Erro ao aprovar.");
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
        onClick={approve}
        disabled={loading}
        className="w-full py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-colors"
      >
        {loading ? "Aprovando..." : "Aprovar"}
      </button>
    </div>
  );
}
