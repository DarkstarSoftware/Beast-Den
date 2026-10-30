// Quick Fire: live trivia showdown. Same question for everyone at once, faster correct answers score more.
'use strict';
const { shuffle } = require('./_util');

module.exports = ctx => {
  function ask(t) {
    const g = t.g; t.round++; g.q = g.order[t.round - 1]; g.picks = {}; g.at = {};
    t.setPhase('ask', t.opts.secs * 1000); t.after('end', t.opts.secs * 1000 + 300, () => reveal(t));
  }
  function reveal(t) {
    const g = t.g; if (t.phase !== 'ask') return; t.cancel('end');
    g.gain = {};
    for (const uid of t.players) { const c = g.picks[uid]; if (c === g.q.answer) { const frac = Math.max(0, 1 - (g.at[uid] || 0) / (t.opts.secs * 1000)); g.gain[uid] = 500 + Math.round(500 * frac); t.add(uid, g.gain[uid]); } }
    t.setPhase('reveal', 6500); t.after('next', 6500, () => next(t));
  }
  function next(t) { t.cancel('next'); if (t.round >= t.rounds) t.finish(); else ask(t); }
  return {
    id: 'quickfire', name: 'Quick Fire', emoji: '⚡', min: 1, max: 20, lateJoin: true,
    desc: 'Live trivia showdown. Same question, same clock, fastest right answer wins big.',
    how: 'Everyone sees each question at the same moment. A correct answer scores 500, plus up to 500 more for speed. Great for a Friday lunch-and-learn warm-up.',
    opts: [{ key: 'rounds', label: 'Questions', choices: [10, 15, 20], def: 10 }, { key: 'secs', label: 'Seconds each', choices: [12, 15, 20], def: 15 }],
    start(t) {
      const pool = ctx.triviaPool ? ctx.triviaPool() : [];
      if (pool.length < 5) { t.state = 'lobby'; throw ctx.err(409, 'The trivia bank is empty. Add questions to data/trivia.json.'); }
      t.g = { order: shuffle(pool).slice(0, t.opts.rounds), q: null, picks: {}, at: {}, gain: {} }; t.rounds = t.g.order.length; ask(t);
    },
    act(t, user, b) {
      if (b.type !== 'pick' || t.phase !== 'ask') return;
      const g = t.g; if (g.picks[user.id] != null) return;
      const i = Math.floor(+b.choice); if (!(i >= 0 && i < 4)) return;
      g.picks[user.id] = i; g.at[user.id] = Date.now() - (t.deadline - t.phaseMs);
      if (t.players.every(u => g.picks[u] != null)) reveal(t);
    },
    view(t, uid) {
      const g = t.g, q = g.q; if (!q) return {};
      const rev = t.phase === 'reveal' || t.state === 'over';
      const out = { q: q.q, options: q.options, answered: Object.fromEntries(t.players.map(u => [u, g.picks[u] != null])), mine: g.picks[uid] == null ? null : g.picks[uid] };
      if (rev) { out.answer = q.answer; out.note = q.note || ''; out.gain = g.gain; out.counts = [0, 1, 2, 3].map(i => Object.values(g.picks).filter(x => x === i).length); }
      return out;
    },
  };
};
