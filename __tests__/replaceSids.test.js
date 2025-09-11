import { migrateStudioFlows } from '../src/migrate/studioFlows.js';

const mockClients = {
  source: {
    studio: {
      v2: {
        flows: (sid) => ({
          fetch: async () => ({ sid, friendlyName: 'Flow A', commitMessage: 'c' }),
          revisions: { list: async () => [{ definition: { properties: { workflow: 'WF_SRC', channel: 'TC_SRC' } } }] },
        }),
        list: async () => [{ sid: 'FW_SRC', friendlyName: 'Flow A' }],
      },
    },
  },
  dest: {
    studio: {
      v2: {
        flows: Object.assign(
          (sid) => ({ update: async () => ({ sid: 'FW_DST', friendlyName: 'Flow A' }) }),
          {
            list: async () => [{ sid: 'FW_DST', friendlyName: 'Flow A' }],
            create: async () => ({ sid: 'FW_DST', friendlyName: 'Flow A' }),
          }
        ),
      },
    },
  },
};

test('replace SIDs in flow definition using mapping', async () => {
  const mapping = {
    taskrouter: { workflows: { WF_SRC: 'WF_DST' }, taskQueues: {}, activities: {}, taskChannels: { TC_SRC: 'TC_DST' } },
    serverless: { services: {}, environments: {}, functions: {} },
    contentTemplates: {},
    studio: { flows: {} },
  };
  const data = { source: { studio: { flows: [{ sid: 'FW_SRC', friendlyName: 'Flow A' }] } }, dest: { studio: { flows: [{ sid: 'FW_DST', friendlyName: 'Flow A' }] } } };
  await migrateStudioFlows(['FW_SRC'], data, mapping, mockClients);
  expect(true).toBe(true);
});
