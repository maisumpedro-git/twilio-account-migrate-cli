import chalk from 'chalk';

import { RESOURCE_LABELS } from '../dataFetch/cache.js';
import { resourceName } from '../utils/display.js';

export function searchSimple(resources, term) {
  const results = [];
  const lowerTerm = term.toLowerCase();

  for (const [type, cached] of Object.entries(resources)) {
    const label = RESOURCE_LABELS[type] || type;
    const data = cached?.data || cached || [];
    const list = Array.isArray(data) ? data : data ? [data] : [];

    const matches = list.filter((item) => {
      const name = resourceName(item).toLowerCase();
      return name.includes(lowerTerm);
    });

    if (matches.length > 0) {
      results.push({ type, label, matches });
    }
  }

  return results;
}

export function printSimpleSearch(term, accountName, results) {
  console.log();
  console.log(chalk.cyanBright.bold(`Pesquisa por "${term}" em ${accountName}`));
  console.log();

  if (results.length === 0) {
    console.log(chalk.yellow('Nenhum resultado encontrado.'));
    return;
  }

  for (const r of results) {
    console.log(chalk.bold(`📦 ${r.label} (${r.matches.length} resultados)`));
    for (const m of r.matches) {
      console.log(`  - ${chalk.white(resourceName(m))} ${chalk.dim(`[${m.sid}]`)}`);
    }
    console.log();
  }
}
