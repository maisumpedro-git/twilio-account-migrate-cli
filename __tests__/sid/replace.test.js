import { describe, expect, test } from '@jest/globals';

import { buildSidPairs, deepReplaceSids, replaceSidsInJsonString } from '../../src/sid/replace.js';

describe('buildSidPairs', () => {
  test('extracts pairs sorted by length (longest first)', () => {
    const mapping = {
      taskrouter: {
        taskQueues: { WQ123: 'WQ456', WQ1234567890: 'WQ0987654321' },
      },
    };
    const pairs = buildSidPairs(mapping);
    expect(pairs[0][0]).toBe('WQ1234567890');
    expect(pairs[1][0]).toBe('WQ123');
  });
});

describe('replaceSidsInJsonString', () => {
  test('replaces all SIDs in a JSON string', () => {
    const mapping = { taskrouter: { taskQueues: { WQ111: 'WQ999' } } };
    const result = replaceSidsInJsonString('{"queue":"WQ111"}', mapping);
    expect(result).toBe('{"queue":"WQ999"}');
  });
});

describe('deepReplaceSids', () => {
  test('replaces SIDs recursively in objects', () => {
    const mapping = { taskrouter: { taskQueues: { WQ111: 'WQ999' } } };
    const obj = { config: { targets: [{ queue: 'WQ111' }] } };
    const result = deepReplaceSids(obj, mapping);
    expect(result.config.targets[0].queue).toBe('WQ999');
  });
});
