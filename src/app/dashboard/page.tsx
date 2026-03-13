"use client";

import { useState, useEffect, useCallback } from "react";
import { useAppContext } from "@/context/AppContext";
import MetricCard from "@/components/dashboard/MetricCard";
import PerformanceChart from "@/components/dashboard/PerformanceChart";
import DateRangePicker from "@/components/dashboard/DateRangePicker";
import type { MetricsResponse } from "@/types/metrics";

function getDefaultDates() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return {
    from: from.toISOString().split("T")[0],
    to: to.toISOString().split("T")[0],
  };
}

function formatCurrency(value: number): string {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNumber(value: number): string {
  return value.toLocaleString("pt-BR");
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

const SpendIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
    <path d="M10.75 10.818v2.614A3.13 3.13 0 0011.888 13c.482-.315.612-.648.612-.875 0-.227-.13-.56-.612-.875a3.13 3.13 0 00-1.138-.432zM8.33 8.62c.053.055.115.11.184.164.208.16.46.284.736.363V6.603a2.45 2.45 0 00-.35.13c-.14.065-.27.143-.386.233-.377.292-.514.627-.514.909 0 .184.058.39.33.615z" />
    <path fillRule="evenodd" d="M9.99 2a8 8 0 110 16A8 8 0 019.99 2zM10 4.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zm0 1.5a.75.75 0 01.75.75v.25a2.99 2.99 0 011.77 1.006c.293.363.28.887-.052 1.148-.33.26-.807.246-1.1-.117a1.5 1.5 0 00-.618-.473V9.78c.34.082.662.2.962.35.602.302 1.208.88 1.208 1.87s-.606 1.568-1.208 1.87c-.3.15-.622.268-.962.35v.28a.75.75 0 01-1.5 0v-.28a3.15 3.15 0 01-1.977-1.152.75.75 0 111.172-.937c.246.309.578.495.805.553v-2.11a5.03 5.03 0 01-.827-.282c-.552-.277-1.173-.836-1.173-1.797 0-.96.621-1.52 1.173-1.797a5.03 5.03 0 01.827-.282V6.75A.75.75 0 0110 6z" clipRule="evenodd" />
  </svg>
);

const ImpressionIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
    <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
    <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41z" clipRule="evenodd" />
  </svg>
);

const ClickIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
    <path fillRule="evenodd" d="M6.672 1.911a1 1 0 10-1.932.518l.259.966a1 1 0 001.932-.518l-.26-.966zM2.429 4.74a1 1 0 10-.517 1.932l.966.259a1 1 0 00.517-1.932l-.966-.26zm8.814-.569a1 1 0 00-1.415-1.414l-.707.707a1 1 0 101.415 1.415l.707-.708zm-7.071 7.072l.707-.707A1 1 0 003.465 9.12l-.708.707a1 1 0 001.415 1.415zm3.2-5.171a1 1 0 00-1.3 1.3l4 10a1 1 0 001.823.075l1.38-2.759 3.018 3.02a1 1 0 001.414-1.415l-3.019-3.02 2.76-1.379a1 1 0 00-.076-1.822l-10-4z" clipRule="evenodd" />
  </svg>
);

const CTRIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
    <path fillRule="evenodd" d="M12.577 4.878a.75.75 0 01.919-.53l4.78 1.281a.75.75 0 01.531.919l-1.281 4.78a.75.75 0 01-1.449-.387l.81-3.022a19.407 19.407 0 00-5.594 5.203.75.75 0 01-1.139.093L7 10.06l-4.72 4.72a.75.75 0 01-1.06-1.061l5.25-5.25a.75.75 0 011.06 0l3.074 3.073a20.923 20.923 0 015.545-4.931l-3.042-.815a.75.75 0 01-.53-.918z" clipRule="evenodd" />
  </svg>
);

const CPLIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
    <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
  </svg>
);

export default function DashboardPage() {
  const { token, selectedClient } = useAppContext();
  const { from: defaultFrom, to: defaultTo } = getDefaultDates();
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(defaultTo);
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    if (!token || !selectedClient) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        clientSlug: selectedClient.slug,
        dateFrom,
        dateTo,
      });
      const res = await fetch(`/api/meta/metrics?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao buscar métricas");
      setMetrics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, [token, selectedClient, dateFrom, dateTo]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  if (!selectedClient) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="bg-white rounded-2xl p-12 text-center border border-gray-100 shadow-sm">
          <p className="text-gray-400 text-sm">
            Selecione um cliente para ver as métricas do dashboard
          </p>
        </div>
      </div>
    );
  }

  const s = metrics?.summary;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">{selectedClient.nome}</p>
        </div>
        <DateRangePicker
          dateFrom={dateFrom}
          dateTo={dateTo}
          onChangeFrom={setDateFrom}
          onChangeTo={setDateTo}
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <MetricCard
          icon={<SpendIcon />}
          label="Gasto Total"
          value={s ? formatCurrency(s.total_spend) : loading ? "..." : "R$ 0,00"}
        />
        <MetricCard
          icon={<ImpressionIcon />}
          label="Impressões"
          value={s ? formatNumber(s.total_impressions) : loading ? "..." : "0"}
        />
        <MetricCard
          icon={<ClickIcon />}
          label="Cliques"
          value={s ? formatNumber(s.total_clicks) : loading ? "..." : "0"}
        />
        <MetricCard
          icon={<CTRIcon />}
          label="CTR Médio"
          value={s ? formatPercent(s.avg_ctr) : loading ? "..." : "0,00%"}
        />
        <MetricCard
          icon={<CPLIcon />}
          label="CPL"
          value={s ? (s.cpl > 0 ? formatCurrency(s.cpl) : "—") : loading ? "..." : "—"}
          changeLabel={s && s.total_leads > 0 ? `${s.total_leads} leads` : undefined}
        />
      </div>

      {/* Chart */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          Desempenho por Dia
        </h2>
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div
              className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: "#1877f2", borderTopColor: "transparent" }}
            />
          </div>
        ) : (
          <PerformanceChart data={metrics?.daily ?? []} />
        )}
      </div>
    </div>
  );
}
