// src/twilio/writers.js

async function createTaskQueue(api, workspaceSid, data) {
  return api.taskrouter.v1.workspaces(workspaceSid).taskQueues.create(data);
}

async function updateTaskQueue(api, workspaceSid, sid, data) {
  return api.taskrouter.v1.workspaces(workspaceSid).taskQueues(sid).update(data);
}

async function deleteTaskQueue(api, workspaceSid, sid) {
  return api.taskrouter.v1.workspaces(workspaceSid).taskQueues(sid).remove();
}

async function createWorkflow(api, workspaceSid, data) {
  const payload = { ...data };
  if (typeof payload.configuration === 'object') {
    payload.configuration = JSON.stringify(payload.configuration);
  }
  return api.taskrouter.v1.workspaces(workspaceSid).workflows.create(payload);
}

async function updateWorkflow(api, workspaceSid, sid, data) {
  const payload = { ...data };
  if (typeof payload.configuration === 'object') {
    payload.configuration = JSON.stringify(payload.configuration);
  }
  return api.taskrouter.v1.workspaces(workspaceSid).workflows(sid).update(payload);
}

async function deleteWorkflow(api, workspaceSid, sid) {
  return api.taskrouter.v1.workspaces(workspaceSid).workflows(sid).remove();
}

async function createTaskChannel(api, workspaceSid, data) {
  return api.taskrouter.v1.workspaces(workspaceSid).taskChannels.create(data);
}

async function updateTaskChannel(api, workspaceSid, sid, data) {
  return api.taskrouter.v1.workspaces(workspaceSid).taskChannels(sid).update(data);
}

async function deleteTaskChannel(api, workspaceSid, sid) {
  return api.taskrouter.v1.workspaces(workspaceSid).taskChannels(sid).remove();
}

async function createStudioFlow(api, _wsSid, data) {
  const payload = { ...data, status: 'draft' };
  if (typeof payload.definition === 'object') {
    payload.definition = JSON.stringify(payload.definition);
  }
  return api.studio.v2.flows.create(payload);
}

async function updateStudioFlow(api, _wsSid, sid, data) {
  const payload = { ...data, status: 'published' };
  if (typeof payload.definition === 'object') {
    payload.definition = JSON.stringify(payload.definition);
  }
  return api.studio.v2.flows(sid).update(payload);
}

async function deleteStudioFlow(api, _wsSid, sid) {
  return api.studio.v2.flows(sid).remove();
}

async function createContentTemplate(api, _wsSid, data) {
  return api.content.v1.contents.create(data);
}

async function deleteContentTemplate(api, _wsSid, sid) {
  return api.content.v1.contents(sid).remove();
}

const WRITERS = {
  taskQueues: { create: createTaskQueue, update: updateTaskQueue, delete: deleteTaskQueue },
  workflows: { create: createWorkflow, update: updateWorkflow, delete: deleteWorkflow },
  taskChannels: { create: createTaskChannel, update: updateTaskChannel, delete: deleteTaskChannel },
  studioFlows: { create: createStudioFlow, update: updateStudioFlow, delete: deleteStudioFlow },
  contentTemplates: { create: createContentTemplate, update: null, delete: deleteContentTemplate },
};

async function findSidByName(api, type, name, workspaceSid) {
  let resources;
  switch (type) {
    case 'taskQueues':
      resources = await api.taskrouter.v1
        .workspaces(workspaceSid)
        .taskQueues.list({ friendlyName: name, limit: 1 });
      break;
    case 'workflows':
      resources = await api.taskrouter.v1
        .workspaces(workspaceSid)
        .workflows.list({ friendlyName: name, limit: 1 });
      break;
    case 'taskChannels':
      resources = await api.taskrouter.v1
        .workspaces(workspaceSid)
        .taskChannels.list({ limit: 1000 });
      resources = resources.filter((r) => (r.friendlyName || r.uniqueName) === name);
      break;
    case 'studioFlows':
      resources = await api.studio.v2.flows.list({ limit: 1000 });
      resources = resources.filter((r) => r.friendlyName === name);
      break;
    case 'contentTemplates':
      resources = await api.content.v1.contents.list();
      resources = resources.filter((r) => (r.friendlyName || r.uniqueName) === name);
      break;
    default:
      return null;
  }
  return resources[0]?.sid || null;
}

export async function executeOperation(api, operation, workspaceSid) {
  const { action, type, match, data } = operation;
  const writer = WRITERS[type]?.[action];

  if (!writer) {
    throw new Error(`Acao "${action}" nao suportada para tipo "${type}"`);
  }

  if (action === 'create') {
    const result = await writer(api, workspaceSid, data);
    return { sid: result.sid, friendlyName: data.friendlyName || data.uniqueName };
  }

  if (action === 'update' || action === 'delete') {
    const name = match.friendlyName || match.uniqueName;
    const sid = await findSidByName(api, type, name, workspaceSid);
    if (!sid) {
      throw new Error(`Recurso "${name}" (${type}) nao encontrado no ambiente`);
    }
    if (action === 'update') {
      const result = await writer(api, workspaceSid, sid, data);
      return { sid: result.sid || sid, friendlyName: name };
    }
    await writer(api, workspaceSid, sid);
    return { sid, friendlyName: name, deleted: true };
  }

  throw new Error(`Acao desconhecida: ${action}`);
}
