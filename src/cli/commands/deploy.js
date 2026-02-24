import chalk from 'chalk';
import fs from 'fs-extra';
import ora from 'ora';

import { bulkDeploy } from '../../bulkDeploy/deploy.js';
import { RESOURCE_LABELS } from '../../dataFetch/cache.js';
import { resolveAccount } from '../../utils/resolveAccount.js';

function parseVarArgs(varArgs) {
  const vars = {};
  if (!varArgs) return vars;
  const list = Array.isArray(varArgs) ? varArgs : [varArgs];
  for (const v of list) {
    const eqIndex = v.indexOf('=');
    if (eqIndex === -1) {
      console.log(chalk.yellow(`Variável ignorada (formato inválido): ${v}`));
      continue;
    }
    const key = v.slice(0, eqIndex).trim();
    const value = v.slice(eqIndex + 1).trim();
    vars[key] = value;
  }
  return vars;
}

export async function deployCommand(options) {
  const account = resolveAccount(options.account);

  if (!account) {
    console.log(
      chalk.red('Conta não encontrada. Use --account <nome> ou --env-file <caminho>.'),
    );
    process.exit(1);
  }

  if (!options.file) {
    console.log(chalk.red('Arquivo JSON obrigatório. Use --file <caminho>.'));
    process.exit(1);
  }

  let resources;
  try {
    resources = fs.readJSONSync(options.file);
  } catch (err) {
    console.log(chalk.red(`Erro ao ler arquivo JSON: ${err.message}`));
    process.exit(1);
  }

  if (!Array.isArray(resources)) {
    console.log(chalk.red('O arquivo JSON deve conter um array de recursos.'));
    process.exit(1);
  }

  if (!resources.length) {
    console.log(chalk.yellow('Nenhum recurso encontrado no arquivo JSON.'));
    return;
  }

  const initialVars = parseVarArgs(options.var);

  console.log(
    chalk.cyanBright(`\nDeploy em massa → ${chalk.bold(account.name)}\n`),
  );
  console.log(chalk.gray(`Recursos no arquivo: ${resources.length}`));

  if (Object.keys(initialVars).length) {
    console.log(chalk.gray(`Variáveis iniciais: ${Object.keys(initialVars).join(', ')}`));
  }

  console.log('');

  const spinner = ora('Iniciando deploy...').start();

  try {
    const { results, vars } = await bulkDeploy(account, resources, initialVars, (entry) => {
      const label = RESOURCE_LABELS[entry.type] || entry.type;
      if (entry.status === 'created') {
        spinner.text = `${label}: ${entry.friendlyName} → ${chalk.green(entry.sid)}`;
      } else {
        spinner.text = `${label}: ${entry.friendlyName} → ${chalk.red(entry.error)}`;
      }
    });

    spinner.stop();

    console.log(chalk.cyanBright('\n— Resultado do deploy —\n'));

    const created = results.filter((r) => r.status === 'created');
    const errors = results.filter((r) => r.status === 'error');

    for (const r of created) {
      const label = RESOURCE_LABELS[r.type] || r.type;
      console.log(chalk.green(`  ✓ ${label}: ${r.friendlyName} → ${r.sid}`));
    }

    for (const r of errors) {
      const label = RESOURCE_LABELS[r.type] || r.type;
      console.log(chalk.red(`  ✗ ${label}: ${r.friendlyName} → ${r.error}`));
    }

    console.log('');

    if (created.length) {
      console.log(chalk.green(`${created.length} recurso(s) criado(s) com sucesso.`));
    }

    if (errors.length) {
      console.log(chalk.red(`${errors.length} recurso(s) com erro.`));
    }

    if (Object.keys(vars).length) {
      console.log(chalk.gray('\nVariáveis disponíveis após deploy:'));
      for (const [key, value] of Object.entries(vars)) {
        console.log(chalk.gray(`  ${key} = ${value}`));
      }
    }

    console.log('');

    if (errors.length) {
      process.exit(1);
    }
  } catch (err) {
    spinner.fail(`Erro durante deploy: ${err.message}`);
    process.exit(1);
  }
}
