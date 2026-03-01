import { loadEnvFile } from '../config.js';
import { executeMigration } from '../migration/executor.js';
import {
  clearPartiallyApplied,
  getPartiallyApplied,
  markPartiallyApplied,
  readMigrationFile,
  unmarkApplied,
} from '../migration/tracker.js';
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
  const partial = await getPartiallyApplied(dir);

  // Case 1: Rollback in progress — resume it
  if (partial?.rollbackInProgress) {
    info(
      `Retomando rollback de: ${partial.name} (${partial.rollbackLastIndex}/${partial.rollbackTotal})`,
    );

    const migration = await readMigrationFile(dir, partial.name);
    const appliedCount = partial.lastOperationIndex;
    const rollbackOps = migration.rollback.slice(-appliedCount);
    const rollbackMigration = { operations: rollbackOps };
    const state = await readAllStates(dir);

    try {
      await executeMigration(api, rollbackMigration, state, workspaceSid, {
        startIndex: partial.rollbackLastIndex,
        onProgress: async (index, total) => {
          await markPartiallyApplied(
            dir,
            partial.name,
            partial.lastOperationIndex,
            partial.totalOperations,
            partial.error,
            {
              rollbackInProgress: true,
              rollbackLastIndex: index + 1,
              rollbackTotal: partial.rollbackTotal,
            },
          );
        },
      });

      await clearPartiallyApplied(dir);
      await unmarkApplied(dir, partial.name);
      success(`Rollback completo: ${partial.name}`);
    } catch (err) {
      error(`Erro durante rollback: ${err.message}`);
      info('Execute revert novamente para retomar o rollback.');
    }
    return;
  }

  // Case 2: Partially applied migration — start rollback of applied operations
  if (partial && !partial.rollbackInProgress) {
    const targetName = partial.name;
    info(
      `Revertendo migration parcialmente aplicada: ${targetName} (${partial.lastOperationIndex}/${partial.totalOperations})`,
    );

    const migration = await readMigrationFile(dir, targetName);

    if (!migration.rollback || migration.rollback.length === 0) {
      error('Migration nao possui rollback definido.');
      return;
    }

    const appliedCount = partial.lastOperationIndex;
    // rollback array is in reverse order of operations.
    // operations[0..appliedCount-1] were applied.
    // We need the last `appliedCount` entries of rollback array.
    const rollbackOps = migration.rollback.slice(-appliedCount);
    const rollbackMigration = { operations: rollbackOps };
    const state = await readAllStates(dir);

    try {
      await executeMigration(api, rollbackMigration, state, workspaceSid, {
        onProgress: async (index, total) => {
          await markPartiallyApplied(
            dir,
            targetName,
            partial.lastOperationIndex,
            partial.totalOperations,
            partial.error,
            {
              rollbackInProgress: true,
              rollbackLastIndex: index + 1,
              rollbackTotal: appliedCount,
            },
          );
        },
      });

      await clearPartiallyApplied(dir);
      await unmarkApplied(dir, targetName);
      success(`Revertida (parcial): ${targetName}`);
    } catch (err) {
      error(`Erro durante rollback: ${err.message}`);
      info('Execute revert novamente para retomar o rollback.');
    }
    return;
  }

  // Case 3: Normal revert of fully applied migration
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
    console.log(`  \u2713 ${r.operation.action} ${r.operation.type}: ${opName}`);
  }

  await unmarkApplied(dir, targetName);
  success(`Revertida: ${targetName}`);
}
