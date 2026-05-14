import { jest } from '@jest/globals';

const store = new Map();

const mockEnsureDir = jest.fn().mockImplementation(async () => {});
const mockPathExists = jest.fn().mockImplementation(async (p) => {
  if (p.endsWith('/state') || p.endsWith('/.backup')) {
    for (const key of store.keys()) if (key.startsWith(p)) return true;
    return false;
  }
  return store.has(p);
});
const mockReaddir = jest.fn().mockImplementation(async (p) => {
  const prefix = `${p}/`;
  const seen = new Set();
  for (const key of store.keys()) {
    if (!key.startsWith(prefix)) continue;
    const rest = key.slice(prefix.length);
    const first = rest.split('/')[0];
    seen.add(first);
  }
  return [...seen];
});
const mockStat = jest.fn().mockImplementation(async (p) => ({
  isFile: () => store.has(p) && !isDir(p),
  isDirectory: () => isDir(p),
}));
const mockCopy = jest.fn().mockImplementation(async (src, dst) => {
  store.set(dst, store.get(src));
});
const mockRemove = jest.fn().mockImplementation(async (p) => {
  for (const key of [...store.keys()]) {
    if (key === p || key.startsWith(`${p}/`)) store.delete(key);
  }
});

function isDir(p) {
  for (const key of store.keys()) {
    if (key.startsWith(`${p}/`)) return true;
  }
  return false;
}

jest.unstable_mockModule('fs-extra', () => ({
  default: {
    ensureDir: mockEnsureDir,
    pathExists: mockPathExists,
    readdir: mockReaddir,
    stat: mockStat,
    copy: mockCopy,
    remove: mockRemove,
  },
}));

const { createBackup, pruneBackups } = await import('../../src/state/backup.js');

describe('createBackup', () => {
  beforeEach(() => {
    store.clear();
    jest.clearAllMocks();
  });

  test('returns null if state dir does not exist', async () => {
    const result = await createBackup('/env/dev');
    expect(result).toBeNull();
  });

  test('copies all state files (except .backup) into a timestamped subdir', async () => {
    store.set('/env/dev/state/taskQueues.json', { resources: [] });
    store.set('/env/dev/state/workflows.json', { resources: [] });
    store.set('/env/dev/state/migrations.json', { applied: [] });

    const target = await createBackup('/env/dev');
    expect(target).toMatch(/^\/env\/dev\/state\/\.backup\/\d{14}$/);
    expect(mockCopy).toHaveBeenCalledTimes(3);
    expect(mockCopy).toHaveBeenCalledWith(
      '/env/dev/state/taskQueues.json',
      expect.stringContaining('taskQueues.json'),
    );
  });

  test('skips .backup directory itself', async () => {
    store.set('/env/dev/state/taskQueues.json', {});
    store.set('/env/dev/state/.backup/old/taskQueues.json', {});

    await createBackup('/env/dev');
    const copiedFiles = mockCopy.mock.calls.map((c) => c[0]);
    expect(copiedFiles.some((f) => f.includes('.backup/old'))).toBe(false);
  });
});

describe('pruneBackups', () => {
  beforeEach(() => {
    store.clear();
    jest.clearAllMocks();
  });

  test('keeps only the last N backups (lexicographic = chronological with timestamp names)', async () => {
    for (const ts of ['20260101000000', '20260102000000', '20260103000000', '20260104000000']) {
      store.set(`/env/dev/state/.backup/${ts}/taskQueues.json`, {});
    }

    const removed = await pruneBackups('/env/dev', 2);
    expect(removed).toEqual(['20260101000000', '20260102000000']);
    expect(mockRemove).toHaveBeenCalledTimes(2);
  });

  test('does not remove anything if backups <= keep', async () => {
    store.set(`/env/dev/state/.backup/20260101000000/taskQueues.json`, {});

    const removed = await pruneBackups('/env/dev', 5);
    expect(removed).toEqual([]);
    expect(mockRemove).not.toHaveBeenCalled();
  });
});
