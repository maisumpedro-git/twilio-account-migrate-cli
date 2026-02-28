import path from 'node:path';

import fsExtra from 'fs-extra';

const { ensureDir, writeJson } = fsExtra;

import { generateMigration } from '../migration/generator.js';
import { buildRefMap, deepReplaceWithRefs } from '../sid/auto-ref.js';
import { readAllStates, readState } from '../state/reader.js';
import { RESOURCE_TYPES } from '../twilio/fetchers.js';
import { info, success } from '../utils/display.js';

function timestamp() {
  const now = new Date();
  const d = now.toISOString().replace(/[-:T]/g, '').slice(0, 8);
  const t = now.toISOString().replace(/[-:T]/g, '').slice(8, 14);
  return `${d}_${t}`;
}

export async function diffEnvCommand(options) {
  const { source, target, resources } = options;
  const types = resources
    ? resources.split(',').map((t) => t.trim())
    : RESOURCE_TYPES.filter((t) => t !== 'workspace');

  info(`Comparando ambientes: ${source} -> ${target}`);

  const sourceStates = await readAllStates(source);
  const targetStates = await readAllStates(target);

  // Read serverless state from source (for SID/URL → @ref mapping)
  const sourceServerless = await readState(source, 'serverless');
  const serverlessResources = sourceServerless?.resources || [];

  // Source is the "desired" state (like cloud in pull)
  // Target is the "current" state (like local in pull)
  const sourceData = {};
  for (const type of types) {
    sourceData[type] = sourceStates[type]?.resources || [];
  }

  // Build @ref map from source and replace SIDs/URLs before generating migration
  const allStatesForRef = {};
  for (const type of types) {
    allStatesForRef[type] = { resources: sourceData[type] };
  }
  const refMap = buildRefMap(allStatesForRef, serverlessResources);

  const refSourceData = {};
  for (const type of types) {
    refSourceData[type] = deepReplaceWithRefs(sourceData[type], refMap);
  }

  const migration = generateMigration(refSourceData, targetStates, types, 'env-diff');

  if (!migration) {
    success('Nenhuma diferenca detectada entre os ambientes.');
    return;
  }

  // Override source field
  migration.source = 'env-diff';

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
