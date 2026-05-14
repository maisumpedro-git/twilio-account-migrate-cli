// src/commands/migration.js
import path from 'node:path';

import fsExtra from 'fs-extra';

const { ensureDir, readJson, writeJson } = fsExtra;

import { lintMigration, summarizeIssues } from '../migration/linter.js';
import { listMigrations } from '../migration/tracker.js';
import { buildRefMap, deepReplaceWithRefs } from '../sid/auto-ref.js';
import { readAllStates, readState } from '../state/reader.js';
import { error, info, success, warn } from '../utils/display.js';

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

export async function lintMigrationCommand(dir, migrationFile) {
  const filePath = path.isAbsolute(migrationFile)
    ? migrationFile
    : path.join(dir, 'migrations', migrationFile);

  let migration;
  try {
    migration = await readJson(filePath);
  } catch {
    error(`Migration nao encontrada: ${migrationFile}`);
    process.exitCode = 1;
    return;
  }

  const state = await readAllStates(dir);

  info(`Lint: ${path.basename(filePath)} (${migration.operations?.length || 0} operacao(oes))`);

  const issues = lintMigration(migration, state);
  const { errors, warnings } = summarizeIssues(issues);

  for (const issue of issues) {
    const opLabel = issue.op >= 0 ? `op[${issue.op}]` : 'migration';
    if (issue.severity === 'error') {
      error(`  ${opLabel}: ${issue.message}`);
    } else {
      warn(`  ${opLabel}: ${issue.message}`);
    }
  }

  if (errors === 0 && warnings === 0) {
    success('Sem problemas detectados.');
    return;
  }

  if (errors > 0) {
    error(`Lint falhou: ${errors} erro(s), ${warnings} warning(s).`);
    process.exitCode = 1;
  } else {
    warn(`Lint com avisos: ${warnings} warning(s).`);
  }
}

export async function neutralizeMigration(dir, migrationFile) {
  const filePath = path.isAbsolute(migrationFile)
    ? migrationFile
    : path.join(dir, 'migrations', migrationFile);

  const migration = await readJson(filePath);

  const allStates = await readAllStates(dir);
  const serverless = await readState(dir, 'serverless');
  const serverlessResources = serverless?.resources || [];

  const refMap = buildRefMap(allStates, serverlessResources);

  if (Object.keys(refMap).length === 0) {
    info('Nenhum recurso encontrado no state para gerar mapa de @ref.');
    return;
  }

  if (migration.operations?.length) {
    migration.operations = deepReplaceWithRefs(migration.operations, refMap);
  }

  if (migration.rollback?.length) {
    migration.rollback = deepReplaceWithRefs(migration.rollback, refMap);
  }

  await writeJson(filePath, migration, { spaces: 2 });

  return path.basename(filePath);
}
