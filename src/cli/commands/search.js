import chalk from 'chalk';

import { getAllCachedResources } from '../../dataFetch/cache.js';
import { printAdvancedSearch, searchAdvanced } from '../../search/advanced.js';
import { printSimpleSearch, searchSimple } from '../../search/simple.js';
import { resolveAccount } from '../../utils/resolveAccount.js';

export async function searchCommand(options) {
  const account = resolveAccount(options.account);

  if (!account) {
    console.log(
      chalk.red('Conta não encontrada. Use --account <nome> ou --env-file <caminho>.'),
    );
    process.exit(1);
  }

  if (!options.term) {
    console.log(chalk.red('Termo de busca obrigatório. Use --term <texto>.'));
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

  const mode = options.mode || 'simple';

  console.log(
    chalk.cyanBright(
      `\nPesquisando "${chalk.bold(options.term)}" em ${chalk.bold(account.name)} (${mode})...\n`,
    ),
  );

  if (mode === 'simple') {
    const results = searchSimple(resources, options.term);
    printSimpleSearch(results, options.term);
  } else {
    const results = searchAdvanced(resources, options.term);
    printAdvancedSearch(results, options.term);
  }
}
