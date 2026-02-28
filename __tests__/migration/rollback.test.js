import { describe, expect, test } from '@jest/globals';

import { generateRollback } from '../../src/migration/rollback.js';

describe('generateRollback', () => {
  const localState = {
    taskQueues: {
      resources: [
        { sid: 'WQ1', friendlyName: 'Queue A', targetWorkers: '1==1', maxReservedWorkers: 5 },
      ],
    },
  };

  test('create → rollback is delete', () => {
    const op = {
      action: 'create',
      type: 'taskQueues',
      data: { friendlyName: 'New Queue', targetWorkers: '1==1' },
    };
    const rollback = generateRollback(op, localState);
    expect(rollback.action).toBe('delete');
    expect(rollback.type).toBe('taskQueues');
    expect(rollback.match.friendlyName).toBe('New Queue');
  });

  test('delete → rollback is create with full data from state', () => {
    const op = { action: 'delete', type: 'taskQueues', match: { friendlyName: 'Queue A' } };
    const rollback = generateRollback(op, localState);
    expect(rollback.action).toBe('create');
    expect(rollback.type).toBe('taskQueues');
    expect(rollback.data.friendlyName).toBe('Queue A');
    expect(rollback.data.targetWorkers).toBe('1==1');
    expect(rollback.data.sid).toBeUndefined();
  });

  test('update → rollback is update with old values', () => {
    const op = {
      action: 'update',
      type: 'taskQueues',
      match: { friendlyName: 'Queue A' },
      data: { targetWorkers: 'skills HAS "support"' },
    };
    const rollback = generateRollback(op, localState);
    expect(rollback.action).toBe('update');
    expect(rollback.type).toBe('taskQueues');
    expect(rollback.match.friendlyName).toBe('Queue A');
    expect(rollback.data.targetWorkers).toBe('1==1');
  });
});

describe('generateRollback — widgetOps', () => {
  test('generates inverse widgetOps for partial update', () => {
    const operation = {
      action: 'update',
      type: 'studioFlows',
      match: { friendlyName: 'Flow A' },
      mode: 'partial',
      widgetOps: [
        { action: 'create_widget', widget: 'NewStep', data: { type: 'send-message' } },
        { action: 'delete_widget', widget: 'OldStep' },
        { action: 'update_widget', widget: 'Step1', data: { properties: { body: 'new' } } },
        { action: 'rename_widget', widget: 'old_name', newName: 'new_name' },
      ],
    };
    const localState = {
      studioFlows: {
        resources: [
          {
            friendlyName: 'Flow A',
            definition: {
              states: {
                OldStep: { type: 'gather', properties: { timeout: 5 } },
                Step1: { type: 'send-message', properties: { body: 'old' } },
                old_name: { type: 'connect-call', properties: {} },
              },
            },
          },
        ],
      },
    };

    const rollback = generateRollback(operation, localState);
    expect(rollback.action).toBe('update');
    expect(rollback.mode).toBe('partial');
    expect(rollback.widgetOps).toHaveLength(4);

    // Reversed order
    expect(rollback.widgetOps[0]).toEqual({
      action: 'rename_widget',
      widget: 'new_name',
      newName: 'old_name',
    });
    expect(rollback.widgetOps[1]).toEqual({
      action: 'update_widget',
      widget: 'Step1',
      data: { properties: { body: 'old' } },
    });
    expect(rollback.widgetOps[2]).toEqual({
      action: 'create_widget',
      widget: 'OldStep',
      data: { type: 'gather', properties: { timeout: 5 } },
    });
    expect(rollback.widgetOps[3]).toEqual({
      action: 'delete_widget',
      widget: 'NewStep',
    });
  });
});
