import { normalizeResourceType, parseResourceTypes, RESOURCE_TYPES } from '../src/dataFetch/cache.js';

test('normalizeResourceType converts kebab-case to camelCase', () => {
  expect(normalizeResourceType('task-queues')).toBe('taskQueues');
  expect(normalizeResourceType('studio-flows')).toBe('studioFlows');
  expect(normalizeResourceType('content-templates')).toBe('contentTemplates');
  expect(normalizeResourceType('task-channels')).toBe('taskChannels');
});

test('normalizeResourceType passes through camelCase', () => {
  expect(normalizeResourceType('taskQueues')).toBe('taskQueues');
  expect(normalizeResourceType('workflows')).toBe('workflows');
  expect(normalizeResourceType('workspace')).toBe('workspace');
});

test('normalizeResourceType handles case-insensitive input', () => {
  expect(normalizeResourceType('TaskQueues')).toBe('taskQueues');
  expect(normalizeResourceType('STUDIOFLOWS')).toBe('studioFlows');
});

test('parseResourceTypes returns all types when input is empty', () => {
  expect(parseResourceTypes(null)).toEqual(RESOURCE_TYPES);
  expect(parseResourceTypes(undefined)).toEqual(RESOURCE_TYPES);
});

test('parseResourceTypes splits comma-separated types', () => {
  const result = parseResourceTypes('workflows,studio-flows');
  expect(result).toEqual(['workflows', 'studioFlows']);
});

test('parseResourceTypes handles mixed formats', () => {
  const result = parseResourceTypes('task-queues,studioFlows,workspace');
  expect(result).toEqual(['taskQueues', 'studioFlows', 'workspace']);
});
