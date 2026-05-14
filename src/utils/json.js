export function tryParseJson(val) {
  if (typeof val !== 'string') return val;
  const trimmed = val.trim();
  if (!trimmed) return val;
  const first = trimmed[0];
  if (first !== '{' && first !== '[') return val;
  try {
    return JSON.parse(trimmed);
  } catch {
    return val;
  }
}
