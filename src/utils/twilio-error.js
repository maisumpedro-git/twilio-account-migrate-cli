import { error, info, warn } from './display.js';

export function formatTwilioError(err) {
  const details = err?.details;
  const errors = Array.isArray(details?.errors) ? details.errors : [];
  const warnings = Array.isArray(details?.warnings) ? details.warnings : [];

  return {
    message: err?.message || 'Erro desconhecido',
    status: err?.status,
    code: err?.code,
    moreInfo: err?.moreInfo,
    errors,
    warnings,
  };
}

export function printTwilioError(err, { prefix } = {}) {
  const formatted = formatTwilioError(err);

  const meta = [];
  if (formatted.status !== undefined) meta.push(`status ${formatted.status}`);
  if (formatted.code !== undefined) meta.push(`code ${formatted.code}`);
  const metaStr = meta.length ? ` [${meta.join(', ')}]` : '';

  const head = prefix ? `${prefix}: ${formatted.message}` : formatted.message;
  error(`${head}${metaStr}`);

  for (const item of formatted.errors) {
    const msg = item?.message || JSON.stringify(item);
    const pathStr = item?.property_path ? ` (path: ${item.property_path})` : '';
    error(`    → ${msg}${pathStr}`);
  }

  for (const item of formatted.warnings) {
    const msg = item?.message || JSON.stringify(item);
    const pathStr = item?.property_path ? ` (path: ${item.property_path})` : '';
    warn(`    ⚠ ${msg}${pathStr}`);
  }

  if (formatted.moreInfo) {
    info(`    ℹ ${formatted.moreInfo}`);
  }
}
