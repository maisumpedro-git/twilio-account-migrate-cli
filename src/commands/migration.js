// src/commands/migration.js
import { ensureDir, writeJson } from 'fs-extra';
import path from 'node:path';

import { listMigrations } from '../migration/tracker.js';
import { info } from '../utils/display.js';

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function timestamp() {
  const now = new Date();
  const d = now.toISOString().replace(/[-:T]/g, '').slice(0, 8);
  const t = now.toISOString().replace(/[-:T]/g, '').slice(8, 14);
  return `${d}_${t}`;
}

export async function createMigration(dir, description) {
  const migrationsDir = path.join(dir, 'migrations');
  await ensureDir(migrationsDir);

  const slug = slugify(description);
  const fileName = `${timestamp()}_${slug}.json`;
  const filePath = path.join(migrationsDir, fileName);

  await writeJson(
    filePath,
    {
      description,
      createdAt: new Date().toISOString(),
      source: 'manual',
      operations: [],
      rollback: [],
    },
    { spaces: 2 },
  );

  return fileName;
}

export async function listMigrationsCommand(dir) {
  const migrations = await listMigrations(dir);

  if (migrations.length === 0) {
    info('Nenhuma migration encontrada.');
    return;
  }

  for (const m of migrations) {
    const status = m.status === 'applied' ? '\u2713 applied' : '\u25CB pending';
    const date = m.appliedAt ? ` (${m.appliedAt})` : '';
    console.log(`  ${status}  ${m.name}${date}`);
  }
}
