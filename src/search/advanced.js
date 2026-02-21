import chalk from 'chalk';

import { RESOURCE_LABELS } from '../dataFetch/cache.js';
import { resourceName } from '../utils/display.js';

function searchInValue(val, term) {
  if (val === null || val === undefined) return false;
  if (typeof val === 'string') return val.toLowerCase().includes(term);
  if (typeof val === 'number') return String(val).includes(term);
  if (Array.isArray(val)) return val.some((v) => searchInValue(v, term));
  if (typeof val === 'object') return Object.values(val).some((v) => searchInValue(v, term));
  return false;
}

function findPaths(obj, term, path = '') {
  const paths = [];
  if (obj === null || obj === undefined) return paths;

  if (typeof obj === 'string' && obj.toLowerCase().includes(term)) {
    paths.push({ path: path || '(root)', value: obj });
    return paths;
  }
  if (typeof obj === 'number' && String(obj).includes(term)) {
    paths.push({ path: path || '(root)', value: String(obj) });
    return paths;
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      paths.push(...findPaths(obj[i], term, `${path}[${i}]`));
    }
    return paths;
  }
  if (typeof obj === 'object') {
    for (const [key, val] of Object.entries(obj)) {
      paths.push(...findPaths(val, term, path ? `${path}.${key}` : key));
    }
  }
  return paths;
}

export function searchAdvanced(resources, term) {
  const results = [];
  const lowerTerm = term.toLowerCase();

  for (const [type, cached] of Object.entries(resources)) {
    const label = RESOURCE_LABELS[type] || type;
    const data = cached?.data || cached || [];
    const list = Array.isArray(data) ? data : data ? [data] : [];

    const matches = [];
    for (const item of list) {
      if (searchInValue(item, lowerTerm)) {
        const paths = findPaths(item, lowerTerm);
        matches.push({ item, paths });
      }
    }

    if (matches.length > 0) {
      results.push({ type, label, matches });
    }
  }

  return results;
}

export function printAdvancedSearch(term, accountName, results) {
  console.log();
  console.log(chalk.cyanBright.bold(`Pesquisa avançada por "${term}" em ${accountName}`));
  console.log();

  if (results.length === 0) {
    console.log(chalk.yellow('Nenhum resultado encontrado.'));
    return;
  }

  for (const r of results) {
    console.log(chalk.bold(`📦 ${r.label} (${r.matches.length} resultados)`));

    for (const m of r.matches) {
      console.log(`  ${chalk.white(resourceName(m.item))} ${chalk.dim(`[${m.item.sid}]`)}`);

      for (const p of m.paths.slice(0, 5)) {
        const val = String(p.value);
        const highlighted = highlightTerm(val, term);
        console.log(chalk.dim(`    ${p.path}: `) + highlighted);
      }
      if (m.paths.length > 5) {
        console.log(chalk.dim(`    ... e mais ${m.paths.length - 5} ocorrências`));
      }
    }
    console.log();
  }
}

function highlightTerm(text, term) {
  const idx = text.toLowerCase().indexOf(term.toLowerCase());
  if (idx === -1) return text;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + term.length);
  const after = text.slice(idx + term.length);
  return before + chalk.bgYellow.black(match) + after;
}
