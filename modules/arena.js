// Arena: self-reported game stats, leaderboards, challenges and tournament brackets. Works for any game on any platform.
// No outside network access: stats are logged by people, optionally with a screenshot as proof, and the crew polices it with cheers and flags.
'use strict';

// metric: time = lower is better (stored as ms), low = lower number wins, high = higher number wins
const BUILTIN = [
  { id: 'mk8', name: 'Mario Kart 8 Deluxe', platform: 'Switch', metric: 'time', unit: 'Time trial', hint: '1:52.340', kind: 'racing' },
  { id: 'smash', name: 'Super Smash Bros. Ultimate', platform: 'Switch', metric: 'high', unit: 'Win streak', hint: '7', kind: 'fighting' },
  { id: 'splat', name: 'Splatoon 3', platform: 'Switch', metric: 'high', unit: 'Ranked points', hint: '2150', kind: 'shooter' },
  { id: 'zelda', name: 'Zelda: Tears of the Kingdom', platform: 'Switch', metric: 'time', unit: 'Challenge time', hint: '4:31.5', kind: 'adventure' },
  { id: 'tetris', name: 'Tetris', platform: 'Any', metric: 'high', unit: 'High score', hint: '184200', kind: 'puzzle' },
  { id: 'chess', name: 'Chess', platform: 'Any', metric: 'high', unit: 'Rating', hint: '1450', kind: 'puzzle' },
  { id: 'rl', name: 'Rocket League', platform: 'Any', metric: 'high', unit: 'Wins this week', hint: '12', kind: 'sports' },
  { id: 'wordle', name: 'Wordle', platform: 'Any', metric: 'low', unit: 'Guesses (fewer wins)', hint: '3', kind: 'puzzle' },
  { id: 'jd', name: 'Just Dance', platform: 'Switch', metric: 'high', unit: 'Song score', hint: '12840', kind: 'sports' },
];
const KINDS = ['racing', 'fighting', 'shooter', 'adventure', 'puzzle', 'sports', 'other'];
const DAY_CAP = 25;
const HIDE_AT = 2; // flags from different people that hide an entry from the boards

module.exports = ctx => {
  const { state } = ctx;
  const A = state.arena = state.arena || { custom: [], entries: [], challenges: [], tourneys: [] };
  for (const k of ['custom', 'entries', 'challenges', 'tourneys']) A[k] = A[k] || [];

  const games = () => [...BUILTIN, ...A.custom];
  const game = id => games().find(g => g.id === id);
  const better = (m, a, b) => (m === 'high' ? a > b : a < b);
  const pu = id => { const u = state.users[id]; return u ? ctx.publicUser(u) : null; };
  const hidden = e => (e.flags || []).length >= HIDE_AT;

  function parseValue(g, raw) {
    const s = String(raw == null ? '' : raw).trim().replace(/,/g, '');
    if (!s) throw ctx.err(400, 'Enter your result.');
    if (g.metric === 'time') {
      const m = s.match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{1,2}(?:\.\d{1,3})?)$|^(\d{1,4}(?:\.\d{1,3})?)s?$/);
      if (!m) throw ctx.err(400, 'Use a time like 1:52.340 or 52.3');
      let sec;
      if (m[4] != null) sec = parseFloat(m[4]);
      else if (m[1] != null) sec = (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
      else sec = (+m[2]) * 60 + parseFloat(m[3]);
      const ms = Math.round(sec * 1000); if (!(ms > 0) || ms > 86400000) throw ctx.err(400, 'That time looks off.'); return ms;
    }
    const n = Number(s); if (!Number.isFinite(n) || n < 0 || n > 1e12) throw ctx.err(400, 'Enter a number.'); return Math.round(n * 100) / 100;
  }

  function weekStart() { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }

  // best entry per player for a set of entries
  function bestPer(list, m) {
    const best = new Map();
    for (const e of list) { const b = best.get(e.uid); if (!b || better(m, e.value, b.value) || (e.value === b.value && e.ts < b.ts)) best.set(e.uid, e); }
    return [...best.values()].sort((a, b) => (a.value === b.value ? a.ts - b.ts : better(m, a.value, b.value) ? -1 : 1));
  }
  const ev = (e, uid) => ({ id: e.id, gid: e.gid, uid: e.uid, value: e.value, detail: e.detail, note: e.note, img: e.img, ts: e.ts, cid: e.cid || null, cheers: (e.cheers || []).length, cheered: (e.cheers || []).includes(uid), flagged: (e.flags || []).includes(uid) });
  function board(gid, period, uid, limit = 50) {
    const g = game(gid); if (!g) return [];
    const since = period === 'week' ? weekStart() : 0;
    return bestPer(A.entries.filter(e => e.gid === gid && e.ts >= since && !hidden(e)), g.metric).slice(0, limit).map((e, i) => ({ rank: i + 1, ...ev(e, uid) }));
  }

  // ---- challenges ----
  function standings(c, uid) {
    const g = game(c.gid); if (!g) return [];
    return bestPer(A.entries.filter(e => e.cid === c.id && !hidden(e)), g.metric).map((e, i) => ({ rank: i + 1, ...ev(e, uid) }));
  }
  function settle() {
    const now = Date.now(); let changed = false;
    for (const c of A.challenges) {
      if (c.done || c.ends > now) continue; c.done = true; changed = true;
      const st = standings(c, ''); const w = st[0];
      if (w && st.length >= 2) {
        c.winner = w.uid; const u = state.users[w.uid];
        if (u) { u.points = (u.points || 0) + 20; u.badges = [...new Set([...(u.badges || []), '⚡'])]; ctx.broadcast('user', ctx.publicUser(u)); }
        ctx.broadcast('toast', { text: `${u ? u.name : 'Someone'} won the challenge “${c.title}”.` });
      }
    }
    if (changed) { ctx.save(); ctx.broadcast('arena', { kind: 'challenge' }); }
  }
  const cview = (c, uid) => {
    const st = standings(c, uid);
    return { id: c.id, gid: c.gid, title: c.title, uid: c.uid, ends: c.ends, done: !!c.done, winner: c.winner || null, created: c.created, standings: st.slice(0, 5), count: st.length };
  };

  // ---- tournaments ----
  const tview = t => ({ id: t.id, title: t.title, gid: t.gid, host: t.host, state: t.state, players: t.players, rounds: t.rounds, champion: t.champion || null, created: t.created });
  function advance(t, ri, mi) {
    const m = t.rounds[ri][mi]; if (!m.winner) return;
    if (ri === t.rounds.length - 1) {
      t.state = 'done'; t.champion = m.winner; const u = state.users[m.winner];
      if (u) { u.points = (u.points || 0) + 30; u.badges = [...new Set([...(u.badges || []), '🎖️'])]; ctx.broadcast('user', ctx.publicUser(u)); }
      ctx.broadcast('toast', { text: `${u ? u.name : 'Someone'} is the champion of “${t.title}”.` }); return;
    }
    const nx = t.rounds[ri + 1][mi >> 1]; nx[mi % 2 === 0 ? 'a' : 'b'] = m.winner;
  }
  function build(t) {
    const n = t.players.length; let size = 2; while (size < n) size *= 2;
    const p = [...t.players].sort(() => Math.random() - 0.5); const rounds = [];
    const r0 = []; for (let i = 0; i < size / 2; i++) r0.push({ a: p[i] || null, b: p[size - 1 - i] || null, winner: null, rep: {} }); rounds.push(r0);
    for (let s = size / 4; s >= 1; s /= 2) { const r = []; for (let i = 0; i < s; i++) r.push({ a: null, b: null, winner: null, rep: {} }); rounds.push(r); }
    t.rounds = rounds; t.state = 'active';
    r0.forEach((m, i) => { if (m.a && !m.b) { m.winner = m.a; m.bye = true; } advance(t, 0, i); });
  }

  // ---- points ----
  function award(user, n) {
    const d = ctx.today(); const day = user.arenaDay = user.arenaDay && user.arenaDay.d === d ? user.arenaDay : { d, n: 0 };
    const pts = Math.min(n, Math.max(0, DAY_CAP - day.n)); day.n += pts; user.points = (user.points || 0) + pts; return pts;
  }

  function home(uid) {
    settle();
    const ws = weekStart(); const gs = games();
    const used = gs.map(g => { const all = A.entries.filter(e => e.gid === g.id && !hidden(e)); return { g, all, n: all.length, week: all.filter(e => e.ts >= ws).length }; });
    const gl = used.map(({ g, all, n, week }) => {
      const top = bestPer(all.filter(e => e.ts >= ws), g.metric).slice(0, 3); const mine = bestPer(all, g.metric).findIndex(e => e.uid === uid);
      return { ...g, n, week, top: top.map(e => ({ uid: e.uid, value: e.value })), myRank: mine >= 0 ? mine + 1 : null, players: new Set(all.map(e => e.uid)).size };
    });
    // weekly champions: 5/3/2/1 per board
    const pts = {}; for (const { g, all } of used) bestPer(all.filter(e => e.ts >= ws), g.metric).forEach((e, i) => { pts[e.uid] = (pts[e.uid] || 0) + [5, 3, 2][i] || (pts[e.uid] || 0) + 1; });
    const champs = Object.entries(pts).map(([id, p]) => ({ ...pu(id), arena: p })).filter(x => x.id).sort((a, b) => b.arena - a.arena).slice(0, 5);
    const feed = A.entries.filter(e => !hidden(e)).sort((a, b) => b.ts - a.ts).slice(0, 14).map(e => ev(e, uid));
    const now = Date.now();
    return {
      games: gl, champs, feed, kinds: KINDS,
      challenges: A.challenges.filter(c => !c.done || now - c.ends < 3 * 86400000).sort((a, b) => (a.done - b.done) || (a.ends - b.ends)).map(c => cview(c, uid)),
      tourneys: A.tourneys.filter(t => t.state !== 'done' || now - t.created < 14 * 86400000).sort((a, b) => b.created - a.created).slice(0, 12).map(tview),
      users: Object.fromEntries(Object.values(state.users).map(u => [u.id, ctx.publicUser(u)])),
    };
  }
  const ping = kind => ctx.broadcast('arena', { kind });

  return {
    id: 'arena',
    routes: {
      'GET /api/arena': ({ user }) => home(user.id),
      'GET /api/arena/board': ({ user, query }) => {
        const g = game(String(query.gid)); if (!g) throw ctx.err(404, 'Unknown game');
        const period = query.period === 'week' ? 'week' : 'all';
        return { game: g, period, rows: board(g.id, period, user.id), mine: A.entries.filter(e => e.gid === g.id && e.uid === user.id).sort((a, b) => b.ts - a.ts).slice(0, 8).map(e => ev(e, user.id)) };
      },
      'POST /api/arena/log': ({ user, body }) => {
        const g = game(String(body.gid)); if (!g) throw ctx.err(400, 'Pick a game first.');
        const value = parseValue(g, body.value);
        const today = A.entries.filter(e => e.uid === user.id && Date.now() - e.ts < 86400000).length;
        if (today >= 12) throw ctx.err(429, 'That is plenty for one day. Come back tomorrow.');
        let cid = null;
        if (body.cid) { const c = A.challenges.find(x => x.id === body.cid); if (!c || c.done || c.ends < Date.now() || c.gid !== g.id) throw ctx.err(400, 'That challenge is closed.'); cid = c.id; }
        const prev = bestPer(A.entries.filter(e => e.gid === g.id && e.uid === user.id), g.metric)[0];
        const e = { id: ctx.rid(5), gid: g.id, uid: user.id, value, detail: ctx.clean(body.detail, 40), note: ctx.clean(body.note, 140), img: body.img ? ctx.saveImage(body.img) : null, ts: Date.now(), cid, cheers: [], flags: [] };
        const before = board(g.id, 'all', '', 100); const wasTop = before[0] && before[0].uid === user.id;
        A.entries.push(e); if (A.entries.length > 4000) { const old = A.entries.shift(); ctx.deleteUpload(old.img); }
        const pb = !prev || better(g.metric, value, prev.value);
        const pts = award(user, !prev ? 3 : pb ? 5 : 1);
        const after = board(g.id, 'all', ''); let note = null;
        if (after.length >= 3 && after[0].uid === user.id && !wasTop) {
          user.badges = [...new Set([...(user.badges || []), '🏆'])]; note = 'top';
          const prevTop = before[0] && state.users[before[0].uid]; ctx.broadcast('toast', { text: `${user.name} just took #1 on ${g.name}${prevTop ? ' from ' + prevTop.name : ''}.` });
        }
        ctx.bump(1.5); ctx.save(); ctx.broadcast('user', ctx.publicUser(user)); ping('entry');
        return { entry: ev(e, user.id), pb, pts, rank: (after.find(x => x.uid === user.id) || {}).rank || null, top: note === 'top' };
      },
      'POST /api/arena/cheer': ({ user, body }) => {
        const e = A.entries.find(x => x.id === body.id); if (!e) throw ctx.err(404, 'Not found');
        if (e.uid === user.id) throw ctx.err(400, 'Cheer someone else on.');
        const i = e.cheers.indexOf(user.id); if (i >= 0) e.cheers.splice(i, 1); else { e.cheers.push(user.id); ctx.bump(0.3); }
        ctx.save(); ping('cheer'); return { cheers: e.cheers.length, cheered: i < 0 };
      },
      'POST /api/arena/flag': ({ user, body }) => {
        const e = A.entries.find(x => x.id === body.id); if (!e) throw ctx.err(404, 'Not found');
        if (e.uid === user.id) throw ctx.err(400, 'That is your own entry.');
        const i = e.flags.indexOf(user.id); if (i >= 0) e.flags.splice(i, 1); else e.flags.push(user.id);
        ctx.save(); ping('flag'); return { hidden: hidden(e) };
      },
      'POST /api/arena/delete': ({ user, body }) => {
        const i = A.entries.findIndex(x => x.id === body.id); if (i < 0 || A.entries[i].uid !== user.id) throw ctx.err(403, 'You can only remove your own entries.');
        const [e] = A.entries.splice(i, 1); ctx.deleteUpload(e.img); ctx.save(); ping('delete'); return {};
      },
      'POST /api/arena/game': ({ user, body }) => {
        const name = ctx.clean(body.name, 40); if (name.length < 2) throw ctx.err(400, 'Give the game a name.');
        if (games().some(g => g.name.toLowerCase() === name.toLowerCase())) throw ctx.err(400, 'That game is already here.');
        if (A.custom.length >= 40) throw ctx.err(400, 'The game list is full.');
        const metric = ['time', 'low', 'high'].includes(body.metric) ? body.metric : 'high';
        const g = { id: 'c' + ctx.rid(3), name, platform: ctx.clean(body.platform, 20) || 'Any', metric, unit: ctx.clean(body.unit, 30) || (metric === 'time' ? 'Best time' : 'Best score'), hint: metric === 'time' ? '1:23.456' : '1000', kind: KINDS.includes(body.kind) ? body.kind : 'other', by: user.id };
        A.custom.push(g); ctx.save(); ping('game'); return { game: g };
      },
      'POST /api/arena/challenge': ({ user, body }) => {
        const g = game(String(body.gid)); if (!g) throw ctx.err(400, 'Pick a game.');
        const title = ctx.clean(body.title, 60); if (title.length < 3) throw ctx.err(400, 'Name your challenge.');
        if (A.challenges.filter(c => !c.done && c.uid === user.id).length >= 2) throw ctx.err(400, 'You already have two live challenges.');
        const days = [1, 3, 7].includes(+body.days) ? +body.days : 3;
        const c = { id: ctx.rid(4), gid: g.id, title, uid: user.id, created: Date.now(), ends: Date.now() + days * 86400000, done: false };
        A.challenges.push(c); ctx.bump(2); ctx.save(); ping('challenge'); ctx.broadcast('toast', { text: `${user.name} posted a challenge: ${title}` }); return { challenge: cview(c, user.id) };
      },
      'POST /api/arena/t/create': ({ user, body }) => {
        const title = ctx.clean(body.title, 60); if (title.length < 3) throw ctx.err(400, 'Name your tournament.');
        const g = game(String(body.gid)); if (!g) throw ctx.err(400, 'Pick a game.');
        if (A.tourneys.filter(t => t.state === 'open' && t.host === user.id).length >= 2) throw ctx.err(400, 'You already have open sign-ups.');
        const t = { id: ctx.rid(4), title, gid: g.id, host: user.id, state: 'open', players: [user.id], rounds: [], created: Date.now() };
        A.tourneys.push(t); ctx.bump(2); ctx.save(); ping('tourney'); ctx.broadcast('toast', { text: `${user.name} opened sign-ups for ${title}.` }); return { id: t.id };
      },
      'POST /api/arena/t/join': ({ user, body }) => {
        const t = A.tourneys.find(x => x.id === body.id); if (!t || t.state !== 'open') throw ctx.err(400, 'Sign-ups are closed.');
        const i = t.players.indexOf(user.id); if (i >= 0) { if (user.id === t.host) throw ctx.err(400, 'The host is always in.'); t.players.splice(i, 1); }
        else { if (t.players.length >= 16) throw ctx.err(400, 'This bracket is full.'); t.players.push(user.id); }
        ctx.save(); ping('tourney'); return {};
      },
      'POST /api/arena/t/start': ({ user, body }) => {
        const t = A.tourneys.find(x => x.id === body.id); if (!t || t.host !== user.id) throw ctx.err(403, 'Only the host can start it.');
        if (t.state !== 'open') throw ctx.err(400, 'Already started.'); if (t.players.length < 3) throw ctx.err(400, 'You need at least three players.');
        build(t); ctx.save(); ping('tourney'); ctx.broadcast('toast', { text: `${t.title} is on. Check your bracket.` }); return {};
      },
      'POST /api/arena/t/cancel': ({ user, body }) => {
        const i = A.tourneys.findIndex(x => x.id === body.id); if (i < 0 || A.tourneys[i].host !== user.id) throw ctx.err(403, 'Only the host can cancel.');
        A.tourneys.splice(i, 1); ctx.save(); ping('tourney'); return {};
      },
      'POST /api/arena/t/report': ({ user, body }) => {
        const t = A.tourneys.find(x => x.id === body.id); if (!t || t.state !== 'active') throw ctx.err(400, 'Nothing to report.');
        const m = (t.rounds[+body.r] || [])[+body.i]; if (!m || m.winner) throw ctx.err(400, 'That match is already settled.');
        if (!m.a || !m.b) throw ctx.err(400, 'Waiting on the previous round.');
        const w = String(body.winner); if (w !== m.a && w !== m.b) throw ctx.err(400, 'Pick one of the two players.');
        const isHost = t.host === user.id; if (!isHost && user.id !== m.a && user.id !== m.b) throw ctx.err(403, 'Only the two players or the host can report.');
        if (isHost) { m.winner = w; m.dispute = false; }
        else { m.rep[user.id] = w; const ra = m.rep[m.a], rb = m.rep[m.b]; if (ra && rb) { if (ra === rb) m.winner = ra; else m.dispute = true; } }
        if (m.winner) advance(t, +body.r, +body.i);
        ctx.save(); ping('tourney'); return {};
      },
    },
    bootstrap: () => ({ entries: A.entries.length }),
    tick: settle,
  };
};
