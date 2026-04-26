"use client";

import { useState } from "react";

interface Props {
  clientSlug: string;
  date: string;
  adId: string;
  platform: "meta" | "google";
  actionType: "pause" | "scale";
  label: string;
  reportKey: string;
  initialStatus: string;
  initialResultMessage?: string;
}

export default function ActionButton({
  clientSlug, date, adId, platform, actionType, label, reportKey,
  initialStatus, initialResultMessage,
}: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(initialResultMessage ?? "");

  if (status === "approved") {
    return (
      <p className="text-xs text-green-600 font-medium mt-1">
        Executado — {result}
      </p>
    );
  }

  if (status === "rejected") {
    return <p className="text-xs text-gray-400 mt-1">Ignorado.</p>;
  }

  async function execute() {
    setLoading(true);
    try {
      const res = await fetch(`/api/daily-reports/${clientSlug}/proposals/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-report-key": reportKey },
        body: JSON.stringify({ date, ad_id: adId, platform, action_type: actionType }),
      });
      const data = await res.json();
      if (data.ok) {
        setStatus("approved");
        setResult(data.result_message ?? "Executado.");
      } else {
        setResult(`Erro: ${data.error}`);
      }
    } catch (e) {
      setResult(`Erro: ${e}`);
    } finally {
      setLoading(false);
    }
  }

  async function ignore() {
    setLoading(true);
    try {
      await fetch(`/api/daily-reports/${clientSlug}/proposals`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-report-key": reportKey },
        body: JSON.stringify({ date, ad_id: adId, platform, status: "rejected" }),
      });
      setStatus("rejected");
    } finally {
      setLoading(false);
    }
  }

  const isPause = actionType === "pause";

  return (
    <div className="mt-2 space-y-1">
      {result && <p className="text-xs text-red-500">{result}</p>}
      <div className="flex gap-2">
        <button
          onClick={execute}
          disabled={loading}
          className={`flex-1 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-50 transition-colors ${
            isPause
              ? "bg-red-500 hover:bg-red-600"
              : "bg-green-600 hover:bg-green-700"
          }`}
        >
          {loading ? "Executando..." : label}
        </button>
        <button
          onClick={ignore}
          disabled={loading}
          className="px-3 py-2 rounded-xl text-xs font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 transition-colors"
        >
          Ignorar
        </button>
      </div>
    </div>
  );
}
