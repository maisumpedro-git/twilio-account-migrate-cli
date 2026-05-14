import { tryParseJson } from '../utils/json.js';
import { fetchOne } from '../twilio/fetch-one.js';

const SKIP_TYPES = new Set(['workspace']);
const JSON_FIELDS = new Set(['definition', 'configuration', 'types', 'variables']);

function normalize(val, key) {
  if (JSON_FIELDS.has(key)) return tryParseJson(val);
  return val;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual(a[k], b[k]));
}

export async function verifyOperation(api, operation, result, workspaceSid) {
  if (!result?.sid) return { ok: true, mismatches: [] };
  if (SKIP_TYPES.has(operation.type)) return { ok: true, mismatches: [] };
  if (operation.action === 'delete') return { ok: true, mismatches: [] };
  if (operation.mode === 'partial') return { ok: true, mismatches: [], skipped: 'partial' };

  const data = operation.data || {};
  if (Object.keys(data).length === 0) return { ok: true, mismatches: [] };

  let cloud;
  try {
    cloud = await fetchOne(api, operation.type, result.sid, workspaceSid);
  } catch (err) {
    return { ok: false, mismatches: [], fetchError: err.message };
  }
  if (!cloud) return { ok: true, mismatches: [], skipped: 'unsupported-type' };

  const mismatches = [];
  for (const [key, expected] of Object.entries(data)) {
    const expectedNorm = normalize(expected, key);
    const actualNorm = normalize(cloud[key], key);
    if (!deepEqual(expectedNorm, actualNorm)) {
      mismatches.push({ field: key, expected: expectedNorm, actual: actualNorm });
    }
  }

  return { ok: mismatches.length === 0, mismatches };
}
