/**
 * ChecklistRevisao — bloco da Revisão Diária no formato ClickUp.
 * Mostra as 5 ações fixas, cada uma com status (check/atencao/verificar_manual)
 * + lista de sub_acoes propostas (pra status atencao).
 *
 * Dark theme alinhado ao restante do daily-report (zinc-950/900).
 */
"use client";
import { useState } from "react";
import type { ChecklistAction, ChecklistSubAction, Proposal } from "@/types/metrics";
import UploadCriativoModal from "@/components/creatives/UploadCriativoModal";
import ApprovalCard from "@/components/report/ApprovalCard";

const STATUS_META: Record<ChecklistAction["status"], { icon: string; color: string; label: string }> = {
  check: { icon: "✓", color: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", label: "OK" },
  atencao: { icon: "!", color: "bg-amber-500/15 text-amber-300 border-amber-500/30", label: "Ação" },
  verificar_manual: { icon: "?", color: "bg-blue-500/15 text-blue-300 border-blue-500/30", label: "Manual" },
};

// Títulos canônicos das 5 ações ClickUp — usados como fallback quando Claude
// omite titulo no JSON (sempre na mesma ordem).
const TITULOS_CANONICOS = [
  "Verificar veiculação ontem/hoje",
  "Pausar criativos ou públicos com CPA muito acima da média",
  "Subir criativos enviados pelo cliente (verificar pasta Drive)",
  "Realocar 20% pra campanhas vencedoras",
  "Garantir pelo menos 4 criativos por conjunto de anúncios",
];

function fmtMoney(v?: number) {
  if (v == null) return "—";
  return `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}

/** Botão que EXECUTA a pausa do anúncio no Meta (via portal) — reusa o mesmo
 *  endpoint do ActionButton, autenticado pelo view_key. A ação 2 da revisão
 *  ("pausar CPA muito acima da média") precisa ser EXECUTADA, não só sugerida. */
function PauseAdButton({ slug, viewKey, dailyDate, adId, adName }: {
  slug: string; viewKey: string; dailyDate: string; adId: string; adName?: string;
}) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  if (state === "done") {
    return <p className="text-[11px] text-emerald-300 font-medium mt-2">✓ Anúncio pausado{msg ? ` — ${msg}` : ""}</p>;
  }

  async function pause() {
    if (!confirm(`Pausar o anúncio ${adName ?? adId} agora? A pausa é aplicada no Meta.`)) return;
    setState("loading");
    try {
      const r = await fetch(`/api/daily-reports/${slug}/proposals/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-report-key": viewKey },
        body: JSON.stringify({ date: dailyDate, ad_id: adId, platform: "meta", action_type: "pause" }),
      });
      const d = await r.json();
      if (d.ok) { setState("done"); setMsg(d.result_message ?? ""); }
      else { setState("error"); setMsg(d.error ?? "falha ao pausar"); }
    } catch (e) { setState("error"); setMsg(String(e)); }
  }

  return (
    <div className="mt-2">
      <button
        onClick={pause}
        disabled={state === "loading"}
        className="text-xs px-2.5 py-1 rounded border border-rose-500/40 bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 font-semibold disabled:opacity-50"
      >
        {state === "loading" ? "Pausando..." : "Pausar anúncio"}
      </button>
      {state === "error" && <p className="text-[11px] text-rose-300 mt-1">Erro: {msg}</p>}
    </div>
  );
}

/** Botão que CRIA um conjunto-base pausado clonando a config do conjunto atual
 *  (mesma campanha + criativos), pronto pra receber o novo público sugerido.
 *  Nunca edita o conjunto existente (regra inviolável) — sempre cria novo, pausado. */
function NovoPublicoButton({ slug, viewKey, dailyDate, adsetId, adsetName }: {
  slug: string; viewKey: string; dailyDate: string; adsetId: string; adsetName?: string;
}) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  if (state === "done") {
    return <p className="text-[11px] text-emerald-300 font-medium mt-2">✓ Conjunto-base criado (pausado){msg ? ` — ${msg}` : ""}</p>;
  }

  async function criar() {
    if (!confirm("Criar um conjunto NOVO (pausado) clonando este, pra você ajustar o novo público no gerenciador? O conjunto atual não é alterado.")) return;
    setState("loading");
    try {
      const r = await fetch("/api/proposals/execute-public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          view_key: viewKey, slug,
          period_kind: "week", period_id: dailyDate, proposal_index: -1,
          action: "create_adset",
          params: {
            source_adset_id: adsetId,
            name: `[NOVO PUBLICO] ${adsetName ?? adsetId} ${dailyDate}`,
          },
        }),
      });
      const d = await r.json();
      if (d.ok || d.create_ok || d.result?.create_ok) { setState("done"); setMsg(d.result?.new_adset_id ? `id ${d.result.new_adset_id}` : ""); }
      else { setState("error"); setMsg(d.message ?? d.error ?? "falha"); }
    } catch (e) { setState("error"); setMsg(String(e)); }
  }

  return (
    <div className="mt-1.5">
      <button
        onClick={criar}
        disabled={state === "loading"}
        className="text-xs px-2.5 py-1 rounded border border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/20 text-sky-200 disabled:opacity-50"
      >
        {state === "loading" ? "Criando..." : "Criar conjunto p/ novo público"}
      </button>
      {state === "error" && <p className="text-[11px] text-rose-300 mt-1">Erro: {msg}</p>}
    </div>
  );
}

function SubAcaoItem({ s, slug, clientName, viewKey, showUploadButton, showAIButton, showPauseButton, dailyDate, relatedProposals }: {
  s: ChecklistSubAction; slug?: string; clientName?: string; viewKey?: string;
  showUploadButton?: boolean; showAIButton?: boolean; showPauseButton?: boolean; dailyDate?: string;
  /** Proposals relacionadas a esse adset/ad — usadas pra renderizar
   *  o ApprovalCard inline assim que o pipeline IA termina. */
  relatedProposals?: Proposal[];
}) {
  // Filtra proposals que correspondem a esse alvo (ad_id ou adset_id)
  // E estão prontas (com copy_sugerida) OU em processamento.
  const matchedProposals = (relatedProposals ?? []).filter(p => {
    const extra = p as unknown as { target_adset_id?: string };
    const targetMatch = (s.adset_id && (p.ad_id === s.adset_id || extra.target_adset_id === s.adset_id))
      || (s.ad_id && p.ad_id === s.ad_id);
    if (!targetMatch) return false;
    return ["creative_requested", "generating", "pending", "creative_error"].includes(p.status);
  });
  return (
    <li className="text-xs border-l-2 border-zinc-700 pl-3 py-1.5">
      <p className="text-zinc-200">{s.descricao}</p>
      {(s.ad_name || s.adset_name) && (
        <p className="text-zinc-500 text-[11px] mt-0.5">
          {s.ad_name && <>Ad: <span className="text-zinc-400">{s.ad_name}</span> </>}
          {s.adset_name && <>· GA: <span className="text-zinc-400">{s.adset_name}</span> </>}
        </p>
      )}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-zinc-500">
        {s.cpl_atual != null && <span>CPL: <b className="text-rose-300">{fmtMoney(s.cpl_atual)}</b></span>}
        {s.daily_budget_atual != null && s.daily_budget_sugerido != null && (
          <span>Budget: <b className="text-zinc-300">{fmtMoney(s.daily_budget_atual)}</b> → <b className="text-emerald-300">{fmtMoney(s.daily_budget_sugerido)}</b></span>
        )}
        {s.ads_ativos_atual != null && s.ads_faltantes != null && (
          <span>Ads: <b className="text-zinc-300">{s.ads_ativos_atual}</b> · faltam <b className="text-amber-300">{s.ads_faltantes}</b></span>
        )}
      </div>
      {s.motivo && <p className="text-[11px] text-zinc-500 mt-0.5"><i>{s.motivo}</i></p>}
      {/* AÇÃO 2: pausa EXECUTÁVEL do anúncio com CPA fora da curva (não só sugestão). */}
      {showPauseButton && s.ad_id && slug && viewKey && dailyDate && (
        <PauseAdButton slug={slug} viewKey={viewKey} dailyDate={dailyDate} adId={s.ad_id} adName={s.ad_name} />
      )}
      {(s.sugestao_novo_criativo || s.sugestao_novo_publico) && (
        <div className="mt-1.5 text-[11px] space-y-1">
          {s.sugestao_novo_criativo && <p className="text-purple-300">→ Criativo: <span className="text-zinc-300">{s.sugestao_novo_criativo}</span></p>}
          {s.sugestao_novo_publico && (
            <div className="space-y-0.5">
              <p className="text-purple-300">→ Público: <span className="text-zinc-300">{s.sugestao_novo_publico}</span></p>
              {showPauseButton && s.adset_id && slug && viewKey && dailyDate && (
                <NovoPublicoButton slug={slug} viewKey={viewKey} dailyDate={dailyDate} adsetId={s.adset_id} adsetName={s.adset_name} />
              )}
            </div>
          )}
        </div>
      )}
      {(showUploadButton || showAIButton) && slug && clientName && viewKey && (
        <div className="flex gap-1.5 mt-2">
          {showUploadButton && (
            <UploadCriativoModal
              slug={slug}
              clientName={clientName}
              viewKey={viewKey}
              preselectedAdsetId={s.adset_id}
              preselectedAdsetName={s.adset_name}
              triggerLabel="Enviar criativo do cliente"
            />
          )}
          {showAIButton && dailyDate && (s.ad_id || s.adset_id) && (
            <button
              onClick={async () => {
                const isReplace = !!s.ad_id;
                const msg = isReplace
                  ? "Solicitar gerar criativo SUBSTITUTO via IA (design-agent)?"
                  : "Solicitar gerar criativo NOVO pra completar este GA via IA (design-agent)?";
                if (!confirm(msg)) return;
                const params: Record<string, string> = { date: dailyDate };
                if (s.ad_id) params.ad_id = s.ad_id;
                else if (s.adset_id) params.adset_id = s.adset_id;
                const r = await fetch("/api/proposals/execute-public", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    view_key: viewKey, slug,
                    period_kind: "week", period_id: dailyDate,
                    proposal_index: -1, action: "request_creative",
                    params,
                  }),
                });
                const data = await r.json();
                alert(data.ok ? "Solicitação enviada pra fila de criativos." : `Erro: ${data.message ?? data.error}`);
              }}
              className="text-xs px-2 py-1 rounded border border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/15 text-purple-200"
            >
              Gerar com IA
            </button>
          )}
        </div>
      )}
      {/* Resultado do pipeline IA — aparece INLINE aqui, no mesmo lugar do botão. */}
      {matchedProposals.length > 0 && slug && viewKey && dailyDate && (
        <div className="mt-2 space-y-2">
          {matchedProposals.map(p => {
            if (p.status === "creative_requested") {
              return (
                <div key={p.id} className="text-[11px] px-2 py-1.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-200">
                  ⏳ NA FILA — design-agent vai processar no próximo tick (~3min).
                </div>
              );
            }
            if (p.status === "generating") {
              return (
                <div key={p.id} className="text-[11px] px-2 py-1.5 rounded border border-blue-500/40 bg-blue-500/10 text-blue-200">
                  🤖 GERANDO copy + imagem agora.
                </div>
              );
            }
            if (p.status === "creative_error") {
              return (
                <div key={p.id} className="text-[11px] px-2 py-1.5 rounded border border-rose-500/40 bg-rose-500/10 text-rose-200">
                  ⚠ Falhou. Tente clicar "Gerar com IA" novamente OU "Enviar criativo do cliente".
                </div>
              );
            }
            if (p.status === "pending" && p.copy_sugerida) {
              const extra = p as unknown as { request_target?: "replace_ad" | "new_ad_in_adset"; target_adset_id?: string };
              return (
                <ApprovalCard
                  key={p.id}
                  clientSlug={slug}
                  date={dailyDate}
                  adId={p.ad_id}
                  platform="meta"
                  adName={p.ad_name}
                  imageBase64={p.copy_sugerida.image_base64}
                  versaoA={p.copy_sugerida.versao_a}
                  versaoB={p.copy_sugerida.versao_b}
                  initialStatus={p.status}
                  resultMessage={p.result_message}
                  reportKey={viewKey}
                  requestTarget={extra.request_target}
                  targetAdsetId={extra.target_adset_id}
                />
              );
            }
            return null;
          })}
        </div>
      )}
    </li>
  );
}

export default function ChecklistRevisao({
  checklist, slug, clientName, viewKey, dailyDate, proposals,
}: {
  checklist: ChecklistAction[];
  slug?: string;
  clientName?: string;
  viewKey?: string;
  dailyDate?: string;
  /** Proposals com copy_sugerida/status pra renderizar inline no SubAcaoItem. */
  proposals?: Proposal[];
}) {
  if (!checklist || checklist.length === 0) return null;

  const totalAtencao = checklist.filter(c => c.status === "atencao").length;
  const totalCheck = checklist.filter(c => c.status === "check").length;
  const totalManual = checklist.filter(c => c.status === "verificar_manual").length;

  // Borda muda de cor pela severidade
  const borderClass = totalAtencao > 0
    ? "border-amber-500/40"
    : totalManual > 0
    ? "border-blue-500/30"
    : "border-emerald-500/30";

  return (
    <div className={`border-2 rounded-xl bg-gradient-to-br from-[#0e0e10] to-[#141416] overflow-hidden ${borderClass}`}>
      <div className="px-4 py-3 border-b border-[#1c1c20] flex items-baseline justify-between bg-zinc-900/40">
        <h3 className="font-bold text-base text-zinc-50 flex items-center gap-2">
          <span className="text-amber-300">📋</span>
          Checklist da Revisão Diária
        </h3>
        <div className="text-xs flex gap-3 text-zinc-400">
          <span><span className="text-emerald-300 font-bold text-sm">{totalCheck}</span> ok</span>
          <span><span className={`font-bold text-sm ${totalAtencao > 0 ? "text-amber-300" : "text-zinc-600"}`}>{totalAtencao}</span> ação</span>
          <span><span className="text-blue-300 font-bold text-sm">{totalManual}</span> manual</span>
        </div>
      </div>
      <ul className="divide-y divide-[#1c1c20]">
        {checklist.map((a, idx) => {
          const meta = STATUS_META[a.status] ?? STATUS_META.verificar_manual;
          const displayId = a.id ?? idx + 1;
          const displayTitulo = a.titulo || TITULOS_CANONICOS[idx] || "Ação sem título";
          return (
            <li key={idx} className="px-4 py-3">
              <div className="flex items-start gap-3">
                <span className={`shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold border ${meta.color}`}>
                  {meta.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <p className="font-medium text-zinc-100 text-sm">
                      <span className="text-zinc-500 mr-1.5">{displayId}.</span>{displayTitulo}
                    </p>
                    <span className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded border ${meta.color}`}>{meta.label}</span>
                  </div>
                  {a.resumo && <p className="text-xs text-zinc-400 mt-0.5">{a.resumo}</p>}
                  {a.sub_acoes && a.sub_acoes.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {a.sub_acoes.map((s, i) => (
                        <SubAcaoItem
                          key={i}
                          s={s}
                          slug={slug}
                          clientName={clientName}
                          viewKey={viewKey}
                          dailyDate={dailyDate}
                          relatedProposals={proposals}
                          // Ação 2 (CPA alto): pausar (executável) + gerar IA (substitui ad) + enviar do cliente + criar conjunto p/ novo público.
                          // Ação 5 (4 criativos por GA): gerar IA (criativo NOVO no GA) + enviar do cliente.
                          showUploadButton={displayId === 2 || displayId === 5}
                          showAIButton={displayId === 2 || displayId === 5}
                          showPauseButton={displayId === 2}
                        />
                      ))}
                    </ul>
                  )}
                  {/* Ação 3 (subir criativo do cliente) — botão direto mesmo sem sub_acoes */}
                  {displayId === 3 && slug && clientName && viewKey && (
                    <div className="mt-2">
                      <UploadCriativoModal
                        slug={slug}
                        clientName={clientName}
                        viewKey={viewKey}
                        triggerLabel="Subir criativo enviado pelo cliente"
                      />
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
