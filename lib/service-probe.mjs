import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { UserError } from './core.mjs';

export const IDENTITY_FIELDS = ['id_field', 'revision_field'];
export const IDENTITY_DEFAULTS = { id_field: 'id', revision_field: 'revision' };
export const LOCAL_ENDPOINT = /^(?:(?:\d{1,3}\.){3}\d{1,3}|\[[0-9a-fA-F:]+\]|localhost):\d{1,5}$/;
export const MAX_HEALTH_BYTES = 64 * 1024;

export function parseLocalEndpoint(endpoint, transport = 'http') {
  const fail = () => { throw new UserError(`a service endpoint must be a local host:port literal on loopback with port 1-65535: ${endpoint}`, 'invalid_component'); };
  if (typeof endpoint !== 'string' || !LOCAL_ENDPOINT.test(endpoint)) fail();
  if (!['http', 'https'].includes(transport)) throw new UserError('unsupported service transport', 'invalid_component');
  const split = endpoint.lastIndexOf(':');
  const literal = endpoint.slice(0, split).replace(/^\[|\]$/g, '');
  const port = Number(endpoint.slice(split + 1));
  if (port < 1 || port > 65535) fail();
  if (literal !== 'localhost' && !net.isIP(literal)) fail();
  let host = literal;
  if (literal === 'localhost') host = '127.0.0.1'; // Deliberately no DNS lookup.
  else if (net.isIP(literal) === 4) { if (!literal.startsWith('127.')) fail(); }
  else {
    host = new URL(`${transport}://[${literal}]:${port}`).hostname.slice(1, -1);
    if (host !== '::1') fail();
  }
  return { host, port, transport };
}

export function validateHealthPath(health) {
  if (typeof health !== 'string' || !health.startsWith('/') || health.startsWith('//') || /[^\x21-\x7e]|#/.test(health)) {
    throw new UserError('a service must declare a health path that is local and percent-encoded without control characters', 'invalid_component');
  }
}

// Exactly one bounded read-only request, no redirects, no DNS and no TLS bypass.
export function probeService(entry, { timeout = 400, maxBytes = MAX_HEALTH_BYTES } = {}) {
  const { host, port, transport } = parseLocalEndpoint(entry.endpoint, entry.transport);
  validateHealthPath(entry.health);
  const identity = { ...IDENTITY_DEFAULTS, ...(entry.identity ?? {}) };
  const verdict = (state, reason) => ({ id: entry.id, state, reusable: state === 'available', ...(reason ? { reason } : {}) });
  return new Promise((resolve) => {
    let settled = false;
    let request;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      request?.destroy();
      resolve(value);
    };
    const deadline = setTimeout(() => finish(verdict('degraded', 'the health probe timed out')), timeout);
    request = (transport === 'https' ? https : http).get({ host, port, path: entry.health, agent: false }, (response) => {
      response.on('error', () => finish(verdict('degraded', 'the health response failed')));
      response.on('aborted', () => finish(verdict('degraded', 'the health response was interrupted')));
      if (response.statusCode < 200 || response.statusCode >= 300) {
        finish(verdict('degraded', `the health endpoint returned HTTP ${response.statusCode}`));
        return;
      }
      const chunks = [];
      let bytes = 0;
      response.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > maxBytes) { finish(verdict('degraded', 'the health response exceeded its byte limit')); return; }
        chunks.push(chunk);
      });
      response.on('end', () => {
        if (settled) return;
        let observed;
        try { observed = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch { finish(verdict('conflict', 'the endpoint answered with something that is not a component identity')); return; }
        if (!observed || typeof observed !== 'object' || Array.isArray(observed)) {
          finish(verdict('conflict', 'the health response must be an identity object')); return;
        }
        const id = observed[identity.id_field];
        const revision = observed[identity.revision_field];
        if (entry.asserted_identity) finish(verdict('degraded', 'the record asserts its identity instead of checking it, so it can never be available'));
        else if (id === undefined) finish(verdict('conflict', `the health response carries no component identity (expected a field named "${identity.id_field}")`));
        else if (id !== entry.id) finish(verdict('conflict', `the endpoint belongs to ${id}`));
        else if (!entry.revision) finish(verdict('degraded', 'the declaration pins no revision, so the identity is unverified'));
        else if (revision === undefined) finish(verdict('degraded', `the health response carries no revision field "${identity.revision_field}"`));
        else if (revision !== entry.revision) finish(verdict('degraded', `revision ${revision} does not match the pinned ${entry.revision}`));
        else finish(verdict('available'));
      });
    });
    request.on('error', () => finish({ id: entry.id, state: 'not-installed', reusable: false, action: 'none' }));
  });
}
