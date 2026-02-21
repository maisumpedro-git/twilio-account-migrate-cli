import chalk from 'chalk';

export function formatTimestamp(iso) {
  if (!iso) return chalk.dim('nunca');
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
}

export function resourceName(item) {
  return item?.friendlyName || item?.uniqueName || item?.sid || '(sem nome)';
}

export function printHeader(title) {
  console.log();
  console.log(chalk.cyanBright.bold(`═══ ${title} ═══`));
  console.log();
}

export function printTable(headers, rows) {
  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(r[i] || '').length)),
  );

  const headerLine = headers.map((h, i) => h.padEnd(colWidths[i])).join('  ');
  const separator = colWidths.map((w) => '─'.repeat(w)).join('──');

  console.log(chalk.bold(headerLine));
  console.log(chalk.dim(separator));
  for (const row of rows) {
    const line = row.map((cell, i) => String(cell || '').padEnd(colWidths[i])).join('  ');
    console.log(line);
  }
}

export function printDiff(label, valueA, valueB) {
  if (valueA === valueB) {
    console.log(chalk.green(`  ✓ ${label}: ${valueA}`));
  } else {
    console.log(chalk.red(`  ✗ ${label}:`));
    console.log(chalk.red(`    ← ${valueA}`));
    console.log(chalk.green(`    → ${valueB}`));
  }
}

export function printJson(obj, indent = 2) {
  console.log(JSON.stringify(obj, null, indent));
}

export function envLabel(env) {
  const colors = {
    dev: chalk.green,
    stage: chalk.yellow,
    prod: chalk.red,
  };
  const colorFn = colors[env] || chalk.white;
  return colorFn(`[${env.toUpperCase()}]`);
}
