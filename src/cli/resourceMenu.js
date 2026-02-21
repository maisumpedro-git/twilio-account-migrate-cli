import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';

import { listAccounts } from '../accounts/store.js';
import { getCacheMetadata, RESOURCE_LABELS, RESOURCE_TYPES } from '../dataFetch/cache.js';
import { fetchAllResources, fetchResource } from '../dataFetch/fetchAll.js';
import { envLabel, formatTimestamp, printHeader } from '../utils/display.js';

export async function resourceMenu() {
  const accounts = listAccounts();
  if (!accounts.length) {
    console.log(chalk.yellow('\nNenhuma conta cadastrada. Cadastre uma conta primeiro.\n'));
    return;
  }

  while (true) {
    printHeader('Baixar Recursos');

    const { accountName } = await inquirer.prompt([
      {
        type: 'list',
        name: 'accountName',
        message: 'Selecione a conta:',
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
    await resourceSubMenu(account);
  }
}

async function resourceSubMenu(account) {
  while (true) {
    const meta = getCacheMetadata(account.name);

    console.log();
    console.log(
      chalk.bold(`Recursos de ${envLabel(account.environment)} ${account.name}`),
    );
    console.log();

    for (const type of RESOURCE_TYPES) {
      const label = RESOURCE_LABELS[type] || type;
      const cached = meta[type];
      const status = cached?.fetchedAt
        ? chalk.green(`✓ ${formatTimestamp(cached.fetchedAt)}`)
        : chalk.dim('✗ não baixado');
      console.log(`  ${label}: ${status}`);
    }
    console.log();

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'O que deseja fazer?',
        choices: [
          { name: '📥 Baixar todos os recursos', value: 'all' },
          { name: '📥 Baixar recurso específico', value: 'specific' },
          { name: '🔄 Atualizar recurso existente', value: 'refresh' },
          new inquirer.Separator(),
          { name: '↩️  Voltar', value: 'back' },
        ],
      },
    ]);

    if (action === 'back') return;

    if (action === 'all') {
      const spinner = ora(`Baixando todos os recursos de ${account.name}...`).start();
      try {
        await fetchAllResources(account);
        spinner.succeed(`Todos os recursos de ${account.name} baixados com sucesso!`);
      } catch (err) {
        spinner.fail(`Erro ao baixar recursos: ${err.message}`);
      }
    } else if (action === 'specific' || action === 'refresh') {
      const choices = RESOURCE_TYPES.map((type) => ({
        name: `${RESOURCE_LABELS[type]} ${meta[type]?.fetchedAt ? chalk.dim(`(${formatTimestamp(meta[type].fetchedAt)})`) : ''}`,
        value: type,
      }));

      const { types } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'types',
          message: 'Selecione os recursos:',
          choices,
          validate: (v) => (v.length > 0 ? true : 'Selecione ao menos um recurso'),
        },
      ]);

      for (const type of types) {
        const label = RESOURCE_LABELS[type];
        const spinner = ora(`Baixando ${label}...`).start();
        try {
          await fetchResource(account, type);
          spinner.succeed(`${label} baixado!`);
        } catch (err) {
          spinner.fail(`Erro ao baixar ${label}: ${err.message}`);
        }
      }
    }
  }
}
