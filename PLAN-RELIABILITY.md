# Plano de confiabilidade do push

Conjunto de melhorias para reduzir os casos "apliquei a migration e faltou coisa / veio errado". Cada item é independente — pode ser implementado isolado e mergeado por PR separada. Sugiro a ordem abaixo: começa pelos bugs de raiz da diff, depois visibilidade, depois segurança, depois ergonomia.

## Contexto

Fluxo atual (`tam pull` → `tam diff-env` → `tam push`) hoje:

- `src/diff/compare.js` faz diff campo-a-campo via `changedFields()` retornando só os campos alterados; já ignora `sid`, `dateCreated`, `dateUpdated`, `url`, `links`, `status`, `commitMessage`.
- `src/migration/generator.js` ordena operações por tipo+ação (`OPERATION_ORDER`) para garantir create-antes-de-referência.
- `src/migration/resolver.js:67` lança erro se `@ref` não resolve (não é fallback silencioso — bom).
- `src/commands/push.js` agora pré-valida Studio Flows e imprime detalhes do Twilio (entregue na branch atual).
- `--dry-run` só lista `[dry-run] action type: name` — sem diff de payload.
- Não há refetch do target antes do push, nem backup automático, nem verificação pós-operação, nem modo interativo.

Pontos onde "some coisa" tipicamente nasce: diff que perde campo, ref que resolve para SID errado, operação fora de ordem, drift entre state local e cloud no momento do push.

---

## Fase 1 — Confiabilidade da diff (raiz)

### 1.1 — `changedFields` não detecta campos removidos

**Problema.** Em `src/diff/compare.js:46-56`, `changedFields(cloud, local)` itera as chaves de `cleanCloud` apenas. Se o usuário remove uma chave do state local (ex: tira `maxReservedWorkers` para voltar ao default), o diff não gera operação alguma, e o cloud fica com o valor antigo. Isso é uma das causas de "faltou coisa".

**Solução.** Iterar a união de chaves de ambos os lados. Para chaves presentes só em local → considerar mudança (campo voltou a ausente). Para chaves só em cloud que sejam não-metadata → também considerar mudança. Decidir como representar "campo removido" no payload — provavelmente enviar `null` (Twilio interpreta como reset onde aplicável), documentar caso a caso por resource type.

**Arquivos.** `src/diff/compare.js` (`changedFields`).

**Testes.** Adicionar caso em `__tests__/diff/compare.test.js`: cloud `{a:1, b:2}`, local `{a:1}` → diff retorna `{b: null}` (ou marca remoção); cloud `{a:1}`, local `{a:1, c:3}` → retorna `{c:3}`.

**Risco.** Baixo, mas pode gerar updates que antes eram silenciosamente ignorados — bom revisar diff-env de ambientes reais antes de mergear.

---

### 1.2 — Normalização de tipos (`definition`/`configuration`)

**Problema.** `fetchers.js` já parseia `configuration` e `definition` para objeto, mas migrations criadas à mão (`tam migration new`) podem ter como string. `deepEqual` em `compare.js:30` trata `"{a:1}"` e `{a:1}` como diferentes → false positives no diff.

**Solução.** Em `compare.js`, antes de comparar campos cujo nome conhecidamente é JSON (`definition`, `configuration`, `variables`, `types`), normalizar com `tryParseJson` (já existe em `src/twilio/fetchers.js:179`, extrair para `src/utils/json.js`).

**Arquivos.** `src/utils/json.js` (novo, mover `tryParseJson`), `src/diff/compare.js` (normalização), `src/twilio/fetchers.js` (importar do novo util).

**Testes.** Atualizar `__tests__/diff/compare.test.js` para incluir caso string vs objeto.

---

### 1.3 — METADATA_FIELDS expansível por tipo

**Problema.** `compare.js:1-13` define `METADATA_FIELDS` global. Se Twilio adicionar novo campo read-only (ex: `revision`, `webhookUrlOverride` gerado pelo servidor), updates passam a enviá-lo de volta e podem fazer write em coisas que o servidor controla.

**Solução.** Permitir `METADATA_FIELDS` por resource type, fundindo com o set global. Exemplo: `studioFlows` adiciona `revision`, `webhookUrl`. Reler a documentação Twilio uma vez e listar.

**Arquivos.** `src/diff/compare.js`.

**Risco.** Baixo. Conservador: começar adicionando os campos mais óbvios e expandir conforme aparecer drift real.

---

## Fase 2 — Visibilidade antes de aplicar

### 2.1 — Dry-run com diff campo-a-campo (`--dry-run --verbose`)

**Problema.** `push --dry-run` hoje (`src/commands/push.js:149`) imprime só `[dry-run] update workflows: Main`. Não dá pra saber o que vai mudar.

**Solução.** Quando `--dry-run` é passado:
1. Refetch do recurso alvo no cloud (usar `fetchResource` de `src/twilio/fetchers.js`).
2. Resolver `@ref` no payload da operação (já existe `resolveRefs` em `src/migration/resolver.js`).
3. Calcular diff campo-a-campo entre cloud atual e payload resolvido usando `changedFields` (de `compare.js`, exportar se não estiver).
4. Imprimir em formato `git diff`:
   ```
   [dry-run] update workflows: Main
     ~ configuration.task_routing.default_filter.queue
       - WQ_OLD_SID
       + WQ_NEW_SID
     + taskReservationTimeout: 120
   ```
   Usar `chalk.red` para remoção e `chalk.green` para adição.

Adicionar novo helper em `src/utils/display.js`: `printFieldDiff(label, oldVal, newVal)`.

**Arquivos.** `src/commands/push.js`, `src/utils/display.js` (novo helper), eventualmente `src/utils/diff-print.js` para isolar a lógica.

**Testes.** Unit do helper de diff print; integration test em `push.test.js` mockando fetcher.

**Cuidado.** Cada operação dispara 1 GET extra no Twilio — adicionar throttle ou só ativar com `--verbose` para não ser default.

---

### 2.2 — Pré-vôo: refetch do target e diff vs state local

**Problema.** Push assume que `env/dev/state/*.json` reflete o cloud. Se alguém editou no console entre o `pull` e o `push`, a migration pode sobrescrever mudanças não esperadas ou referenciar SIDs que mudaram.

**Solução.** No início de `pushCommand` (após Studio Flow pre-validate, antes do loop), fetchar o target inteiro (usar `fetchResource` para cada tipo afetado pela migration) e diffar contra o state local. Se houver drift:

- **Sem flag:** imprimir as diferenças e abortar com `exitCode=1`, sugerindo `tam pull` antes.
- **Com `--accept-drift`:** prosseguir, mas logar warn por recurso divergente.

Pode usar `diffResources` direto e formatar a saída.

**Arquivos.** `src/commands/push.js`, `src/index.js` (nova flag `--accept-drift`).

**Testes.** `push.test.js` mockando `fetchResource` para retornar payload com diferenças vs state local.

**Cuidado.** Vai adicionar latência (vários GETs no início do push). Aceitável dado que é a parte mais arriscada.

---

### 2.3 — Lint do plano (`tam migration lint`)

**Problema.** Hoje `validateMigration` (em `src/migration/validator.js`) só valida estrutura (`type` em VALID_TYPES, `data.friendlyName` em creates, etc). Não checa:
- Todos os `@ref:type:name` resolvem contra o state local (ou são criados antes na própria migration).
- Ordem de dependências: workflow que referencia queue → queue precisa vir antes.
- Operações duplicadas (dois updates para o mesmo recurso).
- Operações órfãs: update/delete cujo `match` não bate com nada no state.

**Solução.** Novo comando `tam migration lint <migration-name> --dir env/dev`:

1. Carregar migration + state local.
2. Walk recursivo no `data` para coletar todos `@ref:` (reaproveitar `EMBEDDED_REF_PATTERN` de `resolver.js:1`).
3. Para cada ref: simular `resolveRef` contra state + uma versão pré-computada de runtimeSids (operações `create` anteriores na mesma migration).
4. Para cada `update`/`delete`: verificar `match` existe no state.
5. Imprimir relatório: refs órfãos, matches órfãos, conflitos. `exitCode=1` se houver erro crítico.

Bonus: integrar como hook automático em `push` antes do executor.

**Arquivos.** `src/commands/migration.js` (sub-comando `lint`), `src/migration/linter.js` (novo, lógica), `src/index.js` (registrar comando), `__tests__/migration/linter.test.js`.

**Reuso.** `EMBEDDED_REF_PATTERN`, `lookupSid`, `resolveRef` de `resolver.js`; `VALID_TYPES` de `validator.js`.

---

## Fase 3 — Segurança ao aplicar

### 3.1 — Snapshot automático antes do push

**Problema.** Se push deixar o cloud em estado inesperado, não há "antes" salvo. Revert resolve para migrations rastreadas, mas não para mudanças manuais que aconteceram entre o pull e o push.

**Solução.** Antes de iniciar o loop de execução em `push.js`:

1. Criar `env/dev/state/.backup/<timestamp>/` com cópia dos `state/*.json` atuais.
2. Manter as N últimas (ex: 5), descartar mais antigas.
3. Logar caminho do backup. Em caso de falha de push, mensagem incluir comando para restaurar: `cp -r .backup/<ts>/*.json ../`.

**Arquivos.** `src/state/backup.js` (novo: `createBackup(dir)`, `pruneBackups(dir, keep=5)`), `src/commands/push.js` (chamar antes do loop).

**Cuidado.** É backup do state, não do cloud — se quiser snapshot de cloud teria que fetchar tudo (caro). Manter limitado ao state local mantém o custo baixo e dá rede de segurança suficiente para a maioria dos casos.

---

### 3.2 — Verificação pós-operação

**Problema.** `executeOperation` retorna o que o SDK devolveu, mas não confirma que o cloud realmente ficou com os campos do payload. Pode haver discrepância (ex: campo silenciosamente ignorado, valor normalizado pelo servidor).

**Solução.** Após cada `create`/`update` em `executor.js`:

1. Refetch do recurso pelo SID retornado (precisa de um `fetcher` por tipo — extrair de `fetchers.js` um helper `fetchOne(type, sid)`).
2. Comparar com o payload esperado (usar `changedFields`).
3. Se houver discrepância em campos que o usuário pediu para mudar → warn (não abortar; pode ser normalização aceitável).
4. Se houver discrepância em campo crítico (ex: `targetWorkers` de queue) → opcionalmente abortar com `--strict-verify`.

**Arquivos.** `src/twilio/fetchers.js` (adicionar `fetchOne`), `src/migration/executor.js`, `src/commands/push.js` (flag opcional).

**Testes.** `executor.test.js` mockando fetcher para retornar payload divergente.

**Cuidado.** +1 GET por operação. Tornar default mas com flag `--no-verify` para desabilitar em casos de migration grande.

---

## Fase 4 — Ergonomia

### 4.1 — Revisão interativa no `diff-env`

**Problema.** `tam diff-env` (em `src/commands/diff-env.js:81-84`) cospe a migration toda; usuário só vê depois ao abrir o JSON. Não há momento para vetar operações isoladas.

**Solução.** Adicionar flag `--review` ao `diff-env`:

1. Após gerar operações com `generateMigration`, iterar uma a uma.
2. Para cada: imprimir resumo (`action type: name` + diff de campos se update) e prompt `[a]ceitar / [s]kip / [q]uit`.
3. Coletar só as aceitas e gerar a migration final.

Para input interativo, usar `readline` nativo do Node (sem nova dep) ou `enquirer` (já leve, ESM-friendly — verificar package.json antes de adicionar).

**Arquivos.** `src/commands/diff-env.js`, possivelmente `src/utils/prompt.js` para isolar IO.

**Testes.** Mockar `readline` em test; verificar que operações `skip` não aparecem no JSON salvo.

**Cuidado.** Modo opt-in (`--review`) para não quebrar uso em CI.

---

## Ordem sugerida de implementação

| # | Item | Impacto | Esforço | PR |
|---|------|---------|---------|----|
| 1 | 1.1 changedFields detecta remoções | Alto (bug de fidelidade) | S | 1 |
| 2 | 1.2 Normalização JSON | Médio | S | junto com 1.1 |
| 3 | 1.3 METADATA_FIELDS por tipo | Baixo-Médio | S | junto com 1.1 |
| 4 | 2.3 Lint do plano | Alto (preventivo) | M | 2 |
| 5 | 2.1 Dry-run diff por campo | Alto (visibilidade) | M | 3 |
| 6 | 3.1 Snapshot automático | Médio (rede de segurança) | S | junto com 5 ou separado |
| 7 | 2.2 Pré-vôo refetch | Alto (drift) | M | 4 |
| 8 | 3.2 Verificação pós-operação | Médio | M | 5 |
| 9 | 4.1 Revisão interativa | Médio (ergonomia) | M | 6 |

S = ~1 dia, M = ~2-3 dias. Itens da Fase 1 valem ser feitos juntos porque mexem nos mesmos arquivos.

## Verificação geral

Para cada PR, manter o ritual:
- `npm run lint && npm test && npm run build` verde.
- Teste manual contra um workspace Twilio de sandbox: criar diferença conhecida, gerar migration, aplicar, validar que o cloud bateu com o esperado.
- Para itens com flag (`--accept-drift`, `--review`, `--strict-verify`, `--no-verify`): testar com e sem a flag.

## O que não está aqui (de propósito)

- Reescrita do formato de migration: invasivo demais, ganha pouco vs o que está acima.
- Lock distribuído (impedir dois pushes simultâneos): casos reais provavelmente raros; resolver se aparecer.
- UI web: fora do escopo CLI.
