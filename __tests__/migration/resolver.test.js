import { describe, expect, test } from '@jest/globals';

import { resolveRefs } from '../../src/migration/resolver.js';

describe('resolveRefs', () => {
  const state = {
    taskQueues: {
      resources: [
        { sid: 'WQ111', friendlyName: 'Support Queue' },
        { sid: 'WQ222', friendlyName: 'Sales Queue' },
      ],
    },
    workflows: {
      resources: [{ sid: 'WW111', friendlyName: 'Main Workflow' }],
    },
  };

  test('resolves @ref:type:name in a string value', () => {
    const obj = { queue: '@ref:taskQueues:Support Queue' };
    const result = resolveRefs(obj, state);
    expect(result.queue).toBe('WQ111');
  });

  test('resolves nested @ref values', () => {
    const obj = {
      config: {
        targets: [
          { queue: '@ref:taskQueues:Support Queue' },
          { queue: '@ref:taskQueues:Sales Queue' },
        ],
      },
    };
    const result = resolveRefs(obj, state);
    expect(result.config.targets[0].queue).toBe('WQ111');
    expect(result.config.targets[1].queue).toBe('WQ222');
  });

  test('leaves non-ref strings unchanged', () => {
    const obj = { name: 'hello', count: 5 };
    const result = resolveRefs(obj, state);
    expect(result).toEqual({ name: 'hello', count: 5 });
  });

  test('throws when @ref cannot be resolved', () => {
    const obj = { queue: '@ref:taskQueues:Unknown Queue' };
    expect(() => resolveRefs(obj, state)).toThrow('Unknown Queue');
  });

  test('resolves @ref from runtime SIDs (created in same migration)', () => {
    const runtimeSids = { 'taskQueues:New Queue': 'WQ999' };
    const obj = { queue: '@ref:taskQueues:New Queue' };
    const result = resolveRefs(obj, state, runtimeSids);
    expect(result.queue).toBe('WQ999');
  });

  test('runtime SIDs take precedence over state', () => {
    const runtimeSids = { 'taskQueues:Support Queue': 'WQ_OVERRIDE' };
    const obj = { queue: '@ref:taskQueues:Support Queue' };
    const result = resolveRefs(obj, state, runtimeSids);
    expect(result.queue).toBe('WQ_OVERRIDE');
  });
});

describe('resolveRefs — serverless patterns', () => {
  const state = {
    taskQueues: { resources: [{ sid: 'WQ111', friendlyName: 'Support' }] },
    serverless: {
      resources: [
        {
          sid: 'ZS111',
          uniqueName: 'my-service',
          environments: [
            { sid: 'ZE222', uniqueName: 'production', domainName: 'my-service-1234.twil.io' },
          ],
          functions: [{ sid: 'ZH333', friendlyName: 'my-fn', path: '/my-fn' }],
        },
      ],
    },
  };

  test('resolves @ref:serverless:serviceName to service SID', () => {
    const obj = { service: '@ref:serverless:my-service' };
    const result = resolveRefs(obj, state);
    expect(result.service).toBe('ZS111');
  });

  test('resolves @ref:serverlessEnv:serviceName:envName to environment SID', () => {
    const obj = { env: '@ref:serverlessEnv:my-service:production' };
    const result = resolveRefs(obj, state);
    expect(result.env).toBe('ZE222');
  });

  test('resolves @ref:serverlessFn:serviceName:fnName to function SID', () => {
    const obj = { fn: '@ref:serverlessFn:my-service:my-fn' };
    const result = resolveRefs(obj, state);
    expect(result.fn).toBe('ZH333');
  });

  test('resolves @ref:serverlessUrl:serviceName:envName:/path to full URL', () => {
    const obj = { url: '@ref:serverlessUrl:my-service:production:/my-fn' };
    const result = resolveRefs(obj, state);
    expect(result.url).toBe('https://my-service-1234.twil.io/my-fn');
  });

  test('throws when serverless service is not found', () => {
    const obj = { service: '@ref:serverless:nonexistent' };
    expect(() => resolveRefs(obj, state)).toThrow('Referencia nao resolvida');
  });

  test('resolves mixed ref types in nested object', () => {
    const obj = {
      config: {
        queue: '@ref:taskQueues:Support',
        webhook: '@ref:serverlessUrl:my-service:production:/my-fn',
        nested: {
          serviceSid: '@ref:serverless:my-service',
        },
      },
    };
    const result = resolveRefs(obj, state);
    expect(result.config.queue).toBe('WQ111');
    expect(result.config.webhook).toBe('https://my-service-1234.twil.io/my-fn');
    expect(result.config.nested.serviceSid).toBe('ZS111');
  });
});

describe('resolveRefs — workflow configuration filters', () => {
  test('resolves @ref:taskQueues in workflow create operation configuration filter', () => {
    const state = {
      taskQueues: {
        resources: [
          { sid: 'WQ_SUPPORT', friendlyName: 'Support' },
          { sid: 'WQ_SALES', friendlyName: 'Sales' },
        ],
      },
    };

    const operation = {
      action: 'create',
      type: 'workflows',
      data: {
        friendlyName: 'Main Workflow',
        configuration: {
          task_routing: {
            filters: [
              {
                filter_friendly_name: 'Support Filter',
                expression: 'type == "support"',
                targets: [
                  {
                    queue: '@ref:taskQueues:Support',
                    priority: 1,
                  },
                ],
              },
              {
                filter_friendly_name: 'Sales Filter',
                expression: 'type == "sales"',
                targets: [
                  {
                    queue: '@ref:taskQueues:Sales',
                    priority: 1,
                  },
                ],
              },
            ],
            default_filter: {
              queue: '@ref:taskQueues:Support',
            },
          },
        },
      },
    };

    const resolved = resolveRefs(operation, state);

    // Filters targets should have resolved SIDs
    expect(resolved.data.configuration.task_routing.filters[0].targets[0].queue).toBe('WQ_SUPPORT');
    expect(resolved.data.configuration.task_routing.filters[1].targets[0].queue).toBe('WQ_SALES');
    // Default filter should also be resolved
    expect(resolved.data.configuration.task_routing.default_filter.queue).toBe('WQ_SUPPORT');
    // Non-ref fields should be unchanged
    expect(resolved.data.friendlyName).toBe('Main Workflow');
    expect(resolved.data.configuration.task_routing.filters[0].expression).toBe(
      'type == "support"',
    );
  });

  test('resolves @ref:taskQueues in workflow update operation configuration filter', () => {
    const state = {
      taskQueues: {
        resources: [{ sid: 'WQ_SUPPORT', friendlyName: 'Support' }],
      },
    };

    const operation = {
      action: 'update',
      type: 'workflows',
      match: { friendlyName: 'Main Workflow' },
      data: {
        configuration: {
          task_routing: {
            default_filter: {
              queue: '@ref:taskQueues:Support',
            },
          },
        },
      },
    };

    const resolved = resolveRefs(operation, state);

    expect(resolved.data.configuration.task_routing.default_filter.queue).toBe('WQ_SUPPORT');
    expect(resolved.match.friendlyName).toBe('Main Workflow');
  });

  test('resolves @ref:taskQueues from runtimeSids (queue created in same migration)', () => {
    const state = {
      taskQueues: { resources: [] },
    };
    const runtimeSids = { 'taskQueues:New Queue': 'WQ_RUNTIME_NEW' };

    const operation = {
      action: 'create',
      type: 'workflows',
      data: {
        friendlyName: 'Workflow',
        configuration: {
          task_routing: {
            default_filter: {
              queue: '@ref:taskQueues:New Queue',
            },
          },
        },
      },
    };

    const resolved = resolveRefs(operation, state, runtimeSids);

    expect(resolved.data.configuration.task_routing.default_filter.queue).toBe('WQ_RUNTIME_NEW');
  });
});

describe('resolveRefs — embedded @ref in expression strings', () => {
  const state = {
    taskQueues: {
      resources: [
        { sid: 'WQ_SUPPORT', friendlyName: 'Support - Portuguese' },
        { sid: 'WQ_SALES', friendlyName: 'Sales' },
      ],
    },
  };

  test('resolves @ref embedded inside a filter expression string', () => {
    const obj = {
      expression: 'nome == \'Teste\' AND filaSid == "@ref:taskQueues:Support - Portuguese"',
    };
    const result = resolveRefs(obj, state);
    expect(result.expression).toBe('nome == \'Teste\' AND filaSid == "WQ_SUPPORT"');
  });

  test('resolves multiple embedded @ref in same expression', () => {
    const obj = {
      expression: 'q1 == "@ref:taskQueues:Support - Portuguese" OR q2 == "@ref:taskQueues:Sales"',
    };
    const result = resolveRefs(obj, state);
    expect(result.expression).toBe('q1 == "WQ_SUPPORT" OR q2 == "WQ_SALES"');
  });

  test('resolves embedded @ref from runtimeSids', () => {
    const runtimeSids = { 'taskQueues:New Queue': 'WQ_RUNTIME' };
    const obj = {
      expression: 'filaSid == "@ref:taskQueues:New Queue"',
    };
    const result = resolveRefs(obj, state, runtimeSids);
    expect(result.expression).toBe('filaSid == "WQ_RUNTIME"');
  });

  test('still resolves standalone @ref as before', () => {
    const obj = { queue: '@ref:taskQueues:Sales' };
    const result = resolveRefs(obj, state);
    expect(result.queue).toBe('WQ_SALES');
  });
});

describe('resolveRefs — contentTemplates', () => {
  const state = {
    contentTemplates: {
      resources: [
        { sid: 'HX_WELCOME', friendlyName: 'Welcome Template' },
        { sid: 'HX_GOODBYE', friendlyName: 'Goodbye Template' },
      ],
    },
    taskQueues: {
      resources: [{ sid: 'WQ_SUPPORT', friendlyName: 'Support' }],
    },
  };

  test('resolves @ref:contentTemplates:name to content template SID', () => {
    const obj = { content_template_sid: '@ref:contentTemplates:Welcome Template' };
    const result = resolveRefs(obj, state);
    expect(result.content_template_sid).toBe('HX_WELCOME');
  });

  test('resolves contentTemplates @ref inside studioFlow definition', () => {
    const obj = {
      action: 'create',
      type: 'studioFlows',
      data: {
        friendlyName: 'Main IVR',
        definition: {
          states: [
            {
              name: 'send_welcome',
              properties: { content_template_sid: '@ref:contentTemplates:Welcome Template' },
            },
          ],
        },
      },
    };
    const result = resolveRefs(obj, state);
    expect(result.data.definition.states[0].properties.content_template_sid).toBe('HX_WELCOME');
  });

  test('resolves contentTemplates @ref from runtimeSids', () => {
    const runtimeSids = { 'contentTemplates:New Template': 'HX_RUNTIME' };
    const obj = { template: '@ref:contentTemplates:New Template' };
    const result = resolveRefs(obj, { contentTemplates: { resources: [] } }, runtimeSids);
    expect(result.template).toBe('HX_RUNTIME');
  });

  test('throws when contentTemplate @ref cannot be resolved', () => {
    const obj = { template: '@ref:contentTemplates:Nonexistent' };
    expect(() => resolveRefs(obj, state)).toThrow('Nonexistent');
  });
});

describe('resolveRefs — multiple @ref in Liquid templates', () => {
  const state = {
    contentTemplates: {
      resources: [
        { sid: 'HX_OPT1', friendlyName: '1_opcoes' },
        { sid: 'HX_OPT2', friendlyName: '2_opcoes' },
        { sid: 'HX_OPT3', friendlyName: '3_opcoes' },
      ],
    },
  };

  test('resolves multiple @ref:contentTemplates embedded in a Liquid template string', () => {
    const obj = {
      body: '{%- case count -%}{%- when 1 -%}@ref:contentTemplates:1_opcoes@@{%- when 2 -%}@ref:contentTemplates:2_opcoes@@{%- when 3 -%}@ref:contentTemplates:3_opcoes@@{%- endcase -%}',
    };
    const result = resolveRefs(obj, state);
    expect(result.body).toBe(
      '{%- case count -%}{%- when 1 -%}HX_OPT1{%- when 2 -%}HX_OPT2{%- when 3 -%}HX_OPT3{%- endcase -%}',
    );
  });

  test('resolves @ref followed immediately by another @ref without separator', () => {
    const obj = {
      expr: '@ref:contentTemplates:1_opcoes@@@ref:contentTemplates:2_opcoes@@',
    };
    const result = resolveRefs(obj, state);
    expect(result.expr).toBe('HX_OPT1HX_OPT2');
  });
});

describe('resolveRefs — run-function widget', () => {
  const state = {
    serverless: {
      resources: [
        {
          sid: 'ZS111',
          uniqueName: 'my-service',
          environments: [
            { sid: 'ZE222', uniqueName: 'production', domainName: 'my-service-1234.twil.io' },
          ],
          functions: [{ sid: 'ZH333', friendlyName: 'my-fn', path: '/my-fn' }],
        },
      ],
    },
    studioFlows: {
      resources: [{ sid: 'FW555', friendlyName: 'Main Flow' }],
    },
  };

  test('resolves all @ref patterns in run-function widget properties', () => {
    const obj = {
      action: 'update',
      type: 'studioFlows',
      match: { friendlyName: 'Main Flow' },
      data: {
        definition: {
          states: {
            run_function_1: {
              type: 'run-function',
              properties: {
                service_sid: '@ref:serverless:my-service@@',
                environment_sid: '@ref:serverlessEnv:my-service:production@@',
                function_sid: '@ref:serverlessFn:my-service:my-fn@@',
                url: '@ref:serverlessUrl:my-service:production:/my-fn@@',
                parameters: [{ key: 'FlowSid', value: '@ref:studioFlows:Main Flow@@' }],
              },
            },
          },
        },
      },
    };
    const result = resolveRefs(obj, state);
    const widget = result.data.definition.states.run_function_1;
    expect(widget.properties.service_sid).toBe('ZS111');
    expect(widget.properties.environment_sid).toBe('ZE222');
    expect(widget.properties.function_sid).toBe('ZH333');
    expect(widget.properties.url).toBe('https://my-service-1234.twil.io/my-fn');
    expect(widget.properties.parameters[0].value).toBe('FW555');
  });

  test('resolves @ref in run-function widget inside stringified JSON body', () => {
    const obj = {
      data: {
        definition: {
          states: {
            run_fn: {
              type: 'run-function',
              properties: {
                url: '@ref:serverlessUrl:my-service:production:/my-fn@@',
                body: '{"flowSid":"@ref:studioFlows:Main Flow@@"}',
              },
            },
          },
        },
      },
    };
    const result = resolveRefs(obj, state);
    expect(result.data.definition.states.run_fn.properties.url).toBe(
      'https://my-service-1234.twil.io/my-fn',
    );
    expect(result.data.definition.states.run_fn.properties.body).toBe(
      '{"flowSid":"FW555"}',
    );
  });
});
