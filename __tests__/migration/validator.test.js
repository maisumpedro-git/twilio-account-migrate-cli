import { describe, expect, test } from '@jest/globals';

import { validateMigration } from '../../src/migration/validator.js';

describe('validateMigration', () => {
  test('valid create operation passes', () => {
    const migration = {
      operations: [{ action: 'create', type: 'taskQueues', data: { friendlyName: 'Q' } }],
    };
    expect(() => validateMigration(migration)).not.toThrow();
  });

  test('valid update operation passes', () => {
    const migration = {
      operations: [
        {
          action: 'update',
          type: 'taskQueues',
          match: { friendlyName: 'Q' },
          data: { targetWorkers: '1==1' },
        },
      ],
    };
    expect(() => validateMigration(migration)).not.toThrow();
  });

  test('valid delete operation passes', () => {
    const migration = {
      operations: [{ action: 'delete', type: 'taskQueues', match: { friendlyName: 'Q' } }],
    };
    expect(() => validateMigration(migration)).not.toThrow();
  });

  test('rejects migration without operations array', () => {
    expect(() => validateMigration({})).toThrow('operations');
  });

  test('rejects operation without action', () => {
    const migration = { operations: [{ type: 'taskQueues', data: { friendlyName: 'Q' } }] };
    expect(() => validateMigration(migration)).toThrow('action');
  });

  test('rejects operation without type', () => {
    const migration = { operations: [{ action: 'create', data: { friendlyName: 'Q' } }] };
    expect(() => validateMigration(migration)).toThrow('type');
  });

  test('rejects create without data.friendlyName', () => {
    const migration = {
      operations: [{ action: 'create', type: 'taskQueues', data: { targetWorkers: '1==1' } }],
    };
    expect(() => validateMigration(migration)).toThrow('friendlyName');
  });

  test('rejects update without match.friendlyName', () => {
    const migration = {
      operations: [{ action: 'update', type: 'taskQueues', data: { targetWorkers: '1==1' } }],
    };
    expect(() => validateMigration(migration)).toThrow('match');
  });

  test('rejects update without data', () => {
    const migration = {
      operations: [{ action: 'update', type: 'taskQueues', match: { friendlyName: 'Q' } }],
    };
    expect(() => validateMigration(migration)).toThrow('data');
  });

  test('rejects invalid resource type', () => {
    const migration = {
      operations: [{ action: 'create', type: 'invalid', data: { friendlyName: 'Q' } }],
    };
    expect(() => validateMigration(migration)).toThrow('type');
  });

  test('allows empty operations array (manual migration template)', () => {
    const migration = { operations: [] };
    expect(() => validateMigration(migration)).not.toThrow();
  });

  test('valid studioFlows update with full definition passes', () => {
    const migration = {
      operations: [
        {
          action: 'update',
          type: 'studioFlows',
          match: { friendlyName: 'Main Flow' },
          data: {
            definition: {
              description: 'A flow',
              states: { Trigger: { type: 'trigger' } },
              initial_state: 'Trigger',
            },
          },
        },
      ],
    };
    expect(() => validateMigration(migration)).not.toThrow();
  });
});
