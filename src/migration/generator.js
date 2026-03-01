import { diffResources } from '../diff/compare.js';
import { generateRollbackAll } from '../migration/rollback.js';

const OPERATION_ORDER = {
  'taskQueues:create': 1,
  'taskChannels:create': 2,
  'taskChannels:update': 3,
  'taskChannels:delete': 4,
  'workflows:create': 5,
  'workflows:update': 6,
  'workflows:delete': 7,
  'taskQueues:update': 8,
  'taskQueues:delete': 9,
  'contentTemplates:create': 10,
  'contentTemplates:update': 11,
  'contentTemplates:delete': 12,
  'studioFlows:create': 13,
  'studioFlows:update': 14,
  'studioFlows:delete': 15,
};

function operationPriority(op) {
  const key = `${op.type}:${op.action}`;
  return OPERATION_ORDER[key] ?? 99;
}

function sortOperations(operations) {
  return [...operations].sort((a, b) => operationPriority(a) - operationPriority(b));
}

export function generateMigration(
  cloudData,
  localStates,
  resourceTypes,
  description = 'pull-changes',
) {
  const allOperations = [];

  for (const type of resourceTypes) {
    const cloudResources = Array.isArray(cloudData[type])
      ? cloudData[type]
      : cloudData[type]
        ? [cloudData[type]]
        : [];
    const localResources = localStates[type]?.resources || [];

    const ops = diffResources(cloudResources, localResources);
    for (const op of ops) {
      allOperations.push({ ...op, type });
    }
  }

  if (allOperations.length === 0) return null;

  const sorted = sortOperations(allOperations);
  const rollback = generateRollbackAll(sorted, localStates);

  return {
    description,
    createdAt: new Date().toISOString(),
    source: 'pull',
    operations: sorted,
    rollback,
  };
}
