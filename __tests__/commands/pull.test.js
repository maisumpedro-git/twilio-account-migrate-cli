import { beforeEach, describe, expect, jest, test } from '@jest/globals';

// In-memory filesystem store (simulates disk persistence between pulls)
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

jest.unstable_mockModule('fs-extra', () => ({
  default: {
    ensureDir: mockEnsureDir,
    writeJson: mockWriteJson,
    readJson: mockReadJson,
    pathExists: mockPathExists,
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

// --- Cloud data fixtures ---

const CLOUD_TASK_QUEUES = [
  { sid: 'WQ111', friendlyName: 'Support', targetWorkers: '1==1', maxReservedWorkers: 10 },
  { sid: 'WQ222', friendlyName: 'Sales', targetWorkers: 'skills HAS "sales"', maxReservedWorkers: 5 },
];

const CLOUD_WORKFLOWS = [
  {
    sid: 'WW333',
    friendlyName: 'Main Workflow',
    taskReservationTimeout: 120,
    configuration: {
      task_routing: {
        default_filter: { queue: 'WQ111' },
        filters: [
          {
            filter_friendly_name: 'Sales Filter',
            expression: 'type == "sales"',
            targets: [{ queue: 'WQ222' }],
          },
        ],
      },
    },
  },
];

const CLOUD_TASK_CHANNELS = [
  { sid: 'TC444', friendlyName: 'Voice', uniqueName: 'voice' },
];

const CLOUD_SERVERLESS = [
  {
    sid: 'ZS555',
    uniqueName: 'my-service',
    friendlyName: 'My Service',
    environments: [
      { sid: 'ZE666', uniqueName: 'production', domainName: 'my-service-1234.twil.io' },
    ],
    functions: [{ sid: 'ZH777', friendlyName: 'callback', path: '/callback' }],
    assets: [],
  },
];

const CLOUD_WORKFLOWS_WITH_URL = [
  {
    sid: 'WW333',
    friendlyName: 'Main Workflow',
    taskReservationTimeout: 120,
    assignmentCallbackUrl: 'https://my-service-1234.twil.io/callback',
    configuration: {
      task_routing: {
        default_filter: { queue: 'WQ111' },
      },
    },
  },
];

const mockFetchResource = jest.fn();
const mockFetchServerlessServices = jest.fn();

jest.unstable_mockModule('../../src/twilio/fetchers.js', () => ({
  fetchResource: mockFetchResource,
  fetchServerlessServices: mockFetchServerlessServices,
  RESOURCE_TYPES: [
    'workspace',
    'taskQueues',
    'taskChannels',
    'workflows',
    'studioFlows',
    'contentTemplates',
  ],
}));

jest.unstable_mockModule('../../src/utils/display.js', () => ({
  info: jest.fn(),
  success: jest.fn(),
}));

// Import AFTER all mocks
const { pullCommand } = await import('../../src/commands/pull.js');
const { success } = await import('../../src/utils/display.js');

function findMigrationWrite(calls) {
  return calls.find(
    ([p]) => p.includes('migrations/') && p.includes('_pull-changes.json'),
  );
}

function setupBasicCloudData() {
  mockFetchResource.mockImplementation(async (_account, type) => {
    switch (type) {
      case 'taskQueues':
        return CLOUD_TASK_QUEUES;
      case 'workflows':
        return CLOUD_WORKFLOWS;
      case 'taskChannels':
        return CLOUD_TASK_CHANNELS;
      case 'studioFlows':
        return [];
      case 'contentTemplates':
        return [];
      default:
        return [];
    }
  });
  mockFetchServerlessServices.mockResolvedValue([]);
}

function setupCloudDataWithServerlessUrls() {
  mockFetchResource.mockImplementation(async (_account, type) => {
    switch (type) {
      case 'taskQueues':
        return CLOUD_TASK_QUEUES;
      case 'workflows':
        return CLOUD_WORKFLOWS_WITH_URL;
      case 'taskChannels':
        return CLOUD_TASK_CHANNELS;
      case 'studioFlows':
        return [];
      case 'contentTemplates':
        return [];
      default:
        return [];
    }
  });
  mockFetchServerlessServices.mockResolvedValue(CLOUD_SERVERLESS);
}

describe('pullCommand — double pull bug', () => {
  beforeEach(() => {
    store.clear();
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  test('primeiro pull com estado vazio gera migration com creates', async () => {
    setupBasicCloudData();

    await pullCommand({ dir: '/env/dev', envFile: '.env.dev' });

    const migrationCall = findMigrationWrite(mockWriteJson.mock.calls);
    expect(migrationCall).toBeDefined();

    const migration = migrationCall[1];
    expect(migration.operations.length).toBeGreaterThan(0);

    for (const op of migration.operations) {
      expect(op.action).toBe('create');
    }

    // Workflow create should have @ref patterns, not raw SIDs
    const wfOp = migration.operations.find((op) => op.type === 'workflows');
    expect(wfOp).toBeDefined();
    const configStr = JSON.stringify(wfOp.data.configuration);
    expect(configStr).toContain('@ref:taskQueues:Support');
    expect(configStr).toContain('@ref:taskQueues:Sales');
    expect(configStr).not.toContain('WQ111');
    expect(configStr).not.toContain('WQ222');
  });

  test('segundo pull sem alteracoes na cloud nao deve gerar migration', async () => {
    setupBasicCloudData();

    // First pull — populates state
    await pullCommand({ dir: '/env/dev', envFile: '.env.dev' });

    // Reset mock call history but keep the in-memory store
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    setupBasicCloudData();

    // Second pull — same cloud data
    await pullCommand({ dir: '/env/dev', envFile: '.env.dev' });

    // No migration should be generated — no real changes
    expect(success).toHaveBeenCalledWith(expect.stringContaining('Nenhuma alteracao'));

    const migrationCall = findMigrationWrite(mockWriteJson.mock.calls);
    expect(migrationCall).toBeUndefined();
  });

  test('segundo pull com serverless URLs nao deve gerar migration', async () => {
    setupCloudDataWithServerlessUrls();

    // First pull
    await pullCommand({ dir: '/env/dev', envFile: '.env.dev' });

    // Reset mock call history but keep in-memory store
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    setupCloudDataWithServerlessUrls();

    // Second pull — same cloud data
    await pullCommand({ dir: '/env/dev', envFile: '.env.dev' });

    // Should not generate migration — no real changes
    expect(success).toHaveBeenCalledWith(expect.stringContaining('Nenhuma alteracao'));

    const migrationCall = findMigrationWrite(mockWriteJson.mock.calls);
    expect(migrationCall).toBeUndefined();
  });
});
