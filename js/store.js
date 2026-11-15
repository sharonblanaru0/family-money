// Tiny IndexedDB key-value store. Holds only sealed (encrypted) envelopes:
//   'device' — this device's connection details (repo, access token, role), encrypted
//   'vault'  — the last family data file downloaded, encrypted, for offline viewing

const DB = 'family-money';
const ST = 'kv';
let dbp = null;

function db() {
  return dbp || (dbp = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(ST);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}

function run(mode, fn) {
  return db().then(d => new Promise((resolve, reject) => {
    const tx = d.transaction(ST, mode);
    const req = fn(tx.objectStore(ST));
    tx.oncomplete = () => resolve(req && req.result);
    tx.onerror = () => reject(tx.error);
  }));
}

export const get = k => run('readonly', s => s.get(k));
export const set = (k, v) => run('readwrite', s => s.put(v, k));
export const del = k => run('readwrite', s => s.delete(k));
export const clear = () => run('readwrite', s => s.clear());
