# twilio-account-migrate-cli

CLI para migrar Flows do Twilio Studio e preparar migração de outros serviços entre contas.

## Requisitos
- Node.js 18+
- Credenciais Twilio (origem e destino)

## Configuração
1. Copie `.env.example` para `.env` e preencha ou deixe a CLI solicitar.
2. Instale dependências:
   ```sh
   npm install
   ```

## Uso
- Build: `npm run build`
- Start: `npm start`
- Dev: `npm run dev`
- Lint: `npm run lint`
- Format: `npm run format`
- Test: `npm test`

## Comandos

### Modo interativo (padrão)

```sh
tam
```

### pull — Baixar recursos

```sh
tam pull --account <nome> --resources workflows,taskQueues
```

### push — Aplicar alterações no destino

```sh
tam push --account <nome> --dest <nome-destino> --resources workflows
```

### compare — Comparar ambientes

```sh
tam compare --source <nome-origem> --dest <nome-destino> --mode advanced
```

### search — Pesquisar recursos em cache

```sh
tam search --account <nome> --term "texto" --mode simple
```

### vars — Gerenciar variáveis (SIDs)

```sh
# Extrair SIDs dos recursos em cache
tam vars init --account <nome>

# Exibir variáveis de uma conta
tam vars show --account <nome>

# Criar mapeamento entre duas contas
tam vars map --source <origem> --dest <destino>
```

### deploy — Deploy em massa de recursos

Cria recursos em massa na conta Twilio a partir de um arquivo JSON.

```sh
tam deploy --account <nome> --file recursos.json
tam deploy --account <nome> --file recursos.json --var TASKQUEUE_ATIVO=WQxxx --var TASKQUEUE_PADRAO=WQyyy

# Usando arquivo .env para credenciais
tam deploy --env-file .env --file recursos.json
```

#### Opções

| Opção | Descrição |
|-------|-----------|
| `--account <nome>` | Nome da conta destino (cadastrada previamente) |
| `--file <caminho>` | **(obrigatório)** Caminho para arquivo JSON com array de recursos |
| `--var <KEY=VALUE>` | Variáveis para substituição de placeholders (pode ser repetido) |
| `--env-file <caminho>` | Arquivo .env com credenciais (alternativa a --account) |
| `--data-dir <caminho>` | Diretório customizado para armazenamento |

#### Formato do arquivo JSON

O arquivo deve conter um **JSON array** onde cada objeto representa um recurso a ser criado. Cada objeto deve ter um campo `type` indicando o tipo de recurso.

**Ordem de processamento:** Os recursos são automaticamente ordenados por dependência:
1. `taskQueues` (primeiro, pois outros dependem deles)
2. `workflows`
3. `studioFlows`
4. `contentTemplates`

Isso significa que você pode colocar os recursos em qualquer ordem no JSON — o sistema garante que Task Queues são criadas antes de Workflows que referenciam seus SIDs.

#### Sistema de variáveis e placeholders

Ao criar um recurso, o SID retornado é automaticamente registrado como variável. O nome da variável segue o padrão:

```
<PREFIXO_TIPO>_<NOME_UPPER_SNAKE_CASE>
```

| Tipo | Prefixo | Exemplo de nome | Variável gerada |
|------|---------|-----------------|-----------------|
| `taskQueues` | `TASKQUEUE` | Ativo | `TASKQUEUE_ATIVO` |
| `workflows` | `WORKFLOW` | Main Flow | `WORKFLOW_MAIN_FLOW` |
| `studioFlows` | `STUDIOFLOW` | IVR Flow | `STUDIOFLOW_IVR_FLOW` |
| `contentTemplates` | `CONTENTTEMPLATE` | Welcome | `CONTENTTEMPLATE_WELCOME` |

Para referenciar uma variável dentro de um campo, use o formato:

```
%REPLACE_<NOME_VARIAVEL>%
```

Exemplo: `%REPLACE_TASKQUEUE_ATIVO%` será substituído pelo SID do Task Queue "Ativo".

Você pode passar variáveis iniciais via `--var` na linha de comando:

```sh
tam deploy --file recursos.json --var TASKQUEUE_ATIVO=WQ123 --var TASKQUEUE_PADRAO=WQ456
```

---

## Tipos de Recursos — Payload JSON

### Task Queue

Cria uma Task Queue no TaskRouter.

| Campo | Tipo | Obrigatório | Padrão | Descrição |
|-------|------|-------------|--------|-----------|
| `type` | string | sim | — | Deve ser `"taskQueues"` |
| `friendlyName` | string | sim | — | Nome da Task Queue |
| `targetWorkers` | string | não | `"1==1"` | Expressão de filtro de workers |
| `maxReservedWorkers` | number | não | `1` | Máximo de workers reservados simultaneamente |
| `taskOrder` | string | não | `"FIFO"` | Ordem de processamento: `"FIFO"` ou `"LIFO"` |

```json
{
  "type": "taskQueues",
  "friendlyName": "Ativo",
  "targetWorkers": "1==1",
  "maxReservedWorkers": 1,
  "taskOrder": "FIFO"
}
```

### Workflow

Cria um Workflow no TaskRouter. O campo `configuration` aceita referências a Task Queues via placeholders.

| Campo | Tipo | Obrigatório | Padrão | Descrição |
|-------|------|-------------|--------|-----------|
| `type` | string | sim | — | Deve ser `"workflows"` |
| `friendlyName` | string | sim | — | Nome do Workflow |
| `configuration` | object/string | sim | — | Configuração de roteamento (JSON object ou string) |
| `assignmentCallbackUrl` | string | não | `""` | URL de callback de atribuição |
| `taskReservationTimeout` | number | não | `120` | Timeout de reserva em segundos |

```json
{
  "type": "workflows",
  "friendlyName": "Roteamento Principal",
  "assignmentCallbackUrl": "",
  "taskReservationTimeout": 120,
  "configuration": {
    "task_routing": {
      "filters": [
        {
          "filter_friendly_name": "Ativo",
          "expression": "1==1",
          "targets": [
            {
              "queue": "%REPLACE_TASKQUEUE_ATIVO%",
              "priority": 1,
              "timeout": 300
            }
          ]
        }
      ],
      "default_filter": {
        "queue": "%REPLACE_TASKQUEUE_PADRAO%"
      }
    }
  }
}
```

### Studio Flow

Cria um Flow no Twilio Studio.

| Campo | Tipo | Obrigatório | Padrão | Descrição |
|-------|------|-------------|--------|-----------|
| `type` | string | sim | — | Deve ser `"studioFlows"` |
| `friendlyName` | string | sim | — | Nome do Flow |
| `definition` | object | sim | — | Definição completa do flow (estados, transições, widgets) |
| `status` | string | não | `"draft"` | Status: `"draft"` ou `"published"` |
| `commitMessage` | string | não | `"Bulk deploy"` | Mensagem de commit do flow |

```json
{
  "type": "studioFlows",
  "friendlyName": "IVR Principal",
  "status": "draft",
  "commitMessage": "Deploy inicial via CLI",
  "definition": {
    "description": "IVR Principal",
    "states": [
      {
        "name": "Trigger",
        "type": "trigger",
        "transitions": []
      }
    ],
    "initial_state": "Trigger",
    "flags": {
      "allow_concurrent_calls": true
    }
  }
}
```

### Content Template

Cria um Content Template.

| Campo | Tipo | Obrigatório | Padrão | Descrição |
|-------|------|-------------|--------|-----------|
| `type` | string | sim | — | Deve ser `"contentTemplates"` |
| `friendlyName` | string | sim | — | Nome do template |
| `types` | object | não | — | Tipos de conteúdo (ex: `twilio/text`, `twilio/media`) |
| `variables` | object | não | — | Variáveis do template |
| `language` | string | não | — | Código do idioma (ex: `"pt-BR"`, `"en"`) |
| `channel` | string | não | — | Canal de entrega |
| `content` | object | não | — | Conteúdo do template |

```json
{
  "type": "contentTemplates",
  "friendlyName": "Boas vindas",
  "language": "pt-BR",
  "types": {
    "twilio/text": {
      "body": "Olá {{1}}, bem-vindo!"
    }
  },
  "variables": {
    "1": "nome"
  }
}
```

---

## Exemplo completo — arquivo JSON

Arquivo `recursos.json` com Task Queues + Workflow usando placeholders:

```json
[
  {
    "type": "taskQueues",
    "friendlyName": "Ativo",
    "targetWorkers": "1==1",
    "maxReservedWorkers": 5,
    "taskOrder": "FIFO"
  },
  {
    "type": "taskQueues",
    "friendlyName": "Padrão",
    "targetWorkers": "skills HAS \"default\"",
    "maxReservedWorkers": 1,
    "taskOrder": "FIFO"
  },
  {
    "type": "workflows",
    "friendlyName": "Roteamento Principal",
    "taskReservationTimeout": 120,
    "configuration": {
      "task_routing": {
        "filters": [
          {
            "filter_friendly_name": "Filtro Ativo",
            "expression": "type == 'ativo'",
            "targets": [
              {
                "queue": "%REPLACE_TASKQUEUE_ATIVO%",
                "priority": 1,
                "timeout": 300
              }
            ]
          }
        ],
        "default_filter": {
          "queue": "%REPLACE_TASKQUEUE_PADRAO%"
        }
      }
    }
  }
]
```

Executar:

```sh
tam deploy --account minha-conta --file recursos.json
```

O que acontece:
1. Task Queue "Ativo" é criada → variável `TASKQUEUE_ATIVO` = SID retornado
2. Task Queue "Padrão" é criada → variável `TASKQUEUE_PADRAO` = SID retornado
3. Workflow "Roteamento Principal" tem `%REPLACE_TASKQUEUE_ATIVO%` e `%REPLACE_TASKQUEUE_PADRAO%` substituídos pelos SIDs reais antes da criação

---

## Observações
- O replace de SIDs considera TaskRouter (workflows, queues, activities, channels) e Serverless (services, environments, functions). Expanda conforme necessário.
- Recursos são processados na ordem de dependência, independente da ordem no JSON.
- Placeholders não resolvidos geram erro para o recurso específico (os demais continuam).
