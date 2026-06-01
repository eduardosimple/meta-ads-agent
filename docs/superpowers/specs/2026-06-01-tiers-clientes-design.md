# Organização de Clientes por Tier (visual) — Design

**Data:** 2026-06-01
**Projeto:** meta-ads-agent
**Status:** aprovado no brainstorming
**Escopo:** puramente visual (agrupamento) no relatório diário e na visão geral. Não altera análise, execução, dados salvos nem APIs.

## Problema
Hoje as telas listam todos os clientes numa lista única (ordenada por status de saúde). Com ~64 contas de portes muito diferentes (de R$0 a R$22 mil/mês), fica difícil enxergar por porte. O Eduardo quer agrupar visualmente por tier de investimento mensal.

## Regra do tier
Investimento mensal projetado por cliente:
`mensal = (meta.spend_7d ?? 0 + google.spend_7d ?? 0) / 7 * 30`

| Tier | Faixa (mensal projetado) |
|---|---|
| **A** | > R$ 4.000 |
| **B** | R$ 1.000 ≤ mensal ≤ R$ 4.000 |
| **C** | 0 < mensal < R$ 1.000 |
| **Sem investimento** | mensal == 0 (sem gasto nos últimos 7d) |

Cortes exatos: A = `mensal > 4000`; B = `mensal >= 1000 && mensal <= 4000`; C = `mensal > 0 && mensal < 1000`; Sem investimento = `mensal == 0`.

## Componentes

**1. `src/lib/tier.ts` (NOVO) — fonte única da regra**
```typescript
export type Tier = "A" | "B" | "C" | "none";

/** Investimento mensal projetado a partir do gasto dos últimos 7 dias. */
export function monthlyFromSpend7d(spend7d: number): number {
  return (spend7d / 7) * 30;
}

/** Classifica o tier pelo investimento mensal projetado. */
export function tierOf(spend7d: number): Tier {
  const m = monthlyFromSpend7d(spend7d);
  if (m === 0) return "none";
  if (m > 4000) return "A";
  if (m >= 1000) return "B"; // 1000..4000
  return "C";                 // 0 < m < 1000
}

export const TIER_LABEL: Record<Tier, string> = {
  A: "Tier A", B: "Tier B", C: "Tier C", none: "Sem investimento",
};
export const TIER_ORDER: Tier[] = ["A", "B", "C", "none"];
```

**2. `src/app/daily-report/[date]/page.tsx` (EDIT — server component)**
- Hoje existe `enriched` (cada item tem `report` + `spend` = meta.spend_7d+google.spend_7d + `status`) e é ordenado por status (red→yellow→green).
- Adicionar: para cada item, `tier = tierOf(spend)`.
- Agrupar `enriched` por tier na ordem `TIER_ORDER`; **dentro de cada grupo, preservar a ordenação por status já existente**.
- Renderizar, antes de cada grupo não-vazio, um cabeçalho de seção:
  `TIER A · {n} contas · R$ {soma mensal do grupo} /mês (proj.)`
- Os cards de cliente (os `<details>`) ficam idênticos. Só muda que passam a estar dentro de grupos.

**3. `src/app/visao-geral/page.tsx` (EDIT — client component)**
- A lista de `clients` (de `/api/overview`, que já traz `spend_7d` e `google_spend_7d`) é hoje ordenada e mapeada direto.
- Calcular `spend = spend_7d + (google_spend_7d ?? 0)` e `tier = tierOf(spend)` por cliente.
- Agrupar por `TIER_ORDER`, mantendo a ordenação interna atual.
- Mesmo cabeçalho de seção por grupo.

## Estilo
Seguir as classes/estilo já presentes em cada página (mesma linguagem visual dos cabeçalhos de seção existentes, ex.: as seções `<details>` do daily-report). Sem novo design system. Selo de cor por tier opcional e leve (ex.: A=emerald, B=blue, C=zinc, none=zinc-muted) só no cabeçalho da seção.

## Fora de escopo
- Não busca orçamento configurado na API do Meta (a base é gasto real 7d, já disponível).
- Não altera análise, auto-executor, analysis-save/single, nem o conteúdo dos cards.
- Não persiste tier em lugar nenhum (é derivado em tempo de render).

## Teste
- Unit em `src/lib/tier.test.ts` (Vitest, já configurado): casos de corte — 0 → none; 999/7*30... usar valores de spend7d que produzam mensais de teste: mensal 0 → none; mensal 500 → C; mensal 1000 → B; mensal 4000 → B; mensal 4001 → A. Converter para spend7d de entrada (`spend7d = mensal*7/30`).
- Visual: conferir no relatório de hoje que os grupos aparecem na ordem A,B,C,Sem investimento e que as contas caem no grupo certo (ex.: FAMEX e Martins em A; contas zeradas em Sem investimento).
