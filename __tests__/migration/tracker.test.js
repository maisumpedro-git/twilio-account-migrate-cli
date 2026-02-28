// __tests__/migration/tracker.test.js
import { jest } from '@jest/globals';

const mockFsExtra = {
  pathExists: jest.fn(),
  readJson: jest.fn(),
  readdir: jest.fn(),
  ensureDir: jest.fn(),
  writeJson: jest.fn(),
};
jest.unstable_mockModule('fs-extra', () => ({
  default: mockFsExtra,
  ...mockFsExtra,
}));

jest.unstable_mockModule('../../src/state/reader.js', () => ({
  readMigrationsTracker: jest.fn(),
}));

jest.unstable_mockModule('../../src/state/writer.js', () => ({
  writeMigrationsTracker: jest.fn(),
}));

const {
  getPendingMigrations,
  markApplied,
  listMigrations,
  markPartiallyApplied,
  getPartiallyApplied,
  promotePartialToApplied,
  clearPartiallyApplied,
} = await import('../../src/migration/tracker.js');
const { readMigrationsTracker } = await import('../../src/state/reader.js');
const { writeMigrationsTracker } = await import('../../src/state/writer.js');
const { readdir } = mockFsExtra;

describe('getPendingMigrations', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns migrations not in applied list, sorted by name', async () => {
    readdir.mockResolvedValue([
      '20260227_143052_first.json',
      '20260227_150030_second.json',
      '20260228_091500_third.json',
    ]);
    readMigrationsTracker.mockResolvedValue({
      applied: [{ name: '20260227_143052_first.json', appliedAt: '2026-02-27T17:30:52Z' }],
    });
    const pending = await getPendingMigrations('/env/dev');
    expect(pending).toEqual(['20260227_150030_second.json', '20260228_091500_third.json']);
  });

  test('returns empty when all migrations are applied', async () => {
    readdir.mockResolvedValue(['20260227_143052_first.json']);
    readMigrationsTracker.mockResolvedValue({
      applied: [{ name: '20260227_143052_first.json', appliedAt: '2026-02-27T17:30:52Z' }],
    });
    const pending = await getPendingMigrations('/env/dev');
    expect(pending).toEqual([]);
  });

  test('returns empty when no migration files exist', async () => {
    readdir.mockResolvedValue([]);
    readMigrationsTracker.mockResolvedValue({ applied: [] });
    const pending = await getPendingMigrations('/env/dev');
    expect(pending).toEqual([]);
  });
});

describe('listMigrations', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns all migrations with their status', async () => {
    readdir.mockResolvedValue(['20260227_143052_first.json', '20260227_150030_second.json']);
    readMigrationsTracker.mockResolvedValue({
      applied: [{ name: '20260227_143052_first.json', appliedAt: '2026-02-27T17:30:52Z' }],
    });
    const list = await listMigrations('/env/dev');
    expect(list).toEqual([
      {
        name: '20260227_143052_first.json',
        status: 'applied',
        appliedAt: '2026-02-27T17:30:52Z',
      },
      { name: '20260227_150030_second.json', status: 'pending', appliedAt: null },
    ]);
  });
});

describe('markPartiallyApplied', () => {
  beforeEach(() => jest.clearAllMocks());

  test('sets partiallyApplied field in tracker', async () => {
    readMigrationsTracker.mockResolvedValue({ applied: [] });
    await markPartiallyApplied('/env/dev', 'mig.json', 5, 10, 'API Error');
    expect(writeMigrationsTracker).toHaveBeenCalledWith('/env/dev', {
      applied: [],
      partiallyApplied: {
        name: 'mig.json',
        startedAt: expect.any(String),
        lastOperationIndex: 5,
        totalOperations: 10,
        error: 'API Error',
      },
    });
  });

  test('preserves existing startedAt on updates', async () => {
    readMigrationsTracker.mockResolvedValue({
      applied: [],
      partiallyApplied: {
        name: 'mig.json',
        startedAt: '2026-01-01T00:00:00.000Z',
        lastOperationIndex: 3,
        totalOperations: 10,
        error: 'old error',
      },
    });
    await markPartiallyApplied('/env/dev', 'mig.json', 5, 10, 'new error');
    expect(writeMigrationsTracker).toHaveBeenCalledWith('/env/dev', {
      applied: [],
      partiallyApplied: expect.objectContaining({
        startedAt: '2026-01-01T00:00:00.000Z',
        lastOperationIndex: 5,
        error: 'new error',
      }),
    });
  });
});

describe('getPartiallyApplied', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns partiallyApplied when present', async () => {
    const partial = { name: 'mig.json', lastOperationIndex: 5, totalOperations: 10 };
    readMigrationsTracker.mockResolvedValue({ applied: [], partiallyApplied: partial });
    const result = await getPartiallyApplied('/env/dev');
    expect(result).toEqual(partial);
  });

  test('returns null when no partiallyApplied', async () => {
    readMigrationsTracker.mockResolvedValue({ applied: [] });
    const result = await getPartiallyApplied('/env/dev');
    expect(result).toBeNull();
  });
});

describe('promotePartialToApplied', () => {
  beforeEach(() => jest.clearAllMocks());

  test('moves partiallyApplied to applied list and removes field', async () => {
    readMigrationsTracker.mockResolvedValue({
      applied: [{ name: 'old.json', appliedAt: '2026-01-01T00:00:00.000Z' }],
      partiallyApplied: {
        name: 'mig.json',
        startedAt: '2026-02-01T00:00:00.000Z',
        lastOperationIndex: 9,
        totalOperations: 10,
      },
    });
    await promotePartialToApplied('/env/dev');
    expect(writeMigrationsTracker).toHaveBeenCalledWith('/env/dev', {
      applied: [
        { name: 'old.json', appliedAt: '2026-01-01T00:00:00.000Z' },
        { name: 'mig.json', appliedAt: expect.any(String) },
      ],
    });
  });
});

describe('clearPartiallyApplied', () => {
  beforeEach(() => jest.clearAllMocks());

  test('removes partiallyApplied field from tracker', async () => {
    readMigrationsTracker.mockResolvedValue({
      applied: [],
      partiallyApplied: { name: 'mig.json', lastOperationIndex: 5, totalOperations: 10 },
    });
    await clearPartiallyApplied('/env/dev');
    expect(writeMigrationsTracker).toHaveBeenCalledWith('/env/dev', { applied: [] });
  });
});

describe('getPendingMigrations with partiallyApplied', () => {
  beforeEach(() => jest.clearAllMocks());

  test('excludes partiallyApplied migration from pending list', async () => {
    readdir.mockResolvedValue(['mig1.json', 'mig2.json', 'mig3.json']);
    readMigrationsTracker.mockResolvedValue({
      applied: [{ name: 'mig1.json', appliedAt: '2026-01-01T00:00:00.000Z' }],
      partiallyApplied: { name: 'mig2.json', lastOperationIndex: 5, totalOperations: 10 },
    });
    const pending = await getPendingMigrations('/env/dev');
    expect(pending).toEqual(['mig3.json']);
  });
});

describe('listMigrations with partiallyApplied', () => {
  beforeEach(() => jest.clearAllMocks());

  test('shows partially_applied status for partial migration', async () => {
    readdir.mockResolvedValue(['mig1.json', 'mig2.json']);
    readMigrationsTracker.mockResolvedValue({
      applied: [{ name: 'mig1.json', appliedAt: '2026-01-01T00:00:00.000Z' }],
      partiallyApplied: {
        name: 'mig2.json',
        startedAt: '2026-02-01T00:00:00.000Z',
        lastOperationIndex: 5,
        totalOperations: 10,
      },
    });
    const list = await listMigrations('/env/dev');
    expect(list[1]).toEqual({
      name: 'mig2.json',
      status: 'partially_applied',
      appliedAt: null,
      progress: '5/10',
    });
  });
});
