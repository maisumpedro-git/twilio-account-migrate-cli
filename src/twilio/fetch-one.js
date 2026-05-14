import { tryParseJson } from '../utils/json.js';

function mapTaskQueue(r) {
  if (!r) return null;
  return {
    sid: r.sid,
    friendlyName: r.friendlyName || r.friendly_name,
    uniqueName: r.uniqueName || r.unique_name,
    targetWorkers: r.targetWorkers || r.target_workers,
    maxReservedWorkers: r.maxReservedWorkers || r.max_reserved_workers,
    taskOrder: r.taskOrder || r.task_order,
  };
}

function mapTaskChannel(r) {
  if (!r) return null;
  return {
    sid: r.sid,
    friendlyName: r.friendlyName || r.friendly_name,
    uniqueName: r.uniqueName || r.unique_name,
  };
}

function mapWorkflow(r) {
  if (!r) return null;
  return {
    sid: r.sid,
    friendlyName: r.friendlyName || r.friendly_name,
    uniqueName: r.uniqueName || r.unique_name,
    configuration: tryParseJson(r.configuration),
    taskReservationTimeout: r.taskReservationTimeout || r.task_reservation_timeout,
    assignmentCallbackUrl: r.assignmentCallbackUrl || r.assignment_callback_url,
  };
}

function mapStudioFlow(r) {
  if (!r) return null;
  return {
    sid: r.sid,
    friendlyName: r.friendlyName || r.friendly_name,
    status: r.status,
    commitMessage: r.commitMessage || r.commit_message,
    definition: r.definition || null,
  };
}

function mapContentTemplate(r) {
  if (!r) return null;
  return {
    sid: r.sid,
    friendlyName: r.friendlyName || r.friendly_name,
    uniqueName: r.uniqueName || r.unique_name,
    types: r.types || null,
    variables: r.variables || null,
    language: r.language || null,
  };
}

export async function fetchOne(api, type, sid, workspaceSid) {
  switch (type) {
    case 'taskQueues':
      return mapTaskQueue(await api.taskrouter.v1.workspaces(workspaceSid).taskQueues(sid).fetch());
    case 'taskChannels':
      return mapTaskChannel(
        await api.taskrouter.v1.workspaces(workspaceSid).taskChannels(sid).fetch(),
      );
    case 'workflows':
      return mapWorkflow(await api.taskrouter.v1.workspaces(workspaceSid).workflows(sid).fetch());
    case 'studioFlows':
      return mapStudioFlow(await api.studio.v2.flows(sid).fetch());
    case 'contentTemplates':
      return mapContentTemplate(await api.content.v1.contents(sid).fetch());
    default:
      return null;
  }
}
