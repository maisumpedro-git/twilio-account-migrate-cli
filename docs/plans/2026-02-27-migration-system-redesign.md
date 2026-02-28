# Design: Migration System Redesign

**Data**: 2026-02-27
**Status**: Aprovado

## Visao Geral

Refatoracao completa do `tam` (Twilio Account Migrate) de um dashboard interativo com cache para uma ferramenta CLI pura orientada a migrations, projetada para CI/CD com historico e revert.

## Decisoes

| Topico | Decisao |
|--------|---------|
| Abordagem | Rewrite limpo com reuso seletivo |
| Autenticacao | Apenas `--env-file` (remove contas encriptadas) |
| Dashboard | Removido completamente (CLI puro) |
| Migrations | JSON declarativo com timestamp sequencial |
| Referencias SID | `@ref:type:name` resolvido no push via state |
| Rollback | Automatico embutido em cada migration |
| Comandos legados | `deploy` e `vars` removidos |
| Dependencias removidas | `inquirer`, `ora` |

## Comandos

```
tam pull
  Baixa resources do cloud, atualiza state, gera migration com diferencas.
  --dir <path>        Diretorio do ambiente (obrigatorio)
  --env-file <path>   Credenciais Twilio (obrigatorio)
  --resources <types> Filtrar tipos (opcional)

tam push
  Aplica migrations pendentes no cloud.
  --dir <path>        Diretorio do ambiente (obrigatorio)
  --env-file <path>   Credenciais Twilio (obrigatorio)
  --dry-run           Mostra o que seria feito (opcional)

tam migration new <descricao>
  Cria migration manual vazia.
  --dir <path>        Diretorio do ambiente (obrigatorio)

tam migration list
  Lista migrations e status (applied/pending).
  --dir <path>        Diretorio do ambiente (obrigatorio)

tam revert [migration-name]
  Reverte a ultima migration (ou uma especifica).
  --dir <path>        Diretorio do ambiente (obrigatorio)
  --env-file <path>   Credenciais Twilio (obrigatorio)

tam diff
  Compara state local vs cloud (sem gerar migration).
  --dir <path>        Diretorio do ambiente (obrigatorio)
  --env-file <path>   Credenciais Twilio (obrigatorio)
```

## Estrutura do Projeto

```
src/
├── index.js                      # Entry point CLI (commander)
├── config.js                     # Parse .env file
├── commands/
│   ├── pull.js                   # tam pull
│   ├── push.js                   # tam push
│   ├── diff.js                   # tam diff
│   ├── revert.js                 # tam revert
│   └── migration.js              # tam migration new | list
├── twilio/
│   ├── clients.js                # Factory de clientes Twilio
│   ├── fetchers.js               # Fetch de resources por tipo
│   └── writers.js                # Create/update/delete resources via API
├── state/
│   ├── reader.js                 # Le state files do disco
│   └── writer.js                 # Escreve/atualiza state files
├── migration/
│   ├── generator.js              # Gera migration a partir de diff (pull)
│   ├── executor.js               # Aplica operations no cloud (push)
│   ├── resolver.js               # Resolve @ref:type:name -> SID real
│   ├── rollback.js               # Gera operacoes inversas
│   └── tracker.js                # Le/escreve migrations.json
├── diff/
│   └── compare.js                # Deep diff entre state e cloud
├── sid/
│   └── replace.js                # SID replacement
└── utils/
    └── display.js                # Output formatado (chalk)
```

## Estrutura do Diretorio do Ambiente (--dir)

```
<env-dir>/
├── state/
│   ├── taskQueues.json
│   ├── taskChannels.json
│   ├── workflows.json
│   ├── workspace.json
│   ├── studioFlows.json
│   ├── contentTemplates.json
│   └── migrations.json
└── migrations/
    ├── 20260227_143052_pull-changes.json
    └── 20260227_150030_add-support-queue.json
```

## Formato dos Arquivos

### State file (ex: `state/taskQueues.json`)

```json
{
  "fetchedAt": "2026-02-27T14:30:52Z",
  "resources": [
    {
      "sid": "WQxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      "friendlyName": "Support Queue",
      "targetWorkers": "skills HAS 'support'",
      "maxReservedWorkers": 5,
      "taskOrder": "FIFO"
    }
  ]
}
```

### Migration file

```json
{
  "description": "pull-changes",
  "createdAt": "2026-02-27T14:30:52Z",
  "source": "pull",
  "operations": [
    {
      "action": "create",
      "type": "taskQueues",
      "data": {
        "friendlyName": "Support Queue",
        "targetWorkers": "skills HAS 'support'",
        "maxReservedWorkers": 5,
        "taskOrder": "FIFO"
      }
    },
    {
      "action": "update",
      "type": "workflows",
      "match": { "friendlyName": "Main Workflow" },
      "data": {
        "configuration": {
          "task_routing": {
            "filters": [
              {
                "filter_friendly_name": "Support Route",
                "expression": "type == 'support'",
                "targets": [
                  { "queue": "@ref:taskQueues:Support Queue" }
                ]
              }
            ]
          }
        }
      }
    }
  ],
  "rollback": [
    {
      "action": "delete",
      "type": "taskQueues",
      "match": { "friendlyName": "Support Queue" }
    },
    {
      "action": "update",
      "type": "workflows",
      "match": { "friendlyName": "Main Workflow" },
      "data": {
        "configuration": {
          "task_routing": {
            "filters": []
          }
        }
      }
    }
  ]
}
```

### Migrations tracker (`state/migrations.json`)

```json
{
  "applied": [
    {
      "name": "20260227_143052_pull-changes.json",
      "appliedAt": "2026-02-27T17:30:52Z"
    }
  ]
}
```

### .env file

```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_API_KEY_SID=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_API_KEY_SECRET=your_secret_here
```

## Fluxos de Dados

### tam pull

1. Le .env → cria cliente Twilio
2. Fetch resources do cloud (todos ou filtrado por --resources)
3. Le state local — se nao existe, considera vazio
4. Diff: cloud vs state local
5. Se ha diferencas:
   - Gera migration com operations (create/update/delete)
   - Gera rollback automaticamente (operacoes inversas)
   - Salva em migrations/YYYYMMDD_HHmmss_pull-changes.json
   - Marca como applied em state/migrations.json
   - Atualiza state local com dados do cloud
6. Se nao ha diferencas: informa "nenhuma alteracao detectada"

### tam push

1. Le .env → cria cliente Twilio
2. Le state/migrations.json → identifica migrations pendentes
3. Para cada migration pendente (ordem cronologica):
   - Le o arquivo da migration
   - Resolve @ref:type:name → SID real consultando state local
   - Executa operations na API Twilio (create/update/delete)
   - Atualiza state local com SIDs retornados pela API
   - Marca migration como applied em migrations.json
4. Se --dry-run: mostra operations sem executar

### tam diff

1. Le .env → cria cliente Twilio
2. Fetch resources do cloud
3. Le state local
4. Mostra diferencas formatadas (sem gerar migration)

### tam revert

1. Se migration-name nao fornecido, usa a ultima applied
2. Le o rollback da migration
3. Resolve @ref e executa rollback operations na API
4. Remove a migration do applied em migrations.json
5. Atualiza state local

### tam migration new

1. Gera arquivo: migrations/YYYYMMDD_HHmmss_<descricao-slugified>.json
2. Template com operations:[] e rollback:[] vazios

### tam migration list

1. Le todos os arquivos de migrations/
2. Le state/migrations.json
3. Lista cada migration com status: applied ou pending

### Fluxo CI/CD multi-ambiente

```bash
# Developer faz alteracoes em dev via console Twilio
tam pull --dir ./envs/dev --env-file .env.dev

# Commit migrations no git
git add ./envs/dev/migrations/
git commit -m "feat: add support queue"

# CI/CD copia migration para staging e aplica
cp ./envs/dev/migrations/20260227_*.json ./envs/staging/migrations/
tam push --dir ./envs/staging --env-file .env.staging

# Depois de validar, copia para prod e aplica
cp ./envs/staging/migrations/20260227_*.json ./envs/prod/migrations/
tam push --dir ./envs/prod --env-file .env.prod
```

## Regras de Negocio (base para TDD)

### Resolucao de referencias (@ref)

1. `@ref:type:name` resolve para o SID do state do ambiente destino
2. Se recurso criado na mesma migration (operation anterior), usa SID retornado pela API
3. Se @ref nao encontra correspondencia, push falha com erro claro
4. Resolucao e recursiva — percorre todo o objeto em profundidade

### Geracao de migrations no pull

5. Recurso no cloud mas nao no state → operation `create`
6. Recurso no state mas nao no cloud → operation `delete`
7. Recurso em ambos com diferencas → operation `update` (campos mudados)
8. Match por `friendlyName` (ou `uniqueName` para content templates)
9. Campos ignorados no diff: sid, accountSid, dateCreated, dateUpdated, url, links
10. Sem diferencas → nenhuma migration gerada

### Geracao automatica de rollback

11. `create` → rollback `delete` com match por friendlyName
12. `delete` → rollback `create` com dados completos do state anterior
13. `update` → rollback `update` com valores antigos do state

### Execucao de migrations no push

14. Migrations executam em ordem cronologica (timestamp do nome)
15. Apenas migrations pendentes executam
16. Operations executam em ordem sequencial dentro da migration
17. State atualizado apos cada operation bem-sucedida
18. Se operation falha, push para e reporta erro
19. --dry-run resolve @ref e mostra operations sem executar

### Revert

20. Executa operations do rollback da migration
21. Resolve @ref no rollback da mesma forma que no push
22. Remove migration do applied em migrations.json
23. Atualiza state para refletir rollback
24. So pode reverter migrations que estao como applied

### Validacao

25. Migration deve ter operations como array
26. Cada operation deve ter action, type, e data ou match
27. create requer data com friendlyName
28. update e delete requerem match com friendlyName
29. update requer data com pelo menos um campo

### Config e CLI

30. --dir obrigatorio em todos os comandos
31. --env-file obrigatorio nos comandos que acessam API (pull, push, diff, revert)
32. .env deve conter TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET
33. Variavel obrigatoria faltando → erro claro indicando qual

## Codigo Reutilizado

| Arquivo atual | Destino | Adaptacao |
|---------------|---------|-----------|
| `src/dataFetch/twilioClients.js` | `src/twilio/clients.js` | Sem alteracao significativa |
| `src/dataFetch/fetchAll.js` | `src/twilio/fetchers.js` | Remove dependencia do cache |
| `src/utils/replaceSids.js` | `src/sid/replace.js` | Sem alteracao |
| `src/config.js` | `src/config.js` | Simplifica (remove account name/environment) |
| `src/compare/advanced.js` | `src/diff/compare.js` | Adapta para comparar state vs cloud |

## Codigo Removido

| Diretorio | Motivo |
|-----------|--------|
| `src/cli/` | Dashboard interativo |
| `src/accounts/` | Contas encriptadas |
| `src/dataFetch/cache.js` | Cache |
| `src/bulkDeploy/` | Substituido por migrations |
| `src/variables/` | Substituido por state |
| `src/compare/simple.js` | Desnecessario |
| `src/search/` | Removido |
| `src/migrate/` | Substituido pela nova migration |

## Fora de Escopo (YAGNI)

- Modo interativo / dashboard
- Search de recursos
- Comparacao simples (count-based)
- Sistema de variaveis %REPLACE_%
- Bulk deploy via JSON
- Suporte a multiplos workspaces TaskRouter
