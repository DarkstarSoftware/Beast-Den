// Weekly team quest: one small, healthy habit. Everyone checks in once a day; the whole Den fills the bar together.
'use strict';
const QUESTS = [
  { id: 'outside', emoji: '🌳', title: 'Touch grass', desc: 'Step outside for ten minutes. Sun, rain, snow, whatever you have.', badge: '🌳' },
  { id: 'water', emoji: '💧', title: 'Hydration station', desc: 'Finish a full glass of water before lunch.', badge: '💧' },
  { id: 'stretch', emoji: '🧘', title: 'Unfold', desc: 'Stand up and stretch for three minutes between meetings.', badge: '🧘' },
  { id: 'hello', emoji: '👋', title: 'Say hello first', desc: 'Message someone you have not talked to in a month.', badge: '👋' },
  { id: 'walk', emoji: '🚶', title: 'Walk it out', desc: 'Take a walk instead of one sit-down call, or after lunch.', badge: '👟' },
  { id: 'gratitude', emoji: '✨', title: 'One good thing', desc: 'Notice one good thing from your day and tell someone about it.', badge: '✨' },
];

module.exports = ctx => {
  const { state } = ctx;
  function weekKey(d = new Date()) {
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dayNum = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - dayNum + 3);
    const first = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
    const week = 1 + Math.round(((t - first) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
    return { key: `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`, n: t.getUTCFullYear() * 53 + week };
  }
  function current() {
    const wk = weekKey(); const def = QUESTS[wk.n % QUESTS.length];
    const q = (state.quests[wk.key] = state.quests[wk.key] || { id: def.id, count: 0, byUser: {}, days: {}, done: false });
    const users = Object.keys(state.users).length;
    const goal = Math.max(10, users * 3);
    return { key: wk.key, def, q, goal };
  }
  function view(user) {
    const { key, def, q, goal } = current();
    const top = Object.entries(q.byUser).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, n]) => ({ ...ctx.publicUser(state.users[id]), n })).filter(x => x.id);
    return { key, id: def.id, emoji: def.emoji, title: def.title, desc: def.desc, badge: def.badge, goal, count: q.count, done: q.done, mine: q.byUser[user.id] || 0, checkedToday: !!(q.days[user.id] || {})[ctx.today()], top, participants: Object.keys(q.byUser).length };
  }

  return {
    id: 'quests',
    routes: {
      'GET /api/quest': ({ user }) => view(user),
      'POST /api/quest/checkin': ({ user }) => {
        const { def, q, goal } = current(); const today = ctx.today();
        const days = (q.days[user.id] = q.days[user.id] || {});
        if (days[today]) throw ctx.err(409, 'Already checked in today. See you tomorrow.');
        days[today] = true; q.byUser[user.id] = (q.byUser[user.id] || 0) + 1; q.count++;
        user.points = (user.points || 0) + 2; ctx.bump(3);
        let completed = false;
        if (!q.done && q.count >= goal) {
          q.done = true; completed = true;
          for (const id of Object.keys(q.byUser)) { const u = state.users[id]; if (u) { u.badges = [...new Set([...(u.badges || []), def.badge])]; ctx.broadcast('user', ctx.publicUser(u)); } }
          ctx.broadcast('toast', { text: `Quest complete: ${def.title}. Everyone who checked in earned ${def.badge}.`, confetti: true });
          ctx.bump(10);
        }
        ctx.save(); ctx.broadcast('quest', { count: q.count, goal, done: q.done, participants: Object.keys(q.byUser).length });
        return { completed, view: view(user) };
      },
    },
    bootstrap: user => { const v = view(user); return { title: v.title, emoji: v.emoji, count: v.count, goal: v.goal, checkedToday: v.checkedToday }; },
  };
};
