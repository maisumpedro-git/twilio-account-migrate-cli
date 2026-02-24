import { buildCrossMapping, extractSidsFromResources } from '../src/variables/extract.js';

test('extractSidsFromResources finds SIDs in cached resources', () => {
  const cached = {
    workspace: {
      fetchedAt: '2026-01-01T00:00:00.000Z',
      data: { sid: 'WS12345678901234567890123456789012', friendlyName: 'Main Workspace' },
    },
    taskQueues: {
      fetchedAt: '2026-01-01T00:00:00.000Z',
      data: [
        { sid: 'WQ12345678901234567890123456789012', friendlyName: 'Support Queue' },
        { sid: 'WQ22345678901234567890123456789012', friendlyName: 'Sales Queue' },
      ],
    },
  };

  const sids = extractSidsFromResources(cached);

  expect(sids['WS12345678901234567890123456789012']).toEqual({
    type: 'workspace',
    typeLabel: 'Workspace',
    name: 'Main Workspace',
    field: 'sid',
  });

  expect(sids['WQ12345678901234567890123456789012']).toEqual({
    type: 'taskQueues',
    typeLabel: 'Task Queues',
    name: 'Support Queue',
    field: 'sid',
  });

  expect(sids['WQ22345678901234567890123456789012']).toBeDefined();
});

test('extractSidsFromResources finds nested SIDs', () => {
  const cached = {
    studioFlows: {
      fetchedAt: '2026-01-01T00:00:00.000Z',
      data: [
        {
          sid: 'FW12345678901234567890123456789012',
          friendlyName: 'Main Flow',
          definition: {
            states: [
              {
                properties: {
                  workflow_sid: 'WW12345678901234567890123456789012',
                },
              },
            ],
          },
        },
      ],
    },
  };

  const sids = extractSidsFromResources(cached);
  expect(sids['FW12345678901234567890123456789012']).toBeDefined();
  expect(sids['WW12345678901234567890123456789012']).toBeDefined();
  expect(sids['WW12345678901234567890123456789012'].name).toBe('Main Flow');
});

test('buildCrossMapping creates mapping between source and dest', () => {
  const sourceVars = {
    sids: {
      WQ11111111111111111111111111111111: {
        type: 'taskQueues',
        name: 'Support Queue',
        field: 'sid',
      },
      FW11111111111111111111111111111111: {
        type: 'studioFlows',
        name: 'Main Flow',
        field: 'sid',
      },
    },
  };

  const destVars = {
    sids: {
      WQ22222222222222222222222222222222: {
        type: 'taskQueues',
        name: 'Support Queue',
        field: 'sid',
      },
      FW22222222222222222222222222222222: {
        type: 'studioFlows',
        name: 'Main Flow',
        field: 'sid',
      },
    },
  };

  const { mapping, variables } = buildCrossMapping(sourceVars, destVars);

  expect(mapping['WQ11111111111111111111111111111111']).toBe(
    'WQ22222222222222222222222222222222',
  );
  expect(mapping['FW11111111111111111111111111111111']).toBe(
    'FW22222222222222222222222222222222',
  );
  expect(variables['taskQueues.Support Queue'].source).toBe(
    'WQ11111111111111111111111111111111',
  );
  expect(variables['taskQueues.Support Queue'].dest).toBe('WQ22222222222222222222222222222222');
});

test('buildCrossMapping skips resources without match', () => {
  const sourceVars = {
    sids: {
      WQ11111111111111111111111111111111: {
        type: 'taskQueues',
        name: 'Queue A',
        field: 'sid',
      },
    },
  };

  const destVars = {
    sids: {
      WQ22222222222222222222222222222222: {
        type: 'taskQueues',
        name: 'Queue B',
        field: 'sid',
      },
    },
  };

  const { mapping } = buildCrossMapping(sourceVars, destVars);
  expect(Object.keys(mapping)).toHaveLength(0);
});
