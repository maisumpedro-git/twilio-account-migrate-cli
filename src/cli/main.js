import inquirer from 'inquirer';
import { ensureEnv } from '../utils/env.js';
import { fetchAllData } from '../dataFetch/fetchAll.js';
import { buildSidMapping } from '../migrate/buildMapping.js';
import { migrateStudioFlows } from '../migrate/studioFlows.js';
import ora from 'ora';
import chalk from 'chalk';

export async function runCli() {
  console.log(chalk.cyanBright('\nTwilio Account Migrate CLI'));
  await ensureEnv();

  const spinner = ora('Fetching data from both accounts').start();
  const { source, dest } = await fetchAllData();
  spinner.succeed('Fetched data');

  const mapping = await buildSidMapping(source, dest);

  const { selectedFlows } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedFlows',
      message: 'Selecione os Flows do Studio para migrar:',
      choices: source.studio.flows.map((f) => ({
        name: `${f.friendlyName || f.friendly_name || f.sid}`,
        value: f.sid,
      })),
      loop: false,
      pageSize: 20,
    },
  ]);

  if (!selectedFlows?.length) {
    console.log(chalk.yellow('Nenhum flow selecionado.'));
    return;
  }

  await migrateStudioFlows(selectedFlows, { source, dest }, mapping);
  console.log(chalk.green('Migração concluída.'));
}
