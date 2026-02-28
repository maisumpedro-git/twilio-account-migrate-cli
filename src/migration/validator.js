const VALID_TYPES = new Set([
  'workspace',
  'taskQueues',
  'taskChannels',
  'workflows',
  'studioFlows',
  'contentTemplates',
]);
const VALID_ACTIONS = new Set(['create', 'update', 'delete']);
const VALID_WIDGET_ACTIONS = new Set([
  'create_widget',
  'update_widget',
  'delete_widget',
  'rename_widget',
]);

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
      throw new Error(
        `${prefix}: "type" deve ser um tipo valido (${[...VALID_TYPES].join(', ')})`,
      );
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

      // Partial mode with widgetOps
      if (op.mode === 'partial' || op.widgetOps) {
        if (op.widgetOps && op.mode !== 'partial') {
          throw new Error(`${prefix}: widgetOps requer mode "partial"`);
        }
        if (op.type !== 'studioFlows') {
          throw new Error(
            `${prefix}: mode "partial" com widgetOps so e suportado para studioFlows`,
          );
        }
        if (op.widgetOps) {
          validateWidgetOps(op.widgetOps, prefix);
        }
      } else {
        if (!op.data || Object.keys(op.data).length === 0) {
          throw new Error(`${prefix}: update requer "data" com pelo menos um campo`);
        }
      }
    }

    if (op.action === 'delete') {
      if (!op.match?.friendlyName && !op.match?.uniqueName) {
        throw new Error(`${prefix}: delete requer "match" com "friendlyName" ou "uniqueName"`);
      }
    }
  });
}

function validateWidgetOps(widgetOps, prefix) {
  widgetOps.forEach((wop, j) => {
    const wPrefix = `${prefix}.widgetOps[${j}]`;

    if (!wop.action || !VALID_WIDGET_ACTIONS.has(wop.action)) {
      throw new Error(`${wPrefix}: "action" deve ser ${[...VALID_WIDGET_ACTIONS].join(', ')}`);
    }

    if (!wop.widget) {
      throw new Error(`${wPrefix}: "widget" (nome do widget) e obrigatorio`);
    }

    if (wop.action === 'rename_widget' && !wop.newName) {
      throw new Error(`${wPrefix}: rename_widget requer "newName"`);
    }
  });
}
