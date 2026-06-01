# Relatório Diário — Prestação de Contas Clara + Desfazer com Alternativas — Design

**Data:** 2026-06-01
**Projeto:** meta-ads-agent
**Status:** aprovado no brainstorming
**Escopo:** reorganização visual do relatório diário (`/daily-report/[date]`) + comportamento do botão Desfazer. Não altera análise nem auto-executor (só consome os status que já existem). Pequeno ajuste no endpoint `/execute` para aceitar `skipped_gate` (botão "fazer mesmo assim").

## Problema
O relatório atual mistura informação: cada anúncio mostra proposta + copy + vários botões sempre visíveis, e as seções (feito/aguardando/não-feito) não deixam claro **o que foi trabalhado, o que não foi executado (e por quê) e o que não precisa mexer (e por quê)**. O Eduardo quer leitura imediata: ação executada = só um check + desfazer; os controles de ação só aparecem quando ele decide intervir (apertando Desfazer).

## Os 5 blocos por conta (ordem de cima pra baixo)

Mapeamento status da `Proposal` → bloco:

| Bloco | Status incluídos | Estado |
|---|---|---|
| **✅ Trabalhado** | `executed`, `undone` | sempre aberto |
| **⏳ Aguardando você** | `awaiting_approval` | sempre aberto |
| **⏭️ Não executado** | `skipped_gate`, `failed` | minimizado |
| **✔️ Não precisa mexer** | `no_action` (verdict "manter") | minimizado |
| **Status das campanhas** | (tabela atual) | minimizado (já é hoje) |

### 1. ✅ Trabalhado
- Uma linha limpa por proposta `executed`: `✅ {result_message curto} · [Desfazer]`
  - Ex.: `✅ Pausado AD36 — CPL R$32 (8× a média), 61d e R$201 gastos · [Desfazer]`
- **Desfazer** (componente `UndoMenu`, novo — evolui o `UndoButton` atual):
  - Ao clicar: chama `POST /proposals/undo` (já existe) → reverte na Meta/Google, status vira `undone`.
  - A linha vira `↩️ Desfeito` e **expande o menu de alternativas** para aquele anúncio/conjunto:
    - **[Subir criativo novo]** → marca a proposta com `status: "creative_requested"` (reusa o fluxo existente de pedido de criativo; mesmo POST que o `CreateCreativeCard` usa).
    - **[Ajustar orçamento]** → abre input de R$/dia e chama `updateAdsetBudget` via `/execute` (variante com valor manual — ver Endpoints).
    - **[Trocar público/conjunto]** → condicional: se a análise daquela conta tiver uma proposta `create_adset` sugerida (com targeting), vira botão `[Criar conjunto sugerido]` (reusa `/execute` action_type `create_adset`); senão, vira link para a tela de criação manual de conjunto (`/campanhas` ou o fluxo existente).
    - **[Deixar reativado]** → no-op: só fecha o menu (o anúncio já foi reativado pelo undo).
- Proposta `undone` já renderiza com o menu aberto (persistente), pra o gestor poder agir depois de recarregar.

### 2. ⏳ Aguardando você
- Propostas `awaiting_approval` (estrutura que o agente não executa sozinho: `create_adset`, `pause_adset`, `pause_campaign`, `update_adset_targeting`, `pause_google_campaign`).
- Cada uma: `titulo` + `diagnostico`/motivo + botão de ação direto (reusa `ApproveButton`/`/execute` ou `ApprovalCard`, conforme o tipo).

### 3. ⏭️ Não executado *(minimizado, `<details>`)*
- Propostas `skipped_gate`: `result_message` (o motivo do gate, ex.: "gasto R$30 < R$50 mínimo") + botão discreto **[Fazer mesmo assim]**.
  - [Fazer mesmo assim] → `/execute` com o action_type correspondente (pause/scale), forçando a execução. Exige ajuste no `/execute` para aceitar `skipped_gate` (hoje só aceita `pending`/`awaiting_approval`).
- Propostas `failed`: mostram só o `result_message` (erro). Sem botão (erro técnico; reavaliado na próxima rodada).

### 4. ✔️ Não precisa mexer *(minimizado, `<details>`)*
- Propostas `no_action` (verdict "manter"): `titulo` + motivo (ex.: "Mantido — CPL R$28, CTR 2,1%, dentro do benchmark"). Sem botões. Leitura tranquilizadora.

### 5. Status das campanhas
- Inalterado (já é `<details>` minimizado, com resumo no cabeçalho).

## Componentes

- `src/components/report/UndoMenu.tsx` (NOVO, client) — substitui o uso do `UndoButton` no bloco Trabalhado. Faz o undo e, após sucesso, renderiza o menu de alternativas. Recebe: `slug`, `date`, `proposalId`, `adId`, `adsetId?`, `viewKey`, `hasSuggestedAdset` (bool), `platform`.
- `src/components/report/ForceButton.tsx` (NOVO, client) — botão "Fazer mesmo assim" do bloco Não executado. Chama `/execute`.
- `src/app/daily-report/[date]/page.tsx` (EDIT) — reorganizar os blocos conforme acima; separar `skipped_gate/failed` (Não executado) de `no_action` (Não precisa mexer); mover `undone` para Trabalhado; render limpo das linhas executed.
- `src/app/api/daily-reports/[slug]/proposals/execute/route.ts` (EDIT) — aceitar `skipped_gate` no guard de status (além de `pending`/`awaiting_approval`); aceitar um `budget_cents` opcional no body para o "Ajustar orçamento" manual.

## Faseamento (recomendado)
- **Fase 1 (alto valor, baixo risco):** os 5 blocos reorganizados + Desfazer simples (reverte, sem menu ainda) + "Fazer mesmo assim". Já entrega a leitura clara que é o pedido central.
- **Fase 2:** o menu de alternativas pós-desfazer (UndoMenu com as 4 opções), que tem mais sub-fluxos.

Implementar Fase 1 primeiro, validar visualmente, depois Fase 2.

## Fora de escopo
- Não muda a lógica de análise nem do auto-executor (só lê os status).
- "Não precisa mexer" lista apenas propostas com verdict "manter" que a análise gerou — não tenta enumerar todos os anúncios saudáveis da conta.

## Teste
- Sem lógica pura nova relevante (é UI). Validação: `npm run build` + `tsc` limpos, e conferência visual no relatório de hoje (que tem dados reais: executed na martins/bem-mais, skipped_gate, etc.).
- Teste manual do Desfazer→menu e do "Fazer mesmo assim" em 1 proposta real (com restauração depois).
