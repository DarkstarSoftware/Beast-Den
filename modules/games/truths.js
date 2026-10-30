// Two Truths and a Lie: write three things about yourself, then work out whose lie is whose.
'use strict';
const { shuffle } = require('./_util');

module.exports = ctx => {
  function endWrite(t) {
    const g = t.g; t.cancel('write');
    g.queue = shuffle(Object.keys(g.subs).filter(u => t.players.includes(u)));
    if (g.queue.length < 2) { g.noGame = true; return t.finish(); }
    t.rounds = g.queue.length; turn(t);
  }
  function turn(t) {
    const g = t.g; t.round++; g.author = g.queue[t.round - 1]; g.votes = {}; g.res = null;
    const s = g.subs[g.author]; g.order = shuffle([0, 1, 2]); g.items = g.order.map(i => s.s[i]); g.lieAt = g.order.indexOf(s.lie);
    t.setPhase('vote', 35000); t.after('end', 35300, () => reveal(t));
  }
  function reveal(t) {
    const g = t.g; if (t.phase !== 'vote') return; t.cancel('end');
    const voters = t.players.filter(u => u !== g.author && g.votes[u] != null);
    const fooled = voters.filter(u => g.votes[u] !== g.lieAt);
    const caught = voters.filter(u => g.votes[u] === g.lieAt);
    for (const u of caught) t.add(u, 500); t.add(g.author, 250 * fooled.length);
    g.res = { fooled, caught, authorGain: 250 * fooled.length }; t.setPhase('reveal', 9000); t.after('next', 9000, () => next(t));
  }
  function next(t) { t.cancel('next'); if (t.round >= t.rounds) t.finish(); else turn(t); }
  return {
    id: 'truths', name: 'Two Truths & a Lie', emoji: '🕵️', min: 3, max: 12, lateJoin: false,
    desc: 'Write two true things and one lie about yourself. Your team works out which is which.',
    how: 'Everyone writes three statements, two true and one false. Then each person takes a turn while the others vote for the lie. Spot the lie to score. Fool people to score more. Keep it friendly and work-safe, and share only what you are happy to share.',
    opts: [],
    start(t) { t.g = { subs: {}, queue: [], author: null }; t.setPhase('write', 180000); t.after('write', 180300, () => endWrite(t)); },
    onLeave(t, uid) {
      const g = t.g; delete g.subs[uid];
      if (t.phase === 'write') { if (t.players.length && t.players.every(u => g.subs[u])) endWrite(t); }
      else if (g.author === uid && t.phase === 'vote') { t.cancel('end'); t.setPhase('reveal', 3000); g.res = { fooled: [], caught: [], authorGain: 0, left: true }; t.after('next', 3000, () => next(t)); }
    },
    act(t, user, b) {
      const g = t.g;
      if (b.type === 'submit') {
        if (t.phase !== 'write') throw ctx.err(409, 'Writing time is over.');
        const s = (Array.isArray(b.s) ? b.s : []).slice(0, 3).map(x => ctx.clean(x, 110)); const lie = Math.floor(+b.lie);
        if (s.length !== 3 || s.some(x => x.length < 3)) throw ctx.err(400, 'Write all three statements.');
        if (!(lie >= 0 && lie < 3)) throw ctx.err(400, 'Mark which one is the lie.');
        g.subs[user.id] = { s, lie };
        if (t.players.every(u => g.subs[u])) endWrite(t);
      } else if (b.type === 'vote') {
        if (t.phase !== 'vote') return; if (user.id === g.author) throw ctx.err(409, 'You are the author. Keep a poker face.');
        const v = Math.floor(+b.choice); if (!(v >= 0 && v < 3)) return;
        g.votes[user.id] = v; if (t.players.filter(u => u !== g.author).every(u => g.votes[u] != null)) reveal(t);
      }
    },
    view(t, uid) {
      const g = t.g;
      if (t.phase === 'write') return { submitted: Object.fromEntries(t.players.map(u => [u, !!g.subs[u]])), mine: g.subs[uid] || null };
      if (g.noGame) return { noGame: true };
      const rev = t.phase === 'reveal' || t.state === 'over';
      const out = { author: g.author, items: g.items || [], voted: Object.fromEntries(t.players.map(u => [u, g.votes && g.votes[u] != null])), mine: g.votes && g.votes[uid] != null ? g.votes[uid] : null };
      if (rev && g.res) { out.lie = g.lieAt; out.res = g.res; out.picks = g.votes; }
      return out;
    },
  };
};
