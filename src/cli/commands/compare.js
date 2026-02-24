import chalk from 'chalk';

import { compareAdvanced, printAdvancedComparison } from '../../compare/advanced.js';
import { compareSimple, printSimpleComparison } from '../../compare/simple.js';
import { getAllCachedResources, parseResourceTypes } from '../../dataFetch/cache.js';
import { resolveAccount } from '../../utils/resolveAccount.js';

export async function compareCommand(options) {
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

  const resourceTypes = parseResourceTypes(options.resources);
  const mode = options.mode || 'advanced';

  const resourcesA = getAllCachedResources(sourceAccount.name);
  const resourcesB = getAllCachedResources(destAccount.name);

  if (!Object.keys(resourcesA).length || !Object.keys(resourcesB).length) {
    console.log(
      chalk.yellow(
        '\nÉ necessário baixar os recursos das duas contas antes de comparar.\n' +
          'Use o comando "pull" primeiro.\n',
      ),
    );
    process.exit(1);
  }

  if (mode === 'simple') {
    const results = compareSimple(sourceAccount, resourcesA, destAccount, resourcesB, resourceTypes);
    printSimpleComparison(sourceAccount, destAccount, results);
  } else {
    const results = compareAdvanced(
      sourceAccount,
      resourcesA,
      destAccount,
      resourcesB,
      resourceTypes,
    );
    printAdvancedComparison(sourceAccount, destAccount, results);
  }
}
