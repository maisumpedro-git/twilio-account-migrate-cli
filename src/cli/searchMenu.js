import chalk from 'chalk';
import inquirer from 'inquirer';

import { listAccounts } from '../accounts/store.js';
import { getAllCachedResources } from '../dataFetch/cache.js';
import { printAdvancedSearch, searchAdvanced } from '../search/advanced.js';
import { printSimpleSearch, searchSimple } from '../search/simple.js';
import { envLabel, printHeader } from '../utils/display.js';

export async function searchMenu() {
  const accounts = listAccounts();
  if (!accounts.length) {
    console.log(chalk.yellow('\nNenhuma conta cadastrada. Cadastre uma conta primeiro.\n'));
    return;
  }

  while (true) {
    printHeader('Pesquisar Recursos');

    const { accountName } = await inquirer.prompt([
      {
        type: 'list',
        name: 'accountName',
        message: 'Selecione a conta para pesquisar:',
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

    if (accountName === '__back') return;

    const account = accounts.find((a) => a.name === accountName);
    const resources = getAllCachedResources(account.name);

    if (!Object.keys(resources).length) {
      console.log(
        chalk.yellow(
          '\nNenhum recurso em cache. Baixe os recursos primeiro usando o menu "Baixar Recursos".\n',
        ),
      );
      continue;
    }

    const { term } = await inquirer.prompt([
      {
        type: 'input',
        name: 'term',
        message: 'Termo de pesquisa:',
        validate: (v) => (v.trim() ? true : 'Informe um termo para pesquisar'),
      },
    ]);

    const { mode } = await inquirer.prompt([
      {
        type: 'list',
        name: 'mode',
        message: 'Tipo de pesquisa:',
        choices: [
          { name: '📋 Simples (nomes dos recursos)', value: 'simple' },
          { name: '🔍 Avançada (conteúdo dos recursos)', value: 'advanced' },
        ],
      },
    ]);

    if (mode === 'simple') {
      const results = searchSimple(resources, term.trim());
      printSimpleSearch(term.trim(), account.name, results);
    } else {
      const results = searchAdvanced(resources, term.trim());
      printAdvancedSearch(term.trim(), account.name, results);
    }

    const { again } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'again',
        message: 'Fazer outra pesquisa?',
        default: false,
      },
    ]);

    if (!again) return;
  }
}
