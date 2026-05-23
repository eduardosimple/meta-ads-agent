import type { CampaignAnalysis, Proposal } from "@/types/metrics";

const verdictTone: Record<CampaignAnalysis["verdict"], { label: string; cls: string }> = {
  manter: { label: "MANTER", cls: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30" },
  ajustar: { label: "AJUSTAR", cls: "bg-amber-500/15 text-amber-300 border border-amber-500/30" },
  substituir: { label: "SUBSTITUIR", cls: "bg-gradient-to-r from-[#7c3aed] to-[#3b82f6] text-white border border-[#7c3aed]/40 shadow-[0_4px_20px_-4px_rgba(124,58,237,0.4)]" },
  pausar: { label: "PAUSAR", cls: "bg-rose-500/15 text-rose-300 border border-rose-500/30" },
};

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/**
 * Card de campanha estilo Magazan (dark premium).
 * 3 colunas: BOM / RUIM / MUDAR, depois ações dos ads dessa campanha,
 * e quando verdict="substituir", spec da nova estrutura proposta.
 */
export default function CampaignCard({
  analysis,
  proposals,
  metrics,
  renderProposal,
}: {
  analysis: CampaignAnalysis;
  proposals: Proposal[];
  metrics?: { spend: number; leads: number; ctr: number; cpm: number };
  renderProposal?: (p: Proposal) => React.ReactNode;
}) {
  const v = verdictTone[analysis.verdict];

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
        <Col eyebrow="BOM" colorCls="text-[#86efac]" items={analysis.pontos_bons} />
        <Col eyebrow="RUIM" colorCls="text-[#fda4af]" items={analysis.pontos_ruins} />
        <Col eyebrow="MUDAR" colorCls="text-[#fcd34d]" items={analysis.o_que_mudar} />
      </div>

      {/* Ações dos ads desta campanha (preserva interatividade) */}
      {proposals.length > 0 && renderProposal && (
        <div className="px-5 py-4 border-t border-[#1c1c20] space-y-2.5">
          <p className="text-[10px] tracking-[0.22em] uppercase text-zinc-500 font-medium">
            Ações nos anúncios ({proposals.length})
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
              <p className="text-zinc-400"><span className="text-zinc-500">Budget diário:</span> <span className="text-zinc-100 font-mono">{fmtBRL(analysis.nova_estrutura.daily_budget_cents / 100)}</span></p>
              {analysis.nova_estrutura.notas && (
                <p className="text-zinc-400 leading-relaxed pt-1"><span className="text-zinc-500">Notas:</span> {analysis.nova_estrutura.notas}</p>
              )}
            </div>
            {analysis.nova_estrutura.adsets.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] tracking-[0.22em] uppercase text-zinc-500 font-medium">
                  Conjuntos ({analysis.nova_estrutura.adsets.length})
                </p>
                <div className="space-y-1.5">
                  {analysis.nova_estrutura.adsets.map((a, i) => (
                    <div key={i} className="bg-[#18181b] border border-[#1c1c20] rounded-lg px-3 py-2 text-xs">
                      <p className="text-zinc-200 font-semibold">{a.nome}</p>
                      <p className="text-zinc-400 mt-0.5">{a.targeting_summary}</p>
                      {a.daily_budget_cents !== undefined && (
                        <p className="text-zinc-500 mt-0.5 font-mono">{fmtBRL(a.daily_budget_cents / 100)}/dia</p>
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
