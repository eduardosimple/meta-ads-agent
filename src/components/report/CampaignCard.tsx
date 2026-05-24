import type { CampaignAnalysis, Proposal } from "@/types/metrics";

const verdictTone: Record<CampaignAnalysis["verdict"], { label: string; cls: string }> = {
  manter: { label: "MANTER", cls: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30" },
  ajustar: { label: "AJUSTAR", cls: "bg-amber-500/15 text-amber-300 border border-amber-500/30" },
  substituir: { label: "SUBSTITUIR", cls: "bg-gradient-to-r from-[#7c3aed] to-[#3b82f6] text-white border border-[#7c3aed]/40 shadow-[0_4px_20px_-4px_rgba(124,58,237,0.4)]" },
  pausar: { label: "PAUSAR", cls: "bg-rose-500/15 text-rose-300 border border-rose-500/30" },
};

const papelAdTone: Record<string, { label: string; cls: string }> = {
  manter: { label: "MANTER", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  escalar: { label: "ESCALAR", cls: "bg-emerald-500/25 text-emerald-200 border-emerald-500/40" },
  pausar: { label: "PAUSAR", cls: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
  substituir: { label: "SUBSTITUIR", cls: "bg-violet-500/15 text-violet-300 border-violet-500/30" },
  testar: { label: "TESTAR", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
};

const papelPublicoTone: Record<string, { label: string; cls: string }> = {
  manter: { label: "MANTER", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  trocar: { label: "TROCAR", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
};

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/**
 * Card de campanha estilo Magazan (dark premium).
 * Seções: BOM/RUIM/MUDAR · Anúncios (com papel explícito) · Públicos
 * (manter/trocar) · Ações dos ads · Nova estrutura quando substituir.
 */
export default function CampaignCard({
  analysis,
  proposals,
  metrics,
  renderProposal,
  renderAction,
}: {
  analysis: CampaignAnalysis;
  proposals: Proposal[];
  metrics?: { spend: number; leads: number; ctr: number; cpm: number };
  /** Render full ProposalRow no rodapé (verbose). */
  renderProposal?: (p: Proposal) => React.ReactNode;
  /** Render só os botões de ação inline (compacto). Usado ao lado de cada anúncio/público. */
  renderAction?: (p: Proposal) => React.ReactNode;
}) {
  const v = verdictTone[analysis.verdict];
  const anuncios = analysis.anuncios ?? [];
  const publicos = analysis.publicos ?? [];
  // Maps proposal por ad_id e por adset (campaign-scoped) para inline buttons
  const propByAdId = new Map<string, Proposal>();
  const propByAdsetName = new Map<string, Proposal>();
  for (const p of proposals) {
    if (p.status !== "pending") continue;
    if (p.ad_id) propByAdId.set(p.ad_id, p);
    // For create_adset (audience swap), the proposal carries adset_name in action.adset_name
    if (p.action?.type === "create_adset" && p.action.adset_name) {
      propByAdsetName.set(p.adset_name ?? "", p);
    }
    // Also index by the (old) adset_name on the proposal itself for audience-swap matching
    if (p.adset_name) propByAdsetName.set(p.adset_name, p);
  }

  return (
    <div className="bg-[#18181b] border border-[#1c1c20] rounded-2xl overflow-hidden">
      {/* Cabeçalho */}
      <div className="px-5 py-4 border-b border-[#1c1c20]">
        <div className="flex items-start justify-between gap-3">
          <p className="text-zinc-50 font-semibold text-sm leading-tight flex-1 min-w-0">
            {analysis.campaign_name}
          </p>
          <span className={`shrink-0 text-[10px] tracking-[0.15em] font-bold uppercase px-2.5 py-1 rounded-md ${v.cls}`}>
            {v.label}
          </span>
        </div>
        {metrics && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-[11px] font-mono">
            <span className="text-zinc-500">spend <span className="text-zinc-200 font-semibold">{fmtBRL(metrics.spend)}</span></span>
            <span className="text-zinc-500">leads <span className="text-zinc-200 font-semibold">{metrics.leads}</span></span>
            <span className="text-zinc-500">ctr <span className="text-zinc-200 font-semibold">{metrics.ctr.toFixed(2)}%</span></span>
            <span className="text-zinc-500">cpm <span className="text-zinc-200 font-semibold">R$ {metrics.cpm.toFixed(0)}</span></span>
          </div>
        )}
      </div>

      {/* 3 colunas: BOM | RUIM | MUDAR */}
      <div className="grid grid-cols-1 sm:grid-cols-3 sm:divide-x divide-[#1c1c20]">
        <Col eyebrow="BOM" colorCls="text-[#86efac]" items={analysis.pontos_bons ?? []} />
        <Col eyebrow="RUIM" colorCls="text-[#fda4af]" items={analysis.pontos_ruins ?? []} />
        <Col eyebrow="MUDAR" colorCls="text-[#fcd34d]" items={analysis.o_que_mudar ?? []} />
      </div>

      {/* Anúncios da campanha — explicita o papel de cada ad */}
      {anuncios.length > 0 && (
        <div className="px-5 py-4 border-t border-[#1c1c20] space-y-2.5">
          <p className="text-[10px] tracking-[0.22em] uppercase text-zinc-500 font-medium">
            Anúncios da campanha ({anuncios.length})
          </p>
          <ul className="space-y-2">
            {anuncios.map((a) => {
              const tone = papelAdTone[a.papel] ?? papelAdTone.manter;
              const linkedProp = propByAdId.get(a.ad_id);
              return (
                <li key={a.ad_id} className="rounded-lg border border-[#1c1c20] bg-[#0f0f12] px-2.5 py-2 space-y-1.5">
                  <div className="flex items-start gap-2 text-xs">
                    <span className={`shrink-0 text-[9px] tracking-[0.12em] font-bold uppercase px-1.5 py-0.5 rounded border ${tone.cls}`}>
                      {tone.label}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-zinc-200 font-semibold truncate">{a.ad_name}</p>
                      <p className="text-zinc-400 leading-snug">{a.motivo}</p>
                    </div>
                    {typeof a.score === "number" && (
                      <span className="shrink-0 text-[10px] font-mono text-zinc-500 tabular-nums">{a.score}</span>
                    )}
                  </div>
                  {/* Botão de ação inline (se houver proposal pendente para este ad) */}
                  {linkedProp && renderAction && (
                    <div className="pt-0.5">{renderAction(linkedProp)}</div>
                  )}
                  {!linkedProp && a.papel !== "manter" && (
                    <p className="text-[10px] text-zinc-600 italic pl-0.5">Sem ação executável automática — ajuste manual no gerenciador.</p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Públicos da campanha — manter ou trocar (com substituto especificado) */}
      {publicos.length > 0 && (
        <div className="px-5 py-4 border-t border-[#1c1c20] space-y-2.5">
          <p className="text-[10px] tracking-[0.22em] uppercase text-zinc-500 font-medium">
            Públicos da campanha ({publicos.length})
          </p>
          <ul className="space-y-2">
            {publicos.map((p) => {
              const tone = papelPublicoTone[p.papel] ?? papelPublicoTone.manter;
              const linkedProp = propByAdsetName.get(p.adset_name);
              return (
                <li key={p.adset_id} className="rounded-lg border border-[#1c1c20] bg-[#0f0f12] px-2.5 py-2 text-xs space-y-1.5">
                  <div className="flex items-start gap-2">
                    <span className={`shrink-0 text-[9px] tracking-[0.12em] font-bold uppercase px-1.5 py-0.5 rounded border ${tone.cls}`}>
                      {tone.label}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-zinc-200 font-semibold truncate">{p.adset_name}</p>
                      <p className="text-zinc-400 leading-snug">{p.motivo}</p>
                    </div>
                  </div>
                  {p.papel === "trocar" && p.substituir_por && (
                    <div className="ml-7 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 space-y-0.5">
                      <p className="text-[10px] tracking-[0.18em] uppercase text-amber-300 font-medium">→ Substituir por</p>
                      <p className="text-zinc-200">{p.substituir_por.targeting_summary}</p>
                      <p className="text-zinc-400 italic">{p.substituir_por.racional}</p>
                    </div>
                  )}
                  {linkedProp && renderAction && (
                    <div className="pt-0.5">{renderAction(linkedProp)}</div>
                  )}
                  {!linkedProp && p.papel === "trocar" && (
                    <p className="text-[10px] text-zinc-600 italic pl-0.5">Sem ação executável automática — criar conjunto manualmente no gerenciador.</p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Ações executáveis (botões aprovar/pausar/escalar — preserva interatividade) */}
      {proposals.length > 0 && renderProposal && (
        <div className="px-5 py-4 border-t border-[#1c1c20] space-y-2.5">
          <p className="text-[10px] tracking-[0.22em] uppercase text-zinc-500 font-medium">
            Ações executáveis ({proposals.length})
          </p>
          <div className="space-y-2">
            {proposals.map(p => (
              <div key={p.id}>{renderProposal(p)}</div>
            ))}
          </div>
        </div>
      )}

      {/* Nova estrutura quando verdict=substituir */}
      {analysis.nova_estrutura && (
        <details className="border-t border-[#1c1c20] group/sub">
          <summary className="px-5 py-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden flex items-center justify-between gap-2 hover:bg-zinc-900/40 transition-colors">
            <span className="text-[10px] tracking-[0.22em] uppercase text-zinc-400 font-medium">
              Nova estrutura proposta
            </span>
            <span className="text-zinc-500 text-xs transition-transform group-open/sub:rotate-90">▸</span>
          </summary>
          <div className="px-5 py-4 space-y-3 bg-[#0f0f12]">
            <div className="space-y-1 text-xs">
              <p className="text-zinc-400"><span className="text-zinc-500">Nome:</span> <span className="text-zinc-100 font-semibold">{analysis.nova_estrutura.nome}</span></p>
              <p className="text-zinc-400"><span className="text-zinc-500">Objetivo:</span> <span className="text-zinc-100 font-mono">{analysis.nova_estrutura.objetivo}</span></p>
              <p className="text-zinc-400"><span className="text-zinc-500">Budget diário:</span> <span className="text-zinc-100 font-mono">{fmtBRL((analysis.nova_estrutura.daily_budget_cents ?? 0) / 100)}</span></p>
              {analysis.nova_estrutura.notas && (
                <p className="text-zinc-400 leading-relaxed pt-1"><span className="text-zinc-500">Notas:</span> {analysis.nova_estrutura.notas}</p>
              )}
            </div>
            {(analysis.nova_estrutura.adsets ?? []).length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] tracking-[0.22em] uppercase text-zinc-500 font-medium">
                  Conjuntos ({(analysis.nova_estrutura.adsets ?? []).length})
                </p>
                <div className="space-y-1.5">
                  {(analysis.nova_estrutura.adsets ?? []).map((a, i) => (
                    <div key={i} className="bg-[#18181b] border border-[#1c1c20] rounded-lg px-3 py-2 text-xs">
                      <p className="text-zinc-200 font-semibold">{a?.nome ?? "—"}</p>
                      <p className="text-zinc-400 mt-0.5">{a?.targeting_summary ?? ""}</p>
                      {a?.daily_budget_cents !== undefined && a?.daily_budget_cents !== null && (
                        <p className="text-zinc-500 mt-0.5 font-mono">{fmtBRL(a.daily_budget_cents / 100)}/dia</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(analysis.nova_estrutura.ads ?? []).length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] tracking-[0.22em] uppercase text-zinc-500 font-medium">
                  Anúncios novos ({(analysis.nova_estrutura.ads ?? []).length})
                </p>
                <div className="space-y-1.5">
                  {(analysis.nova_estrutura.ads ?? []).map((ad, i) => (
                    <div key={i} className="bg-[#18181b] border border-[#1c1c20] rounded-lg px-3 py-2 text-xs space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-zinc-200 font-semibold truncate">{ad?.nome_proposto ?? "—"}</p>
                        {ad?.referencia_ad_id && (
                          <span className="shrink-0 text-[10px] font-mono text-zinc-500">ref: {ad.referencia_ad_id.slice(-6)}</span>
                        )}
                      </div>
                      <div className="space-y-0.5 pl-2 border-l-2 border-[#1c1c20]">
                        <p className="text-zinc-300"><span className="text-zinc-500">headline:</span> {ad?.copy?.headline ?? ""}</p>
                        <p className="text-zinc-300"><span className="text-zinc-500">texto:</span> {ad?.copy?.texto ?? ""}</p>
                        <p className="text-zinc-400 font-mono"><span className="text-zinc-500">cta:</span> {ad?.copy?.cta ?? ""}</p>
                      </div>
                      {ad?.notas_visual && (
                        <p className="text-amber-300/80 italic pt-1">visual: {ad.notas_visual}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <p className="text-[10px] text-zinc-500 italic pt-1">
              Esta é uma proposta — nada vai pro Meta sem você aprovar/criar manualmente.
            </p>
          </div>
        </details>
      )}
    </div>
  );
}

function Col({ eyebrow, colorCls, items }: { eyebrow: string; colorCls: string; items: string[] }) {
  return (
    <div className="px-5 py-4 space-y-2">
      <p className={`text-[10px] tracking-[0.22em] uppercase font-medium ${colorCls}`}>{eyebrow}</p>
      {items.length === 0 ? (
        <p className="text-xs text-zinc-600 italic">—</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it, i) => (
            <li key={i} className="text-xs text-zinc-300 leading-snug flex gap-1.5">
              <span className={`shrink-0 ${colorCls}`}>•</span>
              <span>{it}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
