import twilio from 'twilio';

export function getTwilioClients() {
  const source = twilio(process.env.SOURCE_ACCOUNT_SID, process.env.SOURCE_AUTH_TOKEN);
  const dest = twilio(process.env.DEST_ACCOUNT_SID, process.env.DEST_AUTH_TOKEN);
  return { source, dest };
}
