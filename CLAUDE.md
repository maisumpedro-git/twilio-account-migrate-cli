# CLAUDE.md

Guide for AI assistants working on the twilio-cli-dashboard codebase.

## Project Overview

Node.js CLI dashboard for managing Twilio accounts across environments (dev, stage, prod). Supports encrypted account storage, resource caching with metadata, environment comparison (simple and advanced), cross-environment migration with SID replacement, and resource search (by name or content).

### Features

1. **Account Management** — Register Twilio accounts (API Key + Secret) with encrypted local storage
2. **Resource Download** — Fetch resources with local cache and timestamp metadata; option to refresh
3. **Environment Comparison** — Simple (count + names) and advanced (content diff) comparison
4. **Migration** — Selective migration between accounts with automatic SID replacement based on resource names
5. **Search** — Simple (resource names) and advanced (resource content) search across cached data

### Supported Resources

- Task Queues, Task Channels, Workflows, Workspace (TaskRouter)
- Studio Flows (with full definition)
- Content Templates

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

## Architecture

### Directory Structure

```
src/
├── index.js                    # Entry point
├── accounts/
│   ├── crypto.js               # AES-256-GCM encryption (app-signature key derivation)
│   └── store.js                # Encrypted account CRUD (~/.twilio-cli-dashboard/accounts.enc)
├── cli/
│   ├── main.js                 # Main dashboard menu loop
│   ├── accountMenu.js          # Account add/edit/remove
│   ├── resourceMenu.js         # Resource download with cache status
│   ├── compareMenu.js          # Environment comparison (simple + advanced)
│   ├── migrateMenu.js          # Cross-environment migration
│   └── searchMenu.js           # Resource search (simple + advanced)
├── compare/
│   ├── simple.js               # Count + name comparison
│   └── advanced.js             # Deep content diff (strips SIDs/dates)
├── dataFetch/
│   ├── twilioClients.js        # Twilio SDK client factory (API Key auth)
│   ├── fetchAll.js             # Resource fetchers (per-type and all-at-once)
│   └── cache.js                # Local JSON cache with metadata (~/.twilio-cli-dashboard/cache/)
├── migrate/
│   ├── buildMapping.js         # SID mapping by name (source → dest)
│   ├── studioFlows.js          # Studio Flow migration with SID replacement
│   └── contentTemplates.js     # Content Template migration
├── search/
│   ├── simple.js               # Name-based search
│   └── advanced.js             # Deep content search with path highlighting
└── utils/
    └── display.js              # Terminal display helpers (tables, colors, formatting)

__tests__/                      # Jest unit tests
```

### Data Storage

- **Account credentials**: `~/.twilio-cli-dashboard/accounts.enc` (AES-256-GCM encrypted)
- **Resource cache**: `~/.twilio-cli-dashboard/cache/<account-name>/<resource>.json` (JSON with `fetchedAt` metadata)

### Authentication

Accounts use Twilio API Key authentication (not Account SID + Auth Token):
```javascript
twilio(apiKeySid, apiKeySecret, { accountSid })
```

### Data Flow

1. **Register accounts** — user provides name, environment (dev/stage/prod), Account SID, API Key SID, API Key Secret; stored encrypted
2. **Download resources** — fetches from Twilio API, saves to local cache with timestamp
3. **Compare environments** — reads cached data from two accounts, shows differences (simple: counts/names, advanced: content diff)
4. **Migrate** — builds SID mapping between accounts by matching resource names, replaces SIDs in definitions, creates/updates resources in destination
5. **Search** — scans cached data for matches (simple: names only, advanced: deep content search)

### SID Replacement Strategy

In `src/migrate/studioFlows.js`, SID pairs are sorted by length (longest first) to prevent partial replacements. The flow definition is serialized to JSON, all SIDs are replaced via RegExp, then parsed back. Falls back to the original definition on parse errors.

### Advanced Comparison

In `src/compare/advanced.js`, resources are matched by `friendlyName`/`uniqueName`. Before diffing, metadata fields (sid, accountSid, dates, url, links) are stripped to focus on meaningful content differences. A recursive deep-diff function reports all differing paths.

## Code Conventions

### Language and Module System

- **Plain JavaScript** (no TypeScript)
- **ES Modules** exclusively (`"type": "module"` in package.json)
- All imports use `.js` file extensions

### Style

- **Prettier**: single quotes, semicolons, trailing commas, 100-char line width
- **ESLint**: flat config (`eslint.config.js`), alphabetically sorted import groups with newlines between them, bans unused imports
- No classes — functional style with small, reusable async functions
- Heavy use of `async/await` and `Promise.all()` for parallel operations

### Naming

- `camelCase` for functions and variables
- Source/destination prefixes: `source`/`src` and `dest`/`dst`
- SID variables may use `_SRC`/`_DST` suffixes
- Collections use plural names (`flows`, `queues`, `templates`)

### UI Text

- User-facing strings are in **Portuguese** (pt-BR)
- Uses `chalk` for colored output and `ora` for spinners
- Uses `inquirer` for interactive prompts

## Testing

- **Framework**: Jest with Node.js test environment
- **Location**: `__tests__/` directory
- **Run**: `npm test` (uses `--experimental-vm-modules` for ESM support, `--runInBand` for sequential execution)
- Tests mock Twilio client APIs and test isolated functions
- Test files: `crypto.test.js`, `store.test.js`, `cache.test.js`, `compare.test.js`, `search.test.js`, `mapping.test.js`, `contentTemplates.test.js`, `replaceSids.test.js`

When adding new functionality, add corresponding tests in `__tests__/`. Mock external API calls rather than making real requests.

## Build

The build step (`npm run build` / `scripts/build.js`) copies `src/` to `dist/` with no transpilation. The CLI entry point for the published binary is `dist/index.js`.

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `twilio` | Twilio SDK for all API interactions |
| `inquirer` | Interactive CLI prompts (checkboxes, input, lists) |
| `chalk` | Colored terminal output |
| `ora` | Loading spinners |
| `fs-extra` | Enhanced filesystem operations (ensureDir, writeJson, readJson) |

## Common Tasks

### Adding a new resource type

1. Add fetch function in `src/dataFetch/fetchAll.js`
2. Add resource type to `RESOURCE_TYPES` and `RESOURCE_LABELS` in `src/dataFetch/cache.js`
3. Add mapping logic in `src/migrate/buildMapping.js`
4. Create migration module in `src/migrate/` (if migratable)
5. Add resource type to `MIGRATABLE_TYPES` in `src/cli/migrateMenu.js` (if migratable)
6. Add tests in `__tests__/`

### Adding a new account field

1. Update `addAccount` in `src/accounts/store.js`
2. Update prompts in `src/cli/accountMenu.js`
3. Update `createClient` in `src/dataFetch/twilioClients.js` if auth-related

### Extending SID replacement

SID replacement in Studio Flows automatically covers all mapped SIDs. When you add new resource types to `buildMapping.js`, their SIDs will be included in the replacement pass.
