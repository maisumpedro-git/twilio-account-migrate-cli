import os from 'node:os';
import path from 'node:path';

import fs from 'fs-extra';

import {
  clearCache,
  getCachedResource,
  getCacheMetadata,
  setCachedResource,
} from '../src/dataFetch/cache.js';

const TEST_ACCOUNT = '__test_cache_account__';
const CACHE_DIR = path.join(os.homedir(), '.twilio-cli-dashboard', 'cache', TEST_ACCOUNT);

afterEach(() => {
  clearCache(TEST_ACCOUNT);
});

test('getCachedResource returns null when no cache exists', () => {
  expect(getCachedResource(TEST_ACCOUNT, 'taskQueues')).toBeNull();
});

test('setCachedResource and getCachedResource round-trip', () => {
  const data = [{ sid: 'TQ1', friendlyName: 'Queue A' }];
  setCachedResource(TEST_ACCOUNT, 'taskQueues', data);

  const cached = getCachedResource(TEST_ACCOUNT, 'taskQueues');
  expect(cached.data).toEqual(data);
  expect(cached.fetchedAt).toBeTruthy();
});

test('getCacheMetadata returns timestamps for cached resources', () => {
  setCachedResource(TEST_ACCOUNT, 'taskQueues', []);
  setCachedResource(TEST_ACCOUNT, 'workflows', []);

  const meta = getCacheMetadata(TEST_ACCOUNT);
  expect(meta.taskQueues.fetchedAt).toBeTruthy();
  expect(meta.workflows.fetchedAt).toBeTruthy();
});

test('clearCache removes all cached data', () => {
  setCachedResource(TEST_ACCOUNT, 'taskQueues', []);
  clearCache(TEST_ACCOUNT);
  expect(getCachedResource(TEST_ACCOUNT, 'taskQueues')).toBeNull();
  expect(fs.existsSync(CACHE_DIR)).toBe(false);
});
