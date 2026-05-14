#!/usr/bin/env node
import { Command } from 'commander';

import { diffEnvCommand } from './commands/diff-env.js';
import { diffCommand } from './commands/diff.js';
import {
  createMigration,
  lintMigrationCommand,
  listMigrationsCommand,
  neutralizeMigration,
} from './commands/migration.js';
import { pullCommand } from './commands/pull.js';
import { pushCommand } from './commands/push.js';
import { revertCommand } from './commands/revert.js';
import { validateStudioFlowsCommand } from './commands/validate-studio-flows.js';
import { success } from './utils/display.js';
import { printTwilioError } from './utils/twilio-error.js';

const program = new Command();

program
  .name('tam')
  .description('Twilio Account Migrate — Gerenciamento de recursos Twilio via migrations')
  .version('4.0.0');

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
  .option('--verbose', 'Em conjunto com --dry-run: faz refetch e mostra diff por campo')
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

program
  .command('diff-env')
  .description('Comparar dois ambientes e gerar migration no target')
  .requiredOption('--source <path>', 'Diretorio do ambiente de referencia (atualizado)')
  .requiredOption('--target <path>', 'Diretorio do ambiente a ser atualizado')
  .option('--resources <types>', 'Tipos de recursos separados por virgula')
  .action(async (opts) => {
    await diffEnvCommand(opts);
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

migration
  .command('lint <migration-file>')
  .description('Validar @refs, matches e duplicidades em uma migration contra o state local')
  .requiredOption('--dir <path>', 'Diretorio do ambiente')
  .action(async (migrationFile, opts) => {
    await lintMigrationCommand(opts.dir, migrationFile);
  });

migration
  .command('neutralize <migration-file>')
  .description('Substituir SIDs/URLs por @ref em uma migration manual')
  .requiredOption('--dir <path>', 'Diretorio do ambiente (para ler o state)')
  .action(async (migrationFile, opts) => {
    const fileName = await neutralizeMigration(opts.dir, migrationFile);
    if (fileName) {
      success(`Migration neutralizada: ${fileName}`);
    }
  });

const studioFlows = migration.command('studioFlows').description('Ferramentas para Studio Flows');

studioFlows
  .command('validate [migration-name]')
  .description('Validar definitions de studioFlows em uma migration usando a API do Twilio')
  .requiredOption('--dir <path>', 'Diretorio do ambiente')
  .requiredOption('--env-file <path>', 'Caminho para arquivo .env com credenciais')
  .action(async (migrationName, opts) => {
    await validateStudioFlowsCommand({ ...opts, migrationName });
  });

program.parseAsync().catch((err) => {
  printTwilioError(err);
  process.exit(1);
});
