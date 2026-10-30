// Show & Tell wall: pets, desks, lunches, views. Photos are stored on this server only.
'use strict';
const fs = require('fs');
const path = require('path');
const REACTIONS = ['❤️', '😂', '🔥', '👏', '🐾'];

module.exports = ctx => {
  const { state } = ctx;
  const UPLOADS = path.join(__dirname, '..', 'data', 'uploads');

  const saveImage = ctx.saveImage;
  const view = p => ({ id: p.id, uid: p.uid, text: p.text, img: p.img, ts: p.ts, reacts: p.reacts });

  return {
    id: 'wall',
    routes: {
      'GET /api/wall': ({ query }) => {
        const before = +query.before || Infinity;
        return { posts: state.posts.filter(p => p.ts < before).sort((a, b) => b.ts - a.ts).slice(0, 30).map(view), reactions: REACTIONS };
      },
      'POST /api/post': ({ user, body }) => {
        const text = ctx.cleanMultiline(body.text, 500);
        if (!text && !body.img) throw ctx.err(400, 'Add a photo or a few words.');
        const post = { id: ctx.rid(5), uid: user.id, text, img: body.img ? saveImage(body.img) : null, ts: Date.now(), reacts: {} };
        state.posts.push(post); if (state.posts.length > 500) { const old = state.posts.shift(); if (old.img) fs.unlink(path.join(UPLOADS, path.basename(old.img)), () => {}); }
        ctx.bump(2.5); ctx.save(); ctx.broadcast('wall', { post: view(post) });
        return { post: view(post) };
      },
      'POST /api/react': ({ user, body }) => {
        const p = state.posts.find(x => x.id === body.postId); const e = String(body.emoji);
        if (!p || !REACTIONS.includes(e)) throw ctx.err(400, 'Nothing to react to');
        const list = (p.reacts[e] = p.reacts[e] || []); const i = list.indexOf(user.id);
        if (i >= 0) list.splice(i, 1); else { list.push(user.id); ctx.bump(0.4); }
        if (!list.length) delete p.reacts[e];
        ctx.save(); ctx.broadcast('wall-react', { postId: p.id, reacts: p.reacts });
        return {};
      },
      'POST /api/post/delete': ({ user, body }) => {
        const i = state.posts.findIndex(x => x.id === body.postId);
        if (i < 0 || state.posts[i].uid !== user.id) throw ctx.err(403, 'You can only delete your own posts.');
        const [p] = state.posts.splice(i, 1); if (p.img) fs.unlink(path.join(UPLOADS, path.basename(p.img)), () => {});
        ctx.save(); ctx.broadcast('wall-delete', { postId: p.id }); return {};
      },
    },
    bootstrap: () => ({ count: state.posts.length }),
  };
};
