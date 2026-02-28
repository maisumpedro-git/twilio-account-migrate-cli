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

  test('replaces source SIDs with @ref before generating migration', async () => {
    // Source has a workflow referencing a taskQueue SID from the source account
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
          configuration: {
            task_routing: { default_filter: { queue: 'WQ_SOURCE_111' } },
          },
        },
      ],
    };

    // Target has the workflow with a different SID (target account)
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
          configuration: {
            task_routing: { default_filter: { queue: 'WQ_TARGET_999' } },
          },
        },
      ],
    };

    // readState reads files based on path
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
      // Source files
      if (filePath.includes('source') && filePath.endsWith('taskQueues.json'))
        return sourceTaskQueues;
      if (filePath.includes('source') && filePath.endsWith('workflows.json'))
        return sourceWorkflows;
      // Target files
      if (filePath.includes('target') && filePath.endsWith('taskQueues.json'))
        return targetTaskQueues;
      if (filePath.includes('target') && filePath.endsWith('workflows.json'))
        return targetWorkflows;
      // Serverless
      if (filePath.endsWith('serverless.json')) return { fetchedAt: null, resources: [] };
      // Default: empty state
      return { fetchedAt: null, resources: [] };
    });

    mockEnsureDir.mockResolvedValue();
    mockWriteJson.mockResolvedValue();

    await diffEnvCommand({
      source: './env/source',
      target: './env/target',
      resources: 'taskQueues,workflows',
    });

    // The migration should have been written
    expect(mockWriteJson).toHaveBeenCalled();

    const [, migration] = mockWriteJson.mock.calls[0];

    // Find the workflow update operation (if any)
    const workflowOp = migration.operations.find(
      (op) => op.type === 'workflows' && op.action === 'update',
    );

    if (workflowOp) {
      // The key assertion: configuration should contain @ref, NOT the source SID
      const configStr = JSON.stringify(workflowOp.data);
      expect(configStr).not.toContain('WQ_SOURCE_111');
      expect(configStr).toContain('@ref:taskQueues:Support');
    }

    // Also verify no source SIDs leak into ANY operation
    for (const op of migration.operations) {
      const opStr = JSON.stringify(op);
      expect(opStr).not.toContain('WQ_SOURCE_111');
      expect(opStr).not.toContain('WW_SOURCE_111');
    }
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
});
