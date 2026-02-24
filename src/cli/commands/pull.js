import chalk from 'chalk';
import ora from 'ora';

import { parseResourceTypes, RESOURCE_LABELS } from '../../dataFetch/cache.js';
import { fetchAllResources, fetchResource } from '../../dataFetch/fetchAll.js';
import { resolveAccount } from '../../utils/resolveAccount.js';

export async function pullCommand(options) {
  const account = resolveAccount(options.account);

  if (!account) {
    console.log(
      chalk.red('Conta não encontrada. Use --account <nome> ou --env-file <caminho>.'),
    );
    process.exit(1);
  }

  const resourceTypes = parseResourceTypes(options.resources);

  console.log(chalk.cyanBright(`\nBaixando recursos de ${chalk.bold(account.name)}...\n`));

  if (!options.resources) {
    const spinner = ora(`Baixando todos os recursos de ${account.name}...`).start();
    try {
      await fetchAllResources(account);
      spinner.succeed(`Todos os recursos de ${account.name} baixados com sucesso!`);
    } catch (err) {
      spinner.fail(`Erro ao baixar recursos: ${err.message}`);
      process.exit(1);
    }
  } else {
    for (const type of resourceTypes) {
      const label = RESOURCE_LABELS[type] || type;
      const spinner = ora(`Baixando ${label}...`).start();
      try {
        await fetchResource(account, type);
        spinner.succeed(`${label} baixado!`);
      } catch (err) {
        spinner.fail(`Erro ao baixar ${label}: ${err.message}`);
      }
    }
  }

  console.log(chalk.green('\nPull concluído!\n'));
}
