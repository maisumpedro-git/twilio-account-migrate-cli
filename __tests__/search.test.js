import { searchAdvanced } from '../src/search/advanced.js';
import { searchSimple } from '../src/search/simple.js';

const resources = {
  taskQueues: {
    data: [
      { sid: 'TQ1', friendlyName: 'Sales Queue' },
      { sid: 'TQ2', friendlyName: 'Support Queue' },
    ],
  },
  workflows: {
    data: [
      {
        sid: 'WF1',
        friendlyName: 'Main Workflow',
        configuration: { task_routing: { filters: [{ expression: 'sales_team == true' }] } },
      },
    ],
  },
  studioFlows: {
    data: [
      {
        sid: 'FW1',
        friendlyName: 'IVR Flow',
        definition: { states: [{ name: 'say_hello', properties: { body: 'Welcome to sales' } }] },
      },
    ],
  },
};

test('searchSimple finds resources by name', () => {
  const results = searchSimple(resources, 'Sales');
  expect(results).toHaveLength(1);
  expect(results[0].type).toBe('taskQueues');
  expect(results[0].matches).toHaveLength(1);
  expect(results[0].matches[0].friendlyName).toBe('Sales Queue');
});

test('searchSimple is case-insensitive', () => {
  const results = searchSimple(resources, 'support');
  expect(results).toHaveLength(1);
  expect(results[0].matches[0].friendlyName).toBe('Support Queue');
});

test('searchSimple returns empty for no match', () => {
  const results = searchSimple(resources, 'billing');
  expect(results).toHaveLength(0);
});

test('searchAdvanced finds term in resource content', () => {
  const results = searchAdvanced(resources, 'sales');
  expect(results.length).toBeGreaterThanOrEqual(2);

  const tqResult = results.find((r) => r.type === 'taskQueues');
  expect(tqResult.matches).toHaveLength(1);

  const wfResult = results.find((r) => r.type === 'workflows');
  expect(wfResult.matches).toHaveLength(1);
  expect(wfResult.matches[0].paths.some((p) => p.path.includes('expression'))).toBe(true);
});

test('searchAdvanced finds term in studio flow definition', () => {
  const results = searchAdvanced(resources, 'Welcome');
  const flowResult = results.find((r) => r.type === 'studioFlows');
  expect(flowResult).toBeDefined();
  expect(flowResult.matches).toHaveLength(1);
});
