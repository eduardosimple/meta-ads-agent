"use client";

import { useState } from "react";
import { useAppContext } from "@/context/AppContext";
import CampaignStatusBadge from "./CampaignStatusBadge";
import type { Campaign } from "@/types/campaign";

interface Props {
  campaign: Campaign;
  onStatusChange: (id: string, newStatus: "ACTIVE" | "PAUSED") => void;
  platform?: "meta" | "google";
}

function formatBudget(daily?: string, lifetime?: string): string {
  const val = daily ?? lifetime;
  if (!val) return "—";
  const num = parseInt(val, 10) / 100;
  return `R$ ${num.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}${daily ? "/dia" : " total"}`;
}

export default function CampaignRow({ campaign, onStatusChange, platform = "meta" }: Props) {
  const { token, selectedClient } = useAppContext();
  const [loading, setLoading] = useState(false);

  async function handleToggle() {
    if (!token || !selectedClient) return;
    const newStatus = campaign.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    setLoading(true);
    try {
      const endpoint = platform === "google" ? "/api/google/campaigns" : "/api/meta/campaigns";
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          campaignId: campaign.id,
          status: platform === "google" ? (newStatus === "ACTIVE" ? "ENABLED" : "PAUSED") : newStatus,
          clientSlug: selectedClient.slug,
        }),
      });
      if (res.ok) onStatusChange(campaign.id, newStatus);
    } finally {
      setLoading(false);
    }
  }

  return (
    <tr className="border-b border-gray-100 hover:bg-blue-50/30 transition-colors">
      <td className="px-4 py-3 text-sm font-medium text-gray-800">
        <div className="max-w-xs truncate" title={campaign.name}>
          {campaign.name}
        </div>
        <div className="text-xs text-gray-400 mt-0.5">ID: {campaign.id}</div>
      </td>
      <td className="px-4 py-3">
        <CampaignStatusBadge status={campaign.status} />
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {campaign.objective?.replace("OUTCOME_", "").replace("_", " ")}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {formatBudget(campaign.daily_budget, campaign.lifetime_budget)}
      </td>
      <td className="px-4 py-3 text-sm text-gray-500">
        {campaign.created_time
          ? new Date(campaign.created_time).toLocaleDateString("pt-BR")
          : "—"}
      </td>
      <td className="px-4 py-3 text-right">
        {campaign.status !== "DELETED" && campaign.status !== "ARCHIVED" && (
          <button
            onClick={handleToggle}
            disabled={loading}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all disabled:opacity-50 ${
              campaign.status === "ACTIVE"
                ? "border-gray-300 text-gray-600 hover:bg-gray-100"
                : "border-blue-300 text-blue-600 hover:bg-blue-50"
            }`}
          >
            {loading ? "..." : campaign.status === "ACTIVE" ? "Pausar" : "Ativar"}
          </button>
        )}
      </td>
    </tr>
  );
}
