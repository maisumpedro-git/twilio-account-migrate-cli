import { diffResources } from '../diff/compare.js';
import { generateRollbackAll } from '../migration/rollback.js';

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

  const rollback = generateRollbackAll(allOperations, localStates);

  return {
    description,
    createdAt: new Date().toISOString(),
    source: 'pull',
    operations: allOperations,
    rollback,
  };
}
