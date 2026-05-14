import path from 'node:path';

import fsExtra from 'fs-extra';

const { ensureDir, writeJson } = fsExtra;

import { generateMigration } from '../migration/generator.js';
import { buildRefMap, deepReplaceWithRefs } from '../sid/auto-ref.js';
import { readAllStates, readState } from '../state/reader.js';
import { RESOURCE_TYPES } from '../twilio/fetchers.js';
import { info, success, warn } from '../utils/display.js';
import { promptChoice } from '../utils/prompt.js';

function timestamp() {
  const now = new Date();
  const d = now.toISOString().replace(/[-:T]/g, '').slice(0, 8);
  const t = now.toISOString().replace(/[-:T]/g, '').slice(8, 14);
  return `${d}_${t}`;
}

async function reviewOperations(operations) {
  const accepted = [];
  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];
    const name = op.data?.friendlyName || op.match?.friendlyName || '?';
    console.log(`\n[${i + 1}/${operations.length}] ${op.action} ${op.type}: ${name}`);
    if (op.action === 'update' && op.data) {
      const fields = Object.keys(op.data).slice(0, 5).join(', ');
      console.log(`  campos: ${fields}${Object.keys(op.data).length > 5 ? ', ...' : ''}`);
    }
    const choice = await promptChoice('Aceitar?', [
      { key: 'a', label: 'aceitar' },
      { key: 's', label: 'skip' },
      { key: 'q', label: 'quit' },
    ]);
    if (choice === 'a') {
      accepted.push(op);
    } else if (choice === 'q') {
      warn(`Revisao interrompida; ${accepted.length}/${operations.length} aceita(s).`);
      return accepted;
    }
  }
  return accepted;
}

export async function diffEnvCommand(options) {
  const { source, target, resources, review } = options;
  const types = resources
    ? resources.split(',').map((t) => t.trim())
    : RESOURCE_TYPES.filter((t) => t !== 'workspace');

  info(`Comparando ambientes: ${source} -> ${target}`);

  const sourceStates = await readAllStates(source);
  const targetStates = await readAllStates(target);

  // Read serverless state from both envs (for SID/URL → @ref mapping)
  const sourceServerless = await readState(source, 'serverless');
  const sourceServerlessResources = sourceServerless?.resources || [];
  const targetServerless = await readState(target, 'serverless');
  const targetServerlessResources = targetServerless?.resources || [];

  // Source is the "desired" state (like cloud in pull)
  // Target is the "current" state (like local in pull)
  const sourceData = {};
  for (const type of types) {
    sourceData[type] = sourceStates[type]?.resources || [];
  }

  // Build @ref maps from ALL states of each env (not just filtered types)
  // because resources like studioFlows can reference SIDs from taskQueues, workflows, etc.
  const sourceRefMap = buildRefMap(sourceStates, sourceServerlessResources);
  const targetRefMap = buildRefMap(targetStates, targetServerlessResources);

  // Replace env-specific SIDs/URLs with @ref on BOTH sides before comparing
  const refSourceData = {};
  for (const type of types) {
    refSourceData[type] = deepReplaceWithRefs(sourceData[type], sourceRefMap);
  }

  const refTargetStates = {};
  for (const type of types) {
    const targetResources = targetStates[type]?.resources || [];
    refTargetStates[type] = {
      ...targetStates[type],
      resources: deepReplaceWithRefs(targetResources, targetRefMap),
    };
  }

  const migration = generateMigration(refSourceData, refTargetStates, types, 'env-diff');

  if (!migration) {
    success('Nenhuma diferenca detectada entre os ambientes.');
    return;
  }

  // Override source field
  migration.source = 'env-diff';

  if (review) {
    info(`Revisao interativa: ${migration.operations.length} operacao(oes).`);
    const accepted = await reviewOperations(migration.operations);
    if (accepted.length === 0) {
      warn('Nenhuma operacao aceita; nada sera escrito.');
      return;
    }
    migration.operations = accepted;
  }

  const migrationsDir = path.join(target, 'migrations');
  await ensureDir(migrationsDir);
  const fileName = `${timestamp()}_env-diff.json`;
  await writeJson(path.join(migrationsDir, fileName), migration, { spaces: 2 });

  success(`Migration gerada: ${fileName}`);
  info(`${migration.operations.length} operacao(oes) detectada(s).`);
  for (const op of migration.operations) {
    const name = op.data?.friendlyName || op.match?.friendlyName || '?';
    console.log(`  ${op.action} ${op.type}: ${name}`);
  }
}
