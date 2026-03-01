// __tests__/twilio/fetchers.test.js
import { jest } from '@jest/globals';

jest.unstable_mockModule('../../src/twilio/clients.js', () => ({
  createClient: jest.fn(),
}));

const { fetchResource, fetchAllResources, fetchServerlessServices, RESOURCE_TYPES } = await import(
  '../../src/twilio/fetchers.js'
);
const { createClient } = await import('../../src/twilio/clients.js');

function buildMockApi({
  workspaces = [],
  taskQueues = [],
  taskChannels = [],
  workflows = [],
  studioFlows = [],
  contentTemplates = [],
} = {}) {
  const workspaceFn = jest.fn((wsSid) => ({
    taskQueues: { list: jest.fn().mockResolvedValue(taskQueues) },
    taskChannels: { list: jest.fn().mockResolvedValue(taskChannels) },
    workflows: { list: jest.fn().mockResolvedValue(workflows) },
  }));
  workspaceFn.list = jest.fn().mockResolvedValue(workspaces);

  const flowFetchMap = {};
  for (const f of studioFlows) {
    flowFetchMap[f.sid] = { definition: f.definition || null };
  }
  const flowsFn = jest.fn((sid) => ({
    fetch: jest.fn().mockResolvedValue(flowFetchMap[sid] || { definition: null }),
  }));
  flowsFn.list = jest.fn().mockResolvedValue(studioFlows);

  return {
    taskrouter: { v1: { workspaces: workspaceFn } },
    studio: { v2: { flows: flowsFn } },
    content: { v1: { contents: { list: jest.fn().mockResolvedValue(contentTemplates) } } },
  };
}

describe('RESOURCE_TYPES', () => {
  test('contains all expected types', () => {
    expect(RESOURCE_TYPES).toEqual([
      'workspace',
      'taskQueues',
      'taskChannels',
      'workflows',
      'studioFlows',
      'contentTemplates',
    ]);
  });

  test('is an array of strings', () => {
    expect(Array.isArray(RESOURCE_TYPES)).toBe(true);
    RESOURCE_TYPES.forEach((t) => expect(typeof t).toBe('string'));
  });
});

describe('fetchResource', () => {
  const account = { accountSid: 'AC1', apiKeySid: 'SK1', apiKeySecret: 'secret' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('fetches workspace', async () => {
    const mockApi = buildMockApi({
      workspaces: [{ sid: 'WS1', friendlyName: 'My Workspace' }],
    });
    createClient.mockReturnValue(mockApi);

    const result = await fetchResource(account, 'workspace');
    expect(result).toEqual({ sid: 'WS1', friendlyName: 'My Workspace' });
  });

  test('returns null when no workspace exists', async () => {
    const mockApi = buildMockApi({ workspaces: [] });
    createClient.mockReturnValue(mockApi);

    const result = await fetchResource(account, 'workspace');
    expect(result).toBeNull();
  });

  test('fetches taskQueues via workspace', async () => {
    const mockApi = buildMockApi({
      workspaces: [{ sid: 'WS1', friendlyName: 'My Workspace' }],
      taskQueues: [
        {
          sid: 'WQ1',
          friendlyName: 'Queue A',
          targetWorkers: '1==1',
          maxReservedWorkers: 5,
          taskOrder: 'FIFO',
        },
      ],
    });
    createClient.mockReturnValue(mockApi);

    const result = await fetchResource(account, 'taskQueues');
    expect(result).toHaveLength(1);
    expect(result[0].friendlyName).toBe('Queue A');
    expect(result[0].sid).toBe('WQ1');
  });

  test('returns empty array for taskQueues when no workspace', async () => {
    const mockApi = buildMockApi({ workspaces: [] });
    createClient.mockReturnValue(mockApi);

    const result = await fetchResource(account, 'taskQueues');
    expect(result).toEqual([]);
  });

  test('fetches taskChannels via workspace', async () => {
    const mockApi = buildMockApi({
      workspaces: [{ sid: 'WS1', friendlyName: 'My Workspace' }],
      taskChannels: [{ sid: 'TC1', friendlyName: 'Voice', uniqueName: 'voice' }],
    });
    createClient.mockReturnValue(mockApi);

    const result = await fetchResource(account, 'taskChannels');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ sid: 'TC1', friendlyName: 'Voice', uniqueName: 'voice' });
  });

  test('fetches workflows via workspace', async () => {
    const mockApi = buildMockApi({
      workspaces: [{ sid: 'WS1', friendlyName: 'My Workspace' }],
      workflows: [
        {
          sid: 'WW1',
          friendlyName: 'Default',
          configuration: '{"task_routing":{}}',
          taskReservationTimeout: 120,
          assignmentCallbackUrl: 'https://example.com',
        },
      ],
    });
    createClient.mockReturnValue(mockApi);

    const result = await fetchResource(account, 'workflows');
    expect(result).toHaveLength(1);
    expect(result[0].friendlyName).toBe('Default');
    expect(result[0].configuration).toEqual({ task_routing: {} });
  });

  test('fetches studioFlows', async () => {
    const mockApi = buildMockApi({
      studioFlows: [
        {
          sid: 'FW1',
          friendlyName: 'Main Flow',
          status: 'published',
          commitMessage: 'v1',
          definition: { states: [] },
        },
      ],
    });
    createClient.mockReturnValue(mockApi);

    const result = await fetchResource(account, 'studioFlows');
    expect(result).toHaveLength(1);
    expect(result[0].friendlyName).toBe('Main Flow');
    expect(result[0].definition).toEqual({ states: [] });
  });

  test('fetches contentTemplates', async () => {
    const mockApi = buildMockApi({
      contentTemplates: [
        {
          sid: 'HX1',
          friendlyName: 'Welcome',
          uniqueName: 'welcome',
          types: { 'twilio/text': { body: 'Hi' } },
          variables: {},
          language: 'en',
        },
      ],
    });
    createClient.mockReturnValue(mockApi);

    const result = await fetchResource(account, 'contentTemplates');
    expect(result).toHaveLength(1);
    expect(result[0].friendlyName).toBe('Welcome');
    expect(result[0].types).toEqual({ 'twilio/text': { body: 'Hi' } });
  });

  test('throws on unknown resource type', async () => {
    createClient.mockReturnValue({});
    await expect(fetchResource(account, 'unknown')).rejects.toThrow('Tipo de recurso desconhecido');
  });

  test('does not call any cache functions', async () => {
    const mockApi = buildMockApi({
      workspaces: [{ sid: 'WS1', friendlyName: 'My Workspace' }],
    });
    createClient.mockReturnValue(mockApi);

    // This should succeed without any cache dependency
    const result = await fetchResource(account, 'workspace');
    expect(result).toBeTruthy();
  });
});

describe('fetchAllResources', () => {
  const account = { accountSid: 'AC1', apiKeySid: 'SK1', apiKeySecret: 'secret' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('fetches all resource types in parallel', async () => {
    const mockApi = buildMockApi({
      workspaces: [{ sid: 'WS1', friendlyName: 'My Workspace' }],
      taskQueues: [
        {
          sid: 'WQ1',
          friendlyName: 'Queue A',
          targetWorkers: '1==1',
          maxReservedWorkers: 5,
          taskOrder: 'FIFO',
        },
      ],
      taskChannels: [{ sid: 'TC1', friendlyName: 'Voice', uniqueName: 'voice' }],
      workflows: [
        {
          sid: 'WW1',
          friendlyName: 'Default',
          configuration: '{}',
          taskReservationTimeout: 120,
          assignmentCallbackUrl: '',
        },
      ],
      studioFlows: [
        {
          sid: 'FW1',
          friendlyName: 'Main Flow',
          status: 'published',
          commitMessage: 'v1',
          definition: { states: [] },
        },
      ],
      contentTemplates: [
        {
          sid: 'HX1',
          friendlyName: 'Welcome',
          uniqueName: 'welcome',
          types: {},
          variables: {},
          language: 'en',
        },
      ],
    });
    createClient.mockReturnValue(mockApi);

    const result = await fetchAllResources(account);

    expect(result.workspace).toEqual({ sid: 'WS1', friendlyName: 'My Workspace' });
    expect(result.taskQueues).toHaveLength(1);
    expect(result.taskChannels).toHaveLength(1);
    expect(result.workflows).toHaveLength(1);
    expect(result.studioFlows).toHaveLength(1);
    expect(result.contentTemplates).toHaveLength(1);
  });

  test('returns all keys even when workspace is null', async () => {
    const mockApi = buildMockApi({ workspaces: [] });
    createClient.mockReturnValue(mockApi);

    const result = await fetchAllResources(account);

    expect(result.workspace).toBeNull();
    expect(result.taskQueues).toEqual([]);
    expect(result.taskChannels).toEqual([]);
    expect(result.workflows).toEqual([]);
    expect(Object.keys(result)).toEqual(
      expect.arrayContaining([
        'workspace',
        'taskQueues',
        'taskChannels',
        'workflows',
        'studioFlows',
        'contentTemplates',
      ]),
    );
  });
});

describe('fetchServerlessServices', () => {
  test('fetches services with environments and functions', async () => {
    const mockApi = {
      serverless: {
        v1: {
          services: {
            list: jest.fn().mockResolvedValue([
              { sid: 'ZS111', uniqueName: 'my-service', friendlyName: 'My Service' },
            ]),
          },
        },
      },
    };
    const mockServiceContext = {
      environments: {
        list: jest.fn().mockResolvedValue([
          {
            sid: 'ZE222',
            uniqueName: 'production',
            domainName: 'my-service-1234.twil.io',
          },
        ]),
      },
      functions: {
        list: jest.fn().mockResolvedValue([
          {
            sid: 'ZH333',
            friendlyName: 'my-function',
            path: '/my-function',
          },
        ]),
      },
      assets: {
        list: jest.fn().mockResolvedValue([
          {
            sid: 'ZN444',
            friendlyName: 'greeting',
            path: '/audio/greeting.mp3',
          },
        ]),
      },
    };
    mockApi.serverless.v1.services = jest.fn().mockReturnValue(mockServiceContext);
    mockApi.serverless.v1.services.list = jest.fn().mockResolvedValue([
      { sid: 'ZS111', uniqueName: 'my-service', friendlyName: 'My Service' },
    ]);

    const result = await fetchServerlessServices(mockApi);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      sid: 'ZS111',
      uniqueName: 'my-service',
      friendlyName: 'My Service',
      environments: [
        { sid: 'ZE222', uniqueName: 'production', domainName: 'my-service-1234.twil.io' },
      ],
      functions: [{ sid: 'ZH333', friendlyName: 'my-function', path: '/my-function' }],
      assets: [{ sid: 'ZN444', friendlyName: 'greeting', path: '/audio/greeting.mp3' }],
    });
  });

  test('returns empty array when serverless API fails', async () => {
    const mockApi = {
      serverless: {
        v1: {
          services: {
            list: jest.fn().mockRejectedValue(new Error('Not found')),
          },
        },
      },
    };
    const result = await fetchServerlessServices(mockApi);
    expect(result).toEqual([]);
  });
});
