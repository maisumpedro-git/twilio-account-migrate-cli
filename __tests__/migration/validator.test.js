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

  test('valid partial update with widgetOps passes', () => {
    const migration = {
      operations: [
        {
          action: 'update',
          type: 'studioFlows',
          match: { friendlyName: 'Main Flow' },
          mode: 'partial',
          widgetOps: [
            { action: 'create_widget', widget: 'new_step', data: { type: 'send-message' } },
            { action: 'update_widget', widget: 'old_step', data: { properties: {} } },
            { action: 'rename_widget', widget: 'old_name', newName: 'new_name' },
            { action: 'delete_widget', widget: 'unused' },
          ],
        },
      ],
    };
    expect(() => validateMigration(migration)).not.toThrow();
  });

  test('rejects widgetOps without mode partial', () => {
    const migration = {
      operations: [
        {
          action: 'update',
          type: 'studioFlows',
          match: { friendlyName: 'Flow' },
          data: { friendlyName: 'Flow' },
          widgetOps: [{ action: 'delete_widget', widget: 'x' }],
        },
      ],
    };
    expect(() => validateMigration(migration)).toThrow('mode');
  });

  test('rejects widgetOp without action', () => {
    const migration = {
      operations: [
        {
          action: 'update',
          type: 'studioFlows',
          match: { friendlyName: 'Flow' },
          mode: 'partial',
          widgetOps: [{ widget: 'x' }],
        },
      ],
    };
    expect(() => validateMigration(migration)).toThrow('action');
  });

  test('rejects widgetOp without widget name', () => {
    const migration = {
      operations: [
        {
          action: 'update',
          type: 'studioFlows',
          match: { friendlyName: 'Flow' },
          mode: 'partial',
          widgetOps: [{ action: 'delete_widget' }],
        },
      ],
    };
    expect(() => validateMigration(migration)).toThrow('widget');
  });

  test('rejects rename_widget without newName', () => {
    const migration = {
      operations: [
        {
          action: 'update',
          type: 'studioFlows',
          match: { friendlyName: 'Flow' },
          mode: 'partial',
          widgetOps: [{ action: 'rename_widget', widget: 'old' }],
        },
      ],
    };
    expect(() => validateMigration(migration)).toThrow('newName');
  });

  test('rejects widgetOps on non-studioFlows type', () => {
    const migration = {
      operations: [
        {
          action: 'update',
          type: 'taskQueues',
          match: { friendlyName: 'Q' },
          mode: 'partial',
          widgetOps: [{ action: 'delete_widget', widget: 'x' }],
        },
      ],
    };
    expect(() => validateMigration(migration)).toThrow('studioFlows');
  });

  test('partial mode update does not require data field', () => {
    const migration = {
      operations: [
        {
          action: 'update',
          type: 'studioFlows',
          match: { friendlyName: 'Flow' },
          mode: 'partial',
          widgetOps: [{ action: 'delete_widget', widget: 'x' }],
        },
      ],
    };
    expect(() => validateMigration(migration)).not.toThrow();
  });
});
