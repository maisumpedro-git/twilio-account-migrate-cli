#!/usr/bin/env node
import { Command } from 'commander';

import { compareCommand } from './cli/commands/compare.js';
import { pullCommand } from './cli/commands/pull.js';
import { pushCommand } from './cli/commands/push.js';
import { searchCommand } from './cli/commands/search.js';
import { varsInitCommand, varsMapCommand, varsShowCommand } from './cli/commands/vars.js';
import { runCli } from './cli/main.js';
import { loadEnvFile, setBaseDir } from './config.js';

const program = new Command();

program
  .name('tam')
  .description('Twilio Account Migrate CLI — Gerenciamento de contas e ambientes')
  .version('2.1.0')
  .option('--data-dir <path>', 'Diretório para armazenamento de dados')
  .option('--env-file <path>', 'Caminho para arquivo .env com credenciais');

program.hook('preAction', (thisCommand) => {
  const opts = thisCommand.optsWithGlobals();
  if (opts.dataDir) setBaseDir(opts.dataDir);
  if (opts.envFile) loadEnvFile(opts.envFile);
});

program
  .command('interactive', { isDefault: true })
  .description('Modo interativo (padrão)')
  .action(async () => {
    await runCli();
  });

program
  .command('pull')
  .description('Baixar recursos de uma conta Twilio')
  .option('--account <name>', 'Nome da conta')
  .option('--resources <types>', 'Tipos de recursos separados por vírgula (ex: workflows,studio-flows)')
  .action(async (opts) => {
    await pullCommand(opts);
  });

program
  .command('push')
  .description('Comparar alterações locais e aplicar no destino')
  .option('--account <name>', 'Nome da conta origem (dados locais)')
  .option('--dest <name>', 'Nome da conta destino (se diferente da origem)')
  .option('--resources <types>', 'Tipos de recursos separados por vírgula')
  .action(async (opts) => {
    await pushCommand(opts);
  });

program
  .command('compare')
  .description('Comparar recursos entre duas contas')
  .requiredOption('--source <name>', 'Nome da conta origem')
  .requiredOption('--dest <name>', 'Nome da conta destino')
  .option('--resources <types>', 'Tipos de recursos separados por vírgula')
  .option('--mode <mode>', 'Modo de comparação: simple ou advanced', 'advanced')
  .action(async (opts) => {
    await compareCommand(opts);
  });

program
  .command('search')
  .description('Pesquisar recursos em cache')
  .option('--account <name>', 'Nome da conta')
  .requiredOption('--term <text>', 'Termo de busca')
  .option('--mode <mode>', 'Modo de busca: simple ou advanced', 'simple')
  .action(async (opts) => {
    await searchCommand(opts);
  });

const vars = program
  .command('vars')
  .description('Gerenciar arquivo de variáveis (SIDs)');

vars
  .command('init')
  .description('Extrair todos os SIDs dos recursos em cache e salvar')
  .option('--account <name>', 'Nome da conta')
  .action(async (opts) => {
    await varsInitCommand(opts);
  });

vars
  .command('show')
  .description('Exibir variáveis (SIDs) de uma conta')
  .option('--account <name>', 'Nome da conta')
  .action(async (opts) => {
    await varsShowCommand(opts);
  });

vars
  .command('map')
  .description('Criar mapeamento de SIDs entre duas contas')
  .requiredOption('--source <name>', 'Nome da conta origem')
  .requiredOption('--dest <name>', 'Nome da conta destino')
  .action(async (opts) => {
    await varsMapCommand(opts);
  });

program.parseAsync().catch((err) => {
  console.error(err);
  process.exit(1);
});
