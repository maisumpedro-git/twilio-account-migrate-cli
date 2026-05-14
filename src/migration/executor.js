import { executeOperation } from '../twilio/writers.js';

import { resolveRefs } from './resolver.js';
import { verifyOperation } from './verify.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function executeMigration(
  api,
  migration,
  state,
  workspaceSid,
  { dryRun = false, startIndex = 0, onProgress, verify = false, onVerify } = {},
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

    let result;
    try {
      result = await executeOperation(api, resolved, workspaceSid, state);
    } catch (err) {
      throw wrapOperationError(err, resolved, i, migration.operations.length);
    }
    results.push({ operation: resolved, status: 'ok', result });

    // Track created SIDs for subsequent @ref resolution
    if (operation.action === 'create' && result.sid) {
      const name = operation.data.friendlyName || operation.data.uniqueName;
      runtimeSids[`${operation.type}:${name}`] = result.sid;
    }

    if (verify) {
      const verifyResult = await verifyOperation(api, resolved, result, workspaceSid);
      if (onVerify) await onVerify(i, resolved, verifyResult);
    }

    if (onProgress) await onProgress(i, migration.operations.length);

    // Wait 1s between API operations (not after last)
    if (i < migration.operations.length - 1) {
      await sleep(1000);
    }
  }

  return results;
}

function wrapOperationError(err, operation, index, total) {
  const name = operation.data?.friendlyName || operation.match?.friendlyName || operation.data?.uniqueName || operation.match?.uniqueName || '?';
  const context = `Operação ${index + 1}/${total} (${operation.action} ${operation.type}: ${name})`;
  const wrapped = new Error(`${context} falhou: ${err?.message || err}`);
  wrapped.cause = err;
  if (err?.details !== undefined) wrapped.details = err.details;
  if (err?.status !== undefined) wrapped.status = err.status;
  if (err?.code !== undefined) wrapped.code = err.code;
  if (err?.moreInfo !== undefined) wrapped.moreInfo = err.moreInfo;
  wrapped.operationIndex = index;
  wrapped.operationAction = operation.action;
  wrapped.operationType = operation.type;
  wrapped.operationName = name;
  return wrapped;
}
