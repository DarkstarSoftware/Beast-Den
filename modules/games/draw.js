// Doodle Dash: one person draws, everyone else races to guess. Strokes stream live.
'use strict';
const { shuffle, norm, lev } = require('./_util');
const WORDS = `pizza,rocket,bicycle,octopus,volcano,lighthouse,snowman,guitar,dragon,pirate ship,umbrella,castle,robot,sandwich,campfire,giraffe,penguin,rainbow,skateboard,butterfly,cactus,submarine,windmill,hot air balloon,telescope,treasure map,spaceship,elephant,pancakes,tent,waterfall,bridge,sunflower,jellyfish,helicopter,ice cream,scarecrow,mountain,traffic light,vampire,mermaid,tornado,fireworks,ladder,anchor,snail,wizard,backpack,kite,trampoline,hamburger,owl,lightning,pumpkin,tractor,crown,flamingo,popcorn,lantern,cupcake,scissors,hammock,parachute,sloth,donut,compass,rollercoaster,fire truck,cactus,cow,shark,igloo,pretzel,laptop,coffee mug,video call,spreadsheet,password,rubber duck,wifi,cloud,sticky note,headphones,calendar,keyboard,printer,mouse trap,robot vacuum,lunch box,desk plant,whiteboard,fax machine,coffee machine,office chair,hard hat,paper airplane,magnet,battery,satellite,radar,drone,tank top,sunglasses,bowling,picnic,fishing,surfing,snowboard,campfire marshmallow,beehive,dinosaur,unicorn,yeti,ghost,pyramid,statue,eiffel tower,lighthouse keeper,cowboy hat,boomerang,piano,trumpet,drum,microphone,cookie,taco,sushi,watermelon,avocado,banana,broccoli,corn,grapes`.split(',').filter((w, i, a) => a.indexOf(w) === i);
const COLORS = 8, MAXSTROKES = 500, MAXPTS = 2500;

module.exports = ctx => {
  const mask = (g) => g.word.split('').map((c, i) => c === ' ' ? ' ' : g.shown.includes(i) ? c : '_').join('');
  function turn(t) {
    const g = t.g; t.round++;
    while (g.queue[t.round - 1] && !t.players.includes(g.queue[t.round - 1]) && t.round <= t.rounds) t.round++;
    if (t.round > t.rounds || !g.queue[t.round - 1]) return t.finish();
    g.drawer = g.queue[t.round - 1]; g.word = g.bag.pop() || WORDS[0]; g.shown = []; g.strokes = []; g.guessed = {}; g.log = []; g.skipped = false; g.close = {};
    const ms = t.opts.secs * 1000; t.setPhase('draw', ms); t.after('end', ms + 300, () => end(t));
    const letters = g.word.replace(/ /g, '').length;
    if (letters > 3) { t.after('h1', ms * 0.4, () => hint(t)); t.after('h2', ms * 0.7, () => hint(t)); }
  }
  function hint(t) { const g = t.g; const idx = [...g.word].map((c, i) => c !== ' ' && !g.shown.includes(i) ? i : -1).filter(i => i >= 0); if (idx.length > 2) g.shown.push(idx[Math.floor(Math.random() * idx.length)]); }
  function end(t) {
    const g = t.g; if (t.phase !== 'draw') return; t.cancelAll();
    t.setPhase('reveal', 7000); t.after('next', 7000, () => { t.cancel('next'); turn(t); });
  }
  return {
    id: 'draw', name: 'Doodle Dash', emoji: '🎨', min: 2, max: 12, lateJoin: false,
    desc: 'Draw the word, or guess what your coworker is drawing. Terrible art encouraged.',
    how: 'Each player gets turns as the artist. Guessers type in the box, the faster the better. Letters appear as hints while time runs down. The artist scores when people get it, so draw clearly, not beautifully.',
    opts: [{ key: 'turns', label: 'Turns each', choices: [1, 2], def: 1 }, { key: 'secs', label: 'Seconds per drawing', choices: [60, 80, 100], def: 80 }],
    start(t) {
      const order = shuffle(t.players); t.g = { queue: [], bag: shuffle(WORDS) };
      for (let i = 0; i < t.opts.turns; i++) t.g.queue.push(...order);
      t.rounds = t.g.queue.length; turn(t);
    },
    onLeave(t, uid) { if (t.g.drawer === uid && t.phase === 'draw') end(t); },
    act(t, user, b) {
      const g = t.g;
      if (b.type === 'stroke') {
        if (t.phase !== 'draw' || user.id !== g.drawer) return;
        const s = b.s || {}; const id = String(s.id || '').slice(0, 12); if (!id) return;
        const pts = (Array.isArray(s.p) ? s.p : []).slice(0, 600).map(p => [ctx.clamp(Math.round(+p[0]) || 0, 0, 1000), ctx.clamp(Math.round(+p[1]) || 0, 0, 1000)]);
        const from = Math.max(0, Math.floor(+s.from) || 0);
        let st = g.strokes.find(x => x.id === id);
        if (!st) { if (g.strokes.length >= MAXSTROKES) return; st = { id, c: ctx.clamp(Math.floor(+s.c) || 0, 0, COLORS), w: ctx.clamp(Math.floor(+s.w) || 6, 2, 40), p: [] }; g.strokes.push(st); }
        if (from > st.p.length) return; st.p = st.p.slice(0, from).concat(pts).slice(0, MAXPTS);
        t.fx('stroke', { s: { id, c: st.c, w: st.w, from, p: pts } }, user.id); return;
      }
      if (b.type === 'undo' || b.type === 'clear') {
        if (t.phase !== 'draw' || user.id !== g.drawer) return;
        if (b.type === 'undo') g.strokes.pop(); else g.strokes = [];
        t.fx(b.type, {}, user.id); return;
      }
      if (b.type === 'skip') {
        if (t.phase !== 'draw' || user.id !== g.drawer || g.skipped || g.strokes.length > 2) return;
        g.skipped = true; g.word = g.bag.pop() || g.word; g.shown = []; return;
      }
      if (b.type === 'guess') {
        if (t.phase !== 'draw' || user.id === g.drawer || g.guessed[user.id]) return;
        const text = ctx.clean(b.text, 40); if (!text) return;
        if (norm(text) === norm(g.word)) {
          const frac = Math.max(0, (t.deadline - Date.now()) / t.phaseMs); const n = Object.keys(g.guessed).length;
          const pts = Math.round(150 + 350 * frac - n * 30); g.guessed[user.id] = pts; t.add(user.id, pts); t.add(g.drawer, 70);
          g.log.push({ uid: user.id, kind: 'ok' });
          if (t.players.filter(u => u !== g.drawer).every(u => g.guessed[u])) end(t);
          return { result: 'right', pts };
        }
        const w = norm(g.word), x = norm(text); const close = w.length > 3 && lev(x, w) <= 1;
        g.log.push({ uid: user.id, kind: 'guess', text: x === w ? '' : text });
        if (g.log.length > 60) g.log.shift();
        if (close) ctx.sendTo(user.id, 'game-fx', { table: t.id, kind: 'close' });
        return { result: close ? 'close' : 'miss' };
      }
    },
    view(t, uid, full) {
      const g = t.g; if (!g.drawer) return {};
      const reveal = t.phase === 'reveal' || t.state === 'over'; const isDrawer = uid === g.drawer;
      const out = { drawer: g.drawer, secs: t.opts.secs, mask: mask(g), len: g.word.length, guessed: Object.fromEntries(Object.entries(g.guessed).map(([u, p]) => [u, reveal ? p : 1])), log: g.log.slice(-40), skipped: g.skipped };
      if (isDrawer || reveal) out.word = g.word;
      if (full) out.strokes = g.strokes;
      return out;
    },
  };
};
