# v4.0 Features Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 7 features to tam CLI: API delay, partially applied migrations, partial rollback, Studio Flow widget granular updates, cross-environment diff command, serverless resource fetch, and auto-replace SIDs by @ref.

**Architecture:** Incremental implementation in dependency order. Group A (execution infrastructure: F3→F4→F5) modifies executor/tracker/commands. Group B (new capabilities: F1+F2) adds widget-level diffing and a new CLI command. Group C (SID portability: F6→F7) adds serverless fetch and automatic SID→@ref replacement. All features use TDD with Jest ESM mocking patterns already established in the codebase.

**Tech Stack:** Node.js, ES Modules, Jest, Commander.js, fs-extra, chalk

---

## Task 1: API Operation Delay (Feature 3)

**Files:**
- Modify: `src/migration/executor.js` (all 34 lines — small file)
- Modify: `__tests__/migration/executor.test.js`

**Step 1: Write the failing test for delay between operations**

Add to `__tests__/migration/executor.test.js`:

```js
test('waits 1 second between API operations (not after last)', async () => {
  const delays = [];
  const originalSetTimeout = globalThis.setTimeout;
  jest.spyOn(globalThis, 'setTimeout').mockImplementation((fn, ms) => {
    delays.push(ms);
    return originalSetTimeout(fn, 0); // don't actually wait
  });

  executeOperation
    .mockResolvedValueOnce({ sid: 'WQ1', friendlyName: 'Q1' })
    .mockResolvedValueOnce({ sid: 'WQ2', friendlyName: 'Q2' })
    .mockResolvedValueOnce({ sid: 'WQ3', friendlyName: 'Q3' });

  const migration = {
    operations: [
      { action: 'create', type: 'taskQueues', data: { friendlyName: 'Q1' } },
      { action: 'create', type: 'taskQueues', data: { friendlyName: 'Q2' } },
      { action: 'create', type: 'taskQueues', data: { friendlyName: 'Q3' } },
    ],
  };

  await executeMigration(mockApi, migration, state, 'WS1');
  // 2 delays (between op1→op2 and op2→op3), not after op3
  expect(delays.filter((d) => d === 1000)).toHaveLength(2);

  globalThis.setTimeout.mockRestore();
});

test('no delay in dry-run mode', async () => {
  const delays = [];
  jest.spyOn(globalThis, 'setTimeout').mockImplementation((fn, ms) => {
    delays.push(ms);
    return fn();
  });

  const migration = {
    operations: [
      { action: 'create', type: 'taskQueues', data: { friendlyName: 'Q1' } },
      { action: 'create', type: 'taskQueues', data: { friendlyName: 'Q2' } },
    ],
  };

  await executeMigration(mockApi, migration, state, 'WS1', { dryRun: true });
  expect(delays.filter((d) => d === 1000)).toHaveLength(0);

  globalThis.setTimeout.mockRestore();
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern=executor.test`
Expected: FAIL — no delay implemented yet

**Step 3: Implement the delay in executor.js**

Replace `src/migration/executor.js` entirely:

```js
import { executeOperation } from '../twilio/writers.js';

import { resolveRefs } from './resolver.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function executeMigration(
  api,
  migration,
  state,
  workspaceSid,
  { dryRun = false } = {},
) {
  const runtimeSids = {};
  const results = [];

  for (let i = 0; i < migration.operations.length; i++) {
    const operation = migration.operations[i];
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

    // Wait 1s between API operations (not after last)
    if (i < migration.operations.length - 1) {
      await sleep(1000);
    }
  }

  return results;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern=executor.test`
Expected: ALL PASS

**Step 5: Run full test suite**

Run: `npm test`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add src/migration/executor.js __tests__/migration/executor.test.js
git commit -m "feat: add 1s delay between API operations in executor"
```

---

## Task 2: Partially Applied — Tracker Functions (Feature 4, Part 1)

**Files:**
- Modify: `src/migration/tracker.js:11-48`
- Modify: `__tests__/migration/tracker.test.js`

**Step 1: Write failing tests for new tracker functions**

Add new describe blocks to `__tests__/migration/tracker.test.js`:

```js
// Import the new functions alongside existing ones:
const {
  getPendingMigrations,
  markApplied,
  listMigrations,
  markPartiallyApplied,
  getPartiallyApplied,
  promotePartialToApplied,
  clearPartiallyApplied,
} = await import('../../src/migration/tracker.js');
const { readMigrationsTracker } = await import('../../src/state/reader.js');
const { writeMigrationsTracker } = await import('../../src/state/writer.js');
const { readdir } = mockFsExtra;

// Add after existing describe blocks:

describe('markPartiallyApplied', () => {
  beforeEach(() => jest.clearAllMocks());

  test('sets partiallyApplied field in tracker', async () => {
    readMigrationsTracker.mockResolvedValue({ applied: [] });
    await markPartiallyApplied('/env/dev', 'mig.json', 5, 10, 'API Error');
    expect(writeMigrationsTracker).toHaveBeenCalledWith('/env/dev', {
      applied: [],
      partiallyApplied: {
        name: 'mig.json',
        startedAt: expect.any(String),
        lastOperationIndex: 5,
        totalOperations: 10,
        error: 'API Error',
      },
    });
  });

  test('preserves existing startedAt on updates', async () => {
    readMigrationsTracker.mockResolvedValue({
      applied: [],
      partiallyApplied: {
        name: 'mig.json',
        startedAt: '2026-01-01T00:00:00.000Z',
        lastOperationIndex: 3,
        totalOperations: 10,
        error: 'old error',
      },
    });
    await markPartiallyApplied('/env/dev', 'mig.json', 5, 10, 'new error');
    expect(writeMigrationsTracker).toHaveBeenCalledWith('/env/dev', {
      applied: [],
      partiallyApplied: expect.objectContaining({
        startedAt: '2026-01-01T00:00:00.000Z',
        lastOperationIndex: 5,
        error: 'new error',
      }),
    });
  });
});

describe('getPartiallyApplied', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns partiallyApplied when present', async () => {
    const partial = { name: 'mig.json', lastOperationIndex: 5, totalOperations: 10 };
    readMigrationsTracker.mockResolvedValue({ applied: [], partiallyApplied: partial });
    const result = await getPartiallyApplied('/env/dev');
    expect(result).toEqual(partial);
  });

  test('returns null when no partiallyApplied', async () => {
    readMigrationsTracker.mockResolvedValue({ applied: [] });
    const result = await getPartiallyApplied('/env/dev');
    expect(result).toBeNull();
  });
});

describe('promotePartialToApplied', () => {
  beforeEach(() => jest.clearAllMocks());

  test('moves partiallyApplied to applied list and removes field', async () => {
    readMigrationsTracker.mockResolvedValue({
      applied: [{ name: 'old.json', appliedAt: '2026-01-01T00:00:00.000Z' }],
      partiallyApplied: {
        name: 'mig.json',
        startedAt: '2026-02-01T00:00:00.000Z',
        lastOperationIndex: 9,
        totalOperations: 10,
      },
    });
    await promotePartialToApplied('/env/dev');
    expect(writeMigrationsTracker).toHaveBeenCalledWith('/env/dev', {
      applied: [
        { name: 'old.json', appliedAt: '2026-01-01T00:00:00.000Z' },
        { name: 'mig.json', appliedAt: expect.any(String) },
      ],
    });
  });
});

describe('clearPartiallyApplied', () => {
  beforeEach(() => jest.clearAllMocks());

  test('removes partiallyApplied field from tracker', async () => {
    readMigrationsTracker.mockResolvedValue({
      applied: [],
      partiallyApplied: { name: 'mig.json', lastOperationIndex: 5, totalOperations: 10 },
    });
    await clearPartiallyApplied('/env/dev');
    expect(writeMigrationsTracker).toHaveBeenCalledWith('/env/dev', { applied: [] });
  });
});

describe('getPendingMigrations with partiallyApplied', () => {
  beforeEach(() => jest.clearAllMocks());

  test('excludes partiallyApplied migration from pending list', async () => {
    readdir.mockResolvedValue(['mig1.json', 'mig2.json', 'mig3.json']);
    readMigrationsTracker.mockResolvedValue({
      applied: [{ name: 'mig1.json', appliedAt: '2026-01-01T00:00:00.000Z' }],
      partiallyApplied: { name: 'mig2.json', lastOperationIndex: 5, totalOperations: 10 },
    });
    const pending = await getPendingMigrations('/env/dev');
    expect(pending).toEqual(['mig3.json']);
  });
});

describe('listMigrations with partiallyApplied', () => {
  beforeEach(() => jest.clearAllMocks());

  test('shows partially_applied status for partial migration', async () => {
    readdir.mockResolvedValue(['mig1.json', 'mig2.json']);
    readMigrationsTracker.mockResolvedValue({
      applied: [{ name: 'mig1.json', appliedAt: '2026-01-01T00:00:00.000Z' }],
      partiallyApplied: {
        name: 'mig2.json',
        startedAt: '2026-02-01T00:00:00.000Z',
        lastOperationIndex: 5,
        totalOperations: 10,
      },
    });
    const list = await listMigrations('/env/dev');
    expect(list[1]).toEqual({
      name: 'mig2.json',
      status: 'partially_applied',
      appliedAt: null,
      progress: '5/10',
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- --testPathPattern=tracker.test`
Expected: FAIL — functions not exported yet

**Step 3: Implement new tracker functions**

Add to `src/migration/tracker.js` (after existing exports, and update `getPendingMigrations` and `listMigrations`):

```js
// src/migration/tracker.js
import path from 'node:path';

import fsExtra from 'fs-extra';

const { ensureDir, readdir, readJson } = fsExtra;

import { readMigrationsTracker } from '../state/reader.js';
import { writeMigrationsTracker } from '../state/writer.js';

export async function getPendingMigrations(dir) {
  const migrationsDir = path.join(dir, 'migrations');
  await ensureDir(migrationsDir);
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.json')).sort();
  const tracker = await readMigrationsTracker(dir);
  const appliedNames = new Set(tracker.applied.map((a) => a.name));
  if (tracker.partiallyApplied) {
    appliedNames.add(tracker.partiallyApplied.name);
  }
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
  const partialName = tracker.partiallyApplied?.name;

  return files.map((name) => {
    if (name === partialName) {
      const p = tracker.partiallyApplied;
      return {
        name,
        status: 'partially_applied',
        appliedAt: null,
        progress: `${p.lastOperationIndex}/${p.totalOperations}`,
      };
    }
    return {
      name,
      status: appliedMap.has(name) ? 'applied' : 'pending',
      appliedAt: appliedMap.get(name) || null,
    };
  });
}

export async function readMigrationFile(dir, name) {
  return readJson(path.join(dir, 'migrations', name));
}

export async function markPartiallyApplied(dir, name, lastOperationIndex, totalOperations, error) {
  const tracker = await readMigrationsTracker(dir);
  const existing = tracker.partiallyApplied;
  tracker.partiallyApplied = {
    name,
    startedAt: existing?.name === name ? existing.startedAt : new Date().toISOString(),
    lastOperationIndex,
    totalOperations,
    error,
  };
  await writeMigrationsTracker(dir, tracker);
}

export async function getPartiallyApplied(dir) {
  const tracker = await readMigrationsTracker(dir);
  return tracker.partiallyApplied || null;
}

export async function promotePartialToApplied(dir) {
  const tracker = await readMigrationsTracker(dir);
  if (tracker.partiallyApplied) {
    tracker.applied.push({
      name: tracker.partiallyApplied.name,
      appliedAt: new Date().toISOString(),
    });
    delete tracker.partiallyApplied;
  }
  await writeMigrationsTracker(dir, tracker);
}

export async function clearPartiallyApplied(dir) {
  const tracker = await readMigrationsTracker(dir);
  delete tracker.partiallyApplied;
  await writeMigrationsTracker(dir, tracker);
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- --testPathPattern=tracker.test`
Expected: ALL PASS

**Step 5: Run full test suite**

Run: `npm test`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add src/migration/tracker.js __tests__/migration/tracker.test.js
git commit -m "feat: add partially applied tracking functions to tracker"
```

---

## Task 3: Partially Applied — Executor with startIndex and onProgress (Feature 4, Part 2)

**Files:**
- Modify: `src/migration/executor.js`
- Modify: `__tests__/migration/executor.test.js`

**Step 1: Write failing tests for startIndex and onProgress**

Add to `__tests__/migration/executor.test.js`:

```js
test('skips operations before startIndex', async () => {
  executeOperation
    .mockResolvedValueOnce({ sid: 'WQ3', friendlyName: 'Q3' });

  const migration = {
    operations: [
      { action: 'create', type: 'taskQueues', data: { friendlyName: 'Q1' } },
      { action: 'create', type: 'taskQueues', data: { friendlyName: 'Q2' } },
      { action: 'create', type: 'taskQueues', data: { friendlyName: 'Q3' } },
    ],
  };

  const results = await executeMigration(mockApi, migration, state, 'WS1', { startIndex: 2 });
  expect(executeOperation).toHaveBeenCalledTimes(1);
  expect(results).toHaveLength(1);
  expect(results[0].result.friendlyName).toBe('Q3');
});

test('calls onProgress after each successful operation', async () => {
  executeOperation
    .mockResolvedValueOnce({ sid: 'WQ1', friendlyName: 'Q1' })
    .mockResolvedValueOnce({ sid: 'WQ2', friendlyName: 'Q2' });

  const onProgress = jest.fn();
  const migration = {
    operations: [
      { action: 'create', type: 'taskQueues', data: { friendlyName: 'Q1' } },
      { action: 'create', type: 'taskQueues', data: { friendlyName: 'Q2' } },
    ],
  };

  await executeMigration(mockApi, migration, state, 'WS1', { onProgress });
  expect(onProgress).toHaveBeenCalledTimes(2);
  expect(onProgress).toHaveBeenCalledWith(0, 2);
  expect(onProgress).toHaveBeenCalledWith(1, 2);
});

test('does not call onProgress in dry-run mode', async () => {
  const onProgress = jest.fn();
  const migration = {
    operations: [
      { action: 'create', type: 'taskQueues', data: { friendlyName: 'Q1' } },
    ],
  };

  await executeMigration(mockApi, migration, state, 'WS1', { dryRun: true, onProgress });
  expect(onProgress).not.toHaveBeenCalled();
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- --testPathPattern=executor.test`
Expected: FAIL

**Step 3: Update executor.js to support startIndex and onProgress**

```js
import { executeOperation } from '../twilio/writers.js';

import { resolveRefs } from './resolver.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function executeMigration(
  api,
  migration,
  state,
  workspaceSid,
  { dryRun = false, startIndex = 0, onProgress } = {},
) {
  const runtimeSids = {};
  const results = [];

  for (let i = 0; i < migration.operations.length; i++) {
    const operation = migration.operations[i];
    const resolved = resolveRefs(operation, state, runtimeSids);

    if (i < startIndex) continue;

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

    if (onProgress) onProgress(i, migration.operations.length);

    // Wait 1s between API operations (not after last)
    if (i < migration.operations.length - 1) {
      await sleep(1000);
    }
  }

  return results;
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- --testPathPattern=executor.test`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/migration/executor.js __tests__/migration/executor.test.js
git commit -m "feat: add startIndex and onProgress to executor"
```

---

## Task 4: Partially Applied — Push Command Integration (Feature 4, Part 3)

**Files:**
- Modify: `src/commands/push.js`

**Step 1: Rewrite push command to handle partially_applied**

Replace `src/commands/push.js` entirely:

```js
import { loadEnvFile } from '../config.js';
import { executeMigration } from '../migration/executor.js';
import {
  getPartiallyApplied,
  getPendingMigrations,
  markApplied,
  markPartiallyApplied,
  promotePartialToApplied,
  readMigrationFile,
} from '../migration/tracker.js';
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

  const workspace = await fetchResource(account, 'workspace');
  const workspaceSid = workspace?.sid;

  // Check for partially applied migration
  const partial = await getPartiallyApplied(dir);
  const pending = await getPendingMigrations(dir);

  if (partial && !dryRun) {
    info(`Migration parcialmente aplicada encontrada: ${partial.name} (${partial.lastOperationIndex}/${partial.totalOperations})`);
    info(`Retomando da operacao ${partial.lastOperationIndex}...`);

    const state = await readAllStates(dir);
    const migration = await readMigrationFile(dir, partial.name);
    validateMigration(migration);

    try {
      const results = await executeMigration(api, migration, state, workspaceSid, {
        startIndex: partial.lastOperationIndex,
        onProgress: async (index, total) => {
          await markPartiallyApplied(dir, partial.name, index + 1, total, null);
        },
      });

      for (const r of results) {
        const opName = r.operation.data?.friendlyName || r.operation.match?.friendlyName || '?';
        console.log(
          `  ✓ ${r.operation.action} ${r.operation.type}: ${opName} (${r.result?.sid || 'ok'})`,
        );

        if (r.result?.sid && r.operation.action === 'create') {
          const type = r.operation.type;
          if (!state[type]) state[type] = { resources: [] };
          state[type].resources.push({ sid: r.result.sid, ...r.operation.data });
          await writeState(dir, type, state[type].resources);
        }
      }

      await promotePartialToApplied(dir);
      success(`Retomada completa: ${partial.name}`);
    } catch (err) {
      error(`Erro na operacao: ${err.message}`);
      return;
    }
  }

  if (pending.length === 0 && !partial) {
    success('Nenhuma migration pendente.');
    return;
  }

  if (pending.length > 0) {
    info(`${pending.length} migration(s) pendente(s)${dryRun ? ' (dry-run)' : ''}:`);
    for (const name of pending) console.log(`  ○ ${name}`);
    console.log();
  }

  const state = await readAllStates(dir);

  for (const name of pending) {
    info(`Aplicando: ${name}...`);
    const migration = await readMigrationFile(dir, name);
    validateMigration(migration);

    const totalOps = migration.operations.length;

    try {
      const results = await executeMigration(api, migration, state, workspaceSid, {
        dryRun,
        onProgress: dryRun
          ? undefined
          : async (index, total) => {
              await markPartiallyApplied(dir, name, index + 1, total, null);
            },
      });

      for (const r of results) {
        const opName = r.operation.data?.friendlyName || r.operation.match?.friendlyName || '?';
        if (dryRun) {
          console.log(`  [dry-run] ${r.operation.action} ${r.operation.type}: ${opName}`);
        } else {
          console.log(
            `  ✓ ${r.operation.action} ${r.operation.type}: ${opName} (${r.result?.sid || 'ok'})`,
          );

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
    } catch (err) {
      if (!dryRun) {
        error(`Erro ao aplicar ${name}: ${err.message}`);
        info(`Migration salva como partially_applied. Execute push novamente para retomar.`);
      }
      return;
    }
  }

  if (dryRun) {
    warn('Dry-run completo. Nenhuma alteracao foi aplicada.');
  } else if (pending.length > 0) {
    success('Todas as migrations foram aplicadas.');
  }
}
```

**Step 2: Run full test suite**

Run: `npm test`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add src/commands/push.js
git commit -m "feat: integrate partially_applied into push command with resume"
```

---

## Task 5: Partial Rollback (Feature 5)

**Files:**
- Modify: `src/commands/revert.js`
- Modify: `src/migration/tracker.js` (add `markRollbackProgress` and `getRollbackProgress` if needed — or reuse `partiallyApplied` fields)

**Step 1: Write failing tests for revert with partially_applied**

Create test structure (revert is not currently tested — create `__tests__/commands/revert.test.js`):

Note: Since revert.js has many dependencies, we test the logic by verifying the command's integration behavior. But the core logic is simpler — we need to test that revert correctly slices rollback operations for partial migrations.

Add to `__tests__/migration/tracker.test.js` the rollback tracking tests:

```js
describe('markPartiallyApplied with rollback fields', () => {
  beforeEach(() => jest.clearAllMocks());

  test('preserves rollback fields when passed', async () => {
    readMigrationsTracker.mockResolvedValue({
      applied: [],
      partiallyApplied: {
        name: 'mig.json',
        startedAt: '2026-01-01T00:00:00.000Z',
        lastOperationIndex: 34,
        totalOperations: 70,
        error: 'API Error',
      },
    });
    await markPartiallyApplied('/env/dev', 'mig.json', 34, 70, 'API Error', {
      rollbackInProgress: true,
      rollbackLastIndex: 20,
      rollbackTotal: 34,
    });
    expect(writeMigrationsTracker).toHaveBeenCalledWith('/env/dev', {
      applied: [],
      partiallyApplied: expect.objectContaining({
        rollbackInProgress: true,
        rollbackLastIndex: 20,
        rollbackTotal: 34,
      }),
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- --testPathPattern=tracker.test`
Expected: FAIL

**Step 3: Update markPartiallyApplied to support rollback fields**

In `src/migration/tracker.js`, update `markPartiallyApplied`:

```js
export async function markPartiallyApplied(
  dir,
  name,
  lastOperationIndex,
  totalOperations,
  error,
  rollbackInfo,
) {
  const tracker = await readMigrationsTracker(dir);
  const existing = tracker.partiallyApplied;
  tracker.partiallyApplied = {
    name,
    startedAt: existing?.name === name ? existing.startedAt : new Date().toISOString(),
    lastOperationIndex,
    totalOperations,
    error,
    ...(rollbackInfo || {}),
  };
  await writeMigrationsTracker(dir, tracker);
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- --testPathPattern=tracker.test`
Expected: ALL PASS

**Step 5: Rewrite revert command to handle partially_applied**

Replace `src/commands/revert.js`:

```js
import { loadEnvFile } from '../config.js';
import { executeMigration } from '../migration/executor.js';
import {
  clearPartiallyApplied,
  getPartiallyApplied,
  markPartiallyApplied,
  readMigrationFile,
  unmarkApplied,
} from '../migration/tracker.js';
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
  const partial = await getPartiallyApplied(dir);

  // Case 1: Rollback in progress — resume it
  if (partial?.rollbackInProgress) {
    info(`Retomando rollback de: ${partial.name} (${partial.rollbackLastIndex}/${partial.rollbackTotal})`);

    const migration = await readMigrationFile(dir, partial.name);
    const appliedCount = partial.lastOperationIndex;
    const rollbackOps = migration.rollback.slice(-(appliedCount)).reverse();
    // rollbackOps is ordered as: reverse of operations 0..(appliedCount-1)
    // We need to resume from rollbackLastIndex
    const rollbackMigration = { operations: rollbackOps };
    const state = await readAllStates(dir);

    try {
      await executeMigration(api, rollbackMigration, state, workspaceSid, {
        startIndex: partial.rollbackLastIndex,
        onProgress: async (index, total) => {
          await markPartiallyApplied(dir, partial.name, partial.lastOperationIndex, partial.totalOperations, partial.error, {
            rollbackInProgress: true,
            rollbackLastIndex: index + 1,
            rollbackTotal: partial.rollbackTotal,
          });
        },
      });

      await clearPartiallyApplied(dir);
      success(`Rollback completo: ${partial.name}`);
    } catch (err) {
      error(`Erro durante rollback: ${err.message}`);
      info('Execute revert novamente para retomar o rollback.');
    }
    return;
  }

  // Case 2: Partially applied migration — start rollback of applied operations
  if (partial && !partial.rollbackInProgress) {
    const targetName = partial.name;
    info(`Revertendo migration parcialmente aplicada: ${targetName} (${partial.lastOperationIndex}/${partial.totalOperations})`);

    const migration = await readMigrationFile(dir, targetName);

    if (!migration.rollback || migration.rollback.length === 0) {
      error('Migration nao possui rollback definido.');
      return;
    }

    const appliedCount = partial.lastOperationIndex;
    // rollback array is reversed relative to operations.
    // operations[0..appliedCount-1] were applied.
    // rollback is already the reverse of all operations.
    // We need rollback entries for operations 0..(appliedCount-1), in reverse order.
    // Since rollback[i] corresponds to operations[operations.length - 1 - i],
    // we need the last `appliedCount` entries of the rollback array.
    const rollbackOps = migration.rollback.slice(-appliedCount);
    const rollbackMigration = { operations: rollbackOps };
    const state = await readAllStates(dir);

    try {
      await executeMigration(api, rollbackMigration, state, workspaceSid, {
        onProgress: async (index, total) => {
          await markPartiallyApplied(dir, targetName, partial.lastOperationIndex, partial.totalOperations, partial.error, {
            rollbackInProgress: true,
            rollbackLastIndex: index + 1,
            rollbackTotal: appliedCount,
          });
        },
      });

      await clearPartiallyApplied(dir);
      success(`Revertida (parcial): ${targetName}`);
    } catch (err) {
      error(`Erro durante rollback: ${err.message}`);
      info('Execute revert novamente para retomar o rollback.');
    }
    return;
  }

  // Case 3: Normal revert of fully applied migration
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

**Step 6: Run full test suite**

Run: `npm test`
Expected: ALL PASS

**Step 7: Commit**

```bash
git add src/migration/tracker.js src/commands/revert.js __tests__/migration/tracker.test.js
git commit -m "feat: add partial rollback support for partially applied migrations"
```

---

## Task 6: Validator Update for widgetOps (Feature 1, Part 1)

**Files:**
- Modify: `src/migration/validator.js`
- Modify: `__tests__/migration/validator.test.js`

**Step 1: Write failing tests for widgetOps validation**

Add to `__tests__/migration/validator.test.js`:

```js
test('valid partial update with widgetOps passes', () => {
  const migration = {
    operations: [
      {
        action: 'update',
        type: 'studioFlows',
        match: { friendlyName: 'Main Flow' },
        mode: 'partial',
        widgetOps: [
          { action: 'create_widget', widget: 'new_step', data: { type: 'send-message' } },
          { action: 'update_widget', widget: 'old_step', data: { properties: {} } },
          { action: 'rename_widget', widget: 'old_name', newName: 'new_name' },
          { action: 'delete_widget', widget: 'unused' },
        ],
      },
    ],
  };
  expect(() => validateMigration(migration)).not.toThrow();
});

test('rejects widgetOps without mode partial', () => {
  const migration = {
    operations: [
      {
        action: 'update',
        type: 'studioFlows',
        match: { friendlyName: 'Flow' },
        data: { friendlyName: 'Flow' },
        widgetOps: [{ action: 'delete_widget', widget: 'x' }],
      },
    ],
  };
  expect(() => validateMigration(migration)).toThrow('mode');
});

test('rejects widgetOp without action', () => {
  const migration = {
    operations: [
      {
        action: 'update',
        type: 'studioFlows',
        match: { friendlyName: 'Flow' },
        mode: 'partial',
        widgetOps: [{ widget: 'x' }],
      },
    ],
  };
  expect(() => validateMigration(migration)).toThrow('action');
});

test('rejects widgetOp without widget name', () => {
  const migration = {
    operations: [
      {
        action: 'update',
        type: 'studioFlows',
        match: { friendlyName: 'Flow' },
        mode: 'partial',
        widgetOps: [{ action: 'delete_widget' }],
      },
    ],
  };
  expect(() => validateMigration(migration)).toThrow('widget');
});

test('rejects rename_widget without newName', () => {
  const migration = {
    operations: [
      {
        action: 'update',
        type: 'studioFlows',
        match: { friendlyName: 'Flow' },
        mode: 'partial',
        widgetOps: [{ action: 'rename_widget', widget: 'old' }],
      },
    ],
  };
  expect(() => validateMigration(migration)).toThrow('newName');
});

test('rejects widgetOps on non-studioFlows type', () => {
  const migration = {
    operations: [
      {
        action: 'update',
        type: 'taskQueues',
        match: { friendlyName: 'Q' },
        mode: 'partial',
        widgetOps: [{ action: 'delete_widget', widget: 'x' }],
      },
    ],
  };
  expect(() => validateMigration(migration)).toThrow('studioFlows');
});

test('partial mode update does not require data field', () => {
  const migration = {
    operations: [
      {
        action: 'update',
        type: 'studioFlows',
        match: { friendlyName: 'Flow' },
        mode: 'partial',
        widgetOps: [{ action: 'delete_widget', widget: 'x' }],
      },
    ],
  };
  expect(() => validateMigration(migration)).not.toThrow();
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- --testPathPattern=validator.test`
Expected: FAIL

**Step 3: Update validator.js**

Replace `src/migration/validator.js`:

```js
const VALID_TYPES = new Set([
  'workspace',
  'taskQueues',
  'taskChannels',
  'workflows',
  'studioFlows',
  'contentTemplates',
]);
const VALID_ACTIONS = new Set(['create', 'update', 'delete']);
const VALID_WIDGET_ACTIONS = new Set([
  'create_widget',
  'update_widget',
  'delete_widget',
  'rename_widget',
]);

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
      throw new Error(
        `${prefix}: "type" deve ser um tipo valido (${[...VALID_TYPES].join(', ')})`,
      );
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

      // Partial mode with widgetOps
      if (op.mode === 'partial' || op.widgetOps) {
        if (op.widgetOps && op.mode !== 'partial') {
          throw new Error(`${prefix}: widgetOps requer mode "partial"`);
        }
        if (op.type !== 'studioFlows') {
          throw new Error(`${prefix}: mode "partial" com widgetOps so e suportado para studioFlows`);
        }
        if (op.widgetOps) {
          validateWidgetOps(op.widgetOps, prefix);
        }
      } else {
        if (!op.data || Object.keys(op.data).length === 0) {
          throw new Error(`${prefix}: update requer "data" com pelo menos um campo`);
        }
      }
    }

    if (op.action === 'delete') {
      if (!op.match?.friendlyName && !op.match?.uniqueName) {
        throw new Error(`${prefix}: delete requer "match" com "friendlyName" ou "uniqueName"`);
      }
    }
  });
}

function validateWidgetOps(widgetOps, prefix) {
  widgetOps.forEach((wop, j) => {
    const wPrefix = `${prefix}.widgetOps[${j}]`;

    if (!wop.action || !VALID_WIDGET_ACTIONS.has(wop.action)) {
      throw new Error(
        `${wPrefix}: "action" deve ser ${[...VALID_WIDGET_ACTIONS].join(', ')}`,
      );
    }

    if (!wop.widget) {
      throw new Error(`${wPrefix}: "widget" (nome do widget) e obrigatorio`);
    }

    if (wop.action === 'rename_widget' && !wop.newName) {
      throw new Error(`${wPrefix}: rename_widget requer "newName"`);
    }
  });
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- --testPathPattern=validator.test`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/migration/validator.js __tests__/migration/validator.test.js
git commit -m "feat: add widgetOps validation for partial Studio Flow updates"
```

---

## Task 7: Widget Diff Logic in compare.js (Feature 1, Part 2)

**Files:**
- Modify: `src/diff/compare.js`
- Modify: `__tests__/diff/compare.test.js`

**Step 1: Write failing tests for widget-level diff**

Add to `__tests__/diff/compare.test.js`:

```js
describe('diffResources — Studio Flow widget-level diff', () => {
  const makeFlow = (name, states, extras = {}) => ({
    sid: 'FW123',
    friendlyName: name,
    status: 'published',
    definition: {
      description: 'A flow',
      states: states,
      initial_state: 'Trigger',
      flags: { allow_concurrent_calls: true },
      ...extras,
    },
  });

  test('detects new widget as create_widget', () => {
    const cloud = [
      makeFlow('Flow A', {
        Trigger: { type: 'trigger', transitions: [] },
        NewStep: { type: 'send-message', transitions: [], properties: { body: 'hi' } },
      }),
    ];
    const local = [
      makeFlow('Flow A', {
        Trigger: { type: 'trigger', transitions: [] },
      }),
    ];
    const result = diffResources(cloud, local);
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe('update');
    expect(result[0].mode).toBe('partial');
    expect(result[0].widgetOps).toHaveLength(1);
    expect(result[0].widgetOps[0].action).toBe('create_widget');
    expect(result[0].widgetOps[0].widget).toBe('NewStep');
  });

  test('detects removed widget as delete_widget', () => {
    const cloud = [
      makeFlow('Flow A', {
        Trigger: { type: 'trigger', transitions: [] },
      }),
    ];
    const local = [
      makeFlow('Flow A', {
        Trigger: { type: 'trigger', transitions: [] },
        OldStep: { type: 'send-message', transitions: [], properties: { body: 'hi' } },
      }),
    ];
    const result = diffResources(cloud, local);
    expect(result).toHaveLength(1);
    expect(result[0].mode).toBe('partial');
    expect(result[0].widgetOps).toHaveLength(1);
    expect(result[0].widgetOps[0].action).toBe('delete_widget');
    expect(result[0].widgetOps[0].widget).toBe('OldStep');
  });

  test('detects changed widget as update_widget with only changed fields', () => {
    const cloud = [
      makeFlow('Flow A', {
        Trigger: { type: 'trigger', transitions: [] },
        Step1: { type: 'send-message', transitions: [], properties: { body: 'new text' } },
      }),
    ];
    const local = [
      makeFlow('Flow A', {
        Trigger: { type: 'trigger', transitions: [] },
        Step1: { type: 'send-message', transitions: [], properties: { body: 'old text' } },
      }),
    ];
    const result = diffResources(cloud, local);
    expect(result).toHaveLength(1);
    expect(result[0].mode).toBe('partial');
    expect(result[0].widgetOps[0].action).toBe('update_widget');
    expect(result[0].widgetOps[0].widget).toBe('Step1');
    expect(result[0].widgetOps[0].data.properties).toEqual({ body: 'new text' });
    expect(result[0].widgetOps[0].data.type).toBeUndefined(); // unchanged
  });

  test('falls back to full update when >70% widgets changed', () => {
    // 10 widgets, 8 changed = 80%
    const cloudStates = {};
    const localStates = {};
    for (let i = 0; i < 10; i++) {
      cloudStates[`Step${i}`] = { type: 'send-message', properties: { body: 'new' } };
      localStates[`Step${i}`] = { type: 'send-message', properties: { body: i < 8 ? 'old' : 'new' } };
    }
    const cloud = [makeFlow('Flow A', cloudStates)];
    const local = [makeFlow('Flow A', localStates)];
    const result = diffResources(cloud, local);
    expect(result).toHaveLength(1);
    expect(result[0].mode).toBeUndefined(); // full update, no mode
    expect(result[0].widgetOps).toBeUndefined();
    expect(result[0].data.definition).toBeDefined();
  });

  test('falls back to full update when non-states fields change', () => {
    const cloud = [
      makeFlow('Flow A', { Trigger: { type: 'trigger' } }, { initial_state: 'NewTrigger' }),
    ];
    const local = [
      makeFlow('Flow A', { Trigger: { type: 'trigger' } }, { initial_state: 'Trigger' }),
    ];
    const result = diffResources(cloud, local);
    expect(result).toHaveLength(1);
    expect(result[0].mode).toBeUndefined();
    expect(result[0].data.definition).toBeDefined();
  });

  test('no widgetOps when flows have no definition changes', () => {
    const states = { Trigger: { type: 'trigger', transitions: [] } };
    const cloud = [makeFlow('Flow A', states)];
    const local = [makeFlow('Flow A', states)];
    const result = diffResources(cloud, local);
    expect(result).toHaveLength(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- --testPathPattern=compare.test`
Expected: FAIL

**Step 3: Implement widget-level diff in compare.js**

Replace `src/diff/compare.js` — adding `diffFlowWidgets` function and integrating into `diffResources`:

```js
const METADATA_FIELDS = new Set([
  'sid',
  'accountSid',
  'account_sid',
  'dateCreated',
  'date_created',
  'dateUpdated',
  'date_updated',
  'url',
  'links',
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

function diffFlowWidgets(cloudDef, localDef) {
  const cloudStates = cloudDef?.states || {};
  const localStates = localDef?.states || {};

  // Check if non-states fields differ
  const cloudNonStates = { ...cloudDef };
  const localNonStates = { ...localDef };
  delete cloudNonStates.states;
  delete localNonStates.states;
  if (!deepEqual(stripMetadata(cloudNonStates), stripMetadata(localNonStates))) {
    return null; // fall back to full update
  }

  const widgetOps = [];
  const cloudNames = new Set(Object.keys(cloudStates));
  const localNames = new Set(Object.keys(localStates));
  const allNames = new Set([...cloudNames, ...localNames]);

  for (const name of allNames) {
    const inCloud = cloudNames.has(name);
    const inLocal = localNames.has(name);

    if (inCloud && !inLocal) {
      widgetOps.push({ action: 'create_widget', widget: name, data: cloudStates[name] });
    } else if (!inCloud && inLocal) {
      widgetOps.push({ action: 'delete_widget', widget: name });
    } else {
      const changed = changedFields(cloudStates[name], localStates[name]);
      if (Object.keys(changed).length > 0) {
        widgetOps.push({ action: 'update_widget', widget: name, data: changed });
      }
    }
  }

  if (widgetOps.length === 0) return [];

  // Heuristic: if >70% of widgets changed, fall back to full update
  const totalWidgets = allNames.size;
  const changedCount = widgetOps.length;
  if (totalWidgets > 0 && changedCount / totalWidgets > 0.7) {
    return null; // fall back to full update
  }

  return widgetOps;
}

export function diffResources(cloudResources, localResources) {
  const operations = [];
  const cloudMap = new Map(cloudResources.map((r) => [resourceKey(r), r]));
  const localMap = new Map(localResources.map((r) => [resourceKey(r), r]));

  // Resources in cloud but not local -> create
  for (const [name, cloudItem] of cloudMap) {
    if (!localMap.has(name)) {
      const data = stripMetadata(cloudItem);
      operations.push({ action: 'create', data });
    }
  }

  // Resources in local but not cloud -> delete
  for (const [name] of localMap) {
    if (!cloudMap.has(name)) {
      operations.push({ action: 'delete', match: { friendlyName: name } });
    }
  }

  // Resources in both -> check for updates
  for (const [name, cloudItem] of cloudMap) {
    const localItem = localMap.get(name);
    if (!localItem) continue;

    // Studio Flow widget-level diff
    if (cloudItem.definition && localItem.definition) {
      const widgetOps = diffFlowWidgets(cloudItem.definition, localItem.definition);
      if (widgetOps !== null && widgetOps.length > 0) {
        operations.push({
          action: 'update',
          match: { friendlyName: name },
          mode: 'partial',
          widgetOps,
        });
        continue;
      }
      // widgetOps === null means fall back to full update (below)
      // widgetOps === [] means no changes (skip)
      if (widgetOps !== null) continue;
    }

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

**Step 4: Run tests to verify they pass**

Run: `npm test -- --testPathPattern=compare.test`
Expected: ALL PASS

**Step 5: Run full test suite**

Run: `npm test`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add src/diff/compare.js __tests__/diff/compare.test.js
git commit -m "feat: add widget-level diff for Studio Flows in compare"
```

---

## Task 8: Widget Rollback Generation (Feature 1, Part 3)

**Files:**
- Modify: `src/migration/rollback.js`
- Modify: `__tests__/migration/rollback.test.js`

**Step 1: Write failing tests for widget rollback**

Add to `__tests__/migration/rollback.test.js`:

```js
describe('generateRollback — widgetOps', () => {
  test('generates inverse widgetOps for partial update', () => {
    const operation = {
      action: 'update',
      type: 'studioFlows',
      match: { friendlyName: 'Flow A' },
      mode: 'partial',
      widgetOps: [
        { action: 'create_widget', widget: 'NewStep', data: { type: 'send-message' } },
        { action: 'delete_widget', widget: 'OldStep' },
        { action: 'update_widget', widget: 'Step1', data: { properties: { body: 'new' } } },
        { action: 'rename_widget', widget: 'old_name', newName: 'new_name' },
      ],
    };
    const localState = {
      studioFlows: {
        resources: [
          {
            friendlyName: 'Flow A',
            definition: {
              states: {
                OldStep: { type: 'gather', properties: { timeout: 5 } },
                Step1: { type: 'send-message', properties: { body: 'old' } },
                old_name: { type: 'connect-call', properties: {} },
              },
            },
          },
        ],
      },
    };

    const rollback = generateRollback(operation, localState);
    expect(rollback.action).toBe('update');
    expect(rollback.mode).toBe('partial');
    expect(rollback.widgetOps).toHaveLength(4);

    // Reversed order
    expect(rollback.widgetOps[0]).toEqual({
      action: 'rename_widget',
      widget: 'new_name',
      newName: 'old_name',
    });
    expect(rollback.widgetOps[1]).toEqual({
      action: 'update_widget',
      widget: 'Step1',
      data: { properties: { body: 'old' } },
    });
    expect(rollback.widgetOps[2]).toEqual({
      action: 'create_widget',
      widget: 'OldStep',
      data: { type: 'gather', properties: { timeout: 5 } },
    });
    expect(rollback.widgetOps[3]).toEqual({
      action: 'delete_widget',
      widget: 'NewStep',
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- --testPathPattern=rollback.test`
Expected: FAIL

**Step 3: Implement widget rollback in rollback.js**

Update `src/migration/rollback.js` — add widget rollback logic inside `generateRollback`:

```js
const METADATA_FIELDS = new Set([
  'sid',
  'accountSid',
  'account_sid',
  'dateCreated',
  'date_created',
  'dateUpdated',
  'date_updated',
  'url',
  'links',
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
  return resources.find((r) => r.friendlyName === friendlyName || r.uniqueName === friendlyName);
}

function generateWidgetRollback(widgetOps, flowResource) {
  const states = flowResource?.definition?.states || {};

  const inverseOps = widgetOps.map((wop) => {
    switch (wop.action) {
      case 'create_widget':
        return { action: 'delete_widget', widget: wop.widget };
      case 'delete_widget':
        return { action: 'create_widget', widget: wop.widget, data: states[wop.widget] || {} };
      case 'update_widget': {
        const original = states[wop.widget] || {};
        const oldValues = {};
        if (wop.data) {
          for (const key of Object.keys(wop.data)) {
            oldValues[key] = original[key];
          }
        }
        return { action: 'update_widget', widget: wop.widget, data: oldValues };
      }
      case 'rename_widget':
        return { action: 'rename_widget', widget: wop.newName, newName: wop.widget };
      default:
        throw new Error(`Acao de widget desconhecida: ${wop.action}`);
    }
  });

  return inverseOps.reverse();
}

export function generateRollback(operation, localState) {
  const { action, type, match, data } = operation;

  // Handle partial widget updates
  if (action === 'update' && operation.mode === 'partial' && operation.widgetOps) {
    const flowResource = findInState(localState, type, match.friendlyName);
    const inverseWidgetOps = generateWidgetRollback(operation.widgetOps, flowResource);
    return {
      action: 'update',
      type,
      match: { friendlyName: match.friendlyName },
      mode: 'partial',
      widgetOps: inverseWidgetOps,
    };
  }

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

**Step 4: Run tests to verify they pass**

Run: `npm test -- --testPathPattern=rollback.test`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/migration/rollback.js __tests__/migration/rollback.test.js
git commit -m "feat: add widget-level rollback generation for partial Studio Flow updates"
```

---

## Task 9: Widget Execution in Writers (Feature 1, Part 4)

**Files:**
- Modify: `src/twilio/writers.js:116-144`

**Step 1: Update executeOperation to handle partial mode**

In `src/twilio/writers.js`, update `executeOperation` to detect `mode: 'partial'` and apply widgetOps:

Add before `executeOperation`:

```js
function applyWidgetOps(definition, widgetOps) {
  const result = JSON.parse(JSON.stringify(definition));
  if (!result.states) result.states = {};

  for (const wop of widgetOps) {
    switch (wop.action) {
      case 'create_widget':
        result.states[wop.widget] = { ...wop.data, name: wop.widget };
        break;
      case 'delete_widget':
        delete result.states[wop.widget];
        break;
      case 'update_widget':
        if (result.states[wop.widget]) {
          result.states[wop.widget] = deepMerge(result.states[wop.widget], wop.data);
        }
        break;
      case 'rename_widget': {
        const widgetData = result.states[wop.widget];
        if (widgetData) {
          delete result.states[wop.widget];
          widgetData.name = wop.newName;
          result.states[wop.newName] = widgetData;
          // Update transition references in all widgets
          for (const state of Object.values(result.states)) {
            if (Array.isArray(state.transitions)) {
              for (const t of state.transitions) {
                if (t.next?.widget === wop.widget) {
                  t.next.widget = wop.newName;
                }
              }
            }
          }
        }
        break;
      }
    }
  }

  return result;
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const [key, val] of Object.entries(source)) {
    if (val && typeof val === 'object' && !Array.isArray(val) && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
      result[key] = deepMerge(target[key], val);
    } else {
      result[key] = val;
    }
  }
  return result;
}
```

Then update `executeOperation`:

```js
export async function executeOperation(api, operation, workspaceSid, state) {
  const { action, type, match, data } = operation;

  // Handle partial Studio Flow updates
  if (action === 'update' && operation.mode === 'partial' && operation.widgetOps) {
    const name = match.friendlyName || match.uniqueName;
    const sid = await findSidByName(api, type, name, workspaceSid);
    if (!sid) {
      throw new Error(`Recurso "${name}" (${type}) nao encontrado no ambiente`);
    }

    // Get current definition from state
    const flowResource = state?.[type]?.resources?.find(
      (r) => r.friendlyName === name || r.uniqueName === name,
    );
    if (!flowResource?.definition) {
      throw new Error(`Definition do flow "${name}" nao encontrada no state local`);
    }

    const newDefinition = applyWidgetOps(flowResource.definition, operation.widgetOps);
    const result = await updateStudioFlow(api, workspaceSid, sid, {
      friendlyName: name,
      definition: newDefinition,
    });
    return { sid: result.sid || sid, friendlyName: name };
  }

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

**Important:** The executor.js now needs to pass `state` to `executeOperation`. Update `src/migration/executor.js`:

```js
const result = await executeOperation(api, resolved, workspaceSid, state);
```

**Step 2: Update executor.test.js mock to accept state parameter**

In `__tests__/migration/executor.test.js`, the mock for `executeOperation` already accepts any args, so existing tests should pass. But verify.

**Step 3: Run full test suite**

Run: `npm test`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add src/twilio/writers.js src/migration/executor.js
git commit -m "feat: add widget ops execution with partial Studio Flow updates"
```

---

## Task 10: Diff-Env Command (Feature 2)

**Files:**
- Create: `src/commands/diff-env.js`
- Modify: `src/index.js:1-78`

**Step 1: Create diff-env command**

Create `src/commands/diff-env.js`:

```js
import path from 'node:path';

import fsExtra from 'fs-extra';

const { ensureDir, writeJson } = fsExtra;

import { generateMigration } from '../migration/generator.js';
import { readAllStates } from '../state/reader.js';
import { RESOURCE_TYPES } from '../twilio/fetchers.js';
import { info, success } from '../utils/display.js';

function timestamp() {
  const now = new Date();
  const d = now.toISOString().replace(/[-:T]/g, '').slice(0, 8);
  const t = now.toISOString().replace(/[-:T]/g, '').slice(8, 14);
  return `${d}_${t}`;
}

export async function diffEnvCommand(options) {
  const { source, target, resources } = options;
  const types = resources
    ? resources.split(',').map((t) => t.trim())
    : RESOURCE_TYPES.filter((t) => t !== 'workspace');

  info(`Comparando ambientes: ${source} -> ${target}`);

  const sourceStates = await readAllStates(source);
  const targetStates = await readAllStates(target);

  // Source is the "desired" state (like cloud in pull)
  // Target is the "current" state (like local in pull)
  const sourceData = {};
  for (const type of types) {
    sourceData[type] = sourceStates[type]?.resources || [];
  }

  const migration = generateMigration(sourceData, targetStates, types, 'env-diff');

  if (!migration) {
    success('Nenhuma diferenca detectada entre os ambientes.');
    return;
  }

  // Override source field
  migration.source = 'env-diff';

  const migrationsDir = path.join(target, 'migrations');
  await ensureDir(migrationsDir);
  const fileName = `${timestamp()}_env-diff.json`;
  await writeJson(path.join(migrationsDir, fileName), migration, { spaces: 2 });

  success(`Migration gerada: ${fileName}`);
  info(`${migration.operations.length} operacao(oes) detectada(s).`);
  for (const op of migration.operations) {
    const name = op.data?.friendlyName || op.match?.friendlyName || '?';
    console.log(`  ${op.action} ${op.type}: ${name}`);
  }
}
```

**Step 2: Register command in index.js**

Add to `src/index.js` after the `revert` command registration (after line 54):

```js
import { diffEnvCommand } from './commands/diff-env.js';
```

And add the command:

```js
program
  .command('diff-env')
  .description('Comparar dois ambientes e gerar migration no target')
  .requiredOption('--source <path>', 'Diretorio do ambiente de referencia (atualizado)')
  .requiredOption('--target <path>', 'Diretorio do ambiente a ser atualizado')
  .option('--resources <types>', 'Tipos de recursos separados por virgula')
  .action(async (opts) => {
    await diffEnvCommand(opts);
  });
```

**Step 3: Run full test suite**

Run: `npm test`
Expected: ALL PASS

**Step 4: Update package.json version to 4.0.0**

In `src/index.js`, change `.version('3.0.0')` to `.version('4.0.0')`.

**Step 5: Commit**

```bash
git add src/commands/diff-env.js src/index.js
git commit -m "feat: add diff-env command for cross-environment migration generation"
```

---

## Task 11: Update CLAUDE.md and Final Verification

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Run full test suite**

Run: `npm test`
Expected: ALL PASS

**Step 2: Run lint and format**

Run: `npm run lint && npm run format`
Expected: No errors

**Step 3: Build**

Run: `npm run build`
Expected: Success

**Step 4: Update CLAUDE.md**

Add to the CLI Commands section:
```
tam diff-env --source ./env/dev --target ./env/prod   # Compare two environments, generate migration
```

Update version references from 3.0.0 to 4.0.0.

Add to "Migration Format" section documentation about `mode: "partial"` and `widgetOps`.

Add to `migrations.json` format documentation about `partiallyApplied`.

**Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for v4.0.0 features"
```

---

## Task 12: Serverless Resource Fetcher (Feature 6)

**Files:**
- Modify: `src/twilio/fetchers.js`
- Modify: `__tests__/twilio/fetchers.test.js`
- Modify: `src/commands/pull.js`
- Modify: `src/state/writer.js`

**Step 1: Write failing tests for serverless fetcher**

Add to `__tests__/twilio/fetchers.test.js`:

```js
describe('fetchServerlessServices', () => {
  test('fetches services with environments and functions', async () => {
    const mockApi = {
      serverless: {
        v1: {
          services: {
            list: jest.fn().mockResolvedValue([
              { sid: 'ZS111', uniqueName: 'my-service', friendlyName: 'My Service' },
            ]),
          },
        },
      },
    };
    // Mock nested calls
    mockApi.serverless.v1.services.mockImplementation = undefined;
    const mockServiceContext = {
      environments: {
        list: jest.fn().mockResolvedValue([
          {
            sid: 'ZE222',
            uniqueName: 'production',
            domainName: 'my-service-1234.twil.io',
          },
        ]),
      },
      functions: {
        list: jest.fn().mockResolvedValue([
          {
            sid: 'ZH333',
            friendlyName: 'my-function',
            path: '/my-function',
          },
        ]),
      },
    };
    mockApi.serverless.v1.services = jest.fn().mockReturnValue(mockServiceContext);
    mockApi.serverless.v1.services.list = jest.fn().mockResolvedValue([
      { sid: 'ZS111', uniqueName: 'my-service', friendlyName: 'My Service' },
    ]);

    const result = await fetchServerlessServices(mockApi);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      sid: 'ZS111',
      uniqueName: 'my-service',
      friendlyName: 'My Service',
      environments: [
        { sid: 'ZE222', uniqueName: 'production', domainName: 'my-service-1234.twil.io' },
      ],
      functions: [
        { sid: 'ZH333', friendlyName: 'my-function', path: '/my-function' },
      ],
    });
  });

  test('returns empty array when serverless API fails', async () => {
    const mockApi = {
      serverless: {
        v1: {
          services: {
            list: jest.fn().mockRejectedValue(new Error('Not found')),
          },
        },
      },
    };
    const result = await fetchServerlessServices(mockApi);
    expect(result).toEqual([]);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- --testPathPattern=fetchers.test`
Expected: FAIL — `fetchServerlessServices` not defined

**Step 3: Implement fetchServerlessServices in fetchers.js**

Add to `src/twilio/fetchers.js`:

```js
async function fetchServerlessServices(api) {
  try {
    const services = await api.serverless.v1.services.list({ limit: 100 });
    const result = [];
    for (const svc of services) {
      const [environments, functions] = await Promise.all([
        api.serverless.v1
          .services(svc.sid)
          .environments.list({ limit: 100 }),
        api.serverless.v1
          .services(svc.sid)
          .functions.list({ limit: 100 }),
      ]);
      result.push({
        sid: svc.sid,
        uniqueName: svc.uniqueName || svc.unique_name,
        friendlyName: svc.friendlyName || svc.friendly_name,
        environments: environments.map((e) => ({
          sid: e.sid,
          uniqueName: e.uniqueName || e.unique_name,
          domainName: e.domainName || e.domain_name,
        })),
        functions: functions.map((f) => ({
          sid: f.sid,
          friendlyName: f.friendlyName || f.friendly_name,
          path: f.path,
        })),
      });
    }
    return result;
  } catch {
    return [];
  }
}
```

Export it (add to existing exports or make it a named export):

```js
export { fetchServerlessServices };
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- --testPathPattern=fetchers.test`
Expected: PASS

**Step 5: Update pull.js to fetch and save serverless state**

In `src/commands/pull.js`, add serverless fetch after cloud resource fetch:

```js
import { fetchServerlessServices } from '../twilio/fetchers.js';
import { createClient } from '../twilio/clients.js';
```

Inside `pullCommand`, after fetching cloud data and before generating migration:

```js
  // Fetch serverless resources (read-only, for SID/URL mapping)
  info('Baixando recursos serverless...');
  const api = createClient(account);
  const serverlessResources = await fetchServerlessServices(api);
  await writeState(dir, 'serverless', serverlessResources);
```

**Step 6: Run full test suite**

Run: `npm test`
Expected: ALL PASS

**Step 7: Commit**

```bash
git add src/twilio/fetchers.js __tests__/twilio/fetchers.test.js src/commands/pull.js
git commit -m "feat: add serverless resource fetcher for SID/URL mapping"
```

---

## Task 13: Auto-Replace SIDs/URLs by @ref on Pull (Feature 7)

**Files:**
- Create: `src/sid/auto-ref.js`
- Create: `__tests__/sid/auto-ref.test.js`
- Modify: `src/commands/pull.js`

**Step 1: Write failing tests for buildRefMap**

Create `__tests__/sid/auto-ref.test.js`:

```js
import { jest } from '@jest/globals';

const { buildRefMap, deepReplaceWithRefs } = await import('../../src/sid/auto-ref.js');

describe('buildRefMap', () => {
  test('maps managed resource SIDs to @ref patterns', () => {
    const allStates = {
      taskQueues: {
        resources: [
          { sid: 'WQ111', friendlyName: 'Support' },
          { sid: 'WQ222', friendlyName: 'Sales' },
        ],
      },
      workflows: {
        resources: [{ sid: 'WW333', friendlyName: 'Main Workflow' }],
      },
      taskChannels: {
        resources: [{ sid: 'TC444', uniqueName: 'voice' }],
      },
      studioFlows: {
        resources: [{ sid: 'FW555', friendlyName: 'Main Flow' }],
      },
      contentTemplates: {
        resources: [{ sid: 'HX666', friendlyName: 'Welcome' }],
      },
    };
    const serverless = [];

    const map = buildRefMap(allStates, serverless);
    expect(map['WQ111']).toBe('@ref:taskQueues:Support');
    expect(map['WQ222']).toBe('@ref:taskQueues:Sales');
    expect(map['WW333']).toBe('@ref:workflows:Main Workflow');
    expect(map['TC444']).toBe('@ref:taskChannels:voice');
    expect(map['FW555']).toBe('@ref:studioFlows:Main Flow');
    expect(map['HX666']).toBe('@ref:contentTemplates:Welcome');
  });

  test('maps serverless SIDs to @ref patterns', () => {
    const allStates = {};
    const serverless = [
      {
        sid: 'ZS111',
        uniqueName: 'my-service',
        friendlyName: 'My Service',
        environments: [
          { sid: 'ZE222', uniqueName: 'production', domainName: 'my-service-1234.twil.io' },
        ],
        functions: [
          { sid: 'ZH333', friendlyName: 'my-fn', path: '/my-fn' },
        ],
      },
    ];

    const map = buildRefMap(allStates, serverless);
    expect(map['ZS111']).toBe('@ref:serverless:my-service');
    expect(map['ZE222']).toBe('@ref:serverlessEnv:my-service:production');
    expect(map['ZH333']).toBe('@ref:serverlessFn:my-service:my-fn');
  });

  test('maps serverless URLs to @ref patterns', () => {
    const allStates = {};
    const serverless = [
      {
        sid: 'ZS111',
        uniqueName: 'my-service',
        environments: [
          { sid: 'ZE222', uniqueName: 'production', domainName: 'my-service-1234.twil.io' },
        ],
        functions: [
          { sid: 'ZH333', friendlyName: 'my-fn', path: '/my-fn' },
        ],
      },
    ];

    const map = buildRefMap(allStates, serverless);
    expect(map['https://my-service-1234.twil.io/my-fn']).toBe(
      '@ref:serverlessUrl:my-service:production:/my-fn',
    );
  });

  test('sorts replacements by key length (longest first)', () => {
    const allStates = {};
    const serverless = [
      {
        sid: 'ZS1',
        uniqueName: 'svc',
        environments: [
          { sid: 'ZE1', uniqueName: 'prod', domainName: 'svc-1234.twil.io' },
        ],
        functions: [
          { sid: 'ZH1', friendlyName: 'fn', path: '/fn' },
        ],
      },
    ];

    const map = buildRefMap(allStates, serverless);
    const keys = Object.keys(map);
    // URL is longer than SIDs, should appear in sorted order
    const urlKey = 'https://svc-1234.twil.io/fn';
    expect(keys.includes(urlKey)).toBe(true);
  });
});

describe('deepReplaceWithRefs', () => {
  test('replaces SIDs in nested objects', () => {
    const refMap = { WQ111: '@ref:taskQueues:Support' };
    const obj = {
      configuration: {
        task_routing: { default_filter: { queue: 'WQ111' } },
      },
    };
    const result = deepReplaceWithRefs(obj, refMap);
    expect(result.configuration.task_routing.default_filter.queue).toBe(
      '@ref:taskQueues:Support',
    );
  });

  test('replaces URLs embedded in strings', () => {
    const refMap = {
      'https://my-service-1234.twil.io/my-fn': '@ref:serverlessUrl:my-service:production:/my-fn',
    };
    const obj = {
      url: 'https://my-service-1234.twil.io/my-fn',
    };
    const result = deepReplaceWithRefs(obj, refMap);
    expect(result.url).toBe('@ref:serverlessUrl:my-service:production:/my-fn');
  });

  test('replaces SIDs inside arrays', () => {
    const refMap = { FW555: '@ref:studioFlows:Main Flow' };
    const obj = { flows: ['FW555', 'other'] };
    const result = deepReplaceWithRefs(obj, refMap);
    expect(result.flows[0]).toBe('@ref:studioFlows:Main Flow');
  });

  test('does not modify original object', () => {
    const refMap = { WQ111: '@ref:taskQueues:Support' };
    const obj = { queue: 'WQ111' };
    deepReplaceWithRefs(obj, refMap);
    expect(obj.queue).toBe('WQ111');
  });

  test('handles null and primitives gracefully', () => {
    const refMap = { WQ111: '@ref:taskQueues:Support' };
    expect(deepReplaceWithRefs(null, refMap)).toBeNull();
    expect(deepReplaceWithRefs(42, refMap)).toBe(42);
    expect(deepReplaceWithRefs('WQ111', refMap)).toBe('@ref:taskQueues:Support');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- --testPathPattern=auto-ref.test`
Expected: FAIL — module not found

**Step 3: Implement src/sid/auto-ref.js**

Create `src/sid/auto-ref.js`:

```js
// src/sid/auto-ref.js

const MANAGED_TYPES = [
  { stateKey: 'taskQueues', refType: 'taskQueues', nameField: 'friendlyName' },
  { stateKey: 'workflows', refType: 'workflows', nameField: 'friendlyName' },
  { stateKey: 'taskChannels', refType: 'taskChannels', nameField: 'uniqueName', fallback: 'friendlyName' },
  { stateKey: 'studioFlows', refType: 'studioFlows', nameField: 'friendlyName' },
  { stateKey: 'contentTemplates', refType: 'contentTemplates', nameField: 'friendlyName', fallback: 'uniqueName' },
];

export function buildRefMap(allStates, serverlessResources) {
  const map = {};

  // Map managed resource SIDs
  for (const { stateKey, refType, nameField, fallback } of MANAGED_TYPES) {
    const resources = allStates[stateKey]?.resources || [];
    for (const r of resources) {
      const name = r[nameField] || (fallback && r[fallback]);
      if (r.sid && name) {
        map[r.sid] = `@ref:${refType}:${name}`;
      }
    }
  }

  // Map serverless resources
  for (const svc of serverlessResources || []) {
    const svcName = svc.uniqueName;
    if (svc.sid && svcName) {
      map[svc.sid] = `@ref:serverless:${svcName}`;
    }

    for (const env of svc.environments || []) {
      if (env.sid && env.uniqueName) {
        map[env.sid] = `@ref:serverlessEnv:${svcName}:${env.uniqueName}`;
      }

      // Build URL mappings for each function in each environment
      if (env.domainName) {
        for (const fn of svc.functions || []) {
          if (fn.path) {
            const url = `https://${env.domainName}${fn.path}`;
            const fnName = fn.friendlyName || fn.path;
            map[url] = `@ref:serverlessUrl:${svcName}:${env.uniqueName}:${fn.path}`;
          }
        }
      }
    }

    for (const fn of svc.functions || []) {
      const fnName = fn.friendlyName || fn.path;
      if (fn.sid && fnName) {
        map[fn.sid] = `@ref:serverlessFn:${svcName}:${fnName}`;
      }
    }
  }

  return map;
}

export function deepReplaceWithRefs(obj, refMap) {
  if (obj == null) return obj;

  if (typeof obj === 'string') {
    // Sort keys by length (longest first) to avoid partial matches
    const sortedKeys = Object.keys(refMap).sort((a, b) => b.length - a.length);
    let result = obj;
    for (const key of sortedKeys) {
      result = result.replaceAll(key, refMap[key]);
    }
    return result;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => deepReplaceWithRefs(item, refMap));
  }

  if (typeof obj === 'object') {
    const result = {};
    for (const [key, val] of Object.entries(obj)) {
      result[key] = deepReplaceWithRefs(val, refMap);
    }
    return result;
  }

  return obj;
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- --testPathPattern=auto-ref.test`
Expected: PASS

**Step 5: Integrate auto-ref into pull command**

Update `src/commands/pull.js` to replace SIDs/URLs with @ref before generating migration:

```js
import { buildRefMap, deepReplaceWithRefs } from '../sid/auto-ref.js';
```

Inside `pullCommand`, after fetching serverless and before `generateMigration`:

```js
  // Build SID/URL → @ref mapping from ALL fetched data
  const refMap = buildRefMap(cloudData, serverlessResources);

  // Replace SIDs/URLs with @ref in cloud data for migration generation
  const refCloudData = {};
  for (const type of types) {
    refCloudData[type] = deepReplaceWithRefs(cloudData[type], refMap);
  }
```

Then pass `refCloudData` instead of `cloudData` to `generateMigration`:

```js
  const migration = generateMigration(refCloudData, localStates, types);
```

But save **original** `cloudData` (with real SIDs) to state files — state files need real SIDs for push-time resolution:

```js
  // Update local state with cloud data (original SIDs, NOT @ref)
  for (const type of types) {
    const res = Array.isArray(cloudData[type])
      ? cloudData[type]
      : cloudData[type]
        ? [cloudData[type]]
        : [];
    await writeState(dir, type, res);
  }
```

**Step 6: Run full test suite**

Run: `npm test`
Expected: ALL PASS

**Step 7: Commit**

```bash
git add src/sid/auto-ref.js __tests__/sid/auto-ref.test.js src/commands/pull.js
git commit -m "feat: auto-replace SIDs and URLs with @ref patterns on pull"
```

---

## Task 14: Expand Resolver for Serverless @ref Patterns (Feature 7, Part 2)

**Files:**
- Modify: `src/migration/resolver.js`
- Modify: `__tests__/migration/resolver.test.js`

**Step 1: Write failing tests for new @ref patterns**

Add to `__tests__/migration/resolver.test.js` (create if it doesn't exist):

```js
import { jest } from '@jest/globals';

const { resolveRefs } = await import('../../src/migration/resolver.js');

describe('resolveRefs — serverless patterns', () => {
  const state = {
    taskQueues: { resources: [{ sid: 'WQ111', friendlyName: 'Support' }] },
    serverless: {
      resources: [
        {
          sid: 'ZS111',
          uniqueName: 'my-service',
          environments: [
            { sid: 'ZE222', uniqueName: 'production', domainName: 'my-service-1234.twil.io' },
          ],
          functions: [
            { sid: 'ZH333', friendlyName: 'my-fn', path: '/my-fn' },
          ],
        },
      ],
    },
  };

  test('resolves @ref:serverless:Name to service SID', () => {
    const result = resolveRefs('@ref:serverless:my-service', state);
    expect(result).toBe('ZS111');
  });

  test('resolves @ref:serverlessEnv:Service:Env to environment SID', () => {
    const result = resolveRefs('@ref:serverlessEnv:my-service:production', state);
    expect(result).toBe('ZE222');
  });

  test('resolves @ref:serverlessFn:Service:Fn to function SID', () => {
    const result = resolveRefs('@ref:serverlessFn:my-service:my-fn', state);
    expect(result).toBe('ZH333');
  });

  test('resolves @ref:serverlessUrl:Service:Env:/path to full URL', () => {
    const result = resolveRefs('@ref:serverlessUrl:my-service:production:/my-fn', state);
    expect(result).toBe('https://my-service-1234.twil.io/my-fn');
  });

  test('throws on unresolved serverless ref', () => {
    expect(() => resolveRefs('@ref:serverless:nonexistent', state)).toThrow(
      'Referencia nao resolvida',
    );
  });

  test('resolves nested objects with mixed ref types', () => {
    const obj = {
      queue: '@ref:taskQueues:Support',
      webhook: '@ref:serverlessUrl:my-service:production:/my-fn',
      service: '@ref:serverless:my-service',
    };
    const result = resolveRefs(obj, state);
    expect(result.queue).toBe('WQ111');
    expect(result.webhook).toBe('https://my-service-1234.twil.io/my-fn');
    expect(result.service).toBe('ZS111');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- --testPathPattern=resolver.test`
Expected: FAIL — serverless patterns not resolved

**Step 3: Expand resolver.js to handle serverless @ref patterns**

Replace `src/migration/resolver.js`:

```js
const REF_PATTERN = /^@ref:(\w+):(.+)$/;

function lookupSid(type, name, state, runtimeSids) {
  const runtimeKey = `${type}:${name}`;
  if (runtimeSids?.[runtimeKey]) return runtimeSids[runtimeKey];

  const resources = state[type]?.resources || [];
  const match = resources.find((r) => r.friendlyName === name || r.uniqueName === name);
  if (match) return match.sid;

  return null;
}

function lookupServerless(refType, nameParts, state) {
  const serverless = state.serverless?.resources || [];

  if (refType === 'serverless') {
    // @ref:serverless:ServiceName → ZS SID
    const svc = serverless.find((s) => s.uniqueName === nameParts);
    return svc?.sid || null;
  }

  if (refType === 'serverlessEnv') {
    // @ref:serverlessEnv:ServiceName:EnvName → ZE SID
    const [svcName, envName] = nameParts.split(':');
    const svc = serverless.find((s) => s.uniqueName === svcName);
    const env = svc?.environments?.find((e) => e.uniqueName === envName);
    return env?.sid || null;
  }

  if (refType === 'serverlessFn') {
    // @ref:serverlessFn:ServiceName:FnName → ZH SID
    const [svcName, fnName] = nameParts.split(':');
    const svc = serverless.find((s) => s.uniqueName === svcName);
    const fn = svc?.functions?.find((f) => f.friendlyName === fnName || f.path === fnName);
    return fn?.sid || null;
  }

  if (refType === 'serverlessUrl') {
    // @ref:serverlessUrl:ServiceName:EnvName:/path → https://domain/path
    const firstColon = nameParts.indexOf(':');
    const secondColon = nameParts.indexOf(':', firstColon + 1);
    const svcName = nameParts.slice(0, firstColon);
    const envName = nameParts.slice(firstColon + 1, secondColon);
    const fnPath = nameParts.slice(secondColon + 1);

    const svc = serverless.find((s) => s.uniqueName === svcName);
    const env = svc?.environments?.find((e) => e.uniqueName === envName);
    if (env?.domainName && fnPath) {
      return `https://${env.domainName}${fnPath}`;
    }
    return null;
  }

  return null;
}

const SERVERLESS_TYPES = new Set(['serverless', 'serverlessEnv', 'serverlessFn', 'serverlessUrl']);

export function resolveRefs(obj, state, runtimeSids = {}) {
  if (obj == null) return obj;

  if (typeof obj === 'string') {
    const m = obj.match(REF_PATTERN);
    if (m) {
      const [, type, name] = m;

      if (SERVERLESS_TYPES.has(type)) {
        const result = lookupServerless(type, name, state);
        if (!result) {
          throw new Error(
            `Referencia nao resolvida: @ref:${type}:${name} — recurso nao encontrado no state`,
          );
        }
        return result;
      }

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

**Step 4: Run tests to verify they pass**

Run: `npm test -- --testPathPattern=resolver.test`
Expected: PASS

**Step 5: Run full test suite**

Run: `npm test`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add src/migration/resolver.js __tests__/migration/resolver.test.js
git commit -m "feat: expand resolver for serverless @ref patterns (service, env, fn, url)"
```

---

## Summary

| Task | Feature | Files Modified | Est. Tests |
|------|---------|---------------|------------|
| 1 | Delay | executor.js | 2 new |
| 2 | Partial tracker | tracker.js | 7 new |
| 3 | Partial executor | executor.js | 3 new |
| 4 | Partial push | push.js | 0 (integration) |
| 5 | Partial rollback | revert.js, tracker.js | 1 new |
| 6 | Widget validator | validator.js | 7 new |
| 7 | Widget diff | compare.js | 6 new |
| 8 | Widget rollback | rollback.js | 1 new |
| 9 | Widget execution | writers.js, executor.js | 0 (integration) |
| 10 | Diff-env | diff-env.js, index.js | 0 (new cmd) |
| 11 | Docs | CLAUDE.md | 0 |
| 12 | Serverless fetch | fetchers.js, pull.js | 2 new |
| 13 | Auto-replace @ref | auto-ref.js, pull.js | 10 new |
| 14 | Resolver expand | resolver.js | 6 new |
