import { describe, expect, test } from '@jest/globals';

import { diffResources } from '../../src/diff/compare.js';

describe('diffResources', () => {
  test('detects resource only in cloud (create)', () => {
    const cloud = [{ sid: 'WQ1', friendlyName: 'Queue A', targetWorkers: '1==1' }];
    const local = [];
    const result = diffResources(cloud, local);
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe('create');
    expect(result[0].data.friendlyName).toBe('Queue A');
    expect(result[0].data.sid).toBeUndefined();
  });

  test('detects resource only in local state (delete)', () => {
    const cloud = [];
    const local = [{ sid: 'WQ1', friendlyName: 'Queue A', targetWorkers: '1==1' }];
    const result = diffResources(cloud, local);
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe('delete');
    expect(result[0].match.friendlyName).toBe('Queue A');
  });

  test('detects updated resource (changed fields only)', () => {
    const cloud = [
      {
        sid: 'WQ1',
        friendlyName: 'Queue A',
        targetWorkers: 'skills HAS "support"',
        maxReservedWorkers: 5,
      },
    ];
    const local = [
      { sid: 'WQ1', friendlyName: 'Queue A', targetWorkers: '1==1', maxReservedWorkers: 5 },
    ];
    const result = diffResources(cloud, local);
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe('update');
    expect(result[0].match.friendlyName).toBe('Queue A');
    expect(result[0].data.targetWorkers).toBe('skills HAS "support"');
    expect(result[0].data.maxReservedWorkers).toBeUndefined(); // unchanged
  });

  test('returns empty array when no differences', () => {
    const cloud = [{ sid: 'WQ1', friendlyName: 'Queue A', targetWorkers: '1==1' }];
    const local = [{ sid: 'WQ2', friendlyName: 'Queue A', targetWorkers: '1==1' }];
    const result = diffResources(cloud, local);
    expect(result).toHaveLength(0);
  });

  test('ignores metadata fields (sid, accountSid, dateCreated, dateUpdated, url, links)', () => {
    const cloud = [
      {
        sid: 'WQ1',
        accountSid: 'AC1',
        friendlyName: 'Q',
        dateCreated: '2026-01-01',
        url: 'http://x',
        links: {},
      },
    ];
    const local = [
      {
        sid: 'WQ2',
        accountSid: 'AC2',
        friendlyName: 'Q',
        dateCreated: '2025-01-01',
        url: 'http://y',
        links: {},
      },
    ];
    const result = diffResources(cloud, local);
    expect(result).toHaveLength(0);
  });

  test('matches by uniqueName when friendlyName is absent', () => {
    const cloud = [
      { sid: 'HX1', uniqueName: 'template_a', types: { 'twilio/text': { body: 'hello' } } },
    ];
    const local = [];
    const result = diffResources(cloud, local);
    expect(result).toHaveLength(1);
    expect(result[0].data.uniqueName).toBe('template_a');
  });
});

describe('diffResources — Studio Flow full definition update', () => {
  const makeFlow = (name, states, extras = {}) => ({
    sid: 'FW123',
    friendlyName: name,
    status: 'published',
    definition: {
      description: 'A flow',
      states: states,
      initial_state: 'Trigger',
      flags: { allow_concurrent_calls: true },
      ...extras,
    },
  });

  test('detects changed definition as full update with definition in data', () => {
    const cloud = [
      makeFlow('Flow A', {
        Trigger: { type: 'trigger', transitions: [] },
        NewStep: { type: 'send-message', transitions: [], properties: { body: 'hi' } },
      }),
    ];
    const local = [
      makeFlow('Flow A', {
        Trigger: { type: 'trigger', transitions: [] },
      }),
    ];
    const result = diffResources(cloud, local);
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe('update');
    expect(result[0].match.friendlyName).toBe('Flow A');
    expect(result[0].data.definition).toBeDefined();
    expect(result[0].mode).toBeUndefined();
    expect(result[0].widgetOps).toBeUndefined();
  });

  test('detects removed widget as full definition update', () => {
    const cloud = [
      makeFlow('Flow A', {
        Trigger: { type: 'trigger', transitions: [] },
      }),
    ];
    const local = [
      makeFlow('Flow A', {
        Trigger: { type: 'trigger', transitions: [] },
        OldStep: { type: 'send-message', transitions: [], properties: { body: 'hi' } },
      }),
    ];
    const result = diffResources(cloud, local);
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe('update');
    expect(result[0].data.definition).toBeDefined();
    expect(result[0].mode).toBeUndefined();
    expect(result[0].widgetOps).toBeUndefined();
  });

  test('detects widget property change as full definition update', () => {
    const cloud = [
      makeFlow('Flow A', {
        Trigger: { type: 'trigger', transitions: [] },
        Step1: { type: 'send-message', transitions: [], properties: { body: 'new text' } },
      }),
    ];
    const local = [
      makeFlow('Flow A', {
        Trigger: { type: 'trigger', transitions: [] },
        Step1: { type: 'send-message', transitions: [], properties: { body: 'old text' } },
      }),
    ];
    const result = diffResources(cloud, local);
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe('update');
    expect(result[0].data.definition).toBeDefined();
    expect(result[0].data.definition.states.Step1.properties.body).toBe('new text');
  });

  test('no update when flows have no definition changes', () => {
    const states = { Trigger: { type: 'trigger', transitions: [] } };
    const cloud = [makeFlow('Flow A', states)];
    const local = [makeFlow('Flow A', states)];
    const result = diffResources(cloud, local);
    expect(result).toHaveLength(0);
  });

  test('detects non-states field changes as full definition update', () => {
    const cloud = [
      makeFlow('Flow A', { Trigger: { type: 'trigger' } }, { initial_state: 'NewTrigger' }),
    ];
    const local = [
      makeFlow('Flow A', { Trigger: { type: 'trigger' } }, { initial_state: 'Trigger' }),
    ];
    const result = diffResources(cloud, local);
    expect(result).toHaveLength(1);
    expect(result[0].data.definition).toBeDefined();
  });

  test('preserves make-http-request widget url and parameters in update data', () => {
    const cloud = [
      makeFlow('Flow A', {
        Trigger: { type: 'trigger', transitions: [] },
        http_req: {
          type: 'make-http-request',
          transitions: [],
          properties: {
            method: 'POST',
            url: '@ref:serverlessUrl:my-service:production:/handler',
            content_type: 'application/json;charset=utf-8',
            body: '{}',
            parameters: [
              { key: 'FlowSid', value: '@ref:studioFlows:Main Flow' },
              { key: 'AccountSid', value: 'AC123' },
            ],
          },
        },
      }),
    ];
    const local = [
      makeFlow('Flow A', {
        Trigger: { type: 'trigger', transitions: [] },
        http_req: {
          type: 'make-http-request',
          transitions: [],
          properties: {
            method: 'GET',
            url: '@ref:serverlessUrl:my-service:production:/old-handler',
            content_type: 'application/json;charset=utf-8',
            body: '{}',
            parameters: [],
          },
        },
      }),
    ];
    const result = diffResources(cloud, local);
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe('update');
    const def = result[0].data.definition;
    expect(def).toBeDefined();
    const widget = def.states.http_req;
    expect(widget.properties.url).toBe('@ref:serverlessUrl:my-service:production:/handler');
    expect(widget.properties.method).toBe('POST');
    expect(widget.properties.parameters).toHaveLength(2);
    expect(widget.properties.parameters[0].value).toBe('@ref:studioFlows:Main Flow');
  });

  test('detects no change when make-http-request widgets are identical', () => {
    const states = {
      Trigger: { type: 'trigger', transitions: [] },
      http_req: {
        type: 'make-http-request',
        transitions: [],
        properties: {
          method: 'POST',
          url: '@ref:serverlessUrl:my-service:production:/handler',
          parameters: [{ key: 'FlowSid', value: '@ref:studioFlows:Main Flow' }],
        },
      },
    };
    const cloud = [makeFlow('Flow A', states)];
    const local = [makeFlow('Flow A', states)];
    const result = diffResources(cloud, local);
    expect(result).toHaveLength(0);
  });
});

describe('diffResources — run-function widget', () => {
  const makeFlow = (name, states) => ({
    sid: 'FW123',
    friendlyName: name,
    status: 'published',
    definition: {
      description: 'A flow',
      states: states,
      initial_state: 'Trigger',
      flags: { allow_concurrent_calls: true },
    },
  });

  test('preserves run-function widget url and SID refs in update data', () => {
    const cloud = [
      makeFlow('Flow A', {
        Trigger: { type: 'trigger', transitions: [] },
        run_fn: {
          type: 'run-function',
          transitions: [],
          properties: {
            service_sid: '@ref:serverless:my-service@@',
            environment_sid: '@ref:serverlessEnv:my-service:production@@',
            function_sid: '@ref:serverlessFn:my-service:new-fn@@',
            url: '@ref:serverlessUrl:my-service:production:/new-fn@@',
            parameters: [{ key: 'FlowSid', value: '@ref:studioFlows:Main Flow@@' }],
          },
        },
      }),
    ];
    const local = [
      makeFlow('Flow A', {
        Trigger: { type: 'trigger', transitions: [] },
        run_fn: {
          type: 'run-function',
          transitions: [],
          properties: {
            service_sid: '@ref:serverless:my-service@@',
            environment_sid: '@ref:serverlessEnv:my-service:production@@',
            function_sid: '@ref:serverlessFn:my-service:old-fn@@',
            url: '@ref:serverlessUrl:my-service:production:/old-fn@@',
            parameters: [],
          },
        },
      }),
    ];
    const result = diffResources(cloud, local);
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe('update');
    const widget = result[0].data.definition.states.run_fn;
    expect(widget.properties.url).toBe('@ref:serverlessUrl:my-service:production:/new-fn@@');
    expect(widget.properties.function_sid).toBe('@ref:serverlessFn:my-service:new-fn@@');
    expect(widget.properties.parameters[0].value).toBe('@ref:studioFlows:Main Flow@@');
  });

  test('detects no change when run-function widgets are identical', () => {
    const states = {
      Trigger: { type: 'trigger', transitions: [] },
      run_fn: {
        type: 'run-function',
        transitions: [],
        properties: {
          service_sid: '@ref:serverless:my-service@@',
          environment_sid: '@ref:serverlessEnv:my-service:production@@',
          function_sid: '@ref:serverlessFn:my-service:my-fn@@',
          url: '@ref:serverlessUrl:my-service:production:/my-fn@@',
          parameters: [{ key: 'FlowSid', value: '@ref:studioFlows:Main Flow@@' }],
        },
      },
    };
    const cloud = [makeFlow('Flow A', states)];
    const local = [makeFlow('Flow A', states)];
    const result = diffResources(cloud, local);
    expect(result).toHaveLength(0);
  });
});

describe('diffResources — @ref vs SID falso positivo (bug de pull duplo)', () => {
  test('nao deve detectar diferenca quando ambos os lados tem @ref (apos normalizacao)', () => {
    // Apos o fix no pullCommand, ambos os lados sao normalizados com @refs antes da comparacao
    const cloud = [
      {
        sid: 'WW222',
        friendlyName: 'Main Workflow',
        taskReservationTimeout: 120,
        configuration: {
          task_routing: {
            default_filter: { queue: '@ref:taskQueues:Support' },
            filters: [
              {
                filter_friendly_name: 'Sales',
                targets: [{ queue: '@ref:taskQueues:Sales' }],
              },
            ],
          },
        },
      },
    ];
    const local = [
      {
        sid: 'WW222',
        friendlyName: 'Main Workflow',
        taskReservationTimeout: 120,
        configuration: {
          task_routing: {
            default_filter: { queue: '@ref:taskQueues:Support' },
            filters: [
              {
                filter_friendly_name: 'Sales',
                targets: [{ queue: '@ref:taskQueues:Sales' }],
              },
            ],
          },
        },
      },
    ];

    const result = diffResources(cloud, local);

    // Ambos os lados com @refs — nenhuma diferenca
    expect(result).toHaveLength(0);
  });

  test('nao deve detectar diferenca quando assignmentCallbackUrl tem @ref em ambos os lados', () => {
    const cloud = [
      {
        sid: 'WW222',
        friendlyName: 'Main',
        assignmentCallbackUrl: '@ref:serverlessUrl:my-service:production:/callback',
        configuration: { task_routing: { filters: [] } },
      },
    ];
    const local = [
      {
        sid: 'WW222',
        friendlyName: 'Main',
        assignmentCallbackUrl: '@ref:serverlessUrl:my-service:production:/callback',
        configuration: { task_routing: { filters: [] } },
      },
    ];

    const result = diffResources(cloud, local);

    // Ambos os lados com @ref — nenhuma diferenca
    expect(result).toHaveLength(0);
  });
});
