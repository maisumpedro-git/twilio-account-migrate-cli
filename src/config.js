import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let baseDir = path.join(os.homedir(), '.twilio-cli-dashboard');
let envAccount = null;

export function setBaseDir(dir) {
  baseDir = path.resolve(dir);
}

export function getBaseDir() {
  return baseDir;
}

export function getStoreDir() {
  return baseDir;
}

export function getStoreFile() {
  return path.join(baseDir, 'accounts.enc');
}

export function getCacheBaseDir() {
  return path.join(baseDir, 'cache');
}

export function getVarsDir() {
  return path.join(baseDir, 'variables');
}

export function loadEnvFile(filePath) {
  const content = readFileSync(path.resolve(filePath), 'utf8');
  const vars = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }

  const account = {
    name: vars.TWILIO_ACCOUNT_NAME || 'env-account',
    environment: vars.TWILIO_ENVIRONMENT || 'dev',
    accountSid: vars.TWILIO_ACCOUNT_SID || '',
    apiKeySid: vars.TWILIO_API_KEY_SID || '',
    apiKeySecret: vars.TWILIO_API_KEY_SECRET || '',
  };

  if (!account.accountSid || !account.apiKeySid || !account.apiKeySecret) {
    throw new Error(
      'Arquivo .env deve conter TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID e TWILIO_API_KEY_SECRET',
    );
  }

  envAccount = account;
  return account;
}

export function getEnvAccount() {
  return envAccount;
}
