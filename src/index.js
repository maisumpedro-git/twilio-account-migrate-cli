#!/usr/bin/env node
import { Command } from 'commander';

import { diffCommand } from './commands/diff.js';
import { createMigration, listMigrationsCommand } from './commands/migration.js';
import { pullCommand } from './commands/pull.js';
import { pushCommand } from './commands/push.js';
import { revertCommand } from './commands/revert.js';
import { error, success } from './utils/display.js';

const program = new Command();

program
  .name('tam')
  .description('Twilio Account Migrate — Gerenciamento de recursos Twilio via migrations')
  .version('3.0.0');

program
  .command('pull')
  .description('Baixar recursos do cloud, atualizar state e gerar migration')
  .requiredOption('--dir <path>', 'Diretorio do ambiente')
  .requiredOption('--env-file <path>', 'Caminho para arquivo .env com credenciais')
  .option('--resources <types>', 'Tipos de recursos separados por virgula')
  .action(async (opts) => {
    await pullCommand(opts);
  });

program
  .command('push')
  .description('Aplicar migrations pendentes no cloud')
  .requiredOption('--dir <path>', 'Diretorio do ambiente')
  .requiredOption('--env-file <path>', 'Caminho para arquivo .env com credenciais')
  .option('--dry-run', 'Mostrar o que seria feito sem executar')
  .action(async (opts) => {
    await pushCommand(opts);
  });

program
  .command('diff')
  .description('Comparar state local vs cloud (sem gerar migration)')
  .requiredOption('--dir <path>', 'Diretorio do ambiente')
  .requiredOption('--env-file <path>', 'Caminho para arquivo .env com credenciais')
  .action(async (opts) => {
    await diffCommand(opts);
  });

program
  .command('revert [migration-name]')
  .description('Reverter a ultima migration aplicada (ou uma especifica)')
  .requiredOption('--dir <path>', 'Diretorio do ambiente')
  .requiredOption('--env-file <path>', 'Caminho para arquivo .env com credenciais')
  .action(async (migrationName, opts) => {
    await revertCommand({ ...opts, migrationName });
  });

const migration = program.command('migration').description('Gerenciar migrations');

migration
  .command('new <description>')
  .description('Criar migration manual vazia')
  .requiredOption('--dir <path>', 'Diretorio do ambiente')
  .action(async (description, opts) => {
    const fileName = await createMigration(opts.dir, description);
    success(`Migration criada: ${fileName}`);
  });

migration
  .command('list')
  .description('Listar migrations e status')
  .requiredOption('--dir <path>', 'Diretorio do ambiente')
  .action(async (opts) => {
    await listMigrationsCommand(opts.dir);
  });

program.parseAsync().catch((err) => {
  error(err.message);
  process.exit(1);
});
