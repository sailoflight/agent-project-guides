import crypto from 'node:crypto';
import fs from 'node:fs';
import { canonicalJson, UserError } from './core.mjs';

const TTL = 15 * 60 * 1000;
function binding(descriptor, target, choiceId, expires, version) {
  if (!target) throw new UserError('compact continuation requires an explicit project target', 'generation_target_missing');
  return canonicalJson({ domain: `apg-context-choice-v${version}`, descriptor, target: fs.realpathSync(target), choice: choiceId, expires });
}
function mac(descriptor, target, choiceId, expires, key, version) {
  return crypto.createHmac('sha256', key).update(binding(descriptor, target, choiceId, expires, version)).digest();
}
// Second-resolution expiry + 128-bit authentication: 20 bytes -> 27 base64url chars.
export function createCompactChoice(descriptor, target, choiceId, key, now = Date.now()) {
  const seconds = Math.floor((now + TTL) / 1000);
  if (!Number.isSafeInteger(seconds) || seconds < 0 || seconds > 0xffffffff) throw new UserError('compact continuation time is out of range', 'generation_time_invalid');
  const expires = seconds * 1000;
  const payload = Buffer.alloc(20);
  payload.writeUInt32BE(seconds);
  mac(descriptor, target, choiceId, expires, key, 3).copy(payload, 4, 0, 16);
  return `g3_${payload.toString('base64url')}`;
}
export function verifyCompactChoice(token, descriptor, target, choiceId, key, now = Date.now()) {
  if (!choiceId) throw new UserError('compact continuation requires --select from its returned command', 'selection_required');
  const version = token.startsWith('g3_') ? 3 : 2;
  const short = version === 3;
  if (!(short ? /^g3_[A-Za-z0-9_-]{27}$/ : /^g2_[A-Za-z0-9_-]{54}$/).test(token)) throw new UserError('compact continuation is invalid', 'generation_mismatch');
  const payload = Buffer.from(token.slice(3), 'base64url');
  if (payload.length !== (short ? 20 : 40) || payload.toString('base64url') !== token.slice(3)) throw new UserError('compact continuation is invalid', 'generation_mismatch');
  const expires = short ? payload.readUInt32BE() * 1000 : Number(payload.readBigUInt64BE());
  const expected = mac(descriptor, target, choiceId, expires, key, version).subarray(0, short ? 16 : 32);
  if (!Number.isSafeInteger(expires) || !crypto.timingSafeEqual(payload.subarray(short ? 4 : 8), expected)) {
    throw new UserError('continuation does not match this target, view, or choice', 'generation_mismatch');
  }
  if (expires < now) throw new UserError('compact continuation has expired', 'generation_expired');
  if (expires > now + TTL) throw new UserError('compact continuation expiration is invalid', 'generation_mismatch');
  const parts = choiceId.split('.');
  if (parts.length !== 3) throw new UserError('compact continuation choice is invalid', 'choice_unresolved');
  return { plane: parts[0], role: parts[1], mode: parts[2] };
}
