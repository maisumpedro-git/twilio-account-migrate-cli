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
        map[r.sid] = `@ref:${refType}:${name}@@`;
      }
    }
  }

  // Map serverless resources
  for (const svc of serverlessResources || []) {
    const svcName = svc.uniqueName;
    if (svc.sid && svcName) {
      map[svc.sid] = `@ref:serverless:${svcName}@@`;
    }

    for (const env of svc.environments || []) {
      if (env.sid && env.uniqueName) {
        map[env.sid] = `@ref:serverlessEnv:${svcName}:${env.uniqueName}@@`;
      }

      // Build URL mappings for each function in each environment
      if (env.domainName) {
        for (const fn of svc.functions || []) {
          const fnPath = fn.path || fn.friendlyName;
          if (fnPath) {
            const url = `https://${env.domainName}${fnPath}`;
            map[url] = `@ref:serverlessUrl:${svcName}:${env.uniqueName}:${fnPath}@@`;
          }
        }
      }

      // Build URL mappings for each asset in each environment
      if (env.domainName) {
        for (const asset of svc.assets || []) {
          const assetPath = asset.path || asset.friendlyName;
          if (assetPath) {
            const url = `https://${env.domainName}${assetPath}`;
            map[url] = `@ref:serverlessUrl:${svcName}:${env.uniqueName}:${assetPath}@@`;
          }
        }
      }
    }

    for (const fn of svc.functions || []) {
      const fnName = fn.friendlyName || fn.path;
      if (fn.sid && fnName) {
        map[fn.sid] = `@ref:serverlessFn:${svcName}:${fnName}@@`;
      }
    }
  }

  return map;
}

function buildDomainMap(refMap) {
  const domainMap = {};
  for (const [key, value] of Object.entries(refMap)) {
    if (!key.startsWith('https://') || !value.startsWith('@ref:serverlessUrl:')) continue;
    const m = value.match(/@ref:serverlessUrl:([^:]+):([^:]+):/);
    if (!m) continue;
    const slashIdx = key.indexOf('/', 8); // after "https://"
    if (slashIdx === -1) continue;
    const domain = key.slice(8, slashIdx);
    domainMap[domain] = { svcName: m[1], envName: m[2] };
  }
  return domainMap;
}

export function deepReplaceWithRefs(obj, refMap) {
  if (obj == null) return obj;

  // Sort keys by length (longest first) to avoid partial matches
  const sortedKeys = Object.keys(refMap).sort((a, b) => b.length - a.length);
  if (sortedKeys.length === 0) return obj;

  // Stringify → replace all SIDs/URLs → parse back
  // This catches SIDs/URLs everywhere, including inside stringified JSON values
  let json = JSON.stringify(obj);
  for (const key of sortedKeys) {
    json = json.replaceAll(key, refMap[key]);
  }

  // Fallback: catch remaining URLs on known serverless domains
  // This handles URLs that didn't exactly match (trailing slashes, query params, etc.)
  const domainMap = buildDomainMap(refMap);
  for (const [domain, { svcName, envName }] of Object.entries(domainMap)) {
    const escaped = domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`https://${escaped}(/[^"]*)`, 'g');
    json = json.replace(regex, (_match, path) => {
      return `@ref:serverlessUrl:${svcName}:${envName}:${path}@@`;
    });
  }

  return JSON.parse(json);
}
