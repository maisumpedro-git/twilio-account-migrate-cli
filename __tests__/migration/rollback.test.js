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
