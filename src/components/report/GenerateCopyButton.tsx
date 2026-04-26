"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  clientSlug: string;
  date: string;
  adId: string;
  platform: "meta" | "google";
  reportKey: string;
  verdict: "ajustar" | "testar_variacao";
}

export default function GenerateCopyButton({ clientSlug, date, adId, platform, reportKey, verdict }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function generate() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/daily-reports/${clientSlug}/proposals/generate-copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-report-key": reportKey },
        body: JSON.stringify({ date, ad_id: adId, platform }),
      });
      const data = await res.json();
      if (data.ok) {
        router.refresh();
      } else {
        setError(data.error ?? "Erro ao gerar sugestão");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-2 space-y-1">
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button
        onClick={generate}
        disabled={loading}
        className="w-full py-2 rounded-xl text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 transition-colors"
      >
        {loading
          ? "Gerando sugestão de criativo..."
          : verdict === "ajustar"
          ? "Gerar sugestão de ajuste"
          : "Gerar variação para teste"}
      </button>
    </div>
  );
}
