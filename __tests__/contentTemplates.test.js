import { migrateContentTemplates } from '../src/migrate/contentTemplates.js';

const mockClients = {
  source: {
    content: {
      v1: {
        templates: (sid) => ({ fetch: async () => ({ sid, friendlyName: 'Template A', types: ['sms'], content: { body: 'Hello' } }) }),
      },
    },
  },
  dest: {
    content: {
      v1: {
        templates: Object.assign(
          (sid) => ({ update: async () => ({ sid: 'HX_DST', friendlyName: 'Template A' }) }),
          {
            list: async () => [{ sid: 'HX_DST', friendlyName: 'Template B' }],
            create: async () => ({ sid: 'HX_DST', friendlyName: 'Template A' }),
          }
        ),
      },
    },
  },
};

test('migrate content templates creates when missing and updates mapping', async () => {
  const mapping = { taskrouter: { workflows: {}, taskQueues: {}, activities: {}, taskChannels: {} }, serverless: { services: {}, environments: {}, functions: {} }, contentTemplates: {}, studio: { flows: {} } };
  const data = { source: { contentTemplates: [{ sid: 'HX_SRC', friendlyName: 'Template A' }] }, dest: { contentTemplates: [{ sid: 'HX_OTHER', friendlyName: 'Template B' }] } };
  await migrateContentTemplates(['HX_SRC'], data, mapping, mockClients);
  expect(mapping.contentTemplates['HX_SRC']).toBe('HX_DST');
});
