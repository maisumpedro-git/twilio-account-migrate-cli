import { describe, expect, test } from '@jest/globals';

import { tryParseJson } from '../../src/utils/json.js';

describe('tryParseJson', () => {
  test('parses JSON object string', () => {
    expect(tryParseJson('{"a":1}')).toEqual({ a: 1 });
  });

  test('parses JSON array string', () => {
    expect(tryParseJson('[1,2,3]')).toEqual([1, 2, 3]);
  });

  test('returns original value for non-string input', () => {
    const obj = { a: 1 };
    expect(tryParseJson(obj)).toBe(obj);
    expect(tryParseJson(42)).toBe(42);
    expect(tryParseJson(null)).toBe(null);
    expect(tryParseJson(undefined)).toBe(undefined);
  });

  test('returns original string when not JSON', () => {
    expect(tryParseJson('hello')).toBe('hello');
    expect(tryParseJson('1==1')).toBe('1==1');
    expect(tryParseJson('')).toBe('');
  });

  test('returns original string when JSON is malformed', () => {
    expect(tryParseJson('{not json')).toBe('{not json');
  });

  test('handles whitespace before bracket', () => {
    expect(tryParseJson('   {"a":1}')).toEqual({ a: 1 });
  });
});
