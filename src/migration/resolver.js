const REF_PATTERN = /^@ref:(\w+):(.+)$/;

function lookupSid(type, name, state, runtimeSids) {
  const runtimeKey = `${type}:${name}`;
  if (runtimeSids?.[runtimeKey]) return runtimeSids[runtimeKey];

  const resources = state[type]?.resources || [];
  const match = resources.find((r) => r.friendlyName === name || r.uniqueName === name);
  if (match) return match.sid;

  return null;
}

export function resolveRefs(obj, state, runtimeSids = {}) {
  if (obj == null) return obj;

  if (typeof obj === 'string') {
    const m = obj.match(REF_PATTERN);
    if (m) {
      const [, type, name] = m;
      const sid = lookupSid(type, name, state, runtimeSids);
      if (!sid) {
        throw new Error(
          `Referencia nao resolvida: @ref:${type}:${name} — recurso nao encontrado no state`,
        );
      }
      return sid;
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
