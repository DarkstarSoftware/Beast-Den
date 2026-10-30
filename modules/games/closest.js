// Closest Wins: everyone types a number, the nearest guess takes the round.
'use strict';
const { shuffle } = require('./_util');
const Q = [
  { q: 'How tall is Mount Everest, in metres?', a: 8849, u: 'm' },
  { q: 'How many bones are in an adult human body?', a: 206 },
  { q: 'How far is the Moon from Earth on average, in kilometres?', a: 384400, u: 'km' },
  { q: 'How many keys are on a standard piano?', a: 88 },
  { q: 'How fast does light travel, in kilometres per second?', a: 299792, u: 'km/s' },
  { q: 'How many member states does the United Nations have?', a: 193 },
  { q: 'How deep is the Challenger Deep in the Mariana Trench, in metres?', a: 10935, u: 'm' },
  { q: 'How tall is the Burj Khalifa, in metres?', a: 828, u: 'm' },
  { q: 'How long is the Earth’s circumference at the equator, in kilometres?', a: 40075, u: 'km' },
  { q: 'How many hearts does an octopus have?', a: 3 },
  { q: 'How hot is the surface of the Sun, in degrees Celsius?', a: 5500, u: '°C' },
  { q: 'How far is the Sun from Earth on average, in millions of kilometres?', a: 149.6, u: 'million km' },
  { q: 'How many elements are on the periodic table?', a: 118 },
  { q: 'How many teeth does a full adult human set have?', a: 32 },
  { q: 'How tall is the Statue of Liberty from ground to torch, in feet?', a: 305, u: 'ft' },
  { q: 'How long is the main span of the Golden Gate Bridge, in metres?', a: 1280, u: 'm' },
  { q: 'How many Olympic gold medals did Michael Phelps win?', a: 23 },
  { q: 'How many hours are in a non-leap year?', a: 8760, u: 'hours' },
  { q: 'How long is a marathon, in kilometres?', a: 42.195, u: 'km' },
  { q: 'How many national parks are in the United States?', a: 63 },
  { q: 'What is the land speed record, in kilometres per hour?', a: 1228, u: 'km/h' },
  { q: 'How long is the Panama Canal, in kilometres?', a: 82, u: 'km' },
  { q: 'How far is New York City from Los Angeles in a straight line, in kilometres?', a: 3940, u: 'km' },
  { q: 'How wide is the Moon, in kilometres?', a: 3474, u: 'km' },
  { q: 'In what year was the first iPhone released?', a: 2007, year: true },
  { q: 'In what year did Apollo 11 land on the Moon?', a: 1969, year: true },
  { q: 'In what year did the Berlin Wall fall?', a: 1989, year: true },
  { q: 'In what year did the Titanic sink?', a: 1912, year: true },
  { q: 'In what year did the first website go online?', a: 1991, year: true },
  { q: 'In what year was the Eiffel Tower completed?', a: 1889, year: true },
  { q: 'In what year were the first modern Olympic Games held?', a: 1896, year: true },
  { q: 'In what year was the US Declaration of Independence signed?', a: 1776, year: true },
  { q: 'In what year was Google founded?', a: 1998, year: true },
  { q: 'In what year did Wikipedia launch?', a: 2001, year: true },
  { q: 'In what year was Pluto discovered?', a: 1930, year: true },
  { q: 'In what year did Sputnik launch?', a: 1957, year: true },
  { q: 'In what year did Edmund Hillary and Tenzing Norgay first summit Everest?', a: 1953, year: true },
];
module.exports = ctx => {
  const score = (q, g) => q.year ? Math.max(0, 1000 - 25 * Math.abs(g - q.a)) : Math.round(1000 * Math.max(0, 1 - Math.abs(Math.log10(g / q.a)) / 0.7));
  function ask(t) { const g = t.g; t.round++; g.q = g.order[t.round - 1]; g.guesses = {}; g.res = null; t.setPhase('ask', t.opts.secs * 1000); t.after('end', t.opts.secs * 1000 + 300, () => reveal(t)); }
  function reveal(t) {
    const g = t.g; if (t.phase !== 'ask') return; t.cancel('end');
    const rows = t.players.filter(u => g.guesses[u] != null).map(uid => ({ uid, guess: g.guesses[uid], pts: score(g.q, g.guesses[uid]), off: Math.abs(g.guesses[uid] - g.q.a) }));
    rows.sort((a, b) => a.off - b.off); if (rows[0]) rows[0].pts += 250;
    for (const r of rows) t.add(r.uid, r.pts);
    g.res = rows; t.setPhase('reveal', 9000); t.after('next', 9000, () => next(t));
  }
  function next(t) { t.cancel('next'); if (t.round >= t.rounds) t.finish(); else ask(t); }
  return {
    id: 'closest', name: 'Closest Wins', emoji: '🎯', min: 1, max: 20, lateJoin: true,
    desc: 'Guess the number. Nobody has to be right, only closer than your coworkers.',
    how: 'Type your best estimate before the clock runs out. Points depend on how close you land, and the closest guess gets a bonus. Year questions reward being within a few years.',
    opts: [{ key: 'rounds', label: 'Questions', choices: [5, 8, 12], def: 8 }, { key: 'secs', label: 'Seconds each', choices: [20, 30, 45], def: 30 }],
    start(t) { t.g = { order: shuffle(Q).slice(0, t.opts.rounds), q: null, guesses: {}, res: null }; t.rounds = t.g.order.length; ask(t); },
    act(t, user, b) {
      if (b.type !== 'guess' || t.phase !== 'ask') return; const g = t.g;
      const n = Number(String(b.value).replace(/,/g, '')); if (!Number.isFinite(n) || n <= 0 || n > 1e12) throw ctx.err(400, 'Type a positive number.');
      if (g.guesses[user.id] != null) throw ctx.err(409, 'Your guess is in.');
      g.guesses[user.id] = n; if (t.players.every(u => g.guesses[u] != null)) reveal(t);
    },
    view(t, uid) {
      const g = t.g, q = g.q; if (!q) return {};
      const out = { q: q.q, unit: q.u || '', year: !!q.year, answered: Object.fromEntries(t.players.map(u => [u, g.guesses[u] != null])), mine: g.guesses[uid] == null ? null : g.guesses[uid] };
      if ((t.phase === 'reveal' || t.state === 'over') && g.res) { out.answer = q.a; out.res = g.res; }
      return out;
    },
  };
};
