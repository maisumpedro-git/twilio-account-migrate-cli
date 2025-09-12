import fs from 'fs-extra';
import path from 'path';
import { getTwilioClients } from './twilioClients.js';

async function fetchTaskRouter(api) {
  const workspaces = await api.taskrouter.v1.workspaces.list({ limit: 50 });
  const workspace = workspaces[0];
  if (!workspace) return null;

  const [taskQueues, workflows, activities, taskChannels] = await Promise.all([
    api.taskrouter.v1.workspaces(workspace.sid).taskQueues.list({ limit: 1000 }),
    api.taskrouter.v1.workspaces(workspace.sid).workflows.list({ limit: 1000 }),
    api.taskrouter.v1.workspaces(workspace.sid).activities.list({ limit: 1000 }),
    api.taskrouter.v1.workspaces(workspace.sid).taskChannels.list({ limit: 1000 }),
  ]);

  return {
    workspace,
    taskQueues: taskQueues.map(({ sid, friendlyName, friendly_name, uniqueName, unique_name }) => ({
      sid,
      friendlyName: friendlyName || friendly_name,
      uniqueName: uniqueName || unique_name,
    })),
    workflows: workflows.map(({ sid, friendlyName, friendly_name, uniqueName, unique_name }) => ({
      sid,
      friendlyName: friendlyName || friendly_name,
      uniqueName: uniqueName || unique_name,
    })),
    activities: activities.map(({ sid, friendlyName, friendly_name, uniqueName, unique_name }) => ({
      sid,
      friendlyName: friendlyName || friendly_name,
      uniqueName: uniqueName || unique_name,
    })),
    taskChannels: taskChannels.map(({ sid, friendlyName, friendly_name, uniqueName, unique_name }) => ({
      sid,
      friendlyName: friendlyName || friendly_name,
      uniqueName: uniqueName || unique_name,
    })),
  };
}

async function fetchServerless(api) {
  const services = await api.serverless.v1.services.list({ limit: 100 });
  const results = [];
  for (const svc of services) {
    const environments = await api.serverless.v1.services(svc.sid).environments.list({ limit: 100 });
    const envs = [];
    for (const env of environments) {
      const functions = await api.serverless.v1
        .services(svc.sid)
        .environments(env.sid)
        .variables.list({ limit: 100 });
      // Variables are not functions; Twilio Functions are under /functions; but to get function versions we need more calls.
      // Simplify: collect functions by service/functions list
      const funcs = await api.serverless.v1.services(svc.sid).functions.list({ limit: 100 });
      envs.push({
        sid: env.sid,
        domainName: env.domainName,
        functions: funcs.map(({ sid, friendlyName, friendly_name, uniqueName, unique_name }) => ({
          sid,
          friendlyName: friendlyName || friendly_name,
          uniqueName: uniqueName || unique_name,
        })),
      });
    }
    results.push({
      sid: svc.sid,
      friendlyName: svc.friendlyName,
      uniqueName: svc.uniqueName,
      environments: envs,
    });
  }
  return results;
}

async function fetchContentTemplates(api) {
  // Content API v1: content.v1.contents.list
  try {
    const templates = await api.content.v1.contents.list();
    return templates.map(({ sid, friendlyName, friendly_name, uniqueName, unique_name }) => ({
      sid,
      friendlyName: friendlyName || friendly_name,
      uniqueName: uniqueName || unique_name,
    }));
  } catch (e) {
    return [];
  }
}

async function fetchStudioFlows(api) {
  const flows = await api.studio.v2.flows.list({ limit: 1000 });
  return flows.map((f) => ({ sid: f.sid, friendlyName: f.friendlyName, commitMessage: f.commitMessage }));
}

function saveJson(baseDir, name, data) {
  fs.ensureDirSync(baseDir);
  fs.writeJSONSync(path.join(baseDir, `${name}.json`), data, { spaces: 2 });
}

export async function fetchAllData() {
  const { source, dest } = getTwilioClients();

  const [srcTR, dstTR] = await Promise.all([fetchTaskRouter(source), fetchTaskRouter(dest)]);
  const [srcSrv, dstSrv] = await Promise.all([fetchServerless(source), fetchServerless(dest)]);
  const [srcTpl, dstTpl] = await Promise.all([fetchContentTemplates(source), fetchContentTemplates(dest)]);
  const [srcFlows, dstFlows] = await Promise.all([fetchStudioFlows(source), fetchStudioFlows(dest)]);

  const src = {
    taskrouter: srcTR,
    serverless: srcSrv,
    contentTemplates: srcTpl,
    studio: { flows: srcFlows },
  };
  const dst = {
    taskrouter: dstTR,
    serverless: dstSrv,
    contentTemplates: dstTpl,
    studio: { flows: dstFlows },
  };

  saveJson(path.resolve('data/source'), 'taskrouter', srcTR || {});
  saveJson(path.resolve('data/source'), 'serverless', srcSrv || []);
  saveJson(path.resolve('data/source'), 'contentTemplates', srcTpl || []);
  saveJson(path.resolve('data/source'), 'studioFlows', srcFlows || []);

  saveJson(path.resolve('data/dest'), 'taskrouter', dstTR || {});
  saveJson(path.resolve('data/dest'), 'serverless', dstSrv || []);
  saveJson(path.resolve('data/dest'), 'contentTemplates', dstTpl || []);
  saveJson(path.resolve('data/dest'), 'studioFlows', dstFlows || []);

  return { source: src, dest: dst };
}
