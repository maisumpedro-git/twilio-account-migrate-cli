const REF_PATTERN = /^@ref:(\w+):(.+)$/;

const SERVERLESS_TYPES = new Set(['serverless', 'serverlessEnv', 'serverlessFn', 'serverlessUrl']);

function lookupSid(type, name, state, runtimeSids) {
  const runtimeKey = `${type}:${name}`;
  if (runtimeSids?.[runtimeKey]) return runtimeSids[runtimeKey];

  const resources = state[type]?.resources || [];
  const match = resources.find((r) => r.friendlyName === name || r.uniqueName === name);
  if (match) return match.sid;

  return null;
}

function lookupServerless(type, name, state, runtimeSids) {
  const runtimeKey = `${type}:${name}`;
  if (runtimeSids?.[runtimeKey]) return runtimeSids[runtimeKey];

  const services = state.serverless?.resources || [];

  if (type === 'serverless') {
    const service = services.find((s) => s.uniqueName === name);
    return service?.sid || null;
  }

  // For compound types, split name into parts: serviceName:rest
  const colonIdx = name.indexOf(':');
  if (colonIdx === -1) return null;

  const serviceName = name.slice(0, colonIdx);
  const rest = name.slice(colonIdx + 1);
  const service = services.find((s) => s.uniqueName === serviceName);
  if (!service) return null;

  if (type === 'serverlessEnv') {
    const env = (service.environments || []).find((e) => e.uniqueName === rest);
    return env?.sid || null;
  }

  if (type === 'serverlessFn') {
    const fn = (service.functions || []).find((f) => f.friendlyName === rest);
    return fn?.sid || null;
  }

  if (type === 'serverlessUrl') {
    // rest = envName:/path
    const envColonIdx = rest.indexOf(':');
    if (envColonIdx === -1) return null;

    const envName = rest.slice(0, envColonIdx);
    const path = rest.slice(envColonIdx + 1);
    const env = (service.environments || []).find((e) => e.uniqueName === envName);
    if (!env?.domainName) return null;

    return `https://${env.domainName}${path}`;
  }

  return null;
}

export function resolveRefs(obj, state, runtimeSids = {}) {
  if (obj == null) return obj;

  if (typeof obj === 'string') {
    const m = obj.match(REF_PATTERN);
    if (m) {
      const [, type, name] = m;
      const result = SERVERLESS_TYPES.has(type)
        ? lookupServerless(type, name, state, runtimeSids)
        : lookupSid(type, name, state, runtimeSids);
      if (!result) {
        throw new Error(
          `Referencia nao resolvida: @ref:${type}:${name} — recurso nao encontrado no state`,
        );
      }
      return result;
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => resolveRefs(item, state, runtimeSids));
  }

  if (typeof obj === 'object') {
    const resolved = {};
    for (const [key, val] of Object.entries(obj)) {
      resolved[key] = resolveRefs(val, state, runtimeSids);
    }
    return resolved;
  }

  return obj;
}
