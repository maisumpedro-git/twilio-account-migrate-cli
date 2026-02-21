import chalk from 'chalk';
import inquirer from 'inquirer';

import { addAccount, listAccounts, removeAccount } from '../accounts/store.js';
import { envLabel, printHeader } from '../utils/display.js';

export async function accountMenu() {
  while (true) {
    printHeader('Gerenciamento de Contas');

    const accounts = listAccounts();
    if (accounts.length > 0) {
      console.log(chalk.bold('Contas cadastradas:'));
      for (const acc of accounts) {
        console.log(
          `  ${envLabel(acc.environment)} ${chalk.white(acc.name)} ${chalk.dim(`(${acc.accountSid})`)}`,
        );
      }
      console.log();
    } else {
      console.log(chalk.dim('Nenhuma conta cadastrada.\n'));
    }

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'O que deseja fazer?',
        choices: [
          { name: '➕ Cadastrar nova conta', value: 'add' },
          { name: '✏️  Editar conta existente', value: 'edit' },
          { name: '🗑️  Remover conta', value: 'remove' },
          new inquirer.Separator(),
          { name: '↩️  Voltar ao menu principal', value: 'back' },
        ],
      },
    ]);

    if (action === 'back') return;

    if (action === 'add') {
      await addAccountPrompt();
    } else if (action === 'edit') {
      await editAccountPrompt(accounts);
    } else if (action === 'remove') {
      await removeAccountPrompt(accounts);
    }
  }
}

async function addAccountPrompt() {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Nome da conta (ex: "Produção", "Dev"):',
      validate: (v) => (v.trim() ? true : 'Obrigatório'),
    },
    {
      type: 'list',
      name: 'environment',
      message: 'Ambiente:',
      choices: [
        { name: 'Development', value: 'dev' },
        { name: 'Staging', value: 'stage' },
        { name: 'Production', value: 'prod' },
      ],
    },
    {
      type: 'input',
      name: 'accountSid',
      message: 'Account SID (ACxxxxxxxx):',
      validate: (v) => (v.trim().startsWith('AC') ? true : 'Account SID deve começar com AC'),
    },
    {
      type: 'password',
      mask: '*',
      name: 'apiKeySid',
      message: 'API Key SID (SKxxxxxxxx):',
      validate: (v) => (v.trim().startsWith('SK') ? true : 'API Key SID deve começar com SK'),
    },
    {
      type: 'password',
      mask: '*',
      name: 'apiKeySecret',
      message: 'API Key Secret:',
      validate: (v) => (v.trim() ? true : 'Obrigatório'),
    },
  ]);

  addAccount({
    name: answers.name.trim(),
    environment: answers.environment,
    accountSid: answers.accountSid.trim(),
    apiKeySid: answers.apiKeySid.trim(),
    apiKeySecret: answers.apiKeySecret.trim(),
  });

  console.log(chalk.green(`\nConta "${answers.name}" cadastrada com sucesso!`));
}

async function editAccountPrompt(accounts) {
  if (!accounts.length) {
    console.log(chalk.yellow('Nenhuma conta para editar.'));
    return;
  }

  const { accountName } = await inquirer.prompt([
    {
      type: 'list',
      name: 'accountName',
      message: 'Selecione a conta para editar:',
      choices: accounts.map((a) => ({
        name: `${envLabel(a.environment)} ${a.name}`,
        value: a.name,
      })),
    },
  ]);

  const current = accounts.find((a) => a.name === accountName);

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Nome da conta:',
      default: current.name,
      validate: (v) => (v.trim() ? true : 'Obrigatório'),
    },
    {
      type: 'list',
      name: 'environment',
      message: 'Ambiente:',
      default: current.environment,
      choices: [
        { name: 'Development', value: 'dev' },
        { name: 'Staging', value: 'stage' },
        { name: 'Production', value: 'prod' },
      ],
    },
    {
      type: 'input',
      name: 'accountSid',
      message: 'Account SID:',
      default: current.accountSid,
      validate: (v) => (v.trim().startsWith('AC') ? true : 'Account SID deve começar com AC'),
    },
    {
      type: 'password',
      mask: '*',
      name: 'apiKeySid',
      message: 'API Key SID (enter para manter):',
    },
    {
      type: 'password',
      mask: '*',
      name: 'apiKeySecret',
      message: 'API Key Secret (enter para manter):',
    },
  ]);

  // Remove old account if name changed
  if (current.name !== answers.name.trim()) {
    removeAccount(current.name);
  }

  addAccount({
    name: answers.name.trim(),
    environment: answers.environment,
    accountSid: answers.accountSid.trim(),
    apiKeySid: answers.apiKeySid.trim() || current.apiKeySid,
    apiKeySecret: answers.apiKeySecret.trim() || current.apiKeySecret,
  });

  console.log(chalk.green(`\nConta "${answers.name}" atualizada com sucesso!`));
}

async function removeAccountPrompt(accounts) {
  if (!accounts.length) {
    console.log(chalk.yellow('Nenhuma conta para remover.'));
    return;
  }

  const { accountName } = await inquirer.prompt([
    {
      type: 'list',
      name: 'accountName',
      message: 'Selecione a conta para remover:',
      choices: accounts.map((a) => ({
        name: `${envLabel(a.environment)} ${a.name}`,
        value: a.name,
      })),
    },
  ]);

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: `Tem certeza que deseja remover "${accountName}"?`,
      default: false,
    },
  ]);

  if (confirm) {
    removeAccount(accountName);
    console.log(chalk.green(`Conta "${accountName}" removida.`));
  }
}
