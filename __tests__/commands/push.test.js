import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const store = new Map();

const mockEnsureDir = jest.fn().mockImplementation(async () => {});
const mockWriteJson = jest.fn().mockImplementation(async (filePath, data, _opts) => {
  store.set(filePath, JSON.parse(JSON.stringify(data)));
});
const mockReadJson = jest.fn().mockImplementation(async (filePath) => {
  if (!store.has(filePath)) {
    const err = new Error(`ENOENT: no such file or directory '${filePath}'`);
    err.code = 'ENOENT';
    throw err;
  }
  return JSON.parse(JSON.stringify(store.get(filePath)));
});
const mockPathExists = jest.fn().mockImplementation(async (filePath) => {
  return store.has(filePath);
});

const mockReaddir = jest.fn().mockImplementation(async (dirPath) => {
  const prefix = dirPath + '/';
  const files = [];
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      const relative = key.slice(prefix.length);
      if (!relative.includes('/')) {
        files.push(relative);
      }
    }
  }
  return files;
});

jest.unstable_mockModule('fs-extra', () => ({
  default: {
    ensureDir: mockEnsureDir,
    writeJson: mockWriteJson,
    readJson: mockReadJson,
    pathExists: mockPathExists,
    readdir: mockReaddir,
  },
}));

jest.unstable_mockModule('../../src/config.js', () => ({
  loadEnvFile: jest.fn().mockReturnValue({
    accountSid: 'AC_TEST',
    apiKeySid: 'SK_TEST',
    apiKeySecret: 'secret_test',
  }),
}));

jest.unstable_mockModule('../../src/twilio/clients.js', () => ({
  createClient: jest.fn().mockReturnValue({}),
}));

const mockFetchResource = jest.fn();

jest.unstable_mockModule('../../src/twilio/fetchers.js', () => ({
  fetchResource: mockFetchResource,
}));

const mockExecuteMigration = jest.fn();

jest.unstable_mockModule('../../src/migration/executor.js', () => ({
  executeMigration: mockExecuteMigration,
}));

const mockValidateStudioFlowsOperations = jest
  .fn()
  .mockResolvedValue({ ok: true, checked: 0, failures: [] });

jest.unstable_mockModule('../../src/migration/studio-validator.js', () => ({
  validateStudioFlowsOperations: mockValidateStudioFlowsOperations,
}));

const mockDetectDrift = jest.fn().mockResolvedValue({ hasDrift: false, drifts: [] });
jest.unstable_mockModule('../../src/migration/drift-check.js', () => ({
  detectDrift: mockDetectDrift,
}));

const mockCreateBackup = jest.fn().mockResolvedValue('/env/dev/state/.backup/20260101000000');
const mockPruneBackups = jest.fn().mockResolvedValue([]);
jest.unstable_mockModule('../../src/state/backup.js', () => ({
  createBackup: mockCreateBackup,
  pruneBackups: mockPruneBackups,
}));

const mockPreviewMigration = jest.fn().mockResolvedValue(undefined);
jest.unstable_mockModule('../../src/migration/preview.js', () => ({
  previewMigration: mockPreviewMigration,
}));

const mockValidateMigration = jest.fn();

jest.unstable_mockModule('../../src/migration/validator.js', () => ({
  validateMigration: mockValidateMigration,
}));

jest.unstable_mockModule('../../src/utils/display.js', () => ({
  info: jest.fn(),
  success: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  printAddedField: jest.fn(),
  printRemovedField: jest.fn(),
  printFieldDiff: jest.fn(),
}));

const { pushCommand } = await import('../../src/commands/push.js');

function seedState(dir, type, resources) {
  store.set(`${dir}/state/${type}.json`, {
    fetchedAt: new Date().toISOString(),
    resources,
  });
}

function seedMigrationsTracker(dir, tracker) {
  store.set(`${dir}/state/migrations.json`, tracker);
}

function seedMigrationFile(dir, name, migration) {
  store.set(`${dir}/migrations/${name}`, migration);
}

function getState(dir, type) {
  const data = store.get(`${dir}/state/${type}.json`);
  return data?.resources || [];
}

describe('pushCommand — state updates', () => {
  beforeEach(() => {
    store.clear();
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    mockFetchResource.mockResolvedValue({ sid: 'WS_WORKSPACE' });
    mockValidateStudioFlowsOperations.mockResolvedValue({
      ok: true,
      checked: 0,
      failures: [],
    });
    mockDetectDrift.mockResolvedValue({ hasDrift: false, drifts: [] });
    mockCreateBackup.mockResolvedValue('/env/dev/state/.backup/20260101000000');
    mockPruneBackups.mockResolvedValue([]);
  });

  test('create operation adds resource to state', async () => {
    const migrationName = '20260301_100000_add-queue.json';
    const migration = {
      description: 'add queue',
      operations: [
        { action: 'create', type: 'taskQueues', data: { friendlyName: 'New Queue', targetWorkers: '1==1' } },
      ],
      rollback: [],
    };

    seedState('/env/dev', 'taskQueues', [
      { sid: 'WQ111', friendlyName: 'Existing', targetWorkers: '1==1' },
    ]);
    seedMigrationsTracker('/env/dev', { applied: [] });
    seedMigrationFile('/env/dev', migrationName, migration);

    mockExecuteMigration.mockResolvedValue([
      {
        operation: migration.operations[0],
        status: 'ok',
        result: { sid: 'WQ_NEW', friendlyName: 'New Queue' },
      },
    ]);

    await pushCommand({ dir: '/env/dev', envFile: '.env.dev' });

    const queues = getState('/env/dev', 'taskQueues');
    expect(queues).toHaveLength(2);
    expect(queues.find((q) => q.friendlyName === 'New Queue')).toMatchObject({
      sid: 'WQ_NEW',
      friendlyName: 'New Queue',
      targetWorkers: '1==1',
    });
  });

  test('update operation modifies resource in state', async () => {
    const migrationName = '20260301_100000_update-queue.json';
    const migration = {
      description: 'update queue',
      operations: [
        {
          action: 'update',
          type: 'taskQueues',
          match: { friendlyName: 'Support' },
          data: { targetWorkers: 'skills HAS "support"' },
        },
      ],
      rollback: [],
    };

    seedState('/env/dev', 'taskQueues', [
      { sid: 'WQ111', friendlyName: 'Support', targetWorkers: '1==1', maxReservedWorkers: 10 },
    ]);
    seedMigrationsTracker('/env/dev', { applied: [] });
    seedMigrationFile('/env/dev', migrationName, migration);

    mockExecuteMigration.mockResolvedValue([
      {
        operation: migration.operations[0],
        status: 'ok',
        result: { sid: 'WQ111', friendlyName: 'Support' },
      },
    ]);

    await pushCommand({ dir: '/env/dev', envFile: '.env.dev' });

    const queues = getState('/env/dev', 'taskQueues');
    expect(queues).toHaveLength(1);
    expect(queues[0]).toMatchObject({
      sid: 'WQ111',
      friendlyName: 'Support',
      targetWorkers: 'skills HAS "support"',
      maxReservedWorkers: 10,
    });
  });

  test('delete operation removes resource from state', async () => {
    const migrationName = '20260301_100000_delete-queue.json';
    const migration = {
      description: 'delete queue',
      operations: [
        {
          action: 'delete',
          type: 'taskQueues',
          match: { friendlyName: 'Old Queue' },
        },
      ],
      rollback: [],
    };

    seedState('/env/dev', 'taskQueues', [
      { sid: 'WQ111', friendlyName: 'Support', targetWorkers: '1==1' },
      { sid: 'WQ222', friendlyName: 'Old Queue', targetWorkers: '1==1' },
    ]);
    seedMigrationsTracker('/env/dev', { applied: [] });
    seedMigrationFile('/env/dev', migrationName, migration);

    mockExecuteMigration.mockResolvedValue([
      {
        operation: migration.operations[0],
        status: 'ok',
        result: { sid: 'WQ222', friendlyName: 'Old Queue', deleted: true },
      },
    ]);

    await pushCommand({ dir: '/env/dev', envFile: '.env.dev' });

    const queues = getState('/env/dev', 'taskQueues');
    expect(queues).toHaveLength(1);
    expect(queues[0].friendlyName).toBe('Support');
  });

  test('mixed operations update state correctly', async () => {
    const migrationName = '20260301_100000_mixed.json';
    const migration = {
      description: 'mixed ops',
      operations: [
        { action: 'create', type: 'taskQueues', data: { friendlyName: 'New', targetWorkers: '1==1' } },
        {
          action: 'update',
          type: 'taskQueues',
          match: { friendlyName: 'Support' },
          data: { targetWorkers: 'skills HAS "support"' },
        },
        { action: 'delete', type: 'taskQueues', match: { friendlyName: 'Old' } },
      ],
      rollback: [],
    };

    seedState('/env/dev', 'taskQueues', [
      { sid: 'WQ111', friendlyName: 'Support', targetWorkers: '1==1' },
      { sid: 'WQ222', friendlyName: 'Old', targetWorkers: '1==1' },
    ]);
    seedMigrationsTracker('/env/dev', { applied: [] });
    seedMigrationFile('/env/dev', migrationName, migration);

    mockExecuteMigration.mockResolvedValue([
      {
        operation: migration.operations[0],
        status: 'ok',
        result: { sid: 'WQ_NEW', friendlyName: 'New' },
      },
      {
        operation: migration.operations[1],
        status: 'ok',
        result: { sid: 'WQ111', friendlyName: 'Support' },
      },
      {
        operation: migration.operations[2],
        status: 'ok',
        result: { sid: 'WQ222', friendlyName: 'Old', deleted: true },
      },
    ]);

    await pushCommand({ dir: '/env/dev', envFile: '.env.dev' });

    const queues = getState('/env/dev', 'taskQueues');
    expect(queues).toHaveLength(2);
    expect(queues.find((q) => q.friendlyName === 'New')).toBeDefined();
    expect(queues.find((q) => q.friendlyName === 'Support')?.targetWorkers).toBe(
      'skills HAS "support"',
    );
    expect(queues.find((q) => q.friendlyName === 'Old')).toBeUndefined();
  });

  test('aborts before executeMigration when studio flow pre-validation fails', async () => {
    const migrationName = '20260301_100000_bad-flow.json';
    const migration = {
      description: 'bad flow',
      operations: [
        {
          action: 'create',
          type: 'studioFlows',
          data: { friendlyName: 'Bad Flow', definition: { invalid: true } },
        },
      ],
      rollback: [],
    };

    seedMigrationsTracker('/env/dev', { applied: [] });
    seedMigrationFile('/env/dev', migrationName, migration);

    const apiErr = new Error('Validation failed');
    apiErr.details = { errors: [{ message: 'bad widget', property_path: '#/states/0' }] };
    mockValidateStudioFlowsOperations.mockResolvedValueOnce({
      ok: false,
      checked: 1,
      failures: [{ name: 'Bad Flow', action: 'create', err: apiErr }],
    });

    await pushCommand({ dir: '/env/dev', envFile: '.env.dev' });

    expect(mockValidateStudioFlowsOperations).toHaveBeenCalled();
    expect(mockExecuteMigration).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
  });

  test('dry-run does not modify state', async () => {
    const migrationName = '20260301_100000_update-queue.json';
    const migration = {
      description: 'update queue',
      operations: [
        {
          action: 'update',
          type: 'taskQueues',
          match: { friendlyName: 'Support' },
          data: { targetWorkers: 'skills HAS "support"' },
        },
      ],
      rollback: [],
    };

    seedState('/env/dev', 'taskQueues', [
      { sid: 'WQ111', friendlyName: 'Support', targetWorkers: '1==1' },
    ]);
    seedMigrationsTracker('/env/dev', { applied: [] });
    seedMigrationFile('/env/dev', migrationName, migration);

    mockExecuteMigration.mockResolvedValue([
      {
        operation: migration.operations[0],
        status: 'dry-run',
      },
    ]);

    await pushCommand({ dir: '/env/dev', envFile: '.env.dev', dryRun: true });

    const queues = getState('/env/dev', 'taskQueues');
    expect(queues).toHaveLength(1);
    expect(queues[0].targetWorkers).toBe('1==1');
  });
});
