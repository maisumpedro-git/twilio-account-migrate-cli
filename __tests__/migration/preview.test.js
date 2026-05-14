import { jest } from '@jest/globals';

const mockFetchResource = jest.fn();
jest.unstable_mockModule('../../src/twilio/fetchers.js', () => ({
  fetchResource: mockFetchResource,
  RESOURCE_TYPES: ['workspace', 'taskQueues', 'taskChannels', 'workflows', 'studioFlows', 'contentTemplates'],
}));

const mockDisplay = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
  printAddedField: jest.fn(),
  printRemovedField: jest.fn(),
  printFieldDiff: jest.fn(),
};
jest.unstable_mockModule('../../src/utils/display.js', () => mockDisplay);

const { previewMigration, previewOperation, clearPreviewCache } = await import(
  '../../src/migration/preview.js'
);

describe('previewOperation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearPreviewCache();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  const account = { accountSid: 'AC1' };

  test('create prints all fields as added', async () => {
    const op = {
      action: 'create',
      type: 'taskQueues',
      data: { friendlyName: 'New', targetWorkers: '1==1', maxReservedWorkers: 5 },
    };
    await previewOperation(account, {}, op);
    expect(mockDisplay.printAddedField).toHaveBeenCalledWith('friendlyName', 'New');
    expect(mockDisplay.printAddedField).toHaveBeenCalledWith('targetWorkers', '1==1');
    expect(mockDisplay.printAddedField).toHaveBeenCalledWith('maxReservedWorkers', 5);
  });

  test('update prints field-level diff against cloud', async () => {
    mockFetchResource.mockResolvedValueOnce([
      { sid: 'WQ1', friendlyName: 'Support', targetWorkers: '1==1', maxReservedWorkers: 5 },
    ]);
    const op = {
      action: 'update',
      type: 'taskQueues',
      match: { friendlyName: 'Support' },
      data: { targetWorkers: 'skills HAS "support"' },
    };
    await previewOperation(account, {}, op);
    expect(mockFetchResource).toHaveBeenCalledWith(account, 'taskQueues');
    expect(mockDisplay.printFieldDiff).toHaveBeenCalledWith(
      'targetWorkers',
      '1==1',
      'skills HAS "support"',
      expect.any(String),
    );
  });

  test('delete shows resource that will be deleted', async () => {
    mockFetchResource.mockResolvedValueOnce([{ sid: 'WQ1', friendlyName: 'Old' }]);
    const op = { action: 'delete', type: 'taskQueues', match: { friendlyName: 'Old' } };
    await previewOperation(account, {}, op);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('WQ1'));
  });

  test('warns when delete target does not exist in cloud', async () => {
    mockFetchResource.mockResolvedValueOnce([]);
    const op = { action: 'delete', type: 'taskQueues', match: { friendlyName: 'Ghost' } };
    await previewOperation(account, {}, op);
    expect(mockDisplay.warn).toHaveBeenCalledWith(expect.stringContaining('ja nao existe'));
  });

  test('warns when update target missing from cloud', async () => {
    mockFetchResource.mockResolvedValueOnce([]);
    const op = {
      action: 'update',
      type: 'taskQueues',
      match: { friendlyName: 'Ghost' },
      data: { targetWorkers: 'X' },
    };
    await previewOperation(account, {}, op);
    expect(mockDisplay.warn).toHaveBeenCalledWith(expect.stringContaining('vai falhar'));
  });

  test('previewMigration caches refetch per type across operations', async () => {
    mockFetchResource.mockResolvedValueOnce([
      { sid: 'WQ1', friendlyName: 'A', targetWorkers: '1==1' },
      { sid: 'WQ2', friendlyName: 'B', targetWorkers: '1==1' },
    ]);
    await previewMigration(account, {}, [
      {
        action: 'update',
        type: 'taskQueues',
        match: { friendlyName: 'A' },
        data: { targetWorkers: 'X' },
      },
      {
        action: 'update',
        type: 'taskQueues',
        match: { friendlyName: 'B' },
        data: { targetWorkers: 'Y' },
      },
    ]);
    expect(mockFetchResource).toHaveBeenCalledTimes(1);
  });

  test('partial mode update prints widget ops summary', async () => {
    const op = {
      action: 'update',
      type: 'studioFlows',
      match: { friendlyName: 'Flow' },
      mode: 'partial',
      widgetOps: [
        { action: 'create_widget', widget: 'new_step' },
        { action: 'rename_widget', widget: 'old', newName: 'new' },
      ],
    };
    await previewOperation(account, {}, op);
    expect(mockFetchResource).not.toHaveBeenCalled();
    expect(mockDisplay.info).toHaveBeenCalledWith(expect.stringContaining('partial'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('create_widget'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('rename_widget'));
  });
});
