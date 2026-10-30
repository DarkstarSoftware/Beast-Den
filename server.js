// Beast Den — self-hosted virtual clubhouse. Zero dependencies. Realtime over Server-Sent Events.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 4180);
const HOST = process.env.HOST || '127.0.0.1'; // set HOST=0.0.0.0 to serve your internal network / VPN
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const UPLOADS = path.join(DATA, 'uploads');
const STATE_FILE = path.join(DATA, 'den.json');
fs.mkdirSync(UPLOADS, { recursive: true });

/* ---------------- persistent state ---------------- */
let state = { users: {}, posts: [], trivia: {}, quests: {}, coffee: { history: [] }, geo: { photos: [] } };
try { state = { ...state, ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) }; } catch { /* first run */ }
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = STATE_FILE + '.tmp';
    fs.writeFile(tmp, JSON.stringify(state), err => { if (!err) fs.rename(tmp, STATE_FILE, () => {}); });
  }, 700);
}
process.on('SIGINT', () => { try { fs.writeFileSync(STATE_FILE, JSON.stringify(state)); } catch { } process.exit(0); });

/* ---------------- shared context for modules ---------------- */
const mem = { presence: new Map(), clients: new Map(), chat: {}, fireEvents: [], lastFire: 0 };

const ctx = {
  state, mem, save,
  rid: (n = 6) => crypto.randomBytes(n).toString('hex'),
  today: () => new Date().toISOString().slice(0, 10),
  clamp: (n, a, b) => Math.max(a, Math.min(b, n)),
  err: (status, message) => Object.assign(new Error(message), { status }),
  clean: (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max),
  cleanMultiline: (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, max),
  publicUser: u => u && ({ id: u.id, name: u.name, beast: u.beast, badges: u.badges || [], streak: u.streak || 0, points: u.points || 0, focusMin: u.focusMin || 0 }),
  online: uid => (mem.clients.get(uid) || new Set()).size > 0,
};
// Shared photo saver (wall + geo game). Validates type, magic bytes and size; files live in data/uploads.
ctx.saveImage = dataUrl => {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!m) throw ctx.err(400, 'Photos must be JPEG, PNG, or WebP.');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 1_500_000) throw ctx.err(413, 'That photo is too big. Try a smaller one.');
  const magic = buf.subarray(0, 4).toString('hex');
  const ok = (m[1] === 'jpeg' && magic.startsWith('ffd8')) || (m[1] === 'png' && magic === '89504e47') || (m[1] === 'webp' && buf.subarray(0, 4).toString() === 'RIFF');
  if (!ok) throw ctx.err(400, 'That file does not look like a real photo.');
  const name = ctx.rid(8) + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]);
  fs.writeFileSync(path.join(UPLOADS, name), buf);
  return '/uploads/' + name;
};
ctx.deleteUpload = url => { if (url && url.startsWith('/uploads/')) fs.unlink(path.join(UPLOADS, path.basename(url)), () => {}); };

ctx.broadcast = (event, data, filter) => {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [uid, set] of mem.clients) {
    if (filter && !filter(uid)) continue;
    for (const res of set) res.write(payload);
  }
};
ctx.sendTo = (uid, event, data) => {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of mem.clients.get(uid) || []) res.write(payload);
};
ctx.presenceList = () => [...mem.presence.entries()].map(([uid, p]) => ({ ...ctx.publicUser(state.users[uid]), room: p.room, status: p.status }));
ctx.pushPresence = () => ctx.broadcast('presence', ctx.presenceList());

// Fire: every bit of activity warms the Den. It cools with a 40 minute half-life.
const HALF_LIFE = 40 * 60 * 1000;
ctx.fireLevel = () => {
  const now = Date.now();
  mem.fireEvents = mem.fireEvents.filter(e => now - e.t < 6 * 3600 * 1000);
  const sum = mem.fireEvents.reduce((s, e) => s + e.w * Math.pow(0.5, (now - e.t) / HALF_LIFE), 0);
  return Math.min(100, Math.round(sum * 3));
};
ctx.bump = (w = 1) => {
  mem.fireEvents.push({ t: Date.now(), w });
  if (Date.now() - mem.lastFire > 1500) { mem.lastFire = Date.now(); ctx.broadcast('fire', { level: ctx.fireLevel() }); }
};
// Gentle starting warmth so a fresh install is not stone cold.
mem.fireEvents.push({ t: Date.now(), w: 3 });

/* ---------------- modules ---------------- */
const routes = {};       // 'METHOD /path' -> handler(ctx, { user, body, query })
const bootstraps = {};   // module id -> fn(user) => data
const ticks = [];
const publicRoutes = new Set(['POST /api/join']);
for (const f of fs.readdirSync(path.join(ROOT, 'modules')).filter(f => f.endsWith('.js') && !f.startsWith('_')).sort()) {
  const m = require(path.join(ROOT, 'modules', f))(ctx);
  Object.assign(routes, m.routes || {});
  if (m.bootstrap) bootstraps[m.id] = m.bootstrap;
  if (m.tick) ticks.push(m.tick);
  console.log(`  module loaded: ${m.id}`);
}
setInterval(() => { for (const t of ticks) { try { t(); } catch (e) { console.error(e); } } ctx.broadcast('fire', { level: ctx.fireLevel() }); }, 15000);

/* ---------------- core routes ---------------- */
publicRoutes.add('GET /api/health');
routes['GET /api/health'] = () => ({ ok: true });
publicRoutes.add('GET /api/brand');
routes['GET /api/brand'] = () => { for (const f of ['logo.svg', 'logo.png']) if (fs.existsSync(path.join(PUBLIC, 'brand', f))) return { src: '/brand/' + f }; return { src: null }; };

// ---- avatars: a beast or a person, validated field by field ----
const int = (v, lo, hi) => ctx.clamp(Math.round(+v || 0), lo, hi);
ctx.cleanAvatar = b => {
  b = b || {};
  if (b.kind === 'person') return { kind: 'person', skin: int(b.skin, 0, 5), hair: int(b.hair, 0, 7), hc: int(b.hc, 0, 7), eyes: int(b.eyes, 0, 3), mouth: int(b.mouth, 0, 3), fh: int(b.fh, 0, 2), acc: int(b.acc, 0, 4), hue: int(b.hue, 0, 359) };
  return { hue: int(b.hue, 0, 359), ears: int(b.ears, 0, 2), eyes: int(b.eyes, 0, 3), mouth: int(b.mouth, 0, 2), acc: int(b.acc, 0, 4) };
};
// ---- sign-in: optional PIN (scrypt-hashed). Names are unique so people can sign back in by name. ----
const hashPin = (pin, salt = crypto.randomBytes(12).toString('hex')) => ({ salt, hash: crypto.scryptSync(String(pin), salt, 32).toString('hex') });
const pinOk = (u, pin) => { if (!u.pin) return false; const h = crypto.scryptSync(String(pin), u.pin.salt, 32); const want = Buffer.from(u.pin.hash, 'hex'); return h.length === want.length && crypto.timingSafeEqual(h, want); };
const cleanPin = p => { const s = String(p == null ? '' : p).trim(); if (s.length < 4 || s.length > 20) throw ctx.err(400, 'A PIN needs 4 to 20 characters.'); return s; };
const nameTaken = (name, exceptId) => Object.values(state.users).some(x => x.id !== exceptId && x.name.toLowerCase() === name.toLowerCase());
const attempts = new Map();
setInterval(() => { const now = Date.now(); for (const [k, v] of attempts) if (v.until < now && now - v.last > 600000) attempts.delete(k); }, 60000);

routes['POST /api/join'] = ({ body, req }) => {
  const name = ctx.clean(body.name, 24);
  if (!name) throw ctx.err(400, 'Pick a name first.');
  if (nameTaken(name)) throw ctx.err(409, 'That name is taken. If it is you, use Sign in.');
  const id = ctx.rid(8);
  const u = state.users[id] = { id, name, beast: ctx.cleanAvatar(body.beast), created: Date.now(), points: 0, streak: 0, badges: [], focusMin: 0 };
  if (body.pin) u.pin = hashPin(cleanPin(body.pin));
  ctx.bump(2); save();
  ctx.broadcast('user', ctx.publicUser(u));
  return { user: { ...ctx.publicUser(u), hasPin: !!u.pin } };
};
publicRoutes.add('POST /api/login');
routes['POST /api/login'] = ({ body, req }) => {
  const name = ctx.clean(body.name, 24).toLowerCase(); const ip = (req && req.socket && req.socket.remoteAddress) || '?';
  const key = ip + '|' + name; const a = attempts.get(key) || { n: 0, until: 0, last: 0 };
  if (a.until > Date.now()) throw ctx.err(429, 'Too many tries. Wait a minute and try again.');
  const u = Object.values(state.users).find(x => x.name.toLowerCase() === name);
  // Same message whether the name or the PIN is wrong, and a hash is always computed so timing does not reveal which.
  const ok = u && u.pin ? pinOk(u, body.pin) : (hashPin(String(body.pin || '')), false);
  if (!ok) { a.n++; a.last = Date.now(); if (a.n >= 5) { a.until = Date.now() + 60000; a.n = 0; } attempts.set(key, a); throw ctx.err(403, 'That name and PIN do not match.'); }
  attempts.delete(key);
  return { user: { ...ctx.publicUser(u), hasPin: true } };
};
routes['POST /api/profile'] = ({ user, body }) => {
  const name = ctx.clean(body.name, 24); if (!name) throw ctx.err(400, 'Every avatar needs a name.');
  if (nameTaken(name, user.id)) throw ctx.err(409, 'That name is taken.');
  user.name = name; user.beast = ctx.cleanAvatar(body.beast); save();
  ctx.broadcast('user', ctx.publicUser(user)); if (mem.presence.has(user.id)) ctx.pushPresence();
  return { user: { ...ctx.publicUser(user), hasPin: !!user.pin } };
};
routes['POST /api/pin'] = ({ user, body }) => {
  if (user.pin && !pinOk(user, body.current)) throw ctx.err(403, 'Your current PIN is not right.');
  if (body.remove) { delete user.pin; save(); return { hasPin: false }; }
  user.pin = hashPin(cleanPin(body.pin)); save(); return { hasPin: true };
};

routes['GET /api/bootstrap'] = ({ user }) => {
  const out = {
    me: { ...ctx.publicUser(user), hasPin: !!user.pin },
    users: Object.fromEntries(Object.values(state.users).map(u => [u.id, ctx.publicUser(u)])),
    presence: ctx.presenceList(),
    fire: ctx.fireLevel(),
    modules: {},
  };
  for (const [id, fn] of Object.entries(bootstraps)) out.modules[id] = fn(user);
  return out;
};

/* ---------------- HTTP ---------------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2' };
const HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store',
};
function send(res, status, body, type = 'application/json; charset=utf-8') { res.writeHead(status, { 'Content-Type': type, ...HEADERS }); res.end(body); }
function readBody(req, limit = 3_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(ctx.err(413, 'Too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(ctx.err(400, 'Bad JSON')); } });
    req.on('error', reject);
  });
}

// Tiny per-user rate limiter (90 requests / 10 s)
const buckets = new Map();
function limited(key) {
  const now = Date.now(); const b = buckets.get(key) || [];
  const recent = b.filter(t => now - t < 10000); recent.push(now); buckets.set(key, recent);
  return recent.length > 90;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of buckets) if (!v.some(t => now - t < 10000)) buckets.delete(k); }, 60000);

function serveFile(res, dir, rel) {
  const file = path.normalize(path.join(dir, rel));
  if (!file.startsWith(dir)) return send(res, 403, 'Forbidden', 'text/plain');
  fs.readFile(file, (e, buf) => e ? send(res, 404, 'Not found', 'text/plain') : send(res, 200, buf, MIME[path.extname(file)] || 'application/octet-stream'));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const key = `${req.method} ${url.pathname}`;
  try {
    if (url.pathname === '/api/stream' && req.method === 'GET') return stream(req, res, url);
    if (url.pathname.startsWith('/api/')) {
      const handler = routes[key];
      if (!handler) throw ctx.err(404, 'Unknown endpoint');
      const body = req.method === 'POST' ? await readBody(req) : {};
      const query = Object.fromEntries(url.searchParams);
      let user = null;
      if (!publicRoutes.has(key)) {
        user = state.users[body.uid || query.uid];
        if (!user) throw ctx.err(401, 'Unknown user. Rejoin the Den.');
        if (limited(user.id)) throw ctx.err(429, 'Slow down a little.');
      }
      const out = await handler({ user, body, query, req });
      return send(res, 200, JSON.stringify(out || { ok: true }));
    }
    if (url.pathname.startsWith('/uploads/')) return serveFile(res, UPLOADS, decodeURIComponent(url.pathname.slice(9)));
    return serveFile(res, PUBLIC, url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname));
  } catch (e) {
    send(res, e.status || 500, JSON.stringify({ error: e.status ? e.message : 'Something went wrong.' }));
    if (!e.status) console.error(e);
  }
});

function stream(req, res, url) {
  const user = state.users[url.searchParams.get('uid')];
  if (!user) { res.writeHead(401, HEADERS); return res.end(); }
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', ...HEADERS });
  res.write('retry: 3000\n\n');
  const set = mem.clients.get(user.id) || new Set(); set.add(res); mem.clients.set(user.id, set);
  if (!mem.presence.has(user.id)) mem.presence.set(user.id, { room: 'kitchen', status: '' });
  ctx.pushPresence();
  const hb = setInterval(() => res.write(': hb\n\n'), 20000);
  req.on('close', () => {
    clearInterval(hb); set.delete(res);
    setTimeout(() => { if (!ctx.online(user.id)) { mem.clients.delete(user.id); mem.presence.delete(user.id); ctx.pushPresence(); for (const t of ticks) { try { t(); } catch { } } } }, 6000);
  });
}

server.listen(PORT, HOST, () => {
  console.log(`\n  Beast Den is open  →  http://localhost:${PORT}   (listening on ${HOST})`);
  if (HOST === '127.0.0.1') console.log('  Local only. To open it to your internal network or VPN, start with HOST=0.0.0.0\n');
});
