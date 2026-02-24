import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { getBaseDir, getCacheBaseDir, getStoreFile, loadEnvFile, setBaseDir } from '../src/config.js';

const ORIGINAL_BASE = path.join(os.homedir(), '.twilio-cli-dashboard');
const TEST_DIR = path.join(os.tmpdir(), '__test_config_tam__');

afterEach(() => {
  setBaseDir(ORIGINAL_BASE);
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
});

test('default base dir is ~/.twilio-cli-dashboard', () => {
  expect(getBaseDir()).toBe(ORIGINAL_BASE);
});

test('setBaseDir changes all derived paths', () => {
  setBaseDir('/tmp/custom-dir');
  expect(getBaseDir()).toBe('/tmp/custom-dir');
  expect(getStoreFile()).toBe('/tmp/custom-dir/accounts.enc');
  expect(getCacheBaseDir()).toBe('/tmp/custom-dir/cache');
});

test('loadEnvFile parses env file and returns account', () => {
  mkdirSync(TEST_DIR, { recursive: true });
  const envPath = path.join(TEST_DIR, '.env');
  writeFileSync(
    envPath,
    [
      'TWILIO_ACCOUNT_NAME=test-account',
      'TWILIO_ENVIRONMENT=dev',
      'TWILIO_ACCOUNT_SID=ACtest123456789012345678901234',
      'TWILIO_API_KEY_SID=SKtest123456789012345678901234',
      'TWILIO_API_KEY_SECRET=secret123',
    ].join('\n'),
  );

  const account = loadEnvFile(envPath);
  expect(account.name).toBe('test-account');
  expect(account.environment).toBe('dev');
  expect(account.accountSid).toBe('ACtest123456789012345678901234');
  expect(account.apiKeySid).toBe('SKtest123456789012345678901234');
  expect(account.apiKeySecret).toBe('secret123');
});

test('loadEnvFile throws if required fields are missing', () => {
  mkdirSync(TEST_DIR, { recursive: true });
  const envPath = path.join(TEST_DIR, '.env');
  writeFileSync(envPath, 'TWILIO_ACCOUNT_NAME=test\n');

  expect(() => loadEnvFile(envPath)).toThrow('TWILIO_ACCOUNT_SID');
});

test('loadEnvFile handles quoted values', () => {
  mkdirSync(TEST_DIR, { recursive: true });
  const envPath = path.join(TEST_DIR, '.env');
  writeFileSync(
    envPath,
    [
      'TWILIO_ACCOUNT_NAME="my-account"',
      "TWILIO_ENVIRONMENT='prod'",
      'TWILIO_ACCOUNT_SID=ACtest123456789012345678901234',
      'TWILIO_API_KEY_SID=SKtest123456789012345678901234',
      'TWILIO_API_KEY_SECRET=secret123',
    ].join('\n'),
  );

  const account = loadEnvFile(envPath);
  expect(account.name).toBe('my-account');
  expect(account.environment).toBe('prod');
});
