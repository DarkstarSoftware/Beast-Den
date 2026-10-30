// Lobby: rooms, presence, chat, emote bursts, shared focus sprints.
'use strict';
const ROOMS = [
  { id: 'kitchen', name: 'The Kitchen', emoji: '☕', blurb: 'Casual chat. Weekend plans, lunch, nonsense.' },
  { id: 'game', name: 'Game Room', emoji: '🎮', blurb: 'Trivia talk, banter, friendly rivalry.' },
  { id: 'focus', name: 'Focus Lounge', emoji: '🎧', blurb: 'Quiet co-working. Start a shared sprint.' },
  { id: 'porch', name: 'The Porch', emoji: '🌿', blurb: 'Step away. Walks, pets, fresh air.' },
];
const EMOTES = ['🎉', '👏', '❤️', '🔥', '😂', '🐾'];

module.exports = ctx => {
  const { mem, state } = ctx;
  mem.focus = null; // { endsAt, minutes, startedBy }
  const roomIds = new Set(ROOMS.map(r => r.id));

  const canUse = (room, uid) => {
    if (roomIds.has(room)) return true;
    const c = mem.coffeeRooms && mem.coffeeRooms[room];
    return !!(c && c.members.includes(uid));
  };
  const focusPublic = () => mem.focus && { endsAt: mem.focus.endsAt, minutes: mem.focus.minutes, startedBy: mem.focus.startedBy };

  function pushChat(room, uid, text, kind = 'msg') {
    const m = { id: ctx.rid(4), uid, text, ts: Date.now(), kind };
    const list = (mem.chat[room] = mem.chat[room] || []);
    list.push(m); if (list.length > 60) list.shift();
    ctx.broadcast('chat', { room, msg: m }, id => roomIds.has(room) ? true : (mem.coffeeRooms[room] || { members: [] }).members.includes(id));
    return m;
  }
  ctx.pushChat = pushChat;

  return {
    id: 'lobby',
    routes: {
      'POST /api/move': ({ user, body }) => {
        const room = String(body.room);
        if (!roomIds.has(room)) throw ctx.err(400, 'No such room');
        const p = mem.presence.get(user.id); if (!p) throw ctx.err(409, 'Not connected');
        if (p.room !== room) { p.room = room; ctx.pushPresence(); ctx.bump(0.3); }
        return {};
      },
      'POST /api/status': ({ user, body }) => {
        const p = mem.presence.get(user.id); if (!p) throw ctx.err(409, 'Not connected');
        p.status = ctx.clean(body.status, 40); ctx.pushPresence(); return {};
      },
      'POST /api/chat': ({ user, body }) => {
        const room = String(body.room);
        if (!canUse(room, user.id)) throw ctx.err(403, 'You are not in that room.');
        const text = ctx.clean(body.text, 400);
        if (!text) throw ctx.err(400, 'Say something first.');
        pushChat(room, user.id, text); ctx.bump(1);
        return {};
      },
      'POST /api/emote': ({ user, body }) => {
        const e = String(body.emoji);
        if (!EMOTES.includes(e)) throw ctx.err(400, 'Unknown emote');
        const p = mem.presence.get(user.id); if (!p) throw ctx.err(409, 'Not connected');
        ctx.broadcast('emote', { uid: user.id, emoji: e, room: p.room }); ctx.bump(0.4);
        return {};
      },
      'POST /api/focus': ({ user, body }) => {
        if (body.action === 'stop') {
          if (mem.focus && mem.focus.startedBy === user.id) { mem.focus = null; ctx.broadcast('focus', null); }
          return {};
        }
        if (mem.focus) throw ctx.err(409, 'A sprint is already running.');
        const minutes = ctx.clamp(Math.round(+body.minutes || 25), 5, 90);
        mem.focus = { endsAt: Date.now() + minutes * 60000, minutes, startedBy: user.id };
        ctx.broadcast('focus', focusPublic()); ctx.bump(2);
        pushChat('focus', user.id, `started a ${minutes} minute focus sprint`, 'event');
        return {};
      },
    },
    bootstrap: user => {
      const chat = {};
      for (const [room, list] of Object.entries(mem.chat)) if (canUse(room, user.id)) chat[room] = list;
      return { rooms: ROOMS, emotes: EMOTES, chat, focus: focusPublic() };
    },
    tick: () => {
      if (mem.focus && Date.now() >= mem.focus.endsAt) {
        const { minutes } = mem.focus; mem.focus = null;
        const there = [...mem.presence.entries()].filter(([, p]) => p.room === 'focus').map(([id]) => id);
        for (const id of there) { const u = state.users[id]; if (u) u.focusMin = (u.focusMin || 0) + minutes; }
        ctx.save(); ctx.broadcast('focus', null);
        ctx.broadcast('toast', { text: `Focus sprint done. ${there.length} ${there.length === 1 ? 'beast' : 'beasts'} stayed the course.`, confetti: there.length > 0 });
        for (const id of there) ctx.broadcast('user', ctx.publicUser(state.users[id]));
        ctx.bump(2 + there.length);
      }
    },
  };
};
