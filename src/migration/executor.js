import { resolveRefs } from './resolver.js';
import { executeOperation } from '../twilio/writers.js';

export async function executeMigration(
  api,
  migration,
  state,
  workspaceSid,
  { dryRun = false } = {},
) {
  const runtimeSids = {};
  const results = [];

  for (const operation of migration.operations) {
    const resolved = resolveRefs(operation, state, runtimeSids);

    if (dryRun) {
      results.push({ operation: resolved, status: 'dry-run' });
      continue;
    }

    const result = await executeOperation(api, resolved, workspaceSid);
    results.push({ operation: resolved, status: 'ok', result });

    // Track created SIDs for subsequent @ref resolution
    if (operation.action === 'create' && result.sid) {
      const name = operation.data.friendlyName || operation.data.uniqueName;
      runtimeSids[`${operation.type}:${name}`] = result.sid;
    }
  }

  return results;
}
