import { executeOperation } from '../twilio/writers.js';

import { resolveRefs } from './resolver.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function executeMigration(
  api,
  migration,
  state,
  workspaceSid,
  { dryRun = false, startIndex = 0, onProgress } = {},
) {
  const runtimeSids = {};
  const results = [];

  for (let i = 0; i < migration.operations.length; i++) {
    const operation = migration.operations[i];
    const resolved = resolveRefs(operation, state, runtimeSids);

    if (i < startIndex) continue;

    if (dryRun) {
      results.push({ operation: resolved, status: 'dry-run' });
      continue;
    }

    const result = await executeOperation(api, resolved, workspaceSid, state);
    results.push({ operation: resolved, status: 'ok', result });

    // Track created SIDs for subsequent @ref resolution
    if (operation.action === 'create' && result.sid) {
      const name = operation.data.friendlyName || operation.data.uniqueName;
      runtimeSids[`${operation.type}:${name}`] = result.sid;
    }

    if (onProgress) await onProgress(i, migration.operations.length);

    // Wait 1s between API operations (not after last)
    if (i < migration.operations.length - 1) {
      await sleep(1000);
    }
  }

  return results;
}
