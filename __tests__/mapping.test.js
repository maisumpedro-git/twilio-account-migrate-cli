import { buildSidMapping } from '../src/migrate/buildMapping.js';

test('buildSidMapping matches by friendlyName or uniqueName', async () => {
  const source = {
    taskrouter: {
      workspace: { sid: 'WS_SRC' },
      taskQueues: [
        { sid: 'TQ_SRC_A', friendlyName: 'Queue A' },
        { sid: 'TQ_SRC_B', uniqueName: 'queue-b' },
      ],
      workflows: [{ sid: 'WF_SRC_A', friendlyName: 'WF A' }],
      activities: [{ sid: 'WA_SRC_1', uniqueName: 'available' }],
      taskChannels: [{ sid: 'TC_SRC_1', uniqueName: 'voice' }],
    },
    serverless: [
      {
        sid: 'ZS_SRC',
        friendlyName: 'Service 1',
        environments: [
          {
            sid: 'ZE_SRC',
            domainName: 'env1.twil.io',
            functions: [
              { sid: 'ZH_SRC', friendlyName: 'funcA' },
              { sid: 'ZH_SRC2', uniqueName: 'func-b' },
            ],
          },
        ],
      },
    ],
    contentTemplates: [{ sid: 'HX_SRC', friendlyName: 'Template X' }],
    studio: { flows: [{ sid: 'FW_SRC', friendlyName: 'Main Flow' }] },
  };

  const dest = {
    taskrouter: {
      workspace: { sid: 'WS_DST' },
      taskQueues: [
        { sid: 'TQ_DST_A', friendlyName: 'Queue A' },
        { sid: 'TQ_DST_B', uniqueName: 'queue-b' },
      ],
      workflows: [{ sid: 'WF_DST_A', friendlyName: 'WF A' }],
      activities: [{ sid: 'WA_DST_1', uniqueName: 'available' }],
      taskChannels: [{ sid: 'TC_DST_1', uniqueName: 'voice' }],
    },
    serverless: [
      {
        sid: 'ZS_DST',
        friendlyName: 'Service 1',
        environments: [
          {
            sid: 'ZE_DST',
            domainName: 'env1.twil.io',
            functions: [
              { sid: 'ZH_DST', friendlyName: 'funcA' },
              { sid: 'ZH_DST2', uniqueName: 'func-b' },
            ],
          },
        ],
      },
    ],
    contentTemplates: [{ sid: 'HX_DST', friendlyName: 'Template X' }],
    studio: { flows: [{ sid: 'FW_DST', friendlyName: 'Main Flow' }] },
  };

  const mapping = await buildSidMapping(source, dest);
  expect(mapping.taskrouter.taskQueues['TQ_SRC_A']).toBe('TQ_DST_A');
  expect(mapping.taskrouter.taskQueues['TQ_SRC_B']).toBe('TQ_DST_B');
  expect(mapping.serverless.services['ZS_SRC']).toBe('ZS_DST');
  expect(mapping.serverless.environments['ZE_SRC']).toBe('ZE_DST');
  expect(mapping.serverless.functions['ZH_SRC']).toBe('ZH_DST');
  expect(mapping.contentTemplates['HX_SRC']).toBe('HX_DST');
  expect(mapping.studio.flows['FW_SRC']).toBe('FW_DST');
});
