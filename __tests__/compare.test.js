import { compareAdvanced } from '../src/compare/advanced.js';
import { compareSimple } from '../src/compare/simple.js';

const accountA = { name: 'Dev', environment: 'dev' };
const accountB = { name: 'Prod', environment: 'prod' };

const resourcesA = {
  taskQueues: {
    data: [
      { sid: 'TQ1', friendlyName: 'Sales' },
      { sid: 'TQ2', friendlyName: 'Support' },
    ],
  },
  workflows: {
    data: [{ sid: 'WF1', friendlyName: 'Main WF', configuration: { task_routing: {} } }],
  },
};

const resourcesB = {
  taskQueues: {
    data: [
      { sid: 'TQ3', friendlyName: 'Sales' },
      { sid: 'TQ4', friendlyName: 'Billing' },
    ],
  },
  workflows: {
    data: [
      {
        sid: 'WF2',
        friendlyName: 'Main WF',
        configuration: { task_routing: { default_filter: {} } },
      },
    ],
  },
};

test('compareSimple reports counts and name differences', () => {
  const results = compareSimple(accountA, resourcesA, accountB, resourcesB, [
    'taskQueues',
    'workflows',
  ]);

  const tqResult = results.find((r) => r.type === 'taskQueues');
  expect(tqResult.countA).toBe(2);
  expect(tqResult.countB).toBe(2);
  expect(tqResult.onlyInA).toEqual(['Support']);
  expect(tqResult.onlyInB).toEqual(['Billing']);
  expect(tqResult.inBoth).toEqual(['Sales']);
});

test('compareAdvanced detects content differences', () => {
  const results = compareAdvanced(accountA, resourcesA, accountB, resourcesB, ['workflows']);

  const wfResult = results.find((r) => r.type === 'workflows');
  const mainWf = wfResult.resourceDiffs.find((d) => d.name === 'Main WF');
  expect(mainWf.status).toBe('different');
  expect(mainWf.diffs.length).toBeGreaterThan(0);
});

test('compareAdvanced marks identical resources as equal', () => {
  const sameResources = {
    taskQueues: { data: [{ sid: 'X', friendlyName: 'Q1', targetWorkers: 'a=1' }] },
  };
  const sameResourcesB = {
    taskQueues: { data: [{ sid: 'Y', friendlyName: 'Q1', targetWorkers: 'a=1' }] },
  };

  const results = compareAdvanced(accountA, sameResources, accountB, sameResourcesB, [
    'taskQueues',
  ]);
  const rd = results[0].resourceDiffs[0];
  expect(rd.status).toBe('equal');
});
