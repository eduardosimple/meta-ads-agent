---
name: analisar-criativo
description: Analisa performance de criativos Meta Ads usando a metodologia 12345 do Pedro Sobral. Use quando o usuário pedir análise de criativo, otimização de anúncio, ou quando métricas estiverem ruins.
allowed-tools: Bash
---

# Metodologia de Análise e Otimização de Criativos

## Premissa fundamental

Otimização = fazer alterações em **períodos pré-determinados** em busca de **melhora nos resultados**.

A campanha perfeita não existe do zero — ela é construída através de otimizações estratégicas.
Uma coisa é fazer alterações aleatórias e prejudicar a campanha. Outra é analisar o que não está funcionando e fazer mudanças estratégicas — mesmo que façam os anúncios voltarem à fase de aprendizado.

---

## PASSO 1 — Definir o objetivo antes de analisar qualquer número

Antes de olhar qualquer métrica, pergunte:

**I) Qual é o objetivo da campanha?**
- Vendas → medir: custo por venda, faturamento, quanto gastou
- Mensagens WhatsApp → medir: número de mensagens, custo por mensagem
- Tráfego → medir: número de sessões, custo por sessão
- Cadastros/Leads → medir: número de leads, CPL

**II) O que consigo medir nesse cliente?**
- Consigo medir exatamente o número de vendas?
- Consigo medir a qualidade dos cadastros?
- Consigo rastrear até a venda final?
- Tenho pixel + API de conversões instalados?

**III) Qual é o valor máximo que posso pagar por resultado?**
- Perguntar margem e taxa de conversão do funil
- Fórmula: `margem por venda × taxa de conversão = CPA máximo aceitável`
- Exemplo: margem R$300 × 4% conversão = máximo R$12 por lead... mas considere o funil completo

Uma melhora nos resultados = gerar o **MÁXIMO de resultados possível DENTRO do custo pré-estabelecido.**

---

## PASSO 2 — Identificar métricas principal e secundárias

### Métrica principal (bússola da campanha)
Depende do objetivo:
- Lead Generation → **CPL**
- Mensagens WhatsApp → **Custo por mensagem**
- Tráfego → **CPC / Custo por sessão**
- Vendas → **CPA / ROAS**

### Métricas secundárias (afetam a principal — analisar nessa ordem)

| Métrica | O que indica | Causa mais comum |
|---|---|---|
| CPM | Custo para aparecer | Público, concorrência, qualidade do anúncio |
| CTR | Qualidade do criativo | Copy, gancho visual, headline |
| Hook Rate | Retenção nos 3s iniciais (vídeo) | Abertura do vídeo |
| Frequência | Saturação do público | Público pequeno ou muitos dias rodando |
| CPC | Custo por clique no link | CTR + segmentação |
| CPL | Eficiência total | Resultado de todas as anteriores |

**Regra de ouro:** Se a métrica principal está ruim, desça pelo funil identificando qual métrica secundária está quebrando a cadeia.

Sequência de diagnóstico:
```
Métrica principal ruim?
  → CPM alto? → problema no público ou qualidade do anúncio
  → CTR baixo? → problema no criativo (copy, gancho, visual)
  → Hook Rate baixo? → problema na abertura do vídeo
  → Frequência alta? → público saturado
  → CPC alto com CTR ok? → problema na segmentação
  → Taxa de conversão baixa? → problema no destino (landing page, atendimento)
```

---

## PASSO 3 — Benchmarks de referência (imobiliário)

Usar benchmarks próprios do cliente sempre que disponível. Referência geral:

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

Nunca otimize antes do tempo. Respeitar os períodos:

| Elemento | Orçamento maior | Orçamento menor |
|---|---|---|
| Lances/Orçamentos | 1-2 dias | 2-3 dias |
| Anúncios/Criativos | 2-3 dias | 4-5 dias |
| Públicos | 4-5 dias | 7 dias |
| Estrutura geral | 7-14-21 dias | 7-14-21 dias |

**Exceção — "Filha caindo do penhasco":** resultados muito ruins justificam ação imediata, independente do período.

**Fase de aprendizado:** durante essa fase, a veiculação ainda não está otimizada e o CPA tende a ser mais alto. Alterações estratégicas podem valer mesmo que reiniciem o aprendizado.

---

## PASSO 5 — A TÉCNICA 12345: O que mudar e em que ordem

A técnica 12345 define a **sequência de otimização**. Sempre siga essa ordem — não pule etapas.

### 1) Orçamentos

Regra base:
- **Resultado bom** → aumenta o orçamento
- **Resultado ok** → mantém
- **Resultado ruim** → diminui ou pausa

Como escalar:
- Aumentar gradualmente (20-30% por vez) para não resetar o aprendizado
- Mais gasto = mais alcance = mais caro aparecer → só escale quando CPL está dentro do aceitável
- Se o CPL subiu muito ao escalar, recue ao orçamento anterior

### 2) Públicos

- Não pause públicos que **SÃO** bons
- **Muitos cliques, poucas conversões** → restrinja o público (mais específico)
- **CPM acima da média** → amplie o público (público pequeno encarece o CPM)
- **Muito destoante do restante** → pause
- **Performance parecida entre públicos** → una-os (menos fragmentação)
- **Sempre que pausar um público, suba um novo**

### 3) Anúncios/Criativos

O CTR é a principal métrica que indica se o anúncio está cumprindo o seu papel (não é a única, mas é a mais direta).

Regras:
- Pause anúncios muito ruins
- **Evite pausar os que estão trazendo escala**, mesmo que não sejam os melhores
- **Sempre que pausar um anúncio, suba um novo**
- Crie variações dos que estão performando (outros formatos, outros ganchos)

Ações por métrica:

**CPM alto:**
1. Melhorar qualidade do criativo (aumenta relevância no leilão)
2. Expandir o público
3. Rodar novo criativo
4. Testar segmentação diferente

**CTR baixo (abaixo de 1%):**
1. Novo gancho visual (primeiros 3s do vídeo ou imagem principal)
2. Nova headline
3. Novo copy (dor + benefício + curiosidade)
4. Formato diferente (vídeo, estático, carrossel)
5. Público mais aquecido

**Hook Rate baixo (vídeo, abaixo de 20%):**
1. Criar nova abertura — os primeiros 3s determinam tudo
2. Tipos de gancho eficientes: pergunta direta, afirmação ousada, cena de impacto
3. Evitar logo/branding nos primeiros segundos

**Frequência alta (acima de 3,5):**
1. Pausar criativo e substituir por versão nova
2. Expandir o público
3. Criar variação com mesmo conceito, visual diferente

**CPL alto:**
1. Verificar o funil completo antes de pausar o criativo
2. Analisar: CPM → CTR → Hook Rate → taxa de conversão do formulário/landing
3. Agir no ponto específico onde está o gargalo

### 4) Estrutura de campanha

Como os públicos estão organizados dentro das campanhas?

Reorganizar quando necessário por:
- **Níveis de aquecimento** (frio, morno, quente)
- **Posicionamentos** (feed, stories, reels separados)
- **Segmentações demográficas** (faixa etária, gênero, localização)

Revisar a estrutura completa a cada 7-14-21 dias.

### 5) Destino

O que acontece depois que a pessoa clica?

- **Landing page:** velocidade, clareza da oferta, formulário simples
- **Atendimento:** tempo de resposta, abordagem do SDR, script de qualificação
- **Experiência no site:** UX, mobile, prova social
- **Taxa de conversão do funil:** quantos leads viram visitas, quantas visitas viram vendas

Se o CTR está bom mas o CPL está alto, o problema provavelmente está no destino, não no criativo.

---

## PASSO 6 — Veredito por criativo

Para cada criativo analisado, entregar um veredito claro:

| Veredito | Quando usar | Ação |
|---|---|---|
| ✅ **Escalar** | CPL dentro do aceitável, resultado bom | Aumentar orçamento 20-30% |
| ⏸️ **Manter** | Ainda no período de aprendizado ou resultado ok | Não mexer, aguardar |
| 🔄 **Testar variação** | Performando bem, explorar formatos | Criar versão com formato/gancho diferente |
| ⚠️ **Ajustar** | Métrica específica quebrada (CTR, Hook Rate) | Identificar ponto exato e corrigir |
| ❌ **Pausar** | Fora do benchmark após período mínimo | Pausar e criar novo criativo |

---

## PASSO 7 — Output obrigatório da análise

### Diagnóstico
- Qual métrica está quebrando a cadeia?
- O problema está no criativo, público, orçamento ou destino?

### Veredito por criativo
Apresentar a tabela com veredito para cada criativo analisado.

### Próximas 3 ações prioritárias
Específicas, com o que fazer e em qual elemento (orçamento, público, criativo ou destino).

---

## PASSO 8 — Disparo automático para novos criativos

**Quando o veredito incluir ⚠️ Ajustar ou ❌ Pausar para qualquer criativo**, executar automaticamente:

```bash
RESPOSTA=$(curl -s -X POST \
  "https://n8n.mktsimple.com.br/webhook/criativo-reformulado" \
  -H "Content-Type: application/json" \
  -d "{
    \"cliente\": \"SLUG_DO_CLIENTE\",
    \"criativo_id\": \"ID_DO_ANUNCIO\",
    \"ad_name\": \"NOME_DO_ANUNCIO\",
    \"veredito\": \"pausar_ou_ajustar\",
    \"problema\": \"DESCRICAO_DO_PROBLEMA\",
    \"metricas\": {
      \"ctr\": 0.0,
      \"frequencia\": 0.0,
      \"cpm\": 0.0,
      \"cpl\": 0.0
    },
    \"objetivo\": \"leads_ou_mensagens_ou_trafego\",
    \"contexto_cliente\": \"SEGMENTO_CIDADE_ESTADO\"
  }")
echo "$RESPOSTA"
```

Após receber a resposta do n8n, apresentar o diagnóstico normalmente e **ao final da mensagem** incluir o bloco abaixo (sem nenhum texto depois dele):

```
CRIATIVO_GERADO:{"versao_a":{"headline":"...","texto":"...","cta":"..."},"versao_b":{"headline":"...","texto":"...","cta":"..."},"image_base64":"...","cliente":"SLUG","criativo_id":"ID"}
```

Substituir os valores pelos campos retornados pelo n8n (`versao_a`, `versao_b`, `image_base64`, `cliente`, `criativo_id`).

O webapp detecta esse marcador e exibe o card de aprovação automaticamente — não mencione isso ao usuário, ele verá o card diretamente.

---

## Regras que nunca mudam

- Nunca pausar um criativo antes do período mínimo
- Nunca fazer múltiplas alterações ao mesmo tempo (não saberá o que funcionou)
- **Sempre subir um criativo novo quando pausar outro** — vale para anúncios, públicos e estrutura
- Toda alteração grande pode resetar o aprendizado — isso não é problema se a mudança for estratégica
- O melhor benchmark são os seus próprios dados históricos do cliente
- Se a métrica principal está boa, não mexa no que está funcionando
