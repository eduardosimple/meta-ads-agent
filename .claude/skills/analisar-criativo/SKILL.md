---
name: analisar-criativo
description: Analisa performance de criativos Meta Ads usando a metodologia 12345 e framework de métricas. Use quando o usuário pedir análise de criativo, otimização de anúncio, ou quando métricas estiverem ruins.
allowed-tools: Bash
---

# Metodologia de Análise de Criativos

## Premissa fundamental
A campanha "perfeita" não existe do zero — ela é construída através de
otimizações. O trabalho mais importante não é subir campanhas, é saber
otimizá-las.

Otimização = fazer alterações em períodos pré-determinados buscando
gerar o MÁXIMO de resultados possível DENTRO do custo pré-estabelecido.

---

## PASSO 1 — Definir o objetivo antes de analisar qualquer número

Antes de olhar qualquer métrica, pergunte:

1. **Qual é o objetivo da campanha?**
   - Lead Generation → métrica principal: CPL
   - Mensagens WhatsApp → métrica principal: custo por mensagem
   - Tráfego → métrica principal: CPC / custo por sessão
   - Vendas → métrica principal: CPA / ROAS

2. **O que consigo medir nesse cliente?**
   - Consigo medir qualidade dos leads?
   - Consigo rastrear até a venda?
   - Tenho pixel + API de conversões instalados?

3. **Qual o custo máximo por resultado aceitável?**
   - Perguntar ao cliente a margem e a taxa de conversão do funil
   - Calcular o CPL máximo: `margem por venda ÷ taxa de conversão`

---

## PASSO 2 — Identificar métricas principal e secundárias

### Métrica principal (diz se o criativo está bom ou ruim)
É a bússola. Depende do objetivo. Exemplos:
- Lead Generation: **CPL**
- Mensagens: **Custo por mensagem**
- Tráfego: **CPC**

### Métricas secundárias (afetam a principal)
Analisar nessa ordem para diagnosticar o problema:

| Métrica | O que indica | Causa mais comum |
|---|---|---|
| CPM | Custo pra aparecer | Público, concorrência, qualidade do anúncio |
| CTR | Qualidade do criativo | Copy, gancho visual, headline |
| Hook Rate | Retenção nos 3s iniciais | Abertura do vídeo/imagem |
| Frequência | Saturação do público | Público pequeno, muitos dias rodando |
| CPC | Custo por clique no link | CTR + segmentação |
| CPL | Eficiência total | Resultado de todas as anteriores |

**Regra de ouro:** Se a métrica principal está ruim, desça pelo funil
identificando qual métrica secundária está quebrando a cadeia.

---

## PASSO 3 — Benchmarks de referência (imobiliário)

Usar benchmarks próprios por cliente sempre que disponível.
Referência de mercado geral:

| Métrica | Referência | Alerta |
|---|---|---|
| CPM | R$ 5 a R$ 15 | Acima de R$ 20 |
| CPC | R$ 0,50 a R$ 3 | Acima de R$ 5 |
| CTR | 1% a 2% | Abaixo de 0,8% |
| Hook Rate (vídeo) | Acima de 30% | Abaixo de 20% |
| Frequência | 1,5 a 2,5 | Acima de 3,5 |
| CPL imobiliário | R$ 30 a R$ 80 | Acima de R$ 100 |

---

## PASSO 4 — Período mínimo para tomar decisão

Não otimize antes do tempo. Respeitar os períodos:

- **Orçamentos:** 1-2 dias (orçamento maior) / 2-3 dias (orçamento menor)
- **Anúncios/criativos:** 2-3 dias (orçamento maior) / 4-5 dias (orçamento menor)
- **Públicos:** 4-5 dias (orçamento maior) / 6-7 dias (orçamento menor)
- **Estrutura geral:** 7-14-21 dias

⚠️ Exceção: "filha caindo do penhasco" — resultados muito ruins justificam
ação imediata independente do período.

---

## PASSO 5 — Decisão por métrica

### CPM alto
1. Melhorar qualidade do criativo (relevância no leilão)
2. Expandir público (público pequeno encarece CPM)
3. Rodar novo criativo (rotação reduz saturação)
4. Testar segmentação diferente

### CTR baixo (abaixo de 1%)
1. Testar novo gancho visual (primeiros 3s do vídeo ou imagem principal)
2. Testar nova headline
3. Melhorar copy (dor + benefício + curiosidade)
4. Testar formato diferente (vídeo, estático, carrossel)
5. Testar público mais aquecido

### Hook Rate baixo (vídeo)
1. Criar nova abertura — os primeiros 3s determinam tudo
2. Tipos de gancho: pergunta direta, afirmação ousada, cena de impacto
3. Evitar logo/branding nos primeiros segundos

### Frequência alta (acima de 3,5)
1. Pausar criativo e substituir por versão nova
2. Expandir público
3. Criar variação do criativo (mesmo conceito, visual diferente)

### CPL alto
1. Verificar funil completo antes de pausar criativo
2. Analisar: CPM → CTR → Hook Rate → taxa de conversão do formulário/landing
3. Identificar onde está o gargalo e agir nesse ponto específico

---

## PASSO 6 — Ações disponíveis por criativo

Seguindo a lógica da técnica 12345:

**Escalar orçamento** — quando CPL está dentro do aceitável e resultado é bom
- Regra: resultado bom → aumenta | resultado ok → mantém | resultado ruim → diminui
- Aumentar gradualmente (20-30% por vez) para não resetar aprendizado

**Pausar e substituir** — quando:
- Métrica principal está muito acima do benchmark por 4-5 dias
- Frequência acima de 3,5
- CTR abaixo de 0,5% após período mínimo

**Ajustar copy/headline** — quando:
- CPM ok + CTR ruim = problema no criativo, não no público
- Testar: headline diferente, gancho diferente, CTA diferente

**Testar variação** — quando criativo está performando bem:
- Criar versão com formato diferente (vídeo → estático, estático → carrossel)
- Criar versão com gancho diferente mantendo a oferta
- Criar versão com copy diferente mantendo o visual

---

## PASSO 7 — Output obrigatório da análise

Ao final de toda análise, entregar:

### Diagnóstico
- Qual métrica está quebrando a cadeia?
- O problema é no criativo, no público, no orçamento ou no destino?

### Veredito por criativo
Para cada criativo analisado:
- ✅ **Escalar** — CPL dentro do aceitável, resultado bom
- ⏸️ **Manter** — ainda no período de aprendizado ou resultado ok
- 🔄 **Testar variação** — performando bem, explorar formatos
- ⚠️ **Ajustar** — identificar o ponto específico (gancho, copy, CTA)
- ❌ **Pausar** — fora do benchmark após período mínimo

### Próximas 3 ações prioritárias
Específicas, com prazo e responsável.

---

## Regras que nunca mudam

- Nunca pausar um criativo antes do período mínimo
- Nunca fazer múltiplas alterações ao mesmo tempo (não saberá o que funcionou)
- Sempre subir um criativo novo quando pausar outro
- Toda alteração grande pode resetar o aprendizado — isso não é problema
  se a mudança for estratégica, não aleatória
- O melhor benchmark são os seus próprios dados históricos
