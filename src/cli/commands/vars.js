import chalk from 'chalk';

import { getAllCachedResources, RESOURCE_LABELS } from '../../dataFetch/cache.js';
import { printHeader, printTable } from '../../utils/display.js';
import { resolveAccount } from '../../utils/resolveAccount.js';
import { buildCrossMapping, extractSidsFromResources } from '../../variables/extract.js';
import { loadVarsFile, saveMappingFile, saveVarsFile } from '../../variables/store.js';

export async function varsInitCommand(options) {
  const account = resolveAccount(options.account);

  if (!account) {
    console.log(
      chalk.red('Conta não encontrada. Use --account <nome> ou --env-file <caminho>.'),
    );
    process.exit(1);
  }

  const resources = getAllCachedResources(account.name);

  if (!Object.keys(resources).length) {
    console.log(
      chalk.yellow(
        `\nNenhum recurso em cache para ${account.name}. Use o comando "pull" primeiro.\n`,
      ),
    );
    process.exit(1);
  }

  const sids = extractSidsFromResources(resources);
  const filePath = saveVarsFile(account.name, sids);

  console.log(chalk.green(`\nVariáveis extraídas com sucesso!`));
  console.log(chalk.dim(`Arquivo: ${filePath}`));
  console.log(chalk.dim(`Total de SIDs encontrados: ${Object.keys(sids).length}\n`));
}

export async function varsShowCommand(options) {
  const account = resolveAccount(options.account);

  if (!account) {
    console.log(
      chalk.red('Conta não encontrada. Use --account <nome> ou --env-file <caminho>.'),
    );
    process.exit(1);
  }

  const vars = loadVarsFile(account.name);

  if (!vars) {
    console.log(
      chalk.yellow(
        `\nArquivo de variáveis não encontrado para ${account.name}.\n` +
          'Execute "vars init --account <nome>" primeiro.\n',
      ),
    );
    process.exit(1);
  }

  printHeader(`Variáveis de ${account.name}`);
  console.log(chalk.dim(`Gerado em: ${vars.generatedAt}\n`));

  const grouped = {};
  for (const [sid, info] of Object.entries(vars.sids)) {
    const type = info.type;
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push({ sid, ...info });
  }

  for (const [type, items] of Object.entries(grouped)) {
    const label = RESOURCE_LABELS[type] || type;
    console.log(chalk.bold(`  ${label}:`));
    printTable(
      ['SID', 'Nome', 'Campo'],
      items.map((i) => [i.sid, i.name, i.field]),
    );
    console.log();
  }
}

export async function varsMapCommand(options) {
  const sourceAccount = resolveAccount(options.source);

  if (!sourceAccount) {
    console.log(chalk.red('Conta origem não encontrada. Use --source <nome>.'));
    process.exit(1);
  }

  const destAccount = resolveAccount(options.dest);

  if (!destAccount) {
    console.log(chalk.red('Conta destino não encontrada. Use --dest <nome>.'));
    process.exit(1);
  }

  const sourceVars = loadVarsFile(sourceAccount.name);
  const destVars = loadVarsFile(destAccount.name);

  if (!sourceVars || !destVars) {
    console.log(
      chalk.yellow(
        '\nArquivos de variáveis necessários para ambas as contas.\n' +
          'Execute "vars init --account <nome>" para cada conta primeiro.\n',
      ),
    );
    process.exit(1);
  }

  const { mapping, variables } = buildCrossMapping(sourceVars, destVars);
  const filePath = saveMappingFile(sourceAccount.name, destAccount.name, mapping, variables);

  console.log(chalk.green('\nMapeamento de variáveis criado com sucesso!'));
  console.log(chalk.dim(`Arquivo: ${filePath}`));
  console.log(chalk.dim(`Total de mapeamentos: ${Object.keys(mapping).length}\n`));

  printHeader(`Mapeamento: ${sourceAccount.name} → ${destAccount.name}`);
  const rows = Object.entries(variables).map(([varName, info]) => [
    varName,
    info.source,
    info.dest,
  ]);
  printTable(['Variável', `SID (${sourceAccount.name})`, `SID (${destAccount.name})`], rows);
  console.log();
}
