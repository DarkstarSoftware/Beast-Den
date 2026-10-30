'use strict';
/* Coffee Roulette: press the button, meet a teammate for ten unscripted minutes. */
(() => {
  const { $, esc, api, safe, register, beastSVG, user, S, on, toast } = Den;
  let root = null, stick = true;
  const C = () => S.boot.modules.coffee;
  const msgs = room => (S.boot.modules.lobby.chat[room] || []);

  function msgHTML(m) {
    if (m.kind === 'event') return `<div class="msg event"><em>${esc(m.text)}</em></div>`;
    const u = user(m.uid); return `<div class="msg ${m.uid === S.uid ? 'mine' : ''}">${beastSVG(u.beast, 30)}<div><b>${esc(u.name)}</b><p>${esc(m.text)}</p></div></div>`;
  }
  function draw() {
    if (!root) return; const c = C();
    if (c.active) {
      const a = c.active;
      root.innerHTML = `<div class="coffee matched"><div class="cf-pair"><div class="cf-me">${beastSVG(S.me.beast, 120)}<b>${esc(S.me.name)}</b></div><div class="cup">${Den.icon('coffee', 28)}</div><div class="cf-them">${beastSVG(a.partner.beast, 120)}<b>${esc(a.partner.name)}</b></div></div>
        <p class="cf-sub">You two were matched. No agenda, no pressure. Ten minutes is plenty.</p>
        <div class="cf-prompts">${a.prompts.map(p => `<button class="prompt" data-p="${esc(p)}">${esc(p)}</button>`).join('')}<small>Tap a prompt to drop it in the chat.</small></div>
        <div class="chat slim"><div class="chat-list" id="cfList">${msgs(a.room).map(msgHTML).join('')}</div><form id="cfForm" class="chat-form"><input id="cfIn" aria-label="Message" maxlength="400" placeholder="Say something to ${esc(a.partner.name.split(' ')[0])}" autocomplete="off"><button class="btn primary" aria-label="Send">${Den.icon('send', 18)}Send</button></form></div>
        <button class="btn ghost" id="cfEnd">End chat</button></div>`;
      const list = $('#cfList', root); list.scrollTop = list.scrollHeight;
    } else if (c.waiting) {
      root.innerHTML = `<div class="coffee waiting"><div class="cup-steam"><span></span><span></span><span></span><div class="cup">${Den.icon('coffee', 36)}</div></div><h2>Pouring…</h2><p>Waiting for someone else to pick up a mug. It usually takes a minute. You can keep this tab open and work.</p><button class="btn" id="cfCancel">Never mind</button></div>`;
    } else {
      root.innerHTML = `<div class="coffee idle"><div class="cup big">${Den.icon('coffee', 44)}</div><h2>Coffee Roulette</h2><p>Take ten minutes with someone you might not usually talk to. We match you with another beast who is also taking a break, and we avoid repeat pairings.</p>
        <button class="btn primary big" id="cfGo">${Den.icon('coffee', 18)}Pour me a coffee</button>
        <div class="cf-stats"><span><b>${c.chats}</b> chats so far</span><span><b>${c.metCount}</b> teammates met</span><span><b>${c.queue}</b> waiting right now</span></div></div>`;
    }
  }
  register({
    id: 'coffee', title: 'Coffee', icon: 'coffee', order: 30,
    render(el) {
      root = el; draw();
      el.onclick = e => {
        if (e.target.id === 'cfGo') safe(async () => { const r = await api('/api/coffee/join', {}); if (r.waiting) { C().waiting = true; draw(); } });
        else if (e.target.id === 'cfCancel') safe(async () => { await api('/api/coffee/leave', {}); C().waiting = false; draw(); });
        else if (e.target.id === 'cfEnd') safe(async () => { await api('/api/coffee/leave', {}); });
        else if (e.target.closest('.prompt')) { const i = $('#cfIn', el); if (i) { i.value = e.target.closest('.prompt').dataset.p; i.focus(); } }
      };
      el.onsubmit = e => { if (e.target.id !== 'cfForm') return; e.preventDefault(); const i = $('#cfIn', el); const text = i.value.trim(); if (!text) return; i.value = ''; safe(() => api('/api/chat', { room: C().active.room, text })); };
    },
    leave() { root = null; },
  });
  on('coffee', d => {
    const c = C(); c.active = { room: d.room, partner: d.partner, prompts: d.prompts }; c.waiting = false; c.chats++;
    toast(`Coffee time with ${d.partner.name}.`, 4500);
    if (location.hash !== '#/coffee') { const nav = document.querySelector('.nav-item[data-id="coffee"] .dot'); if (nav) nav.hidden = false; }
    draw();
  });
  on('coffee-end', () => { const c = C(); c.active = null; c.waiting = false; toast('Coffee chat ended. Hope it was a good one.'); draw(); });
  on('coffee-queue', d => { C().queue = d.count; if (root && !C().active && !C().waiting) draw(); });
  on('chat', ({ room, msg }) => {
    const c = C(); if (!root || !c.active || room !== c.active.room) return;
    const list = $('#cfList', root); if (list) { list.insertAdjacentHTML('beforeend', msgHTML(msg)); list.scrollTop = list.scrollHeight; }
  });
})();
