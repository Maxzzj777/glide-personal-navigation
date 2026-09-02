import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./index.js', import.meta.url), 'utf8');
const { default: worker, linkCheckState } = await import(`data:text/javascript,${encodeURIComponent(source)}`);
const env = { GLIDE_KV: { get: async key => key === 'admin-session:test' ? '1' : null } };

for (const url of ['http://127.0.0.1/', 'http://[::1]/', 'http://192.168.1.1/']) {
  const response = await worker.fetch(new Request('https://worker.test/api/link-check', { method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) }), env);
  assert.deepEqual(await response.json(), { ok: false, error: '已跳过本机或局域网地址' });
}

assert.equal(linkCheckState(200), 'accessible');
assert.equal(linkCheckState(403), 'restricted');
assert.equal(linkCheckState(429), 'temporary');
assert.equal(linkCheckState(404), 'broken');

const values = new Map([['admin-session:test', '1'], ['navigation-state', JSON.stringify({ categories: [{ id: 'old', sites: [] }] })]]);
const backupEnv = { GLIDE_KV: {
  get: async (key, type) => { const value = values.get(key) || null; return type === 'json' && value ? JSON.parse(value) : value; },
  put: async (key, value, options = {}) => { values.set(key, value); values.set(`${key}:meta`, options.metadata); },
  delete: async key => values.delete(key),
  list: async ({ prefix }) => ({ keys: [...values.keys()].filter(key => key.startsWith(prefix) && !key.endsWith(':meta')).sort().map(name => ({ name, metadata: values.get(`${name}:meta`) })) })
} };
await worker.fetch(new Request('https://worker.test/api/state', { method: 'PUT', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: JSON.stringify({ categories: [{ id: 'new', sites: [] }] }) }), backupEnv);
await worker.scheduled({ scheduledTime: Date.UTC(2026, 8, 2, 15, 55) }, backupEnv);
const backups = await worker.fetch(new Request('https://worker.test/api/backups', { headers: { Authorization: 'Bearer test' } }), backupEnv);
assert.equal((await backups.clone().json()).backups.some(item => item.type === 'daily'), true);
const { id } = (await backups.json()).backups.find(item => item.type === 'change');
await worker.fetch(new Request('https://worker.test/api/backups/restore', { method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }), backupEnv);
assert.equal(JSON.parse(values.get('navigation-state')).categories[0].id, 'old');
const restoredBackups = await worker.fetch(new Request('https://worker.test/api/backups', { headers: { Authorization: 'Bearer test' } }), backupEnv);
assert.equal((await restoredBackups.json()).lastRestore.type, 'change');
