import chalk from 'chalk';
import inquirer from 'inquirer';

import { listAccounts } from '../accounts/store.js';
import { compareAdvanced, printAdvancedComparison } from '../compare/advanced.js';
import { compareSimple, printSimpleComparison } from '../compare/simple.js';
import { getAllCachedResources, RESOURCE_LABELS, RESOURCE_TYPES } from '../dataFetch/cache.js';
import { envLabel, printHeader } from '../utils/display.js';

export async function compareMenu() {
  const accounts = listAccounts();
  if (accounts.length < 2) {
    console.log(
      chalk.yellow('\nSão necessárias ao menos 2 contas cadastradas para comparar.\n'),
    );
    return;
  }

  while (true) {
    printHeader('Comparar Ambientes');

    const { accountAName } = await inquirer.prompt([
      {
        type: 'list',
        name: 'accountAName',
        message: 'Selecione a primeira conta (origem):',
        choices: [
          ...accounts.map((a) => ({
            name: `${envLabel(a.environment)} ${a.name}`,
            value: a.name,
          })),
          new inquirer.Separator(),
          { name: '↩️  Voltar', value: '__back' },
        ],
      },
    ]);

    if (accountAName === '__back') return;

    const { accountBName } = await inquirer.prompt([
      {
        type: 'list',
        name: 'accountBName',
        message: 'Selecione a segunda conta (destino):',
        choices: accounts
          .filter((a) => a.name !== accountAName)
          .map((a) => ({
            name: `${envLabel(a.environment)} ${a.name}`,
            value: a.name,
          })),
      },
    ]);

    const accountA = accounts.find((a) => a.name === accountAName);
    const accountB = accounts.find((a) => a.name === accountBName);

    const resourcesA = getAllCachedResources(accountA.name);
    const resourcesB = getAllCachedResources(accountB.name);

    if (!Object.keys(resourcesA).length || !Object.keys(resourcesB).length) {
      console.log(
        chalk.yellow(
          '\nÉ necessário baixar os recursos das duas contas antes de comparar.\n' +
            'Use o menu "Baixar Recursos" primeiro.\n',
        ),
      );
      continue;
    }

    const { types } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'types',
        message: 'Selecione os tipos de recursos para comparar:',
        choices: RESOURCE_TYPES.map((type) => ({
          name: RESOURCE_LABELS[type],
          value: type,
          checked: true,
        })),
        validate: (v) => (v.length > 0 ? true : 'Selecione ao menos um recurso'),
      },
    ]);

    const { mode } = await inquirer.prompt([
      {
        type: 'list',
        name: 'mode',
        message: 'Tipo de comparação:',
        choices: [
          { name: '📋 Simples (quantidade e nomes)', value: 'simple' },
          { name: '🔍 Avançada (conteúdo dos recursos)', value: 'advanced' },
        ],
      },
    ]);

    if (mode === 'simple') {
      const results = compareSimple(accountA, resourcesA, accountB, resourcesB, types);
      printSimpleComparison(accountA, accountB, results);
    } else {
      const results = compareAdvanced(accountA, resourcesA, accountB, resourcesB, types);
      printAdvancedComparison(accountA, accountB, results);
    }

    const { again } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'again',
        message: 'Fazer outra comparação?',
        default: false,
      },
    ]);

    if (!again) return;
  }
}
