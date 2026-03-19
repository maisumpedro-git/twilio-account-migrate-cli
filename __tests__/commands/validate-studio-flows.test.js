// __tests__/commands/validate-studio-flows.test.js
import { jest } from '@jest/globals';

const mockFsExtra = {
  readJson: jest.fn(),
  ensureDir: jest.fn(),
  readdir: jest.fn(),
  pathExists: jest.fn(),
};
jest.unstable_mockModule('fs-extra', () => ({
  default: mockFsExtra,
  ...mockFsExtra,
}));

jest.unstable_mockModule('../../src/config.js', () => ({
  loadEnvFile: jest.fn().mockReturnValue({
    accountSid: 'AC123',
    apiKeySid: 'SK123',
    apiKeySecret: 'secret',
  }),
}));

const mockFlowValidateCreate = jest.fn();
jest.unstable_mockModule('../../src/twilio/clients.js', () => ({
  createClient: jest.fn().mockReturnValue({
    studio: { v2: { flowValidate: { create: mockFlowValidateCreate } } },
  }),
}));

jest.unstable_mockModule('../../src/migration/tracker.js', () => ({
  listMigrations: jest.fn(),
}));

const mockDisplay = {
  success: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
};
jest.unstable_mockModule('../../src/utils/display.js', () => mockDisplay);

const { validateStudioFlowsCommand } = await import(
  '../../src/commands/validate-studio-flows.js'
);
const { listMigrations } = await import('../../src/migration/tracker.js');
const { readJson } = mockFsExtra;

describe('validateStudioFlowsCommand', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.exitCode = undefined;
  });

  const baseOpts = { dir: '/env/dev', envFile: '.env.dev' };

  test('validates a specific migration by name', async () => {
    const migration = {
      operations: [
        {
          action: 'create',
          type: 'studioFlows',
          data: {
            friendlyName: 'My Flow',
            status: 'published',
            definition: { description: 'test', states: [] },
          },
        },
      ],
    };
    readJson.mockResolvedValue(migration);
    mockFlowValidateCreate.mockResolvedValue({ valid: true });

    await validateStudioFlowsCommand({ ...baseOpts, migrationName: 'my-migration.json' });

    expect(mockFlowValidateCreate).toHaveBeenCalledWith({
      friendlyName: 'My Flow',
      status: 'published',
      definition: JSON.stringify({ description: 'test', states: [] }),
    });
    expect(mockDisplay.success).toHaveBeenCalledWith(expect.stringContaining('My Flow'));
    expect(mockDisplay.success).toHaveBeenCalledWith(
      expect.stringContaining('Todas as definitions'),
    );
    expect(process.exitCode).toBeUndefined();
  });

  test('appends .json to migration name if missing', async () => {
    const migration = { operations: [] };
    readJson.mockResolvedValue(migration);

    await validateStudioFlowsCommand({ ...baseOpts, migrationName: 'my-migration' });

    expect(readJson).toHaveBeenCalledWith(expect.stringContaining('my-migration.json'));
  });

  test('shows info when no studioFlows operations found', async () => {
    readJson.mockResolvedValue({
      operations: [{ action: 'create', type: 'taskQueues', data: { friendlyName: 'Q1' } }],
    });

    await validateStudioFlowsCommand({ ...baseOpts, migrationName: 'test.json' });

    expect(mockDisplay.info).toHaveBeenCalledWith(expect.stringContaining('studioFlows'));
    expect(mockFlowValidateCreate).not.toHaveBeenCalled();
  });

  test('skips delete operations', async () => {
    readJson.mockResolvedValue({
      operations: [
        { action: 'delete', type: 'studioFlows', match: { friendlyName: 'Old Flow' } },
      ],
    });

    await validateStudioFlowsCommand({ ...baseOpts, migrationName: 'test.json' });

    expect(mockDisplay.warn).toHaveBeenCalledWith(expect.stringContaining('Old Flow'));
    expect(mockFlowValidateCreate).not.toHaveBeenCalled();
  });

  test('skips operations without definition', async () => {
    readJson.mockResolvedValue({
      operations: [
        {
          action: 'update',
          type: 'studioFlows',
          match: { friendlyName: 'Flow' },
          data: { status: 'draft' },
        },
      ],
    });

    await validateStudioFlowsCommand({ ...baseOpts, migrationName: 'test.json' });

    expect(mockDisplay.warn).toHaveBeenCalledWith(expect.stringContaining('sem definition'));
    expect(mockFlowValidateCreate).not.toHaveBeenCalled();
  });

  test('reports validation errors from API', async () => {
    const migration = {
      operations: [
        {
          action: 'create',
          type: 'studioFlows',
          data: {
            friendlyName: 'Bad Flow',
            definition: { invalid: true },
          },
        },
      ],
    };
    readJson.mockResolvedValue(migration);

    const apiError = new Error('Validation failed');
    apiError.details = {
      errors: [{ message: 'Invalid widget', path: '/states/0' }],
    };
    mockFlowValidateCreate.mockRejectedValue(apiError);

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await validateStudioFlowsCommand({ ...baseOpts, migrationName: 'test.json' });
    consoleSpy.mockRestore();

    expect(mockDisplay.error).toHaveBeenCalledWith(expect.stringContaining('Bad Flow'));
    expect(mockDisplay.error).toHaveBeenCalledWith(expect.stringContaining('erros'));
    expect(process.exitCode).toBe(1);
  });

  test('validates last pending migration when no name given', async () => {
    listMigrations.mockResolvedValue([
      { name: '20260228_120000_first.json', status: 'applied', appliedAt: '2026-02-28' },
      { name: '20260228_130000_second.json', status: 'pending', appliedAt: null },
    ]);
    readJson.mockResolvedValue({
      operations: [
        {
          action: 'create',
          type: 'studioFlows',
          data: {
            friendlyName: 'Test',
            definition: { states: [] },
          },
        },
      ],
    });
    mockFlowValidateCreate.mockResolvedValue({ valid: true });

    await validateStudioFlowsCommand({ ...baseOpts });

    expect(mockDisplay.info).toHaveBeenCalledWith(expect.stringContaining('20260228_130000'));
    expect(mockFlowValidateCreate).toHaveBeenCalled();
  });

  test('shows info when no migrations exist', async () => {
    listMigrations.mockResolvedValue([]);

    await validateStudioFlowsCommand({ ...baseOpts });

    expect(mockDisplay.info).toHaveBeenCalledWith(expect.stringContaining('migration'));
    expect(mockFlowValidateCreate).not.toHaveBeenCalled();
  });

  test('shows info when no pending migrations', async () => {
    listMigrations.mockResolvedValue([
      { name: 'applied.json', status: 'applied', appliedAt: '2026-01-01' },
    ]);

    await validateStudioFlowsCommand({ ...baseOpts });

    expect(mockDisplay.info).toHaveBeenCalledWith(expect.stringContaining('pendente'));
    expect(mockFlowValidateCreate).not.toHaveBeenCalled();
  });

  test('shows error when migration file not found', async () => {
    readJson.mockRejectedValue(new Error('ENOENT'));

    await validateStudioFlowsCommand({ ...baseOpts, migrationName: 'missing.json' });

    expect(mockDisplay.error).toHaveBeenCalledWith(expect.stringContaining('missing.json'));
  });

  test('validates multiple studioFlows operations', async () => {
    readJson.mockResolvedValue({
      operations: [
        {
          action: 'create',
          type: 'studioFlows',
          data: { friendlyName: 'Flow A', definition: { a: 1 } },
        },
        { action: 'create', type: 'taskQueues', data: { friendlyName: 'Queue' } },
        {
          action: 'update',
          type: 'studioFlows',
          match: { friendlyName: 'Flow B' },
          data: { friendlyName: 'Flow B', definition: { b: 2 } },
        },
      ],
    });
    mockFlowValidateCreate
      .mockResolvedValueOnce({ valid: true })
      .mockResolvedValueOnce({ valid: true });

    await validateStudioFlowsCommand({ ...baseOpts, migrationName: 'multi.json' });

    expect(mockFlowValidateCreate).toHaveBeenCalledTimes(2);
    expect(mockDisplay.info).toHaveBeenCalledWith(expect.stringContaining('2 operacao'));
  });

  test('handles definition as string', async () => {
    const defStr = '{"description":"test","states":[]}';
    readJson.mockResolvedValue({
      operations: [
        {
          action: 'create',
          type: 'studioFlows',
          data: { friendlyName: 'Flow', definition: defStr },
        },
      ],
    });
    mockFlowValidateCreate.mockResolvedValue({ valid: true });

    await validateStudioFlowsCommand({ ...baseOpts, migrationName: 'test.json' });

    expect(mockFlowValidateCreate).toHaveBeenCalledWith(
      expect.objectContaining({ definition: defStr }),
    );
  });
});
