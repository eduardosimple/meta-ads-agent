"use client";

import { useState } from "react";
import CampaignRow from "./CampaignRow";
import type { Campaign, CampaignStatus } from "@/types/campaign";

interface Props {
  campaigns: Campaign[];
  loading: boolean;
  error?: string | null;
}

export default function CampaignTable({ campaigns, loading, error }: Props) {
  const [items, setItems] = useState<Campaign[]>(campaigns);

  // Sync when prop changes
  if (campaigns !== items && !loading) {
    setItems(campaigns);
  }

  function handleStatusChange(id: string, newStatus: CampaignStatus) {
    setItems((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: newStatus } : c))
    );
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-8 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div
              className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: "#1877f2", borderTopColor: "transparent" }}
            />
            <p className="text-sm text-gray-500">Carregando campanhas...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-6">
        <p className="text-red-500 text-sm">{error}</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
        <p className="text-gray-400 text-sm">Nenhuma campanha encontrada.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Campanha
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Objetivo
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Orçamento
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Criado em
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Ações
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((campaign) => (
              <CampaignRow
                key={campaign.id}
                campaign={campaign}
                onStatusChange={handleStatusChange}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
        <p className="text-xs text-gray-400">
          {items.length} campanha{items.length !== 1 ? "s" : ""}
        </p>
      </div>
    </div>
  );
}
