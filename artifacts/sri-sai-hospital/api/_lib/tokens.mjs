import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

const REF_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

// Short, easy-to-read reference like SS-7K4Q (no 0/O or 1/I confusion).
export function newRefCode() {
  let code = '';
  for (let index = 0; index < 4; index += 1) code += REF_ALPHABET[randomInt(REF_ALPHABET.length)];
  return `SS-${code}`;
}

export function newHoldToken() {
  return randomBytes(24).toString('base64url');
}

export function isHoldToken(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{32}$/.test(value);
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

// Private patient links (/a/... tracker, /f/... feedback): signed, tied to one
// consultation and one purpose, and expiring. Nothing medical is in the URL.
export function signLink(secret, purpose, consultationId, expiresAt) {
  if (!secret) throw new Error('APP_SECRET is not set.');
  const exp = Math.floor(new Date(expiresAt).getTime() / 1000);
  const payload = Buffer.from(`${purpose}|${consultationId}|${exp}`).toString('base64url');
  return `${payload}.${signature(secret, payload)}`;
}

export function verifyLink(secret, purpose, token, now = Date.now()) {
  if (!secret || typeof token !== 'string' || token.length > 300) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = Buffer.from(signature(secret, payload));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  const [linkPurpose, consultationId, exp] = Buffer.from(payload, 'base64url').toString('utf8').split('|');
  if (linkPurpose !== purpose || !consultationId || !(Number(exp) * 1000 > now)) return null;
  return consultationId;
}

function signature(secret, payload) {
  return createHmac('sha256', secret).update(payload).digest().subarray(0, 18).toString('base64url');
}
