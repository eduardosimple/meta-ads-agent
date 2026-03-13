"use client";

import { useEffect, useRef } from "react";
import type { DailyMetric } from "@/types/metrics";

interface Props {
  data: DailyMetric[];
}

export default function PerformanceChart({ data }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;
    const padding = { top: 20, right: 20, bottom: 40, left: 60 };
    const chartW = W - padding.left - padding.right;
    const chartH = H - padding.top - padding.bottom;

    ctx.clearRect(0, 0, W, H);

    const maxSpend = Math.max(...data.map((d) => d.spend), 1);
    const maxClicks = Math.max(...data.map((d) => d.clicks), 1);

    function xPos(i: number) {
      return padding.left + (i / (data.length - 1)) * chartW;
    }

    function ySpend(v: number) {
      return padding.top + chartH - (v / maxSpend) * chartH;
    }

    function yClicks(v: number) {
      return padding.top + chartH - (v / maxClicks) * chartH;
    }

    // Grid lines
    ctx.strokeStyle = "#f0f2f5";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartW, y);
      ctx.stroke();
    }

    // Y axis labels (spend)
    ctx.fillStyle = "#9ca3af";
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
      const v = maxSpend * (1 - i / 4);
      const y = padding.top + (chartH / 4) * i;
      ctx.fillText(
        v >= 1000 ? `R$${(v / 1000).toFixed(1)}k` : `R$${v.toFixed(0)}`,
        padding.left - 6,
        y + 4
      );
    }

    // Spend line (blue gradient)
    if (data.length > 1) {
      const spendGrad = ctx.createLinearGradient(padding.left, 0, padding.left + chartW, 0);
      spendGrad.addColorStop(0, "#1877f2");
      spendGrad.addColorStop(1, "#42b72a");

      // Fill area under spend
      ctx.beginPath();
      ctx.moveTo(xPos(0), padding.top + chartH);
      data.forEach((d, i) => ctx.lineTo(xPos(i), ySpend(d.spend)));
      ctx.lineTo(xPos(data.length - 1), padding.top + chartH);
      ctx.closePath();
      ctx.fillStyle = "rgba(24,119,242,0.08)";
      ctx.fill();

      // Spend line
      ctx.beginPath();
      data.forEach((d, i) => {
        if (i === 0) ctx.moveTo(xPos(i), ySpend(d.spend));
        else ctx.lineTo(xPos(i), ySpend(d.spend));
      });
      ctx.strokeStyle = spendGrad;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = "round";
      ctx.stroke();

      // Clicks line (green)
      ctx.beginPath();
      data.forEach((d, i) => {
        if (i === 0) ctx.moveTo(xPos(i), yClicks(d.clicks));
        else ctx.lineTo(xPos(i), yClicks(d.clicks));
      });
      ctx.strokeStyle = "#42b72a";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // X axis labels (dates)
    ctx.fillStyle = "#9ca3af";
    ctx.font = "10px system-ui, sans-serif";
    ctx.textAlign = "center";
    const labelStep = Math.max(1, Math.floor(data.length / 7));
    data.forEach((d, i) => {
      if (i % labelStep === 0 || i === data.length - 1) {
        const date = d.date.slice(5); // MM-DD
        ctx.fillText(date, xPos(i), H - 8);
      }
    });

    // Legend
    ctx.fillStyle = "#1877f2";
    ctx.fillRect(padding.left, 4, 16, 3);
    ctx.fillStyle = "#374151";
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Gasto", padding.left + 20, 10);

    ctx.strokeStyle = "#42b72a";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(padding.left + 80, 5.5);
    ctx.lineTo(padding.left + 96, 5.5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#374151";
    ctx.fillText("Cliques", padding.left + 100, 10);
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        Sem dados para o período selecionado
      </div>
    );
  }

  return (
    <div className="w-full h-64 relative">
      <canvas ref={canvasRef} className="w-full h-full" style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
