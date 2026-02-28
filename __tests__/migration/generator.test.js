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
});
