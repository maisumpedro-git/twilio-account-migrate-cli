import { describe, expect, test } from '@jest/globals';

import { generateMigration } from '../../src/migration/generator.js';

describe('generateMigration', () => {
  test('generates migration with create ops when state is empty', () => {
    const cloudData = {
      taskQueues: [{ sid: 'WQ1', friendlyName: 'Queue A', targetWorkers: '1==1' }],
    };
    const localStates = {
      taskQueues: { fetchedAt: null, resources: [] },
    };
    const result = generateMigration(cloudData, localStates, ['taskQueues']);
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].action).toBe('create');
    expect(result.operations[0].type).toBe('taskQueues');
    expect(result.rollback).toHaveLength(1);
    expect(result.rollback[0].action).toBe('delete');
  });

  test('generates migration with delete ops when cloud is empty', () => {
    const cloudData = { taskQueues: [] };
    const localStates = {
      taskQueues: {
        fetchedAt: '2026-01-01',
        resources: [{ sid: 'WQ1', friendlyName: 'Queue A', targetWorkers: '1==1' }],
      },
    };
    const result = generateMigration(cloudData, localStates, ['taskQueues']);
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].action).toBe('delete');
    expect(result.rollback[0].action).toBe('create');
  });

  test('generates migration with update ops for changed resources', () => {
    const cloudData = {
      taskQueues: [{ sid: 'WQ1', friendlyName: 'Queue A', targetWorkers: 'skills HAS "x"' }],
    };
    const localStates = {
      taskQueues: {
        fetchedAt: '2026-01-01',
        resources: [{ sid: 'WQ1', friendlyName: 'Queue A', targetWorkers: '1==1' }],
      },
    };
    const result = generateMigration(cloudData, localStates, ['taskQueues']);
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].action).toBe('update');
    expect(result.rollback[0].data.targetWorkers).toBe('1==1');
  });

  test('returns null when no differences', () => {
    const cloudData = {
      taskQueues: [{ sid: 'WQ1', friendlyName: 'Queue A', targetWorkers: '1==1' }],
    };
    const localStates = {
      taskQueues: {
        fetchedAt: '2026-01-01',
        resources: [{ sid: 'WQ2', friendlyName: 'Queue A', targetWorkers: '1==1' }],
      },
    };
    const result = generateMigration(cloudData, localStates, ['taskQueues']);
    expect(result).toBeNull();
  });

  test('handles multiple resource types', () => {
    const cloudData = {
      taskQueues: [{ sid: 'WQ1', friendlyName: 'Q1', targetWorkers: '1==1' }],
      workflows: [{ sid: 'WW1', friendlyName: 'W1', configuration: {} }],
    };
    const localStates = {
      taskQueues: { fetchedAt: null, resources: [] },
      workflows: { fetchedAt: null, resources: [] },
    };
    const result = generateMigration(cloudData, localStates, ['taskQueues', 'workflows']);
    expect(result.operations).toHaveLength(2);
  });

  test('includes source: "pull" and createdAt', () => {
    const cloudData = { taskQueues: [{ sid: 'WQ1', friendlyName: 'Q', targetWorkers: '1==1' }] };
    const localStates = { taskQueues: { fetchedAt: null, resources: [] } };
    const result = generateMigration(cloudData, localStates, ['taskQueues']);
    expect(result.source).toBe('pull');
    expect(result.createdAt).toBeDefined();
  });

  test('retorna null quando cloudData e localStates tem @ref para o mesmo recurso', () => {
    // Apos o fix no pullCommand, ambos os lados sao normalizados com @refs antes da comparacao
    const cloudData = {
      taskQueues: [{ sid: 'WQ111', friendlyName: 'Support', targetWorkers: '1==1' }],
      workflows: [
        {
          sid: 'WW222',
          friendlyName: 'Main Workflow',
          taskReservationTimeout: 120,
          configuration: {
            task_routing: {
              default_filter: { queue: '@ref:taskQueues:Support' },
            },
          },
        },
      ],
    };

    const localStates = {
      taskQueues: {
        fetchedAt: '2026-01-01T00:00:00.000Z',
        resources: [{ sid: 'WQ111', friendlyName: 'Support', targetWorkers: '1==1' }],
      },
      workflows: {
        fetchedAt: '2026-01-01T00:00:00.000Z',
        resources: [
          {
            sid: 'WW222',
            friendlyName: 'Main Workflow',
            taskReservationTimeout: 120,
            configuration: {
              task_routing: {
                default_filter: { queue: '@ref:taskQueues:Support' },
              },
            },
          },
        ],
      },
    };

    const result = generateMigration(cloudData, localStates, ['taskQueues', 'workflows']);

    // Ambos os lados com @refs — nenhuma diferenca, retorna null
    expect(result).toBeNull();
  });

  test('sorts operations: create queues before workflows, delete queues after workflows, studioFlows last', () => {
    const cloudData = {
      taskQueues: [{ sid: 'WQ1', friendlyName: 'New Queue', targetWorkers: '1==1' }],
      workflows: [{ sid: 'WW1', friendlyName: 'New Workflow', configuration: {} }],
      studioFlows: [
        {
          sid: 'FW1',
          friendlyName: 'New Flow',
          definition: { description: 'test', states: {} },
        },
      ],
    };
    const localStates = {
      taskQueues: {
        fetchedAt: '2026-01-01',
        resources: [{ sid: 'WQ_OLD', friendlyName: 'Old Queue', targetWorkers: '1==1' }],
      },
      workflows: {
        fetchedAt: '2026-01-01',
        resources: [{ sid: 'WW_OLD', friendlyName: 'Old Workflow', configuration: {} }],
      },
      studioFlows: {
        fetchedAt: '2026-01-01',
        resources: [
          {
            sid: 'FW_OLD',
            friendlyName: 'Old Flow',
            definition: { description: 'old', states: {} },
          },
        ],
      },
    };

    const result = generateMigration(cloudData, localStates, [
      'taskQueues',
      'workflows',
      'studioFlows',
    ]);

    // Should have: create New Queue, create New Workflow, delete Old Workflow, delete Old Queue, create New Flow, delete Old Flow
    const types = result.operations.map((op) => `${op.type}:${op.action}`);

    // Find indices
    const createQueueIdx = types.findIndex((t) => t === 'taskQueues:create');
    const workflowOps = types.reduce(
      (acc, t, i) => (t.startsWith('workflows:') ? [...acc, i] : acc),
      [],
    );
    const deleteQueueIdx = types.findIndex((t) => t === 'taskQueues:delete');
    const studioOps = types.reduce(
      (acc, t, i) => (t.startsWith('studioFlows:') ? [...acc, i] : acc),
      [],
    );

    // Create queues before any workflow operation
    if (createQueueIdx >= 0 && workflowOps.length > 0) {
      expect(createQueueIdx).toBeLessThan(Math.min(...workflowOps));
    }

    // All workflow ops before delete queues
    if (workflowOps.length > 0 && deleteQueueIdx >= 0) {
      expect(Math.max(...workflowOps)).toBeLessThan(deleteQueueIdx);
    }

    // Delete queues before any studioFlow operation
    if (deleteQueueIdx >= 0 && studioOps.length > 0) {
      expect(deleteQueueIdx).toBeLessThan(Math.min(...studioOps));
    }

    // Create queues before studioFlows
    if (createQueueIdx >= 0 && studioOps.length > 0) {
      expect(createQueueIdx).toBeLessThan(Math.min(...studioOps));
    }
  });

  test('sorts contentTemplates:create before workflows:create so @ref:contentTemplates resolves', () => {
    const cloudData = {
      contentTemplates: [
        { sid: 'HX1', friendlyName: 'Welcome', types: { 'twilio/text': { body: 'hi' } } },
      ],
      workflows: [
        {
          sid: 'WW1',
          friendlyName: 'Main',
          configuration: {
            task_routing: {
              default_filter: { queue: '@ref:taskQueues:Support' },
            },
          },
        },
      ],
      studioFlows: [
        {
          sid: 'FW1',
          friendlyName: 'IVR',
          definition: {
            states: [{ properties: { content_template_sid: '@ref:contentTemplates:Welcome' } }],
          },
        },
      ],
    };
    const localStates = {
      contentTemplates: { fetchedAt: null, resources: [] },
      workflows: { fetchedAt: null, resources: [] },
      studioFlows: { fetchedAt: null, resources: [] },
    };

    const result = generateMigration(cloudData, localStates, [
      'contentTemplates',
      'workflows',
      'studioFlows',
    ]);

    const types = result.operations.map((op) => `${op.type}:${op.action}`);
    const createTemplateIdx = types.findIndex((t) => t === 'contentTemplates:create');
    const createWorkflowIdx = types.findIndex((t) => t === 'workflows:create');
    const createFlowIdx = types.findIndex((t) => t === 'studioFlows:create');

    // contentTemplates:create must come before workflows:create
    expect(createTemplateIdx).toBeLessThan(createWorkflowIdx);
    // contentTemplates:create must come before studioFlows:create
    expect(createTemplateIdx).toBeLessThan(createFlowIdx);
  });
});
