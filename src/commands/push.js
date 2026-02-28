import { loadEnvFile } from '../config.js';
import { executeMigration } from '../migration/executor.js';
import { getPendingMigrations, markApplied, readMigrationFile } from '../migration/tracker.js';
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

  // Get workspace SID
  const workspace = await fetchResource(account, 'workspace');
  const workspaceSid = workspace?.sid;

  // Get pending migrations
  const pending = await getPendingMigrations(dir);

  if (pending.length === 0) {
    success('Nenhuma migration pendente.');
    return;
  }

  info(`${pending.length} migration(s) pendente(s)${dryRun ? ' (dry-run)' : ''}:`);
  for (const name of pending) console.log(`  ○ ${name}`);
  console.log();

  const state = await readAllStates(dir);

  for (const name of pending) {
    info(`Aplicando: ${name}...`);
    const migration = await readMigrationFile(dir, name);
    validateMigration(migration);

    const results = await executeMigration(api, migration, state, workspaceSid, { dryRun });

    for (const r of results) {
      const opName = r.operation.data?.friendlyName || r.operation.match?.friendlyName || '?';
      if (dryRun) {
        console.log(`  [dry-run] ${r.operation.action} ${r.operation.type}: ${opName}`);
      } else {
        console.log(
          `  ✓ ${r.operation.action} ${r.operation.type}: ${opName} (${r.result?.sid || 'ok'})`,
        );

        // Update state with new/updated SIDs
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
  }

  if (dryRun) {
    warn('Dry-run completo. Nenhuma alteracao foi aplicada.');
  } else {
    success('Todas as migrations foram aplicadas.');
  }
}
