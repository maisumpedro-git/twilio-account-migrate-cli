import { loadEnvFile } from '../config.js';
import { executeMigration } from '../migration/executor.js';
import { lintMigration, summarizeIssues } from '../migration/linter.js';
import { previewMigration } from '../migration/preview.js';
import { validateStudioFlowsOperations } from '../migration/studio-validator.js';
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
import { printTwilioError } from '../utils/twilio-error.js';

function lintBeforePush(migrationName, migration, state) {
  const issues = lintMigration(migration, state);
  const { errors, warnings } = summarizeIssues(issues);
  if (errors === 0 && warnings === 0) return true;

  for (const issue of issues) {
    const opLabel = issue.op >= 0 ? `op[${issue.op}]` : 'migration';
    if (issue.severity === 'error') {
      error(`  ${opLabel}: ${issue.message}`);
    } else {
      warn(`  ${opLabel}: ${issue.message}`);
    }
  }

  if (errors > 0) {
    error(`Lint falhou em ${migrationName}: ${errors} erro(s).`);
    info('Push abortado antes de qualquer alteração no cloud.');
    process.exitCode = 1;
    return false;
  }
  warn(`Lint com ${warnings} aviso(s); prosseguindo.`);
  return true;
}

async function preValidateStudioFlows(api, migrationName, operations) {
  const { ok, checked, failures } = await validateStudioFlowsOperations(api, operations);
  if (checked === 0) return true;
  if (ok) {
    info(`Pré-validação de Studio Flows OK (${checked} flow(s)).`);
    return true;
  }
  error(`Pré-validação de Studio Flows falhou em ${migrationName}:`);
  for (const f of failures) {
    printTwilioError(f.err, { prefix: `Studio Flow "${f.name}" (${f.action}) inválida` });
  }
  info('Push abortado antes de qualquer alteração no cloud. Corrija as definitions e tente novamente.');
  process.exitCode = 1;
  return false;
}

async function updateStateFromResult(state, dir, r) {
  const { operation, result } = r;
  const type = operation.type;

  if (operation.action === 'create' && result?.sid) {
    if (!state[type]) state[type] = { resources: [] };
    state[type].resources.push({ sid: result.sid, ...operation.data });
    await writeState(dir, type, state[type].resources);
  } else if (operation.action === 'update' && result?.sid) {
    if (state[type]?.resources) {
      const name = operation.match?.friendlyName || operation.match?.uniqueName;
      const idx = state[type].resources.findIndex(
        (res) => res.friendlyName === name || res.uniqueName === name,
      );
      if (idx !== -1) {
        state[type].resources[idx] = { ...state[type].resources[idx], ...operation.data };
        await writeState(dir, type, state[type].resources);
      }
    }
  } else if (operation.action === 'delete' && result?.deleted) {
    if (state[type]?.resources) {
      const name = operation.match?.friendlyName || operation.match?.uniqueName;
      state[type].resources = state[type].resources.filter(
        (res) => res.friendlyName !== name && res.uniqueName !== name,
      );
      await writeState(dir, type, state[type].resources);
    }
  }
}

export async function pushCommand(options) {
  const { dir, envFile, dryRun, verbose } = options;
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
    if (!lintBeforePush(partial.name, migration, state)) return;

    const pendingOps = migration.operations.slice(partial.lastOperationIndex);
    if (!(await preValidateStudioFlows(api, partial.name, pendingOps))) return;

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

        await updateStateFromResult(state, dir, r);
      }

      await promotePartialToApplied(dir);
      success(`Retomada completa: ${partial.name}`);
    } catch (err) {
      printTwilioError(err, { prefix: `Erro ao retomar ${partial.name}` });
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

    if (!dryRun && !lintBeforePush(name, migration, state)) return;
    if (!dryRun && !(await preValidateStudioFlows(api, name, migration.operations))) return;

    try {
      const results = await executeMigration(api, migration, state, workspaceSid, {
        dryRun,
        onProgress: dryRun
          ? undefined
          : async (index, total) => {
              await markPartiallyApplied(dir, name, index + 1, total, null);
            },
      });

      if (dryRun && verbose) {
        await previewMigration(account, state, migration.operations);
      } else {
        for (const r of results) {
          const opName = r.operation.data?.friendlyName || r.operation.match?.friendlyName || '?';
          if (dryRun) {
            console.log(`  [dry-run] ${r.operation.action} ${r.operation.type}: ${opName}`);
          } else {
            console.log(
              `  ✓ ${r.operation.action} ${r.operation.type}: ${opName} (${r.result?.sid || 'ok'})`,
            );

            await updateStateFromResult(state, dir, r);
          }
        }
      }

      if (!dryRun) {
        await markApplied(dir, name);
        success(`Aplicada: ${name}`);
      }
    } catch (err) {
      if (!dryRun) {
        printTwilioError(err, { prefix: `Erro ao aplicar ${name}` });
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
