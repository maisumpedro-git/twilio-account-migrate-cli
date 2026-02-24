import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';

import { compareAdvanced, printAdvancedComparison } from '../../compare/advanced.js';
import {
  buildDataFromCache,
  getAllCachedResources,
  parseResourceTypes,
  RESOURCE_LABELS,
} from '../../dataFetch/cache.js';
import { fetchResource } from '../../dataFetch/fetchAll.js';
import { createClient } from '../../dataFetch/twilioClients.js';
import { buildSidMapping } from '../../migrate/buildMapping.js';
import { migrateContentTemplates } from '../../migrate/contentTemplates.js';
import { migrateStudioFlows } from '../../migrate/studioFlows.js';
import { resolveAccount } from '../../utils/resolveAccount.js';

const PUSHABLE_TYPES = ['studioFlows', 'contentTemplates'];

export async function pushCommand(options) {
  const sourceAccount = resolveAccount(options.account);

  if (!sourceAccount) {
    console.log(
      chalk.red('Conta origem não encontrada. Use --account <nome> ou --env-file <caminho>.'),
    );
    process.exit(1);
  }

  const destAccount = options.dest ? resolveAccount(options.dest) : sourceAccount;

  if (!destAccount) {
    console.log(chalk.red(`Conta destino "${options.dest}" não encontrada.`));
    process.exit(1);
  }

  const requestedTypes = parseResourceTypes(options.resources);
  const pushableTypes = requestedTypes.filter((t) => PUSHABLE_TYPES.includes(t));
  const skippedTypes = requestedTypes.filter((t) => !PUSHABLE_TYPES.includes(t));

  if (skippedTypes.length) {
    console.log(
      chalk.yellow(
        `\nTipos não suportados para push (ignorados): ${skippedTypes.map((t) => RESOURCE_LABELS[t] || t).join(', ')}`,
      ),
    );
  }

  if (!pushableTypes.length) {
    console.log(
      chalk.red(
        '\nNenhum tipo de recurso suporta push. Tipos suportados: studio-flows, content-templates',
      ),
    );
    process.exit(1);
  }

  const localResources = getAllCachedResources(sourceAccount.name);

  if (!Object.keys(localResources).length) {
    console.log(chalk.yellow('\nNenhum recurso em cache local. Execute "pull" primeiro.\n'));
    process.exit(1);
  }

  console.log(
    chalk.cyanBright(
      `\nPush: ${chalk.bold(sourceAccount.name)} → ${chalk.bold(destAccount.name)}\n`,
    ),
  );

  const spinner = ora(`Baixando recursos atuais de ${destAccount.name}...`).start();
  try {
    for (const type of pushableTypes) {
      await fetchResource(destAccount, type);
    }
    spinner.succeed('Recursos remotos baixados para comparação.');
  } catch (err) {
    spinner.fail(`Erro ao baixar recursos remotos: ${err.message}`);
    process.exit(1);
  }

  const destResources = getAllCachedResources(destAccount.name);

  const results = compareAdvanced(
    sourceAccount,
    localResources,
    destAccount,
    destResources,
    pushableTypes,
  );

  const hasDiffs = results.some((r) => r.resourceDiffs.some((rd) => rd.status !== 'equal'));

  if (!hasDiffs) {
    console.log(chalk.green('\nNenhuma diferença encontrada. Nada para fazer.\n'));
    return;
  }

  printAdvancedComparison(sourceAccount, destAccount, results);

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Deseja aplicar estas alterações no destino?',
      default: false,
    },
  ]);

  if (!confirm) {
    console.log(chalk.yellow('\nPush cancelado.\n'));
    return;
  }

  const sourceData = buildDataFromCache(localResources);
  const destData = buildDataFromCache(destResources);
  const mapping = await buildSidMapping(sourceData, destData);
  const clients = {
    source: createClient(sourceAccount),
    dest: createClient(destAccount),
  };

  for (const type of pushableTypes) {
    const label = RESOURCE_LABELS[type] || type;
    const applySpinner = ora(`Aplicando alterações de ${label}...`).start();
    try {
      if (type === 'studioFlows') {
        const flows = sourceData.studio?.flows || [];
        const sids = flows.map((f) => f.sid);
        await migrateStudioFlows(sids, { source: sourceData, dest: destData }, mapping, clients);
      } else if (type === 'contentTemplates') {
        const templates = sourceData.contentTemplates || [];
        const sids = templates.map((t) => t.sid);
        await migrateContentTemplates(
          sids,
          { source: sourceData, dest: destData },
          mapping,
          clients,
        );
      }
      applySpinner.succeed(`${label} aplicado com sucesso!`);
    } catch (err) {
      applySpinner.fail(`Erro ao aplicar ${label}: ${err.message}`);
    }
  }

  console.log(chalk.green('\nPush concluído!\n'));
}
