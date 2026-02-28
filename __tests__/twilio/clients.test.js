// __tests__/twilio/clients.test.js
import { jest } from '@jest/globals';

jest.unstable_mockModule('twilio', () => ({
  default: jest.fn(() => ({ fake: 'client' })),
}));

const { createClient } = await import('../../src/twilio/clients.js');

describe('createClient', () => {
  test('creates twilio client with API key auth', async () => {
    const twilio = (await import('twilio')).default;
    const account = {
      accountSid: 'AC123',
      apiKeySid: 'SK123',
      apiKeySecret: 'secret',
    };
    const client = createClient(account);
    expect(twilio).toHaveBeenCalledWith('SK123', 'secret', { accountSid: 'AC123' });
    expect(client).toEqual({ fake: 'client' });
  });
});
