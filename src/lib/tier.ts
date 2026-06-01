// Classificação visual de clientes por tier de investimento mensal projetado.
// Fonte única da regra — usada pelo relatório diário e pela visão geral.

export type Tier = "A" | "B" | "C" | "none";

/** Investimento mensal projetado a partir do gasto dos últimos 7 dias. */
export function monthlyFromSpend7d(spend7d: number): number {
  return (spend7d / 7) * 30;
}

/** Classifica o tier pelo investimento mensal projetado.
 *  A: > R$4.000 | B: R$1.000–4.000 | C: 0 < m < R$1.000 | none: sem gasto. */
export function tierOf(spend7d: number): Tier {
  const m = monthlyFromSpend7d(spend7d);
  if (m <= 0) return "none";
  if (m > 4000) return "A";
  if (m >= 1000) return "B";
  return "C";
}

export const TIER_LABEL: Record<Tier, string> = {
  A: "Tier A",
  B: "Tier B",
  C: "Tier C",
  none: "Sem investimento",
};

export const TIER_ORDER: Tier[] = ["A", "B", "C", "none"];
