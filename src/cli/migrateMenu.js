import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';

import { listAccounts } from '../accounts/store.js';
import { getAllCachedResources } from '../dataFetch/cache.js';
import { createClient } from '../dataFetch/twilioClients.js';
import { buildSidMapping } from '../migrate/buildMapping.js';
import { migrateContentTemplates } from '../migrate/contentTemplates.js';
import { migrateStudioFlows } from '../migrate/studioFlows.js';
import { envLabel, printHeader, resourceName } from '../utils/display.js';

const MIGRATABLE_TYPES = [
  { name: 'Content Templates', value: 'contentTemplates' },
  { name: 'Studio Flows', value: 'studioFlows' },
];

export async function migrateMenu() {
  const accounts = listAccounts();
  if (accounts.length < 2) {
    console.log(
      chalk.yellow('\nSão necessárias ao menos 2 contas cadastradas para migrar.\n'),
    );
    return;
  }

  while (true) {
    printHeader('Migrar Recursos');

    const { sourceName } = await inquirer.prompt([
      {
        type: 'list',
        name: 'sourceName',
        message: 'Selecione a conta ORIGEM:',
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

    if (sourceName === '__back') return;

    const { destName } = await inquirer.prompt([
      {
        type: 'list',
        name: 'destName',
        message: 'Selecione a conta DESTINO:',
        choices: accounts
          .filter((a) => a.name !== sourceName)
          .map((a) => ({
            name: `${envLabel(a.environment)} ${a.name}`,
            value: a.name,
          })),
      },
    ]);

    const sourceAccount = accounts.find((a) => a.name === sourceName);
    const destAccount = accounts.find((a) => a.name === destName);

    const sourceResources = getAllCachedResources(sourceAccount.name);
    const destResources = getAllCachedResources(destAccount.name);

    if (!Object.keys(sourceResources).length || !Object.keys(destResources).length) {
      console.log(
        chalk.yellow(
          '\nÉ necessário baixar os recursos das duas contas antes de migrar.\n' +
            'Use o menu "Baixar Recursos" primeiro.\n',
        ),
      );
      continue;
    }

    const { resourceType } = await inquirer.prompt([
      {
        type: 'list',
        name: 'resourceType',
        message: 'Selecione o tipo de recurso para migrar:',
        choices: MIGRATABLE_TYPES,
      },
    ]);

    // Build data structures compatible with existing migration modules
    const sourceData = buildDataFromCache(sourceResources);
    const destData = buildDataFromCache(destResources);

    const spinner = ora('Construindo mapeamento de SIDs...').start();
    const mapping = await buildSidMapping(sourceData, destData);
    spinner.succeed('Mapeamento construído');

    const clients = {
      source: createClient(sourceAccount),
      dest: createClient(destAccount),
    };

    if (resourceType === 'contentTemplates') {
      await migrateContentTemplatesFlow(sourceData, destData, mapping, clients);
    } else if (resourceType === 'studioFlows') {
      await migrateStudioFlowsFlow(sourceData, destData, mapping, clients);
    }

    const { again } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'again',
        message: 'Fazer outra migração?',
        default: false,
      },
    ]);

    if (!again) return;
  }
}

function buildDataFromCache(cachedResources) {
  const workspace = cachedResources.workspace?.data || null;
  const taskQueues = cachedResources.taskQueues?.data || [];
  const workflows = cachedResources.workflows?.data || [];
  const taskChannels = cachedResources.taskChannels?.data || [];
  const contentTemplates = cachedResources.contentTemplates?.data || [];
  const studioFlows = cachedResources.studioFlows?.data || [];

  return {
    taskrouter: {
      workspace,
      taskQueues,
      workflows,
      activities: [],
      taskChannels,
    },
    serverless: [],
    contentTemplates,
    studio: { flows: studioFlows },
  };
}

async function migrateContentTemplatesFlow(sourceData, destData, mapping, clients) {
  const templates = sourceData.contentTemplates || [];
  if (!templates.length) {
    console.log(chalk.yellow('Nenhum Content Template encontrado na origem.'));
    return;
  }

  const { selected } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selected',
      message: 'Selecione os Content Templates para migrar:',
      choices: templates.map((t) => ({
        name: resourceName(t),
        value: t.sid,
      })),
      loop: false,
      pageSize: 20,
    },
  ]);

  if (!selected.length) {
    console.log(chalk.yellow('Nenhum template selecionado.'));
    return;
  }

  const spinner = ora('Migrando Content Templates...').start();
  try {
    await migrateContentTemplates(
      selected,
      { source: sourceData, dest: destData },
      mapping,
      clients,
    );
    spinner.succeed('Content Templates migrados com sucesso!');
  } catch (err) {
    spinner.fail(`Erro na migração: ${err.message}`);
  }
}

async function migrateStudioFlowsFlow(sourceData, destData, mapping, clients) {
  const flows = sourceData.studio?.flows || [];
  if (!flows.length) {
    console.log(chalk.yellow('Nenhum Studio Flow encontrado na origem.'));
    return;
  }

  const { selected } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selected',
      message: 'Selecione os Studio Flows para migrar:',
      choices: flows.map((f) => ({
        name: resourceName(f),
        value: f.sid,
      })),
      loop: false,
      pageSize: 20,
    },
  ]);

  if (!selected.length) {
    console.log(chalk.yellow('Nenhum flow selecionado.'));
    return;
  }

  const spinner = ora('Migrando Studio Flows...').start();
  try {
    await migrateStudioFlows(
      selected,
      { source: sourceData, dest: destData },
      mapping,
      clients,
    );
    spinner.succeed('Studio Flows migrados com sucesso!');
  } catch (err) {
    spinner.fail(`Erro na migração: ${err.message}`);
  }
}
