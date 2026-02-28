# tam — Twilio Account Migrate

CLI para gerenciamento de recursos Twilio via migrations entre ambientes. Projetado para pipelines CI/CD — pull do cloud, geração de migrations declarativas, push para qualquer conta com resolução automatica de SIDs.

## Requisitos

- Node.js 18+
- Credenciais Twilio (API Key + Secret)

## Instalação

```sh
npm install
npm run build
```

## Autenticação

Crie um arquivo `.env` por ambiente:

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_API_KEY_SID=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_API_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## Comandos

### pull — Baixar recursos e gerar migration

Busca recursos do cloud (incluindo Serverless para mapeamento de SIDs/URLs), substitui automaticamente SIDs e URLs por referências `@ref`, compara com state local e gera migration com as diferenças.

```sh
tam pull --dir ./env/dev --env-file .env.dev
tam pull --dir ./env/dev --env-file .env.dev --resources taskQueues,workflows
```

### push — Aplicar migrations pendentes

Executa migrations pendentes (e parcialmente aplicadas) no ambiente destino. Resolve referências `@ref` automaticamente, incluindo padrões Serverless. Aplica delay de 1s entre operações para respeitar rate limits da API. Resumível em caso de falha — retoma da operação onde parou.

```sh
tam push --dir ./env/dev --env-file .env.prod
tam push --dir ./env/dev --env-file .env.prod --dry-run   # Preview sem executar
```

### diff — Comparar state local vs cloud

Mostra diferenças sem gerar migrations nem alterar state.

```sh
tam diff --dir ./env/dev --env-file .env.dev
```

### diff-env — Comparar dois ambientes locais

Compara state de dois ambientes locais e gera migration no diretório destino com as diferenças.

```sh
tam diff-env --source ./env/dev --target ./env/prod
tam diff-env --source ./env/dev --target ./env/prod --resources taskQueues,workflows
```

### revert — Reverter migration

Executa operações inversas (rollback) de uma migration aplicada. Suporta migrations parcialmente aplicadas — reverte apenas as operações que foram executadas com sucesso (em ordem inversa).

```sh
tam revert --dir ./env/dev --env-file .env.dev                  # Reverte a última
tam revert nome-da-migration --dir ./env/dev --env-file .env.dev  # Reverte específica
```

### migration — Gerenciar migrations

```sh
tam migration new "add support queue" --dir ./env/dev   # Cria migration manual vazia
tam migration list --dir ./env/dev                      # Lista migrations e status (applied/pending/partiallyApplied)
```

## Recursos Suportados

| Tipo       | Recurso                                                        |
| ---------- | -------------------------------------------------------------- |
| TaskRouter | Task Queues, Task Channels, Workflows, Workspace               |
| Studio     | Studio Flows (com definition completa + updates parciais de widgets) |
| Content    | Content Templates                                              |
| Serverless | Services, Environments, Functions (read-only, para mapeamento de SIDs/URLs) |

## Estrutura do Ambiente

Cada ambiente mantém seu diretório com state e migrations:

```
env/dev/
├── state/
│   ├── taskQueues.json
│   ├── taskChannels.json
│   ├── workflows.json
│   ├── studioFlows.json
│   ├── contentTemplates.json
│   ├── serverless.json             # Serverless services/envs/functions (read-only)
│   └── migrations.json             # Controle de applied/pending/partiallyApplied
└── migrations/
    ├── 20260227_143000_pull-changes.json
    └── 20260227_150000_add-support-queue.json
```

## Formato de Migration

Cada migration contém operações declarativas e rollback automático:

```json
{
  "description": "pull-changes",
  "createdAt": "2026-02-27T14:30:00.000Z",
  "source": "pull",
  "operations": [
    {
      "action": "create",
      "type": "taskQueues",
      "data": { "friendlyName": "Support", "targetWorkers": "1==1" }
    },
    {
      "action": "update",
      "type": "workflows",
      "match": { "friendlyName": "Main" },
      "data": { "configuration": {} }
    },
    { "action": "delete", "type": "taskQueues", "match": { "friendlyName": "Old Queue" } }
  ],
  "rollback": [
    {
      "action": "create",
      "type": "taskQueues",
      "data": { "friendlyName": "Old Queue", "targetWorkers": "1==1" }
    },
    {
      "action": "update",
      "type": "workflows",
      "match": { "friendlyName": "Main" },
      "data": { "configuration": {} }
    },
    { "action": "delete", "type": "taskQueues", "match": { "friendlyName": "Support" } }
  ]
}
```

## Resolução de @ref

Migrations usam `@ref:type:name` em vez de SIDs hardcoded, garantindo portabilidade entre contas:

```json
{
  "configuration": {
    "task_routing": {
      "default_filter": {
        "queue": "@ref:taskQueues:Support"
      }
    }
  }
}
```

No push, `@ref:taskQueues:Support` é resolvido para o SID real a partir do state local ou de recursos criados na mesma migration.

### Padrões Serverless @ref

O pull gera automaticamente referências `@ref` para recursos Serverless, resolvidas no push:

| Padrão                              | Resolve Para         | Exemplo                                              |
| ----------------------------------- | -------------------- | ---------------------------------------------------- |
| `@ref:serverless:Nome`              | Service SID (ZS)     | `@ref:serverless:my-service`                         |
| `@ref:serverlessEnv:Svc:Env`       | Environment SID (ZE) | `@ref:serverlessEnv:my-service:production`           |
| `@ref:serverlessFn:Svc:Fn`         | Function SID (ZH)    | `@ref:serverlessFn:my-service:my-fn`                 |
| `@ref:serverlessUrl:Svc:Env:/path` | URL completa         | `@ref:serverlessUrl:my-service:production:/my-fn`    |

## Updates Parciais de Widgets (Studio Flows)

Migrations podem usar `mode: "partial"` com `widgetOps` para alterações granulares em widgets de Studio Flows, sem reenviar o flow inteiro:

```json
{
  "action": "update",
  "type": "studioFlows",
  "match": { "friendlyName": "Main IVR" },
  "mode": "partial",
  "widgetOps": [
    { "action": "create_widget", "widget": "new_step", "data": { "name": "new_step", "type": "send-message" } },
    { "action": "update_widget", "widget": "greeting", "data": { "properties": { "body": "Olá!" } } },
    { "action": "delete_widget", "widget": "old_step" },
    { "action": "rename_widget", "widget": "step1", "newName": "welcome_step" }
  ]
}
```

No push, o executor busca a definition atual do flow no state, aplica as operações de widget e envia o resultado mesclado.

## Migrations Parcialmente Aplicadas

Se um push falha no meio da execução, a migration é salva como `partiallyApplied` em `migrations.json` com progresso:

```json
{
  "applied": ["migration-1.json"],
  "partiallyApplied": {
    "migration-2.json": { "appliedAt": "...", "completedOps": 35, "totalOps": 70 }
  }
}
```

Re-executar `push` retoma da operação 36. Reverter uma migration parcialmente aplicada desfaz apenas as operações que foram executadas (em ordem inversa).

## Workflow CI/CD

```
1. Pull (dev)     → Gera migration a partir do cloud dev
2. Commit         → Migration versionada no repositório
3. Push (staging) → Aplica migration no staging com SIDs resolvidos
4. Push (prod)    → Aplica mesma migration em prod
```

## Scripts

| Script           | Descrição                         |
| ---------------- | --------------------------------- |
| `npm run build`  | Copia src/ para dist/             |
| `npm start`      | Executa CLI (requer build)        |
| `npm run dev`    | Executa com auto-reload (nodemon) |
| `npm test`       | Executa testes (Jest)             |
| `npm run lint`   | ESLint                            |
| `npm run format` | Prettier                          |
