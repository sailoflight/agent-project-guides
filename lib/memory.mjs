import fs from 'node:fs';
import path from 'node:path';
import {
  UserError,
  acquireProjectMutationLock,
  canonicalJson,
  projectStateDir,
  readJson,
  resolveInside,
  sha256,
  writeJsonAtomic,
} from './core.mjs';
import { readDescriptor } from './descriptor.mjs';

const MEMORY_ID = /^[a-z0-9][a-z0-9._-]{2,127}$/;
const RECORD_KEYS = new Set([
  'id', 'kind', 'scope', 'summary', 'evidence', 'owner', 'confidence', 'applicability',
  'revalidation_trigger', 'environment', 'attempts', 'follow_up', 'supersedes',
]);

function validateRecord(value) {
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new UserError('memory input must be an object', 'invalid_memory');
  for (const key of Object.keys(value)) if (!RECORD_KEYS.has(key)) throw new UserError(`unsupported memory field: ${key}`, 'invalid_memory');
  if (!MEMORY_ID.test(value.id || '')) throw new UserError('memory id must be a stable lowercase identifier', 'invalid_memory');
  if (!['knowledge', 'experience'].includes(value.kind)) throw new UserError('memory kind must be knowledge or experience', 'invalid_memory');
  for (const field of ['scope', 'summary', 'owner', 'confidence', 'applicability', 'revalidation_trigger']) {
    if (typeof value[field] !== 'string' || !value[field].trim()) throw new UserError(`memory.${field} is required`, 'invalid_memory');
  }
  if (!Array.isArray(value.evidence) || value.evidence.length === 0 || value.evidence.some((item) => typeof item !== 'string' || !item)) {
    throw new UserError('memory.evidence requires one or more locators', 'invalid_memory');
  }
  if (value.kind === 'experience') {
    for (const field of ['environment', 'follow_up']) if (typeof value[field] !== 'string' || !value[field]) throw new UserError(`experience.${field} is required`, 'invalid_memory');
    if (!Array.isArray(value.attempts) || value.attempts.length === 0) throw new UserError('experience.attempts is required', 'invalid_memory');
  }
  if (value.supersedes !== undefined && !MEMORY_ID.test(value.supersedes)) throw new UserError('memory.supersedes is invalid', 'invalid_memory');
  return value;
}

function directories(projectRoot, descriptor, env) {
  const state = projectStateDir(projectRoot, descriptor.project_id, env);
  return { state, proposals: path.join(state, 'memory-proposals') };
}

function proposalFile(projectRoot, descriptor, id, env) {
  if (!MEMORY_ID.test(id)) throw new UserError('memory id is invalid', 'invalid_memory');
  return path.join(directories(projectRoot, descriptor, env).proposals, `${id}.json`);
}

export function projectDigest(descriptor) {
  return `sha256:${sha256(canonicalJson(descriptor))}`;
}

export function proposeMemory(projectRoot, descriptor, input, env = process.env, { allowSupersedes = false } = {}) {
  const record = validateRecord(input);
  if (record.supersedes && !allowSupersedes) throw new UserError('supersedes is accepted only through memory supersede', 'invalid_memory');
  const file = proposalFile(projectRoot, descriptor, record.id, env);
  const proposal = {
    schema_version: 1,
    state: 'proposed',
    project_digest: projectDigest(descriptor),
    record,
    review: null,
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let descriptorHandle;
  try {
    descriptorHandle = fs.openSync(file, 'wx', 0o600);
    fs.writeSync(descriptorHandle, canonicalJson(proposal));
    fs.fsyncSync(descriptorHandle);
  } catch (error) {
    if (error.code === 'EEXIST') throw new UserError(`memory proposal already exists: ${record.id}`, 'memory_exists');
    throw error;
  } finally {
    if (descriptorHandle !== undefined) fs.closeSync(descriptorHandle);
  }
  return { id: record.id, state: proposal.state, file };
}

export function reviewMemory(projectRoot, descriptor, id, { reviewer, decision, rationale }, env = process.env) {
  if (typeof reviewer !== 'string' || !reviewer.trim()) throw new UserError('reviewer is required', 'invalid_memory_review');
  if (!['accept', 'reject'].includes(decision)) throw new UserError('decision must be accept or reject', 'invalid_memory_review');
  if (typeof rationale !== 'string' || !rationale.trim()) throw new UserError('review rationale is required', 'invalid_memory_review');
  const file = proposalFile(projectRoot, descriptor, id, env);
  const proposal = readJson(file, 'memory proposal');
  if (proposal.project_digest !== projectDigest(descriptor)) throw new UserError('memory proposal belongs to an older project descriptor', 'cas_conflict');
  if (proposal.state !== 'proposed') throw new UserError(`proposal is not reviewable: ${proposal.state}`, 'memory_state');
  const normalizedReviewer = reviewer.trim();
  if (proposal.record.owner.trim() === normalizedReviewer) throw new UserError('memory reviewer must be declared non-author', 'memory_independence');
  proposal.review = { reviewer: normalizedReviewer, decision, rationale: rationale.trim() };
  proposal.state = decision === 'accept' ? 'reviewed' : 'rejected';
  writeJsonAtomic(file, proposal, 0o600);
  return { id, state: proposal.state, review: proposal.review };
}

export function promoteMemory(projectRoot, descriptor, id, { expectedProjectDigest, expectedTargetHash = 'missing' }, env = process.env) {
  if (expectedTargetHash !== 'missing') throw new UserError('2.0 memory promotion supports atomic creation only; use supersession for replacements', 'unsupported_replace');
  const mutationLock = acquireProjectMutationLock(projectRoot, descriptor.project_id, env);
  try {
    const { descriptor: currentDescriptor } = readDescriptor(projectRoot);
    const currentProjectDigest = projectDigest(currentDescriptor);
    if (currentDescriptor.project_id !== descriptor.project_id || expectedProjectDigest !== currentProjectDigest) {
      throw new UserError('project digest changed before memory promotion', 'cas_conflict');
    }
    const proposalPath = proposalFile(projectRoot, currentDescriptor, id, env);
    const proposal = readJson(proposalPath, 'memory proposal');
    let record;
    try { record = validateRecord(proposal.record); } catch { throw new UserError('memory proposal record is invalid', 'invalid_memory'); }
    if (
      proposal.schema_version !== 1 || proposal.project_digest !== currentProjectDigest || proposal.state !== 'reviewed' ||
      proposal.review?.decision !== 'accept' || typeof proposal.review.reviewer !== 'string' || !proposal.review.reviewer.trim() ||
      proposal.review.reviewer.trim() === record.owner.trim() || typeof proposal.review.rationale !== 'string' || !proposal.review.rationale.trim()
    ) {
      throw new UserError('memory proposal changed before promotion', 'cas_conflict');
    }
    const targetRelative = `${currentDescriptor.layout.memory.replace(/\/$/, '')}/${id}.json`;
    const target = resolveInside(projectRoot, targetRelative, 'memory target');
    const promoted = {
      schema_version: 1,
      state: 'promoted',
      project_id: currentDescriptor.project_id,
      project_digest: currentProjectDigest,
      record: proposal.record,
      review: proposal.review,
    };
    const promotedBytes = Buffer.from(canonicalJson(promoted));
    const promotedHash = `sha256:${sha256(promotedBytes)}`;
    const existing = fs.statSync(target, { throwIfNoEntry: false });
    if (existing) {
      if (!existing.isFile() || `sha256:${sha256(fs.readFileSync(target))}` !== promotedHash) {
        throw new UserError('memory target already exists with different content', 'cas_conflict');
      }
    } else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const temporary = `${target}.tmp-${process.pid}`;
      fs.writeFileSync(temporary, promotedBytes, { mode: 0o644 });
      try {
        if (env.APG_TEST_FAILPOINT === 'create-memory-target-before-link') fs.writeFileSync(target, 'external concurrent content\n', { flag: 'wx' });
        fs.linkSync(temporary, target);
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const raced = fs.statSync(target, { throwIfNoEntry: false })?.isFile() ? `sha256:${sha256(fs.readFileSync(target))}` : 'missing';
        if (raced !== promotedHash) throw new UserError('memory target appeared during promotion', 'cas_conflict', { actual: raced });
      } finally {
        fs.rmSync(temporary, { force: true });
      }
    }
    proposal.state = 'promoted';
    proposal.promoted_target = path.relative(projectRoot, target).replaceAll('\\', '/');
    proposal.promoted_hash = promotedHash;
    writeJsonAtomic(proposalPath, proposal, 0o600);
    return { id, state: 'promoted', target: proposal.promoted_target, hash: proposal.promoted_hash, staged: false };
  } finally {
    mutationLock.release();
  }
}

export function supersedeMemory(projectRoot, descriptor, input, supersedes, env = process.env) {
  if (!MEMORY_ID.test(supersedes || '')) throw new UserError('superseded memory id is invalid', 'invalid_memory');
  const prior = resolveInside(projectRoot, `${descriptor.layout.memory.replace(/\/$/, '')}/${supersedes}.json`, 'superseded memory');
  if (!fs.statSync(prior, { throwIfNoEntry: false })?.isFile()) throw new UserError(`promoted memory does not exist: ${supersedes}`, 'memory_missing');
  const priorRecord = readJson(prior, 'promoted memory');
  let validatedPrior;
  try { validatedPrior = validateRecord(priorRecord.record); } catch { throw new UserError(`superseded record has invalid provenance: ${supersedes}`, 'invalid_memory'); }
  const review = priorRecord.review;
  if (
    priorRecord.schema_version !== 1 || priorRecord.state !== 'promoted' || priorRecord.project_id !== descriptor.project_id ||
    priorRecord.project_digest !== projectDigest(descriptor) || validatedPrior.id !== supersedes || review?.decision !== 'accept' ||
    typeof review.reviewer !== 'string' || !review.reviewer.trim() || review.reviewer.trim() === validatedPrior.owner.trim() ||
    typeof review.rationale !== 'string' || !review.rationale.trim()
  ) {
    throw new UserError(`superseded record is not valid current reviewed project memory: ${supersedes}`, 'invalid_memory');
  }
  return proposeMemory(projectRoot, descriptor, { ...input, supersedes }, env, { allowSupersedes: true });
}

export function purgeMemoryProposal(projectRoot, descriptor, id, env = process.env) {
  const file = proposalFile(projectRoot, descriptor, id, env);
  const proposal = readJson(file, 'memory proposal');
  if (proposal.state === 'promoted') throw new UserError('purge removes local proposals only; promoted project memory must be superseded through project review', 'memory_state');
  fs.rmSync(file);
  return { id, state: 'purged', file };
}

export function readMemoryInput(file) {
  return validateRecord(readJson(file, 'memory input'));
}
