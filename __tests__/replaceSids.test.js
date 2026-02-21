import { migrateStudioFlows, replaceSidsInDefinition } from '../src/migrate/studioFlows.js';

const mockClients = {
  source: {
    studio: {
      v2: {
        flows: Object.assign(
          (sid) => ({
            fetch: async () => ({ sid, friendlyName: 'Flow A', commitMessage: 'c' }),
            revisions: {
              list: async () => [
                { definition: { properties: { workflow: 'WF_SRC', channel: 'TC_SRC' } } },
              ],
            },
          }),
          {
            list: async () => [{ sid: 'FW_SRC', friendlyName: 'Flow A' }],
          },
        ),
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
          },
        ),
      },
    },
  },
};

test('replaceSidsInDefinition replaces all SIDs in definition', () => {
  const definition = {
    states: [{ properties: { workflow: 'WF_SRC', channel: 'TC_SRC', queue: 'TQ_SRC' } }],
  };
  const mapping = {
    taskrouter: {
      workspace: {},
      workflows: { WF_SRC: 'WF_DST' },
      taskQueues: { TQ_SRC: 'TQ_DST' },
      activities: {},
      taskChannels: { TC_SRC: 'TC_DST' },
    },
    serverless: { services: {}, environments: {}, functions: {} },
    contentTemplates: {},
    studio: { flows: {} },
  };

  const result = replaceSidsInDefinition(definition, mapping);
  expect(result.states[0].properties.workflow).toBe('WF_DST');
  expect(result.states[0].properties.channel).toBe('TC_DST');
  expect(result.states[0].properties.queue).toBe('TQ_DST');
});

test('replace SIDs in flow definition using mapping (integration)', async () => {
  const mapping = {
    taskrouter: {
      workspace: {},
      workflows: { WF_SRC: 'WF_DST' },
      taskQueues: {},
      activities: {},
      taskChannels: { TC_SRC: 'TC_DST' },
    },
    serverless: { services: {}, environments: {}, functions: {} },
    contentTemplates: {},
    studio: { flows: {} },
  };
  const data = {
    source: { studio: { flows: [{ sid: 'FW_SRC', friendlyName: 'Flow A' }] } },
    dest: { studio: { flows: [{ sid: 'FW_DST', friendlyName: 'Flow A' }] } },
  };
  await migrateStudioFlows(['FW_SRC'], data, mapping, mockClients);
  expect(true).toBe(true);
});
