import {
  buildVarKey,
  bulkDeploy,
  findUnresolvedPlaceholders,
  replacePlaceholders,
  toVarName,
} from '../src/bulkDeploy/deploy.js';

// ————————————————————————————————————————
// toVarName
// ————————————————————————————————————————

test('toVarName converts simple name to UPPER_SNAKE', () => {
  expect(toVarName('Ativo')).toBe('ATIVO');
});

test('toVarName removes accents', () => {
  expect(toVarName('Padrão Básico')).toBe('PADRAO_BASICO');
});

test('toVarName handles special characters', () => {
  expect(toVarName('my-queue (default)')).toBe('MY_QUEUE_DEFAULT');
});

test('toVarName handles multiple spaces/underscores', () => {
  expect(toVarName('foo   bar___baz')).toBe('FOO_BAR_BAZ');
});

// ————————————————————————————————————————
// buildVarKey
// ————————————————————————————————————————

test('buildVarKey creates correct key for taskQueues', () => {
  expect(buildVarKey('taskQueues', 'Ativo')).toBe('TASKQUEUE_ATIVO');
});

test('buildVarKey creates correct key for workflows', () => {
  expect(buildVarKey('workflows', 'Main Flow')).toBe('WORKFLOW_MAIN_FLOW');
});

test('buildVarKey creates correct key for studioFlows', () => {
  expect(buildVarKey('studioFlows', 'IVR Flow')).toBe('STUDIOFLOW_IVR_FLOW');
});

test('buildVarKey creates correct key for contentTemplates', () => {
  expect(buildVarKey('contentTemplates', 'Welcome')).toBe('CONTENTTEMPLATE_WELCOME');
});

test('buildVarKey returns null for unknown type', () => {
  expect(buildVarKey('unknown', 'name')).toBeNull();
});

// ————————————————————————————————————————
// replacePlaceholders
// ————————————————————————————————————————

test('replacePlaceholders replaces known vars', () => {
  const obj = { queue: '%REPLACE_TASKQUEUE_ATIVO%' };
  const vars = { TASKQUEUE_ATIVO: 'WQ1234' };
  const result = replacePlaceholders(obj, vars);
  expect(result.queue).toBe('WQ1234');
});

test('replacePlaceholders keeps unresolved vars', () => {
  const obj = { queue: '%REPLACE_TASKQUEUE_MISSING%' };
  const vars = {};
  const result = replacePlaceholders(obj, vars);
  expect(result.queue).toBe('%REPLACE_TASKQUEUE_MISSING%');
});

test('replacePlaceholders works with nested objects', () => {
  const obj = {
    configuration: {
      task_routing: {
        filters: [{ targets: [{ queue: '%REPLACE_TASKQUEUE_ATIVO%' }] }],
        default_filter: { queue: '%REPLACE_TASKQUEUE_PADRAO%' },
      },
    },
  };
  const vars = {
    TASKQUEUE_ATIVO: 'WQactive',
    TASKQUEUE_PADRAO: 'WQdefault',
  };
  const result = replacePlaceholders(obj, vars);
  expect(result.configuration.task_routing.filters[0].targets[0].queue).toBe('WQactive');
  expect(result.configuration.task_routing.default_filter.queue).toBe('WQdefault');
});

test('replacePlaceholders replaces multiple occurrences of same var', () => {
  const obj = { a: '%REPLACE_X%', b: '%REPLACE_X%' };
  const vars = { X: 'value' };
  const result = replacePlaceholders(obj, vars);
  expect(result.a).toBe('value');
  expect(result.b).toBe('value');
});

// ————————————————————————————————————————
// findUnresolvedPlaceholders
// ————————————————————————————————————————

test('findUnresolvedPlaceholders finds all unresolved', () => {
  const obj = { a: '%REPLACE_FOO%', b: '%REPLACE_BAR%', c: 'normal' };
  const result = findUnresolvedPlaceholders(obj);
  expect(result).toContain('%REPLACE_FOO%');
  expect(result).toContain('%REPLACE_BAR%');
  expect(result).toHaveLength(2);
});

test('findUnresolvedPlaceholders returns empty array when none', () => {
  const obj = { a: 'hello', b: 123 };
  const result = findUnresolvedPlaceholders(obj);
  expect(result).toHaveLength(0);
});

// ————————————————————————————————————————
// bulkDeploy — integration with mock API (via apiOverride)
// ————————————————————————————————————————

function makeMockApi({ workspaceSid = 'WS001' } = {}) {
  const createdQueues = [];
  const createdWorkflows = [];
  const createdFlows = [];
  const createdTemplates = [];

  return {
    api: {
      taskrouter: {
        v1: {
          workspaces: Object.assign(
            () => ({
              taskQueues: {
                create: async (payload) => {
                  const sid = `WQ${String(createdQueues.length + 1).padStart(32, '0')}`;
                  const item = { sid, ...payload };
                  createdQueues.push(item);
                  return item;
                },
              },
              workflows: {
                create: async (payload) => {
                  const sid = `WW${String(createdWorkflows.length + 1).padStart(32, '0')}`;
                  const item = { sid, ...payload };
                  createdWorkflows.push(item);
                  return item;
                },
              },
            }),
            {
              list: async () => [{ sid: workspaceSid }],
            },
          ),
        },
      },
      studio: {
        v2: {
          flows: {
            create: async (payload) => {
              const sid = `FW${String(createdFlows.length + 1).padStart(32, '0')}`;
              const item = { sid, ...payload };
              createdFlows.push(item);
              return item;
            },
          },
        },
      },
      content: {
        v1: {
          contents: {
            create: async (payload) => {
              const sid = `HX${String(createdTemplates.length + 1).padStart(32, '0')}`;
              const item = { sid, ...payload };
              createdTemplates.push(item);
              return item;
            },
          },
        },
      },
    },
    createdQueues,
    createdWorkflows,
    createdFlows,
    createdTemplates,
  };
}

test('bulkDeploy creates task queues and auto-registers vars', async () => {
  const mock = makeMockApi();
  const resources = [
    { type: 'taskQueues', friendlyName: 'Ativo', targetWorkers: '1==1' },
    { type: 'taskQueues', friendlyName: 'Padrão', targetWorkers: 'skills HAS "default"' },
  ];

  const { results, vars } = await bulkDeploy({}, resources, {}, null, mock.api);

  expect(results).toHaveLength(2);
  expect(results[0].status).toBe('created');
  expect(results[1].status).toBe('created');
  expect(vars.TASKQUEUE_ATIVO).toBe(results[0].sid);
  expect(vars.TASKQUEUE_PADRAO).toBe(results[1].sid);
  expect(mock.createdQueues).toHaveLength(2);
});

test('bulkDeploy replaces placeholders in workflows using auto-vars from queues', async () => {
  const mock = makeMockApi();
  const resources = [
    { type: 'taskQueues', friendlyName: 'Ativo' },
    {
      type: 'workflows',
      friendlyName: 'Main',
      configuration: {
        task_routing: {
          default_filter: { queue: '%REPLACE_TASKQUEUE_ATIVO%' },
        },
      },
    },
  ];

  const { results } = await bulkDeploy({}, resources, {}, null, mock.api);

  expect(results).toHaveLength(2);
  expect(results[0].status).toBe('created');
  expect(results[1].status).toBe('created');

  const wfConfig = JSON.parse(mock.createdWorkflows[0].configuration);
  expect(wfConfig.task_routing.default_filter.queue).toBe(results[0].sid);
});

test('bulkDeploy reports error for unresolved placeholders', async () => {
  const mock = makeMockApi();
  const resources = [
    {
      type: 'workflows',
      friendlyName: 'Broken',
      configuration: { queue: '%REPLACE_TASKQUEUE_MISSING%' },
    },
  ];

  const { results } = await bulkDeploy({}, resources, {}, null, mock.api);

  expect(results).toHaveLength(1);
  expect(results[0].status).toBe('error');
  expect(results[0].error).toContain('%REPLACE_TASKQUEUE_MISSING%');
});

test('bulkDeploy uses initial vars for replacement', async () => {
  const mock = makeMockApi();
  const resources = [
    {
      type: 'workflows',
      friendlyName: 'WithVar',
      configuration: { queue: '%REPLACE_TASKQUEUE_ATIVO%' },
    },
  ];

  const { results } = await bulkDeploy({}, resources, { TASKQUEUE_ATIVO: 'WQmanual123' }, null, mock.api);

  expect(results).toHaveLength(1);
  expect(results[0].status).toBe('created');

  const wfConfig = JSON.parse(mock.createdWorkflows[0].configuration);
  expect(wfConfig.queue).toBe('WQmanual123');
});

test('bulkDeploy sorts resources by type order', async () => {
  const mock = makeMockApi();
  const resources = [
    { type: 'workflows', friendlyName: 'WF', configuration: {} },
    { type: 'taskQueues', friendlyName: 'TQ' },
  ];

  const { results } = await bulkDeploy({}, resources, {}, null, mock.api);

  expect(results[0].type).toBe('taskQueues');
  expect(results[1].type).toBe('workflows');
});

test('bulkDeploy creates studio flows', async () => {
  const mock = makeMockApi();
  const resources = [
    {
      type: 'studioFlows',
      friendlyName: 'My Flow',
      definition: { states: [] },
      status: 'draft',
    },
  ];

  const { results, vars } = await bulkDeploy({}, resources, {}, null, mock.api);

  expect(results).toHaveLength(1);
  expect(results[0].status).toBe('created');
  expect(vars.STUDIOFLOW_MY_FLOW).toBe(results[0].sid);
});

test('bulkDeploy creates content templates', async () => {
  const mock = makeMockApi();
  const resources = [
    {
      type: 'contentTemplates',
      friendlyName: 'Welcome',
      types: { 'twilio/text': { body: 'Hello' } },
      language: 'en',
    },
  ];

  const { results, vars } = await bulkDeploy({}, resources, {}, null, mock.api);

  expect(results).toHaveLength(1);
  expect(results[0].status).toBe('created');
  expect(vars.CONTENTTEMPLATE_WELCOME).toBe(results[0].sid);
});

test('bulkDeploy handles API errors gracefully', async () => {
  const mock = makeMockApi();
  mock.api.taskrouter.v1.workspaces = Object.assign(
    () => ({
      taskQueues: {
        create: async () => {
          throw new Error('API limit exceeded');
        },
      },
      workflows: {
        create: async () => {
          throw new Error('API limit exceeded');
        },
      },
    }),
    {
      list: async () => [{ sid: 'WS001' }],
    },
  );

  const resources = [{ type: 'taskQueues', friendlyName: 'Fail' }];
  const { results } = await bulkDeploy({}, resources, {}, null, mock.api);

  expect(results).toHaveLength(1);
  expect(results[0].status).toBe('error');
  expect(results[0].error).toBe('API limit exceeded');
});

test('bulkDeploy calls onProgress callback for each resource', async () => {
  const mock = makeMockApi();
  const progress = [];
  const resources = [
    { type: 'taskQueues', friendlyName: 'Q1' },
    { type: 'taskQueues', friendlyName: 'Q2' },
  ];

  await bulkDeploy({}, resources, {}, (entry) => progress.push(entry), mock.api);

  expect(progress).toHaveLength(2);
  expect(progress[0].friendlyName).toBe('Q1');
  expect(progress[1].friendlyName).toBe('Q2');
});
