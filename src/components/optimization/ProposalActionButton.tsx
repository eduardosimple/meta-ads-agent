"use client";

import { useState } from "react";

interface Props {
  slug: string;
  periodKind: "week" | "month";
  periodId: string;
  proposalIndex: number;
  action: "pause_adset" | "create_adset" | "request_creative" | "create_lal" | "mark_seen";
  params?: Record<string, unknown>;
  label: string;
  variant?: "primary" | "subtle";
  alreadyExecuted?: boolean;
  /** Chave reportKey/REPORT_VIEW_SECRET pra fazer auth no execute. */
  authKey: string;
}

export default function ProposalActionButton({
  slug, periodKind, periodId, proposalIndex, action, params, label, variant, alreadyExecuted, authKey,
}: Props) {
  const [state, setState] = useState<"idle" | "running" | "ok" | "err">(alreadyExecuted ? "ok" : "idle");
  const [msg, setMsg] = useState<string>("");

  const base = variant === "subtle"
    ? "border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-zinc-100"
    : "border-emerald-500/40 hover:border-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-300";
  const okCls = "border-emerald-500/50 bg-emerald-500/15 text-emerald-200 cursor-not-allowed";
  const errCls = "border-rose-500/50 bg-rose-500/15 text-rose-200";

  async function run() {
    if (state === "running" || state === "ok") return;
    if (!confirm(`Confirma executar: ${label}?`)) return;
    setState("running");
    try {
      const r = await fetch("/api/proposals/execute-public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          view_key: authKey,
          slug, period_kind: periodKind, period_id: periodId,
          proposal_index: proposalIndex, action, params,
        }),
      });
      const data = await r.json();
      if (r.ok && data.ok) {
        setState("ok");
        setMsg("aplicado");
      } else {
        setState("err");
        setMsg(data.error ?? `HTTP ${r.status}`);
      }
    } catch (e) {
      setState("err");
      setMsg(String(e));
    }
  }

  const cls = state === "ok" ? okCls : state === "err" ? errCls : base;
  const text = state === "running" ? "aplicando…" : state === "ok" ? "✓ aplicado" : state === "err" ? `⚠ ${msg.slice(0, 40)}` : label;
  return (
    <button
      onClick={run}
      disabled={state === "running" || state === "ok"}
      className={`text-xs px-3 py-1 rounded border transition ${cls}`}
    >
      {text}
    </button>
  );
}
