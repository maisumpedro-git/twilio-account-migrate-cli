import { setCachedResource } from './cache.js';
import { createClient } from './twilioClients.js';

async function fetchWorkspace(api) {
  const workspaces = await api.taskrouter.v1.workspaces.list({ limit: 50 });
  const workspace = workspaces[0];
  if (!workspace) return null;
  return {
    sid: workspace.sid,
    friendlyName: workspace.friendlyName || workspace.friendly_name,
  };
}

async function fetchTaskQueues(api, workspaceSid) {
  if (!workspaceSid) return [];
  const queues = await api.taskrouter.v1.workspaces(workspaceSid).taskQueues.list({ limit: 1000 });
  return queues.map(
    ({
      sid,
      friendlyName,
      friendly_name,
      uniqueName,
      unique_name,
      targetWorkers,
      target_workers,
      maxReservedWorkers,
      max_reserved_workers,
      taskOrder,
      task_order,
    }) => ({
      sid,
      friendlyName: friendlyName || friendly_name,
      uniqueName: uniqueName || unique_name,
      targetWorkers: targetWorkers || target_workers,
      maxReservedWorkers: maxReservedWorkers || max_reserved_workers,
      taskOrder: taskOrder || task_order,
    }),
  );
}

async function fetchTaskChannels(api, workspaceSid) {
  if (!workspaceSid) return [];
  const channels = await api.taskrouter.v1
    .workspaces(workspaceSid)
    .taskChannels.list({ limit: 1000 });
  return channels.map(
    ({ sid, friendlyName, friendly_name, uniqueName, unique_name }) => ({
      sid,
      friendlyName: friendlyName || friendly_name,
      uniqueName: uniqueName || unique_name,
    }),
  );
}

async function fetchWorkflows(api, workspaceSid) {
  if (!workspaceSid) return [];
  const workflows = await api.taskrouter.v1
    .workspaces(workspaceSid)
    .workflows.list({ limit: 1000 });
  return workflows.map(
    ({
      sid,
      friendlyName,
      friendly_name,
      uniqueName,
      unique_name,
      configuration,
      taskReservationTimeout,
      task_reservation_timeout,
      assignmentCallbackUrl,
      assignment_callback_url,
    }) => ({
      sid,
      friendlyName: friendlyName || friendly_name,
      uniqueName: uniqueName || unique_name,
      configuration: tryParseJson(configuration),
      taskReservationTimeout: taskReservationTimeout || task_reservation_timeout,
      assignmentCallbackUrl: assignmentCallbackUrl || assignment_callback_url,
    }),
  );
}

async function fetchStudioFlows(api) {
  const flows = await api.studio.v2.flows.list({ limit: 1000 });
  const detailed = [];
  for (const f of flows) {
    try {
      const full = await api.studio.v2.flows(f.sid).fetch();
      detailed.push({
        sid: f.sid,
        friendlyName: f.friendlyName || f.friendly_name,
        status: f.status,
        commitMessage: f.commitMessage || f.commit_message,
        definition: full.definition || null,
      });
    } catch {
      detailed.push({
        sid: f.sid,
        friendlyName: f.friendlyName || f.friendly_name,
        status: f.status,
        commitMessage: f.commitMessage || f.commit_message,
        definition: null,
      });
    }
  }
  return detailed;
}

async function fetchContentTemplates(api) {
  try {
    const templates = await api.content.v1.contents.list();
    return templates.map(
      ({
        sid,
        friendlyName,
        friendly_name,
        uniqueName,
        unique_name,
        types,
        variables,
        language,
      }) => ({
        sid,
        friendlyName: friendlyName || friendly_name,
        uniqueName: uniqueName || unique_name,
        types: types || null,
        variables: variables || null,
        language: language || null,
      }),
    );
  } catch {
    return [];
  }
}

function tryParseJson(val) {
  if (!val || typeof val !== 'string') return val;
  try {
    return JSON.parse(val);
  } catch {
    return val;
  }
}

export async function fetchResource(account, resourceType) {
  const api = createClient(account);

  let data;
  switch (resourceType) {
    case 'workspace': {
      data = await fetchWorkspace(api);
      break;
    }
    case 'taskQueues': {
      const ws = await fetchWorkspace(api);
      data = await fetchTaskQueues(api, ws?.sid);
      break;
    }
    case 'taskChannels': {
      const ws = await fetchWorkspace(api);
      data = await fetchTaskChannels(api, ws?.sid);
      break;
    }
    case 'workflows': {
      const ws = await fetchWorkspace(api);
      data = await fetchWorkflows(api, ws?.sid);
      break;
    }
    case 'studioFlows': {
      data = await fetchStudioFlows(api);
      break;
    }
    case 'contentTemplates': {
      data = await fetchContentTemplates(api);
      break;
    }
    default:
      throw new Error(`Tipo de recurso desconhecido: ${resourceType}`);
  }

  setCachedResource(account.name, resourceType, data);
  return data;
}

export async function fetchAllResources(account) {
  const api = createClient(account);

  const workspace = await fetchWorkspace(api);
  const wsSid = workspace?.sid;

  const [taskQueues, taskChannels, workflows, studioFlows, contentTemplates] = await Promise.all([
    fetchTaskQueues(api, wsSid),
    fetchTaskChannels(api, wsSid),
    fetchWorkflows(api, wsSid),
    fetchStudioFlows(api),
    fetchContentTemplates(api),
  ]);

  const resources = { workspace, taskQueues, taskChannels, workflows, studioFlows, contentTemplates };

  setCachedResource(account.name, 'workspace', workspace);
  setCachedResource(account.name, 'taskQueues', taskQueues);
  setCachedResource(account.name, 'taskChannels', taskChannels);
  setCachedResource(account.name, 'workflows', workflows);
  setCachedResource(account.name, 'studioFlows', studioFlows);
  setCachedResource(account.name, 'contentTemplates', contentTemplates);

  return resources;
}
