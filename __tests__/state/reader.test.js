// __tests__/state/reader.test.js
import path from 'node:path';

import { jest } from '@jest/globals';

const mockFsExtra = {
  pathExists: jest.fn(),
  readJson: jest.fn(),
};
jest.unstable_mockModule('fs-extra', () => ({
  default: mockFsExtra,
  ...mockFsExtra,
}));

const { readState, readAllStates, readMigrationsTracker } = await import('../../src/state/reader.js');
const { pathExists, readJson } = mockFsExtra;

describe('readState', () => {
  beforeEach(() => jest.clearAllMocks());

  test('reads state file for a resource type', async () => {
    pathExists.mockResolvedValue(true);
    readJson.mockResolvedValue({
      fetchedAt: '2026-02-27T14:30:52Z',
      resources: [{ sid: 'WQ123', friendlyName: 'Queue A' }],
    });
    const result = await readState('/env/dev', 'taskQueues');
    expect(readJson).toHaveBeenCalledWith(path.join('/env/dev', 'state', 'taskQueues.json'));
    expect(result.resources).toHaveLength(1);
    expect(result.resources[0].friendlyName).toBe('Queue A');
  });

  test('returns empty resources when state file does not exist', async () => {
    pathExists.mockResolvedValue(false);
    const result = await readState('/env/dev', 'taskQueues');
    expect(result).toEqual({ fetchedAt: null, resources: [] });
  });
});

describe('readAllStates', () => {
  beforeEach(() => jest.clearAllMocks());

  test('includes serverless in loaded resource types', async () => {
    pathExists.mockResolvedValue(true);
    readJson.mockResolvedValue({ fetchedAt: null, resources: [] });
    const states = await readAllStates('/env/dev');
    expect(states).toHaveProperty('serverless');
    const calledPaths = readJson.mock.calls.map((c) => c[0]);
    expect(calledPaths).toContain(path.join('/env/dev', 'state', 'serverless.json'));
  });
});

describe('readMigrationsTracker', () => {
  beforeEach(() => jest.clearAllMocks());

  test('reads migrations.json', async () => {
    pathExists.mockResolvedValue(true);
    readJson.mockResolvedValue({
      applied: [{ name: '20260227_143052_pull.json', appliedAt: '2026-02-27T17:30:52Z' }],
    });
    const result = await readMigrationsTracker('/env/dev');
    expect(result.applied).toHaveLength(1);
  });

  test('returns empty applied when migrations.json does not exist', async () => {
    pathExists.mockResolvedValue(false);
    const result = await readMigrationsTracker('/env/dev');
    expect(result).toEqual({ applied: [] });
  });
});
