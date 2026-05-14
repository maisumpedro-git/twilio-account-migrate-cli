import { jest } from '@jest/globals';

const {
  collectStudioFlowDefinitions,
  validateStudioFlowsOperations,
} = await import('../../src/migration/studio-validator.js');

describe('collectStudioFlowDefinitions', () => {
  test('collects only studioFlows create/update operations with a definition', () => {
    const operations = [
      {
        action: 'create',
        type: 'studioFlows',
        data: { friendlyName: 'A', definition: { x: 1 } },
      },
      {
        action: 'update',
        type: 'studioFlows',
        match: { friendlyName: 'B' },
        data: { friendlyName: 'B', definition: { y: 2 }, status: 'draft' },
      },
      { action: 'delete', type: 'studioFlows', match: { friendlyName: 'C' } },
      { action: 'create', type: 'taskQueues', data: { friendlyName: 'Q' } },
      { action: 'update', type: 'studioFlows', match: { friendlyName: 'D' }, data: {} },
      {
        action: 'update',
        type: 'studioFlows',
        match: { friendlyName: 'E' },
        mode: 'partial',
        widgetOps: [],
      },
    ];

    const result = collectStudioFlowDefinitions(operations);
    expect(result).toEqual([
      { name: 'A', action: 'create', status: undefined, definition: { x: 1 } },
      { name: 'B', action: 'update', status: 'draft', definition: { y: 2 } },
    ]);
  });

  test('returns empty array for null/undefined operations', () => {
    expect(collectStudioFlowDefinitions(undefined)).toEqual([]);
    expect(collectStudioFlowDefinitions([])).toEqual([]);
  });
});

describe('validateStudioFlowsOperations', () => {
  function makeApi(impl) {
    return { studio: { v2: { flowValidate: { update: impl } } } };
  }

  test('returns ok=true and checked=0 when no studio flow operations', async () => {
    const api = makeApi(jest.fn());
    const result = await validateStudioFlowsOperations(api, [
      { action: 'create', type: 'taskQueues', data: { friendlyName: 'Q' } },
    ]);
    expect(result).toEqual({ ok: true, checked: 0, failures: [] });
    expect(api.studio.v2.flowValidate.update).not.toHaveBeenCalled();
  });

  test('calls flowValidate.update with friendlyName, status, definition for each flow', async () => {
    const update = jest.fn().mockResolvedValue({ valid: true });
    const api = makeApi(update);

    await validateStudioFlowsOperations(api, [
      {
        action: 'create',
        type: 'studioFlows',
        data: { friendlyName: 'A', definition: { x: 1 }, status: 'draft' },
      },
      {
        action: 'update',
        type: 'studioFlows',
        match: { friendlyName: 'B' },
        data: { friendlyName: 'B', definition: { y: 2 } },
      },
    ]);

    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenNthCalledWith(1, {
      friendlyName: 'A',
      status: 'draft',
      definition: { x: 1 },
    });
    expect(update).toHaveBeenNthCalledWith(2, {
      friendlyName: 'B',
      status: 'published',
      definition: { y: 2 },
    });
  });

  test('captures failures when API throws', async () => {
    const apiErr = new Error('Validation failed');
    apiErr.details = { errors: [{ message: 'bad', property_path: '#/x' }] };
    const update = jest.fn().mockRejectedValue(apiErr);
    const api = makeApi(update);

    const result = await validateStudioFlowsOperations(api, [
      {
        action: 'create',
        type: 'studioFlows',
        data: { friendlyName: 'Bad', definition: { x: 1 } },
      },
    ]);

    expect(result.ok).toBe(false);
    expect(result.checked).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({ name: 'Bad', action: 'create', err: apiErr });
  });

  test('captures failure when result.valid is false', async () => {
    const update = jest
      .fn()
      .mockResolvedValue({ valid: false, errors: [{ message: 'oops' }] });
    const api = makeApi(update);

    const result = await validateStudioFlowsOperations(api, [
      {
        action: 'create',
        type: 'studioFlows',
        data: { friendlyName: 'X', definition: { x: 1 } },
      },
    ]);

    expect(result.ok).toBe(false);
    expect(result.failures[0].name).toBe('X');
    expect(result.failures[0].err).toBeInstanceOf(Error);
  });

  test('validates multiple flows and collects all failures', async () => {
    const apiErr = new Error('boom');
    const update = jest
      .fn()
      .mockResolvedValueOnce({ valid: true })
      .mockRejectedValueOnce(apiErr)
      .mockResolvedValueOnce({ valid: false });
    const api = makeApi(update);

    const result = await validateStudioFlowsOperations(api, [
      { action: 'create', type: 'studioFlows', data: { friendlyName: 'A', definition: {} } },
      { action: 'create', type: 'studioFlows', data: { friendlyName: 'B', definition: {} } },
      { action: 'create', type: 'studioFlows', data: { friendlyName: 'C', definition: {} } },
    ]);

    expect(result.checked).toBe(3);
    expect(result.failures.map((f) => f.name)).toEqual(['B', 'C']);
  });
});
