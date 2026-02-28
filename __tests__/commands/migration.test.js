// __tests__/commands/migration.test.js
import { jest } from '@jest/globals';

jest.unstable_mockModule('fs-extra', () => ({
  ensureDir: jest.fn(),
  writeJson: jest.fn(),
  readdir: jest.fn(),
}));

jest.unstable_mockModule('../../src/migration/tracker.js', () => ({
  listMigrations: jest.fn(),
}));

jest.unstable_mockModule('../../src/utils/display.js', () => ({
  info: jest.fn(),
  success: jest.fn(),
}));

const { createMigration, listMigrationsCommand } = await import(
  '../../src/commands/migration.js'
);
const { ensureDir, writeJson } = await import('fs-extra');
const { listMigrations } = await import('../../src/migration/tracker.js');
const { info } = await import('../../src/utils/display.js');

describe('createMigration', () => {
  beforeEach(() => jest.clearAllMocks());

  test('creates migration file with timestamp and slugified description', async () => {
    const result = await createMigration('/env/dev', 'add support queue');
    expect(ensureDir).toHaveBeenCalled();
    expect(writeJson).toHaveBeenCalledWith(
      expect.stringMatching(/add-support-queue\.json$/),
      expect.objectContaining({
        description: 'add support queue',
        source: 'manual',
        operations: [],
        rollback: [],
      }),
      { spaces: 2 },
    );
    expect(result).toMatch(/add-support-queue\.json$/);
  });

  test('slugifies description with special characters', async () => {
    const result = await createMigration('/env/dev', 'Add açaí & café!');
    expect(writeJson).toHaveBeenCalledWith(
      expect.stringMatching(/add-acai-cafe\.json$/),
      expect.objectContaining({
        description: 'Add açaí & café!',
        source: 'manual',
      }),
      { spaces: 2 },
    );
    expect(result).toMatch(/add-acai-cafe\.json$/);
  });

  test('includes createdAt in the migration file', async () => {
    await createMigration('/env/dev', 'test migration');
    const writtenData = writeJson.mock.calls[0][1];
    expect(writtenData).toHaveProperty('createdAt');
    expect(typeof writtenData.createdAt).toBe('string');
  });
});

describe('listMigrationsCommand', () => {
  beforeEach(() => jest.clearAllMocks());

  test('shows info message when no migrations exist', async () => {
    listMigrations.mockResolvedValue([]);
    await listMigrationsCommand('/env/dev');
    expect(info).toHaveBeenCalledWith(expect.stringContaining('migration'));
  });

  test('logs each migration with status', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    listMigrations.mockResolvedValue([
      { name: '20260228_120000_first.json', status: 'applied', appliedAt: '2026-02-28T12:00:00Z' },
      { name: '20260228_130000_second.json', status: 'pending', appliedAt: null },
    ]);
    await listMigrationsCommand('/env/dev');
    expect(console.log).toHaveBeenCalledTimes(2);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('applied'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('pending'));
    spy.mockRestore();
  });
});
