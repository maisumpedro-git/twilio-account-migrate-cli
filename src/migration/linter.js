import { EMBEDDED_REF_PATTERN, tryResolveRef } from './resolver.js';

function opName(op) {
  return (
    op.data?.friendlyName ||
    op.match?.friendlyName ||
    op.data?.uniqueName ||
    op.match?.uniqueName ||
    '?'
  );
}

function resourceExists(state, type, name) {
  const resources = state?.[type]?.resources || [];
  return resources.some((r) => r.friendlyName === name || r.uniqueName === name);
}

function collectRefs(op) {
  const json = JSON.stringify(op);
  if (!json || !json.includes('@ref:')) return [];
  const seen = new Set();
  const refs = [];
  for (const m of json.matchAll(EMBEDDED_REF_PATTERN)) {
    const key = `${m[1]}:${m[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ type: m[1], name: m[2] });
  }
  return refs;
}

export function lintMigration(migration, state) {
  const issues = [];
  const runtimeSids = {};
  const deleted = new Set();
  const seenOps = new Map();

  if (!migration || !Array.isArray(migration.operations)) {
    issues.push({
      severity: 'error',
      op: -1,
      message: 'Migration sem array "operations"',
    });
    return issues;
  }

  for (let i = 0; i < migration.operations.length; i++) {
    const op = migration.operations[i];
    const name = opName(op);
    const key = `${op.type}:${name}`;

    if (op.action === 'create' || op.action === 'update' || op.action === 'delete') {
      const actionKey = `${op.action}:${key}`;
      const prev = seenOps.get(actionKey);
      if (prev !== undefined) {
        issues.push({
          severity: 'warning',
          op: i,
          message: `Operação duplicada (${op.action}) em ${op.type} "${name}" — também em op[${prev}]`,
        });
      } else {
        seenOps.set(actionKey, i);
      }
    }

    if (op.action === 'update' || op.action === 'delete') {
      const matchName = op.match?.friendlyName || op.match?.uniqueName;
      if (matchName) {
        const refKey = `${op.type}:${matchName}`;
        const inState = resourceExists(state, op.type, matchName);
        const inRuntime = !!runtimeSids[refKey];
        const wasDeleted = deleted.has(refKey);
        if (wasDeleted) {
          issues.push({
            severity: 'error',
            op: i,
            message: `${op.action} ${op.type} "${matchName}" — recurso já deletado por op anterior nesta migration`,
          });
        } else if (!inState && !inRuntime) {
          issues.push({
            severity: 'error',
            op: i,
            message: `${op.action} ${op.type} "${matchName}" — recurso não existe no state local nem foi criado por op anterior`,
          });
        }
      }
    }

    for (const ref of collectRefs(op)) {
      const refKey = `${ref.type}:${ref.name}`;
      if (deleted.has(refKey)) {
        issues.push({
          severity: 'error',
          op: i,
          message: `@ref:${ref.type}:${ref.name} aponta para recurso deletado em op anterior`,
        });
        continue;
      }
      const resolved = tryResolveRef(ref.type, ref.name, state, runtimeSids);
      if (!resolved) {
        issues.push({
          severity: 'error',
          op: i,
          message: `@ref não resolve: @ref:${ref.type}:${ref.name}`,
        });
      }
    }

    if (op.action === 'create') {
      const createdName = op.data?.friendlyName || op.data?.uniqueName;
      if (createdName) {
        runtimeSids[`${op.type}:${createdName}`] = `RUNTIME_${i}`;
        deleted.delete(`${op.type}:${createdName}`);
      }
    }

    if (op.action === 'delete') {
      const deletedName = op.match?.friendlyName || op.match?.uniqueName;
      if (deletedName) {
        const refKey = `${op.type}:${deletedName}`;
        delete runtimeSids[refKey];
        deleted.add(refKey);
      }
    }
  }

  return issues;
}

export function summarizeIssues(issues) {
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  return { errors, warnings, total: issues.length };
}
