import chalk from 'chalk';

export function success(msg) {
  console.log(chalk.green(`✓ ${msg}`));
}

export function error(msg) {
  console.error(chalk.red(`✗ ${msg}`));
}

export function info(msg) {
  console.log(chalk.cyan(msg));
}

export function warn(msg) {
  console.log(chalk.yellow(msg));
}

function fmtVal(v) {
  if (v === undefined) return '<unset>';
  if (v === null) return '<null>';
  if (typeof v === 'string') return v.length > 80 ? `${v.slice(0, 77)}...` : v;
  if (typeof v === 'object') {
    const json = JSON.stringify(v);
    return json.length > 200 ? `${json.slice(0, 197)}...` : json;
  }
  return String(v);
}

export function printFieldDiff(label, currentVal, desiredVal, indent = '    ') {
  const cur = fmtVal(currentVal);
  const des = fmtVal(desiredVal);
  console.log(chalk.bold(`${indent}~ ${label}`));
  console.log(chalk.red(`${indent}  - ${cur}`));
  console.log(chalk.green(`${indent}  + ${des}`));
}

export function printAddedField(label, desiredVal, indent = '    ') {
  console.log(chalk.green(`${indent}+ ${label}: ${fmtVal(desiredVal)}`));
}

export function printRemovedField(label, currentVal, indent = '    ') {
  console.log(chalk.red(`${indent}- ${label}: ${fmtVal(currentVal)}`));
}
