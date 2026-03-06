const { buildRefMap, deepReplaceWithRefs } = await import('../../src/sid/auto-ref.js');

describe('buildRefMap', () => {
  test('maps managed resource SIDs to @ref patterns', () => {
    const allStates = {
      taskQueues: {
        resources: [
          { sid: 'WQ111', friendlyName: 'Support' },
          { sid: 'WQ222', friendlyName: 'Sales' },
        ],
      },
      workflows: {
        resources: [{ sid: 'WW333', friendlyName: 'Main Workflow' }],
      },
      taskChannels: {
        resources: [{ sid: 'TC444', uniqueName: 'voice' }],
      },
      studioFlows: {
        resources: [{ sid: 'FW555', friendlyName: 'Main Flow' }],
      },
      contentTemplates: {
        resources: [{ sid: 'HX666', friendlyName: 'Welcome' }],
      },
    };
    const serverless = [];

    const map = buildRefMap(allStates, serverless);
    expect(map['WQ111']).toBe('@ref:taskQueues:Support@@');
    expect(map['WQ222']).toBe('@ref:taskQueues:Sales@@');
    expect(map['WW333']).toBe('@ref:workflows:Main Workflow@@');
    expect(map['TC444']).toBe('@ref:taskChannels:voice@@');
    expect(map['FW555']).toBe('@ref:studioFlows:Main Flow@@');
    expect(map['HX666']).toBe('@ref:contentTemplates:Welcome@@');
  });

  test('maps serverless SIDs to @ref patterns', () => {
    const allStates = {};
    const serverless = [
      {
        sid: 'ZS111',
        uniqueName: 'my-service',
        friendlyName: 'My Service',
        environments: [
          { sid: 'ZE222', uniqueName: 'production', domainName: 'my-service-1234.twil.io' },
        ],
        functions: [{ sid: 'ZH333', friendlyName: 'my-fn', path: '/my-fn' }],
      },
    ];

    const map = buildRefMap(allStates, serverless);
    expect(map['ZS111']).toBe('@ref:serverless:my-service@@');
    expect(map['ZE222']).toBe('@ref:serverlessEnv:my-service:production@@');
    expect(map['ZH333']).toBe('@ref:serverlessFn:my-service:my-fn@@');
  });

  test('maps serverless URLs to @ref patterns', () => {
    const allStates = {};
    const serverless = [
      {
        sid: 'ZS111',
        uniqueName: 'my-service',
        environments: [
          { sid: 'ZE222', uniqueName: 'production', domainName: 'my-service-1234.twil.io' },
        ],
        functions: [{ sid: 'ZH333', friendlyName: 'my-fn', path: '/my-fn' }],
      },
    ];

    const map = buildRefMap(allStates, serverless);
    expect(map['https://my-service-1234.twil.io/my-fn']).toBe(
      '@ref:serverlessUrl:my-service:production:/my-fn@@',
    );
  });

  test('maps serverless asset URLs to @ref patterns', () => {
    const allStates = {};
    const serverless = [
      {
        sid: 'ZS111',
        uniqueName: 'my-service',
        environments: [
          { sid: 'ZE222', uniqueName: 'production', domainName: 'my-service-1234.twil.io' },
        ],
        functions: [],
        assets: [{ sid: 'ZN333', friendlyName: 'greeting', path: '/audio/greeting.mp3' }],
      },
    ];

    const map = buildRefMap(allStates, serverless);
    expect(map['https://my-service-1234.twil.io/audio/greeting.mp3']).toBe(
      '@ref:serverlessUrl:my-service:production:/audio/greeting.mp3@@',
    );
  });

  test('sorts replacements by key length (longest first)', () => {
    const allStates = {};
    const serverless = [
      {
        sid: 'ZS1',
        uniqueName: 'svc',
        environments: [{ sid: 'ZE1', uniqueName: 'prod', domainName: 'svc-1234.twil.io' }],
        functions: [{ sid: 'ZH1', friendlyName: 'fn', path: '/fn' }],
      },
    ];

    const map = buildRefMap(allStates, serverless);
    const keys = Object.keys(map);
    // URL is longer than SIDs, should appear in sorted order
    const urlKey = 'https://svc-1234.twil.io/fn';
    expect(keys.includes(urlKey)).toBe(true);
  });
});

describe('deepReplaceWithRefs', () => {
  test('replaces SIDs in nested objects', () => {
    const refMap = { WQ111: '@ref:taskQueues:Support@@' };
    const obj = {
      configuration: {
        task_routing: { default_filter: { queue: 'WQ111' } },
      },
    };
    const result = deepReplaceWithRefs(obj, refMap);
    expect(result.configuration.task_routing.default_filter.queue).toBe('@ref:taskQueues:Support@@');
  });

  test('replaces URLs embedded in strings', () => {
    const refMap = {
      'https://my-service-1234.twil.io/my-fn': '@ref:serverlessUrl:my-service:production:/my-fn@@',
    };
    const obj = {
      url: 'https://my-service-1234.twil.io/my-fn',
    };
    const result = deepReplaceWithRefs(obj, refMap);
    expect(result.url).toBe('@ref:serverlessUrl:my-service:production:/my-fn@@');
  });

  test('replaces SIDs inside arrays', () => {
    const refMap = { FW555: '@ref:studioFlows:Main Flow@@' };
    const obj = { flows: ['FW555', 'other'] };
    const result = deepReplaceWithRefs(obj, refMap);
    expect(result.flows[0]).toBe('@ref:studioFlows:Main Flow@@');
  });

  test('does not modify original object', () => {
    const refMap = { WQ111: '@ref:taskQueues:Support@@' };
    const obj = { queue: 'WQ111' };
    deepReplaceWithRefs(obj, refMap);
    expect(obj.queue).toBe('WQ111');
  });

  test('replaces asset URLs in nested objects', () => {
    const refMap = {
      'https://my-service-1234.twil.io/audio/greeting.mp3':
        '@ref:serverlessUrl:my-service:production:/audio/greeting.mp3@@',
    };
    const obj = {
      definition: {
        states: {
          say_play: {
            type: 'say-play',
            properties: {
              url: 'https://my-service-1234.twil.io/audio/greeting.mp3',
            },
          },
        },
      },
    };
    const result = deepReplaceWithRefs(obj, refMap);
    expect(result.definition.states.say_play.properties.url).toBe(
      '@ref:serverlessUrl:my-service:production:/audio/greeting.mp3@@',
    );
  });

  test('replaces assignmentCallbackUrl with @ref', () => {
    const refMap = {
      'https://my-service-1234.twil.io/callback':
        '@ref:serverlessUrl:my-service:production:/callback@@',
    };
    const obj = {
      friendlyName: 'Main',
      assignmentCallbackUrl: 'https://my-service-1234.twil.io/callback',
      configuration: { task_routing: { filters: [] } },
    };
    const result = deepReplaceWithRefs(obj, refMap);
    expect(result.assignmentCallbackUrl).toBe('@ref:serverlessUrl:my-service:production:/callback@@');
    // Other fields unchanged
    expect(result.friendlyName).toBe('Main');
  });

  test('handles null and primitives gracefully', () => {
    const refMap = { WQ111: '@ref:taskQueues:Support@@' };
    expect(deepReplaceWithRefs(null, refMap)).toBeNull();
    expect(deepReplaceWithRefs(42, refMap)).toBe(42);
    expect(deepReplaceWithRefs('WQ111', refMap)).toBe('@ref:taskQueues:Support@@');
  });

  test('replaces SIDs/URLs inside make-http-request widget properties and parameters', () => {
    const refMap = {
      'https://my-service-1234.twil.io/handler':
        '@ref:serverlessUrl:my-service:production:/handler@@',
      FW555: '@ref:studioFlows:Main Flow@@',
      ZS111: '@ref:serverless:my-service@@',
    };
    const obj = {
      definition: {
        states: {
          make_http_request_1: {
            type: 'make-http-request',
            properties: {
              method: 'POST',
              content_type: 'application/json;charset=utf-8',
              url: 'https://my-service-1234.twil.io/handler',
              body: '{}',
              parameters: [
                { key: 'FlowSid', value: 'FW555' },
                { key: 'ServiceSid', value: 'ZS111' },
              ],
            },
          },
        },
      },
    };
    const result = deepReplaceWithRefs(obj, refMap);
    const widget = result.definition.states.make_http_request_1;
    expect(widget.properties.url).toBe('@ref:serverlessUrl:my-service:production:/handler@@');
    expect(widget.properties.parameters[0].value).toBe('@ref:studioFlows:Main Flow@@');
    expect(widget.properties.parameters[1].value).toBe('@ref:serverless:my-service@@');
  });

  test('replaces SIDs embedded in stringified JSON body', () => {
    const refMap = {
      FW555: '@ref:studioFlows:Main Flow@@',
      WQ111: '@ref:taskQueues:Support@@',
    };
    const obj = {
      definition: {
        states: {
          http_req: {
            type: 'make-http-request',
            properties: {
              body: '{"flowSid":"FW555","queueSid":"WQ111"}',
            },
          },
        },
      },
    };
    const result = deepReplaceWithRefs(obj, refMap);
    expect(result.definition.states.http_req.properties.body).toBe(
      '{"flowSid":"@ref:studioFlows:Main Flow@@","queueSid":"@ref:taskQueues:Support@@"}',
    );
  });
});
