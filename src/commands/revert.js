import { loadEnvFile } from '../config.js';
import { executeMigration } from '../migration/executor.js';
import { readMigrationFile, unmarkApplied } from '../migration/tracker.js';
import { readAllStates, readMigrationsTracker } from '../state/reader.js';
import { createClient } from '../twilio/clients.js';
import { fetchResource } from '../twilio/fetchers.js';
import { error, info, success } from '../utils/display.js';

export async function revertCommand(options) {
  const { dir, envFile, migrationName } = options;
  const account = loadEnvFile(envFile);
  const api = createClient(account);

  const workspace = await fetchResource(account, 'workspace');
  const workspaceSid = workspace?.sid;

  const tracker = await readMigrationsTracker(dir);

  if (tracker.applied.length === 0) {
    info('Nenhuma migration aplicada para reverter.');
    return;
  }

  const targetName = migrationName || tracker.applied[tracker.applied.length - 1].name;
  const isApplied = tracker.applied.some((a) => a.name === targetName);

  if (!isApplied) {
    error(`Migration "${targetName}" nao esta como applied.`);
    return;
  }

  info(`Revertendo: ${targetName}...`);
  const migration = await readMigrationFile(dir, targetName);

  if (!migration.rollback || migration.rollback.length === 0) {
    error('Migration nao possui rollback definido.');
    return;
  }

  const state = await readAllStates(dir);
  const rollbackMigration = { operations: migration.rollback };
  const results = await executeMigration(api, rollbackMigration, state, workspaceSid);

  for (const r of results) {
    const opName = r.operation.data?.friendlyName || r.operation.match?.friendlyName || '?';
    console.log(`  ✓ ${r.operation.action} ${r.operation.type}: ${opName}`);
  }

  await unmarkApplied(dir, targetName);
  success(`Revertida: ${targetName}`);
}
