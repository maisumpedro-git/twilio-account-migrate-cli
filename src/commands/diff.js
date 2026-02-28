import chalk from 'chalk';

import { loadEnvFile } from '../config.js';
import { diffResources } from '../diff/compare.js';
import { readAllStates } from '../state/reader.js';
import { fetchResource, RESOURCE_TYPES } from '../twilio/fetchers.js';
import { info, success } from '../utils/display.js';

export async function diffCommand(options) {
  const { dir, envFile } = options;
  const account = loadEnvFile(envFile);
  const types = RESOURCE_TYPES.filter((t) => t !== 'workspace');

  info('Comparando state local vs cloud...');

  const localStates = await readAllStates(dir);
  let totalDiffs = 0;

  for (const type of types) {
    const cloudResources = await fetchResource(account, type);
    const localResources = localStates[type]?.resources || [];
    const cloud = Array.isArray(cloudResources)
      ? cloudResources
      : cloudResources
        ? [cloudResources]
        : [];
    const ops = diffResources(cloud, localResources);

    if (ops.length === 0) continue;

    console.log(chalk.bold(`\n${type}:`));
    for (const op of ops) {
      const name = op.data?.friendlyName || op.match?.friendlyName || '?';
      const color = op.action === 'create' ? 'green' : op.action === 'delete' ? 'red' : 'yellow';
      console.log(chalk[color](`  ${op.action}: ${name}`));
      if (op.action === 'update' && op.data) {
        for (const [key, val] of Object.entries(op.data)) {
          console.log(chalk.dim(`    ${key}: ${JSON.stringify(val)}`));
        }
      }
    }
    totalDiffs += ops.length;
  }

  if (totalDiffs === 0) {
    success('Nenhuma diferenca encontrada.');
  } else {
    info(`\n${totalDiffs} diferenca(s) encontrada(s).`);
  }
}
