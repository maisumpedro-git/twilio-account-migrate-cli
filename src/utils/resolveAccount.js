import { getAccount, listAccounts } from '../accounts/store.js';
import { getEnvAccount } from '../config.js';

export function resolveAccount(name) {
  const envAcc = getEnvAccount();

  if (!name) {
    if (envAcc) return envAcc;
    const accounts = listAccounts();
    if (accounts.length === 1) return accounts[0];
    return null;
  }

  if (envAcc && envAcc.name === name) {
    return envAcc;
  }

  return getAccount(name) || null;
}
