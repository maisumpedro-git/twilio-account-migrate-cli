// __tests__/twilio/writers.test.js
import { jest } from '@jest/globals';

jest.unstable_mockModule('../../src/twilio/clients.js', () => ({
  createClient: jest.fn(),
}));

const { executeOperation } = await import('../../src/twilio/writers.js');
const { createClient } = await import('../../src/twilio/clients.js');

describe('executeOperation', () => {
  let mockApi;

  beforeEach(() => {
    jest.clearAllMocks();
    mockApi = {
      taskrouter: {
        v1: {
          workspaces: jest.fn(() => ({
            taskQueues: {
              create: jest.fn().mockResolvedValue({ sid: 'WQ_NEW', friendlyName: 'New Q' }),
              list: jest.fn().mockResolvedValue([{ sid: 'WQ1', friendlyName: 'Q1' }]),
            },
          })),
        },
      },
    };
    mockApi.taskrouter.v1.workspaces.list = jest.fn().mockResolvedValue([{ sid: 'WS1' }]);
  });

  test('create taskQueues returns new SID', async () => {
    const op = {
      action: 'create',
      type: 'taskQueues',
      data: { friendlyName: 'New Q', targetWorkers: '1==1' },
    };
    const result = await executeOperation(mockApi, op, 'WS1');
    expect(result.sid).toBe('WQ_NEW');
    expect(result.friendlyName).toBe('New Q');
  });

  test('throws on unsupported action', async () => {
    const op = { action: 'invalid', type: 'taskQueues', data: {} };
    await expect(executeOperation(mockApi, op, 'WS1')).rejects.toThrow('invalid');
  });
});
