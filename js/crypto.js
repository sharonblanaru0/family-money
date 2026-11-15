// Encryption for everything the app stores or sends.
// AES-256-GCM, with the key derived from the family password via PBKDF2-SHA-256.
// The password never leaves the device; GitHub only ever sees the sealed envelope.

const te = new TextEncoder();
const td = new TextDecoder();
export const ITERATIONS = 600000;

export function toB64(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}
export const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export const newSalt = () => crypto.getRandomValues(new Uint8Array(16));

export async function deriveKey(password, salt, iterations = ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', te.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {name: 'PBKDF2', hash: 'SHA-256', salt, iterations},
    base, {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
}

// `purpose` is bound into the ciphertext (AES-GCM additional data), so a sealed
// device record can never be passed off as the family data file or vice versa.
export async function seal(data, key, salt, purpose, iterations = ITERATIONS) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    {name: 'AES-GCM', iv, additionalData: te.encode(purpose)}, key, te.encode(JSON.stringify(data)));
  return {format: 'family-money', purpose, v: 1,
    kdf: {name: 'PBKDF2-SHA256', iterations, salt: toB64(salt)}, iv: toB64(iv), ct: toB64(ct)};
}

export async function unseal(env, key, purpose) {
  if (!env || env.format !== 'family-money' || env.purpose !== purpose) throw new Error('bad-envelope');
  const pt = await crypto.subtle.decrypt(
    {name: 'AES-GCM', iv: fromB64(env.iv), additionalData: te.encode(purpose)}, key, fromB64(env.ct));
  return JSON.parse(td.decode(pt));
}

export const saltOf = env => fromB64(env.kdf.salt);
export const iterationsOf = env => env.kdf.iterations;
export const sameSalt = (a, b) => !!a && !!b && a.kdf.salt === b.kdf.salt && a.kdf.iterations === b.kdf.iterations;

// A strong password suggestion: 5 groups of 4 from an unambiguous alphabet (~99 bits).
export function suggestPassword() {
  const A = 'abcdefghjkmnpqrstuvwxyz23456789';
  const out = [];
  while (out.length < 20) {
    for (const b of crypto.getRandomValues(new Uint8Array(32))) {
      if (b < 248 && out.length < 20) out.push(A[b % A.length]);   // rejection sampling: no modulo bias
    }
  }
  return out.join('').match(/.{4}/g).join('-');
}
