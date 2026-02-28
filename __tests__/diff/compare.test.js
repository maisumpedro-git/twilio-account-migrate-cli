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
