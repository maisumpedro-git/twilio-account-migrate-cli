// src/migration/tracker.js
import { ensureDir, readdir, readJson } from 'fs-extra';
import path from 'node:path';

import { readMigrationsTracker } from '../state/reader.js';
import { writeMigrationsTracker } from '../state/writer.js';

export async function getPendingMigrations(dir) {
  const migrationsDir = path.join(dir, 'migrations');
  await ensureDir(migrationsDir);
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.json')).sort();
  const tracker = await readMigrationsTracker(dir);
  const appliedNames = new Set(tracker.applied.map((a) => a.name));
  return files.filter((f) => !appliedNames.has(f));
}

export async function markApplied(dir, migrationName) {
  const tracker = await readMigrationsTracker(dir);
  tracker.applied.push({ name: migrationName, appliedAt: new Date().toISOString() });
  await writeMigrationsTracker(dir, tracker);
}

export async function unmarkApplied(dir, migrationName) {
  const tracker = await readMigrationsTracker(dir);
  tracker.applied = tracker.applied.filter((a) => a.name !== migrationName);
  await writeMigrationsTracker(dir, tracker);
}

export async function listMigrations(dir) {
  const migrationsDir = path.join(dir, 'migrations');
  await ensureDir(migrationsDir);
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.json')).sort();
  const tracker = await readMigrationsTracker(dir);
  const appliedMap = new Map(tracker.applied.map((a) => [a.name, a.appliedAt]));

  return files.map((name) => ({
    name,
    status: appliedMap.has(name) ? 'applied' : 'pending',
    appliedAt: appliedMap.get(name) || null,
  }));
}

export async function readMigrationFile(dir, name) {
  return readJson(path.join(dir, 'migrations', name));
}
