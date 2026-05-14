import { describe, expect, test } from '@jest/globals';

import { lintMigration, summarizeIssues } from '../../src/migration/linter.js';

const emptyState = {
  taskQueues: { resources: [] },
  workflows: { resources: [] },
  studioFlows: { resources: [] },
  taskChannels: { resources: [] },
  contentTemplates: { resources: [] },
  serverless: { resources: [] },
};

describe('lintMigration', () => {
  test('returns no issues for valid migration', () => {
    const state = {
      ...emptyState,
      taskQueues: { resources: [{ sid: 'WQ1', friendlyName: 'Support' }] },
    };
    const migration = {
      operations: [
        {
          action: 'update',
          type: 'taskQueues',
          match: { friendlyName: 'Support' },
          data: { targetWorkers: '1==1' },
        },
      ],
    };
    expect(lintMigration(migration, state)).toEqual([]);
  });

  test('flags update on resource missing from state', () => {
    const migration = {
      operations: [
        {
          action: 'update',
          type: 'taskQueues',
          match: { friendlyName: 'Ghost' },
          data: { targetWorkers: '1==1' },
        },
      ],
    };
    const issues = lintMigration(migration, emptyState);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].message).toContain('Ghost');
  });

  test('accepts update on resource created earlier in same migration', () => {
    const migration = {
      operations: [
        { action: 'create', type: 'taskQueues', data: { friendlyName: 'New' } },
        {
          action: 'update',
          type: 'taskQueues',
          match: { friendlyName: 'New' },
          data: { targetWorkers: '1==1' },
        },
      ],
    };
    expect(lintMigration(migration, emptyState)).toEqual([]);
  });

  test('flags @ref that does not resolve', () => {
    const migration = {
      operations: [
        {
          action: 'create',
          type: 'workflows',
          data: {
            friendlyName: 'W',
            configuration: { default_filter: { queue: '@ref:taskQueues:DoesNotExist' } },
          },
        },
      ],
    };
    const issues = lintMigration(migration, emptyState);
    expect(issues.some((i) => i.message.includes('DoesNotExist'))).toBe(true);
  });

  test('resolves @ref against state', () => {
    const state = {
      ...emptyState,
      taskQueues: { resources: [{ sid: 'WQ1', friendlyName: 'Support' }] },
    };
    const migration = {
      operations: [
        {
          action: 'create',
          type: 'workflows',
          data: {
            friendlyName: 'W',
            configuration: { default_filter: { queue: '@ref:taskQueues:Support' } },
          },
        },
      ],
    };
    expect(lintMigration(migration, state)).toEqual([]);
  });

  test('resolves @ref against runtime SIDs from previous create in same migration', () => {
    const migration = {
      operations: [
        { action: 'create', type: 'taskQueues', data: { friendlyName: 'NewQ' } },
        {
          action: 'create',
          type: 'workflows',
          data: {
            friendlyName: 'W',
            configuration: { default_filter: { queue: '@ref:taskQueues:NewQ' } },
          },
        },
      ],
    };
    expect(lintMigration(migration, emptyState)).toEqual([]);
  });

  test('warns on duplicate operations on the same resource', () => {
    const state = {
      ...emptyState,
      taskQueues: { resources: [{ sid: 'WQ1', friendlyName: 'Support' }] },
    };
    const migration = {
      operations: [
        {
          action: 'update',
          type: 'taskQueues',
          match: { friendlyName: 'Support' },
          data: { targetWorkers: 'X' },
        },
        {
          action: 'update',
          type: 'taskQueues',
          match: { friendlyName: 'Support' },
          data: { targetWorkers: 'Y' },
        },
      ],
    };
    const issues = lintMigration(migration, state);
    expect(issues.some((i) => i.severity === 'warning' && i.message.includes('duplicada'))).toBe(
      true,
    );
  });

  test('flags missing operations array', () => {
    const issues = lintMigration({}, emptyState);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
  });

  test('summarizeIssues counts errors and warnings', () => {
    const issues = [
      { severity: 'error', op: 0, message: 'a' },
      { severity: 'error', op: 1, message: 'b' },
      { severity: 'warning', op: 2, message: 'c' },
    ];
    expect(summarizeIssues(issues)).toEqual({ errors: 2, warnings: 1, total: 3 });
  });

  test('delete removes resource from runtime tracking (not available for later refs)', () => {
    const state = {
      ...emptyState,
      taskQueues: { resources: [{ sid: 'WQ1', friendlyName: 'Q' }] },
    };
    const migration = {
      operations: [
        { action: 'delete', type: 'taskQueues', match: { friendlyName: 'Q' } },
        {
          action: 'create',
          type: 'workflows',
          data: {
            friendlyName: 'W',
            configuration: { queue: '@ref:taskQueues:Q' },
          },
        },
      ],
    };
    const issues = lintMigration(migration, state);
    expect(issues.some((i) => i.message.includes('@ref:taskQueues:Q'))).toBe(true);
  });
});
