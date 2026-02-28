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
