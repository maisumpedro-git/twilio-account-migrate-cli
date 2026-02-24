import fs from 'fs-extra';

import { getStoreDir, getStoreFile } from '../config.js';

import { decrypt, encrypt } from './crypto.js';

function readStore() {
  try {
    const raw = fs.readFileSync(getStoreFile(), 'utf8');
    const decrypted = decrypt(raw);
    return JSON.parse(decrypted);
  } catch {
    return { accounts: [] };
  }
}

function writeStore(data) {
  fs.ensureDirSync(getStoreDir());
  const encrypted = encrypt(JSON.stringify(data, null, 2));
  fs.writeFileSync(getStoreFile(), encrypted, 'utf8');
}

export function listAccounts() {
  const store = readStore();
  return store.accounts || [];
}

export function getAccount(name) {
  const accounts = listAccounts();
  return accounts.find((a) => a.name === name) || null;
}

export function addAccount({ name, environment, accountSid, apiKeySid, apiKeySecret }) {
  const store = readStore();
  const existing = store.accounts.findIndex((a) => a.name === name);
  const account = { name, environment, accountSid, apiKeySid, apiKeySecret };

  if (existing >= 0) {
    store.accounts[existing] = account;
  } else {
    store.accounts.push(account);
  }

  writeStore(store);
  return account;
}

export function removeAccount(name) {
  const store = readStore();
  store.accounts = store.accounts.filter((a) => a.name !== name);
  writeStore(store);
}

export function getAccountsByEnvironment() {
  const accounts = listAccounts();
  const grouped = {};
  for (const acc of accounts) {
    const env = acc.environment || 'outros';
    if (!grouped[env]) grouped[env] = [];
    grouped[env].push(acc);
  }
  return grouped;
}
