const DATA_KEY = 'navigation-state';
const CREDENTIAL_KEY = 'admin-credential';
const SESSION_PREFIX = 'admin-session:';
const SESSION_TTL = 60 * 60 * 8;
const ALLOWED_ORIGINS = new Set([
  'https://shuqian.kdns.fr',
  'http://localhost:8080',
  'http://127.0.0.1:8080'
]);

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    try {
      const url = new URL(request.url);
      if (url.pathname === '/api/state' && request.method === 'GET') {
        const value = await env.GLIDE_KV.get(DATA_KEY);
        return json(value ? JSON.parse(value) : null, 200, cors);
      }

      if (url.pathname === '/api/login' && request.method === 'POST') {
        const { user, password = '' } = await request.json();
        if (user !== 'admin' || !(await verifyPassword(env, password))) {
          return json({ error: '账号或密码错误' }, 401, cors);
        }
        const token = randomToken();
        await env.GLIDE_KV.put(SESSION_PREFIX + token, '1', { expirationTtl: SESSION_TTL });
        return json({ token, expiresIn: SESSION_TTL }, 200, cors);
      }

      if (url.pathname === '/api/state' && request.method === 'PUT') {
        if (!(await authorized(request, env))) return json({ error: '登录已失效' }, 401, cors);
        const state = await request.json();
        if (!Array.isArray(state?.categories)) return json({ error: '数据格式错误' }, 400, cors);
        await env.GLIDE_KV.put(DATA_KEY, JSON.stringify(state));
        return json({ ok: true }, 200, cors);
      }

      if (url.pathname === '/api/password' && request.method === 'PUT') {
        if (!(await authorized(request, env))) return json({ error: '登录已失效' }, 401, cors);
        const { currentPassword = '', newPassword = '' } = await request.json();
        if (!(await verifyPassword(env, currentPassword))) return json({ error: '当前密码错误' }, 401, cors);
        if (newPassword) {
          const salt = randomToken(16);
          const hash = await hashPassword(newPassword, salt);
          await env.GLIDE_KV.put(CREDENTIAL_KEY, JSON.stringify({ salt, hash }));
        } else {
          await env.GLIDE_KV.delete(CREDENTIAL_KEY);
        }
        return json({ ok: true }, 200, cors);
      }

      return json({ error: 'Not found' }, 404, cors);
    } catch (error) {
      return json({ error: '服务器处理失败' }, 500, cors);
    }
  }
};

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : 'https://shuqian.kdns.fr';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
    'Cache-Control': 'no-store',
    'Vary': 'Origin'
  };
}

function json(value, status, headers) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' }
  });
}

async function authorized(request, env) {
  const header = request.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return !!token && (await env.GLIDE_KV.get(SESSION_PREFIX + token)) === '1';
}

async function verifyPassword(env, password) {
  const raw = await env.GLIDE_KV.get(CREDENTIAL_KEY);
  if (!raw) return password === '';
  const credential = JSON.parse(raw);
  return timingSafeEqual(await hashPassword(password, credential.salt), credential.hash);
}

async function hashPassword(password, salt) {
  const material = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 120000 },
    material,
    256
  );
  return bytesToBase64(new Uint8Array(bits));
}

function randomToken(size = 32) {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(size)));
}

function bytesToBase64(bytes) {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}
