// Where in the World: a photo appears, everyone drops a pin, closest wins.
// Starter rounds are illustrated postcards; employees add real photos (stored on this server only).
'use strict';
const fs = require('fs');
const path = require('path');
const { shuffle, km } = require('./_util');

module.exports = ctx => {
  const { state } = ctx;
  let seeds = [];
  try { seeds = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'geo-seed.json'), 'utf8')).seeds || []; } catch (e) { console.error('geo-seed.json problem:', e.message); }
  const photos = () => state.geo.photos;
  const SCORE = d => Math.round(5000 * Math.exp(-d / 1500));
  const ok = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  let real = [];
  try { real = (JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'geo-photos.json'), 'utf8')).photos || []).filter(p => p.img && ok(+p.lat, +p.lon)).map(p => ({ ...p, lat: +p.lat, lon: +p.lon, seed: false, real: true })); } catch (e) { /* no photo pack installed */ }
  if (real.length) console.log('  Real photo pack: ' + real.length + ' photos');

  function pool(mode) {
    const team = photos().map(p => ({ ...p, seed: false }));
    const daily = (state.geo.daily || []).map(p => ({ ...p, seed: false, daily: true }));
    return mode === 'Team photos' ? team : mode === 'Postcards' ? seeds : mode === 'Daily photos' ? daily : mode === 'Real photos' ? real : [...(real.length ? real : seeds), ...team, ...daily];
  }
  const eligible = t => t.players.filter(u => u !== (t.g.cur && t.g.cur.uid));
  function startRound(t) {
    const g = t.g; t.round++; g.cur = g.order[t.round - 1]; g.guesses = {}; g.results = null;
    t.setPhase('guess', t.opts.secs * 1000); t.after('end', t.opts.secs * 1000 + 400, () => reveal(t));
  }
  function reveal(t) {
    const g = t.g; if (t.phase !== 'guess') return; t.cancel('end');
    g.results = eligible(t).map(uid => {
      const x = g.guesses[uid]; if (!x) return { uid, pts: 0 };
      const d = km(x.lat, x.lon, g.cur.lat, g.cur.lon); const pts = SCORE(d); t.add(uid, pts);
      return { uid, lat: x.lat, lon: x.lon, km: Math.round(d), pts };
    }).sort((a, b) => b.pts - a.pts);
    t.setPhase('reveal', 14000); t.after('next', 14000, () => next(t));
  }
  function next(t) { t.cancel('next'); if (t.round >= t.rounds) t.finish(); else startRound(t); }

  return {
    id: 'geo', name: 'Where in the World', emoji: '🌍', min: 1, max: 16, lateJoin: true,
    desc: 'A photo appears. Drop a pin where you think it was taken. Closest wins.',
    how: 'Zoom and drag the map, click to place your pin, then lock it in. Faster is not better here, only closer. Add your own photos from the Games page and your coworkers get to guess your travels, hikes and hometown.',
    opts: [{ key: 'rounds', label: 'Rounds', choices: [3, 5, 8], def: 5 }, { key: 'secs', label: 'Seconds per round', choices: [30, 45, 75], def: 45 }, { key: 'src', label: 'Photos', choices: ['Mix', 'Real photos', 'Team photos', 'Postcards', 'Daily photos'], def: 'Mix' }],
    start(t) {
      const items = shuffle(pool(t.opts.src)).slice(0, t.opts.rounds);
      if (!items.length) { t.state = 'lobby'; throw ctx.err(409, t.opts.src === 'Daily photos' ? 'Daily photos are switched off on this server. Pick Mix or Postcards.' : t.opts.src === 'Real photos' ? 'No landmark photo pack is installed yet. See the README, then pick Mix.' : 'No photos in that set yet. Pick Mix or Postcards, or add a team photo.'); }
      t.g = { order: items, cur: null, guesses: {}, results: null }; t.rounds = items.length; startRound(t);
    },
    onJoin() {},
    act(t, user, b) {
      const g = t.g;
      if (b.type === 'next') { if (t.host !== user.id) throw ctx.err(403, 'Only the host can skip ahead.'); if (t.phase === 'reveal') next(t); else if (t.phase === 'guess') reveal(t); return; }
      if (b.type !== 'guess') return;
      if (t.phase !== 'guess') throw ctx.err(409, 'Guessing is closed.');
      if (g.cur.uid === user.id) throw ctx.err(409, 'This is your photo. Sit back and watch.');
      const lat = +b.lat, lon = +b.lon; if (!ok(lat, lon)) throw ctx.err(400, 'That pin is off the map.');
      const prev = g.guesses[user.id]; if (prev && prev.locked) throw ctx.err(409, 'Your pin is locked in.');
      g.guesses[user.id] = { lat, lon, locked: !!b.lock };
      if (eligible(t).every(u => g.guesses[u] && g.guesses[u].locked)) reveal(t);
    },
    view(t, uid) {
      const g = t.g, c = g.cur; if (!c) return {};
      const revealed = t.phase === 'reveal' || t.state === 'over';
      const out = { img: c.img, hint: c.seed ? c.hint : '', by: c.seed || c.daily || c.real ? null : c.uid, credit: c.daily || c.real ? c.credit : '', daily: !!(c.daily || c.real), secs: t.opts.secs, mine: g.guesses[uid] || null, status: Object.fromEntries(eligible(t).map(u => [u, g.guesses[u] ? (g.guesses[u].locked ? 2 : 1) : 0])) };
      if (revealed && g.results) { out.answer = { lat: c.lat, lon: c.lon, label: c.label }; out.results = g.results; }
      return out;
    },
    routes: {
      'GET /api/geo/photos': ({ user }) => ({ total: photos().length, real: real.length, daily: (state.geo.daily || []).length, seeds: seeds.length, mine: photos().filter(p => p.uid === user.id).map(p => ({ id: p.id, img: p.img, label: p.label })) }),
      'POST /api/geo/photo': ({ user, body }) => {
        const lat = +body.lat, lon = +body.lon, label = ctx.clean(body.label, 60);
        if (!ok(lat, lon)) throw ctx.err(400, 'Drop a pin on the map where the photo was taken.');
        if (!label) throw ctx.err(400, 'Add the place name, like “Lisbon, Portugal”.');
        if (photos().filter(p => p.uid === user.id).length >= 15) throw ctx.err(409, 'That is 15 photos already. Remove one to add another.');
        const img = ctx.saveImage(body.img);
        const p = { id: ctx.rid(5), uid: user.id, img, lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100, label, ts: Date.now() };
        photos().push(p); ctx.bump(2); ctx.save();
        ctx.broadcast('toast', { text: `${user.name} added a photo to Where in the World. Can you find it?` }, id => id !== user.id);
        return { photo: { id: p.id, img: p.img, label: p.label } };
      },
      'POST /api/geo/photo/delete': ({ user, body }) => {
        const i = photos().findIndex(p => p.id === body.id && p.uid === user.id); if (i < 0) throw ctx.err(404, 'Not found.');
        const [p] = photos().splice(i, 1); ctx.deleteUpload(p.img); ctx.save(); return { ok: true };
      },
    },
  };
};
