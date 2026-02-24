import path from 'node:path';

import fs from 'fs-extra';

import { getCacheBaseDir } from '../config.js';

function accountDir(accountName) {
  const safe = accountName.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(getCacheBaseDir(), safe);
}

export function getCachedResource(accountName, resourceType) {
  const filePath = path.join(accountDir(accountName), `${resourceType}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    return fs.readJSONSync(filePath);
  } catch {
    return null;
  }
}

export function setCachedResource(accountName, resourceType, data) {
  const dir = accountDir(accountName);
  fs.ensureDirSync(dir);
  const wrapped = {
    fetchedAt: new Date().toISOString(),
    data,
  };
  fs.writeJSONSync(path.join(dir, `${resourceType}.json`), wrapped, { spaces: 2 });
}

export function getCacheMetadata(accountName) {
  const dir = accountDir(accountName);
  if (!fs.existsSync(dir)) return {};
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  const meta = {};
  for (const file of files) {
    const name = path.basename(file, '.json');
    try {
      const content = fs.readJSONSync(path.join(dir, file));
      meta[name] = { fetchedAt: content.fetchedAt || null };
    } catch {
      meta[name] = { fetchedAt: null };
    }
  }
  return meta;
}

export function getAllCachedResources(accountName) {
  const dir = accountDir(accountName);
  if (!fs.existsSync(dir)) return {};
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  const resources = {};
  for (const file of files) {
    const name = path.basename(file, '.json');
    try {
      const content = fs.readJSONSync(path.join(dir, file));
      resources[name] = content;
    } catch {
      // skip corrupt files
    }
  }
  return resources;
}

export function clearCache(accountName) {
  const dir = accountDir(accountName);
  if (fs.existsSync(dir)) fs.removeSync(dir);
}

export const RESOURCE_TYPES = [
  'taskQueues',
  'taskChannels',
  'workflows',
  'workspace',
  'studioFlows',
  'contentTemplates',
];

export const RESOURCE_LABELS = {
  taskQueues: 'Task Queues',
  taskChannels: 'Task Channels',
  workflows: 'Workflows',
  workspace: 'Workspace',
  studioFlows: 'Studio Flows',
  contentTemplates: 'Content Templates',
};

const RESOURCE_ALIASES = {
  'task-queues': 'taskQueues',
  'task-channels': 'taskChannels',
  'studio-flows': 'studioFlows',
  'content-templates': 'contentTemplates',
  taskqueues: 'taskQueues',
  taskchannels: 'taskChannels',
  studioflows: 'studioFlows',
  contenttemplates: 'contentTemplates',
  workflows: 'workflows',
  workspace: 'workspace',
};

export function normalizeResourceType(input) {
  const lower = input.toLowerCase().trim();
  return RESOURCE_ALIASES[lower] || input.trim();
}

export function parseResourceTypes(input) {
  if (!input) return [...RESOURCE_TYPES];
  return input.split(',').map(normalizeResourceType);
}

export function buildDataFromCache(cachedResources) {
  const workspace = cachedResources.workspace?.data || null;
  const taskQueues = cachedResources.taskQueues?.data || [];
  const workflows = cachedResources.workflows?.data || [];
  const taskChannels = cachedResources.taskChannels?.data || [];
  const contentTemplates = cachedResources.contentTemplates?.data || [];
  const studioFlows = cachedResources.studioFlows?.data || [];

  return {
    taskrouter: {
      workspace,
      taskQueues,
      workflows,
      activities: [],
      taskChannels,
    },
    serverless: [],
    contentTemplates,
    studio: { flows: studioFlows },
  };
}
