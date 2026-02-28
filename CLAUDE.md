# CLAUDE.md

Guide for AI assistants working on the twilio-account-migrate codebase.

## Project Overview

Node.js CLI tool (`tam`) for managing Twilio resources across environments via a migration-based workflow. Designed for CI/CD pipelines — pull cloud state, generate declarative migrations, push changes to any account with automatic SID resolution.

### Features

1. **Pull** — Fetch resources from Twilio cloud, diff with local state, generate migration file with auto `@ref` replacement
2. **Push** — Apply pending migrations to a target account with `@ref` SID resolution (1s delay per operation for rate limiting, resumable on failure)
3. **Diff** — Compare local state vs cloud without generating migrations
4. **Diff-Env** — Compare two local environments and generate a migration
5. **Revert** — Apply rollback operations from a previously applied migration (supports partially applied)
6. **Migration Management** — Create manual migrations, list migration status (applied/pending/partiallyApplied)

### Supported Resources

- Task Queues, Task Channels, Workflows, Workspace (TaskRouter)
- Studio Flows (with full definition + widget-level partial updates)
- Content Templates
- Serverless Services, Environments, Functions (read-only, for SID/URL mapping)

## Quick Reference

```bash
npm install          # Install dependencies
npm run build        # Copy src/ to dist/
npm start            # Run CLI (requires build first)
npm run dev          # Run with nodemon auto-reload
npm test             # Run Jest tests
npm run lint         # Run ESLint
npm run format       # Run Prettier
```

### CLI Commands

```bash
tam pull --dir ./env/dev --env-file .env.dev          # Pull cloud state, generate migration
tam push --dir ./env/dev --env-file .env.prod          # Apply pending migrations
tam push --dir ./env/dev --env-file .env.prod --dry-run # Preview without applying
tam diff --dir ./env/dev --env-file .env.dev           # Compare local vs cloud
tam revert --dir ./env/dev --env-file .env.dev         # Revert last migration
tam revert migration-name --dir ./env/dev --env-file .env.dev  # Revert specific migration
tam migration new "add support queue" --dir ./env/dev  # Create empty migration
tam migration list --dir ./env/dev                     # List migrations with status
tam diff-env --source ./env/dev --target ./env/prod    # Compare two environments, generate migration
```

## Architecture

### Directory Structure

```
src/
├── index.js                    # CLI entry point (Commander.js)
├── config.js                   # .env file parser (loadEnvFile)
├── commands/
│   ├── pull.js                 # Pull command orchestrator
│   ├── push.js                 # Push command orchestrator
│   ├── diff.js                 # Diff command orchestrator
│   ├── diff-env.js             # Cross-environment diff command
│   ├── revert.js               # Revert command orchestrator
│   └── migration.js            # Migration new + list commands
├── diff/
│   └── compare.js              # Resource diffing (diffResources)
├── migration/
│   ├── generator.js            # Generate migration from diffs
│   ├── executor.js             # Execute migration operations
│   ├── resolver.js             # Resolve @ref:type:name patterns
│   ├── rollback.js             # Generate inverse operations
│   ├── tracker.js              # Track applied/pending migrations
│   └── validator.js            # Validate migration structure
├── sid/
│   ├── auto-ref.js             # Auto SID/URL → @ref replacement (buildRefMap, deepReplaceWithRefs)
│   └── replace.js              # Legacy SID replacement (buildSidPairs, deepReplaceSids)
├── state/
│   ├── reader.js               # Read state files from disk
│   └── writer.js               # Write state files to disk
├── twilio/
│   ├── clients.js              # Twilio SDK client factory
│   ├── fetchers.js             # Fetch resources from Twilio API
│   └── writers.js              # Create/update/delete resources via API
└── utils/
    └── display.js              # Terminal output helpers (chalk)

__tests__/                      # Jest unit tests (mirrors src/ structure)
```

### Environment Directory Layout

```
env/dev/
├── state/
│   ├── taskQueues.json         # Current state per resource type
│   ├── workflows.json
│   ├── taskChannels.json
│   ├── studioFlows.json
│   ├── contentTemplates.json
│   ├── serverless.json          # Serverless services/envs/functions (read-only)
│   └── migrations.json         # Tracks which migrations are applied/partiallyApplied
└── migrations/
    ├── 20260227_143000_pull-changes.json
    └── 20260227_150000_add-support-queue.json
```

### Authentication

Via `.env` file with three required variables:

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_API_KEY_SID=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_API_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Data Flow

1. **Pull** — Fetches cloud resources + serverless → builds @ref map → replaces SIDs/URLs with @ref → diffs with local state → generates migration (auto-marked as applied) → updates local state
2. **Push** — Reads pending/partiallyApplied migrations → validates → resolves `@ref` references → executes operations (1s delay each, resumable) → marks as applied
3. **Diff** — Fetches cloud resources → diffs with local state → displays differences (no side effects)
4. **Diff-Env** — Reads two local state directories → diffs → generates migration in target directory
5. **Revert** — Reads migration rollback → executes inverse operations → unmarks migration as applied (supports partial)

### Migration Format

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

### Widget-Level Partial Updates

Studio Flow updates can use `mode: "partial"` with `widgetOps` for granular widget changes:

```json
{
  "action": "update",
  "type": "studioFlows",
  "match": { "friendlyName": "Main IVR" },
  "mode": "partial",
  "widgetOps": [
    { "action": "create_widget", "widget": "new_step", "data": { "name": "new_step", "type": "send-message" } },
    { "action": "update_widget", "widget": "greeting", "data": { "properties": { "body": "Hello!" } } },
    { "action": "delete_widget", "widget": "old_step" },
    { "action": "rename_widget", "widget": "step1", "newName": "welcome_step" }
  ]
}
```

At push time, the executor fetches the current flow definition from state, applies all widget ops, and uploads the merged result.

### Partially Applied Migrations

If a push fails mid-execution, the migration is saved as `partiallyApplied` in `migrations.json` with progress tracking:

```json
{
  "applied": ["migration-1.json"],
  "partiallyApplied": {
    "migration-2.json": { "appliedAt": "...", "completedOps": 35, "totalOps": 70 }
  }
}
```

Re-running `push` resumes from operation 36. Reverting a partially applied migration only rolls back the operations that were actually applied (in reverse order).

### @ref Resolution

Migrations use `@ref:type:name` patterns instead of hardcoded SIDs, enabling portability across accounts:

```json
{
  "configuration": { "task_routing": { "default_filter": { "queue": "@ref:taskQueues:Support" } } }
}
```

At push time, `@ref:taskQueues:Support` is resolved to the actual SID from local state or from resources created earlier in the same migration (`runtimeSids`).

**Serverless @ref patterns** (auto-generated by pull, resolved by push):

| Pattern | Resolves To | Example |
|---------|-------------|---------|
| `@ref:serverless:Name` | Service SID (ZS) | `@ref:serverless:my-service` |
| `@ref:serverlessEnv:Svc:Env` | Environment SID (ZE) | `@ref:serverlessEnv:my-service:production` |
| `@ref:serverlessFn:Svc:Fn` | Function SID (ZH) | `@ref:serverlessFn:my-service:my-fn` |
| `@ref:serverlessUrl:Svc:Env:/path` | Full URL | `@ref:serverlessUrl:my-service:production:/my-fn` |

## Code Conventions

### Language and Module System

- **Plain JavaScript** (no TypeScript)
- **ES Modules** exclusively (`"type": "module"` in package.json)
- All imports use `.js` file extensions

### Style

- **Prettier**: single quotes, semicolons, trailing commas, 100-char line width
- **ESLint**: flat config (`eslint.config.js`), alphabetically sorted import groups with newlines between them, bans unused imports
- No classes — functional style with small, reusable async functions
- Heavy use of `async/await`

### Naming

- `camelCase` for functions and variables
- Collections use plural names (`flows`, `queues`, `templates`)

### UI Text

- User-facing strings are in **Portuguese** (pt-BR)
- Uses `chalk` for colored terminal output

## Testing

- **Framework**: Jest with Node.js test environment
- **Location**: `__tests__/` directory (mirrors `src/` structure)
- **Run**: `npm test` (uses `--experimental-vm-modules` for ESM support, `--runInBand` for sequential execution)
- **Mocking**: Uses `jest.unstable_mockModule()` for ESM-compatible mocking
- Tests mock Twilio API calls and filesystem operations
- TDD approach: tests written before implementation

## Build

The build step (`npm run build` / `scripts/build.js`) copies `src/` to `dist/` with no transpilation. The CLI entry point is `dist/index.js`.

## Key Dependencies

| Package     | Purpose                                                         |
| ----------- | --------------------------------------------------------------- |
| `twilio`    | Twilio SDK for all API interactions                             |
| `commander` | CLI argument parsing                                            |
| `chalk`     | Colored terminal output                                         |
| `fs-extra`  | Enhanced filesystem operations (ensureDir, writeJson, readJson) |

## Common Tasks

### Adding a new resource type

1. Add fetch function in `src/twilio/fetchers.js`
2. Add resource type to `RESOURCE_TYPES` array in `src/twilio/fetchers.js`
3. Add CRUD functions in `src/twilio/writers.js` and register in `WRITERS` map
4. Add valid type to `VALID_TYPES` in `src/migration/validator.js`
5. Add tests in `__tests__/`

### Adding a new CLI command

1. Create command module in `src/commands/`
2. Register command in `src/index.js` with `--dir` and `--env-file` required options
3. Follow the pattern: load env → execute logic → display results
