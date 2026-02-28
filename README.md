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

Busca recursos do cloud, compara com state local e gera migration com as diferenças.

```sh
tam pull --dir ./env/dev --env-file .env.dev
tam pull --dir ./env/dev --env-file .env.dev --resources taskQueues,workflows
```

### push — Aplicar migrations pendentes

Executa migrations pendentes no ambiente destino. Resolve referências `@ref` automaticamente.

```sh
tam push --dir ./env/dev --env-file .env.prod
tam push --dir ./env/dev --env-file .env.prod --dry-run   # Preview sem executar
```

### diff — Comparar state local vs cloud

Mostra diferenças sem gerar migrations nem alterar state.

```sh
tam diff --dir ./env/dev --env-file .env.dev
```

### revert — Reverter migration

Executa operações inversas (rollback) de uma migration aplicada.

```sh
tam revert --dir ./env/dev --env-file .env.dev                  # Reverte a última
tam revert nome-da-migration --dir ./env/dev --env-file .env.dev  # Reverte específica
```

### migration — Gerenciar migrations

```sh
tam migration new "add support queue" --dir ./env/dev   # Cria migration manual vazia
tam migration list --dir ./env/dev                      # Lista migrations e status
```

## Recursos Suportados

| Tipo       | Recurso                                          |
| ---------- | ------------------------------------------------ |
| TaskRouter | Task Queues, Task Channels, Workflows, Workspace |
| Studio     | Studio Flows (com definition completa)           |
| Content    | Content Templates                                |

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
│   └── migrations.json           # Controle de aplicadas/pendentes
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
