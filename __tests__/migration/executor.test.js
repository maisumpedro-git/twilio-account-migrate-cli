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
      operations: [{ action: 'create', type: 'taskQueues', data: { friendlyName: 'Queue A' } }],
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

  test('wraps thrown error with operation context and preserves Twilio details', async () => {
    const apiErr = new Error('Validation failed');
    apiErr.status = 400;
    apiErr.code = 20001;
    apiErr.moreInfo = 'https://example.com';
    apiErr.details = { errors: [{ message: 'bad', property_path: '#/x' }] };

    executeOperation.mockRejectedValueOnce(apiErr);

    const migration = {
      operations: [
        {
          action: 'update',
          type: 'studioFlows',
          match: { friendlyName: 'Main IVR' },
          data: { friendlyName: 'Main IVR', definition: {} },
        },
      ],
    };

    let caught;
    try {
      await executeMigration(mockApi, migration, state, 'WS1');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect(caught.message).toContain('Operação 1/1');
    expect(caught.message).toContain('update studioFlows: Main IVR');
    expect(caught.message).toContain('Validation failed');
    expect(caught.details).toBe(apiErr.details);
    expect(caught.status).toBe(400);
    expect(caught.code).toBe(20001);
    expect(caught.moreInfo).toBe('https://example.com');
    expect(caught.operationIndex).toBe(0);
    expect(caught.operationAction).toBe('update');
    expect(caught.operationType).toBe('studioFlows');
    expect(caught.operationName).toBe('Main IVR');
    expect(caught.cause).toBe(apiErr);
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
      operations: [{ action: 'create', type: 'taskQueues', data: { friendlyName: 'Queue A' } }],
    };

    const results = await executeMigration(mockApi, migration, state, 'WS1');
    expect(results[0]).toHaveProperty('operation');
    expect(results[0]).toHaveProperty('status', 'ok');
    expect(results[0]).toHaveProperty('result');
    expect(results[0].result.sid).toBe('WQ_NEW');
  });

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

  test('skips operations before startIndex', async () => {
    executeOperation.mockResolvedValueOnce({ sid: 'WQ3', friendlyName: 'Q3' });

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
      operations: [{ action: 'create', type: 'taskQueues', data: { friendlyName: 'Q1' } }],
    };

    await executeMigration(mockApi, migration, state, 'WS1', { dryRun: true, onProgress });
    expect(onProgress).not.toHaveBeenCalled();
  });

  test('awaits async onProgress before returning (prevents race condition with file writes)', async () => {
    executeOperation.mockResolvedValueOnce({ sid: 'WQ1', friendlyName: 'Q1' });

    let lastProgressCompleted = false;
    const onProgress = jest.fn(async () => {
      // Simulate async file write (like markPartiallyApplied)
      await new Promise((resolve) => setTimeout(resolve, 50));
      lastProgressCompleted = true;
    });

    // Single operation — no inter-operation sleep to mask the race condition
    const migration = {
      operations: [{ action: 'create', type: 'taskQueues', data: { friendlyName: 'Q1' } }],
    };

    await executeMigration(mockApi, migration, state, 'WS1', { onProgress });

    // If onProgress is not awaited, lastProgressCompleted will still be false here
    // because the async callback hasn't finished yet when executeMigration returns
    expect(lastProgressCompleted).toBe(true);
    expect(onProgress).toHaveBeenCalledTimes(1);
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
});
