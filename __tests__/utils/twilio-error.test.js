import { jest } from '@jest/globals';

const mockDisplay = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  success: jest.fn(),
};

jest.unstable_mockModule('../../src/utils/display.js', () => mockDisplay);

const { formatTwilioError, printTwilioError } = await import('../../src/utils/twilio-error.js');

describe('formatTwilioError', () => {
  test('extracts errors and warnings from err.details', () => {
    const err = new Error('Validation failed');
    err.status = 400;
    err.code = 20001;
    err.moreInfo = 'https://www.twilio.com/docs/errors/20001';
    err.details = {
      errors: [{ message: 'Invalid widget', property_path: '#/states/0' }],
      warnings: [{ message: 'Deprecated', property_path: '#/states/1' }],
    };

    expect(formatTwilioError(err)).toEqual({
      message: 'Validation failed',
      status: 400,
      code: 20001,
      moreInfo: 'https://www.twilio.com/docs/errors/20001',
      errors: [{ message: 'Invalid widget', property_path: '#/states/0' }],
      warnings: [{ message: 'Deprecated', property_path: '#/states/1' }],
    });
  });

  test('returns empty arrays when err.details is missing', () => {
    const err = new Error('Network error');
    const formatted = formatTwilioError(err);
    expect(formatted.errors).toEqual([]);
    expect(formatted.warnings).toEqual([]);
    expect(formatted.message).toBe('Network error');
  });

  test('handles null/undefined err gracefully', () => {
    const formatted = formatTwilioError(undefined);
    expect(formatted.message).toBe('Erro desconhecido');
    expect(formatted.errors).toEqual([]);
  });
});

describe('printTwilioError', () => {
  beforeEach(() => jest.clearAllMocks());

  test('prints prefix + message + status/code, errors, warnings, moreInfo', () => {
    const err = new Error('Validation failed');
    err.status = 400;
    err.code = 20001;
    err.moreInfo = 'https://example.com/help';
    err.details = {
      errors: [{ message: 'Invalid widget', property_path: '#/states/0' }],
      warnings: [{ message: 'Deprecated property', property_path: '#/states/1' }],
    };

    printTwilioError(err, { prefix: 'Erro ao aplicar migration-x' });

    expect(mockDisplay.error).toHaveBeenCalledWith(
      'Erro ao aplicar migration-x: Validation failed [status 400, code 20001]',
    );
    expect(mockDisplay.error).toHaveBeenCalledWith(
      '    → Invalid widget (path: #/states/0)',
    );
    expect(mockDisplay.warn).toHaveBeenCalledWith(
      '    ⚠ Deprecated property (path: #/states/1)',
    );
    expect(mockDisplay.info).toHaveBeenCalledWith('    ℹ https://example.com/help');
  });

  test('omits prefix when not provided', () => {
    const err = new Error('boom');
    printTwilioError(err);
    expect(mockDisplay.error).toHaveBeenCalledWith('boom');
  });

  test('falls back to message when no details', () => {
    const err = new Error('Network down');
    printTwilioError(err, { prefix: 'Falha' });
    expect(mockDisplay.error).toHaveBeenCalledWith('Falha: Network down');
    expect(mockDisplay.warn).not.toHaveBeenCalled();
    expect(mockDisplay.info).not.toHaveBeenCalled();
  });

  test('item without property_path skips path suffix', () => {
    const err = new Error('Bad');
    err.details = { errors: [{ message: 'Generic error' }] };
    printTwilioError(err);
    expect(mockDisplay.error).toHaveBeenCalledWith('    → Generic error');
  });

  test('stringifies item when message is missing', () => {
    const err = new Error('Bad');
    err.details = { errors: [{ raw: 'data' }] };
    printTwilioError(err);
    expect(mockDisplay.error).toHaveBeenCalledWith(
      expect.stringContaining(JSON.stringify({ raw: 'data' })),
    );
  });
});
