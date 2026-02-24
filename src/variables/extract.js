import { RESOURCE_LABELS, RESOURCE_TYPES } from '../dataFetch/cache.js';
import { resourceName } from '../utils/display.js';

const SID_PATTERN = /^[A-Z]{2}[0-9a-f]{32}$/;

function extractSidsFromValue(value, path, results) {
  if (!value) return;

  if (typeof value === 'string' && SID_PATTERN.test(value)) {
    results.push({ sid: value, path });
    return;
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      extractSidsFromValue(value[i], `${path}[${i}]`, results);
    }
    return;
  }

  if (typeof value === 'object') {
    for (const [key, val] of Object.entries(value)) {
      extractSidsFromValue(val, path ? `${path}.${key}` : key, results);
    }
  }
}

export function extractSidsFromResources(cachedResources) {
  const sids = {};

  for (const type of RESOURCE_TYPES) {
    const cached = cachedResources[type];
    if (!cached) continue;

    const data = cached.data || cached;
    const items = Array.isArray(data) ? data : data ? [data] : [];
    const label = RESOURCE_LABELS[type] || type;

    for (const item of items) {
      const name = resourceName(item);

      if (item.sid && SID_PATTERN.test(item.sid)) {
        sids[item.sid] = {
          type,
          typeLabel: label,
          name,
          field: 'sid',
        };
      }

      const nested = [];
      extractSidsFromValue(item, '', nested);

      for (const { sid, path } of nested) {
        if (!sids[sid]) {
          sids[sid] = {
            type,
            typeLabel: label,
            name,
            field: path,
          };
        }
      }
    }
  }

  return sids;
}

export function buildCrossMapping(sourceVars, destVars) {
  const sourceByNameType = new Map();

  for (const [sid, info] of Object.entries(sourceVars.sids)) {
    if (info.field === 'sid') {
      const key = `${info.type}::${info.name}`;
      sourceByNameType.set(key, sid);
    }
  }

  const mapping = {};
  const variables = {};

  for (const [destSid, destInfo] of Object.entries(destVars.sids)) {
    if (destInfo.field !== 'sid') continue;
    const key = `${destInfo.type}::${destInfo.name}`;
    const sourceSid = sourceByNameType.get(key);

    if (sourceSid) {
      mapping[sourceSid] = destSid;
      const varName = `${destInfo.type}.${destInfo.name}`;
      variables[varName] = {
        source: sourceSid,
        dest: destSid,
        type: destInfo.type,
        name: destInfo.name,
      };
    }
  }

  return { mapping, variables };
}
