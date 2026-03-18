const METADATA_FIELDS = new Set([
  'sid',
  'accountSid',
  'account_sid',
  'commitMessage',
  'status',
  'dateCreated',
  'date_created',
  'dateUpdated',
  'date_updated',
  'url',
  'links',
]);

function resourceKey(item) {
  return item.friendlyName || item.uniqueName || item.sid;
}

function stripMetadata(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(stripMetadata);
  const cleaned = {};
  for (const [key, val] of Object.entries(obj)) {
    if (METADATA_FIELDS.has(key)) continue;
    cleaned[key] = val;
  }
  return cleaned;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((val, i) => deepEqual(val, b[i]));
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => deepEqual(a[key], b[key]));
}

function changedFields(cloudItem, localItem) {
  const cleanCloud = stripMetadata(cloudItem);
  const cleanLocal = stripMetadata(localItem);
  const changed = {};
  for (const [key, val] of Object.entries(cleanCloud)) {
    if (!deepEqual(val, cleanLocal[key])) {
      changed[key] = val;
    }
  }
  return changed;
}

export function diffResources(cloudResources, localResources) {
  const operations = [];
  const cloudMap = new Map(cloudResources.map((r) => [resourceKey(r), r]));
  const localMap = new Map(localResources.map((r) => [resourceKey(r), r]));

  // Resources in cloud but not local -> create
  for (const [name, cloudItem] of cloudMap) {
    if (!localMap.has(name)) {
      const data = stripMetadata(cloudItem);
      operations.push({ action: 'create', data });
    }
  }

  // Resources in local but not cloud -> delete
  for (const [name] of localMap) {
    if (!cloudMap.has(name)) {
      operations.push({ action: 'delete', match: { friendlyName: name } });
    }
  }

  // Resources in both -> check for updates
  for (const [name, cloudItem] of cloudMap) {
    const localItem = localMap.get(name);
    if (!localItem) continue;

    const changed = changedFields(cloudItem, localItem);
    if (Object.keys(changed).length > 0) {
      operations.push({
        action: 'update',
        match: { friendlyName: name },
        data: changed,
      });
    }
  }

  return operations;
}
