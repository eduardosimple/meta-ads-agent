# Criativos Fiéis à Marca — Brand Kit Derivado dos Criativos Ativos — Design

**Data:** 2026-06-01
**Projeto:** meta-ads-agent + design-agent
**Status:** design aprovado na direção; implementação pendente (sessão dedicada)

## Problema (relatado pelo Eduardo)
A requisição de nova arte não bate com a identidade do cliente. O gerador atual cria criativos "aleatórios" fora da marca — não respeita fontes, lettering, cores nem branding, e não parte dos renders/imagens-base/criativos já feitos.

## Causa raiz (investigada)
Pipeline tem 2 caminhos:
- **Caminho A (whitelist ~7 clientes):** script Python próprio em `~/agents/_shared/assets/` (scala, bossa, gamma, famex, new, eletropaulo) com branding hardcoded → saem certos.
- **Caminho B (genérico, skill `gerar-criativo-nano`):** todos os outros. O "Passo 0" tenta carregar branding de `~/agents/_shared/clientes/[slug].md` (perfil), `[slug]-brand.md` (brand book) ou histórico. Mas **os dados quase não existem**: só 15/~65 perfis, 1 brand book (scala), 0 estrutura de renders. Sem isso, o nano gera um fundo do zero via Gemini → fora da marca.
- Modelo do que funciona: pasta `_shared/assets/gamma/` tem renders (DJI_*.jpg), logos, fontes (Poppins), lifestyle e artes prontas.

## Abordagem escolhida (ideia do Eduardo): derivar o brand kit dos criativos ATIVOS
Em vez de cadastrar brand kit manual pra 58 clientes, **derivar a identidade visual dos anúncios que já rodam no Meta**:

1. Buscar os ads ATIVOS do cliente (Graph API — validado: `GET /{ad_account}/ads?fields=name,effective_status,creative{image_url,thumbnail_url},insights{ctr,impressions}`). ⚠️ Filtrar `effective_status` em código, não na URL (colchetes quebram o curl). Nem todo cliente com gasto retorna ads "ACTIVE" — investigar os outros effective_status (ADSET_PAUSED etc.) na implementação.
2. Baixar as imagens dos melhores por CTR (com impressões mínimas) → "verdade visual" da marca.
3. **Extrair identidade:** paleta de cores dominantes (Pillow/quantização) + estilo/elementos/lettering (Gemini vision descrevendo o criativo vencedor).
4. **Gerar a nova versão adaptando** o criativo vencedor (image-to-image no Gemini, mantendo identidade visual) + troca a mensagem (copy nova do conteudo-agent). NÃO gerar do zero.
5. **Regra anti-aleatório:** se o cliente não tem criativo ativo aproveitável NEM assets locais, o pipeline NÃO inventa — sinaliza "falta base de marca pra [cliente]".
6. Assets locais existentes (gamma/new/scala) viram complemento/override quando presentes (Caminho A continua valendo).

## Componentes (a implementar)
- `~/agents/design/scripts/brand_from_active.py` (NOVO) — dado slug+token+ad_account: busca ads ativos, baixa top imagens, extrai paleta (Pillow) e salva um "brand kit derivado" em `~/agents/_shared/assets/brand/[slug]/` (renders baixados + `brand-derived.json` com paleta + refs).
- Skill `gerar-criativo-nano` Passo 0 (EDIT) — antes de cair em heurística, chamar o brand_from_active e usar o criativo vencedor como **referência forte / base image-to-image**.
- `generate_with_nano.py` (EDIT) — suportar modo image-to-image (passar imagem de referência ao Gemini) além do text-to-image atual.
- Skill `gerar-criativo-solicitado` (EDIT) — passar a imagem do best_ad já baixada ao design-agent.

## Fases
- **Fase 1 (fundação, testável):** `brand_from_active.py` — buscar+baixar+extrair identidade de 1 cliente piloto. Prova que dá pra derivar a marca dos ativos. Sem geração ainda.
- **Fase 2:** geração image-to-image usando a referência derivada + regra anti-aleatório no pipeline.
- **Fase 3:** rodar pra todos os clientes (popular `assets/brand/`), e Caminho A (scripts) vira override.

## Estado da PoC (01/06)
Validado: Graph API responde e lista ads/creative (resposta 36KB sem erro). Pendente: confirmar o filtro de ads realmente ativos (bem-mais-consultas retornou 0 ACTIVE apesar de gasto — checar effective_status); martins tem ads ativos com mídia (AD36) — bom candidato a piloto.

## Recomendação
Implementar em sessão dedicada e estável (pipeline de geração de imagem precisa de foco; a sessão de 01/06 estava longa/instável). Começar pela Fase 1 (brand_from_active) que é verificável isoladamente.
