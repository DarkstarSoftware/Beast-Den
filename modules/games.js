// Group games engine. Tables, rounds, timers, scoring and realtime fan-out live here;
// each game is a small plug-in in modules/games/*.js (see README, "Add a game").
'use strict';
const fs = require('fs');
const path = require('path');

module.exports = ctx => {
  const { state } = ctx;
  state.geo = state.geo || { photos: [] };
  const games = {}; const routes = {};
  for (const f of fs.readdirSync(path.join(__dirname, 'games')).filter(f => f.endsWith('.js') && !f.startsWith('_')).sort()) {
    const g = require(path.join(__dirname, 'games', f))(ctx);
    games[g.id] = g; Object.assign(routes, g.routes || {});
    console.log(`    game loaded: ${g.id}`);
  }
  const order = ['geo', 'draw', 'emoji', 'truths', 'closest', 'quickfire'];
  const catalog = Object.values(games).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)).map(g => ({ id: g.id, name: g.name, emoji: g.emoji, desc: g.desc, how: g.how, min: g.min, max: g.max, opts: g.opts || [], lateJoin: !!g.lateJoin }));
  const tables = new Map();
  let lastToast = 0;

  const mine = uid => { for (const t of tables.values()) if (t.players.includes(uid)) return t; return null; };
  const summary = t => ({ id: t.id, game: t.game, host: t.host, state: t.state, players: t.players, round: t.round, rounds: t.rounds, opts: t.opts });
  let tblTimer = null;
  const notifyTables = () => { clearTimeout(tblTimer); tblTimer = setTimeout(() => ctx.broadcast('game-tables', { tables: [...tables.values()].map(summary) }), 80); };

  function view(t, uid, full) {
    const g = games[t.game];
    return {
      id: t.id, game: t.game, host: t.host, state: t.state, phase: t.phase, round: t.round, rounds: t.rounds, opts: t.opts, me: uid,
      left: t.deadline ? Math.max(0, t.deadline - Date.now()) : 0, total: t.phaseMs || 0,
      players: t.players.map(id => ({ id, score: t.scores[id] || 0 })), awards: t.awards || null,
      g: t.state === 'lobby' ? {} : g.view(t, uid, !!full),
    };
  }
  function makeTable(g, host, opts) {
    const t = { id: ctx.rid(3), game: g.id, host: host.id, state: 'lobby', phase: 'lobby', players: [host.id], scores: { [host.id]: 0 }, opts, round: 0, rounds: 0, deadline: 0, phaseMs: 0, created: Date.now(), timers: {}, away: {}, g: {} };
    t.after = (name, ms, fn) => { clearTimeout(t.timers[name]); t.timers[name] = setTimeout(() => { delete t.timers[name]; if (!tables.has(t.id)) return; try { fn(); t.push(); } catch (e) { console.error(e); } }, ms); };
    t.cancel = name => { clearTimeout(t.timers[name]); delete t.timers[name]; };
    t.cancelAll = () => { for (const k of Object.keys(t.timers)) t.cancel(k); };
    t.setPhase = (phase, ms) => { t.phase = phase; t.phaseMs = ms || 0; t.deadline = ms ? Date.now() + ms : 0; };
    t.add = (uid, pts) => { t.scores[uid] = (t.scores[uid] || 0) + Math.round(pts); };
    t.push = (full) => { for (const uid of t.players) ctx.sendTo(uid, 'game', view(t, uid, full)); };
    t.fx = (kind, data, except) => { for (const uid of t.players) if (uid !== except) ctx.sendTo(uid, 'game-fx', { table: t.id, kind, ...data }); };
    t.finish = () => {
      if (t.state === 'over') return;
      t.cancelAll(); t.state = 'over'; t.phase = 'over'; t.deadline = 0; t.phaseMs = 0; t.finished = Date.now();
      const ranked = t.players.slice().sort((a, b) => (t.scores[b] || 0) - (t.scores[a] || 0));
      const top = t.scores[ranked[0]] || 0; t.awards = {};
      for (const uid of ranked) {
        const u = state.users[uid]; if (!u) continue;
        const win = ranked.length > 1 && top > 0 && (t.scores[uid] || 0) === top;
        const day = ctx.today(); u.gameDay = u.gameDay && u.gameDay.d === day ? u.gameDay : { d: day, n: 0 };
        const pts = Math.min(win ? 10 : 3, Math.max(0, 40 - u.gameDay.n)); u.gameDay.n += pts; u.points = (u.points || 0) + pts; t.awards[uid] = { pts, win };
        ctx.broadcast('user', ctx.publicUser(u));
      }
      ctx.bump(4 + ranked.length * 2); ctx.save(); t.push(); notifyTables();
    };
    return t;
  }
  function destroy(t) { t.cancelAll(); tables.delete(t.id); notifyTables(); }
  function leave(t, uid) {
    const i = t.players.indexOf(uid); if (i < 0) return;
    t.players.splice(i, 1); ctx.sendTo(uid, 'game', { id: t.id, gone: true });
    if (!t.players.length) return destroy(t);
    if (t.host === uid) t.host = t.players[0];
    const g = games[t.game];
    if (t.state === 'playing') { try { g.onLeave && g.onLeave(t, uid); } catch (e) { console.error(e); } if (t.state === 'playing' && t.players.length < g.min) t.finish(); }
    t.push(); notifyTables();
  }
  const need = (uid, id) => { const t = tables.get(id); if (!t || !t.players.includes(uid)) throw ctx.err(404, 'That table has closed.'); return t; };

  routes['GET /api/games'] = ({ user }) => { const t = mine(user.id); return { catalog, tables: [...tables.values()].map(summary), mine: t ? view(t, user.id, true) : null }; };
  routes['GET /api/games/table'] = ({ user, query }) => view(need(user.id, query.id), user.id, true);
  routes['POST /api/games/create'] = ({ user, body }) => {
    const g = games[body.game]; if (!g) throw ctx.err(400, 'Unknown game.');
    if (tables.size >= 40) throw ctx.err(429, 'Lots of tables open. Join one instead.');
    const old = mine(user.id); if (old) leave(old, user.id);
    const opts = {}; for (const d of g.opts || []) { const v = body.opts && body.opts[d.key]; opts[d.key] = d.choices.includes(v) ? v : d.def; }
    const t = makeTable(g, user, opts); tables.set(t.id, t);
    if (Date.now() - lastToast > 60000) { lastToast = Date.now(); ctx.broadcast('toast', { text: `${user.name} opened a table of ${g.name}. Join in Games.` }, uid => uid !== user.id); }
    ctx.bump(2); t.push(); notifyTables();
    return { table: view(t, user.id, true) };
  };
  routes['POST /api/games/join'] = ({ user, body }) => {
    const t = tables.get(body.table); if (!t) throw ctx.err(404, 'That table has closed.');
    const g = games[t.game];
    if (t.players.includes(user.id)) return { table: view(t, user.id, true) };
    if (t.state === 'over') throw ctx.err(409, 'That game just finished.');
    if (t.state === 'playing' && !g.lateJoin) throw ctx.err(409, 'That game already started. Open your own table or wait for the next one.');
    if (t.players.length >= g.max) throw ctx.err(409, 'That table is full.');
    const old = mine(user.id); if (old) leave(old, user.id);
    t.players.push(user.id); t.scores[user.id] = 0;
    if (t.state === 'playing' && g.onJoin) g.onJoin(t, user.id);
    ctx.bump(1); t.push(); notifyTables();
    return { table: view(t, user.id, true) };
  };
  routes['POST /api/games/leave'] = ({ user }) => { const t = mine(user.id); if (t) leave(t, user.id); return { ok: true }; };
  routes['POST /api/games/start'] = ({ user, body }) => {
    const t = need(user.id, body.table); const g = games[t.game];
    if (t.host !== user.id) throw ctx.err(403, 'Only the host can start.');
    if (t.state !== 'lobby') throw ctx.err(409, 'Already started.');
    if (t.players.length < g.min) throw ctx.err(409, `Needs at least ${g.min} players.`);
    t.state = 'playing'; g.start(t); t.push(true); notifyTables();
    return { ok: true };
  };
  routes['POST /api/games/act'] = ({ user, body }) => {
    const t = need(user.id, body.table); const g = games[t.game];
    if (t.state !== 'playing') throw ctx.err(409, 'Not in a round right now.');
    const out = g.act(t, user, body) || {};
    t.push(); if (t.state !== 'playing') notifyTables();
    return { ok: true, ...out };
  };

  return {
    id: 'games', routes,
    bootstrap: user => { const t = mine(user.id); return { tables: [...tables.values()].map(summary), mine: t ? view(t, user.id, true) : null }; },
    tick: () => {
      const now = Date.now();
      for (const t of [...tables.values()]) {
        for (const uid of t.players.slice()) { if (ctx.online(uid)) delete t.away[uid]; else { t.away[uid] = t.away[uid] || now; if (now - t.away[uid] > 120000) leave(t, uid); } }
        if (!tables.has(t.id)) continue;
        if (t.state === 'over' && now - t.finished > 15 * 60000) destroy(t);
        else if (t.state === 'lobby' && now - t.created > 45 * 60000) destroy(t);
        else if (t.state === 'playing' && now - t.created > 3 * 3600000) destroy(t);
      }
    },
  };
};
