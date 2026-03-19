// src/commands/validate-studio-flows.js
import path from 'node:path';

import fsExtra from 'fs-extra';

const { readJson } = fsExtra;

import { loadEnvFile } from '../config.js';
import { listMigrations } from '../migration/tracker.js';
import { createClient } from '../twilio/clients.js';
import { error, info, success, warn } from '../utils/display.js';

export async function validateStudioFlowsCommand({ dir, envFile, migrationName }) {
  const account = loadEnvFile(envFile);
  const api = createClient(account);

  const migration = await loadMigration(dir, migrationName);
  if (!migration) return;

  const flowOps = migration.operations.filter((op) => op.type === 'studioFlows');

  if (flowOps.length === 0) {
    info('Nenhuma operacao de studioFlows encontrada nesta migration.');
    return;
  }

  info(`Validando ${flowOps.length} operacao(oes) de studioFlows...\n`);

  let hasErrors = false;

  for (let i = 0; i < flowOps.length; i++) {
    const op = flowOps[i];
    const name = op.data?.friendlyName || op.match?.friendlyName || `operacao ${i + 1}`;
    const action = op.action;

    if (action === 'delete') {
      warn(`  ⊘ "${name}" — delete nao requer validacao de definition`);
      continue;
    }

    const definition = op.data?.definition;
    if (!definition) {
      warn(`  ⊘ "${name}" (${action}) — sem definition para validar`);
      continue;
    }

    try {
      const result = await api.studio.v2.flowValidate.create({
        friendlyName: name,
        status: op.data?.status || 'published',
        definition: typeof definition === 'object' ? JSON.stringify(definition) : definition,
      });

      if (result.valid) {
        success(`  "${name}" (${action}) — definition valida`);
      } else {
        hasErrors = true;
        error(`  "${name}" (${action}) — definition invalida`);
      }
    } catch (err) {
      hasErrors = true;
      error(`  "${name}" (${action}) — erro na validacao`);
      printValidationError(err);
    }
  }

  console.log();
  if (hasErrors) {
    error('Validacao concluida com erros.');
    process.exitCode = 1;
  } else {
    success('Todas as definitions de studioFlows sao validas.');
  }
}

async function loadMigration(dir, migrationName) {
  if (migrationName) {
    const fileName = migrationName.endsWith('.json') ? migrationName : `${migrationName}.json`;
    const filePath = path.join(dir, 'migrations', fileName);
    try {
      return await readJson(filePath);
    } catch {
      error(`Migration nao encontrada: ${fileName}`);
      return null;
    }
  }

  const migrations = await listMigrations(dir);
  if (migrations.length === 0) {
    info('Nenhuma migration encontrada.');
    return null;
  }

  const pending = migrations.filter((m) => m.status === 'pending');
  if (pending.length === 0) {
    info('Nenhuma migration pendente encontrada. Use o nome da migration para validar uma especifica.');
    return null;
  }

  const last = pending[pending.length - 1];
  info(`Validando migration pendente: ${last.name}\n`);
  return await readJson(path.join(dir, 'migrations', last.name));
}

function printValidationError(err) {
  if (err.details) {
    for (const detail of Object.values(err.details)) {
      if (Array.isArray(detail)) {
        for (const item of detail) {
          const msg = item.message || item;
          const path = item.path ? ` (path: ${item.path})` : '';
          console.error(`    → ${msg}${path}`);
        }
      } else if (typeof detail === 'string') {
        console.error(`    → ${detail}`);
      }
    }
  } else if (err.message) {
    console.error(`    → ${err.message}`);
  }
}
