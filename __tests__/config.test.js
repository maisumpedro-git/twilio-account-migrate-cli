import { jest, describe, it, expect, beforeEach } from '@jest/globals';

describe('loadEnvFile', () => {
  let loadEnvFile;

  beforeEach(async () => {
    jest.unstable_mockModule('node:fs', () => ({
      readFileSync: jest.fn(),
    }));

    const fs = await import('node:fs');
    const config = await import('../src/config.js');
    loadEnvFile = config.loadEnvFile;
    // Store reference so individual tests can control the mock
    loadEnvFile._mockFs = fs;
  });

  it('parses valid .env file with all 3 required variables', async () => {
    const { readFileSync } = await import('node:fs');
    readFileSync.mockReturnValue(
      [
        'TWILIO_ACCOUNT_SID=AC1234567890abcdef1234567890abcdef',
        'TWILIO_API_KEY_SID=SK1234567890abcdef1234567890abcdef',
        'TWILIO_API_KEY_SECRET=secret123abc',
      ].join('\n'),
    );

    const result = loadEnvFile('.env');

    expect(result).toEqual({
      accountSid: 'AC1234567890abcdef1234567890abcdef',
      apiKeySid: 'SK1234567890abcdef1234567890abcdef',
      apiKeySecret: 'secret123abc',
    });
  });

  it('strips double quotes from values', async () => {
    const { readFileSync } = await import('node:fs');
    readFileSync.mockReturnValue(
      [
        'TWILIO_ACCOUNT_SID="AC_double_quoted"',
        'TWILIO_API_KEY_SID="SK_double_quoted"',
        'TWILIO_API_KEY_SECRET="secret_double_quoted"',
      ].join('\n'),
    );

    const result = loadEnvFile('.env');

    expect(result).toEqual({
      accountSid: 'AC_double_quoted',
      apiKeySid: 'SK_double_quoted',
      apiKeySecret: 'secret_double_quoted',
    });
  });

  it('strips single quotes from values', async () => {
    const { readFileSync } = await import('node:fs');
    readFileSync.mockReturnValue(
      [
        "TWILIO_ACCOUNT_SID='AC_single_quoted'",
        "TWILIO_API_KEY_SID='SK_single_quoted'",
        "TWILIO_API_KEY_SECRET='secret_single_quoted'",
      ].join('\n'),
    );

    const result = loadEnvFile('.env');

    expect(result).toEqual({
      accountSid: 'AC_single_quoted',
      apiKeySid: 'SK_single_quoted',
      apiKeySecret: 'secret_single_quoted',
    });
  });

  it('ignores comments and blank lines', async () => {
    const { readFileSync } = await import('node:fs');
    readFileSync.mockReturnValue(
      [
        '# This is a comment',
        '',
        'TWILIO_ACCOUNT_SID=ACvalid',
        '  ',
        '# Another comment',
        'TWILIO_API_KEY_SID=SKvalid',
        '',
        'TWILIO_API_KEY_SECRET=secretvalid',
      ].join('\n'),
    );

    const result = loadEnvFile('.env');

    expect(result).toEqual({
      accountSid: 'ACvalid',
      apiKeySid: 'SKvalid',
      apiKeySecret: 'secretvalid',
    });
  });

  it('throws when TWILIO_ACCOUNT_SID is missing', async () => {
    const { readFileSync } = await import('node:fs');
    readFileSync.mockReturnValue(
      ['TWILIO_API_KEY_SID=SKtest', 'TWILIO_API_KEY_SECRET=secrettest'].join('\n'),
    );

    expect(() => loadEnvFile('.env')).toThrow('TWILIO_ACCOUNT_SID');
  });

  it('throws when TWILIO_API_KEY_SID is missing', async () => {
    const { readFileSync } = await import('node:fs');
    readFileSync.mockReturnValue(
      ['TWILIO_ACCOUNT_SID=ACtest', 'TWILIO_API_KEY_SECRET=secrettest'].join('\n'),
    );

    expect(() => loadEnvFile('.env')).toThrow('TWILIO_API_KEY_SID');
  });

  it('throws when TWILIO_API_KEY_SECRET is missing', async () => {
    const { readFileSync } = await import('node:fs');
    readFileSync.mockReturnValue(
      ['TWILIO_ACCOUNT_SID=ACtest', 'TWILIO_API_KEY_SID=SKtest'].join('\n'),
    );

    expect(() => loadEnvFile('.env')).toThrow('TWILIO_API_KEY_SECRET');
  });
});
