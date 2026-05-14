import { tryParseJson } from '../utils/json.js';

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
  'revision',
]);

const JSON_FIELDS = new Set(['definition', 'configuration', 'types', 'variables']);

function resourceKey(item) {
  return item.friendlyName || item.uniqueName || item.sid;
}

function stripMetadata(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(stripMetadata);
  const cleaned = {};
  for (const [key, val] of Object.entries(obj)) {
    if (METADATA_FIELDS.has(key)) continue;
    cleaned[key] = JSON_FIELDS.has(key) ? tryParseJson(val) : val;
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

export function changedFields(desiredItem, currentItem) {
  const cleanDesired = stripMetadata(desiredItem);
  const cleanCurrent = stripMetadata(currentItem);
  const changed = {};
  const allKeys = new Set([...Object.keys(cleanDesired), ...Object.keys(cleanCurrent)]);
  for (const key of allKeys) {
    const desiredVal = cleanDesired[key];
    const currentVal = cleanCurrent[key];
    if (deepEqual(desiredVal, currentVal)) continue;
    changed[key] = desiredVal === undefined ? null : desiredVal;
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
