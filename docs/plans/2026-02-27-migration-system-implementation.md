# Migration System Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rewrite `tam` from interactive dashboard to pure CLI with migration-based state management for CI/CD.

**Architecture:** Pure CLI (commander) with migration system: `pull` fetches cloud resources and generates diff-based migrations, `push` applies pending migrations with `@ref:type:name` SID resolution, `revert` applies rollback operations. All state stored as JSON files in user-specified `--dir`.

**Tech Stack:** Node.js ES Modules, commander, chalk, fs-extra, twilio SDK, Jest (TDD)

**Design doc:** `docs/plans/2026-02-27-migration-system-redesign.md`

---

## Phase 0: Project Cleanup

### Task 0.1: Remove unused dependencies and old code

**Files:**
- Modify: `package.json`
- Delete: `src/cli/`, `src/accounts/`, `src/dataFetch/cache.js`, `src/bulkDeploy/`, `src/variables/`, `src/compare/simple.js`, `src/search/`, `src/migrate/`, `src/utils/display.js`, `src/utils/resolveAccount.js`
- Delete: all files in `__tests__/` (will be replaced with new TDD tests)

**Step 1: Remove inquirer and ora from dependencies**

```bash
npm uninstall inquirer ora
```

**Step 2: Delete old source directories and files**

```bash
rm -rf src/cli src/accounts src/bulkDeploy src/variables src/search src/migrate
rm -f src/dataFetch/cache.js src/compare/simple.js src/utils/display.js src/utils/resolveAccount.js
```

**Step 3: Delete old tests**

```bash
rm -rf __tests__/*
```

**Step 4: Create new directory structure**

```bash
mkdir -p src/commands src/twilio src/state src/migration src/diff src/sid src/utils
```

**Step 5: Move reusable files to new locations**

```bash
cp src/dataFetch/twilioClients.js src/twilio/clients.js
cp src/dataFetch/fetchAll.js src/twilio/fetchers.js
cp src/utils/replaceSids.js src/sid/replace.js
cp src/compare/advanced.js src/diff/compare.js
```

**Step 6: Delete old directories that are now empty or superseded**

```bash
rm -rf src/dataFetch src/compare
```

**Step 7: Commit**

```bash
git add -A
git commit -m "chore: remove legacy code and restructure for migration system"
```

---

## Phase 1: Core Utilities (config, state, twilio clients)

### Task 1.1: Config — .env parser

Simplify the existing `config.js`: remove account name/environment, keep only credentials parsing.

**Files:**
- Create: `__tests__/config.test.js`
- Modify: `src/config.js`

**Step 1: Write the failing tests**

```js
// __tests__/config.test.js
import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';

// Mock fs
jest.unstable_mockModule('node:fs', () => ({
  readFileSync: jest.fn(),
}));

const { loadEnvFile } = await import('../src/config.js');

describe('loadEnvFile', () => {
  const mockReadFileSync = readFileSync;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('parses valid .env file with all required variables', async () => {
    const { readFileSync: mockedRead } = await import('node:fs');
    mockedRead.mockReturnValue(
      'TWILIO_ACCOUNT_SID=AC1234567890abcdef1234567890abcdef\n' +
        'TWILIO_API_KEY_SID=SK1234567890abcdef1234567890abcdef\n' +
        'TWILIO_API_KEY_SECRET=mysecret123\n',
    );
    const result = loadEnvFile('/fake/.env');
    expect(result).toEqual({
      accountSid: 'AC1234567890abcdef1234567890abcdef',
      apiKeySid: 'SK1234567890abcdef1234567890abcdef',
      apiKeySecret: 'mysecret123',
    });
  });

  test('strips quotes from values', async () => {
    const { readFileSync: mockedRead } = await import('node:fs');
    mockedRead.mockReturnValue(
      'TWILIO_ACCOUNT_SID="AC1234567890abcdef1234567890abcdef"\n' +
        "TWILIO_API_KEY_SID='SK1234567890abcdef1234567890abcdef'\n" +
        'TWILIO_API_KEY_SECRET=mysecret123\n',
    );
    const result = loadEnvFile('/fake/.env');
    expect(result.accountSid).toBe('AC1234567890abcdef1234567890abcdef');
    expect(result.apiKeySid).toBe('SK1234567890abcdef1234567890abcdef');
  });

  test('ignores comments and blank lines', async () => {
    const { readFileSync: mockedRead } = await import('node:fs');
    mockedRead.mockReturnValue(
      '# comment\n\nTWILIO_ACCOUNT_SID=AC1234567890abcdef1234567890abcdef\n' +
        'TWILIO_API_KEY_SID=SK1234567890abcdef1234567890abcdef\n' +
        'TWILIO_API_KEY_SECRET=mysecret123\n',
    );
    const result = loadEnvFile('/fake/.env');
    expect(result.accountSid).toBe('AC1234567890abcdef1234567890abcdef');
  });

  test('throws when TWILIO_ACCOUNT_SID is missing', async () => {
    const { readFileSync: mockedRead } = await import('node:fs');
    mockedRead.mockReturnValue(
      'TWILIO_API_KEY_SID=SK1234567890abcdef1234567890abcdef\n' +
        'TWILIO_API_KEY_SECRET=mysecret123\n',
    );
    expect(() => loadEnvFile('/fake/.env')).toThrow('TWILIO_ACCOUNT_SID');
  });

  test('throws when TWILIO_API_KEY_SID is missing', async () => {
    const { readFileSync: mockedRead } = await import('node:fs');
    mockedRead.mockReturnValue(
      'TWILIO_ACCOUNT_SID=AC1234567890abcdef1234567890abcdef\n' +
        'TWILIO_API_KEY_SECRET=mysecret123\n',
    );
    expect(() => loadEnvFile('/fake/.env')).toThrow('TWILIO_API_KEY_SID');
  });

  test('throws when TWILIO_API_KEY_SECRET is missing', async () => {
    const { readFileSync: mockedRead } = await import('node:fs');
    mockedRead.mockReturnValue(
      'TWILIO_ACCOUNT_SID=AC1234567890abcdef1234567890abcdef\n' +
        'TWILIO_API_KEY_SID=SK1234567890abcdef1234567890abcdef\n',
    );
    expect(() => loadEnvFile('/fake/.env')).toThrow('TWILIO_API_KEY_SECRET');
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npm test -- __tests__/config.test.js
```

Expected: FAIL (config.js still has old shape returning name/environment)

**Step 3: Rewrite src/config.js**

```js
// src/config.js
import { readFileSync } from 'node:fs';
import path from 'node:path';

export function loadEnvFile(filePath) {
  const content = readFileSync(path.resolve(filePath), 'utf8');
  const vars = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }

  const missing = [];
  if (!vars.TWILIO_ACCOUNT_SID) missing.push('TWILIO_ACCOUNT_SID');
  if (!vars.TWILIO_API_KEY_SID) missing.push('TWILIO_API_KEY_SID');
  if (!vars.TWILIO_API_KEY_SECRET) missing.push('TWILIO_API_KEY_SECRET');

  if (missing.length > 0) {
    throw new Error(
      `Arquivo .env deve conter: ${missing.join(', ')}`,
    );
  }

  return {
    accountSid: vars.TWILIO_ACCOUNT_SID,
    apiKeySid: vars.TWILIO_API_KEY_SID,
    apiKeySecret: vars.TWILIO_API_KEY_SECRET,
  };
}
```

**Step 4: Run tests to verify they pass**

```bash
npm test -- __tests__/config.test.js
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/config.js __tests__/config.test.js
git commit -m "feat: simplify config.js to return only Twilio credentials"
```

---

### Task 1.2: State Reader

**Files:**
- Create: `__tests__/state/reader.test.js`
- Create: `src/state/reader.js`

**Step 1: Write failing tests**

```js
// __tests__/state/reader.test.js
import { jest } from '@jest/globals';

jest.unstable_mockModule('fs-extra', () => ({
  pathExists: jest.fn(),
  readJson: jest.fn(),
}));

const { readState, readMigrationsTracker } = await import('../../src/state/reader.js');
const { pathExists, readJson } = await import('fs-extra');

describe('readState', () => {
  beforeEach(() => jest.clearAllMocks());

  test('reads state file for a resource type', async () => {
    pathExists.mockResolvedValue(true);
    readJson.mockResolvedValue({
      fetchedAt: '2026-02-27T14:30:52Z',
      resources: [{ sid: 'WQ123', friendlyName: 'Queue A' }],
    });
    const result = await readState('/env/dev', 'taskQueues');
    expect(readJson).toHaveBeenCalledWith('/env/dev/state/taskQueues.json');
    expect(result.resources).toHaveLength(1);
    expect(result.resources[0].friendlyName).toBe('Queue A');
  });

  test('returns empty resources when state file does not exist', async () => {
    pathExists.mockResolvedValue(false);
    const result = await readState('/env/dev', 'taskQueues');
    expect(result).toEqual({ fetchedAt: null, resources: [] });
  });
});

describe('readMigrationsTracker', () => {
  beforeEach(() => jest.clearAllMocks());

  test('reads migrations.json', async () => {
    pathExists.mockResolvedValue(true);
    readJson.mockResolvedValue({
      applied: [{ name: '20260227_143052_pull.json', appliedAt: '2026-02-27T17:30:52Z' }],
    });
    const result = await readMigrationsTracker('/env/dev');
    expect(result.applied).toHaveLength(1);
  });

  test('returns empty applied when migrations.json does not exist', async () => {
    pathExists.mockResolvedValue(false);
    const result = await readMigrationsTracker('/env/dev');
    expect(result).toEqual({ applied: [] });
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npm test -- __tests__/state/reader.test.js
```

Expected: FAIL (module not found)

**Step 3: Implement src/state/reader.js**

```js
// src/state/reader.js
import { pathExists, readJson } from 'fs-extra';
import path from 'node:path';

export async function readState(dir, resourceType) {
  const filePath = path.join(dir, 'state', `${resourceType}.json`);
  const exists = await pathExists(filePath);
  if (!exists) return { fetchedAt: null, resources: [] };
  return readJson(filePath);
}

export async function readAllStates(dir) {
  const types = ['taskQueues', 'taskChannels', 'workflows', 'workspace', 'studioFlows', 'contentTemplates'];
  const states = {};
  for (const type of types) {
    states[type] = await readState(dir, type);
  }
  return states;
}

export async function readMigrationsTracker(dir) {
  const filePath = path.join(dir, 'state', 'migrations.json');
  const exists = await pathExists(filePath);
  if (!exists) return { applied: [] };
  return readJson(filePath);
}
```

**Step 4: Run tests to verify they pass**

```bash
npm test -- __tests__/state/reader.test.js
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/state/reader.js __tests__/state/reader.test.js
git commit -m "feat: add state reader module"
```

---

### Task 1.3: State Writer

**Files:**
- Create: `__tests__/state/writer.test.js`
- Create: `src/state/writer.js`

**Step 1: Write failing tests**

```js
// __tests__/state/writer.test.js
import { jest } from '@jest/globals';

jest.unstable_mockModule('fs-extra', () => ({
  ensureDir: jest.fn(),
  writeJson: jest.fn(),
}));

const { writeState, writeMigrationsTracker } = await import('../../src/state/writer.js');
const { ensureDir, writeJson } = await import('fs-extra');

describe('writeState', () => {
  beforeEach(() => jest.clearAllMocks());

  test('writes state file with fetchedAt timestamp', async () => {
    const resources = [{ sid: 'WQ123', friendlyName: 'Queue A' }];
    await writeState('/env/dev', 'taskQueues', resources);
    expect(ensureDir).toHaveBeenCalledWith('/env/dev/state');
    expect(writeJson).toHaveBeenCalledWith(
      '/env/dev/state/taskQueues.json',
      expect.objectContaining({
        fetchedAt: expect.any(String),
        resources,
      }),
      { spaces: 2 },
    );
  });
});

describe('writeMigrationsTracker', () => {
  beforeEach(() => jest.clearAllMocks());

  test('writes migrations.json', async () => {
    const tracker = { applied: [{ name: 'test.json', appliedAt: '2026-01-01T00:00:00Z' }] };
    await writeMigrationsTracker('/env/dev', tracker);
    expect(writeJson).toHaveBeenCalledWith(
      '/env/dev/state/migrations.json',
      tracker,
      { spaces: 2 },
    );
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npm test -- __tests__/state/writer.test.js
```

**Step 3: Implement src/state/writer.js**

```js
// src/state/writer.js
import { ensureDir, writeJson } from 'fs-extra';
import path from 'node:path';

export async function writeState(dir, resourceType, resources) {
  const stateDir = path.join(dir, 'state');
  await ensureDir(stateDir);
  await writeJson(
    path.join(stateDir, `${resourceType}.json`),
    { fetchedAt: new Date().toISOString(), resources },
    { spaces: 2 },
  );
}

export async function writeMigrationsTracker(dir, tracker) {
  const stateDir = path.join(dir, 'state');
  await ensureDir(stateDir);
  await writeJson(path.join(stateDir, 'migrations.json'), tracker, { spaces: 2 });
}
```

**Step 4: Run tests, verify pass**

```bash
npm test -- __tests__/state/writer.test.js
```

**Step 5: Commit**

```bash
git add src/state/writer.js __tests__/state/writer.test.js
git commit -m "feat: add state writer module"
```

---

### Task 1.4: Twilio Clients (adapt existing)

**Files:**
- Create: `__tests__/twilio/clients.test.js`
- Modify: `src/twilio/clients.js` (already copied, just verify)

**Step 1: Write failing test**

```js
// __tests__/twilio/clients.test.js
import { jest } from '@jest/globals';

jest.unstable_mockModule('twilio', () => ({
  default: jest.fn(() => ({ fake: 'client' })),
}));

const { createClient } = await import('../../src/twilio/clients.js');

describe('createClient', () => {
  test('creates twilio client with API key auth', async () => {
    const twilio = (await import('twilio')).default;
    const account = {
      accountSid: 'AC123',
      apiKeySid: 'SK123',
      apiKeySecret: 'secret',
    };
    const client = createClient(account);
    expect(twilio).toHaveBeenCalledWith('SK123', 'secret', { accountSid: 'AC123' });
    expect(client).toEqual({ fake: 'client' });
  });
});
```

**Step 2: Run test**

```bash
npm test -- __tests__/twilio/clients.test.js
```

The existing code should already pass (it was copied from twilioClients.js). If it fails due to import paths, fix them.

**Step 3: Commit**

```bash
git add src/twilio/clients.js __tests__/twilio/clients.test.js
git commit -m "feat: add twilio client factory"
```

---

### Task 1.5: Twilio Fetchers (adapt existing, remove cache dependency)

**Files:**
- Create: `__tests__/twilio/fetchers.test.js`
- Modify: `src/twilio/fetchers.js`

**Step 1: Write failing tests**

```js
// __tests__/twilio/fetchers.test.js
import { jest } from '@jest/globals';

jest.unstable_mockModule('../../src/twilio/clients.js', () => ({
  createClient: jest.fn(),
}));

const { fetchResource, fetchAllResources, RESOURCE_TYPES } = await import('../../src/twilio/fetchers.js');
const { createClient } = await import('../../src/twilio/clients.js');

describe('RESOURCE_TYPES', () => {
  test('contains all expected types', () => {
    expect(RESOURCE_TYPES).toEqual([
      'workspace', 'taskQueues', 'taskChannels', 'workflows', 'studioFlows', 'contentTemplates',
    ]);
  });
});

describe('fetchResource', () => {
  test('fetches taskQueues via workspace', async () => {
    const mockApi = {
      taskrouter: {
        v1: {
          workspaces: Object.assign(jest.fn(() => ({
            taskQueues: { list: jest.fn().mockResolvedValue([
              { sid: 'WQ1', friendlyName: 'Queue A', targetWorkers: '1==1', maxReservedWorkers: 5, taskOrder: 'FIFO' },
            ]) },
          })), {
            list: jest.fn().mockResolvedValue([{ sid: 'WS1', friendlyName: 'My Workspace' }]),
          }),
        },
      },
    };
    createClient.mockReturnValue(mockApi);

    const account = { accountSid: 'AC1', apiKeySid: 'SK1', apiKeySecret: 's' };
    const result = await fetchResource(account, 'taskQueues');
    expect(result).toHaveLength(1);
    expect(result[0].friendlyName).toBe('Queue A');
  });

  test('throws on unknown resource type', async () => {
    createClient.mockReturnValue({});
    const account = { accountSid: 'AC1', apiKeySid: 'SK1', apiKeySecret: 's' };
    await expect(fetchResource(account, 'unknown')).rejects.toThrow('Tipo de recurso desconhecido');
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npm test -- __tests__/twilio/fetchers.test.js
```

Expected: FAIL (still imports cache.js)

**Step 3: Modify src/twilio/fetchers.js — remove cache imports and calls**

Remove the `import { setCachedResource } from './cache.js';` line and all `setCachedResource()` calls. Fix the `import { createClient }` path to `./clients.js`. Export `RESOURCE_TYPES` constant.

Add at top of file:
```js
export const RESOURCE_TYPES = [
  'workspace', 'taskQueues', 'taskChannels', 'workflows', 'studioFlows', 'contentTemplates',
];
```

Remove from `fetchResource()`: the `setCachedResource(account.name, resourceType, data);` line.
Remove from `fetchAllResources()`: all 6 `setCachedResource()` calls.

**Step 4: Run tests, verify pass**

```bash
npm test -- __tests__/twilio/fetchers.test.js
```

**Step 5: Commit**

```bash
git add src/twilio/fetchers.js __tests__/twilio/fetchers.test.js
git commit -m "feat: adapt fetchers, remove cache dependency, export RESOURCE_TYPES"
```

---

## Phase 2: Diff and Migration Core

### Task 2.1: Diff/Compare (adapt existing)

**Files:**
- Create: `__tests__/diff/compare.test.js`
- Modify: `src/diff/compare.js`

**Step 1: Write failing tests**

```js
// __tests__/diff/compare.test.js
import { describe, expect, test } from '@jest/globals';

import { diffResources } from '../../src/diff/compare.js';

describe('diffResources', () => {
  test('detects resource only in cloud (create)', () => {
    const cloud = [{ sid: 'WQ1', friendlyName: 'Queue A', targetWorkers: '1==1' }];
    const local = [];
    const result = diffResources(cloud, local);
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe('create');
    expect(result[0].data.friendlyName).toBe('Queue A');
    expect(result[0].data.sid).toBeUndefined();
  });

  test('detects resource only in local state (delete)', () => {
    const cloud = [];
    const local = [{ sid: 'WQ1', friendlyName: 'Queue A', targetWorkers: '1==1' }];
    const result = diffResources(cloud, local);
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe('delete');
    expect(result[0].match.friendlyName).toBe('Queue A');
  });

  test('detects updated resource (changed fields only)', () => {
    const cloud = [{ sid: 'WQ1', friendlyName: 'Queue A', targetWorkers: 'skills HAS "support"', maxReservedWorkers: 5 }];
    const local = [{ sid: 'WQ1', friendlyName: 'Queue A', targetWorkers: '1==1', maxReservedWorkers: 5 }];
    const result = diffResources(cloud, local);
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe('update');
    expect(result[0].match.friendlyName).toBe('Queue A');
    expect(result[0].data.targetWorkers).toBe('skills HAS "support"');
    expect(result[0].data.maxReservedWorkers).toBeUndefined(); // unchanged
  });

  test('returns empty array when no differences', () => {
    const cloud = [{ sid: 'WQ1', friendlyName: 'Queue A', targetWorkers: '1==1' }];
    const local = [{ sid: 'WQ2', friendlyName: 'Queue A', targetWorkers: '1==1' }];
    const result = diffResources(cloud, local);
    expect(result).toHaveLength(0);
  });

  test('ignores metadata fields (sid, accountSid, dateCreated, dateUpdated, url, links)', () => {
    const cloud = [{ sid: 'WQ1', accountSid: 'AC1', friendlyName: 'Q', dateCreated: '2026-01-01', url: 'http://x', links: {} }];
    const local = [{ sid: 'WQ2', accountSid: 'AC2', friendlyName: 'Q', dateCreated: '2025-01-01', url: 'http://y', links: {} }];
    const result = diffResources(cloud, local);
    expect(result).toHaveLength(0);
  });

  test('matches by uniqueName when friendlyName is absent', () => {
    const cloud = [{ sid: 'HX1', uniqueName: 'template_a', types: { 'twilio/text': { body: 'hello' } } }];
    const local = [];
    const result = diffResources(cloud, local);
    expect(result).toHaveLength(1);
    expect(result[0].data.uniqueName).toBe('template_a');
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npm test -- __tests__/diff/compare.test.js
```

**Step 3: Rewrite src/diff/compare.js**

```js
// src/diff/compare.js

const METADATA_FIELDS = new Set([
  'sid', 'accountSid', 'account_sid',
  'dateCreated', 'date_created',
  'dateUpdated', 'date_updated',
  'url', 'links',
]);

function resourceKey(item) {
  return item.friendlyName || item.uniqueName || item.sid;
}

function stripMetadata(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(stripMetadata);
  const cleaned = {};
  for (const [key, val] of Object.entries(obj)) {
    if (METADATA_FIELDS.has(key)) continue;
    cleaned[key] = typeof val === 'object' && val !== null ? stripMetadata(val) : val;
  }
  return cleaned;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((val, i) => deepEqual(val, b[i]));
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => deepEqual(a[key], b[key]));
}

function changedFields(cloudItem, localItem) {
  const cleanCloud = stripMetadata(cloudItem);
  const cleanLocal = stripMetadata(localItem);
  const changed = {};
  for (const [key, val] of Object.entries(cleanCloud)) {
    if (!deepEqual(val, cleanLocal[key])) {
      changed[key] = val;
    }
  }
  return changed;
}

export function diffResources(cloudResources, localResources) {
  const operations = [];
  const cloudMap = new Map(cloudResources.map((r) => [resourceKey(r), r]));
  const localMap = new Map(localResources.map((r) => [resourceKey(r), r]));

  // Resources in cloud but not local → create
  for (const [name, cloudItem] of cloudMap) {
    if (!localMap.has(name)) {
      const data = stripMetadata(cloudItem);
      operations.push({ action: 'create', data });
    }
  }

  // Resources in local but not cloud → delete
  for (const [name] of localMap) {
    if (!cloudMap.has(name)) {
      operations.push({ action: 'delete', match: { friendlyName: name } });
    }
  }

  // Resources in both → check for updates
  for (const [name, cloudItem] of cloudMap) {
    const localItem = localMap.get(name);
    if (!localItem) continue;
    const changed = changedFields(cloudItem, localItem);
    if (Object.keys(changed).length > 0) {
      operations.push({
        action: 'update',
        match: { friendlyName: name },
        data: changed,
      });
    }
  }

  return operations;
}
```

**Step 4: Run tests, verify pass**

```bash
npm test -- __tests__/diff/compare.test.js
```

**Step 5: Commit**

```bash
git add src/diff/compare.js __tests__/diff/compare.test.js
git commit -m "feat: add diffResources for comparing cloud vs local state"
```

---

### Task 2.2: Migration Resolver (@ref)

**Files:**
- Create: `__tests__/migration/resolver.test.js`
- Create: `src/migration/resolver.js`

**Step 1: Write failing tests**

```js
// __tests__/migration/resolver.test.js
import { describe, expect, test } from '@jest/globals';

import { resolveRefs } from '../../src/migration/resolver.js';

describe('resolveRefs', () => {
  const state = {
    taskQueues: {
      resources: [
        { sid: 'WQ111', friendlyName: 'Support Queue' },
        { sid: 'WQ222', friendlyName: 'Sales Queue' },
      ],
    },
    workflows: {
      resources: [{ sid: 'WW111', friendlyName: 'Main Workflow' }],
    },
  };

  test('resolves @ref:type:name in a string value', () => {
    const obj = { queue: '@ref:taskQueues:Support Queue' };
    const result = resolveRefs(obj, state);
    expect(result.queue).toBe('WQ111');
  });

  test('resolves nested @ref values', () => {
    const obj = {
      config: {
        targets: [
          { queue: '@ref:taskQueues:Support Queue' },
          { queue: '@ref:taskQueues:Sales Queue' },
        ],
      },
    };
    const result = resolveRefs(obj, state);
    expect(result.config.targets[0].queue).toBe('WQ111');
    expect(result.config.targets[1].queue).toBe('WQ222');
  });

  test('leaves non-ref strings unchanged', () => {
    const obj = { name: 'hello', count: 5 };
    const result = resolveRefs(obj, state);
    expect(result).toEqual({ name: 'hello', count: 5 });
  });

  test('throws when @ref cannot be resolved', () => {
    const obj = { queue: '@ref:taskQueues:Unknown Queue' };
    expect(() => resolveRefs(obj, state)).toThrow('Unknown Queue');
  });

  test('resolves @ref from runtime SIDs (created in same migration)', () => {
    const runtimeSids = { 'taskQueues:New Queue': 'WQ999' };
    const obj = { queue: '@ref:taskQueues:New Queue' };
    const result = resolveRefs(obj, state, runtimeSids);
    expect(result.queue).toBe('WQ999');
  });

  test('runtime SIDs take precedence over state', () => {
    const runtimeSids = { 'taskQueues:Support Queue': 'WQ_OVERRIDE' };
    const obj = { queue: '@ref:taskQueues:Support Queue' };
    const result = resolveRefs(obj, state, runtimeSids);
    expect(result.queue).toBe('WQ_OVERRIDE');
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npm test -- __tests__/migration/resolver.test.js
```

**Step 3: Implement src/migration/resolver.js**

```js
// src/migration/resolver.js

const REF_PATTERN = /^@ref:(\w+):(.+)$/;

function lookupSid(type, name, state, runtimeSids) {
  const runtimeKey = `${type}:${name}`;
  if (runtimeSids?.[runtimeKey]) return runtimeSids[runtimeKey];

  const resources = state[type]?.resources || [];
  const match = resources.find(
    (r) => r.friendlyName === name || r.uniqueName === name,
  );
  if (match) return match.sid;

  return null;
}

export function resolveRefs(obj, state, runtimeSids = {}) {
  if (obj == null) return obj;

  if (typeof obj === 'string') {
    const m = obj.match(REF_PATTERN);
    if (m) {
      const [, type, name] = m;
      const sid = lookupSid(type, name, state, runtimeSids);
      if (!sid) {
        throw new Error(
          `Referencia nao resolvida: @ref:${type}:${name} — recurso nao encontrado no state`,
        );
      }
      return sid;
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => resolveRefs(item, state, runtimeSids));
  }

  if (typeof obj === 'object') {
    const resolved = {};
    for (const [key, val] of Object.entries(obj)) {
      resolved[key] = resolveRefs(val, state, runtimeSids);
    }
    return resolved;
  }

  return obj;
}
```

**Step 4: Run tests, verify pass**

```bash
npm test -- __tests__/migration/resolver.test.js
```

**Step 5: Commit**

```bash
git add src/migration/resolver.js __tests__/migration/resolver.test.js
git commit -m "feat: add @ref resolver for migration SID references"
```

---

### Task 2.3: Migration Rollback Generator

**Files:**
- Create: `__tests__/migration/rollback.test.js`
- Create: `src/migration/rollback.js`

**Step 1: Write failing tests**

```js
// __tests__/migration/rollback.test.js
import { describe, expect, test } from '@jest/globals';

import { generateRollback } from '../../src/migration/rollback.js';

describe('generateRollback', () => {
  const localState = {
    taskQueues: {
      resources: [
        { sid: 'WQ1', friendlyName: 'Queue A', targetWorkers: '1==1', maxReservedWorkers: 5 },
      ],
    },
  };

  test('create → rollback is delete', () => {
    const op = { action: 'create', type: 'taskQueues', data: { friendlyName: 'New Queue', targetWorkers: '1==1' } };
    const rollback = generateRollback(op, localState);
    expect(rollback.action).toBe('delete');
    expect(rollback.type).toBe('taskQueues');
    expect(rollback.match.friendlyName).toBe('New Queue');
  });

  test('delete → rollback is create with full data from state', () => {
    const op = { action: 'delete', type: 'taskQueues', match: { friendlyName: 'Queue A' } };
    const rollback = generateRollback(op, localState);
    expect(rollback.action).toBe('create');
    expect(rollback.type).toBe('taskQueues');
    expect(rollback.data.friendlyName).toBe('Queue A');
    expect(rollback.data.targetWorkers).toBe('1==1');
    expect(rollback.data.sid).toBeUndefined();
  });

  test('update → rollback is update with old values', () => {
    const op = {
      action: 'update',
      type: 'taskQueues',
      match: { friendlyName: 'Queue A' },
      data: { targetWorkers: 'skills HAS "support"' },
    };
    const rollback = generateRollback(op, localState);
    expect(rollback.action).toBe('update');
    expect(rollback.type).toBe('taskQueues');
    expect(rollback.match.friendlyName).toBe('Queue A');
    expect(rollback.data.targetWorkers).toBe('1==1');
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npm test -- __tests__/migration/rollback.test.js
```

**Step 3: Implement src/migration/rollback.js**

```js
// src/migration/rollback.js

const METADATA_FIELDS = new Set([
  'sid', 'accountSid', 'account_sid',
  'dateCreated', 'date_created',
  'dateUpdated', 'date_updated',
  'url', 'links',
]);

function stripMetadata(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const cleaned = {};
  for (const [key, val] of Object.entries(obj)) {
    if (METADATA_FIELDS.has(key)) continue;
    cleaned[key] = val;
  }
  return cleaned;
}

function findInState(state, type, friendlyName) {
  const resources = state[type]?.resources || [];
  return resources.find(
    (r) => r.friendlyName === friendlyName || r.uniqueName === friendlyName,
  );
}

export function generateRollback(operation, localState) {
  const { action, type, match, data } = operation;

  switch (action) {
    case 'create':
      return {
        action: 'delete',
        type,
        match: { friendlyName: data.friendlyName || data.uniqueName },
      };

    case 'delete': {
      const original = findInState(localState, type, match.friendlyName);
      return {
        action: 'create',
        type,
        data: stripMetadata(original || {}),
      };
    }

    case 'update': {
      const original = findInState(localState, type, match.friendlyName);
      const oldValues = {};
      if (original) {
        for (const key of Object.keys(data)) {
          if (!METADATA_FIELDS.has(key)) {
            oldValues[key] = original[key];
          }
        }
      }
      return {
        action: 'update',
        type,
        match: { friendlyName: match.friendlyName },
        data: oldValues,
      };
    }

    default:
      throw new Error(`Acao desconhecida: ${action}`);
  }
}

export function generateRollbackAll(operations, localState) {
  return operations.map((op) => generateRollback(op, localState)).reverse();
}
```

**Step 4: Run tests, verify pass**

```bash
npm test -- __tests__/migration/rollback.test.js
```

**Step 5: Commit**

```bash
git add src/migration/rollback.js __tests__/migration/rollback.test.js
git commit -m "feat: add rollback generator for migration operations"
```

---

### Task 2.4: Migration Tracker

**Files:**
- Create: `__tests__/migration/tracker.test.js`
- Create: `src/migration/tracker.js`

**Step 1: Write failing tests**

```js
// __tests__/migration/tracker.test.js
import { jest } from '@jest/globals';

jest.unstable_mockModule('fs-extra', () => ({
  pathExists: jest.fn(),
  readJson: jest.fn(),
  readdir: jest.fn(),
  ensureDir: jest.fn(),
  writeJson: jest.fn(),
}));

jest.unstable_mockModule('../../src/state/reader.js', () => ({
  readMigrationsTracker: jest.fn(),
}));

jest.unstable_mockModule('../../src/state/writer.js', () => ({
  writeMigrationsTracker: jest.fn(),
}));

const { getPendingMigrations, markApplied, listMigrations } = await import('../../src/migration/tracker.js');
const { readMigrationsTracker } = await import('../../src/state/reader.js');
const { readdir } = await import('fs-extra');

describe('getPendingMigrations', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns migrations not in applied list, sorted by name', async () => {
    readdir.mockResolvedValue([
      '20260227_143052_first.json',
      '20260227_150030_second.json',
      '20260228_091500_third.json',
    ]);
    readMigrationsTracker.mockResolvedValue({
      applied: [{ name: '20260227_143052_first.json', appliedAt: '2026-02-27T17:30:52Z' }],
    });
    const pending = await getPendingMigrations('/env/dev');
    expect(pending).toEqual(['20260227_150030_second.json', '20260228_091500_third.json']);
  });

  test('returns empty when all migrations are applied', async () => {
    readdir.mockResolvedValue(['20260227_143052_first.json']);
    readMigrationsTracker.mockResolvedValue({
      applied: [{ name: '20260227_143052_first.json', appliedAt: '2026-02-27T17:30:52Z' }],
    });
    const pending = await getPendingMigrations('/env/dev');
    expect(pending).toEqual([]);
  });

  test('returns empty when no migration files exist', async () => {
    readdir.mockResolvedValue([]);
    readMigrationsTracker.mockResolvedValue({ applied: [] });
    const pending = await getPendingMigrations('/env/dev');
    expect(pending).toEqual([]);
  });
});

describe('listMigrations', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns all migrations with their status', async () => {
    readdir.mockResolvedValue([
      '20260227_143052_first.json',
      '20260227_150030_second.json',
    ]);
    readMigrationsTracker.mockResolvedValue({
      applied: [{ name: '20260227_143052_first.json', appliedAt: '2026-02-27T17:30:52Z' }],
    });
    const list = await listMigrations('/env/dev');
    expect(list).toEqual([
      { name: '20260227_143052_first.json', status: 'applied', appliedAt: '2026-02-27T17:30:52Z' },
      { name: '20260227_150030_second.json', status: 'pending', appliedAt: null },
    ]);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npm test -- __tests__/migration/tracker.test.js
```

**Step 3: Implement src/migration/tracker.js**

```js
// src/migration/tracker.js
import { ensureDir, readdir, readJson } from 'fs-extra';
import path from 'node:path';

import { readMigrationsTracker } from '../state/reader.js';
import { writeMigrationsTracker } from '../state/writer.js';

export async function getPendingMigrations(dir) {
  const migrationsDir = path.join(dir, 'migrations');
  await ensureDir(migrationsDir);
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.json')).sort();
  const tracker = await readMigrationsTracker(dir);
  const appliedNames = new Set(tracker.applied.map((a) => a.name));
  return files.filter((f) => !appliedNames.has(f));
}

export async function markApplied(dir, migrationName) {
  const tracker = await readMigrationsTracker(dir);
  tracker.applied.push({ name: migrationName, appliedAt: new Date().toISOString() });
  await writeMigrationsTracker(dir, tracker);
}

export async function unmarkApplied(dir, migrationName) {
  const tracker = await readMigrationsTracker(dir);
  tracker.applied = tracker.applied.filter((a) => a.name !== migrationName);
  await writeMigrationsTracker(dir, tracker);
}

export async function listMigrations(dir) {
  const migrationsDir = path.join(dir, 'migrations');
  await ensureDir(migrationsDir);
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.json')).sort();
  const tracker = await readMigrationsTracker(dir);
  const appliedMap = new Map(tracker.applied.map((a) => [a.name, a.appliedAt]));

  return files.map((name) => ({
    name,
    status: appliedMap.has(name) ? 'applied' : 'pending',
    appliedAt: appliedMap.get(name) || null,
  }));
}

export async function readMigrationFile(dir, name) {
  return readJson(path.join(dir, 'migrations', name));
}
```

**Step 4: Run tests, verify pass**

```bash
npm test -- __tests__/migration/tracker.test.js
```

**Step 5: Commit**

```bash
git add src/migration/tracker.js __tests__/migration/tracker.test.js
git commit -m "feat: add migration tracker (pending/applied/list)"
```

---

### Task 2.5: Migration Generator (pull logic)

**Files:**
- Create: `__tests__/migration/generator.test.js`
- Create: `src/migration/generator.js`

**Step 1: Write failing tests**

```js
// __tests__/migration/generator.test.js
import { describe, expect, test } from '@jest/globals';

import { generateMigration } from '../../src/migration/generator.js';

describe('generateMigration', () => {
  test('generates migration with create ops when state is empty', () => {
    const cloudData = {
      taskQueues: [{ sid: 'WQ1', friendlyName: 'Queue A', targetWorkers: '1==1' }],
    };
    const localStates = {
      taskQueues: { fetchedAt: null, resources: [] },
    };
    const result = generateMigration(cloudData, localStates, ['taskQueues']);
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].action).toBe('create');
    expect(result.operations[0].type).toBe('taskQueues');
    expect(result.rollback).toHaveLength(1);
    expect(result.rollback[0].action).toBe('delete');
  });

  test('generates migration with delete ops when cloud is empty', () => {
    const cloudData = { taskQueues: [] };
    const localStates = {
      taskQueues: { fetchedAt: '2026-01-01', resources: [{ sid: 'WQ1', friendlyName: 'Queue A', targetWorkers: '1==1' }] },
    };
    const result = generateMigration(cloudData, localStates, ['taskQueues']);
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].action).toBe('delete');
    expect(result.rollback[0].action).toBe('create');
  });

  test('generates migration with update ops for changed resources', () => {
    const cloudData = {
      taskQueues: [{ sid: 'WQ1', friendlyName: 'Queue A', targetWorkers: 'skills HAS "x"' }],
    };
    const localStates = {
      taskQueues: { fetchedAt: '2026-01-01', resources: [{ sid: 'WQ1', friendlyName: 'Queue A', targetWorkers: '1==1' }] },
    };
    const result = generateMigration(cloudData, localStates, ['taskQueues']);
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].action).toBe('update');
    expect(result.rollback[0].data.targetWorkers).toBe('1==1');
  });

  test('returns null when no differences', () => {
    const cloudData = {
      taskQueues: [{ sid: 'WQ1', friendlyName: 'Queue A', targetWorkers: '1==1' }],
    };
    const localStates = {
      taskQueues: { fetchedAt: '2026-01-01', resources: [{ sid: 'WQ2', friendlyName: 'Queue A', targetWorkers: '1==1' }] },
    };
    const result = generateMigration(cloudData, localStates, ['taskQueues']);
    expect(result).toBeNull();
  });

  test('handles multiple resource types', () => {
    const cloudData = {
      taskQueues: [{ sid: 'WQ1', friendlyName: 'Q1', targetWorkers: '1==1' }],
      workflows: [{ sid: 'WW1', friendlyName: 'W1', configuration: {} }],
    };
    const localStates = {
      taskQueues: { fetchedAt: null, resources: [] },
      workflows: { fetchedAt: null, resources: [] },
    };
    const result = generateMigration(cloudData, localStates, ['taskQueues', 'workflows']);
    expect(result.operations).toHaveLength(2);
  });

  test('includes source: "pull" and createdAt', () => {
    const cloudData = { taskQueues: [{ sid: 'WQ1', friendlyName: 'Q', targetWorkers: '1==1' }] };
    const localStates = { taskQueues: { fetchedAt: null, resources: [] } };
    const result = generateMigration(cloudData, localStates, ['taskQueues']);
    expect(result.source).toBe('pull');
    expect(result.createdAt).toBeDefined();
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npm test -- __tests__/migration/generator.test.js
```

**Step 3: Implement src/migration/generator.js**

```js
// src/migration/generator.js
import { diffResources } from '../diff/compare.js';
import { generateRollbackAll } from '../migration/rollback.js';

export function generateMigration(cloudData, localStates, resourceTypes, description = 'pull-changes') {
  const allOperations = [];

  for (const type of resourceTypes) {
    const cloudResources = Array.isArray(cloudData[type])
      ? cloudData[type]
      : cloudData[type] ? [cloudData[type]] : [];
    const localResources = localStates[type]?.resources || [];

    const ops = diffResources(cloudResources, localResources);
    for (const op of ops) {
      allOperations.push({ ...op, type });
    }
  }

  if (allOperations.length === 0) return null;

  const rollback = generateRollbackAll(allOperations, localStates);

  return {
    description,
    createdAt: new Date().toISOString(),
    source: 'pull',
    operations: allOperations,
    rollback,
  };
}
```

**Step 4: Run tests, verify pass**

```bash
npm test -- __tests__/migration/generator.test.js
```

**Step 5: Commit**

```bash
git add src/migration/generator.js __tests__/migration/generator.test.js
git commit -m "feat: add migration generator (pull diff logic)"
```

---

### Task 2.6: Migration Validator

**Files:**
- Create: `__tests__/migration/validator.test.js`
- Create: `src/migration/validator.js`

**Step 1: Write failing tests**

```js
// __tests__/migration/validator.test.js
import { describe, expect, test } from '@jest/globals';

import { validateMigration } from '../../src/migration/validator.js';

describe('validateMigration', () => {
  test('valid create operation passes', () => {
    const migration = {
      operations: [{ action: 'create', type: 'taskQueues', data: { friendlyName: 'Q' } }],
    };
    expect(() => validateMigration(migration)).not.toThrow();
  });

  test('valid update operation passes', () => {
    const migration = {
      operations: [{ action: 'update', type: 'taskQueues', match: { friendlyName: 'Q' }, data: { targetWorkers: '1==1' } }],
    };
    expect(() => validateMigration(migration)).not.toThrow();
  });

  test('valid delete operation passes', () => {
    const migration = {
      operations: [{ action: 'delete', type: 'taskQueues', match: { friendlyName: 'Q' } }],
    };
    expect(() => validateMigration(migration)).not.toThrow();
  });

  test('rejects migration without operations array', () => {
    expect(() => validateMigration({})).toThrow('operations');
  });

  test('rejects operation without action', () => {
    const migration = { operations: [{ type: 'taskQueues', data: { friendlyName: 'Q' } }] };
    expect(() => validateMigration(migration)).toThrow('action');
  });

  test('rejects operation without type', () => {
    const migration = { operations: [{ action: 'create', data: { friendlyName: 'Q' } }] };
    expect(() => validateMigration(migration)).toThrow('type');
  });

  test('rejects create without data.friendlyName', () => {
    const migration = { operations: [{ action: 'create', type: 'taskQueues', data: { targetWorkers: '1==1' } }] };
    expect(() => validateMigration(migration)).toThrow('friendlyName');
  });

  test('rejects update without match.friendlyName', () => {
    const migration = { operations: [{ action: 'update', type: 'taskQueues', data: { targetWorkers: '1==1' } }] };
    expect(() => validateMigration(migration)).toThrow('match');
  });

  test('rejects update without data', () => {
    const migration = { operations: [{ action: 'update', type: 'taskQueues', match: { friendlyName: 'Q' } }] };
    expect(() => validateMigration(migration)).toThrow('data');
  });

  test('rejects invalid resource type', () => {
    const migration = { operations: [{ action: 'create', type: 'invalid', data: { friendlyName: 'Q' } }] };
    expect(() => validateMigration(migration)).toThrow('type');
  });

  test('allows empty operations array (manual migration template)', () => {
    const migration = { operations: [] };
    expect(() => validateMigration(migration)).not.toThrow();
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npm test -- __tests__/migration/validator.test.js
```

**Step 3: Implement src/migration/validator.js**

```js
// src/migration/validator.js

const VALID_TYPES = new Set([
  'workspace', 'taskQueues', 'taskChannels', 'workflows', 'studioFlows', 'contentTemplates',
]);
const VALID_ACTIONS = new Set(['create', 'update', 'delete']);

export function validateMigration(migration) {
  if (!migration || !Array.isArray(migration.operations)) {
    throw new Error('Migration deve ter um campo "operations" como array');
  }

  migration.operations.forEach((op, i) => {
    const prefix = `Operation[${i}]`;

    if (!op.action || !VALID_ACTIONS.has(op.action)) {
      throw new Error(`${prefix}: "action" deve ser create, update ou delete`);
    }

    if (!op.type || !VALID_TYPES.has(op.type)) {
      throw new Error(`${prefix}: "type" deve ser um tipo valido (${[...VALID_TYPES].join(', ')})`);
    }

    if (op.action === 'create') {
      if (!op.data?.friendlyName && !op.data?.uniqueName) {
        throw new Error(`${prefix}: create requer "data" com "friendlyName" ou "uniqueName"`);
      }
    }

    if (op.action === 'update') {
      if (!op.match?.friendlyName && !op.match?.uniqueName) {
        throw new Error(`${prefix}: update requer "match" com "friendlyName" ou "uniqueName"`);
      }
      if (!op.data || Object.keys(op.data).length === 0) {
        throw new Error(`${prefix}: update requer "data" com pelo menos um campo`);
      }
    }

    if (op.action === 'delete') {
      if (!op.match?.friendlyName && !op.match?.uniqueName) {
        throw new Error(`${prefix}: delete requer "match" com "friendlyName" ou "uniqueName"`);
      }
    }
  });
}
```

**Step 4: Run tests, verify pass**

```bash
npm test -- __tests__/migration/validator.test.js
```

**Step 5: Commit**

```bash
git add src/migration/validator.js __tests__/migration/validator.test.js
git commit -m "feat: add migration validator"
```

---

## Phase 3: Twilio Writers and Migration Executor

### Task 3.1: Twilio Writers (create/update/delete resources via API)

**Files:**
- Create: `__tests__/twilio/writers.test.js`
- Create: `src/twilio/writers.js`

**Step 1: Write failing tests**

```js
// __tests__/twilio/writers.test.js
import { jest } from '@jest/globals';

jest.unstable_mockModule('../../src/twilio/clients.js', () => ({
  createClient: jest.fn(),
}));

const { executeOperation } = await import('../../src/twilio/writers.js');
const { createClient } = await import('../../src/twilio/clients.js');

describe('executeOperation', () => {
  let mockApi;

  beforeEach(() => {
    jest.clearAllMocks();
    mockApi = {
      taskrouter: {
        v1: {
          workspaces: jest.fn(() => ({
            taskQueues: {
              create: jest.fn().mockResolvedValue({ sid: 'WQ_NEW', friendlyName: 'New Q' }),
              list: jest.fn().mockResolvedValue([{ sid: 'WQ1', friendlyName: 'Q1' }]),
            },
          })),
        },
      },
    };
    // Add update mock
    mockApi.taskrouter.v1.workspaces.list = jest.fn().mockResolvedValue([{ sid: 'WS1' }]);
  });

  test('create taskQueues returns new SID', async () => {
    const op = { action: 'create', type: 'taskQueues', data: { friendlyName: 'New Q', targetWorkers: '1==1' } };
    const result = await executeOperation(mockApi, op, 'WS1');
    expect(result.sid).toBe('WQ_NEW');
    expect(result.friendlyName).toBe('New Q');
  });

  test('throws on unsupported action', async () => {
    const op = { action: 'invalid', type: 'taskQueues', data: {} };
    await expect(executeOperation(mockApi, op, 'WS1')).rejects.toThrow('invalid');
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npm test -- __tests__/twilio/writers.test.js
```

**Step 3: Implement src/twilio/writers.js**

This module maps each (action, type) to a Twilio API call. Start with taskQueues, workflows, taskChannels, studioFlows, contentTemplates for create/update/delete.

```js
// src/twilio/writers.js

async function createTaskQueue(api, workspaceSid, data) {
  return api.taskrouter.v1.workspaces(workspaceSid).taskQueues.create(data);
}

async function updateTaskQueue(api, workspaceSid, sid, data) {
  return api.taskrouter.v1.workspaces(workspaceSid).taskQueues(sid).update(data);
}

async function deleteTaskQueue(api, workspaceSid, sid) {
  return api.taskrouter.v1.workspaces(workspaceSid).taskQueues(sid).remove();
}

async function createWorkflow(api, workspaceSid, data) {
  const payload = { ...data };
  if (typeof payload.configuration === 'object') {
    payload.configuration = JSON.stringify(payload.configuration);
  }
  return api.taskrouter.v1.workspaces(workspaceSid).workflows.create(payload);
}

async function updateWorkflow(api, workspaceSid, sid, data) {
  const payload = { ...data };
  if (typeof payload.configuration === 'object') {
    payload.configuration = JSON.stringify(payload.configuration);
  }
  return api.taskrouter.v1.workspaces(workspaceSid).workflows(sid).update(payload);
}

async function deleteWorkflow(api, workspaceSid, sid) {
  return api.taskrouter.v1.workspaces(workspaceSid).workflows(sid).remove();
}

async function createTaskChannel(api, workspaceSid, data) {
  return api.taskrouter.v1.workspaces(workspaceSid).taskChannels.create(data);
}

async function updateTaskChannel(api, workspaceSid, sid, data) {
  return api.taskrouter.v1.workspaces(workspaceSid).taskChannels(sid).update(data);
}

async function deleteTaskChannel(api, workspaceSid, sid) {
  return api.taskrouter.v1.workspaces(workspaceSid).taskChannels(sid).remove();
}

async function createStudioFlow(api, _wsSid, data) {
  const payload = { ...data, status: 'draft' };
  if (typeof payload.definition === 'object') {
    payload.definition = JSON.stringify(payload.definition);
  }
  return api.studio.v2.flows.create(payload);
}

async function updateStudioFlow(api, _wsSid, sid, data) {
  const payload = { ...data, status: 'published' };
  if (typeof payload.definition === 'object') {
    payload.definition = JSON.stringify(payload.definition);
  }
  return api.studio.v2.flows(sid).update(payload);
}

async function deleteStudioFlow(api, _wsSid, sid) {
  return api.studio.v2.flows(sid).remove();
}

async function createContentTemplate(api, _wsSid, data) {
  return api.content.v1.contents.create(data);
}

async function deleteContentTemplate(api, _wsSid, sid) {
  return api.content.v1.contents(sid).remove();
}

const WRITERS = {
  taskQueues: { create: createTaskQueue, update: updateTaskQueue, delete: deleteTaskQueue },
  workflows: { create: createWorkflow, update: updateWorkflow, delete: deleteWorkflow },
  taskChannels: { create: createTaskChannel, update: updateTaskChannel, delete: deleteTaskChannel },
  studioFlows: { create: createStudioFlow, update: updateStudioFlow, delete: deleteStudioFlow },
  contentTemplates: { create: createContentTemplate, update: null, delete: deleteContentTemplate },
};

async function findSidByName(api, type, name, workspaceSid) {
  let resources;
  switch (type) {
    case 'taskQueues':
      resources = await api.taskrouter.v1.workspaces(workspaceSid).taskQueues.list({ friendlyName: name, limit: 1 });
      break;
    case 'workflows':
      resources = await api.taskrouter.v1.workspaces(workspaceSid).workflows.list({ friendlyName: name, limit: 1 });
      break;
    case 'taskChannels':
      resources = await api.taskrouter.v1.workspaces(workspaceSid).taskChannels.list({ limit: 1000 });
      resources = resources.filter((r) => (r.friendlyName || r.uniqueName) === name);
      break;
    case 'studioFlows':
      resources = await api.studio.v2.flows.list({ limit: 1000 });
      resources = resources.filter((r) => r.friendlyName === name);
      break;
    case 'contentTemplates':
      resources = await api.content.v1.contents.list();
      resources = resources.filter((r) => (r.friendlyName || r.uniqueName) === name);
      break;
    default:
      return null;
  }
  return resources[0]?.sid || null;
}

export async function executeOperation(api, operation, workspaceSid) {
  const { action, type, match, data } = operation;
  const writer = WRITERS[type]?.[action];

  if (!writer) {
    throw new Error(`Acao "${action}" nao suportada para tipo "${type}"`);
  }

  if (action === 'create') {
    const result = await writer(api, workspaceSid, data);
    return { sid: result.sid, friendlyName: data.friendlyName || data.uniqueName };
  }

  if (action === 'update' || action === 'delete') {
    const name = match.friendlyName || match.uniqueName;
    const sid = await findSidByName(api, type, name, workspaceSid);
    if (!sid) {
      throw new Error(`Recurso "${name}" (${type}) nao encontrado no ambiente`);
    }
    if (action === 'update') {
      const result = await writer(api, workspaceSid, sid, data);
      return { sid: result.sid || sid, friendlyName: name };
    }
    await writer(api, workspaceSid, sid);
    return { sid, friendlyName: name, deleted: true };
  }

  throw new Error(`Acao desconhecida: ${action}`);
}
```

**Step 4: Run tests, verify pass**

```bash
npm test -- __tests__/twilio/writers.test.js
```

**Step 5: Commit**

```bash
git add src/twilio/writers.js __tests__/twilio/writers.test.js
git commit -m "feat: add Twilio writers (create/update/delete via API)"
```

---

### Task 3.2: Migration Executor (push logic)

**Files:**
- Create: `__tests__/migration/executor.test.js`
- Create: `src/migration/executor.js`

**Step 1: Write failing tests**

```js
// __tests__/migration/executor.test.js
import { jest } from '@jest/globals';

jest.unstable_mockModule('../../src/twilio/writers.js', () => ({
  executeOperation: jest.fn(),
}));

jest.unstable_mockModule('../../src/migration/resolver.js', () => ({
  resolveRefs: jest.fn((obj) => obj),
}));

const { executeMigration } = await import('../../src/migration/executor.js');
const { executeOperation } = await import('../../src/twilio/writers.js');
const { resolveRefs } = await import('../../src/migration/resolver.js');

describe('executeMigration', () => {
  beforeEach(() => jest.clearAllMocks());

  const state = { taskQueues: { resources: [] } };
  const mockApi = {};

  test('executes operations in order and collects results', async () => {
    executeOperation
      .mockResolvedValueOnce({ sid: 'WQ_NEW', friendlyName: 'Queue A' })
      .mockResolvedValueOnce({ sid: 'WW1', friendlyName: 'Workflow A' });

    const migration = {
      operations: [
        { action: 'create', type: 'taskQueues', data: { friendlyName: 'Queue A' } },
        { action: 'update', type: 'workflows', match: { friendlyName: 'Workflow A' }, data: { configuration: {} } },
      ],
    };

    const results = await executeMigration(mockApi, migration, state, 'WS1');
    expect(results).toHaveLength(2);
    expect(executeOperation).toHaveBeenCalledTimes(2);
  });

  test('adds created SIDs to runtimeSids for subsequent @ref resolution', async () => {
    executeOperation.mockResolvedValueOnce({ sid: 'WQ_NEW', friendlyName: 'Queue A' });
    resolveRefs.mockImplementation((obj) => obj);

    const migration = {
      operations: [
        { action: 'create', type: 'taskQueues', data: { friendlyName: 'Queue A' } },
      ],
    };

    await executeMigration(mockApi, migration, state, 'WS1');

    // resolveRefs should have been called with runtimeSids containing the new SID
    expect(resolveRefs).toHaveBeenCalledWith(
      expect.anything(),
      state,
      expect.objectContaining({ 'taskQueues:Queue A': 'WQ_NEW' }),
    );
  });

  test('stops on first error and reports it', async () => {
    executeOperation
      .mockResolvedValueOnce({ sid: 'WQ1', friendlyName: 'Q1' })
      .mockRejectedValueOnce(new Error('API Error'));

    const migration = {
      operations: [
        { action: 'create', type: 'taskQueues', data: { friendlyName: 'Q1' } },
        { action: 'create', type: 'taskQueues', data: { friendlyName: 'Q2' } },
        { action: 'create', type: 'taskQueues', data: { friendlyName: 'Q3' } },
      ],
    };

    await expect(executeMigration(mockApi, migration, state, 'WS1')).rejects.toThrow('API Error');
    expect(executeOperation).toHaveBeenCalledTimes(2);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npm test -- __tests__/migration/executor.test.js
```

**Step 3: Implement src/migration/executor.js**

```js
// src/migration/executor.js
import { resolveRefs } from './resolver.js';
import { executeOperation } from '../twilio/writers.js';

export async function executeMigration(api, migration, state, workspaceSid, { dryRun = false } = {}) {
  const runtimeSids = {};
  const results = [];

  for (const operation of migration.operations) {
    const resolved = resolveRefs(operation, state, runtimeSids);

    if (dryRun) {
      results.push({ operation: resolved, status: 'dry-run' });
      continue;
    }

    const result = await executeOperation(api, resolved, workspaceSid);
    results.push({ operation: resolved, status: 'ok', result });

    // Track created SIDs for subsequent @ref resolution
    if (operation.action === 'create' && result.sid) {
      const name = operation.data.friendlyName || operation.data.uniqueName;
      runtimeSids[`${operation.type}:${name}`] = result.sid;
    }
  }

  return results;
}
```

**Step 4: Run tests, verify pass**

```bash
npm test -- __tests__/migration/executor.test.js
```

**Step 5: Commit**

```bash
git add src/migration/executor.js __tests__/migration/executor.test.js
git commit -m "feat: add migration executor (push logic with @ref resolution)"
```

---

## Phase 4: CLI Commands

### Task 4.1: Display Utility

**Files:**
- Create: `src/utils/display.js`

**Step 1: Implement minimal display helpers**

```js
// src/utils/display.js
import chalk from 'chalk';

export function success(msg) {
  console.log(chalk.green(`✓ ${msg}`));
}

export function error(msg) {
  console.error(chalk.red(`✗ ${msg}`));
}

export function info(msg) {
  console.log(chalk.cyan(msg));
}

export function warn(msg) {
  console.log(chalk.yellow(msg));
}
```

**Step 2: Commit**

```bash
git add src/utils/display.js
git commit -m "feat: add minimal display utility (chalk helpers)"
```

---

### Task 4.2: Migration New Command

**Files:**
- Create: `__tests__/commands/migration.test.js`
- Create: `src/commands/migration.js`

**Step 1: Write failing tests**

```js
// __tests__/commands/migration.test.js
import { jest } from '@jest/globals';

jest.unstable_mockModule('fs-extra', () => ({
  ensureDir: jest.fn(),
  writeJson: jest.fn(),
  readdir: jest.fn(),
}));

jest.unstable_mockModule('../../src/migration/tracker.js', () => ({
  listMigrations: jest.fn(),
}));

const { createMigration } = await import('../../src/commands/migration.js');
const { ensureDir, writeJson } = await import('fs-extra');

describe('createMigration', () => {
  beforeEach(() => jest.clearAllMocks());

  test('creates migration file with timestamp and slugified description', async () => {
    const result = await createMigration('/env/dev', 'add support queue');
    expect(ensureDir).toHaveBeenCalledWith('/env/dev/migrations');
    expect(writeJson).toHaveBeenCalledWith(
      expect.stringMatching(/\/env\/dev\/migrations\/\d{8}_\d{6}_add-support-queue\.json$/),
      expect.objectContaining({
        description: 'add support queue',
        source: 'manual',
        operations: [],
        rollback: [],
      }),
      { spaces: 2 },
    );
    expect(result).toMatch(/add-support-queue\.json$/);
  });
});
```

**Step 2: Run tests, verify fail**

```bash
npm test -- __tests__/commands/migration.test.js
```

**Step 3: Implement src/commands/migration.js**

```js
// src/commands/migration.js
import { ensureDir, writeJson } from 'fs-extra';
import path from 'node:path';

import { listMigrations } from '../migration/tracker.js';
import { info, success } from '../utils/display.js';

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function timestamp() {
  const now = new Date();
  const d = now.toISOString().replace(/[-:T]/g, '').slice(0, 8);
  const t = now.toISOString().replace(/[-:T]/g, '').slice(8, 14);
  return `${d}_${t}`;
}

export async function createMigration(dir, description) {
  const migrationsDir = path.join(dir, 'migrations');
  await ensureDir(migrationsDir);

  const slug = slugify(description);
  const fileName = `${timestamp()}_${slug}.json`;
  const filePath = path.join(migrationsDir, fileName);

  await writeJson(
    filePath,
    {
      description,
      createdAt: new Date().toISOString(),
      source: 'manual',
      operations: [],
      rollback: [],
    },
    { spaces: 2 },
  );

  return fileName;
}

export async function listMigrationsCommand(dir) {
  const migrations = await listMigrations(dir);

  if (migrations.length === 0) {
    info('Nenhuma migration encontrada.');
    return;
  }

  for (const m of migrations) {
    const status = m.status === 'applied' ? '✓ applied' : '○ pending';
    const date = m.appliedAt ? ` (${m.appliedAt})` : '';
    console.log(`  ${status}  ${m.name}${date}`);
  }
}
```

**Step 4: Run tests, verify pass**

```bash
npm test -- __tests__/commands/migration.test.js
```

**Step 5: Commit**

```bash
git add src/commands/migration.js __tests__/commands/migration.test.js
git commit -m "feat: add migration new and migration list commands"
```

---

### Task 4.3: Pull Command

**Files:**
- Create: `src/commands/pull.js`

This command orchestrates: fetch cloud → diff with state → generate migration → save migration → update state. No dedicated unit test for the orchestrator — it's covered by integration of its parts. The individual modules (fetchers, diffResources, generateMigration, state writer, tracker) are already tested.

**Step 1: Implement src/commands/pull.js**

```js
// src/commands/pull.js
import { ensureDir, writeJson } from 'fs-extra';
import path from 'node:path';

import { loadEnvFile } from '../config.js';
import { generateMigration } from '../migration/generator.js';
import { markApplied } from '../migration/tracker.js';
import { readAllStates } from '../state/reader.js';
import { writeState } from '../state/writer.js';
import { createClient } from '../twilio/clients.js';
import { fetchAllResources, fetchResource, RESOURCE_TYPES } from '../twilio/fetchers.js';
import { info, success, warn } from '../utils/display.js';

function timestamp() {
  const now = new Date();
  const d = now.toISOString().replace(/[-:T]/g, '').slice(0, 8);
  const t = now.toISOString().replace(/[-:T]/g, '').slice(8, 14);
  return `${d}_${t}`;
}

export async function pullCommand(options) {
  const { dir, envFile, resources } = options;
  const account = loadEnvFile(envFile);
  const types = resources
    ? resources.split(',').map((t) => t.trim())
    : RESOURCE_TYPES.filter((t) => t !== 'workspace');

  info(`Baixando recursos do cloud...`);

  // Fetch from cloud
  const cloudData = {};
  for (const type of types) {
    cloudData[type] = await fetchResource(account, type);
  }

  // Read local state
  const localStates = await readAllStates(dir);

  // Generate migration
  const migration = generateMigration(cloudData, localStates, types);

  if (!migration) {
    success('Nenhuma alteracao detectada.');
    return;
  }

  // Save migration file
  const migrationsDir = path.join(dir, 'migrations');
  await ensureDir(migrationsDir);
  const fileName = `${timestamp()}_pull-changes.json`;
  await writeJson(path.join(migrationsDir, fileName), migration, { spaces: 2 });

  // Mark as applied (cloud state is already in sync)
  await markApplied(dir, fileName);

  // Update local state with cloud data
  for (const type of types) {
    const resources = Array.isArray(cloudData[type]) ? cloudData[type] : cloudData[type] ? [cloudData[type]] : [];
    await writeState(dir, type, resources);
  }

  success(`Migration gerada: ${fileName}`);
  info(`${migration.operations.length} operacao(oes) detectada(s).`);
  for (const op of migration.operations) {
    const name = op.data?.friendlyName || op.match?.friendlyName || '?';
    console.log(`  ${op.action} ${op.type}: ${name}`);
  }
}
```

**Step 2: Commit**

```bash
git add src/commands/pull.js
git commit -m "feat: add pull command (fetch cloud, diff, generate migration)"
```

---

### Task 4.4: Push Command

**Files:**
- Create: `src/commands/push.js`

**Step 1: Implement src/commands/push.js**

```js
// src/commands/push.js
import { readJson } from 'fs-extra';
import path from 'node:path';

import { loadEnvFile } from '../config.js';
import { executeMigration } from '../migration/executor.js';
import { getPendingMigrations, markApplied, readMigrationFile } from '../migration/tracker.js';
import { validateMigration } from '../migration/validator.js';
import { readAllStates } from '../state/reader.js';
import { writeState } from '../state/writer.js';
import { createClient } from '../twilio/clients.js';
import { fetchResource } from '../twilio/fetchers.js';
import { error, info, success, warn } from '../utils/display.js';

export async function pushCommand(options) {
  const { dir, envFile, dryRun } = options;
  const account = loadEnvFile(envFile);
  const api = createClient(account);

  // Get workspace SID
  const workspace = await fetchResource(account, 'workspace');
  const workspaceSid = workspace?.sid;

  // Get pending migrations
  const pending = await getPendingMigrations(dir);

  if (pending.length === 0) {
    success('Nenhuma migration pendente.');
    return;
  }

  info(`${pending.length} migration(s) pendente(s)${dryRun ? ' (dry-run)' : ''}:`);
  for (const name of pending) console.log(`  ○ ${name}`);
  console.log();

  const state = await readAllStates(dir);

  for (const name of pending) {
    info(`Aplicando: ${name}...`);
    const migration = await readMigrationFile(dir, name);
    validateMigration(migration);

    const results = await executeMigration(api, migration, state, workspaceSid, { dryRun });

    for (const r of results) {
      const opName = r.operation.data?.friendlyName || r.operation.match?.friendlyName || '?';
      if (dryRun) {
        console.log(`  [dry-run] ${r.operation.action} ${r.operation.type}: ${opName}`);
      } else {
        console.log(`  ✓ ${r.operation.action} ${r.operation.type}: ${opName} (${r.result?.sid || 'ok'})`);

        // Update state with new/updated SIDs
        if (r.result?.sid && r.operation.action === 'create') {
          const type = r.operation.type;
          if (!state[type]) state[type] = { resources: [] };
          state[type].resources.push({ sid: r.result.sid, ...r.operation.data });
          await writeState(dir, type, state[type].resources);
        }
      }
    }

    if (!dryRun) {
      await markApplied(dir, name);
      success(`Aplicada: ${name}`);
    }
  }

  if (dryRun) {
    warn('Dry-run completo. Nenhuma alteracao foi aplicada.');
  } else {
    success('Todas as migrations foram aplicadas.');
  }
}
```

**Step 2: Commit**

```bash
git add src/commands/push.js
git commit -m "feat: add push command (apply pending migrations)"
```

---

### Task 4.5: Diff Command

**Files:**
- Create: `src/commands/diff.js`

**Step 1: Implement src/commands/diff.js**

```js
// src/commands/diff.js
import chalk from 'chalk';

import { loadEnvFile } from '../config.js';
import { diffResources } from '../diff/compare.js';
import { readAllStates } from '../state/reader.js';
import { fetchResource, RESOURCE_TYPES } from '../twilio/fetchers.js';
import { info, success } from '../utils/display.js';

export async function diffCommand(options) {
  const { dir, envFile } = options;
  const account = loadEnvFile(envFile);
  const types = RESOURCE_TYPES.filter((t) => t !== 'workspace');

  info('Comparando state local vs cloud...');

  const localStates = await readAllStates(dir);
  let totalDiffs = 0;

  for (const type of types) {
    const cloudResources = await fetchResource(account, type);
    const localResources = localStates[type]?.resources || [];
    const cloud = Array.isArray(cloudResources) ? cloudResources : cloudResources ? [cloudResources] : [];
    const ops = diffResources(cloud, localResources);

    if (ops.length === 0) continue;

    console.log(chalk.bold(`\n${type}:`));
    for (const op of ops) {
      const name = op.data?.friendlyName || op.match?.friendlyName || '?';
      const color = op.action === 'create' ? 'green' : op.action === 'delete' ? 'red' : 'yellow';
      console.log(chalk[color](`  ${op.action}: ${name}`));
      if (op.action === 'update' && op.data) {
        for (const [key, val] of Object.entries(op.data)) {
          console.log(chalk.dim(`    ${key}: ${JSON.stringify(val)}`));
        }
      }
    }
    totalDiffs += ops.length;
  }

  if (totalDiffs === 0) {
    success('Nenhuma diferenca encontrada.');
  } else {
    info(`\n${totalDiffs} diferenca(s) encontrada(s).`);
  }
}
```

**Step 2: Commit**

```bash
git add src/commands/diff.js
git commit -m "feat: add diff command (compare local state vs cloud)"
```

---

### Task 4.6: Revert Command

**Files:**
- Create: `src/commands/revert.js`

**Step 1: Implement src/commands/revert.js**

```js
// src/commands/revert.js
import { loadEnvFile } from '../config.js';
import { executeMigration } from '../migration/executor.js';
import { readMigrationFile, unmarkApplied } from '../migration/tracker.js';
import { readAllStates, readMigrationsTracker } from '../state/reader.js';
import { createClient } from '../twilio/clients.js';
import { fetchResource } from '../twilio/fetchers.js';
import { error, info, success } from '../utils/display.js';

export async function revertCommand(options) {
  const { dir, envFile, migrationName } = options;
  const account = loadEnvFile(envFile);
  const api = createClient(account);

  const workspace = await fetchResource(account, 'workspace');
  const workspaceSid = workspace?.sid;

  const tracker = await readMigrationsTracker(dir);

  if (tracker.applied.length === 0) {
    info('Nenhuma migration aplicada para reverter.');
    return;
  }

  const targetName = migrationName || tracker.applied[tracker.applied.length - 1].name;
  const isApplied = tracker.applied.some((a) => a.name === targetName);

  if (!isApplied) {
    error(`Migration "${targetName}" nao esta como applied.`);
    return;
  }

  info(`Revertendo: ${targetName}...`);
  const migration = await readMigrationFile(dir, targetName);

  if (!migration.rollback || migration.rollback.length === 0) {
    error('Migration nao possui rollback definido.');
    return;
  }

  const state = await readAllStates(dir);
  const rollbackMigration = { operations: migration.rollback };
  const results = await executeMigration(api, rollbackMigration, state, workspaceSid);

  for (const r of results) {
    const opName = r.operation.data?.friendlyName || r.operation.match?.friendlyName || '?';
    console.log(`  ✓ ${r.operation.action} ${r.operation.type}: ${opName}`);
  }

  await unmarkApplied(dir, targetName);
  success(`Revertida: ${targetName}`);
}
```

**Step 2: Commit**

```bash
git add src/commands/revert.js
git commit -m "feat: add revert command (apply rollback operations)"
```

---

### Task 4.7: CLI Entry Point

**Files:**
- Rewrite: `src/index.js`

**Step 1: Rewrite src/index.js**

```js
#!/usr/bin/env node
import { Command } from 'commander';

import { diffCommand } from './commands/diff.js';
import { createMigration, listMigrationsCommand } from './commands/migration.js';
import { pullCommand } from './commands/pull.js';
import { pushCommand } from './commands/push.js';
import { revertCommand } from './commands/revert.js';
import { error, success } from './utils/display.js';

const program = new Command();

program
  .name('tam')
  .description('Twilio Account Migrate — Gerenciamento de recursos Twilio via migrations')
  .version('3.0.0');

program
  .command('pull')
  .description('Baixar recursos do cloud, atualizar state e gerar migration')
  .requiredOption('--dir <path>', 'Diretorio do ambiente')
  .requiredOption('--env-file <path>', 'Caminho para arquivo .env com credenciais')
  .option('--resources <types>', 'Tipos de recursos separados por virgula')
  .action(async (opts) => {
    await pullCommand(opts);
  });

program
  .command('push')
  .description('Aplicar migrations pendentes no cloud')
  .requiredOption('--dir <path>', 'Diretorio do ambiente')
  .requiredOption('--env-file <path>', 'Caminho para arquivo .env com credenciais')
  .option('--dry-run', 'Mostrar o que seria feito sem executar')
  .action(async (opts) => {
    await pushCommand(opts);
  });

program
  .command('diff')
  .description('Comparar state local vs cloud (sem gerar migration)')
  .requiredOption('--dir <path>', 'Diretorio do ambiente')
  .requiredOption('--env-file <path>', 'Caminho para arquivo .env com credenciais')
  .action(async (opts) => {
    await diffCommand(opts);
  });

program
  .command('revert [migration-name]')
  .description('Reverter a ultima migration aplicada (ou uma especifica)')
  .requiredOption('--dir <path>', 'Diretorio do ambiente')
  .requiredOption('--env-file <path>', 'Caminho para arquivo .env com credenciais')
  .action(async (migrationName, opts) => {
    await revertCommand({ ...opts, migrationName });
  });

const migration = program
  .command('migration')
  .description('Gerenciar migrations');

migration
  .command('new <description>')
  .description('Criar migration manual vazia')
  .requiredOption('--dir <path>', 'Diretorio do ambiente')
  .action(async (description, opts) => {
    const fileName = await createMigration(opts.dir, description);
    success(`Migration criada: ${fileName}`);
  });

migration
  .command('list')
  .description('Listar migrations e status')
  .requiredOption('--dir <path>', 'Diretorio do ambiente')
  .action(async (opts) => {
    await listMigrationsCommand(opts.dir);
  });

program.parseAsync().catch((err) => {
  error(err.message);
  process.exit(1);
});
```

**Step 2: Update package.json version and remove old binary name**

In `package.json`, update:
- `"version": "3.0.0"`
- Remove `"twilio-dashboard"` from `bin`
- Remove `inquirer` and `ora` from dependencies (if not already done)

**Step 3: Run lint and fix any issues**

```bash
npm run lint
npm run format
```

**Step 4: Run all tests**

```bash
npm test
```

Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/index.js package.json
git commit -m "feat: rewrite CLI entry point with new migration commands (v3.0.0)"
```

---

## Phase 5: SID Replace (adapt existing)

### Task 5.1: Verify SID Replace module

**Files:**
- Create: `__tests__/sid/replace.test.js`

The `src/sid/replace.js` was copied from `src/utils/replaceSids.js`. Write a test to confirm it works in the new location.

**Step 1: Write test**

```js
// __tests__/sid/replace.test.js
import { describe, expect, test } from '@jest/globals';

import { buildSidPairs, deepReplaceSids, replaceSidsInJsonString } from '../../src/sid/replace.js';

describe('buildSidPairs', () => {
  test('extracts pairs sorted by length (longest first)', () => {
    const mapping = {
      taskrouter: {
        taskQueues: { WQ123: 'WQ456', WQ1234567890: 'WQ0987654321' },
      },
    };
    const pairs = buildSidPairs(mapping);
    expect(pairs[0][0]).toBe('WQ1234567890');
    expect(pairs[1][0]).toBe('WQ123');
  });
});

describe('replaceSidsInJsonString', () => {
  test('replaces all SIDs in a JSON string', () => {
    const mapping = { taskrouter: { taskQueues: { WQ111: 'WQ999' } } };
    const result = replaceSidsInJsonString('{"queue":"WQ111"}', mapping);
    expect(result).toBe('{"queue":"WQ999"}');
  });
});

describe('deepReplaceSids', () => {
  test('replaces SIDs recursively in objects', () => {
    const mapping = { taskrouter: { taskQueues: { WQ111: 'WQ999' } } };
    const obj = { config: { targets: [{ queue: 'WQ111' }] } };
    const result = deepReplaceSids(obj, mapping);
    expect(result.config.targets[0].queue).toBe('WQ999');
  });
});
```

**Step 2: Run tests**

```bash
npm test -- __tests__/sid/replace.test.js
```

Expected: PASS

**Step 3: Commit**

```bash
git add __tests__/sid/replace.test.js
git commit -m "test: verify SID replace module in new location"
```

---

## Phase 6: Final Cleanup and Documentation

### Task 6.1: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

Update the CLAUDE.md to reflect the new architecture, commands, directory structure, and conventions. Remove references to dashboard, cache, accounts encryption, deploy, vars, search, etc.

**Step 1: Rewrite CLAUDE.md** with new project overview, architecture, commands, and conventions.

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for v3.0.0 migration system"
```

---

### Task 6.2: Run full test suite and lint

**Step 1: Run all tests**

```bash
npm test
```

**Step 2: Run lint**

```bash
npm run lint
```

**Step 3: Run format**

```bash
npm run format
```

**Step 4: Fix any issues, commit**

```bash
git add -A
git commit -m "chore: fix lint and formatting issues"
```

---

### Task 6.3: Build verification

**Step 1: Run build**

```bash
npm run build
```

**Step 2: Test CLI help**

```bash
node dist/index.js --help
node dist/index.js pull --help
node dist/index.js push --help
node dist/index.js migration --help
```

**Step 3: Commit if build script needs updates**

```bash
git add -A
git commit -m "chore: verify build works with new structure"
```

---

## Summary

| Phase | Tasks | Focus |
|-------|-------|-------|
| 0 | 0.1 | Project cleanup, restructure |
| 1 | 1.1–1.5 | Core utilities (config, state, twilio clients/fetchers) |
| 2 | 2.1–2.6 | Diff, resolver, rollback, tracker, generator, validator |
| 3 | 3.1–3.2 | Twilio writers, migration executor |
| 4 | 4.1–4.7 | CLI commands (display, migration, pull, push, diff, revert, entry point) |
| 5 | 5.1 | SID replace verification |
| 6 | 6.1–6.3 | Documentation, lint, build |

**Total: 20 tasks, ~33 business rules covered by TDD tests**
