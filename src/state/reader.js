// src/state/reader.js
import path from 'node:path';

import fsExtra from 'fs-extra';

const { pathExists, readJson } = fsExtra;

export async function readState(dir, resourceType) {
  const filePath = path.join(dir, 'state', `${resourceType}.json`);
  const exists = await pathExists(filePath);
  if (!exists) return { fetchedAt: null, resources: [] };
  return readJson(filePath);
}

export async function readAllStates(dir) {
  const types = [
    'taskQueues',
    'taskChannels',
    'workflows',
    'workspace',
    'studioFlows',
    'contentTemplates',
    'serverless',
  ];
  const states = {};
  for (const type of types) {
    states[type] = await readState(dir, type);
  }
  return states;
}

export async function readMigrationsTracker(dir) {
  const filePath = path.join(dir, 'state', 'migrations.json');
  const exists = await pathExists(filePath);
  if (!exists) return { applied: [] };
  return readJson(filePath);
}
