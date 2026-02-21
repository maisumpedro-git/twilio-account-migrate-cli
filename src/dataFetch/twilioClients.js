import twilio from 'twilio';

export function createClient(account) {
  return twilio(account.apiKeySid, account.apiKeySecret, {
    accountSid: account.accountSid,
  });
}
