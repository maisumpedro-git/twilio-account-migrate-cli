import { diffResources } from '../diff/compare.js';
import { fetchResource } from '../twilio/fetchers.js';

function affectedTypes(operations) {
  const types = new Set();
  for (const op of operations || []) {
    if (op.type && op.type !== 'workspace') types.add(op.type);
  }
  return [...types];
}

export async function detectDrift(account, state, operations) {
  const types = affectedTypes(operations);
  const drifts = [];

  for (const type of types) {
    let cloud;
    try {
      cloud = await fetchResource(account, type);
    } catch (err) {
      drifts.push({ type, error: err.message });
      continue;
    }
    const cloudList = Array.isArray(cloud) ? cloud : cloud ? [cloud] : [];
    const localList = state?.[type]?.resources || [];
    const ops = diffResources(cloudList, localList);
    if (ops.length > 0) {
      drifts.push({ type, ops });
    }
  }

  return { hasDrift: drifts.length > 0, drifts };
}
