// __tests__/state/writer.test.js
import { jest } from '@jest/globals';
import path from 'node:path';

jest.unstable_mockModule('fs-extra', () => ({
  ensureDir: jest.fn(),
  writeJson: jest.fn(),
}));

const { writeState, writeMigrationsTracker } = await import('../../src/state/writer.js');
const { ensureDir, writeJson } = await import('fs-extra');

describe('writeState', () => {
  beforeEach(() => jest.clearAllMocks());

  test('writes state file with fetchedAt timestamp', async () => {
    const resources = [{ sid: 'WQ123', friendlyName: 'Queue A' }];
    await writeState('/env/dev', 'taskQueues', resources);
    expect(ensureDir).toHaveBeenCalledWith(path.join('/env/dev', 'state'));
    expect(writeJson).toHaveBeenCalledWith(
      path.join('/env/dev', 'state', 'taskQueues.json'),
      expect.objectContaining({
        fetchedAt: expect.any(String),
        resources,
      }),
      { spaces: 2 },
    );
  });
});

describe('writeMigrationsTracker', () => {
  beforeEach(() => jest.clearAllMocks());

  test('writes migrations.json', async () => {
    const tracker = { applied: [{ name: 'test.json', appliedAt: '2026-01-01T00:00:00Z' }] };
    await writeMigrationsTracker('/env/dev', tracker);
    expect(writeJson).toHaveBeenCalledWith(
      path.join('/env/dev', 'state', 'migrations.json'),
      tracker,
      { spaces: 2 },
    );
  });
});
