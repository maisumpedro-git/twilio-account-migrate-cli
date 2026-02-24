import { createClient } from '../dataFetch/twilioClients.js';

/**
 * Prefixos por tipo de recurso para auto-nomeação de variáveis.
 * Ao criar um Task Queue chamado "Ativo", a variável TASKQUEUE_ATIVO
 * será registrada automaticamente com o SID criado.
 */
const TYPE_PREFIX = {
  taskQueues: 'TASKQUEUE',
  workflows: 'WORKFLOW',
  studioFlows: 'STUDIOFLOW',
  contentTemplates: 'CONTENTTEMPLATE',
};

/**
 * Ordem de processamento: recursos que outros dependem vêm primeiro.
 */
const TYPE_ORDER = ['taskQueues', 'workflows', 'studioFlows', 'contentTemplates'];

/**
 * Converte um nome para formato de variável (UPPER_SNAKE_CASE).
 * Remove acentos, espaços e caracteres especiais.
 */
export function toVarName(name) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Gera a chave de variável para um recurso criado.
 * Ex: ("taskQueues", "Ativo") → "TASKQUEUE_ATIVO"
 */
export function buildVarKey(type, friendlyName) {
  const prefix = TYPE_PREFIX[type];
  if (!prefix) return null;
  return `${prefix}_${toVarName(friendlyName)}`;
}

/**
 * Substitui placeholders %REPLACE_<VAR>% em um objeto usando o mapa de variáveis.
 * Serializa para JSON, faz replace via regex, e deserializa de volta.
 */
export function replacePlaceholders(obj, vars) {
  let json = JSON.stringify(obj);
  json = json.replace(/%REPLACE_([A-Z0-9_]+)%/g, (match, varName) => {
    if (vars[varName] !== undefined) return vars[varName];
    return match;
  });
  return JSON.parse(json);
}

/**
 * Coleta todos os placeholders não resolvidos em um objeto.
 */
export function findUnresolvedPlaceholders(obj) {
  const json = JSON.stringify(obj);
  const matches = json.match(/%REPLACE_[A-Z0-9_]+%/g);
  return matches ? [...new Set(matches)] : [];
}

/**
 * Ordena recursos pela ordem de processamento definida em TYPE_ORDER.
 */
function sortByType(resources) {
  return [...resources].sort((a, b) => {
    const orderA = TYPE_ORDER.indexOf(a.type);
    const orderB = TYPE_ORDER.indexOf(b.type);
    return (orderA === -1 ? 999 : orderA) - (orderB === -1 ? 999 : orderB);
  });
}

async function getWorkspaceSid(api) {
  const workspaces = await api.taskrouter.v1.workspaces.list({ limit: 1 });
  return workspaces[0]?.sid || null;
}

async function createTaskQueue(api, workspaceSid, resource) {
  const payload = {
    friendlyName: resource.friendlyName,
    targetWorkers: resource.targetWorkers || '1==1',
    maxReservedWorkers: resource.maxReservedWorkers || 1,
    taskOrder: resource.taskOrder || 'FIFO',
  };
  return api.taskrouter.v1.workspaces(workspaceSid).taskQueues.create(payload);
}

async function createWorkflow(api, workspaceSid, resource) {
  const configuration =
    typeof resource.configuration === 'string'
      ? resource.configuration
      : JSON.stringify(resource.configuration);

  const payload = {
    friendlyName: resource.friendlyName,
    configuration,
    assignmentCallbackUrl: resource.assignmentCallbackUrl || '',
    taskReservationTimeout: resource.taskReservationTimeout || 120,
  };
  return api.taskrouter.v1.workspaces(workspaceSid).workflows.create(payload);
}

async function createStudioFlow(api, resource) {
  const payload = {
    friendlyName: resource.friendlyName,
    status: resource.status || 'draft',
    definition: resource.definition,
    commitMessage: resource.commitMessage || 'Bulk deploy',
  };
  return api.studio.v2.flows.create(payload);
}

async function createContentTemplate(api, resource) {
  const payload = {};
  if (resource.friendlyName) payload.friendlyName = resource.friendlyName;
  if (resource.types) payload.types = resource.types;
  if (resource.variables) payload.variables = resource.variables;
  if (resource.language) payload.language = resource.language;
  if (resource.channel) payload.channel = resource.channel;
  if (resource.content) payload.content = resource.content;
  return api.content.v1.contents.create(payload);
}

/**
 * Executa o deploy em massa de recursos na conta destino.
 *
 * @param {object} account - Conta Twilio destino
 * @param {Array} resources - Array de objetos de recurso (ver documentação do JSON)
 * @param {object} [initialVars={}] - Variáveis iniciais (ex: passadas via --var)
 * @param {function} [onProgress] - Callback para cada recurso processado
 * @param {object} [apiOverride] - Cliente Twilio para testes (usa createClient se não fornecido)
 * @returns {{ results: Array, vars: object }}
 */
export async function bulkDeploy(account, resources, initialVars = {}, onProgress, apiOverride) {
  const api = apiOverride || createClient(account);
  const vars = { ...initialVars };
  const results = [];

  const sorted = sortByType(resources);

  const needsWorkspace = sorted.some((r) => ['taskQueues', 'workflows'].includes(r.type));
  let workspaceSid = null;
  if (needsWorkspace) {
    workspaceSid = await getWorkspaceSid(api);
    if (!workspaceSid) {
      throw new Error('Nenhum workspace encontrado na conta.');
    }
    vars['WORKSPACE'] = workspaceSid;
  }

  for (const resource of sorted) {
    const resolved = replacePlaceholders(resource, vars);

    const unresolved = findUnresolvedPlaceholders(resolved);
    if (unresolved.length) {
      const entry = {
        type: resolved.type,
        friendlyName: resolved.friendlyName,
        sid: null,
        status: 'error',
        error: `Variáveis não resolvidas: ${unresolved.join(', ')}`,
      };
      results.push(entry);
      if (onProgress) onProgress(entry);
      continue;
    }

    let created;
    try {
      switch (resolved.type) {
        case 'taskQueues':
          created = await createTaskQueue(api, workspaceSid, resolved);
          break;
        case 'workflows':
          created = await createWorkflow(api, workspaceSid, resolved);
          break;
        case 'studioFlows':
          created = await createStudioFlow(api, resolved);
          break;
        case 'contentTemplates':
          created = await createContentTemplate(api, resolved);
          break;
        default:
          throw new Error(`Tipo de recurso não suportado para deploy: ${resolved.type}`);
      }

      const varKey = buildVarKey(resolved.type, resolved.friendlyName);
      if (varKey && created.sid) {
        vars[varKey] = created.sid;
      }

      const entry = {
        type: resolved.type,
        friendlyName: resolved.friendlyName,
        sid: created.sid,
        status: 'created',
      };
      results.push(entry);
      if (onProgress) onProgress(entry);
    } catch (err) {
      const entry = {
        type: resolved.type,
        friendlyName: resolved.friendlyName,
        sid: null,
        status: 'error',
        error: err.message,
      };
      results.push(entry);
      if (onProgress) onProgress(entry);
    }
  }

  return { results, vars };
}
