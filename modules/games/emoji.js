// Emoji Charades: decode the emoji. Fastest correct guess earns the most.
'use strict';
const { shuffle, matches } = require('./_util');
const P = [
  ['🦁👑', ['lion king'], 'Movie'], ['🕷️🧑', ['spider man', 'spiderman'], 'Movie'], ['🦈🌊', ['jaws'], 'Movie'], ['👻🚫', ['ghostbusters', 'ghost busters'], 'Movie'],
  ['🧊👸❄️', ['frozen'], 'Movie'], ['🐠🔍', ['finding nemo'], 'Movie'], ['🚀⭐⚔️', ['star wars'], 'Movie'], ['🧙‍♂️💍🌋', ['lord of the rings', 'the lord of the rings'], 'Movie'],
  ['🦖🏝️', ['jurassic park', 'jurassic world'], 'Movie'], ['🚢🧊💔', ['titanic'], 'Movie'], ['🐀👨‍🍳', ['ratatouille'], 'Movie'], ['🤖🧹🌱', ['wall e', 'walle'], 'Movie'],
  ['🌧️☂️', ['raining cats and dogs', 'raining'], 'Phrase'], ['🐦🐦🪨', ['kill two birds with one stone', 'two birds one stone'], 'Phrase'], ['🧊🔨', ['break the ice'], 'Phrase'],
  ['🍰🚶', ['piece of cake', 'cakewalk'], 'Phrase'], ['🐘🏠', ['elephant in the room'], 'Phrase'], ['💰🌳', ['money does not grow on trees', 'money tree'], 'Phrase'],
  ['🌙🏃', ['over the moon'], 'Phrase'], ['🐴🛒', ['dont put the cart before the horse', 'cart before the horse'], 'Phrase'], ['🔥🧊', ['fire and ice'], 'Phrase'],
  ['🐛🔨', ['bug fix', 'bugfix', 'fix the bug'], 'Work'], ['📞👥', ['conference call', 'video call', 'group call'], 'Work'], ['📧📥😱', ['inbox zero', 'full inbox'], 'Work'],
  ['🔑🔒💻', ['password', 'login'], 'Work'], ['☁️💾', ['cloud storage', 'the cloud', 'cloud backup'], 'Work'], ['📶❌', ['no wifi', 'no internet'], 'Work'],
  ['📅🗓️😵', ['back to back meetings', 'meeting overload', 'calendar'], 'Work'], ['🦆💬💻', ['rubber duck debugging', 'rubber duck'], 'Work'], ['🔇🎤', ['you are on mute', 'on mute', 'mute'], 'Work'],
  ['🗼🥐', ['paris', 'eiffel tower'], 'Place'], ['🗽🍎', ['new york', 'new york city', 'nyc'], 'Place'], ['🐨🦘🌏', ['australia'], 'Place'], ['🍕🛵🇮🇹', ['italy', 'rome'], 'Place'],
  ['🏔️🧀🍫', ['switzerland'], 'Place'], ['🌴🕶️🌊', ['beach', 'tropical beach', 'miami', 'hawaii'], 'Place'], ['🏯🌸🍣', ['japan', 'tokyo'], 'Place'],
  ['🍔🍟🥤', ['fast food', 'burger and fries', 'burger'], 'Food'], ['🌮🎉', ['taco tuesday', 'tacos'], 'Food'], ['☕😴➡️😃', ['coffee'], 'Food'], ['🍫🏭', ['chocolate factory', 'charlie and the chocolate factory'], 'Movie'],
  ['🎸🔥🎤', ['rock concert', 'rock and roll', 'rock band', 'rock star'], 'Music'], ['💃🕺🪩', ['disco', 'dance party', 'dancing queen'], 'Music'],
  ['⚡🔨👱', ['thor'], 'Movie'], ['🦇🌃', ['batman', 'the dark knight'], 'Movie'], ['🏠🎈👴', ['up'], 'Movie'], ['🧸🤠🚀', ['toy story'], 'Movie'], ['🐼🥋', ['kung fu panda'], 'Movie'],
];
module.exports = ctx => {
  const pattern = a => a.split(' ').map(w => w.length).join(' · ');
  function ask(t) {
    const g = t.g; t.round++; g.p = g.order[t.round - 1]; g.right = {}; g.hintOn = false;
    const ms = t.opts.secs * 1000; t.setPhase('ask', ms); t.after('end', ms + 300, () => reveal(t)); t.after('hint', ms / 2, () => { g.hintOn = true; });
  }
  function reveal(t) { const g = t.g; if (t.phase !== 'ask') return; t.cancel('end'); t.cancel('hint'); t.setPhase('reveal', 6000); t.after('next', 6000, () => next(t)); }
  function next(t) { t.cancel('next'); if (t.round >= t.rounds) t.finish(); else ask(t); }
  return {
    id: 'emoji', name: 'Emoji Charades', emoji: '🤔', min: 1, max: 20, lateJoin: true,
    desc: 'Movies, phrases, places and a little office life, all in emoji. Decode them fast.',
    how: 'Type your guess as many times as you like. Right answers are hidden from the others until the round ends. The category and word lengths are shown, and a letter hint appears at the halfway mark.',
    opts: [{ key: 'rounds', label: 'Puzzles', choices: [6, 10, 15], def: 10 }, { key: 'secs', label: 'Seconds each', choices: [25, 35, 50], def: 35 }],
    start(t) { t.g = { order: shuffle(P).slice(0, t.opts.rounds), p: null, right: {}, hintOn: false }; t.rounds = t.g.order.length; ask(t); },
    act(t, user, b) {
      if (b.type !== 'guess' || t.phase !== 'ask') return; const g = t.g;
      if (g.right[user.id]) return { result: 'already' };
      const text = ctx.clean(b.text, 60); if (!text) return;
      if (matches(text, g.p[1])) {
        const frac = Math.max(0, (t.deadline - Date.now()) / t.phaseMs); const order = Object.keys(g.right).length;
        g.right[user.id] = { pts: Math.round(400 + 500 * frac - order * 40) }; t.add(user.id, g.right[user.id].pts);
        if (t.players.every(u => g.right[u])) reveal(t);
        return { result: 'right', pts: g.right[user.id].pts };
      }
      return { result: 'miss' };
    },
    view(t, uid) {
      const g = t.g, p = g.p; if (!p) return {};
      const rev = t.phase === 'reveal' || t.state === 'over'; const main = p[1][0];
      const out = { e: p[0], cat: p[2], pattern: pattern(main), solved: Object.fromEntries(t.players.map(u => [u, !!g.right[u]])), mine: g.right[uid] || null };
      if (g.hintOn || rev) out.hint = main.split(' ').map(w => w[0] + '…').join(' ');
      if (rev) { out.answer = main.replace(/\b\w/g, c => c.toUpperCase()); out.gains = Object.fromEntries(Object.entries(g.right).map(([u, r]) => [u, r.pts])); }
      return out;
    },
  };
};
