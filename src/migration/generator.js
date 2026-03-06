import { diffResources } from '../diff/compare.js';
import { generateRollbackAll } from '../migration/rollback.js';

const OPERATION_ORDER = {
  'taskQueues:create': 1,
  'taskChannels:create': 2,
  'contentTemplates:create': 3,
  'taskChannels:update': 4,
  'taskChannels:delete': 5,
  'workflows:create': 6,
  'workflows:update': 7,
  'workflows:delete': 8,
  'taskQueues:update': 9,
  'taskQueues:delete': 10,
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
