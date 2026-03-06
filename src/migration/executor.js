import { executeOperation, findSidByName } from '../twilio/writers.js';

import { resolveRefs } from './resolver.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const UNRESOLVED_REF_PATTERN = /@ref:(\w+):(.+?) —/;

async function resolveWithApiFallback(operation, state, runtimeSids, api, workspaceSid) {
  try {
    return resolveRefs(operation, state, runtimeSids);
  } catch (err) {
    if (!err.message.includes('Referencia nao resolvida')) throw err;

    const match = err.message.match(UNRESOLVED_REF_PATTERN);
    if (!match) throw err;

    const [, type, name] = match;
    const sid = await findSidByName(api, type, name, workspaceSid);
    if (!sid) throw err;

    // Cache in state so subsequent operations can resolve without extra API calls
    if (!state[type]) state[type] = { resources: [] };
    state[type].resources.push({ sid, friendlyName: name });
    runtimeSids[`${type}:${name}`] = sid;

    return resolveWithApiFallback(operation, state, runtimeSids, api, workspaceSid);
  }
}

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
    const resolved = await resolveWithApiFallback(operation, state, runtimeSids, api, workspaceSid);

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
