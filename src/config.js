import { readFileSync } from 'node:fs';
import path from 'node:path';

export function loadEnvFile(filePath) {
  const content = readFileSync(path.resolve(filePath), 'utf8');
  const vars = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }

  const required = ['TWILIO_ACCOUNT_SID', 'TWILIO_API_KEY_SID', 'TWILIO_API_KEY_SECRET'];
  const missing = required.filter((k) => !vars[k]);

  if (missing.length > 0) {
    throw new Error(`Missing required .env variables: ${missing.join(', ')}`);
  }

  return {
    accountSid: vars.TWILIO_ACCOUNT_SID,
    apiKeySid: vars.TWILIO_API_KEY_SID,
    apiKeySecret: vars.TWILIO_API_KEY_SECRET,
  };
}
