import { describe, expect, jest, test } from '@jest/globals';

// Mock fs-extra
const mockEnsureDir = jest.fn();
const mockWriteJson = jest.fn();
const mockPathExists = jest.fn();
const mockReadJson = jest.fn();

jest.unstable_mockModule('fs-extra', () => ({
  default: {
    ensureDir: mockEnsureDir,
    writeJson: mockWriteJson,
    pathExists: mockPathExists,
    readJson: mockReadJson,
  },
}));

const { diffEnvCommand } = await import('../../src/commands/diff-env.js');

describe('diffEnvCommand — @ref replacement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('replaces source SIDs with @ref and detects real content differences', async () => {
    // Source has a workflow with a DIFFERENT timeout (real content difference)
    // AND references a taskQueue SID from the source account
    const sourceTaskQueues = {
      fetchedAt: '2026-02-28T00:00:00.000Z',
      resources: [{ sid: 'WQ_SOURCE_111', friendlyName: 'Support', targetWorkers: '1==1' }],
    };
    const sourceWorkflows = {
      fetchedAt: '2026-02-28T00:00:00.000Z',
      resources: [
        {
          sid: 'WW_SOURCE_111',
          friendlyName: 'Main',
          taskReservationTimeout: 300,
          configuration: {
            task_routing: { default_filter: { queue: 'WQ_SOURCE_111' } },
          },
        },
      ],
    };

    // Target has different timeout (real change) and different SID (env-specific)
    const targetTaskQueues = {
      fetchedAt: '2026-02-28T00:00:00.000Z',
      resources: [{ sid: 'WQ_TARGET_999', friendlyName: 'Support', targetWorkers: '1==1' }],
    };
    const targetWorkflows = {
      fetchedAt: '2026-02-28T00:00:00.000Z',
      resources: [
        {
          sid: 'WW_TARGET_999',
          friendlyName: 'Main',
          taskReservationTimeout: 120,
          configuration: {
            task_routing: { default_filter: { queue: 'WQ_TARGET_999' } },
          },
        },
      ],
    };

    mockPathExists.mockImplementation(async (filePath) => {
      const relevantFiles = [
        'taskQueues.json',
        'taskChannels.json',
        'workflows.json',
        'workspace.json',
        'studioFlows.json',
        'contentTemplates.json',
        'serverless.json',
      ];
      return relevantFiles.some((f) => filePath.endsWith(f));
    });

    mockReadJson.mockImplementation(async (filePath) => {
      if (filePath.includes('source') && filePath.endsWith('taskQueues.json'))
        return sourceTaskQueues;
      if (filePath.includes('source') && filePath.endsWith('workflows.json'))
        return sourceWorkflows;
      if (filePath.includes('target') && filePath.endsWith('taskQueues.json'))
        return targetTaskQueues;
      if (filePath.includes('target') && filePath.endsWith('workflows.json'))
        return targetWorkflows;
      if (filePath.endsWith('serverless.json')) return { fetchedAt: null, resources: [] };
      return { fetchedAt: null, resources: [] };
    });

    mockEnsureDir.mockResolvedValue();
    mockWriteJson.mockResolvedValue();

    await diffEnvCommand({
      source: './env/source',
      target: './env/target',
      resources: 'taskQueues,workflows',
    });

    // Migration should be generated for the timeout difference
    expect(mockWriteJson).toHaveBeenCalled();

    const [, migration] = mockWriteJson.mock.calls[0];

    const workflowOp = migration.operations.find(
      (op) => op.type === 'workflows' && op.action === 'update',
    );

    expect(workflowOp).toBeDefined();
    // Should have real content change (timeout) but NOT the SID difference
    expect(workflowOp.data.taskReservationTimeout).toBe(300);

    // No source SIDs should leak into any operation
    for (const op of migration.operations) {
      const opStr = JSON.stringify(op);
      expect(opStr).not.toContain('WQ_SOURCE_111');
      expect(opStr).not.toContain('WW_SOURCE_111');
    }
  });

  test('replaces SIDs inside widgetOps using full source state (not just filtered types)', async () => {
    // Source: studioFlow with a widget referencing a taskQueue SID
    const sourceTaskQueues = {
      fetchedAt: '2026-02-28T00:00:00.000Z',
      resources: [{ sid: 'WQ_SRC_111', friendlyName: 'Support', targetWorkers: '1==1' }],
    };
    const sourceStudioFlows = {
      fetchedAt: '2026-02-28T00:00:00.000Z',
      resources: [
        {
          sid: 'FW_SRC_111',
          friendlyName: 'Main IVR',
          definition: {
            description: 'Main IVR',
            initial_state: 'Trigger',
            states: {
              Trigger: { name: 'Trigger', type: 'trigger', transitions: [] },
              enqueue: {
                name: 'enqueue',
                type: 'enqueue-call',
                properties: { queue_sid: 'WQ_SRC_111' },
                transitions: [],
              },
            },
          },
        },
      ],
    };

    // Target: same flow with different SID for enqueue widget
    const targetStudioFlows = {
      fetchedAt: '2026-02-28T00:00:00.000Z',
      resources: [
        {
          sid: 'FW_TGT_999',
          friendlyName: 'Main IVR',
          definition: {
            description: 'Main IVR',
            initial_state: 'Trigger',
            states: {
              Trigger: { name: 'Trigger', type: 'trigger', transitions: [] },
              enqueue: {
                name: 'enqueue',
                type: 'enqueue-call',
                properties: { queue_sid: 'WQ_TGT_999' },
                transitions: [],
              },
            },
          },
        },
      ],
    };

    mockPathExists.mockImplementation(async (filePath) => {
      const relevantFiles = [
        'taskQueues.json',
        'taskChannels.json',
        'workflows.json',
        'workspace.json',
        'studioFlows.json',
        'contentTemplates.json',
        'serverless.json',
      ];
      return relevantFiles.some((f) => filePath.endsWith(f));
    });

    mockReadJson.mockImplementation(async (filePath) => {
      if (filePath.includes('source') && filePath.endsWith('taskQueues.json'))
        return sourceTaskQueues;
      if (filePath.includes('source') && filePath.endsWith('studioFlows.json'))
        return sourceStudioFlows;
      if (filePath.includes('target') && filePath.endsWith('studioFlows.json'))
        return targetStudioFlows;
      if (filePath.endsWith('serverless.json')) return { fetchedAt: null, resources: [] };
      return { fetchedAt: null, resources: [] };
    });

    mockEnsureDir.mockResolvedValue();
    mockWriteJson.mockResolvedValue();

    // Only requesting studioFlows diff — but widget contains taskQueue SID
    await diffEnvCommand({
      source: './env/source',
      target: './env/target',
      resources: 'studioFlows',
    });

    expect(mockWriteJson).toHaveBeenCalled();

    const [, migration] = mockWriteJson.mock.calls[0];
    const flowOp = migration.operations.find(
      (op) => op.type === 'studioFlows' && (op.widgetOps || op.data),
    );

    // The key assertion: no source SID should appear, even when taskQueues was not in --resources
    const opStr = JSON.stringify(flowOp);
    expect(opStr).not.toContain('WQ_SRC_111');
    expect(opStr).toContain('@ref:taskQueues:Support');
  });

  test('replaces serverless URLs with @ref in source data', async () => {
    const sourceServerless = {
      fetchedAt: '2026-02-28T00:00:00.000Z',
      resources: [
        {
          sid: 'ZS_SRC_111',
          uniqueName: 'my-service',
          environments: [
            { sid: 'ZE_SRC_222', uniqueName: 'production', domainName: 'my-service-1234.twil.io' },
          ],
          functions: [{ sid: 'ZH_SRC_333', friendlyName: 'handler', path: '/handler' }],
        },
      ],
    };

    const sourceWorkflows = {
      fetchedAt: '2026-02-28T00:00:00.000Z',
      resources: [
        {
          sid: 'WW_SRC_111',
          friendlyName: 'Main',
          configuration: {
            webhook: 'https://my-service-1234.twil.io/handler',
          },
        },
      ],
    };

    const targetWorkflows = {
      fetchedAt: '2026-02-28T00:00:00.000Z',
      resources: [
        {
          sid: 'WW_TGT_999',
          friendlyName: 'Main',
          configuration: {
            webhook: 'https://my-service-9999.twil.io/handler',
          },
        },
      ],
    };

    mockPathExists.mockImplementation(async (filePath) => {
      if (filePath.includes('source') && filePath.endsWith('workflows.json')) return true;
      if (filePath.includes('source') && filePath.endsWith('serverless.json')) return true;
      if (filePath.includes('target') && filePath.endsWith('workflows.json')) return true;
      if (filePath.includes('target') && filePath.endsWith('serverless.json')) return true;
      return false;
    });

    mockReadJson.mockImplementation(async (filePath) => {
      if (filePath.includes('source') && filePath.endsWith('workflows.json'))
        return sourceWorkflows;
      if (filePath.includes('source') && filePath.endsWith('serverless.json'))
        return sourceServerless;
      if (filePath.includes('target') && filePath.endsWith('workflows.json'))
        return targetWorkflows;
      if (filePath.includes('target') && filePath.endsWith('serverless.json'))
        return { fetchedAt: null, resources: [] };
      return { fetchedAt: null, resources: [] };
    });

    mockEnsureDir.mockResolvedValue();
    mockWriteJson.mockResolvedValue();

    await diffEnvCommand({
      source: './env/source',
      target: './env/target',
      resources: 'workflows',
    });

    expect(mockWriteJson).toHaveBeenCalled();

    const [, migration] = mockWriteJson.mock.calls[0];
    const workflowOp = migration.operations.find(
      (op) => op.type === 'workflows' && op.action === 'update',
    );

    if (workflowOp) {
      const configStr = JSON.stringify(workflowOp.data);
      expect(configStr).not.toContain('https://my-service-1234.twil.io');
      expect(configStr).toContain('@ref:serverlessUrl:my-service:production:/handler');
    }
  });

  test('does not generate widgetOps when widgets are identical except for env-specific SIDs/URLs', async () => {
    // Source: studioFlow with widgets referencing source-env SIDs and URLs
    const sourceTaskQueues = {
      fetchedAt: '2026-02-28T00:00:00.000Z',
      resources: [{ sid: 'WQ_SRC_111', friendlyName: 'Support', targetWorkers: '1==1' }],
    };
    const sourceServerless = {
      fetchedAt: '2026-02-28T00:00:00.000Z',
      resources: [
        {
          sid: 'ZS_SRC',
          uniqueName: 'my-service',
          environments: [
            { sid: 'ZE_SRC', uniqueName: 'production', domainName: 'my-service-src.twil.io' },
          ],
          functions: [{ sid: 'ZH_SRC', friendlyName: 'handler', path: '/handler' }],
          assets: [{ sid: 'ZN_SRC', friendlyName: 'greeting', path: '/audio/greeting.mp3' }],
        },
      ],
    };
    const sourceStudioFlows = {
      fetchedAt: '2026-02-28T00:00:00.000Z',
      resources: [
        {
          sid: 'FW_SRC',
          friendlyName: 'Main IVR',
          definition: {
            description: 'Main IVR',
            initial_state: 'Trigger',
            states: {
              Trigger: { name: 'Trigger', type: 'trigger', transitions: [] },
              enqueue: {
                name: 'enqueue',
                type: 'enqueue-call',
                properties: { queue_sid: 'WQ_SRC_111' },
                transitions: [],
              },
              gather: {
                name: 'gather',
                type: 'gather-input-on-call',
                properties: {
                  play_url: 'https://my-service-src.twil.io/audio/greeting.mp3',
                },
                transitions: [],
              },
              say_play: {
                name: 'say_play',
                type: 'say-play',
                properties: {
                  url: 'https://my-service-src.twil.io/handler',
                },
                transitions: [],
              },
            },
          },
        },
      ],
    };

    // Target: SAME flow logically, but with target-env SIDs and URLs
    const targetTaskQueues = {
      fetchedAt: '2026-02-28T00:00:00.000Z',
      resources: [{ sid: 'WQ_TGT_999', friendlyName: 'Support', targetWorkers: '1==1' }],
    };
    const targetServerless = {
      fetchedAt: '2026-02-28T00:00:00.000Z',
      resources: [
        {
          sid: 'ZS_TGT',
          uniqueName: 'my-service',
          environments: [
            { sid: 'ZE_TGT', uniqueName: 'production', domainName: 'my-service-tgt.twil.io' },
          ],
          functions: [{ sid: 'ZH_TGT', friendlyName: 'handler', path: '/handler' }],
          assets: [{ sid: 'ZN_TGT', friendlyName: 'greeting', path: '/audio/greeting.mp3' }],
        },
      ],
    };
    const targetStudioFlows = {
      fetchedAt: '2026-02-28T00:00:00.000Z',
      resources: [
        {
          sid: 'FW_TGT',
          friendlyName: 'Main IVR',
          definition: {
            description: 'Main IVR',
            initial_state: 'Trigger',
            states: {
              Trigger: { name: 'Trigger', type: 'trigger', transitions: [] },
              enqueue: {
                name: 'enqueue',
                type: 'enqueue-call',
                properties: { queue_sid: 'WQ_TGT_999' },
                transitions: [],
              },
              gather: {
                name: 'gather',
                type: 'gather-input-on-call',
                properties: {
                  play_url: 'https://my-service-tgt.twil.io/audio/greeting.mp3',
                },
                transitions: [],
              },
              say_play: {
                name: 'say_play',
                type: 'say-play',
                properties: {
                  url: 'https://my-service-tgt.twil.io/handler',
                },
                transitions: [],
              },
            },
          },
        },
      ],
    };

    mockPathExists.mockImplementation(async (filePath) => {
      const relevantFiles = [
        'taskQueues.json',
        'taskChannels.json',
        'workflows.json',
        'workspace.json',
        'studioFlows.json',
        'contentTemplates.json',
        'serverless.json',
      ];
      return relevantFiles.some((f) => filePath.endsWith(f));
    });

    mockReadJson.mockImplementation(async (filePath) => {
      if (filePath.includes('source') && filePath.endsWith('taskQueues.json'))
        return sourceTaskQueues;
      if (filePath.includes('source') && filePath.endsWith('studioFlows.json'))
        return sourceStudioFlows;
      if (filePath.includes('source') && filePath.endsWith('serverless.json'))
        return sourceServerless;
      if (filePath.includes('target') && filePath.endsWith('taskQueues.json'))
        return targetTaskQueues;
      if (filePath.includes('target') && filePath.endsWith('studioFlows.json'))
        return targetStudioFlows;
      if (filePath.includes('target') && filePath.endsWith('serverless.json'))
        return targetServerless;
      return { fetchedAt: null, resources: [] };
    });

    mockEnsureDir.mockResolvedValue();
    mockWriteJson.mockResolvedValue();

    await diffEnvCommand({
      source: './env/source',
      target: './env/target',
      resources: 'studioFlows',
    });

    // The flows are logically identical — only SIDs/URLs differ.
    // After @ref replacement on BOTH sides, there should be NO differences.
    // So writeJson should NOT be called (no migration generated).
    expect(mockWriteJson).not.toHaveBeenCalled();
  });

  test('replaces run-function widget SIDs and URL with @ref across environments', async () => {
    const sourceServerless = {
      fetchedAt: '2026-02-28T00:00:00.000Z',
      resources: [
        {
          sid: 'ZS_SRC',
          uniqueName: 'my-service',
          environments: [
            { sid: 'ZE_SRC', uniqueName: 'production', domainName: 'my-service-src.twil.io' },
          ],
          functions: [{ sid: 'ZH_SRC', friendlyName: 'handler', path: '/handler' }],
        },
      ],
    };
    const sourceStudioFlows = {
      fetchedAt: '2026-02-28T00:00:00.000Z',
      resources: [
        {
          sid: 'FW_SRC',
          friendlyName: 'Main IVR',
          definition: {
            description: 'Main IVR',
            initial_state: 'Trigger',
            states: {
              Trigger: { name: 'Trigger', type: 'trigger', transitions: [] },
              run_fn: {
                name: 'run_fn',
                type: 'run-function',
                properties: {
                  service_sid: 'ZS_SRC',
                  environment_sid: 'ZE_SRC',
                  function_sid: 'ZH_SRC',
                  url: 'https://my-service-src.twil.io/handler',
                  parameters: [],
                },
                transitions: [],
              },
            },
          },
        },
      ],
    };

    const targetServerless = {
      fetchedAt: '2026-02-28T00:00:00.000Z',
      resources: [
        {
          sid: 'ZS_TGT',
          uniqueName: 'my-service',
          environments: [
            { sid: 'ZE_TGT', uniqueName: 'production', domainName: 'my-service-tgt.twil.io' },
          ],
          functions: [{ sid: 'ZH_TGT', friendlyName: 'handler', path: '/handler' }],
        },
      ],
    };
    const targetStudioFlows = {
      fetchedAt: '2026-02-28T00:00:00.000Z',
      resources: [
        {
          sid: 'FW_TGT',
          friendlyName: 'Main IVR',
          definition: {
            description: 'Main IVR',
            initial_state: 'Trigger',
            states: {
              Trigger: { name: 'Trigger', type: 'trigger', transitions: [] },
              run_fn: {
                name: 'run_fn',
                type: 'run-function',
                properties: {
                  service_sid: 'ZS_TGT',
                  environment_sid: 'ZE_TGT',
                  function_sid: 'ZH_TGT',
                  url: 'https://my-service-tgt.twil.io/handler',
                  parameters: [],
                },
                transitions: [],
              },
            },
          },
        },
      ],
    };

    mockPathExists.mockImplementation(async (filePath) => {
      const relevantFiles = [
        'taskQueues.json',
        'taskChannels.json',
        'workflows.json',
        'workspace.json',
        'studioFlows.json',
        'contentTemplates.json',
        'serverless.json',
      ];
      return relevantFiles.some((f) => filePath.endsWith(f));
    });

    mockReadJson.mockImplementation(async (filePath) => {
      if (filePath.includes('source') && filePath.endsWith('studioFlows.json'))
        return sourceStudioFlows;
      if (filePath.includes('source') && filePath.endsWith('serverless.json'))
        return sourceServerless;
      if (filePath.includes('target') && filePath.endsWith('studioFlows.json'))
        return targetStudioFlows;
      if (filePath.includes('target') && filePath.endsWith('serverless.json'))
        return targetServerless;
      return { fetchedAt: null, resources: [] };
    });

    mockEnsureDir.mockResolvedValue();
    mockWriteJson.mockResolvedValue();

    await diffEnvCommand({
      source: './env/source',
      target: './env/target',
      resources: 'studioFlows',
    });

    // Flows are logically identical — only env-specific SIDs/URLs differ.
    // After @ref replacement on BOTH sides, there should be NO differences.
    expect(mockWriteJson).not.toHaveBeenCalled();
  });

  test('replaces assignmentCallbackUrl serverless URL with @ref (no false diff)', async () => {
    // Source: workflow with assignmentCallbackUrl pointing to source serverless domain
    const sourceServerless = {
      fetchedAt: '2026-02-28T00:00:00.000Z',
      resources: [
        {
          sid: 'ZS_SRC',
          uniqueName: 'my-service',
          environments: [
            { sid: 'ZE_SRC', uniqueName: 'production', domainName: 'my-service-src.twil.io' },
          ],
          functions: [{ sid: 'ZH_SRC', friendlyName: 'callback', path: '/callback' }],
        },
      ],
    };
    const sourceWorkflows = {
      fetchedAt: '2026-02-28T00:00:00.000Z',
      resources: [
        {
          sid: 'WW_SRC',
          friendlyName: 'Main',
          taskReservationTimeout: 120,
          assignmentCallbackUrl: 'https://my-service-src.twil.io/callback',
          configuration: { task_routing: { filters: [] } },
        },
      ],
    };

    // Target: SAME workflow logically, but with target serverless domain
    const targetServerless = {
      fetchedAt: '2026-02-28T00:00:00.000Z',
      resources: [
        {
          sid: 'ZS_TGT',
          uniqueName: 'my-service',
          environments: [
            { sid: 'ZE_TGT', uniqueName: 'production', domainName: 'my-service-tgt.twil.io' },
          ],
          functions: [{ sid: 'ZH_TGT', friendlyName: 'callback', path: '/callback' }],
        },
      ],
    };
    const targetWorkflows = {
      fetchedAt: '2026-02-28T00:00:00.000Z',
      resources: [
        {
          sid: 'WW_TGT',
          friendlyName: 'Main',
          taskReservationTimeout: 120,
          assignmentCallbackUrl: 'https://my-service-tgt.twil.io/callback',
          configuration: { task_routing: { filters: [] } },
        },
      ],
    };

    mockPathExists.mockImplementation(async (filePath) => {
      const relevantFiles = [
        'taskQueues.json',
        'taskChannels.json',
        'workflows.json',
        'workspace.json',
        'studioFlows.json',
        'contentTemplates.json',
        'serverless.json',
      ];
      return relevantFiles.some((f) => filePath.endsWith(f));
    });

    mockReadJson.mockImplementation(async (filePath) => {
      if (filePath.includes('source') && filePath.endsWith('workflows.json'))
        return sourceWorkflows;
      if (filePath.includes('source') && filePath.endsWith('serverless.json'))
        return sourceServerless;
      if (filePath.includes('target') && filePath.endsWith('workflows.json'))
        return targetWorkflows;
      if (filePath.includes('target') && filePath.endsWith('serverless.json'))
        return targetServerless;
      return { fetchedAt: null, resources: [] };
    });

    mockEnsureDir.mockResolvedValue();
    mockWriteJson.mockResolvedValue();

    await diffEnvCommand({
      source: './env/source',
      target: './env/target',
      resources: 'workflows',
    });

    // Workflows are logically identical — assignmentCallbackUrl differs only by env domain.
    // After @ref replacement on both sides, no diff should be detected.
    expect(mockWriteJson).not.toHaveBeenCalled();
  });

  test('assignmentCallbackUrl with real path difference generates migration with @ref', async () => {
    // Source: workflow with assignmentCallbackUrl pointing to /new-callback
    const sourceServerless = {
      fetchedAt: '2026-02-28T00:00:00.000Z',
      resources: [
        {
          sid: 'ZS_SRC',
          uniqueName: 'my-service',
          environments: [
            { sid: 'ZE_SRC', uniqueName: 'production', domainName: 'my-service-src.twil.io' },
          ],
          functions: [
            { sid: 'ZH_SRC_1', friendlyName: 'old-callback', path: '/old-callback' },
            { sid: 'ZH_SRC_2', friendlyName: 'new-callback', path: '/new-callback' },
          ],
        },
      ],
    };
    const sourceWorkflows = {
      fetchedAt: '2026-02-28T00:00:00.000Z',
      resources: [
        {
          sid: 'WW_SRC',
          friendlyName: 'Main',
          taskReservationTimeout: 120,
          assignmentCallbackUrl: 'https://my-service-src.twil.io/new-callback',
          configuration: { task_routing: { filters: [] } },
        },
      ],
    };

    // Target: workflow with assignmentCallbackUrl pointing to /old-callback (different path = real change)
    const targetServerless = {
      fetchedAt: '2026-02-28T00:00:00.000Z',
      resources: [
        {
          sid: 'ZS_TGT',
          uniqueName: 'my-service',
          environments: [
            { sid: 'ZE_TGT', uniqueName: 'production', domainName: 'my-service-tgt.twil.io' },
          ],
          functions: [
            { sid: 'ZH_TGT_1', friendlyName: 'old-callback', path: '/old-callback' },
            { sid: 'ZH_TGT_2', friendlyName: 'new-callback', path: '/new-callback' },
          ],
        },
      ],
    };
    const targetWorkflows = {
      fetchedAt: '2026-02-28T00:00:00.000Z',
      resources: [
        {
          sid: 'WW_TGT',
          friendlyName: 'Main',
          taskReservationTimeout: 120,
          assignmentCallbackUrl: 'https://my-service-tgt.twil.io/old-callback',
          configuration: { task_routing: { filters: [] } },
        },
      ],
    };

    mockPathExists.mockImplementation(async (filePath) => {
      const relevantFiles = [
        'taskQueues.json',
        'taskChannels.json',
        'workflows.json',
        'workspace.json',
        'studioFlows.json',
        'contentTemplates.json',
        'serverless.json',
      ];
      return relevantFiles.some((f) => filePath.endsWith(f));
    });

    mockReadJson.mockImplementation(async (filePath) => {
      if (filePath.includes('source') && filePath.endsWith('workflows.json'))
        return sourceWorkflows;
      if (filePath.includes('source') && filePath.endsWith('serverless.json'))
        return sourceServerless;
      if (filePath.includes('target') && filePath.endsWith('workflows.json'))
        return targetWorkflows;
      if (filePath.includes('target') && filePath.endsWith('serverless.json'))
        return targetServerless;
      return { fetchedAt: null, resources: [] };
    });

    mockEnsureDir.mockResolvedValue();
    mockWriteJson.mockResolvedValue();

    await diffEnvCommand({
      source: './env/source',
      target: './env/target',
      resources: 'workflows',
    });

    // Different function paths = real content difference → migration should be generated
    expect(mockWriteJson).toHaveBeenCalled();

    const [, migration] = mockWriteJson.mock.calls[0];
    const workflowOp = migration.operations.find(
      (op) => op.type === 'workflows' && op.action === 'update',
    );

    expect(workflowOp).toBeDefined();
    // assignmentCallbackUrl should contain @ref, not raw URL
    expect(workflowOp.data.assignmentCallbackUrl).toBe(
      '@ref:serverlessUrl:my-service:production:/new-callback@@',
    );
    // No raw source URLs should leak
    const opStr = JSON.stringify(workflowOp);
    expect(opStr).not.toContain('https://my-service-src.twil.io');
  });
});
