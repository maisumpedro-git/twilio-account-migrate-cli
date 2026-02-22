import os from 'node:os';
import path from 'node:path';

import fs from 'fs-extra';

import { addAccount, getAccount, listAccounts, removeAccount } from '../src/accounts/store.js';

const STORE_DIR = path.join(os.homedir(), '.twilio-cli-dashboard');
const STORE_FILE = path.join(STORE_DIR, 'accounts.enc');
let backup = null;

beforeAll(() => {
  if (fs.existsSync(STORE_FILE)) {
    backup = fs.readFileSync(STORE_FILE);
  }
});

afterAll(() => {
  if (backup) {
    fs.writeFileSync(STORE_FILE, backup);
  } else if (fs.existsSync(STORE_FILE)) {
    fs.removeSync(STORE_FILE);
  }
});

beforeEach(() => {
  if (fs.existsSync(STORE_FILE)) fs.removeSync(STORE_FILE);
});

test('listAccounts returns empty array when no store exists', () => {
  expect(listAccounts()).toEqual([]);
});

test('addAccount and getAccount round-trip', () => {
  addAccount({
    name: 'Test Dev',
    environment: 'dev',
    accountSid: 'AC1234',
    apiKeySid: 'SK1234',
    apiKeySecret: 'secret123',
  });

  const accounts = listAccounts();
  expect(accounts).toHaveLength(1);
  expect(accounts[0].name).toBe('Test Dev');
  expect(accounts[0].apiKeySecret).toBe('secret123');

  const acc = getAccount('Test Dev');
  expect(acc.environment).toBe('dev');
  expect(acc.accountSid).toBe('AC1234');
});

test('addAccount updates existing account with same name', () => {
  addAccount({
    name: 'Prod',
    environment: 'prod',
    accountSid: 'AC0001',
    apiKeySid: 'SK0001',
    apiKeySecret: 'old',
  });

  addAccount({
    name: 'Prod',
    environment: 'prod',
    accountSid: 'AC0001',
    apiKeySid: 'SK0001',
    apiKeySecret: 'new',
  });

  const accounts = listAccounts();
  expect(accounts).toHaveLength(1);
  expect(accounts[0].apiKeySecret).toBe('new');
});

test('removeAccount removes the account', () => {
  addAccount({
    name: 'ToRemove',
    environment: 'stage',
    accountSid: 'AC9999',
    apiKeySid: 'SK9999',
    apiKeySecret: 'x',
  });

  expect(listAccounts()).toHaveLength(1);
  removeAccount('ToRemove');
  expect(listAccounts()).toHaveLength(0);
});
