"use client";
import ProposalActionButton from "./ProposalActionButton";
import type { WeeklyProposal } from "@/lib/weekly-data";
import type { MonthlyProposal } from "@/lib/monthly-data";

type AnyProposal = (WeeklyProposal | MonthlyProposal) & {
  ad_account_id?: string;
};

interface Props {
  p: AnyProposal;
  slug: string;
  /** Pra semanal passa week (ex "2026-W22"). Pra mensal passa month (ex "2026-05"). */
  week?: string;
  month?: string;
  proposalIndex: number;
  viewKey: string;
  alreadyExecuted?: boolean;
}

export default function ProposalActionsRow({ p, slug, week, month, proposalIndex, viewKey, alreadyExecuted }: Props) {
  const periodKind = month ? "month" : "week";
  const periodId = (month ?? week)!;
  const common = { slug, periodKind: periodKind as "week" | "month", periodId, proposalIndex, authKey: viewKey, alreadyExecuted };

  switch (p.type) {
    case "novo_publico":
      // Cria adset novo clonando estrutura do antigo (mesmo campaign + mesmas configs)
      // Eduardo precisará entrar no novo adset depois e ajustar targeting (skill ainda
      // não recebeu a definição exata do público novo do agente; v1 cria adset paralelo).
      return (
        <div className="flex gap-1">
          <ProposalActionButton
            {...common}
            action="create_adset"
            params={{
              source_adset_id: (p as WeeklyProposal).adset_id,
              campaign_id: (p as WeeklyProposal).campaign_id,
              name: `[NOVO PÚBLICO] ${(p as WeeklyProposal).adset_name?.slice(0, 60) ?? "adset"} — testar`,
            }}
            label="Criar adset (testar público)"
          />
        </div>
      );
    case "pausar_publico_saturado":
      return (
        <ProposalActionButton
          {...common}
          action="pause_adset"
          params={{ adset_id: (p as WeeklyProposal).adset_id }}
          label="Pausar adset"
        />
      );
    case "novo_ga":
      return (
        <ProposalActionButton
          {...common}
          action="create_adset"
          params={{
            campaign_id: (p as WeeklyProposal).campaign_id,
            name: `[NOVO GA] teste ${new Date().toISOString().slice(0, 10)}`,
            // Sem source_adset_id, Eduardo precisará completar config no Meta antes de ativar (status=PAUSED garante)
          }}
          label="Criar GA novo (pausado)"
        />
      );
    case "solicitar_criativos":
      return (
        <ProposalActionButton
          {...common}
          action="request_creative"
          params={{
            ad_id: (p as WeeklyProposal).adset_id,
            date: new Date().toISOString().slice(0, 10),
          }}
          label="Solicitar via pipeline"
        />
      );
    case "trocar_objetivo":
    case "trocar_objetivo_campanha":
      return <ProposalActionButton {...common} action="mark_seen" label="Marcar como visto" variant="subtle" />;
    case "novo_lal": {
      // Pro LAL precisa de source audience — UI básica não tem; marcamos visto e Eduardo cria pelo painel
      return <ProposalActionButton {...common} action="mark_seen" label="Marcar como visto" variant="subtle" />;
    }
    case "atualizar_publico":
    case "biblioteca_concorrencia":
    case "auditoria_site":
    case "validar_funil":
      return <ProposalActionButton {...common} action="mark_seen" label="Marcar como visto" variant="subtle" />;
    default:
      return <ProposalActionButton {...common} action="mark_seen" label="Marcar como visto" variant="subtle" />;
  }
}
