# Skill: criar-criativo

## ⛔ REGRAS CRÍTICAS — LEIA ANTES DE QUALQUER COISA

1. **DESTINO = WHATSAPP** → use OBRIGATORIAMENTE `"type": "WHATSAPP_MESSAGE"` no CTA com `"app_destination": "WHATSAPP"` e `"link": "https://wa.me/55NUMERO"`. NUNCA use `LEARN_MORE` ou link de site quando o destino for WhatsApp.
2. **INSTAGRAM** → SEMPRE perguntar o `instagram_actor_id` antes de criar o criativo. Se o usuário informou no prompt, use. Se não informou, pergunte. Se não tiver, omita o campo — mas NUNCA invente ou deixe como placeholder.
3. O campo `instagram_actor_id` fica dentro de `object_story_spec`, no mesmo nível que `page_id` — não dentro de `link_data`.
4. Para WhatsApp, o campo `link` dentro do `link_data` NÃO existe — use apenas o CTA com `app_destination`.

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
   - `WHATSAPP_MESSAGE` — Enviar mensagem (usar quando destino = WhatsApp)
6. **URL de destino** — link do site, landing page ou número WhatsApp
7. **Imagem/Vídeo** — URL pública ou fazer upload
8. **Instagram** — perguntar se o cliente tem conta no Instagram vinculada (`instagram_actor_id`). Se sim, incluir no criativo para que apareça no Instagram com a identidade correta.

## Upload de imagem (se necessário)

```bash
curl -X POST \
  "https://graph.facebook.com/v19.0/$META_AD_ACCOUNT_ID/adimages" \
  -F "filename=@/caminho/para/imagem.jpg" \
  -F "access_token=$META_ACCESS_TOKEN"
```

Salve o `hash` retornado para usar no criativo.

## Chamada à API — Imagem única (destino Website)

```bash
curl -X POST \
  "https://graph.facebook.com/v19.0/$META_AD_ACCOUNT_ID/adcreatives" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "NOME_DO_CRIATIVO",
    "object_story_spec": {
      "page_id": "PAGE_ID",
      "instagram_actor_id": "INSTAGRAM_ACCOUNT_ID",
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

> Se o cliente não tiver Instagram vinculado, omitir o campo `instagram_actor_id`.

## Chamada à API — Imagem única (destino WhatsApp)

```bash
curl -X POST \
  "https://graph.facebook.com/v19.0/$META_AD_ACCOUNT_ID/adcreatives" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "NOME_DO_CRIATIVO",
    "object_story_spec": {
      "page_id": "PAGE_ID",
      "instagram_actor_id": "INSTAGRAM_ACCOUNT_ID",
      "link_data": {
        "image_hash": "HASH_DA_IMAGEM",
        "message": "Texto principal do anúncio aqui.",
        "name": "Título do anúncio",
        "call_to_action": {
          "type": "WHATSAPP_MESSAGE",
          "value": {
            "app_destination": "WHATSAPP",
            "link": "https://wa.me/55XXXXXXXXXXX"
          }
        }
      }
    }
  }' \
  -d "access_token=$META_ACCESS_TOKEN"
```

> Para WhatsApp: substituir `55XXXXXXXXXXX` pelo número com DDI+DDD+número (sem espaços ou traços). O campo `link` do WhatsApp não usa URL de site.

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
