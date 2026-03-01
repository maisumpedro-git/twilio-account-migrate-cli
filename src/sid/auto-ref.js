// src/sid/auto-ref.js

const MANAGED_TYPES = [
  { stateKey: 'taskQueues', refType: 'taskQueues', nameField: 'friendlyName' },
  { stateKey: 'workflows', refType: 'workflows', nameField: 'friendlyName' },
  {
    stateKey: 'taskChannels',
    refType: 'taskChannels',
    nameField: 'uniqueName',
    fallback: 'friendlyName',
  },
  { stateKey: 'studioFlows', refType: 'studioFlows', nameField: 'friendlyName' },
  {
    stateKey: 'contentTemplates',
    refType: 'contentTemplates',
    nameField: 'friendlyName',
    fallback: 'uniqueName',
  },
];

export function buildRefMap(allStates, serverlessResources) {
  const map = {};

  // Map managed resource SIDs
  for (const { stateKey, refType, nameField, fallback } of MANAGED_TYPES) {
    const resources = allStates[stateKey]?.resources || [];
    for (const r of resources) {
      const name = r[nameField] || (fallback && r[fallback]);
      if (r.sid && name) {
        map[r.sid] = `@ref:${refType}:${name}`;
      }
    }
  }

  // Map serverless resources
  for (const svc of serverlessResources || []) {
    const svcName = svc.uniqueName;
    if (svc.sid && svcName) {
      map[svc.sid] = `@ref:serverless:${svcName}`;
    }

    for (const env of svc.environments || []) {
      if (env.sid && env.uniqueName) {
        map[env.sid] = `@ref:serverlessEnv:${svcName}:${env.uniqueName}`;
      }

      // Build URL mappings for each function in each environment
      if (env.domainName) {
        for (const fn of svc.functions || []) {
          if (fn.path) {
            const url = `https://${env.domainName}${fn.path}`;
            map[url] = `@ref:serverlessUrl:${svcName}:${env.uniqueName}:${fn.path}`;
          }
        }
      }

      // Build URL mappings for each asset in each environment
      if (env.domainName) {
        for (const asset of svc.assets || []) {
          if (asset.path) {
            const url = `https://${env.domainName}${asset.path}`;
            map[url] = `@ref:serverlessUrl:${svcName}:${env.uniqueName}:${asset.path}`;
          }
        }
      }
    }

    for (const fn of svc.functions || []) {
      const fnName = fn.friendlyName || fn.path;
      if (fn.sid && fnName) {
        map[fn.sid] = `@ref:serverlessFn:${svcName}:${fnName}`;
      }
    }
  }

  return map;
}

export function deepReplaceWithRefs(obj, refMap) {
  if (obj == null) return obj;

  if (typeof obj === 'string') {
    // Sort keys by length (longest first) to avoid partial matches
    const sortedKeys = Object.keys(refMap).sort((a, b) => b.length - a.length);
    let result = obj;
    for (const key of sortedKeys) {
      result = result.replaceAll(key, refMap[key]);
    }
    return result;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => deepReplaceWithRefs(item, refMap));
  }

  if (typeof obj === 'object') {
    const result = {};
    for (const [key, val] of Object.entries(obj)) {
      result[key] = deepReplaceWithRefs(val, refMap);
    }
    return result;
  }

  return obj;
}
