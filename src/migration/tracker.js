// src/migration/tracker.js
import path from 'node:path';

import fsExtra from 'fs-extra';

const { ensureDir, readdir, readJson } = fsExtra;

import { readMigrationsTracker } from '../state/reader.js';
import { writeMigrationsTracker } from '../state/writer.js';

export async function getPendingMigrations(dir) {
  const migrationsDir = path.join(dir, 'migrations');
  await ensureDir(migrationsDir);
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.json')).sort();
  const tracker = await readMigrationsTracker(dir);
  const appliedNames = new Set(tracker.applied.map((a) => a.name));
  if (tracker.partiallyApplied) {
    appliedNames.add(tracker.partiallyApplied.name);
  }
  return files.filter((f) => !appliedNames.has(f));
}

export async function markApplied(dir, migrationName) {
  const tracker = await readMigrationsTracker(dir);
  tracker.applied.push({ name: migrationName, appliedAt: new Date().toISOString() });
  if (tracker.partiallyApplied?.name === migrationName) {
    delete tracker.partiallyApplied;
  }
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
  const partialName = tracker.partiallyApplied?.name;

  return files.map((name) => {
    if (name === partialName) {
      const p = tracker.partiallyApplied;
      return {
        name,
        status: 'partially_applied',
        appliedAt: null,
        progress: `${p.lastOperationIndex}/${p.totalOperations}`,
      };
    }
    return {
      name,
      status: appliedMap.has(name) ? 'applied' : 'pending',
      appliedAt: appliedMap.get(name) || null,
    };
  });
}

export async function readMigrationFile(dir, name) {
  return readJson(path.join(dir, 'migrations', name));
}

export async function markPartiallyApplied(
  dir,
  name,
  lastOperationIndex,
  totalOperations,
  error,
  rollbackInfo,
) {
  const tracker = await readMigrationsTracker(dir);
  const existing = tracker.partiallyApplied;
  tracker.partiallyApplied = {
    name,
    startedAt: existing?.name === name ? existing.startedAt : new Date().toISOString(),
    lastOperationIndex,
    totalOperations,
    error,
    ...(rollbackInfo || {}),
  };
  await writeMigrationsTracker(dir, tracker);
}

export async function getPartiallyApplied(dir) {
  const tracker = await readMigrationsTracker(dir);
  return tracker.partiallyApplied || null;
}

export async function promotePartialToApplied(dir) {
  const tracker = await readMigrationsTracker(dir);
  if (tracker.partiallyApplied) {
    tracker.applied.push({
      name: tracker.partiallyApplied.name,
      appliedAt: new Date().toISOString(),
    });
    delete tracker.partiallyApplied;
  }
  await writeMigrationsTracker(dir, tracker);
}

export async function clearPartiallyApplied(dir) {
  const tracker = await readMigrationsTracker(dir);
  delete tracker.partiallyApplied;
  await writeMigrationsTracker(dir, tracker);
}
