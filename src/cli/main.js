import chalk from 'chalk';
import inquirer from 'inquirer';

import { listAccounts } from '../accounts/store.js';
import { envLabel } from '../utils/display.js';

import { accountMenu } from './accountMenu.js';
import { compareMenu } from './compareMenu.js';
import { migrateMenu } from './migrateMenu.js';
import { resourceMenu } from './resourceMenu.js';
import { searchMenu } from './searchMenu.js';

function printBanner() {
  console.log();
  console.log(chalk.cyanBright.bold('╔══════════════════════════════════════════╗'));
  console.log(chalk.cyanBright.bold('║    Twilio Account Dashboard CLI          ║'));
  console.log(chalk.cyanBright.bold('║    Gerenciamento de Contas e Ambientes   ║'));
  console.log(chalk.cyanBright.bold('╚══════════════════════════════════════════╝'));
  console.log();
}

function printAccountSummary() {
  const accounts = listAccounts();
  if (accounts.length === 0) {
    console.log(chalk.dim('Nenhuma conta cadastrada. Comece cadastrando uma conta.\n'));
    return;
  }

  console.log(chalk.bold('Contas:'));
  for (const acc of accounts) {
    console.log(`  ${envLabel(acc.environment)} ${acc.name}`);
  }
  console.log();
}

export async function runCli() {
  printBanner();

  while (true) {
    printAccountSummary();

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Menu principal — o que deseja fazer?',
        choices: [
          { name: '👤 Gerenciar Contas', value: 'accounts' },
          { name: '📥 Baixar Recursos', value: 'resources' },
          { name: '🔍 Comparar Ambientes', value: 'compare' },
          { name: '🔄 Migrar Recursos', value: 'migrate' },
          { name: '🔎 Pesquisar', value: 'search' },
          new inquirer.Separator(),
          { name: '🚪 Sair', value: 'exit' },
        ],
      },
    ]);

    switch (action) {
      case 'accounts':
        await accountMenu();
        break;
      case 'resources':
        await resourceMenu();
        break;
      case 'compare':
        await compareMenu();
        break;
      case 'migrate':
        await migrateMenu();
        break;
      case 'search':
        await searchMenu();
        break;
      case 'exit':
        console.log(chalk.cyanBright('\nAté mais! 👋\n'));
        return;
    }
  }
}
