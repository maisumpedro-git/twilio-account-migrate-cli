import { decrypt, encrypt } from '../src/accounts/crypto.js';

test('encrypt and decrypt round-trips correctly', () => {
  const plaintext = 'API_SECRET_VALUE_12345';
  const encrypted = encrypt(plaintext);
  expect(encrypted).not.toBe(plaintext);
  const decrypted = decrypt(encrypted);
  expect(decrypted).toBe(plaintext);
});

test('encrypt produces different ciphertext each time (random IV)', () => {
  const plaintext = 'same-secret';
  const a = encrypt(plaintext);
  const b = encrypt(plaintext);
  expect(a).not.toBe(b);
  expect(decrypt(a)).toBe(plaintext);
  expect(decrypt(b)).toBe(plaintext);
});

test('decrypt with tampered data throws', () => {
  const encrypted = encrypt('secret');
  const tampered = 'X' + encrypted.slice(1);
  expect(() => decrypt(tampered)).toThrow();
});
