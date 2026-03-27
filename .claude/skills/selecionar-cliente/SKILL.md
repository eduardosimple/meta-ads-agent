# Skill: selecionar-cliente

## Objetivo
Carregar as credenciais e contexto de um cliente específico antes de qualquer operação.

## Quando usar
- **Sempre como passo 0** — antes de qualquer outra skill
- Quando o usuário mencionar um cliente pelo nome
- Ao trocar de cliente durante a sessão

## Fluxo

### 1. Identificar o cliente pedido

O usuário pode mencionar o cliente de diversas formas:
- "Crie uma campanha para o **Residencial Aurora**"
- "Quero trabalhar com a **Construtora Horizonte**"
- "Cliente: **aurora**"

Extraia o nome e use para carregar as credenciais.

### 2. Listar clientes disponíveis (se necessário)

```bash
source setup.sh
```

Isso exibe todos os clientes cadastrados no `clients.json`.

### 3. Carregar cliente

```bash
source setup.sh "Nome do Cliente"
```

Exemplos:
```bash
source setup.sh "Residencial Aurora"
source setup.sh residencial-aurora
```

### 4. Confirmar carregamento

Verificar que as variáveis foram exportadas:
```bash
echo "Cliente: $NOME"
echo "Conta:   $META_AD_ACCOUNT_ID"
echo "Cidade:  $CLIENT_CIDADE"
```

## Contexto disponível após seleção

| Variável | Descrição |
|----------|-----------|
| `NOME` | Nome do cliente |
| `META_ACCESS_TOKEN` | Token de acesso à Meta API |
| `META_AD_ACCOUNT_ID` | ID da conta de anúncios |
| `META_APP_ID` | ID do app Meta |
| `META_APP_SECRET` | Chave secreta do app |
| `META_PAGE_ID` | ID da página do Facebook |
| `META_PAGE_NAME` | Nome da página |
| `META_INSTAGRAM_ACTOR_ID` | ID da conta do Instagram vinculada (se existir) |
| `META_WHATSAPP_NUMBER` | Número do WhatsApp com DDI+DDD (se existir) |
| `CLIENT_CIDADE` | Cidade principal do cliente |
| `CLIENT_ESTADO` | Estado |
| `CLIENT_ORCAMENTO_PADRAO` | Orçamento diário padrão (centavos) |
| `CLIENT_OBJETIVO_PADRAO` | Objetivo padrão de campanha |

## Usar contexto nas skills seguintes

Com o contexto do cliente carregado, as outras skills devem **pré-preencher** valores padrão:
- Cidade e estado do cliente → usados em `/criar-adset` como localização padrão
- Orçamento padrão → sugerido em `/criar-campanha`
- Objetivo padrão → sugerido em `/criar-campanha`

## Adicionar novo cliente

Edite o arquivo `clients.json` seguindo o modelo do `clients.example.json`:

```json
{
  "nome": "Nome do Cliente",
  "slug": "nome-do-cliente",
  "ativo": true,
  "meta": {
    "access_token": "TOKEN_AQUI",
    "ad_account_id": "act_XXXXXXXXX",
    "app_id": "APP_ID_AQUI",
    "app_secret": "APP_SECRET_AQUI",
    "page_id": "PAGE_ID_AQUI",
    "page_name": "Nome da Página",
    "instagram_actor_id": "INSTAGRAM_ID_AQUI",
    "whatsapp_number": "5549999999999"
  },
  "contexto": {
    "segmento": "imobiliário",
    "cidade": "São Paulo",
    "estado": "SP",
    "publico_alvo": "25-55 anos",
    "orcamento_diario_padrao": 5000,
    "objetivo_padrao": "OUTCOME_LEADS"
  }
}
```

## Saída esperada para o usuário
- ✅ Cliente selecionado: `NOME`
- ✅ Conta: `act_XXXXXXXXX`
- ➡️ Próximo passo: `/meta-auth`
