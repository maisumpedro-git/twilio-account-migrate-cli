import { describe, expect, test } from '@jest/globals';

import { diffResources } from '../../src/diff/compare.js';

describe('diffResources', () => {
  test('detects resource only in cloud (create)', () => {
    const cloud = [{ sid: 'WQ1', friendlyName: 'Queue A', targetWorkers: '1==1' }];
    const local = [];
    const result = diffResources(cloud, local);
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe('create');
    expect(result[0].data.friendlyName).toBe('Queue A');
    expect(result[0].data.sid).toBeUndefined();
  });

  test('detects resource only in local state (delete)', () => {
    const cloud = [];
    const local = [{ sid: 'WQ1', friendlyName: 'Queue A', targetWorkers: '1==1' }];
    const result = diffResources(cloud, local);
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe('delete');
    expect(result[0].match.friendlyName).toBe('Queue A');
  });

  test('detects updated resource (changed fields only)', () => {
    const cloud = [
      {
        sid: 'WQ1',
        friendlyName: 'Queue A',
        targetWorkers: 'skills HAS "support"',
        maxReservedWorkers: 5,
      },
    ];
    const local = [
      { sid: 'WQ1', friendlyName: 'Queue A', targetWorkers: '1==1', maxReservedWorkers: 5 },
    ];
    const result = diffResources(cloud, local);
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe('update');
    expect(result[0].match.friendlyName).toBe('Queue A');
    expect(result[0].data.targetWorkers).toBe('skills HAS "support"');
    expect(result[0].data.maxReservedWorkers).toBeUndefined(); // unchanged
  });

  test('returns empty array when no differences', () => {
    const cloud = [{ sid: 'WQ1', friendlyName: 'Queue A', targetWorkers: '1==1' }];
    const local = [{ sid: 'WQ2', friendlyName: 'Queue A', targetWorkers: '1==1' }];
    const result = diffResources(cloud, local);
    expect(result).toHaveLength(0);
  });

  test('ignores metadata fields (sid, accountSid, dateCreated, dateUpdated, url, links)', () => {
    const cloud = [
      {
        sid: 'WQ1',
        accountSid: 'AC1',
        friendlyName: 'Q',
        dateCreated: '2026-01-01',
        url: 'http://x',
        links: {},
      },
    ];
    const local = [
      {
        sid: 'WQ2',
        accountSid: 'AC2',
        friendlyName: 'Q',
        dateCreated: '2025-01-01',
        url: 'http://y',
        links: {},
      },
    ];
    const result = diffResources(cloud, local);
    expect(result).toHaveLength(0);
  });

  test('matches by uniqueName when friendlyName is absent', () => {
    const cloud = [
      { sid: 'HX1', uniqueName: 'template_a', types: { 'twilio/text': { body: 'hello' } } },
    ];
    const local = [];
    const result = diffResources(cloud, local);
    expect(result).toHaveLength(1);
    expect(result[0].data.uniqueName).toBe('template_a');
  });
});

describe('diffResources — Studio Flow widget-level diff', () => {
  const makeFlow = (name, states, extras = {}) => ({
    sid: 'FW123',
    friendlyName: name,
    status: 'published',
    definition: {
      description: 'A flow',
      states: states,
      initial_state: 'Trigger',
      flags: { allow_concurrent_calls: true },
      ...extras,
    },
  });

  test('detects new widget as create_widget', () => {
    const cloud = [
      makeFlow('Flow A', {
        Trigger: { type: 'trigger', transitions: [] },
        NewStep: { type: 'send-message', transitions: [], properties: { body: 'hi' } },
      }),
    ];
    const local = [
      makeFlow('Flow A', {
        Trigger: { type: 'trigger', transitions: [] },
      }),
    ];
    const result = diffResources(cloud, local);
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe('update');
    expect(result[0].mode).toBe('partial');
    expect(result[0].widgetOps).toHaveLength(1);
    expect(result[0].widgetOps[0].action).toBe('create_widget');
    expect(result[0].widgetOps[0].widget).toBe('NewStep');
  });

  test('detects removed widget as delete_widget', () => {
    const cloud = [
      makeFlow('Flow A', {
        Trigger: { type: 'trigger', transitions: [] },
      }),
    ];
    const local = [
      makeFlow('Flow A', {
        Trigger: { type: 'trigger', transitions: [] },
        OldStep: { type: 'send-message', transitions: [], properties: { body: 'hi' } },
      }),
    ];
    const result = diffResources(cloud, local);
    expect(result).toHaveLength(1);
    expect(result[0].mode).toBe('partial');
    expect(result[0].widgetOps).toHaveLength(1);
    expect(result[0].widgetOps[0].action).toBe('delete_widget');
    expect(result[0].widgetOps[0].widget).toBe('OldStep');
  });

  test('detects changed widget as update_widget with only changed fields', () => {
    const cloud = [
      makeFlow('Flow A', {
        Trigger: { type: 'trigger', transitions: [] },
        Step1: { type: 'send-message', transitions: [], properties: { body: 'new text' } },
      }),
    ];
    const local = [
      makeFlow('Flow A', {
        Trigger: { type: 'trigger', transitions: [] },
        Step1: { type: 'send-message', transitions: [], properties: { body: 'old text' } },
      }),
    ];
    const result = diffResources(cloud, local);
    expect(result).toHaveLength(1);
    expect(result[0].mode).toBe('partial');
    expect(result[0].widgetOps[0].action).toBe('update_widget');
    expect(result[0].widgetOps[0].widget).toBe('Step1');
    expect(result[0].widgetOps[0].data.properties).toEqual({ body: 'new text' });
    expect(result[0].widgetOps[0].data.type).toBeUndefined(); // unchanged
  });

  test('falls back to full update when >70% widgets changed', () => {
    // 10 widgets, 8 changed = 80%
    const cloudStates = {};
    const localStates = {};
    for (let i = 0; i < 10; i++) {
      cloudStates[`Step${i}`] = { type: 'send-message', properties: { body: 'new' } };
      localStates[`Step${i}`] = {
        type: 'send-message',
        properties: { body: i < 8 ? 'old' : 'new' },
      };
    }
    const cloud = [makeFlow('Flow A', cloudStates)];
    const local = [makeFlow('Flow A', localStates)];
    const result = diffResources(cloud, local);
    expect(result).toHaveLength(1);
    expect(result[0].mode).toBeUndefined(); // full update, no mode
    expect(result[0].widgetOps).toBeUndefined();
    expect(result[0].data.definition).toBeDefined();
  });

  test('falls back to full update when non-states fields change', () => {
    const cloud = [
      makeFlow('Flow A', { Trigger: { type: 'trigger' } }, { initial_state: 'NewTrigger' }),
    ];
    const local = [
      makeFlow('Flow A', { Trigger: { type: 'trigger' } }, { initial_state: 'Trigger' }),
    ];
    const result = diffResources(cloud, local);
    expect(result).toHaveLength(1);
    expect(result[0].mode).toBeUndefined();
    expect(result[0].data.definition).toBeDefined();
  });

  test('no widgetOps when flows have no definition changes', () => {
    const states = { Trigger: { type: 'trigger', transitions: [] } };
    const cloud = [makeFlow('Flow A', states)];
    const local = [makeFlow('Flow A', states)];
    const result = diffResources(cloud, local);
    expect(result).toHaveLength(0);
  });
});
