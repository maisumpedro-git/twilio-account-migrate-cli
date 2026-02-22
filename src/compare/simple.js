import chalk from 'chalk';

import { RESOURCE_LABELS } from '../dataFetch/cache.js';
import { envLabel, resourceName } from '../utils/display.js';

export function compareSimple(accountA, resourcesA, accountB, resourcesB, resourceTypes) {
  const results = [];

  for (const type of resourceTypes) {
    const label = RESOURCE_LABELS[type] || type;
    const dataA = resourcesA[type]?.data || resourcesA[type] || [];
    const dataB = resourcesB[type]?.data || resourcesB[type] || [];

    const listA = Array.isArray(dataA) ? dataA : dataA ? [dataA] : [];
    const listB = Array.isArray(dataB) ? dataB : dataB ? [dataB] : [];

    const namesA = new Set(listA.map(resourceName));
    const namesB = new Set(listB.map(resourceName));

    const onlyInA = [...namesA].filter((n) => !namesB.has(n));
    const onlyInB = [...namesB].filter((n) => !namesA.has(n));
    const inBoth = [...namesA].filter((n) => namesB.has(n));

    results.push({ type, label, countA: listA.length, countB: listB.length, onlyInA, onlyInB, inBoth });
  }

  return results;
}

export function printSimpleComparison(accountA, accountB, results) {
  console.log();
  console.log(
    chalk.cyanBright.bold(
      `Comparação: ${envLabel(accountA.environment)} ${accountA.name}  ↔  ${envLabel(accountB.environment)} ${accountB.name}`,
    ),
  );
  console.log();

  for (const r of results) {
    console.log(chalk.bold(`📦 ${r.label}`));
    console.log(`   ${accountA.name}: ${chalk.cyan(r.countA)} recursos`);
    console.log(`   ${accountB.name}: ${chalk.cyan(r.countB)} recursos`);

    if (r.onlyInA.length) {
      console.log(chalk.yellow(`   Apenas em ${accountA.name}:`));
      for (const name of r.onlyInA) console.log(chalk.yellow(`     - ${name}`));
    }
    if (r.onlyInB.length) {
      console.log(chalk.green(`   Apenas em ${accountB.name}:`));
      for (const name of r.onlyInB) console.log(chalk.green(`     - ${name}`));
    }
    if (r.inBoth.length) {
      console.log(chalk.dim(`   Em ambos: ${r.inBoth.length} recursos`));
    }
    console.log();
  }
}
