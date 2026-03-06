const VALID_TYPES = new Set([
  'workspace',
  'taskQueues',
  'taskChannels',
  'workflows',
  'studioFlows',
  'contentTemplates',
]);
const VALID_ACTIONS = new Set(['create', 'update', 'delete']);

export function validateMigration(migration) {
  if (!migration || !Array.isArray(migration.operations)) {
    throw new Error('Migration deve ter um campo "operations" como array');
  }

  migration.operations.forEach((op, i) => {
    const prefix = `Operation[${i}]`;

    if (!op.action || !VALID_ACTIONS.has(op.action)) {
      throw new Error(`${prefix}: "action" deve ser create, update ou delete`);
    }

    if (!op.type || !VALID_TYPES.has(op.type)) {
      throw new Error(`${prefix}: "type" deve ser um tipo valido (${[...VALID_TYPES].join(', ')})`);
    }

    if (op.action === 'create') {
      if (!op.data?.friendlyName && !op.data?.uniqueName) {
        throw new Error(`${prefix}: create requer "data" com "friendlyName" ou "uniqueName"`);
      }
    }

    if (op.action === 'update') {
      if (!op.match?.friendlyName && !op.match?.uniqueName) {
        throw new Error(`${prefix}: update requer "match" com "friendlyName" ou "uniqueName"`);
      }

      if (!op.data || Object.keys(op.data).length === 0) {
        throw new Error(`${prefix}: update requer "data" com pelo menos um campo`);
      }
    }

    if (op.action === 'delete') {
      if (!op.match?.friendlyName && !op.match?.uniqueName) {
        throw new Error(`${prefix}: delete requer "match" com "friendlyName" ou "uniqueName"`);
      }
    }
  });
}
