'use strict';
/* Show & Tell wall: pets, desks, lunches, views. */
(() => {
  const { $, esc, api, safe, register, beastSVG, user, S, on, ago, toast, icon } = Den;
  let root = null, posts = [], reactions = ['❤️', '😂', '🔥', '👏', '🐾'], pendingImg = null;

  function card(p) {
    const u = user(p.uid);
    return `<article class="post" data-id="${p.id}">${p.img ? `<img src="${esc(p.img)}" alt="Photo shared by ${esc(u.name)}" loading="lazy">` : ''}
      <div class="pb"><header>${beastSVG(u.beast, 34)}<div><b>${esc(u.name)}</b><time>${ago(p.ts)}</time></div>${p.uid === S.uid ? `<button class="del" data-del="${p.id}" aria-label="Delete post">${icon('trash-2', 16)}</button>` : ''}</header>
      ${p.text ? `<p>${esc(p.text)}</p>` : ''}<div class="reacts">${reactions.map(e => { const n = (p.reacts[e] || []).length; const mine = (p.reacts[e] || []).includes(S.uid); return `<button class="rx ${mine ? 'mine' : ''}" data-rx="${e}" aria-pressed="${mine}" aria-label="React ${e}">${e}${n ? `<i>${n}</i>` : ''}</button>`; }).join('')}</div></div></article>`;
  }
  function drawFeed() {
    const feed = $('#feed', root); if (!feed) return;
    feed.innerHTML = posts.length ? posts.map(card).join('') : `<div class="empty-wall"><span class="empty-ic">${icon('camera', 24)}</span><b>Nothing here yet.</b><p>Share your dog, your desk, your lunch, or the view from your window. The first post sets the tone.</p></div>`;
  }
  function downscale(file) {
    return new Promise((resolve, reject) => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => { const max = 1000; const k = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.82)); };
      img.onerror = () => reject(new Error('Could not read that image.')); img.src = url;
    });
  }
  register({
    id: 'wall', title: 'Show & Tell', short: 'Photos', icon: 'camera', order: 40,
    render(el) {
      root = el; pendingImg = null;
      el.innerHTML = `<div class="wall"><form class="composer" id="wForm"><textarea id="wText" aria-label="Post text" maxlength="500" rows="2" placeholder="Show us your pet, your desk, your lunch, your view…"></textarea><div id="wPrev" class="w-prev" hidden></div><div class="c-actions"><label class="btn small">${icon('image-plus', 16)}Add a photo<input type="file" id="wFile" accept="image/jpeg,image/png,image/webp" hidden></label><button class="btn primary small" id="wPost">Post</button></div></form><div class="feed" id="feed"><div class="loading">Loading the wall…</div></div></div>`;
      safe(async () => { const r = await api('/api/wall'); posts = r.posts; reactions = r.reactions; drawFeed(); });
      $('#wFile', el).onchange = async e => { const f = e.target.files[0]; if (!f) return; await safe(async () => { pendingImg = await downscale(f); const p = $('#wPrev', el); p.hidden = false; p.innerHTML = `<img src="${pendingImg}" alt="Preview"><button type="button" id="wClear" aria-label="Remove photo">${icon('x', 16)}</button>`; }); };
      el.onclick = e => {
        if (e.target.id === 'wClear') { pendingImg = null; $('#wPrev', el).hidden = true; $('#wFile', el).value = ''; }
        const rx = e.target.closest('[data-rx]'); if (rx) safe(() => api('/api/react', { postId: rx.closest('.post').dataset.id, emoji: rx.dataset.rx }));
        const del = e.target.closest('[data-del]'); if (del && confirm('Delete this post?')) safe(() => api('/api/post/delete', { postId: del.dataset.del }));
      };
      $('#wForm', el).onsubmit = e => {
        e.preventDefault(); const text = $('#wText', el).value.trim(); if (!text && !pendingImg) return;
        const btn = $('#wPost', el); btn.disabled = true;
        safe(async () => { await api('/api/post', { text, img: pendingImg }); $('#wText', el).value = ''; pendingImg = null; $('#wPrev', el).hidden = true; $('#wFile', el).value = ''; toast('Posted. Thanks for sharing.'); }).finally(() => { btn.disabled = false; });
      };
    },
    leave() { root = null; },
  });
  on('wall', ({ post }) => { if (!posts.some(p => p.id === post.id)) { posts.unshift(post); if (root) drawFeed(); } });
  on('wall-react', ({ postId, reacts }) => { const p = posts.find(x => x.id === postId); if (p) { p.reacts = reacts; if (root) { const el = $(`.post[data-id="${postId}"] .reacts`, root); if (el) el.outerHTML = `<div class="reacts">${reactions.map(e => { const n = (reacts[e] || []).length; const mine = (reacts[e] || []).includes(S.uid); return `<button class="rx ${mine ? 'mine' : ''}" data-rx="${e}" aria-pressed="${mine}" aria-label="React ${e}">${e}${n ? `<i>${n}</i>` : ''}</button>`; }).join('')}</div>`; } } });
  on('wall-delete', ({ postId }) => { posts = posts.filter(p => p.id !== postId); if (root) drawFeed(); });
})();
