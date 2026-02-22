import chalk from 'chalk';

import { RESOURCE_LABELS } from '../dataFetch/cache.js';
import { envLabel, resourceName } from '../utils/display.js';

function deepDiff(objA, objB, path = '') {
  const diffs = [];

  if (objA === objB) return diffs;
  if (objA === null || objA === undefined || objB === null || objB === undefined) {
    if (objA !== objB) diffs.push({ path: path || '(root)', valueA: objA, valueB: objB });
    return diffs;
  }
  if (typeof objA !== typeof objB) {
    diffs.push({ path: path || '(root)', valueA: objA, valueB: objB });
    return diffs;
  }
  if (typeof objA !== 'object') {
    if (objA !== objB) diffs.push({ path: path || '(root)', valueA: objA, valueB: objB });
    return diffs;
  }
  if (Array.isArray(objA) && Array.isArray(objB)) {
    const maxLen = Math.max(objA.length, objB.length);
    for (let i = 0; i < maxLen; i++) {
      diffs.push(...deepDiff(objA[i], objB[i], `${path}[${i}]`));
    }
    return diffs;
  }

  const allKeys = new Set([...Object.keys(objA), ...Object.keys(objB)]);
  for (const key of allKeys) {
    diffs.push(...deepDiff(objA[key], objB[key], path ? `${path}.${key}` : key));
  }
  return diffs;
}

function stripSids(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const cleaned = Array.isArray(obj) ? [...obj] : { ...obj };
  if (!Array.isArray(cleaned)) {
    delete cleaned.sid;
    delete cleaned.accountSid;
    delete cleaned.account_sid;
    delete cleaned.dateCreated;
    delete cleaned.date_created;
    delete cleaned.dateUpdated;
    delete cleaned.date_updated;
    delete cleaned.url;
    delete cleaned.links;
  }
  for (const key of Object.keys(cleaned)) {
    if (typeof cleaned[key] === 'object' && cleaned[key] !== null) {
      cleaned[key] = stripSids(cleaned[key]);
    }
  }
  return cleaned;
}

export function compareAdvanced(accountA, resourcesA, accountB, resourcesB, resourceTypes) {
  const results = [];

  for (const type of resourceTypes) {
    const label = RESOURCE_LABELS[type] || type;
    const dataA = resourcesA[type]?.data || resourcesA[type] || [];
    const dataB = resourcesB[type]?.data || resourcesB[type] || [];

    const listA = Array.isArray(dataA) ? dataA : dataA ? [dataA] : [];
    const listB = Array.isArray(dataB) ? dataB : dataB ? [dataB] : [];

    const mapA = new Map(listA.map((item) => [resourceName(item), item]));
    const mapB = new Map(listB.map((item) => [resourceName(item), item]));

    const allNames = new Set([...mapA.keys(), ...mapB.keys()]);
    const resourceDiffs = [];

    for (const name of allNames) {
      const itemA = mapA.get(name);
      const itemB = mapB.get(name);

      if (!itemA) {
        resourceDiffs.push({ name, status: 'only_b', diffs: [] });
      } else if (!itemB) {
        resourceDiffs.push({ name, status: 'only_a', diffs: [] });
      } else {
        const cleanA = stripSids(itemA);
        const cleanB = stripSids(itemB);
        const diffs = deepDiff(cleanA, cleanB);
        if (diffs.length > 0) {
          resourceDiffs.push({ name, status: 'different', diffs });
        } else {
          resourceDiffs.push({ name, status: 'equal', diffs: [] });
        }
      }
    }

    results.push({ type, label, resourceDiffs });
  }

  return results;
}

export function printAdvancedComparison(accountA, accountB, results) {
  console.log();
  console.log(
    chalk.cyanBright.bold(
      `Comparação avançada: ${envLabel(accountA.environment)} ${accountA.name}  ↔  ${envLabel(accountB.environment)} ${accountB.name}`,
    ),
  );
  console.log();

  for (const r of results) {
    console.log(chalk.bold(`📦 ${r.label}`));

    for (const rd of r.resourceDiffs) {
      if (rd.status === 'equal') {
        console.log(chalk.green(`  ✓ ${rd.name} — idêntico`));
      } else if (rd.status === 'only_a') {
        console.log(chalk.yellow(`  ← ${rd.name} — apenas em ${accountA.name}`));
      } else if (rd.status === 'only_b') {
        console.log(chalk.green(`  → ${rd.name} — apenas em ${accountB.name}`));
      } else {
        console.log(chalk.red(`  ✗ ${rd.name} — ${rd.diffs.length} diferenças:`));
        for (const d of rd.diffs.slice(0, 10)) {
          console.log(chalk.dim(`    ${d.path}:`));
          console.log(chalk.red(`      ${accountA.name}: ${formatValue(d.valueA)}`));
          console.log(chalk.green(`      ${accountB.name}: ${formatValue(d.valueB)}`));
        }
        if (rd.diffs.length > 10) {
          console.log(chalk.dim(`    ... e mais ${rd.diffs.length - 10} diferenças`));
        }
      }
    }
    console.log();
  }
}

function formatValue(val) {
  if (val === undefined) return chalk.dim('(não existe)');
  if (val === null) return chalk.dim('null');
  if (typeof val === 'object') return JSON.stringify(val, null, 2).split('\n').join('\n      ');
  return String(val);
}
