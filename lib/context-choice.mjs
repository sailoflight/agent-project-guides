import crypto from 'node:crypto';
import fs from 'node:fs';
import { canonicalJson, UserError } from './core.mjs';

const TTL = 15 * 60 * 1000;
function binding(descriptor, target, choiceId, expires) {
  if (!target) throw new UserError('compact continuation requires an explicit project target', 'generation_target_missing');
  return canonicalJson({ domain: 'apg-context-choice-v2', descriptor, target: fs.realpathSync(target), choice: choiceId, expires });
}
function mac(descriptor, target, choiceId, expires, key) {
  return crypto.createHmac('sha256', key).update(binding(descriptor, target, choiceId, expires)).digest();
}
// 8-byte expiration plus a full HMAC: no payload hashes, lookup files or writes.
export function createCompactChoice(descriptor, target, choiceId, key, now = Date.now()) {
  const expires = now + TTL;
  const payload = Buffer.alloc(40);
  payload.writeBigUInt64BE(BigInt(expires));
  mac(descriptor, target, choiceId, expires, key).copy(payload, 8);
  return `g2_${payload.toString('base64url')}`;
}
export function verifyCompactChoice(token, descriptor, target, choiceId, key, now = Date.now()) {
  if (!choiceId) throw new UserError('compact continuation requires --select from its returned command', 'selection_required');
  if (!/^g2_[A-Za-z0-9_-]{54}$/.test(token)) throw new UserError('compact continuation is invalid', 'generation_mismatch');
  const payload = Buffer.from(token.slice(3), 'base64url');
  if (payload.length !== 40 || payload.toString('base64url') !== token.slice(3)) throw new UserError('compact continuation is invalid', 'generation_mismatch');
  const expires = Number(payload.readBigUInt64BE());
  if (!Number.isSafeInteger(expires) || !crypto.timingSafeEqual(payload.subarray(8), mac(descriptor, target, choiceId, expires, key))) {
    throw new UserError('continuation does not match this target, view, or choice', 'generation_mismatch');
  }
  if (expires < now) throw new UserError('compact continuation has expired', 'generation_expired');
  if (expires > now + TTL) throw new UserError('compact continuation expiration is invalid', 'generation_mismatch');
  const parts = choiceId.split('.');
  if (parts.length !== 3) throw new UserError('compact continuation choice is invalid', 'choice_unresolved');
  return { plane: parts[0], role: parts[1], mode: parts[2] };
}
