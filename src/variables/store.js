import path from 'node:path';

import fs from 'fs-extra';

import { getVarsDir } from '../config.js';

function safeAccountName(name) {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function varsFilePath(accountName) {
  return path.join(getVarsDir(), `${safeAccountName(accountName)}.json`);
}

function mappingFilePath(sourceAccount, destAccount) {
  const safeSrc = safeAccountName(sourceAccount);
  const safeDst = safeAccountName(destAccount);
  return path.join(getVarsDir(), `mapping_${safeSrc}_${safeDst}.json`);
}

export function saveVarsFile(accountName, sids) {
  const dir = getVarsDir();
  fs.ensureDirSync(dir);
  const data = {
    account: accountName,
    generatedAt: new Date().toISOString(),
    sids,
  };
  const filePath = varsFilePath(accountName);
  fs.writeJSONSync(filePath, data, { spaces: 2 });
  return filePath;
}

export function loadVarsFile(accountName) {
  const filePath = varsFilePath(accountName);
  if (!fs.existsSync(filePath)) return null;
  try {
    return fs.readJSONSync(filePath);
  } catch {
    return null;
  }
}

export function saveMappingFile(sourceAccount, destAccount, mapping, variables) {
  const dir = getVarsDir();
  fs.ensureDirSync(dir);
  const data = {
    source: sourceAccount,
    dest: destAccount,
    generatedAt: new Date().toISOString(),
    mapping,
    variables,
  };
  const filePath = mappingFilePath(sourceAccount, destAccount);
  fs.writeJSONSync(filePath, data, { spaces: 2 });
  return filePath;
}

export function loadMappingFile(sourceAccount, destAccount) {
  const filePath = mappingFilePath(sourceAccount, destAccount);
  if (!fs.existsSync(filePath)) return null;
  try {
    return fs.readJSONSync(filePath);
  } catch {
    return null;
  }
}
