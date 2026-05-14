import { jest } from '@jest/globals';

const mockFetchOne = jest.fn();
jest.unstable_mockModule('../../src/twilio/fetch-one.js', () => ({
  fetchOne: mockFetchOne,
}));

const { verifyOperation } = await import('../../src/migration/verify.js');

describe('verifyOperation', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns ok when cloud matches expected', async () => {
    mockFetchOne.mockResolvedValueOnce({ sid: 'WQ1', friendlyName: 'A', targetWorkers: '1==1' });
    const op = {
      action: 'update',
      type: 'taskQueues',
      match: { friendlyName: 'A' },
      data: { targetWorkers: '1==1' },
    };
    const result = await verifyOperation({}, op, { sid: 'WQ1' }, 'WS1');
    expect(result.ok).toBe(true);
    expect(result.mismatches).toEqual([]);
  });

  test('reports mismatches when cloud differs', async () => {
    mockFetchOne.mockResolvedValueOnce({
      sid: 'WQ1',
      friendlyName: 'A',
      targetWorkers: 'OLD',
      maxReservedWorkers: 5,
    });
    const op = {
      action: 'update',
      type: 'taskQueues',
      match: { friendlyName: 'A' },
      data: { targetWorkers: 'NEW', maxReservedWorkers: 10 },
    };
    const result = await verifyOperation({}, op, { sid: 'WQ1' }, 'WS1');
    expect(result.ok).toBe(false);
    expect(result.mismatches).toHaveLength(2);
    expect(result.mismatches.find((m) => m.field === 'targetWorkers')).toMatchObject({
      expected: 'NEW',
      actual: 'OLD',
    });
  });

  test('skips delete operations', async () => {
    const op = { action: 'delete', type: 'taskQueues', match: { friendlyName: 'X' } };
    const result = await verifyOperation({}, op, { sid: 'WQ1' }, 'WS1');
    expect(result.ok).toBe(true);
    expect(mockFetchOne).not.toHaveBeenCalled();
  });

  test('skips workspace type', async () => {
    const op = { action: 'update', type: 'workspace', match: {}, data: { friendlyName: 'W' } };
    const result = await verifyOperation({}, op, { sid: 'WS1' }, 'WS1');
    expect(result.ok).toBe(true);
    expect(mockFetchOne).not.toHaveBeenCalled();
  });

  test('skips partial mode updates', async () => {
    const op = {
      action: 'update',
      type: 'studioFlows',
      match: { friendlyName: 'F' },
      mode: 'partial',
      widgetOps: [],
      data: { definition: { x: 1 } },
    };
    const result = await verifyOperation({}, op, { sid: 'FW1' }, 'WS1');
    expect(result.ok).toBe(true);
    expect(result.skipped).toBe('partial');
    expect(mockFetchOne).not.toHaveBeenCalled();
  });

  test('reports fetchError when refetch fails', async () => {
    mockFetchOne.mockRejectedValueOnce(new Error('Network'));
    const op = {
      action: 'update',
      type: 'taskQueues',
      match: { friendlyName: 'A' },
      data: { targetWorkers: 'X' },
    };
    const result = await verifyOperation({}, op, { sid: 'WQ1' }, 'WS1');
    expect(result.ok).toBe(false);
    expect(result.fetchError).toBe('Network');
  });

  test('normalizes JSON string vs object for definition field', async () => {
    const def = { description: 'flow', states: {} };
    mockFetchOne.mockResolvedValueOnce({ sid: 'FW1', definition: def });
    const op = {
      action: 'update',
      type: 'studioFlows',
      match: { friendlyName: 'F' },
      data: { definition: JSON.stringify(def) },
    };
    const result = await verifyOperation({}, op, { sid: 'FW1' }, 'WS1');
    expect(result.ok).toBe(true);
  });
});
