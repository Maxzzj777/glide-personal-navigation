const DATA_KEY = 'navigation-state';
const CREDENTIAL_KEY = 'admin-credential';
const SESSION_PREFIX = 'admin-session:';
const SESSION_TTL = 60 * 60 * 8;
const LOGIN_FAIL_KEY = 'admin-login-fail';
const LOGIN_LOCK_STEPS = [
  { fails: 5, lock: 30 },
  { fails: 6, lock: 300 },
  { fails: 7, lock: 900 },
  { fails: 8, lock: 1800 }
];
function humanizeLock(sec) { return sec < 60 ? `${sec} 秒` : `${Math.round(sec / 60)} 分钟`; }
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
        const now = Math.floor(Date.now() / 1000);
        const failRaw = await env.GLIDE_KV.get(LOGIN_FAIL_KEY);
        const fail = failRaw ? JSON.parse(failRaw) : { count: 0, lockedUntil: 0 };
        if (fail.lockedUntil > now) {
          return json({ error: `尝试过于频繁，请 ${humanizeLock(fail.lockedUntil - now)}后再试` }, 429, cors);
        }
        if (user !== 'admin' || !(await verifyPassword(env, password))) {
          const count = (fail.count || 0) + 1;
          let lockedUntil = 0;
          for (const step of LOGIN_LOCK_STEPS) if (count >= step.fails) lockedUntil = now + step.lock;
          await env.GLIDE_KV.put(LOGIN_FAIL_KEY, JSON.stringify({ count, lockedUntil }));
          return json({ error: lockedUntil > now ? `账号或密码错误，已锁定 ${humanizeLock(lockedUntil - now)}` : '账号或密码错误' }, 401, cors);
        }
        await env.GLIDE_KV.delete(LOGIN_FAIL_KEY);
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

      if (url.pathname === '/api/remark' && request.method === 'POST') {
        if (!(await authorized(request, env))) return json({ error: '登录已失效' }, 401, cors);
        try {
          const { url: siteUrl = '', name = '' } = await request.json();
          if (!name || !/^https?:\/\//i.test(siteUrl)) return json({ error: '请提供有效的名称和网址' }, 400, cors);
          const meta = await fetchSiteMeta(siteUrl);
          let text = '';
          try {
            text = await generateRemark(env, name, siteUrl, meta);
          } catch {
            text = buildRemark(name, meta);
          }
          if (!text) return json({ error: '无法生成备注', meta }, 422, cors);
          return json({ text: text.slice(0, 100) }, 200, cors);
        } catch (error) {
          return json({ error: error.message || '生成备注失败' }, 500, cors);
        }
      }

      if (url.pathname === '/api/ai/config' && request.method === 'GET') {
        if (!(await authorized(request, env))) return json({ error: '登录已失效' }, 401, cors);
        return json(await getAIConfig(env), 200, cors);
      }

      if (url.pathname === '/api/ai/config' && request.method === 'PUT') {
        if (!(await authorized(request, env))) return json({ error: '登录已失效' }, 401, cors);
        const config = await request.json();
        const clean = {
          provider: ['workers-ai', 'openai', 'gemini'].includes(config?.provider) ? config.provider : 'workers-ai',
          apiKey: typeof config?.apiKey === 'string' ? config.apiKey.trim() : '',
          baseUrl: typeof config?.baseUrl === 'string' ? config.baseUrl.trim() : '',
          model: typeof config?.model === 'string' ? config.model.trim() : ''
        };
        await env.GLIDE_KV.put(AI_CONFIG_KEY, JSON.stringify(clean));
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
          headers: { ...cors, 'Content-Type': icon.headers.get('Content-Type') || 'image/png', 'Cache-Control': 'public, max-age=604800' }
        });
      }
    } catch { /* 继续 */ }
  }

  // 2. Google gstatic faviconV2（Google 搜索缓存，跳过反爬 + 高清）
  try {
    const g = await fetch(`https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(`https://${domain}`)}&size=256`, {
      cf: { cacheEverything: true, cacheTtl: 60 * 60 * 24 * 7 }
    });
    if (g.ok) {
      return new Response(g.body, {
        status: 200,
        headers: { ...cors, 'Content-Type': g.headers.get('Content-Type') || 'image/png', 'Cache-Control': 'public, max-age=604800' }
      });
    }
  } catch { /* 继续 */ }

  // 3. icon.horse 兜底（覆盖国内站点，如文心一言）
  try {
    const horse = await fetch(`https://icon.horse/icon/${encodeURIComponent(domain)}`, {
      cf: { cacheEverything: true, cacheTtl: 60 * 60 * 24 * 7 }
    });
    if (!horse.ok) throw new Error('icon.horse failed');
    const hct = horse.headers.get('Content-Type') || '';
    if (hct.includes('svg')) {
      const hsvg = await horse.text();
      if (hsvg.includes('#4F46E5') || hsvg.includes('#7C3AED')) throw new Error('icon.horse placeholder');
      return new Response(hsvg, {
        status: 200,
        headers: { ...cors, 'Content-Type': hct, 'Cache-Control': 'public, max-age=604800' }
      });
    }
    return new Response(horse.body, {
      status: 200,
      headers: { ...cors, 'Content-Type': hct || 'image/png', 'Cache-Control': 'public, max-age=604800' }
    });
  } catch { /* 继续 */ }

  // 4. 首字母 SVG 兜底
  const letter = domain[0].toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="28" fill="#5f6066"/><text x="64" y="80" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Arial" font-size="58" font-weight="700" fill="white">${letter}</text></svg>`;
  return new Response(svg, {
    status: 200,
    headers: { ...cors, 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }
  });
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

// ===== 备注生成（抓取网页标题/描述，无需 AI） =====
async function fetchSiteMeta(siteUrl) {
  const info = { title: '', desc: '', status: 0, htmlLen: 0, preview: '' };
  try {
    const resp = await fetch(siteUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      },
      redirect: 'follow',
      cf: { cacheEverything: true, cacheTtl: 60 * 60 * 24 }
    });
    info.status = resp.status;
    const html = await resp.text();
    info.htmlLen = html.length;
    info.preview = html.slice(0, 150).replace(/\s+/g, ' ');
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || ['', ''])[1].replace(/\s+/g, ' ').trim();
    const ogTitle = (html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["']/i) || ['', ''])[1].replace(/\s+/g, ' ').trim();
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
    const desc = (descMatch || ['', ''])[1].replace(/\s+/g, ' ').trim();
    const ogDesc = (html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["']/i) || ['', ''])[1].replace(/\s+/g, ' ').trim();
    info.title = decodeHtmlEntities(ogTitle || title).slice(0, 120);
    info.desc = decodeHtmlEntities(ogDesc || desc).slice(0, 200);
  } catch (e) {
    info.preview = 'fetch error: ' + (e?.message || e);
  }
  return info;
}

function decodeHtmlEntities(s) {
  return String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function buildRemark(name, meta) {
  const desc = (meta?.desc || '').trim();
  const title = (meta?.title || '').trim();
  const blocked = /出错啦|访问异常|安全验证|验证码|captcha|access denied|访问被拒|网络异常|页面不存在|not found|error/i;
  const isBlocked = (t) => t && (blocked.test(t) || /^https?:\/\//i.test(t));
  // 优先网页描述（最能说明用途），其次网页标题；排除反爬/错误页/URL
  if (desc && desc !== name && !isBlocked(desc)) return desc.slice(0, 100);
  if (title && title !== name && !isBlocked(title)) return title.slice(0, 100);
  return '';
}

const AI_CONFIG_KEY = 'ai-config';
const DEFAULT_AI_CONFIG = { provider: 'workers-ai', apiKey: '', baseUrl: '', model: '' };

async function getAIConfig(env) {
  const raw = await env.GLIDE_KV.get(AI_CONFIG_KEY);
  if (!raw) return { ...DEFAULT_AI_CONFIG };
  try {
    const config = { ...DEFAULT_AI_CONFIG, ...JSON.parse(raw) };
    // 兼容旧配置：cloudflare → workers-ai
    if (!['workers-ai', 'openai', 'gemini'].includes(config.provider)) config.provider = 'workers-ai';
    return config;
  } catch { return { ...DEFAULT_AI_CONFIG }; }
}

async function generateRemark(env, name, url, meta) {
  const config = await getAIConfig(env);
  const system = '你是一个为书签导航站生成简洁准确中文描述的助手。';
  let user = '请为下面的网站生成一句简洁的中文描述（不超过30字），说明它是什么、有什么用。只输出描述本身，不要前缀、不要引号、不要换行。';
  user += `\n网站名称：${name}\n网址：${url}`;
  if (meta?.title) user += `\n网页标题：${meta.title}`;
  if (meta?.desc) user += `\n网页描述：${meta.desc}`;
  const messages = [{ role: 'system', content: system }, { role: 'user', content: user }];
  const provider = config.provider || 'workers-ai';

  if (provider === 'workers-ai') {
    if (!env.AI) throw new Error('Workers AI 未绑定');
    const model = config.model || '@cf/mistralai/mistral-small-3.1-24b-instruct';
    const response = await env.AI.run(model, { messages, max_tokens: 200 });
    const text = typeof response === 'string' ? response : (response?.response || '');
    return (text || '').trim();
  }

  if (provider === 'openai') {
    const baseUrl = config.baseUrl, apiKey = config.apiKey, model = config.model || 'gpt-3.5-turbo';
    if (!baseUrl) throw new Error('请填写 API 地址');
    if (!apiKey) throw new Error('请填写 API Key');
    const endpoint = `${baseUrl.replace(/\/+$/, '')}/v1/chat/completions`;
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 200 })
    });
    if (!resp.ok) throw new Error(`AI 服务返回错误 (${resp.status})`);
    const data = await resp.json();
    return (data?.choices?.[0]?.message?.content || '').trim();
  }

  if (provider === 'gemini') {
    const apiKey = config.apiKey, model = config.model || 'gemini-1.5-flash';
    if (!apiKey) throw new Error('请填写 Gemini API Key');
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const contents = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] }));
    const systemMsg = messages.find(m => m.role === 'system');
    const payload = { contents, generationConfig: { temperature: 0.7 } };
    if (systemMsg) payload.systemInstruction = { parts: [{ text: systemMsg.content }] };
    const resp = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body: JSON.stringify(payload) });
    if (!resp.ok) throw new Error(`Gemini 返回错误 (${resp.status})`);
    const data = await resp.json();
    return (data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
  }

  throw new Error(`不支持的 AI 服务：${provider}`);
}
