// Daily trivia: same 5 questions for everyone each day, speed bonus, streaks, leaderboards.
// Add your own questions to data/trivia.json (company lore, "whose dog is this?", RFP acronyms).
'use strict';
const fs = require('fs');
const path = require('path');

module.exports = ctx => {
  const { state } = ctx;
  const FILE = path.join(__dirname, '..', 'data', 'trivia.json');
  let pool = [];
  try { const raw = JSON.parse(fs.readFileSync(FILE, 'utf8')); pool = (Array.isArray(raw) ? raw : raw.questions || []).filter(q => q.q && Array.isArray(q.options) && q.options.length === 4 && Number.isInteger(q.answer)); } catch (e) { console.error('trivia.json problem:', e.message); }
  const PER_DAY = 20;
  ctx.triviaPool = () => pool;

  function seeded(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h += 0x6D2B79F5; let t = Math.imul(h ^ (h >>> 15), 1 | h); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function todays(date) {
    const rnd = seeded(date); const idx = pool.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    return idx.slice(0, Math.min(PER_DAY, pool.length)).map(i => pool[i]);
  }
  const ENDLESS_CAP = 30;
  function endlessNext(user) {
    ctx.mem.endless = ctx.mem.endless || new Map();
    const seen = new Set(user.seen || []); let idxs = pool.map((_, i) => i).filter(i => !seen.has(i)); if (!idxs.length) { user.seen = []; idxs = pool.map((_, i) => i); }
    const idx = idxs[Math.floor(Math.random() * idxs.length)]; ctx.mem.endless.set(user.id, { idx, start: Date.now() });
    const d = ctx.today(); const e = user.endlessDay && user.endlessDay.d === d ? user.endlessDay : { n: 0, right: 0, total: 0 };
    return { question: { q: pool[idx].q, options: pool[idx].options, category: pool[idx].cat || '' }, day: { pts: e.n, cap: ENDLESS_CAP, right: e.right, total: e.total }, pool: pool.length };
  }
  const day = date => (state.trivia[date] = state.trivia[date] || {});

  function board() {
    const date = ctx.today(); const d = day(date);
    const row = id => state.users[id] && ctx.publicUser(state.users[id]);
    return {
      today: Object.entries(d).filter(([, r]) => r.done).map(([id, r]) => ({ ...row(id), score: r.score })).sort((a, b) => b.score - a.score).slice(0, 10),
      allTime: Object.values(state.users).filter(u => u.points > 0).sort((a, b) => b.points - a.points).slice(0, 10).map(ctx.publicUser),
      streaks: Object.values(state.users).filter(u => u.streak > 0).sort((a, b) => b.streak - a.streak).slice(0, 10).map(ctx.publicUser),
    };
  }
  function view(user) {
    const date = ctx.today(); const qs = todays(date); const r = day(date)[user.id] || { answers: [], score: 0, done: false };
    const next = r.answers.length;
    return {
      date, total: qs.length, done: !!r.done, score: r.score,
      answers: r.answers.map((a, i) => ({ choice: a.choice, correct: a.correct, answer: qs[i].answer, note: qs[i].note || '' })),
      question: !r.done && qs[next] ? { index: next, q: qs[next].q, options: qs[next].options } : null,
      board: board(),
    };
  }

  return {
    id: 'trivia',
    routes: {
      'GET /api/trivia': ({ user }) => {
        const date = ctx.today(); const d = day(date);
        const r = d[user.id] = d[user.id] || { answers: [], score: 0, done: false, qStart: 0 };
        if (!r.done && !r.qStart) r.qStart = Date.now();
        return view(user);
      },
      // Endless mode: always-available practice questions. Small points, capped per day so the daily board still means something.
      'GET /api/trivia/endless': ({ user }) => endlessNext(user),
      'POST /api/trivia/endless/answer': ({ user, body }) => {
        const cur = ctx.mem.endless && ctx.mem.endless.get(user.id); if (!cur) throw ctx.err(409, 'Out of sync. Grab a fresh question.');
        ctx.mem.endless.delete(user.id);
        const q = pool[cur.idx]; const choice = ctx.clamp(Math.round(+body.choice), -1, 3); const correct = choice === q.answer;
        const elapsed = (Date.now() - cur.start) / 1000; const d = ctx.today();
        const e = user.endlessDay = user.endlessDay && user.endlessDay.d === d ? user.endlessDay : { d, n: 0, right: 0, total: 0 };
        e.total++; if (correct) e.right++;
        const want = correct ? 2 + (elapsed < 6 ? 1 : 0) : 0; const gain = Math.min(want, Math.max(0, ENDLESS_CAP - e.n)); e.n += gain; user.points = (user.points || 0) + gain;
        user.seen = [...(user.seen || []), cur.idx].slice(-Math.max(20, Math.min(250, pool.length - 25)));
        if (gain) ctx.bump(0.2);
        ctx.save(); if (gain) ctx.broadcast('user', ctx.publicUser(user));
        return { correct, answer: q.answer, note: q.note || '', gain, capped: want > gain, day: { pts: e.n, cap: ENDLESS_CAP, right: e.right, total: e.total } };
      },
      'POST /api/trivia/answer': ({ user, body }) => {
        const date = ctx.today(); const qs = todays(date); const d = day(date);
        const r = d[user.id] = d[user.id] || { answers: [], score: 0, done: false, qStart: Date.now() };
        if (r.done) throw ctx.err(409, 'You already finished today. Come back tomorrow.');
        const qi = r.answers.length; const q = qs[qi];
        if (!q || +body.index !== qi) throw ctx.err(409, 'Out of sync. Refresh the question.');
        const choice = ctx.clamp(Math.round(+body.choice), -1, 3);
        const elapsed = (Date.now() - (r.qStart || Date.now())) / 1000;
        const correct = choice === q.answer;
        const bonus = correct ? ctx.clamp(Math.ceil(5 - elapsed / 3), 0, 5) : 0;
        const gain = correct ? 10 + bonus : 0;
        r.answers.push({ choice, correct, ms: Math.round(elapsed * 1000) }); r.score += gain; user.points = (user.points || 0) + gain;
        r.qStart = Date.now();
        if (r.answers.length >= qs.length) {
          r.done = true;
          const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
          user.streak = user.lastTrivia === y ? (user.streak || 0) + 1 : 1; user.lastTrivia = date;
          ctx.bump(3);
          ctx.broadcast('trivia', { by: user.id, score: r.score });
          ctx.broadcast('user', ctx.publicUser(user));
        }
        ctx.save();
        return { correct, answer: q.answer, note: q.note || '', gain, bonus, view: view(user) };
      },
    },
    bootstrap: user => ({ played: !!(day(ctx.today())[user.id] || {}).done, streak: user.streak || 0 }),
  };
};
