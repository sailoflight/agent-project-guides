import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { UserError, canonicalJson, platformHomes } from './core.mjs';

function generationKeyFile(env = process.env) {
  return path.join(platformHomes(env).state, 'generation-hmac.key');
}

export function ensureGenerationKey(env = process.env) {
  const file = generationKeyFile(env);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) {
    try { fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  return readGenerationKey(env);
}

export function readGenerationKey(env = process.env) {
  const file = generationKeyFile(env);
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) throw new UserError('shared runtime generation key is missing or unsafe', 'generation_key_missing');
  const key = fs.readFileSync(file, 'utf8').trim();
  if (!/^[0-9a-f]{64}$/.test(key)) throw new UserError('shared runtime generation key is invalid', 'generation_key_missing');
  return Buffer.from(key, 'hex');
}

const GENERATION_REFERENCE = /^g1_[0-9a-f]{32}$/;
const MAX_GENERATION_STATE_BYTES = 128 * 1024;

export function createGenerationReference() {
  return `g1_${crypto.randomBytes(16).toString('hex')}`;
}

function generationReferenceDirectory(env, create = false) {
  const directory = path.join(platformHomes(env).state, 'generation-handles');
  if (create) fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(directory, { throwIfNoEntry: false });
  if (!stat?.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
    throw new UserError('generation reference state is missing or unsafe', 'generation_reference_missing');
  }
  return directory;
}

function generationStateMac(record, key) {
  return crypto.createHmac('sha256', key).update(canonicalJson(record)).digest('hex');
}

function decodeGenerationState(bytes, reference, projectRoot, key) {
  let state;
  try { state = JSON.parse(bytes); } catch {
    throw new UserError('generation reference state is invalid', 'generation_mismatch');
  }
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new UserError('generation reference state is invalid', 'generation_mismatch');
  const { mac, ...record } = state;
  const expected = generationStateMac(record, key);
  if (typeof mac !== 'string' || !/^[0-9a-f]{64}$/.test(mac)
    || !crypto.timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(expected, 'hex'))
    || record.schema_version !== 1 || record.reference !== reference
    || record.project_root !== fs.realpathSync(projectRoot) || typeof record.generation !== 'string') {
    throw new UserError('generation reference belongs to another target or was modified', 'generation_mismatch');
  }
  return record.generation;
}

// Reclaim only authenticated expired APG records, with bounded work per issuance.
// Unknown files, unsafe entries and unverified records are never removed.
function pruneGenerationReferences(directory, key, now = Date.now()) {
  const entries = fs.opendirSync(directory);
  try {
    for (let count = 0; count < 128; count += 1) {
      const entry = entries.readSync();
      if (!entry) break;
      if (!/^g1_[0-9a-f]{32}\.json$/.test(entry.name) || !entry.isFile()) continue;
      const file = path.join(directory, entry.name);
      let fd;
      try {
        fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
        const stat = fs.fstatSync(fd);
        if (!stat.isFile() || (stat.mode & 0o077) !== 0 || stat.size > MAX_GENERATION_STATE_BYTES) continue;
        const { mac, ...record } = JSON.parse(fs.readFileSync(fd, 'utf8'));
        if (record.schema_version !== 1 || `${record.reference}.json` !== entry.name
          || typeof record.generation !== 'string' || mac !== generationStateMac(record, key)) continue;
        const [encoded, signature, extra] = record.generation.split('.');
        if (!encoded || extra || signature !== crypto.createHmac('sha256', key).update(encoded).digest('hex')) continue;
        const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
        if (!Number.isSafeInteger(payload.expires_at_ms) || payload.expires_at_ms >= now) continue;
        const current = fs.lstatSync(file, { throwIfNoEntry: false });
        if (current?.isFile() && current.ino === stat.ino && current.dev === stat.dev) fs.unlinkSync(file);
      } catch {
        // Best-effort maintenance never turns a valid request into an error.
      } finally {
        if (fd !== undefined) fs.closeSync(fd);
      }
    }
  } finally {
    entries.closeSync();
  }
}

// Only the CLI calls this after successful compilation; the context compiler is pure.
export function saveGenerationReference(reference, generation, projectRoot, env = process.env) {
  if (!GENERATION_REFERENCE.test(reference)) throw new UserError('invalid generation reference', 'generation_mismatch');
  const key = readGenerationKey(env);
  const record = { schema_version: 1, reference, project_root: fs.realpathSync(projectRoot), generation };
  const bytes = canonicalJson({ ...record, mac: generationStateMac(record, key) });
  if (Buffer.byteLength(bytes) > MAX_GENERATION_STATE_BYTES) throw new UserError('generation reference state is too large', 'generation_mismatch');
  const directory = generationReferenceDirectory(env, true);
  try { pruneGenerationReferences(directory, key); } catch { /* Issuance does not depend on cleanup. */ }
  const file = path.join(directory, `${reference}.json`);
  // Exclusive creation prevents collisions and follows no pre-existing file/symlink.
  let fd;
  try {
    fd = fs.openSync(file, 'wx', 0o600);
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } catch (error) {
    throw new UserError('could not save private generation reference state', 'generation_reference_write_failed');
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  return reference;
}

export function loadGenerationReference(reference, projectRoot, env = process.env) {
  if (!GENERATION_REFERENCE.test(reference)) throw new UserError('invalid generation reference', 'generation_mismatch');
  const file = path.join(generationReferenceDirectory(env), `${reference}.json`);
  let fd;
  try {
    const stat = fs.lstatSync(file, { throwIfNoEntry: false });
    if (!stat?.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 || stat.size > MAX_GENERATION_STATE_BYTES) {
      throw new UserError('generation reference is missing or unsafe; request fresh context', 'generation_reference_missing');
    }
    fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || opened.ino !== stat.ino || opened.dev !== stat.dev || (opened.mode & 0o077) !== 0 || opened.size > MAX_GENERATION_STATE_BYTES) {
      throw new UserError('generation reference changed while opening', 'generation_reference_missing');
    }
    return decodeGenerationState(fs.readFileSync(fd, 'utf8'), reference, projectRoot, readGenerationKey(env));
  } catch (error) {
    if (error instanceof UserError) throw error;
    throw new UserError('generation reference could not be read; request fresh context', 'generation_reference_missing');
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

