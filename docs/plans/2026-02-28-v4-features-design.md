# Design: v4.0 Features — Granular Widgets, Env Diff, Execution Resilience

**Date**: 2026-02-28
**Status**: Approved
**Approach**: Incremental — Group A (execution infra) first, then Group B (new features)

---

## Overview

Seven features organized in three groups:

- **Group A (Execution Infrastructure)**: Delay (F3), Partially Applied (F4), Partial Rollback (F5)
- **Group B (New Capabilities)**: Widget Granular Updates (F1), Diff Between Environments (F2)
- **Group C (SID/URL Portability)**: Serverless Fetch (F6), Auto-Replace SIDs by @ref (F7)

Implementation order: F3 → F4 → F5 → F1 + F2 (parallel) → F6 → F7

---

## Feature 3: API Operation Delay

**Files**: `src/migration/executor.js`

Add 1-second delay between API write operations (create/update/delete) to respect Twilio rate limits.

- `sleep(1000)` after each real API call (not dry-run)
- No delay after the last operation
- No configurable flag — fixed 1s per Twilio limit

```js
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
```

---

## Feature 4: Partially Applied Migrations

**Files**: `src/migration/tracker.js`, `src/migration/executor.js`, `src/commands/push.js`

### New migrations.json format

```json
{
  "applied": [
    { "name": "20260227_143000_pull-changes.json", "appliedAt": "2026-02-27T..." }
  ],
  "partiallyApplied": {
    "name": "20260228_100000_big-migration.json",
    "startedAt": "2026-02-28T10:00:00.000Z",
    "lastOperationIndex": 34,
    "totalOperations": 70,
    "error": "Rate limit exceeded"
  }
}
```

### Push flow with partially_applied

1. Check tracker for `partiallyApplied`
2. If exists and matches current migration: resume from `lastOperationIndex` (re-execute the failed op)
3. If exists but different migration: error — must resolve partial first
4. During execution: update `lastOperationIndex` after each successful operation
5. All complete: move from `partiallyApplied` to `applied`
6. On failure: `partiallyApplied` already updated with last successful index

### New tracker.js functions

- `markPartiallyApplied(dir, name, index, total, error)` — create/update partial state
- `getPartiallyApplied(dir)` — return partial state or null
- `promotePartialToApplied(dir)` — move from partial to applied
- `clearPartiallyApplied(dir)` — remove without moving to applied (used in revert)

### executor.js changes

- Accept optional `startIndex` parameter (default 0)
- Skip operations with index < `startIndex`
- Call progress callback after each successful operation

---

## Feature 5: Partial Rollback

**Files**: `src/commands/revert.js`, `src/migration/tracker.js`

### Revert logic for partially_applied

When `revert` targets a `partiallyApplied` migration:

1. Read `partiallyApplied`: `{ lastOperationIndex: 34, totalOperations: 70 }`
2. Operations 0-33 were applied successfully (34 total). Operation 34 failed.
3. Execute rollback for operations 0-33 in reverse order (33 → 0)
4. On success: `clearPartiallyApplied(dir)`
5. On rollback failure: update tracker with rollback progress

### Tracker format for rollback in progress

```json
{
  "partiallyApplied": {
    "name": "20260228_100000_big-migration.json",
    "startedAt": "2026-02-28T10:00:00.000Z",
    "lastOperationIndex": 34,
    "totalOperations": 70,
    "error": "Rate limit exceeded",
    "rollbackInProgress": true,
    "rollbackLastIndex": 20,
    "rollbackTotal": 34
  }
}
```

### Decision flow in revert

```
revert called →
  migration has partiallyApplied? →
    rollbackInProgress? →
      YES: resume rollback from rollbackLastIndex
      NO: start rollback of operations 0..lastOperationIndex-1
  migration in applied? →
    normal rollback (all operations)
```

---

## Feature 1: Studio Flow Widget Granular Updates

**Files**: `src/diff/compare.js`, `src/migration/generator.js`, `src/migration/executor.js`, `src/twilio/writers.js`, `src/migration/rollback.js`, `src/migration/validator.js`

### Migration format with widgetOps

```json
{
  "action": "update",
  "type": "studioFlows",
  "match": { "friendlyName": "Main Flow" },
  "mode": "partial",
  "widgetOps": [
    {
      "action": "create_widget",
      "widget": "new_gather",
      "data": { "name": "new_gather", "type": "send-and-wait-for-reply", "transitions": [], "properties": {} }
    },
    {
      "action": "update_widget",
      "widget": "send_sms",
      "data": { "properties": { "body": "novo texto" } }
    },
    {
      "action": "rename_widget",
      "widget": "old_name",
      "newName": "new_name"
    },
    {
      "action": "delete_widget",
      "widget": "unused_step"
    }
  ]
}
```

When `mode` is omitted or `"full"`, current behavior (sends full definition).

### Granular diff in compare.js

When two flows have the same `friendlyName` but different definitions:

1. Compare `definition.states` widget by widget (key = widget name)
2. New widget in cloud → `create_widget`
3. Missing widget in cloud → `delete_widget`
4. Same name but different data → `update_widget` (only changed fields)
5. If >70% of widgets changed → generate `"full"` update instead (heuristic to avoid excessively long migrations)
6. Changes outside `states` (e.g., `initial_state`, `flags`, `description`) → generate `"full"` update

### Push execution for partial mode

When executor encounters operation with `mode: "partial"`:

1. Read current flow from local state
2. Clone the `definition`
3. Apply each `widgetOp` sequentially on cloned definition:
   - `create_widget`: add widget to `states` map
   - `update_widget`: deep merge existing widget with new data
   - `rename_widget`: remove old key, add with new key (update transition references)
   - `delete_widget`: remove widget from `states` map
4. Send complete resulting definition via API (Twilio API doesn't support partial updates)

### Automatic rollback

For each `widgetOp`, rollback generates the inverse:
- `create_widget` → `delete_widget`
- `delete_widget` → `create_widget` (with original data)
- `update_widget` → `update_widget` (with original data)
- `rename_widget` → `rename_widget` (swapping widget/newName)

### Validation

`validator.js` accepts `widgetOps` with `mode: "partial"`. Validates each widgetOp has required `action` and `widget`.

---

## Feature 2: Diff Between Environments

**New files**: `src/commands/diff-env.js`
**Files**: `src/index.js`, `src/migration/generator.js`

### CLI command

```bash
tam diff-env --source ./env/dev --target ./env/prod
tam diff-env --source ./env/dev --target ./env/prod --resources taskQueues,workflows
```

- `--source`: updated environment directory (reference)
- `--target`: environment to be updated (where migration is generated)
- `--resources`: optional, filter resource types. If omitted, compare all.

### Flow

1. Read state files from `--source` (`readAllStates(source)`)
2. Read state files from `--target` (`readAllStates(target)`)
3. For each selected resource type: `diffResources(sourceResources, targetResources)`
   - Source = "desired state" (like cloud in pull)
   - Target = "current state" (like local in pull)
4. Generate migration with `generateMigration()` reusing existing logic
5. Save migration to `{target}/migrations/` as `{timestamp}_env-diff.json`
6. Migration is `pending` — user applies with `push` when ready

### Key difference from pull

- Pull: compares **cloud** vs **local** (API fetch required)
- Diff-env: compares **local source** vs **local target** (disk reads only, no API)

### Studio Flow integration

Widget granular diff (Feature 1) applies automatically when two flows have the same `friendlyName` but different definitions.

### Rollback

Generated automatically by existing `generateRollbackAll` logic, using target data as original state.

---

## Feature 6: Fetch Serverless Resources (read-only for replace)

**Files**: `src/twilio/fetchers.js`, `src/state/reader.js`

### Purpose

Fetch Twilio Serverless Services, Environments, and Functions to build a SID/URL → @ref mapping table. These resources are NOT managed by migrations (no create/update/delete) — they are read-only reference data.

### New fetchers

- `fetchServerlessServices(api)` — lists all services
- For each service: fetch environments (with `domain_name`) and functions (with `path`)

### State file: `state/serverless.json`

```json
{
  "fetchedAt": "2026-02-28T...",
  "resources": [
    {
      "sid": "ZS123...",
      "uniqueName": "meu-service",
      "friendlyName": "Meu Service",
      "environments": [
        {
          "sid": "ZE456...",
          "uniqueName": "production",
          "domainName": "meu-service-1234.twil.io"
        }
      ],
      "functions": [
        {
          "sid": "ZH789...",
          "friendlyName": "minha-funcao",
          "path": "/minha-funcao"
        }
      ]
    }
  ]
}
```

Serverless is fetched during pull but NOT added to `RESOURCE_TYPES` (not managed by migrations).

---

## Feature 7: Auto-Replace SIDs/URLs by @ref on Pull

**New files**: `src/sid/auto-ref.js`
**Files**: `src/commands/pull.js`, `src/migration/resolver.js`

### @ref Format Table

| Type | @ref Pattern | Resolves to |
|------|-------------|-------------|
| Task Queue | `@ref:taskQueues:Name` | WQ SID |
| Workflow | `@ref:workflows:Name` | WW SID |
| Task Channel | `@ref:taskChannels:Name` | TC SID |
| Studio Flow | `@ref:studioFlows:Name` | FW SID |
| Content Template | `@ref:contentTemplates:Name` | HX SID |
| Serverless Service | `@ref:serverless:ServiceName` | ZS SID |
| Serverless Env | `@ref:serverlessEnv:ServiceName:EnvName` | ZE SID |
| Serverless Fn | `@ref:serverlessFn:ServiceName:FnName` | ZH SID |
| Serverless URL | `@ref:serverlessUrl:ServiceName:EnvName:/path` | `https://domain.twil.io/path` |

### Pull flow (updated)

1. Fetch cloud resources (existing)
2. Fetch serverless resources (new)
3. Build SID → @ref mapping from ALL fetched resources
4. Build URL → @ref mapping from serverless environments + function paths
5. Deep replace all SIDs and URLs in cloud data with @ref patterns
6. Generate migration from replaced data (migration has @ref, not hardcoded SIDs)
7. Save state files **without** replace (original SIDs) for push-time resolution

### Resolver expansion

`src/migration/resolver.js` needs to resolve the new @ref patterns:
- `@ref:serverless:Name` → lookup in `state.serverless.resources` by uniqueName
- `@ref:serverlessEnv:ServiceName:EnvName` → lookup environment within service
- `@ref:serverlessFn:ServiceName:FnName` → lookup function within service
- `@ref:serverlessUrl:ServiceName:EnvName:/path` → build URL from environment's domainName + path

---

## Implementation Order

1. **F3**: Delay (executor.js only, minimal change)
2. **F4**: Partially Applied (tracker + executor + push command)
3. **F5**: Partial Rollback (revert command + tracker extensions)
4. **F1**: Widget Granular (compare + generator + executor + writers + rollback + validator)
5. **F2**: Diff-env (new command + index.js registration)
6. **F6**: Serverless Fetch (fetchers + state)
7. **F7**: Auto-Replace SIDs by @ref (auto-ref + pull + resolver)

F1 and F2 can be developed in parallel after F3-F5 are complete.
F6 must be done before F7.
