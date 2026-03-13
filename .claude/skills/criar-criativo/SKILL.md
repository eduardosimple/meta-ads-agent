# Skill: criar-criativo

## Objetivo
Criar um criativo (Ad Creative) com imagem/vídeo e copy otimizados para anúncios imobiliários.

## Quando usar
- Após `/criar-adset` retornar um `adset_id`

## Pré-requisitos
- `page_id` da página do Facebook do cliente
- `META_ACCESS_TOKEN` disponível
- Mídia disponível (URL de imagem ou hash de upload)

## Informações a coletar do usuário

1. **Formato do criativo:**
   - `SINGLE_IMAGE` — imagem única
   - `SINGLE_VIDEO` — vídeo único
   - `CAROUSEL` — carrossel (múltiplas imagens/vídeos)
2. **Título** (headline) — máx 40 caracteres
3. **Texto principal** (body) — máx 125 caracteres para feed
4. **Descrição** (opcional) — máx 30 caracteres
5. **CTA (Call to Action):**
   - `LEARN_MORE` — Saiba mais
   - `CONTACT_US` — Fale conosco
   - `GET_QUOTE` — Solicitar orçamento
   - `SIGN_UP` — Cadastrar-se
6. **URL de destino** — link do site ou landing page do imóvel
7. **Imagem/Vídeo** — URL pública ou fazer upload

## Upload de imagem (se necessário)

```bash
curl -X POST \
  "https://graph.facebook.com/v19.0/$META_AD_ACCOUNT_ID/adimages" \
  -F "filename=@/caminho/para/imagem.jpg" \
  -F "access_token=$META_ACCESS_TOKEN"
```

Salve o `hash` retornado para usar no criativo.

## Chamada à API — Imagem única

```bash
curl -X POST \
  "https://graph.facebook.com/v19.0/$META_AD_ACCOUNT_ID/adcreatives" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "NOME_DO_CRIATIVO",
    "object_story_spec": {
      "page_id": "PAGE_ID",
      "link_data": {
        "image_hash": "HASH_DA_IMAGEM",
        "link": "https://url-do-imovel.com.br",
        "message": "Texto principal do anúncio aqui.",
        "name": "Título do anúncio",
        "description": "Descrição opcional",
        "call_to_action": {
          "type": "LEARN_MORE",
          "value": {"link": "https://url-do-imovel.com.br"}
        }
      }
    }
  }' \
  -d "access_token=$META_ACCESS_TOKEN"
```

## Chamada à API — Carrossel

```bash
curl -X POST \
  "https://graph.facebook.com/v19.0/$META_AD_ACCOUNT_ID/adcreatives" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "NOME_DO_CRIATIVO",
    "object_story_spec": {
      "page_id": "PAGE_ID",
      "link_data": {
        "message": "Conheça o Residencial X. Apartamentos com X quartos a partir de R$ XXX mil.",
        "link": "https://url-do-imovel.com.br",
        "call_to_action": {"type": "LEARN_MORE"},
        "child_attachments": [
          {
            "link": "https://url-do-imovel.com.br",
            "image_hash": "HASH_1",
            "name": "Fachada do empreendimento",
            "description": "3 quartos, 2 vagas"
          },
          {
            "link": "https://url-do-imovel.com.br",
            "image_hash": "HASH_2",
            "name": "Área de lazer completa",
            "description": "Piscina, churrasqueira e academia"
          }
        ]
      }
    }
  }' \
  -d "access_token=$META_ACCESS_TOKEN"
```

## Boas práticas de copy imobiliária

- ✅ Destaque localização: "No coração do Tatuapé, a 5min do metrô"
- ✅ Mencione diferencial: "Área de lazer completa", "Varanda gourmet"
- ✅ CTA direto: "Agende sua visita hoje"
- ❌ Não use linguagem excludente ou discriminatória
- ❌ Não mencione raça, religião, origem ou estado civil
- ❌ Evite promessas de valorização garantida

## Saída esperada para o usuário
Confirmar:
- ✅ Criativo criado: `NOME` (ID: `XXXXXXXXX`)
- ✅ Formato: [tipo]
- ✅ Página vinculada: [page_id]
- ➡️ Próximo passo: `/criar-anuncio`
