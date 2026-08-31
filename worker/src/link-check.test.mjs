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
