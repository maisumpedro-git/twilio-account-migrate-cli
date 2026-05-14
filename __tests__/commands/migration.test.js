// __tests__/commands/migration.test.js
import { jest } from '@jest/globals';

const mockFsExtra = {
  ensureDir: jest.fn(),
  writeJson: jest.fn(),
  readJson: jest.fn(),
  readdir: jest.fn(),
  pathExists: jest.fn(),
};
jest.unstable_mockModule('fs-extra', () => ({
  default: mockFsExtra,
  ...mockFsExtra,
}));

jest.unstable_mockModule('../../src/migration/tracker.js', () => ({
  listMigrations: jest.fn(),
}));

jest.unstable_mockModule('../../src/utils/display.js', () => ({
  info: jest.fn(),
  success: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

const { createMigration, listMigrationsCommand, neutralizeMigration } = await import(
  '../../src/commands/migration.js'
);
const { ensureDir, pathExists, readJson, writeJson } = mockFsExtra;
const { listMigrations } = await import('../../src/migration/tracker.js');
const { info } = await import('../../src/utils/display.js');

describe('createMigration', () => {
  beforeEach(() => jest.clearAllMocks());

  test('creates migration file with timestamp and slugified description', async () => {
    const result = await createMigration('/env/dev', 'add support queue');
    expect(ensureDir).toHaveBeenCalled();
    expect(writeJson).toHaveBeenCalledWith(
      expect.stringMatching(/add-support-queue\.json$/),
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

  test('slugifies description with special characters', async () => {
    const result = await createMigration('/env/dev', 'Add açaí & café!');
    expect(writeJson).toHaveBeenCalledWith(
      expect.stringMatching(/add-acai-cafe\.json$/),
      expect.objectContaining({
        description: 'Add açaí & café!',
        source: 'manual',
      }),
      { spaces: 2 },
    );
    expect(result).toMatch(/add-acai-cafe\.json$/);
  });

  test('includes createdAt in the migration file', async () => {
    await createMigration('/env/dev', 'test migration');
    const writtenData = writeJson.mock.calls[0][1];
    expect(writtenData).toHaveProperty('createdAt');
    expect(typeof writtenData.createdAt).toBe('string');
  });
});

describe('listMigrationsCommand', () => {
  beforeEach(() => jest.clearAllMocks());

  test('shows info message when no migrations exist', async () => {
    listMigrations.mockResolvedValue([]);
    await listMigrationsCommand('/env/dev');
    expect(info).toHaveBeenCalledWith(expect.stringContaining('migration'));
  });

  test('logs each migration with status', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    listMigrations.mockResolvedValue([
      { name: '20260228_120000_first.json', status: 'applied', appliedAt: '2026-02-28T12:00:00Z' },
      { name: '20260228_130000_second.json', status: 'pending', appliedAt: null },
    ]);
    await listMigrationsCommand('/env/dev');
    expect(console.log).toHaveBeenCalledTimes(2);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('applied'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('pending'));
    spy.mockRestore();
  });
});

describe('neutralizeMigration', () => {
  beforeEach(() => jest.clearAllMocks());

  function mockStateFiles(states) {
    pathExists.mockImplementation((filePath) => {
      for (const type of Object.keys(states)) {
        if (filePath.endsWith(`${type}.json`)) return Promise.resolve(true);
      }
      return Promise.resolve(false);
    });
    readJson.mockImplementation((filePath) => {
      // Migration file read
      if (filePath.includes('migrations/')) {
        return Promise.resolve(readJson._migrationData);
      }
      // State file reads
      for (const [type, data] of Object.entries(states)) {
        if (filePath.endsWith(`${type}.json`)) return Promise.resolve(data);
      }
      return Promise.resolve({ fetchedAt: null, resources: [] });
    });
  }

  test('replaces SIDs with @ref in operations and rollback', async () => {
    const migration = {
      description: 'manual update',
      source: 'manual',
      operations: [
        {
          action: 'update',
          type: 'workflows',
          match: { friendlyName: 'Main' },
          data: { configuration: { queue: 'WQ1234567890abcdef1234567890abcd' } },
        },
      ],
      rollback: [
        {
          action: 'update',
          type: 'workflows',
          match: { friendlyName: 'Main' },
          data: { configuration: { queue: 'WQ1234567890abcdef1234567890abcd' } },
        },
      ],
    };

    readJson._migrationData = migration;
    mockStateFiles({
      taskQueues: {
        fetchedAt: '2026-01-01',
        resources: [{ sid: 'WQ1234567890abcdef1234567890abcd', friendlyName: 'Support' }],
      },
      taskChannels: { fetchedAt: null, resources: [] },
      workflows: { fetchedAt: null, resources: [] },
      workspace: { fetchedAt: null, resources: [] },
      studioFlows: { fetchedAt: null, resources: [] },
      contentTemplates: { fetchedAt: null, resources: [] },
      serverless: { fetchedAt: null, resources: [] },
    });

    const result = await neutralizeMigration('/env/dev', 'my-migration.json');

    expect(result).toBe('my-migration.json');
    expect(writeJson).toHaveBeenCalledWith(
      expect.stringContaining('my-migration.json'),
      expect.objectContaining({
        operations: [
          expect.objectContaining({
            data: { configuration: { queue: '@ref:taskQueues:Support@@' } },
          }),
        ],
        rollback: [
          expect.objectContaining({
            data: { configuration: { queue: '@ref:taskQueues:Support@@' } },
          }),
        ],
      }),
      { spaces: 2 },
    );
  });

  test('returns undefined and shows info when no state resources found', async () => {
    readJson._migrationData = { operations: [], rollback: [] };
    mockStateFiles({
      taskQueues: { fetchedAt: null, resources: [] },
      taskChannels: { fetchedAt: null, resources: [] },
      workflows: { fetchedAt: null, resources: [] },
      workspace: { fetchedAt: null, resources: [] },
      studioFlows: { fetchedAt: null, resources: [] },
      contentTemplates: { fetchedAt: null, resources: [] },
      serverless: { fetchedAt: null, resources: [] },
    });

    const result = await neutralizeMigration('/env/dev', 'empty.json');

    expect(result).toBeUndefined();
    expect(info).toHaveBeenCalledWith(expect.stringContaining('@ref'));
    expect(writeJson).not.toHaveBeenCalled();
  });

  test('handles absolute migration file path', async () => {
    readJson._migrationData = {
      operations: [{ action: 'create', type: 'taskQueues', data: { friendlyName: 'Test' } }],
      rollback: [],
    };
    mockStateFiles({
      taskQueues: { fetchedAt: null, resources: [] },
      taskChannels: { fetchedAt: null, resources: [] },
      workflows: { fetchedAt: null, resources: [] },
      workspace: { fetchedAt: null, resources: [] },
      studioFlows: { fetchedAt: null, resources: [] },
      contentTemplates: { fetchedAt: null, resources: [] },
      serverless: { fetchedAt: null, resources: [] },
    });

    // Even with empty state, readJson is called with the absolute path
    await neutralizeMigration('/env/dev', '/absolute/path/migration.json');

    expect(readJson).toHaveBeenCalledWith('/absolute/path/migration.json');
  });

  test('replaces serverless URLs with @ref patterns', async () => {
    const migration = {
      description: 'manual flow update',
      source: 'manual',
      operations: [
        {
          action: 'update',
          type: 'studioFlows',
          match: { friendlyName: 'IVR' },
          data: { url: 'https://my-service-1234.twil.io/handler' },
        },
      ],
      rollback: [],
    };

    readJson._migrationData = migration;
    mockStateFiles({
      taskQueues: { fetchedAt: null, resources: [] },
      taskChannels: { fetchedAt: null, resources: [] },
      workflows: { fetchedAt: null, resources: [] },
      workspace: { fetchedAt: null, resources: [] },
      studioFlows: { fetchedAt: null, resources: [] },
      contentTemplates: { fetchedAt: null, resources: [] },
      serverless: {
        fetchedAt: '2026-01-01',
        resources: [
          {
            sid: 'ZS111',
            uniqueName: 'my-service',
            environments: [
              { sid: 'ZE222', uniqueName: 'production', domainName: 'my-service-1234.twil.io' },
            ],
            functions: [{ sid: 'ZH333', friendlyName: '/handler', path: '/handler' }],
          },
        ],
      },
    });

    await neutralizeMigration('/env/dev', 'flow-update.json');

    const written = writeJson.mock.calls[0][1];
    expect(written.operations[0].data.url).toBe(
      '@ref:serverlessUrl:my-service:production:/handler@@',
    );
  });
});
