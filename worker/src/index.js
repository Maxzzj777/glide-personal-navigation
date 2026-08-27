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
      if (url.pathname === '/api/favicon' && request.method === 'GET') {
        return favicon(url.searchParams.get('domain') || '', cors);
      }

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
          await env.GLIDE_KV.put(CREDENTIAL_KEY, JSON.stringify({ version: 2, salt, hash }));
        } else {
          await env.GLIDE_KV.delete(CREDENTIAL_KEY);
        }
        return json({ ok: true }, 200, cors);
      }

      return json({ error: 'Not found' }, 404, cors);
    } catch (error) {
      console.error('Worker request failed', error);
      return json({ error: '服务器处理失败' }, 500, cors);
    }
  }
};

async function favicon(value, cors) {
  const domain = value.trim().toLowerCase().replace(/^www\./, '');
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(domain)) {
    return json({ error: '图标域名无效' }, 400, cors);
  }

  // 1. 抓网站 HTML，解析高清图标（apple-touch-icon 优先）
  const hdUrl = await fetchHDIcon(domain);
  if (hdUrl) {
    try {
      const icon = await fetch(hdUrl, { cf: { cacheEverything: true, cacheTtl: 60 * 60 * 24 * 7 } });
      if (icon.ok) {
        return new Response(icon.body, {
          status: 200,
          headers: {
            ...cors,
            'Content-Type': icon.headers.get('Content-Type') || 'image/png',
            'Cache-Control': 'public, max-age=604800'
          }
        });
      }
    } catch { /* 继续 fallback */ }
  }

  // 2. fallback：Google s2 favicons 256px
  try {
    const source = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=256`;
    const response = await fetch(source, {
      cf: { cacheEverything: true, cacheTtl: 60 * 60 * 24 * 7 }
    });
    if (!response.ok) throw new Error('favicon fetch failed');
    return new Response(response.body, {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': response.headers.get('Content-Type') || 'image/png',
        'Cache-Control': 'public, max-age=604800'
      }
    });
  } catch {
    // 3. fallback：首字母 SVG
    const letter = domain[0].toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="28" fill="#5f6066"/><text x="64" y="80" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Arial" font-size="58" font-weight="700" fill="white">${letter}</text></svg>`;
    return new Response(svg, {
      status: 200,
      headers: { ...cors, 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }
    });
  }
}

async function fetchHDIcon(domain) {
  try {
    const htmlResp = await fetch(`https://${domain}/`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' },
      redirect: 'follow',
      cf: { cacheEverything: true, cacheTtl: 60 * 60 * 24 }
    });
    if (!htmlResp.ok) return null;
    const html = await htmlResp.text();
    return parseHDIcon(html, domain);
  } catch {
    return null;
  }
}

function parseHDIcon(html, domain) {
  const base = `https://${domain}`;
  let bestApple = null;
  let bestAppleSize = 0;
  let bestIcon = null;
  let bestIconSize = 0;

  const links = html.match(/<link\b[^>]*>/gi) || [];
  for (const link of links) {
    const rel = (link.match(/\brel=["']([^"']*)["']/i) || ['', ''])[1].toLowerCase();
    const href = (link.match(/\bhref=["']([^"']*)["']/i) || ['', ''])[1];
    const sizes = (link.match(/\bsizes=["']([^"']*)["']/i) || ['', ''])[1];
    if (!href || !rel.includes('icon')) continue;
    let abs;
    try { abs = new URL(href, base).href; } catch { continue; }
    const size = parseInt(sizes, 10) || 0;

    if (rel.includes('apple-touch-icon')) {
      const s = size || 180;
      if (s > bestAppleSize) { bestAppleSize = s; bestApple = abs; }
    } else if (rel.includes('icon')) {
      if (size > bestIconSize) { bestIconSize = size; bestIcon = abs; }
    }
  }

  return bestApple || bestIcon || null;
}

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
  const candidate = credential.version === 2
    ? await hashPassword(password, credential.salt)
    : await legacyHashPassword(password, credential.salt);
  return timingSafeEqual(candidate, credential.hash);
}

async function hashPassword(password, salt) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${salt}:${password}`)
  );
  return bytesToBase64(new Uint8Array(digest));
}

async function legacyHashPassword(password, salt) {
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
