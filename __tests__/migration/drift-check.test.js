import { jest } from '@jest/globals';

const mockFetchResource = jest.fn();
jest.unstable_mockModule('../../src/twilio/fetchers.js', () => ({
  fetchResource: mockFetchResource,
  RESOURCE_TYPES: ['workspace', 'taskQueues', 'workflows', 'studioFlows'],
}));

const { detectDrift } = await import('../../src/migration/drift-check.js');

describe('detectDrift', () => {
  beforeEach(() => jest.clearAllMocks());

  test('reports no drift when cloud matches local state', async () => {
    mockFetchResource.mockResolvedValueOnce([
      { sid: 'WQ1', friendlyName: 'A', targetWorkers: '1==1' },
    ]);

    const state = {
      taskQueues: { resources: [{ sid: 'WQ1', friendlyName: 'A', targetWorkers: '1==1' }] },
    };
    const ops = [{ action: 'update', type: 'taskQueues', match: { friendlyName: 'A' }, data: {} }];

    const result = await detectDrift({ accountSid: 'AC1' }, state, ops);
    expect(result.hasDrift).toBe(false);
    expect(result.drifts).toEqual([]);
  });

  test('reports drift when cloud has resource not in local state', async () => {
    mockFetchResource.mockResolvedValueOnce([
      { sid: 'WQ1', friendlyName: 'A' },
      { sid: 'WQ2', friendlyName: 'B' },
    ]);

    const state = { taskQueues: { resources: [{ sid: 'WQ1', friendlyName: 'A' }] } };
    const ops = [{ action: 'update', type: 'taskQueues', match: { friendlyName: 'A' }, data: {} }];

    const result = await detectDrift({ accountSid: 'AC1' }, state, ops);
    expect(result.hasDrift).toBe(true);
    expect(result.drifts).toHaveLength(1);
    expect(result.drifts[0].type).toBe('taskQueues');
  });

  test('skips workspace operations', async () => {
    const state = {};
    const ops = [{ action: 'update', type: 'workspace', match: {}, data: {} }];
    const result = await detectDrift({}, state, ops);
    expect(mockFetchResource).not.toHaveBeenCalled();
    expect(result.hasDrift).toBe(false);
  });

  test('reports fetch error per type without aborting whole check', async () => {
    mockFetchResource
      .mockRejectedValueOnce(new Error('Network'))
      .mockResolvedValueOnce([{ sid: 'WW1', friendlyName: 'W' }]);

    const state = { workflows: { resources: [{ sid: 'WW1', friendlyName: 'W' }] } };
    const ops = [
      { action: 'update', type: 'taskQueues', match: { friendlyName: 'A' }, data: {} },
      { action: 'update', type: 'workflows', match: { friendlyName: 'W' }, data: {} },
    ];

    const result = await detectDrift({}, state, ops);
    expect(result.hasDrift).toBe(true);
    expect(result.drifts.find((d) => d.type === 'taskQueues').error).toBe('Network');
    expect(result.drifts.find((d) => d.type === 'workflows')).toBeUndefined();
  });

  test('only fetches each type once even if many ops', async () => {
    mockFetchResource.mockResolvedValueOnce([{ sid: 'WQ1', friendlyName: 'A' }]);

    const state = { taskQueues: { resources: [{ sid: 'WQ1', friendlyName: 'A' }] } };
    const ops = [
      { action: 'update', type: 'taskQueues', match: { friendlyName: 'A' }, data: {} },
      { action: 'create', type: 'taskQueues', data: { friendlyName: 'B' } },
      { action: 'delete', type: 'taskQueues', match: { friendlyName: 'A' } },
    ];

    await detectDrift({}, state, ops);
    expect(mockFetchResource).toHaveBeenCalledTimes(1);
  });
});
