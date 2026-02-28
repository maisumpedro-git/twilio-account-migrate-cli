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
        {
          action: 'update',
          type: 'workflows',
          match: { friendlyName: 'Workflow A' },
          data: { configuration: {} },
        },
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

  test('dry-run mode skips actual execution and returns dry-run status', async () => {
    const migration = {
      operations: [
        { action: 'create', type: 'taskQueues', data: { friendlyName: 'Queue A' } },
        { action: 'create', type: 'taskQueues', data: { friendlyName: 'Queue B' } },
      ],
    };

    const results = await executeMigration(mockApi, migration, state, 'WS1', { dryRun: true });
    expect(results).toHaveLength(2);
    expect(results[0].status).toBe('dry-run');
    expect(results[1].status).toBe('dry-run');
    expect(executeOperation).not.toHaveBeenCalled();
  });

  test('returns result objects with operation, status, and result fields', async () => {
    executeOperation.mockResolvedValueOnce({ sid: 'WQ_NEW', friendlyName: 'Queue A' });

    const migration = {
      operations: [
        { action: 'create', type: 'taskQueues', data: { friendlyName: 'Queue A' } },
      ],
    };

    const results = await executeMigration(mockApi, migration, state, 'WS1');
    expect(results[0]).toHaveProperty('operation');
    expect(results[0]).toHaveProperty('status', 'ok');
    expect(results[0]).toHaveProperty('result');
    expect(results[0].result.sid).toBe('WQ_NEW');
  });
});
