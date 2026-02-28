export function buildSidPairs(mapping) {
  const pairs = [];
  const pushPairs = (obj) => {
    for (const [from, to] of Object.entries(obj || {})) {
      if (from && to) pairs.push([from, to]);
    }
  };
  // TaskRouter
  pushPairs(mapping?.taskrouter?.workflows);
  pushPairs(mapping?.taskrouter?.taskQueues);
  pushPairs(mapping?.taskrouter?.activities);
  pushPairs(mapping?.taskrouter?.taskChannels);
  // Serverless
  pushPairs(mapping?.serverless?.services);
  pushPairs(mapping?.serverless?.environments);
  pushPairs(mapping?.serverless?.functions);
  // Content Templates
  pushPairs(mapping?.contentTemplates);
  // Studio flows
  pushPairs(mapping?.studio?.flows);
  return pairs.sort((a, b) => b[0].length - a[0].length);
}

export function replaceSidsInJsonString(jsonStr, mapping) {
  if (!jsonStr) return jsonStr;
  let s = String(jsonStr);
  for (const [from, to] of buildSidPairs(mapping)) {
    s = s.replaceAll(from, to);
  }
  return s;
}

export function deepReplaceSids(obj, mapping) {
  if (obj == null) return obj;
  if (Array.isArray(obj)) return obj.map((v) => deepReplaceSids(v, mapping));
  if (typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string') {
        let s = v;
        for (const [from, to] of buildSidPairs(mapping)) s = s.replaceAll(from, to);
        out[k] = s;
      } else {
        out[k] = deepReplaceSids(v, mapping);
      }
    }
    return out;
  }
  return obj;
}
