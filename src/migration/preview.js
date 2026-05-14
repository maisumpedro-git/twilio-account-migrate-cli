import { resolveRefs } from './resolver.js';
import { fetchResource } from '../twilio/fetchers.js';
import { info, printAddedField, printFieldDiff, printRemovedField, warn } from '../utils/display.js';

const cache = new Map();

async function fetchTypeOnce(account, type) {
  const cacheKey = `${account.accountSid}:${type}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const data = await fetchResource(account, type);
  const list = Array.isArray(data) ? data : data ? [data] : [];
  cache.set(cacheKey, list);
  return list;
}

export function clearPreviewCache() {
  cache.clear();
}

function findResource(resources, name) {
  return resources.find((r) => r.friendlyName === name || r.uniqueName === name);
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

function printDiff(current, desired, indent = '    ') {
  const allKeys = new Set([...Object.keys(current || {}), ...Object.keys(desired || {})]);
  let printed = 0;
  for (const key of allKeys) {
    const cur = current?.[key];
    const des = desired?.[key];
    if (deepEqual(cur, des)) continue;
    printed++;
    if (cur === undefined) {
      printAddedField(key, des, indent);
    } else if (des === undefined || des === null) {
      printRemovedField(key, cur, indent);
    } else {
      printFieldDiff(key, cur, des, indent);
    }
  }
  if (printed === 0) {
    console.log(`${indent}(sem mudanças efetivas — payload ja igual ao cloud)`);
  }
}

export async function previewOperation(account, state, op, runtimeSids = {}) {
  const name = op.data?.friendlyName || op.match?.friendlyName || op.data?.uniqueName || op.match?.uniqueName || '?';
  const header = `[dry-run] ${op.action} ${op.type}: ${name}`;
  console.log(header);

  if (op.type === 'workspace') {
    info('    (workspace — preview detalhado nao suportado)');
    return;
  }

  let resolved;
  try {
    resolved = resolveRefs(op, state, runtimeSids);
  } catch (err) {
    warn(`    aviso: nao foi possivel resolver @refs (${err.message}); preview pode ficar parcial`);
    resolved = op;
  }

  if (op.action === 'create') {
    if (op.mode === 'partial') {
      info('    (modo partial nao suportado para create)');
      return;
    }
    for (const [key, val] of Object.entries(resolved.data || {})) {
      printAddedField(key, val);
    }
    return;
  }

  if (op.action === 'delete') {
    let resources;
    try {
      resources = await fetchTypeOnce(account, op.type);
    } catch (err) {
      warn(`    aviso: nao foi possivel buscar cloud (${err.message})`);
      return;
    }
    const current = findResource(resources, name);
    if (!current) {
      warn(`    aviso: recurso "${name}" ja nao existe no cloud — delete sera no-op`);
    } else {
      console.log(`    deletara: sid=${current.sid}`);
    }
    return;
  }

  if (op.action === 'update') {
    if (op.mode === 'partial' && Array.isArray(op.widgetOps)) {
      info(`    modo partial — ${op.widgetOps.length} widget op(s):`);
      for (const wop of op.widgetOps) {
        console.log(`      ${wop.action} widget "${wop.widget}"${wop.newName ? ` -> "${wop.newName}"` : ''}`);
      }
      return;
    }

    let resources;
    try {
      resources = await fetchTypeOnce(account, op.type);
    } catch (err) {
      warn(`    aviso: nao foi possivel buscar cloud (${err.message})`);
      return;
    }
    const current = findResource(resources, name);
    if (!current) {
      warn(`    aviso: recurso "${name}" nao existe no cloud — update vai falhar`);
      return;
    }
    printDiff(current, resolved.data || {});
  }
}

export async function previewMigration(account, state, operations) {
  const runtimeSids = {};
  for (const op of operations) {
    await previewOperation(account, state, op, runtimeSids);
    if (op.action === 'create') {
      const name = op.data?.friendlyName || op.data?.uniqueName;
      if (name) runtimeSids[`${op.type}:${name}`] = `RUNTIME_${name}`;
    }
  }
}
