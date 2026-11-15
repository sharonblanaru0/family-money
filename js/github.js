// Reads and writes the encrypted family data file in a private GitHub repository,
// using a fine-grained access token that only covers that one repository.

import {toB64, fromB64} from './crypto.js';

const API = 'https://api.github.com';

export class SyncError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}

const headers = token => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
});
const fileUrl = (repo, path) => `${API}/repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
const utf8ToB64 = s => toB64(new TextEncoder().encode(s));
const b64ToUtf8 = s => new TextDecoder().decode(fromB64(s.replace(/\s/g, '')));

async function call(url, opts = {}) {
  try {
    return await fetch(url, {...opts, cache: 'no-store', referrerPolicy: 'no-referrer'});
  } catch {
    throw new SyncError('offline');
  }
}

function fail(r) {
  const code = r.status === 401 ? 'bad-token'
    : r.status === 403 ? 'forbidden'
    : r.status === 404 ? 'not-found'
    : (r.status === 409 || r.status === 422) ? 'conflict'
    : 'server';
  throw new SyncError(code, r.status);
}

export async function checkRepo({repo, token}) {
  const r = await call(`${API}/repos/${repo}`, {headers: headers(token)});
  if (!r.ok) fail(r);
  const j = await r.json();
  return {private: !!j.private};
}

// Returns {env, sha}, or null when the repository has no data file yet.
export async function readVault({repo, path, token}) {
  const r = await call(fileUrl(repo, path), {headers: headers(token)});
  if (r.status === 404) return null;
  if (!r.ok) fail(r);
  const j = await r.json();
  return {env: JSON.parse(b64ToUtf8(j.content)), sha: j.sha};
}

// Creates or replaces the data file. Returns the new file sha.
export async function writeVault({repo, path, token}, env, sha) {
  const body = {message: 'Update family data', content: utf8ToB64(JSON.stringify(env))};
  if (sha) body.sha = sha;
  const r = await call(fileUrl(repo, path), {
    method: 'PUT',
    headers: {...headers(token), 'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
  if (!r.ok) fail(r);
  return (await r.json()).content.sha;
}
