'use strict';
/* Lobby: the map of rooms, the fire, room chat, emotes, shared focus sprints. */
(() => {
  const { $, $$, esc, api, safe, on, register, beastSVG, fireSVG, fireLabel, user, S, ago, icon, iconFor } = Den;
  let root = null, seenTokens = new Set(), focusTimer = null, stick = true;
  const L = () => S.boot.modules.lobby;
  const myRoom = () => (S.presence.find(p => p.id === S.uid) || {}).room || 'kitchen';

  function tokens(roomId) {
    return S.presence.filter(p => p.room === roomId).map(p => {
      const isNew = !seenTokens.has(p.id); seenTokens.add(p.id);
      return `<div class="tok ${isNew ? 'pop' : ''} ${p.id === S.uid ? 'me' : ''}" data-uid="${p.id}" title="${esc(p.name)}${p.status ? ' · ' + esc(p.status) : ''}">${beastSVG(p.beast, 52)}<span>${esc(p.name.split(' ')[0])}</span></div>`;
    }).join('') || '<div class="room-empty">Empty. Be the first in.</div>';
  }
  function roomCard(r) {
    const mine = myRoom() === r.id; const n = S.presence.filter(p => p.room === r.id).length;
    const focusOn = r.id === 'focus' && L().focus;
    return `<button class="room ${mine ? 'here' : ''} ${focusOn ? 'sprint' : ''}" data-room="${r.id}" aria-pressed="${mine}">
      <header><span class="tile ${mine ? '' : ''}" aria-hidden="true">${iconFor(r.emoji, 20)}</span><div><b>${esc(r.name)}</b><small>${esc(r.blurb)}</small>${mine ? `<span class="room-here">${icon('circle-check', 14)}You are here</span>` : ''}</div><em title="${n} here">${icon('users', 12)} ${n}</em></header>
      <div class="toks">${tokens(r.id)}</div></button>`;
  }
  function drawMap() {
    if (!root) return; const rooms = L().rooms;
    $('#denMap', root).innerHTML = `${roomCard(rooms[0])}<div class="fire-box" id="fireBox"><canvas class="fire-cv" id="fireCv" aria-hidden="true"></canvas><div class="fire-cap"><b>${fireLabel(S.fire)}</b><small>${S.fire < 40 ? 'Chat, play, post, check in. Keep it lit.' : 'The Den is warm. Pull up a seat.'}</small></div></div>${roomCard(rooms[1])}${roomCard(rooms[2])}${roomCard(rooms[3])}`;
    const cv = $('#fireCv', root); if (cv && window.DenFire) DenFire.mount(cv, () => S.fire);
  }
  function msgHTML(m) {
    if (m.kind === 'event') return `<div class="msg event"><em>${esc(user(m.uid).name)} ${esc(m.text)}</em></div>`;
    const u = user(m.uid);
    return `<div class="msg ${m.uid === S.uid ? 'mine' : ''}">${beastSVG(u.beast, 32)}<div><b>${esc(u.name)} <time>${ago(m.ts)}</time></b><p>${esc(m.text)}</p></div></div>`;
  }
  function drawChat() {
    if (!root) return; const room = myRoom(); const r = L().rooms.find(x => x.id === room);
    $('#chatHead', root).innerHTML = `<span class="tile" style="width:28px;height:28px" aria-hidden="true">${iconFor(r.emoji, 16)}</span><b>${esc(r.name)}</b><small>${esc(r.blurb)}</small>`;
    const list = $('#chatList', root); list.innerHTML = (L().chat[room] || []).map(msgHTML).join('') || '<div class="chat-empty">No messages yet. Say something kind or silly.</div>';
    if (stick) list.scrollTop = list.scrollHeight;
    $('#chatIn', root).placeholder = `Message ${r.name}`;
    drawFocus();
  }
  function drawFocus() {
    if (!root) return; const box = $('#focusBox', root); clearInterval(focusTimer);
    if (myRoom() !== 'focus') { box.hidden = true; return; }
    box.hidden = false; const f = L().focus;
    if (!f) { box.innerHTML = `<span>Work quietly together. Everyone in the lounge shares the clock.</span><span class="fb-actions"><button class="btn small primary" data-sprint="25">${icon('timer', 16)}25 min sprint</button><button class="btn small" data-sprint="50">50 min</button></span>`; return; }
    const tick = () => {
      const left = Math.max(0, f.endsAt - Date.now()); const m = Math.floor(left / 60000), s = Math.floor(left % 60000 / 1000);
      box.innerHTML = `<span class="clock">${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}</span><span>Sprint in progress. Started by ${esc(user(f.startedBy).name)}.</span>${f.startedBy === S.uid ? '<button class="btn small" data-sprint="stop">End early</button>' : ''}`;
    };
    tick(); focusTimer = setInterval(tick, 1000);
  }
  function burst(uid, emoji) {
    const tok = root && $(`.tok[data-uid="${uid}"]`, root); const host = tok || (root && $('#denMap', root)); if (!host) return;
    const rect = host.getBoundingClientRect();
    for (let i = 0; i < 5; i++) {
      const s = document.createElement('span'); s.className = 'float-emoji'; s.textContent = emoji;
      s.style.left = rect.left + rect.width / 2 + (Math.random() - .5) * 40 + 'px'; s.style.top = rect.top + 6 + 'px'; s.style.setProperty('--dx', (Math.random() - .5) * 90 + 'px'); s.style.animationDelay = i * 70 + 'ms';
      document.body.appendChild(s); setTimeout(() => s.remove(), 1800);
    }
  }

  register({
    id: 'lobby', title: 'The Den', icon: 'house', order: 10,
    render(el) {
      root = el; seenTokens = new Set(); stick = true;
      el.innerHTML = `<div class="lobby"><div class="den-map" id="denMap"></div>
        <div class="chat" id="chat"><div class="chat-head" id="chatHead"></div><div id="focusBox" class="focus-box" hidden></div><div class="chat-list" id="chatList" aria-live="polite"></div>
        <div class="emotes">${L().emotes.map(e => `<button data-emote="${e}" aria-label="Send ${e}">${e}</button>`).join('')}</div>
        <form id="chatForm" class="chat-form"><input id="chatIn" maxlength="400" autocomplete="off" aria-label="Message"><button class="btn primary" aria-label="Send message">${icon('send', 18)}Send</button></form></div></div>`;
      drawMap(); drawChat();
      el.onclick = e => {
        const room = e.target.closest('[data-room]'); const em = e.target.closest('[data-emote]'); const sp = e.target.closest('[data-sprint]');
        if (room && room.dataset.room !== myRoom()) safe(() => api('/api/move', { room: room.dataset.room }));
        if (em) safe(() => api('/api/emote', { emoji: em.dataset.emote }));
        if (sp) safe(() => api('/api/focus', sp.dataset.sprint === 'stop' ? { action: 'stop' } : { action: 'start', minutes: +sp.dataset.sprint }));
      };
      $('#chatList', el).onscroll = e => { const t = e.target; stick = t.scrollHeight - t.scrollTop - t.clientHeight < 40; };
      $('#chatForm', el).onsubmit = e => { e.preventDefault(); const i = $('#chatIn', el); const text = i.value.trim(); if (!text) return; i.value = ''; stick = true; safe(() => api('/api/chat', { room: myRoom(), text })); };
    },
    leave() { root = null; clearInterval(focusTimer); },
  });

  let lastRoom = null;
  on('presence', () => { if (!root) return; drawMap(); if (lastRoom !== myRoom()) { lastRoom = myRoom(); stick = true; drawChat(); } });
  on('user', () => { if (root) drawChat(); });
  on('fire', () => { if (root) { const b = $('#fireBox', root); if (b) { const lab = $('.fire-cap b', b), sm = $('.fire-cap small', b); if (lab) lab.textContent = fireLabel(S.fire); if (sm) sm.textContent = S.fire < 40 ? 'Chat, play, post, check in. Keep it lit.' : 'The Den is warm. Pull up a seat.'; } } });
  on('chat', ({ room, msg }) => {
    const c = L().chat; (c[room] = c[room] || []).push(msg); if (c[room].length > 60) c[room].shift();
    if (root && room === myRoom()) { const list = $('#chatList', root); const empty = $('.chat-empty', list); if (empty) empty.remove(); list.insertAdjacentHTML('beforeend', msgHTML(msg)); if (stick) list.scrollTop = list.scrollHeight; }
  });
  on('emote', ({ uid, emoji }) => burst(uid, emoji));
  on('focus', f => { L().focus = f; if (root) { drawMap(); drawFocus(); } });
})();
