import crypto from 'node:crypto';

export function hmacSha256(key, value) {
  return crypto.createHmac('sha256', key).update(value).digest('hex');
}
