import path from 'node:path';

import fsExtra from 'fs-extra';

const { ensureDir, writeJson } = fsExtra;

import { loadEnvFile } from '../config.js';
import { generateMigration } from '../migration/generator.js';
import { markApplied } from '../migration/tracker.js';
import { buildRefMap, deepReplaceWithRefs } from '../sid/auto-ref.js';
import { readAllStates } from '../state/reader.js';
import { writeState } from '../state/writer.js';
import { createClient } from '../twilio/clients.js';
import { fetchResource, fetchServerlessServices, RESOURCE_TYPES } from '../twilio/fetchers.js';
import { info, success } from '../utils/display.js';

function timestamp() {
  const now = new Date();
  const d = now.toISOString().replace(/[-:T]/g, '').slice(0, 8);
  const t = now.toISOString().replace(/[-:T]/g, '').slice(8, 14);
  return `${d}_${t}`;
}

export async function pullCommand(options) {
  const { dir, envFile, resources } = options;
  const account = loadEnvFile(envFile);
  const types = resources
    ? resources.split(',').map((t) => t.trim())
    : RESOURCE_TYPES.filter((t) => t !== 'workspace');

  info(`Baixando recursos do cloud...`);

  // Fetch from cloud
  const cloudData = {};
  for (const type of types) {
    cloudData[type] = await fetchResource(account, type);
  }

  // Fetch serverless resources (read-only, for SID/URL mapping)
  const api = createClient(account);
  let serverlessResources;
  if (!resources) {
    info('Baixando recursos serverless...');
    serverlessResources = await fetchServerlessServices(api);
    await writeState(dir, 'serverless', serverlessResources);
  }

  // Read local state
  const localStates = await readAllStates(dir);

  // When filtering resources, use existing serverless state for @ref mapping
  if (resources) {
    serverlessResources = localStates.serverless?.resources || [];
  }

  // Build SID/URL → @ref mapping from ALL fetched data
  const allStatesForRef = {};
  for (const type of types) {
    allStatesForRef[type] = {
      resources: Array.isArray(cloudData[type])
        ? cloudData[type]
        : cloudData[type]
          ? [cloudData[type]]
          : [],
    };
  }
  const refMap = buildRefMap(allStatesForRef, serverlessResources);

  // Replace SIDs/URLs with @ref in cloud data for migration generation
  const refCloudData = {};
  for (const type of types) {
    refCloudData[type] = deepReplaceWithRefs(cloudData[type], refMap);
  }

  // Normalize local state with @refs for accurate comparison
  const refLocalStates = {};
  for (const type of types) {
    const state = localStates[type];
    refLocalStates[type] = state
      ? { ...state, resources: deepReplaceWithRefs(state.resources || [], refMap) }
      : state;
  }

  // Generate migration
  const migration = generateMigration(refCloudData, refLocalStates, types);

  if (!migration) {
    success('Nenhuma alteracao detectada.');
    return;
  }

  // Save migration file
  const migrationsDir = path.join(dir, 'migrations');
  await ensureDir(migrationsDir);
  const fileName = `${timestamp()}_pull-changes.json`;
  await writeJson(path.join(migrationsDir, fileName), migration, { spaces: 2 });

  // Mark as applied (cloud state is already in sync)
  await markApplied(dir, fileName);

  // Update local state with cloud data
  for (const type of types) {
    const res = Array.isArray(cloudData[type])
      ? cloudData[type]
      : cloudData[type]
        ? [cloudData[type]]
        : [];
    await writeState(dir, type, res);
  }

  success(`Migration gerada: ${fileName}`);
  info(`${migration.operations.length} operacao(oes) detectada(s).`);
  for (const op of migration.operations) {
    const name = op.data?.friendlyName || op.match?.friendlyName || '?';
    console.log(`  ${op.action} ${op.type}: ${name}`);
  }
}
