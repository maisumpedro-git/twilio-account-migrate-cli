import { loadEnvFile } from '../config.js';
import { executeMigration } from '../migration/executor.js';
import {
  getPartiallyApplied,
  getPendingMigrations,
  markApplied,
  markPartiallyApplied,
  promotePartialToApplied,
  readMigrationFile,
} from '../migration/tracker.js';
import { validateMigration } from '../migration/validator.js';
import { readAllStates } from '../state/reader.js';
import { writeState } from '../state/writer.js';
import { createClient } from '../twilio/clients.js';
import { fetchResource } from '../twilio/fetchers.js';
import { error, info, success, warn } from '../utils/display.js';

export async function pushCommand(options) {
  const { dir, envFile, dryRun } = options;
  const account = loadEnvFile(envFile);
  const api = createClient(account);

  const workspace = await fetchResource(account, 'workspace');
  const workspaceSid = workspace?.sid;

  // Check for partially applied migration
  const partial = await getPartiallyApplied(dir);
  const pending = await getPendingMigrations(dir);

  if (partial && !dryRun) {
    info(
      `Migration parcialmente aplicada encontrada: ${partial.name} (${partial.lastOperationIndex}/${partial.totalOperations})`,
    );
    info(`Retomando da operacao ${partial.lastOperationIndex}...`);

    const state = await readAllStates(dir);
    const migration = await readMigrationFile(dir, partial.name);
    validateMigration(migration);

    try {
      const results = await executeMigration(api, migration, state, workspaceSid, {
        startIndex: partial.lastOperationIndex,
        onProgress: async (index, total) => {
          await markPartiallyApplied(dir, partial.name, index + 1, total, null);
        },
      });

      for (const r of results) {
        const opName = r.operation.data?.friendlyName || r.operation.match?.friendlyName || '?';
        console.log(
          `  ✓ ${r.operation.action} ${r.operation.type}: ${opName} (${r.result?.sid || 'ok'})`,
        );

        if (r.result?.sid && r.operation.action === 'create') {
          const type = r.operation.type;
          if (!state[type]) state[type] = { resources: [] };
          state[type].resources.push({ sid: r.result.sid, ...r.operation.data });
          await writeState(dir, type, state[type].resources);
        }
      }

      await promotePartialToApplied(dir);
      success(`Retomada completa: ${partial.name}`);
    } catch (err) {
      error(`Erro na operacao: ${err.message}`);
      return;
    }
  }

  if (pending.length === 0 && !partial) {
    success('Nenhuma migration pendente.');
    return;
  }

  if (pending.length > 0) {
    info(`${pending.length} migration(s) pendente(s)${dryRun ? ' (dry-run)' : ''}:`);
    for (const name of pending) console.log(`  ○ ${name}`);
    console.log();
  }

  const state = await readAllStates(dir);

  for (const name of pending) {
    info(`Aplicando: ${name}...`);
    const migration = await readMigrationFile(dir, name);
    validateMigration(migration);

    try {
      const results = await executeMigration(api, migration, state, workspaceSid, {
        dryRun,
        onProgress: dryRun
          ? undefined
          : async (index, total) => {
              await markPartiallyApplied(dir, name, index + 1, total, null);
            },
      });

      for (const r of results) {
        const opName = r.operation.data?.friendlyName || r.operation.match?.friendlyName || '?';
        if (dryRun) {
          console.log(`  [dry-run] ${r.operation.action} ${r.operation.type}: ${opName}`);
        } else {
          console.log(
            `  ✓ ${r.operation.action} ${r.operation.type}: ${opName} (${r.result?.sid || 'ok'})`,
          );

          if (r.result?.sid && r.operation.action === 'create') {
            const type = r.operation.type;
            if (!state[type]) state[type] = { resources: [] };
            state[type].resources.push({ sid: r.result.sid, ...r.operation.data });
            await writeState(dir, type, state[type].resources);
          }
        }
      }

      if (!dryRun) {
        await markApplied(dir, name);
        success(`Aplicada: ${name}`);
      }
    } catch (err) {
      if (!dryRun) {
        error(`Erro ao aplicar ${name}: ${err.message}`);
        info(`Migration salva como partially_applied. Execute push novamente para retomar.`);
      }
      return;
    }
  }

  if (dryRun) {
    warn('Dry-run completo. Nenhuma alteracao foi aplicada.');
  } else if (pending.length > 0) {
    success('Todas as migrations foram aplicadas.');
  }
}
