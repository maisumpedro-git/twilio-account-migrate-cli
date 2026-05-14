import path from 'node:path';

import fsExtra from 'fs-extra';

const { copy, ensureDir, pathExists, readdir, remove, stat } = fsExtra;

function timestamp() {
  return new Date().toISOString().replace(/[-:T]/g, '').replace(/\..+/, '').slice(0, 14);
}

export async function createBackup(dir) {
  const stateDir = path.join(dir, 'state');
  if (!(await pathExists(stateDir))) return null;

  const backupRoot = path.join(stateDir, '.backup');
  await ensureDir(backupRoot);

  const target = path.join(backupRoot, timestamp());
  await ensureDir(target);

  const entries = await readdir(stateDir);
  for (const entry of entries) {
    if (entry === '.backup') continue;
    const src = path.join(stateDir, entry);
    const stats = await stat(src);
    if (stats.isFile()) {
      await copy(src, path.join(target, entry));
    }
  }

  return target;
}

export async function pruneBackups(dir, keep = 5) {
  const backupRoot = path.join(dir, 'state', '.backup');
  if (!(await pathExists(backupRoot))) return [];

  const entries = await readdir(backupRoot);
  const sorted = entries.sort();
  const toRemove = sorted.slice(0, Math.max(0, sorted.length - keep));
  for (const entry of toRemove) {
    await remove(path.join(backupRoot, entry));
  }
  return toRemove;
}
