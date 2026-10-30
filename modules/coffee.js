// Coffee Roulette: press a button, get paired with a random teammate who also wants a break.
'use strict';
const PROMPTS = [
  'What is the best thing you ate this week?', 'What is your go-to song when you need to get things done?', 'What did you want to be when you were ten?',
  'What is a small thing that made your week better?', 'Which show or book would you make everyone watch or read?', 'What is the most useful thing you learned in the last year?',
  'If you could teleport anywhere for lunch, where?', 'What does your work-from-home setup get wrong?', 'What is your hidden talent?',
  'What is a hobby you would pick up if you had two more hours a day?', 'What is the best trip you ever took?', 'What is your most-used app that is not email or chat?',
  'Mountains, beach, or city? Defend your answer.', 'What is the best advice you ever got?', 'What would you cook for a dinner party of strangers?',
  'What is something you are looking forward to?', 'What did you do for fun as a kid that you still love?', 'What is a skill you wish you had picked up earlier?',
];

module.exports = ctx => {
  const { mem, state } = ctx;
  mem.coffeeQueue = []; // [{ uid, since }]
  mem.coffeeRooms = {}; // roomId -> { members, prompts, ts }
  const HISTORY_DAYS = 21;

  const pick = (arr, n) => { const a = [...arr]; const out = []; while (out.length < n && a.length) out.push(a.splice(Math.floor(Math.random() * a.length), 1)[0]); return out; };
  const recentlyMet = (a, b) => state.coffee.history.some(h => h.t > Date.now() - HISTORY_DAYS * 86400000 && h.pair.includes(a) && h.pair.includes(b));
  const activeRoomOf = uid => Object.entries(mem.coffeeRooms).find(([, r]) => r.members.includes(uid) && !r.over);

  function match(a, b) {
    const room = 'coffee:' + ctx.rid(4);
    mem.coffeeRooms[room] = { members: [a, b], prompts: pick(PROMPTS, 3), ts: Date.now() };
    state.coffee.history.push({ pair: [a, b], t: Date.now() }); state.coffee.history = state.coffee.history.slice(-2000);
    mem.coffeeQueue = mem.coffeeQueue.filter(q => q.uid !== a && q.uid !== b);
    for (const me of [a, b]) {
      const other = me === a ? b : a;
      ctx.sendTo(me, 'coffee', { room, partner: ctx.publicUser(state.users[other]), prompts: mem.coffeeRooms[room].prompts });
    }
    ctx.pushChat(room, a, 'Say hi. Ten minutes, no agenda.', 'event');
    ctx.bump(4); ctx.save();
  }

  return {
    id: 'coffee',
    routes: {
      'POST /api/coffee/join': ({ user }) => {
        const existing = activeRoomOf(user.id);
        if (existing) return { matched: true, room: existing[0] };
        mem.coffeeQueue = mem.coffeeQueue.filter(q => ctx.online(q.uid));
        if (mem.coffeeQueue.some(q => q.uid === user.id)) return { waiting: true };
        const candidates = mem.coffeeQueue.filter(q => q.uid !== user.id);
        const fresh = candidates.find(q => !recentlyMet(user.id, q.uid)) || candidates[0];
        if (fresh) { match(fresh.uid, user.id); return { matched: true }; }
        mem.coffeeQueue.push({ uid: user.id, since: Date.now() });
        ctx.broadcast('coffee-queue', { count: mem.coffeeQueue.length });
        return { waiting: true };
      },
      'POST /api/coffee/leave': ({ user }) => {
        mem.coffeeQueue = mem.coffeeQueue.filter(q => q.uid !== user.id);
        const ex = activeRoomOf(user.id);
        if (ex) { ex[1].over = true; for (const m of ex[1].members) ctx.sendTo(m, 'coffee-end', { room: ex[0] }); }
        ctx.broadcast('coffee-queue', { count: mem.coffeeQueue.length });
        return {};
      },
    },
    bootstrap: user => {
      const ex = activeRoomOf(user.id);
      const met = new Set(state.coffee.history.filter(h => h.pair.includes(user.id)).flatMap(h => h.pair).filter(x => x !== user.id));
      return {
        waiting: mem.coffeeQueue.some(q => q.uid === user.id), queue: mem.coffeeQueue.length, metCount: met.size, chats: state.coffee.history.filter(h => h.pair.includes(user.id)).length,
        active: ex ? { room: ex[0], partner: ctx.publicUser(state.users[ex[1].members.find(m => m !== user.id)]), prompts: ex[1].prompts } : null,
      };
    },
    tick: () => {
      const before = mem.coffeeQueue.length;
      mem.coffeeQueue = mem.coffeeQueue.filter(q => ctx.online(q.uid) && Date.now() - q.since < 15 * 60000);
      for (const [id, r] of Object.entries(mem.coffeeRooms)) {
        if (Date.now() - r.ts > 3 * 3600000) { delete mem.coffeeRooms[id]; delete mem.chat[id]; }
      }
      if (before !== mem.coffeeQueue.length) ctx.broadcast('coffee-queue', { count: mem.coffeeQueue.length });
    },
  };
};
