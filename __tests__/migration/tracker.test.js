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

const { getPendingMigrations, markApplied, listMigrations } = await import(
  '../../src/migration/tracker.js'
);
const { readMigrationsTracker } = await import('../../src/state/reader.js');
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
