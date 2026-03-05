const METADATA_FIELDS = new Set([
  'sid',
  'accountSid',
  'account_sid',
  'dateCreated',
  'date_created',
  'dateUpdated',
  'date_updated',
  'url',
  'links',
]);

function stripMetadata(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const cleaned = {};
  for (const [key, val] of Object.entries(obj)) {
    if (METADATA_FIELDS.has(key)) continue;
    cleaned[key] = val;
  }
  return cleaned;
}

function findInState(state, type, friendlyName) {
  const resources = state[type]?.resources || [];
  return resources.find((r) => r.friendlyName === friendlyName || r.uniqueName === friendlyName);
}

export function generateRollback(operation, localState) {
  const { action, type, match, data } = operation;

  switch (action) {
    case 'create':
      return {
        action: 'delete',
        type,
        match: { friendlyName: data.friendlyName || data.uniqueName },
      };

    case 'delete': {
      const original = findInState(localState, type, match.friendlyName);
      return {
        action: 'create',
        type,
        data: stripMetadata(original || {}),
      };
    }

    case 'update': {
      const original = findInState(localState, type, match.friendlyName);
      const oldValues = {};
      if (original) {
        for (const key of Object.keys(data)) {
          if (!METADATA_FIELDS.has(key)) {
            oldValues[key] = original[key];
          }
        }
      }
      return {
        action: 'update',
        type,
        match: { friendlyName: match.friendlyName },
        data: oldValues,
      };
    }

    default:
      throw new Error(`Acao desconhecida: ${action}`);
  }
}

export function generateRollbackAll(operations, localState) {
  return operations.map((op) => generateRollback(op, localState)).reverse();
}
