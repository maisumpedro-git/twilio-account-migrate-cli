import inquirer from 'inquirer';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const ENV_KEYS = [
  'SOURCE_ACCOUNT_SID',
  'SOURCE_AUTH_TOKEN',
  'DEST_ACCOUNT_SID',
  'DEST_AUTH_TOKEN',
];

export async function ensureEnv() {
  const missing = ENV_KEYS.filter((k) => !process.env[k]);
  if (missing.length) {
    const answers = await inquirer.prompt(
      missing.map((name) => ({
        type: 'password',
        mask: '*',
        name,
        message:
          name.includes('SID')
            ? `Informe ${name} (ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)`
            : `Informe ${name} (Auth Token)`,
        validate: (v) => (!!v ? true : 'Obrigatório'),
      }))
    );

    Object.assign(process.env, answers);

    // persist to .env
    const envPath = path.resolve(process.cwd(), '.env');
    const current = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    const merged = ENV_KEYS.map((k) => `${k}=${process.env[k] || ''}`).join('\n');
    fs.writeFileSync(envPath, merged + (merged.endsWith('\n') ? '' : '\n'));
  }
}
