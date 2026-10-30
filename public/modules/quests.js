'use strict';
/* Weekly team quest: one small healthy habit, filled together. */
(() => {
  const { $, esc, api, safe, register, beastSVG, S, on, confetti, toast, icon, iconFor } = Den;
  let root = null, q = null;

  function draw() {
    if (!root || !q) return; const pct = Math.min(100, Math.round(q.count / q.goal * 100));
    const steps = 12; const lit = Math.round(pct / 100 * steps);
    root.innerHTML = `<div class="quest"><div class="q-hero"><div class="q-emoji" aria-hidden="true">${iconFor(q.emoji, 36)}</div><div><small>This week’s team quest</small><h2>${esc(q.title)}</h2><p>${esc(q.desc)}</p></div></div>
      <div class="trail" aria-label="${pct} percent complete">${Array.from({ length: steps }, (_, i) => `<span class="paw ${i < lit ? 'lit' : ''}">${icon('footprints', 20)}</span>`).join('')}<span class="flag ${q.done ? 'lit' : ''}">${icon(q.done ? 'trophy' : 'flag', 24)}</span></div>
      <div class="q-count"><b>${q.count}</b> of ${q.goal} check-ins <span>· ${q.participants} ${q.participants === 1 ? 'beast' : 'beasts'} so far</span></div>
      ${q.done ? `<div class="q-done">${icon('party-popper', 18)}Quest complete. Everyone who checked in earned ${q.badge}.</div>` : ''}
      <button class="btn primary big" id="qGo" ${q.checkedToday ? 'disabled' : ''}>${icon(q.checkedToday ? 'circle-check' : 'check', 18)}${q.checkedToday ? 'Checked in today. See you tomorrow.' : 'I did it today'}</button>
      <p class="muted small">One check-in per person per day. Nobody is graded, and nothing is checked. It just keeps the Den fire burning.</p>
      <h3>On the trail</h3><ul class="q-top">${q.top.map(t => `<li>${beastSVG(t.beast, 38)}<b>${esc(t.name)}</b><span>${t.n} ${t.n === 1 ? 'day' : 'days'}</span></li>`).join('') || '<li class="empty">Be the first to check in.</li>'}</ul></div>`;
  }
  register({
    id: 'quests', title: 'Quest', icon: 'compass', order: 50,
    render(el) {
      root = el; root.innerHTML = '<div class="loading">Reading the map…</div>'; safe(async () => { q = await api('/api/quest'); draw(); });
      el.onclick = e => { if (e.target.id === 'qGo') safe(async () => { const r = await api('/api/quest/checkin', {}); q = r.view; if (!r.completed) { toast('Checked in. The fire just got warmer.'); } draw(); }); };
    },
    leave() { root = null; },
  });
  on('quest', d => { if (q) { q.count = d.count; q.goal = d.goal; q.done = d.done; q.participants = d.participants; draw(); } });
})();
