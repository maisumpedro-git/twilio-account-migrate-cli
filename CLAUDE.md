# CLAUDE.md

Guide for AI assistants working on the twilio-account-migrate-cli codebase.

## Project Overview

Node.js CLI tool that migrates Twilio resources between accounts. It supports migrating Studio Flows, Content Templates, TaskRouter configurations (workspaces, queues, workflows, activities, channels), and Serverless services. The tool fetches data from source and destination accounts, builds a SID mapping, and replaces SIDs in resource definitions during migration.

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
├── index.js                  # Entry point (loads dotenv, runs CLI)
├── cli/
│   └── main.js               # CLI orchestration with interactive prompts
├── dataFetch/
│   ├── twilioClients.js      # Twilio SDK client initialization (source + dest)
│   └── fetchAll.js           # Fetches all resources from both accounts
├── migrate/
│   ├── buildMapping.js       # Generates SID mapping (source → dest)
│   ├── studioFlows.js        # Studio Flow migration with SID replacement
│   └── contentTemplates.js   # Content Template migration
└── utils/
    └── env.js                # Environment variable validation and prompts

__tests__/                    # Jest unit tests
data/                         # Runtime data (gitignored)
├── source/                   # Fetched source account data (JSON)
├── dest/                     # Fetched destination account data (JSON)
└── mapping/
    └── sid-mapping.json      # Generated SID mapping
```

### Data Flow

1. **Validate credentials** — prompts for missing env vars, persists to `.env`
2. **Fetch data** — pulls TaskRouter, Serverless, Content Templates, Studio Flows from both accounts; saves JSON to `data/{source,dest}/`
3. **Build SID mapping** — matches resources by `friendlyName` or `uniqueName`; writes `data/mapping/sid-mapping.json`
4. **Migrate Content Templates** — user selects templates; creates missing ones in destination; updates mapping
5. **Migrate Studio Flows** — user selects flows; creates missing flows in destination; replaces all SIDs in flow definitions using the mapping

### SID Replacement Strategy

In `src/migrate/studioFlows.js`, SID pairs are sorted by length (longest first) to prevent partial replacements. The flow definition is serialized to JSON, all SIDs are replaced via RegExp, then parsed back. Falls back to the original definition on parse errors.

## Code Conventions

### Language and Module System

- **Plain JavaScript** (no TypeScript)
- **ES Modules** exclusively (`"type": "module"` in package.json)
- All imports use `.js` file extensions

### Style

- **Prettier**: single quotes, semicolons, trailing commas, 100-char line width
- **ESLint**: enforces alphabetically sorted import groups with newlines between them, bans unused imports
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
- Test files: `contentTemplates.test.js`, `mapping.test.js`, `replaceSids.test.js`

When adding new functionality, add corresponding tests in `__tests__/`. Mock external API calls rather than making real requests.

## Environment Variables

Defined in `.env` (see `.env.example`):

```
SOURCE_ACCOUNT_SID=     # Twilio source account SID
SOURCE_AUTH_TOKEN=       # Twilio source auth token
DEST_ACCOUNT_SID=        # Twilio destination account SID
DEST_AUTH_TOKEN=          # Twilio destination auth token
```

The CLI prompts for missing credentials at startup and persists them to `.env`.

## Build

The build step (`npm run build` / `scripts/build.js`) copies `src/` to `dist/` with no transpilation. The CLI entry point for the published binary is `dist/index.js`.

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `twilio` | Twilio SDK for all API interactions |
| `inquirer` | Interactive CLI prompts (checkboxes, input) |
| `chalk` | Colored terminal output |
| `ora` | Loading spinners |
| `dotenv` | Loads `.env` file into `process.env` |
| `fs-extra` | Enhanced filesystem operations (ensureDir, writeJson, readJson) |
| `lodash` | Utility functions |

## Common Tasks

### Adding a new resource type to migration

1. Add fetch logic in `src/dataFetch/fetchAll.js`
2. Add mapping logic in `src/migrate/buildMapping.js`
3. Create migration module in `src/migrate/`
4. Wire it into the CLI flow in `src/cli/main.js`
5. Add tests in `__tests__/`

### Extending SID replacement

SID replacement in Studio Flows automatically covers all mapped SIDs. When you add new resource types to `buildMapping.js`, their SIDs will be included in the replacement pass.
