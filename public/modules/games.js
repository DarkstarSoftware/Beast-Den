'use strict';
/* Game Room: live group games. Hub, tables, and one small client per game. */
(() => {
  const { $, $$, esc, api, safe, register, beastSVG, user, S, on, toast, confetti, icon, iconFor } = Den;
  const TILE = { geo: 'blue', draw: 'pink', emoji: 'gold', truths: 'purple', closest: 'orange', quickfire: 'green' };
  const gtile = (m, size = 24, cls = '') => `<span class="tile ${cls} ${TILE[m.id] || ''}" aria-hidden="true">${iconFor(m.emoji, size)}</span>`;
  const GUESS_COLORS = ['--brand-600', '--accent-purple', '--accent-orange', '--accent-green', '--accent-pink', '--accent-blue', '--accent-gold'];
  let root = null, cat = [], tables = [], T = null, endAt = 0, clock = null, sig = '', strokes = [], strokeKey = '', pin = null, gm = null, worldP = null;
  let hostOpen = null; const hostOpts = {};
  const gmeta = id => cat.find(c => c.id === id) || {};
  const name = id => user(id).name;
  const chip = id => `<span class="pc">${beastSVG(user(id).beast, 22)}${esc(name(id))}</span>`;
  const world = () => worldP || (worldP = fetch('/world.json').then(r => r.json()).catch(() => ({ d: '' })));
  const act = body => api('/api/games/act', { table: T.id, ...body });
  const G = {};

  /* ---------------- world map with zoom, pan and pins ---------------- */
  function makeMap(el, { onPick, hue = 24 } = {}) {
    let vb = { x: 0, y: 0, w: 360, h: 180 }, marks = { pin: null, answer: null, guesses: [] }, drag = null;
    el.innerHTML = `<svg viewBox="0 0 360 180" preserveAspectRatio="xMidYMid meet" role="img" aria-label="World map. Click to drop a pin."><rect class="ocean" width="360" height="180"/><path class="land" d=""/><g class="grid">${[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map(l => `<path d="M${l + 180} 0V180"/>`).join('')}${[-60, -30, 0, 30, 60].map(l => `<path d="M0 ${90 - l}H360"/>`).join('')}</g><g class="marks"></g></svg>
      <div class="map-ctl"><button class="btn small" data-z="1" aria-label="Zoom in">${icon('plus', 16)}</button><button class="btn small" data-z="-1" aria-label="Zoom out">${icon('minus', 16)}</button><button class="btn small" data-z="0" aria-label="Reset view">${icon('rotate-ccw', 16)}</button></div>`;
    const svg = $('svg', el), g = $('.marks', svg);
    world().then(w => { const p = $('.land', svg); if (p) p.setAttribute('d', w.d); });
    const apply = () => { vb.w = Den.clamp(vb.w, 9, 360); vb.h = vb.w / 2; vb.x = Den.clamp(vb.x, 0, 360 - vb.w); vb.y = Den.clamp(vb.y, 0, 180 - vb.h); svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`); marksDraw(); };
    const toGeo = e => { const r = svg.getBoundingClientRect(); const x = vb.x + (e.clientX - r.left) / r.width * vb.w, y = vb.y + (e.clientY - r.top) / r.height * vb.h; return { lon: Math.round((x - 180) * 100) / 100, lat: Math.round((90 - y) * 100) / 100 }; };
    const zoom = (f, cx, cy) => { const nw = Den.clamp(vb.w * f, 9, 360); const px = cx == null ? vb.x + vb.w / 2 : cx, py = cy == null ? vb.y + vb.h / 2 : cy; vb.x = px - (px - vb.x) * nw / vb.w; vb.y = py - (py - vb.y) * nw / vb.w; vb.w = nw; apply(); };
    const X = lon => lon + 180, Y = lat => 90 - lat;
    function marksDraw() {
      const r = vb.w / 70; let h = '';
      for (const q of marks.guesses) {
        if (!q.answer) continue; const c = `var(${GUESS_COLORS[q.hue % GUESS_COLORS.length]})`;
        h += `<path d="M${X(q.lon)} ${Y(q.lat)} L${X(marks.answer.lon)} ${Y(marks.answer.lat)}" stroke="${c}" stroke-width="${r * .22}" stroke-dasharray="${r * .5} ${r * .4}" fill="none" opacity=".9"/>`;
      }
      for (const q of marks.guesses) h += `<g><circle cx="${X(q.lon)}" cy="${Y(q.lat)}" r="${r * .55}" fill="var(${GUESS_COLORS[q.hue % GUESS_COLORS.length]})" stroke="#fff" stroke-width="${r * .18}"/><text x="${X(q.lon) + r * .8}" y="${Y(q.lat) - r * .5}" font-size="${r * 1.1}" fill="var(--neutral-900)" stroke="#fff" stroke-width="${r * .3}" paint-order="stroke" font-weight="600">${esc(q.label)}</text></g>`;
      if (marks.answer) h += `<g transform="translate(${X(marks.answer.lon)} ${Y(marks.answer.lat)})"><circle r="${r * 1.1}" fill="var(--accent-gold)" opacity=".3"/><path d="M0 ${-r} L${r * .3} ${-r * .3} L${r} ${-r * .25} L${r * .45} ${r * .2} L${r * .62} ${r} L0 ${r * .55} L${-r * .62} ${r} L${-r * .45} ${r * .2} L${-r} ${-r * .25} L${-r * .3} ${-r * .3}Z" fill="var(--accent-gold)" stroke="var(--neutral-900)" stroke-width="${r * .15}"/></g>`;
      if (marks.pin) h += `<g transform="translate(${X(marks.pin.lon)} ${Y(marks.pin.lat)})"><path d="M0 0 C${-r * .2} ${-r} ${-r * .9} ${-r * 1.2} ${-r * .9} ${-r * 2} A${r * .9} ${r * .9} 0 1 1 ${r * .9} ${-r * 2} C${r * .9} ${-r * 1.2} ${r * .2} ${-r} 0 0Z" fill="var(--brand-600)" stroke="#fff" stroke-width="${r * .18}"/><circle cy="${-r * 2}" r="${r * .35}" fill="#fff"/></g>`;
      g.innerHTML = h;
    }
    svg.addEventListener('pointerdown', e => { svg.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y, moved: false }; });
    svg.addEventListener('pointermove', e => { if (!drag) return; const r = svg.getBoundingClientRect(), dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true; if (drag.moved) { vb.x = drag.vx - dx / r.width * vb.w; vb.y = drag.vy - dy / r.height * vb.w / 2; apply(); } });
    svg.addEventListener('pointerup', e => { if (drag && !drag.moved && onPick) onPick(toGeo(e)); drag = null; });
    svg.addEventListener('pointercancel', () => { drag = null; });
    svg.addEventListener('wheel', e => { e.preventDefault(); const p = toGeo(e); zoom(e.deltaY < 0 ? .75 : 1.33, p.lon + 180, 90 - p.lat); }, { passive: false });
    el.addEventListener('click', e => { const b = e.target.closest('[data-z]'); if (!b) return; const z = +b.dataset.z; if (z === 0) { vb = { x: 0, y: 0, w: 360, h: 180 }; apply(); } else zoom(z > 0 ? .6 : 1.66); });
    return {
      setPin(p) { marks.pin = p; marksDraw(); },
      show(answer, guesses) { marks.pin = null; marks.answer = answer; marks.guesses = guesses; fit([answer, ...guesses]); },
      reset() { vb = { x: 0, y: 0, w: 360, h: 180 }; apply(); },
    };
    function fit(pts) {
      const xs = pts.map(p => X(p.lon)), ys = pts.map(p => Y(p.lat)); const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
      const w = Math.max((maxx - minx) * 1.5, (maxy - miny) * 3, 24); vb.w = w; vb.x = (minx + maxx) / 2 - w / 2; vb.y = (miny + maxy) / 2 - w / 4; apply();
    }
  }

  /* ---------------- shared bits ---------------- */
  const mark = id => { const m = G[T.game] && G[T.game].mark; return m && m(T.g, id) ? `<i class="ck" title="Done">${icon('circle-check', 16)}</i>` : ''; };
  const board = () => [...T.players].sort((a, b) => b.score - a.score).map((p, i) => `<li class="${p.id === S.uid ? 'me' : ''}"><span class="rk">${i + 1}</span>${beastSVG(user(p.id).beast, 34)}<b>${esc(name(p.id))}${p.id === T.host ? `<span title="Host" class="muted">${icon('crown', 14)}</span>` : ''}</b>${T.state === 'playing' ? mark(p.id) : ''}<em>${p.score}</em></li>`).join('');
  const statusRow = (map, ids) => `<div class="status-row">${ids.map(id => `<span class="pc ${map && map[id] ? 'done' : ''}">${beastSVG(user(id).beast, 20)}${esc(name(id))}${map && map[id] ? icon('check', 14) : ''}</span>`).join('')}</div>`;
  const ordinal = n => n === 1 ? icon('trophy', 16) : n + '.';

  /* ---------------- hub ---------------- */
  function joinable(t) { const m = gmeta(t.game); return t.state === 'lobby' || (t.state === 'playing' && m.lateJoin); }
  function hub() {
    const open = tables.filter(t => t.state !== 'over');
    root.dataset.tid = '';
    root.innerHTML = `<div class="gh"><div class="gh-head"><div><h2>Game Room</h2><p>Quick games for the whole crew. Open a table, and everyone sees it. Rounds take about five minutes.</p></div></div>
      ${open.length ? `<h3 class="gh-h">Open tables</h3><div class="gh-tables">${open.map(t => { const m = gmeta(t.game); return `<div class="tbl">${gtile(m, 22)}<div><b>${esc(m.name || t.game)}</b><small>${esc(name(t.host))}’s table · ${t.state === 'lobby' ? 'waiting to start' : `round ${t.round}/${t.rounds}`}</small><div class="tbl-p">${t.players.map(id => beastSVG(user(id).beast, 26)).join('')}</div></div>${joinable(t) ? `<button class="btn primary small" data-join="${t.id}">Join</button>` : '<span class="muted small">In progress</span>'}</div>`; }).join('')}</div>` : ''}
      <h3 class="gh-h">Pick a game</h3><div class="gh-grid">${cat.map(m => `<div class="gcard ${hostOpen === m.id ? 'open' : ''}"><div class="gc-top">${gtile(m, 24, 'lg')}<div><h4>${esc(m.name)}</h4><small>${m.min}–${m.max} players${m.min === 1 ? ' · solo is fine' : ''}</small></div></div><p>${esc(m.desc)}</p>
        ${hostOpen === m.id ? `<div class="gc-opts">${m.opts.map(o => `<div class="opt-row"><span>${esc(o.label)}</span><div class="pills">${o.choices.map(c => `<button aria-pressed="${(hostOpts[m.id] || {})[o.key] === c || ((hostOpts[m.id] || {})[o.key] === undefined && o.def === c)}" class="pill ${(hostOpts[m.id] || {})[o.key] === c || ((hostOpts[m.id] || {})[o.key] === undefined && o.def === c) ? 'on' : ''}" data-opt="${m.id}|${o.key}|${esc(c)}">${esc(c)}</button>`).join('')}</div></div>`).join('')}<div class="gc-go"><button class="btn primary" data-create="${m.id}">${icon('gamepad-2', 18)}Open table</button><button class="btn ghost small" data-host="">Cancel</button></div></div>` : `<button class="btn" data-host="${m.id}">${icon('plus', 18)}Host a table</button>`}</div>`).join('')}</div>
      <div class="gh-photos"><div><h3>Add your photos to Where in the World</h3><p class="muted">A view from a hike, your hometown, last summer’s trip. Coworkers guess where it was. Only the city and pin you choose are saved, and photos are re-encoded in your browser so hidden location data is stripped.</p></div><button class="btn primary" id="addPhoto">${icon('image-plus', 18)}Add a photo</button></div><div id="myPhotos"></div></div>`;
    loadPhotos();
  }
  async function loadPhotos() {
    const r = await api('/api/geo/photos').catch(() => null); const el = $('#myPhotos', root); if (!r || !el) return;
    el.innerHTML = `<p class="muted small">${r.real ? `${r.real} landmark photos, ` : ''}${r.seeds} illustrated postcards, ${r.total} team photos${r.daily ? ` and ${r.daily} daily photos` : ''} in the pool.</p>` + (r.mine.length ? `<div class="mine-grid">${r.mine.map(p => `<figure><img src="${esc(p.img)}" alt=""><figcaption>${esc(p.label)}</figcaption><button class="btn small ghost" data-delphoto="${p.id}">${icon('trash-2', 14)}Remove</button></figure>`).join('')}</div>` : '');
  }

  /* ---------------- photo submit modal ---------------- */
  function photoModal() {
    let data = null, spot = null, pm = null;
    const opener = document.activeElement; const m = document.createElement('div'); m.className = 'modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', 'Add a photo');
    m.innerHTML = `<div class="modal-card" tabindex="-1"><h3>Add a photo</h3><p class="muted small">Pick a photo you’re happy for coworkers to see. Skip anything showing your home address, badges, screens, or people who haven’t agreed to it.</p>
      <label class="file"><input type="file" id="pmFile" accept="image/jpeg,image/png,image/webp"><span>${icon('image-plus', 18)}Choose a photo</span></label><div class="pm-prev" id="pmPrev" hidden></div>
      <p class="muted small" id="pmHelp">Then click the map where it was taken. A rough pin is fine.</p><div class="map-wrap small" id="pmMap"></div>
      <label class="field" style="margin:0"><span>Place name</span><input id="pmLabel" maxlength="60" placeholder="e.g. Lisbon, Portugal" autocomplete="off"></label><div class="err" id="pmErr"></div>
      <div class="modal-act"><button class="btn ghost" id="pmCancel">Cancel</button><button class="btn primary" id="pmGo" disabled>Add to the game</button></div></div>`;
    document.body.appendChild(m); $('.modal-card', m).focus();
    const close = () => { m.remove(); if (opener && opener.focus) opener.focus(); };
    m.addEventListener('keydown', e => { if (e.key === 'Escape') close(); if (e.key === 'Tab') { const f = $$('button:not([disabled]), input, a[href]', m).filter(x => x.offsetParent || x.type === 'file'); if (!f.length) return; const first = f[0], last = f[f.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } } });
    pm = makeMap($('#pmMap', m), { onPick: p => { spot = p; pm.setPin(p); check(); } });
    const check = () => { $('#pmGo', m).disabled = !(data && spot && $('#pmLabel', m).value.trim()); };
    $('#pmLabel', m).oninput = check;
    $('#pmCancel', m).onclick = close;
    $('#pmFile', m).onchange = async e => {
      const f = e.target.files[0]; if (!f) return; $('#pmErr', m).textContent = '';
      try {
        const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(f); });
        const k = Math.min(1, 1400 / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        let q = .85, url = c.toDataURL('image/jpeg', q); while (url.length > 1_900_000 && q > .4) { q -= .1; url = c.toDataURL('image/jpeg', q); }
        data = url; const p = $('#pmPrev', m); p.hidden = false; p.innerHTML = `<img src="${url}" alt="Preview">`; check();
      } catch { $('#pmErr', m).textContent = 'That image could not be read. Try a JPEG or PNG.'; }
    };
    $('#pmGo', m).onclick = async () => {
      $('#pmGo', m).disabled = true;
      try { await api('/api/geo/photo', { img: data, lat: spot.lat, lon: spot.lon, label: $('#pmLabel', m).value }); close(); toast('Added. Your coworkers can guess it now.'); loadPhotos(); }
      catch (e) { $('#pmErr', m).textContent = e.message; $('#pmGo', m).disabled = false; }
    };
  }

  /* ---------------- table shell ---------------- */
  function tableShell() {
    const m = gmeta(T.game);
    root.dataset.tid = T.id; sig = '';
    root.innerHTML = `<div class="gt"><div class="gt-main"><div class="gt-head"><div class="gt-title">${gtile(m, 20)}<div><h2>${esc(m.name)}</h2><small id="gtSub"></small></div></div><div class="gt-clock" id="gClockBox" hidden><span id="gClock"></span></div><button class="btn ghost small" data-leave="1">${icon('log-out', 16)}Leave table</button></div><div class="g-timer" id="gTimer" hidden><i id="gBar"></i></div><div class="gt-stage" id="gStage"></div></div><aside class="gt-side"><h3>Scores</h3><ol class="gboard" id="gBoard"></ol></aside></div>`;
  }
  function table() {
    if (root.dataset.tid !== T.id || !$('.gt', root)) tableShell();
    const m = gmeta(T.game), stage = $('#gStage', root);
    $('#gtSub', root).textContent = T.state === 'lobby' ? 'Waiting for players' : T.state === 'over' ? 'Final scores' : (T.round && T.rounds ? `Round ${T.round} of ${T.rounds}` : 'Get ready');
    $('#gBoard', root).innerHTML = board();
    const s = T.state === 'lobby' ? `lobby|${T.players.map(p => p.id)}|${T.host}` : `${T.state}|${T.phase}|${T.round}`;
    if (s !== sig) {
      sig = s; pin = T.g && T.g.mine && T.game === 'geo' ? { lat: T.g.mine.lat, lon: T.g.mine.lon, locked: T.g.mine.locked } : null; gm = null;
      const mod = T.state === 'lobby' ? Lobby : T.state === 'over' ? Over : G[T.game];
      stage.innerHTML = mod.build(T); stage.onclick = e => { const b = e.target.closest('[data-a]'); if (b) mod.click(b.dataset.a, b, T); };
      stage.onkeydown = e => { if (e.key === 'Enter' && e.target.dataset.enter) { const b = $(`[data-a="${e.target.dataset.enter}"]`, stage); if (b && !b.disabled) b.click(); } };
      if (mod.bind) mod.bind(stage, T);
      if (T.state === 'over' && !table.confettied) { table.confettied = T.id; const top = [...T.players].sort((a, b) => b.score - a.score)[0]; if (top && top.id === S.uid && top.score > 0) confetti(); }
    }
    const mod = T.state === 'lobby' ? Lobby : T.state === 'over' ? Over : G[T.game];
    if (mod.patch) mod.patch(stage, T);
    tick();
  }
  function tick() {
    if (!root || !T) return;
    const box = $('#gClockBox', root), tm = $('#gTimer', root); if (!box) return;
    const on_ = T.state === 'playing' && T.total && endAt; box.hidden = tm.hidden = !on_;
    if (!on_) return; const left = Math.max(0, endAt - Date.now());
    $('#gClock', root).textContent = Math.ceil(left / 1000) + 's'; const f = left / T.total; $('#gBar', root).style.width = (f * 100) + '%'; tm.classList.toggle('hot', f < .25);
    const mod = G[T.game]; if (mod && mod.tick) mod.tick($('#gStage', root), T, left);
  }

  /* ---------------- lobby + over ---------------- */
  const Lobby = {
    build(T) {
      const m = gmeta(T.game), host = T.host === S.uid, need = m.min - T.players.length;
      return `<div class="glob"><div class="lb-players">${T.players.map(p => `<div class="lp">${beastSVG(user(p.id).beast, 76)}<b>${esc(name(p.id))}</b>${p.id === T.host ? '<small>host</small>' : ''}</div>`).join('')}${T.players.length < m.max ? `<div class="lp ghost"><span>${icon('plus', 24)}</span><small>Open seat</small></div>` : ''}</div>
        <div class="lb-info"><p>${esc(m.how)}</p>${T.opts && Object.keys(T.opts).length ? `<p class="lb-opts">${m.opts.map(o => `<span class="pc">${esc(o.label)}: <b>${esc(T.opts[o.key])}</b></span>`).join('')}</p>` : ''}
        <p class="muted small">Everyone in the Den saw a pop-up that this table is open. They can join from the Game Room.</p></div>
        ${host ? `<button class="btn primary big" data-a="start" ${need > 0 ? 'disabled' : ''}>${need > 0 ? `Waiting for ${need} more` : `${icon('arrow-right', 18)}Start the game`}</button>` : '<p class="muted">Waiting for the host to start.</p>'}</div>`;
    },
    click(a) { if (a === 'start') safe(() => api('/api/games/start', { table: T.id })); },
  };
  const Over = {
    build(T) {
      if (T.game === 'truths' && T.g.noGame) return `<div class="over"><h3>Not enough statements</h3><p class="muted">At least two players need to submit their three statements. Try again with a bit more writing time.</p>${overBtns()}</div>`;
      const rows = [...T.players].sort((a, b) => b.score - a.score);
      return `<div class="over"><h3>${rows.length > 1 && rows[0].score > 0 ? `${esc(name(rows[0].id))} takes it` : 'Game over'}</h3><ol class="podium">${rows.map((p, i) => `<li class="${i === 0 && p.score > 0 ? 'gold' : ''}"><span class="rk">${ordinal(i + 1)}</span>${beastSVG(user(p.id).beast, 44)}<b>${esc(name(p.id))}</b><em>${p.score}</em>${T.awards && T.awards[p.id] ? `<small>+${T.awards[p.id].pts} Den points</small>` : ''}</li>`).join('')}</ol>${overBtns()}</div>`;
    },
    click(a) {
      if (a === 'again') { const t = T; safe(async () => { const r = await api('/api/games/create', { game: t.game, opts: t.opts }); T = r.table; sig = ''; render(); }); }
      if (a === 'leave') leave();
    },
  };
  const overBtns = () => `<div class="over-act">${T.host === S.uid ? `<button class="btn primary" data-a="again">${icon('rotate-ccw', 18)}Play again</button>` : ''}<button class="btn" data-a="leave">Back to the Game Room</button></div>`;
  function leave() { safe(async () => { await api('/api/games/leave', {}); T = null; sig = ''; render(); }); }

  /* ---------------- Where in the World ---------------- */
  G.geo = {
    mark: (g, id) => g.status && g.status[id] === 2,
    build(T) {
      return `<div class="geo"><div class="geo-photo"><img src="${esc(T.g.img)}" alt="Where was this photo taken?"><div class="geo-tag" id="geoTag"></div></div><div class="geo-side"><div class="map-wrap" id="geoMap"></div><div class="geo-act" id="geoAct"></div></div></div>`;
    },
    bind(stage, T) {
      const mine = T.g.by === S.uid, guessing = T.phase === 'guess' && !mine;
      gm = makeMap($('#geoMap', stage), { onPick: p => { if (!guessing || (pin && pin.locked)) return; pin = { ...p, locked: false }; gm.setPin(pin); G.geo.patch(stage, T); safe(() => act({ type: 'guess', lat: p.lat, lon: p.lon })); } });
      if (pin && !(T.phase === 'reveal')) gm.setPin(pin);
      gm.shown = false;
    },
    patch(stage, T) {
      const g = T.g, rev = T.phase === 'reveal', mine = g.by === S.uid, tag = $('#geoTag', stage), act_ = $('#geoAct', stage); if (!act_) return;
      if (rev && g.answer && gm && !gm.shown) { gm.shown = true; gm.show(g.answer, (g.results || []).filter(r => r.lat != null).map((r, i) => ({ lat: r.lat, lon: r.lon, hue: i, label: name(r.uid), answer: true }))); }
      tag.innerHTML = rev ? `<b>${esc(g.answer ? g.answer.label : '')}</b>${g.by ? ` · photo by ${esc(name(g.by))}` : g.daily ? `<span class="geo-cr">${esc(g.credit)}</span>` : ' · illustrated postcard'}` : (g.by ? `${icon('camera', 16)} From ${esc(name(g.by))}` : g.daily ? `${icon('image', 16)} Photo` : `${icon('image', 16)} Illustrated postcard`) + '<span id="geoHint"></span>';
      if (rev) {
        act_.innerHTML = `<ol class="geo-res">${(g.results || []).map((r, i) => `<li>${ordinal(i + 1)} ${chip(r.uid)}<span>${r.km != null ? r.km.toLocaleString() + ' km away' : 'no guess'}</span><b>+${r.pts}</b></li>`).join('') || '<li class="muted">Nobody guessed this one.</li>'}</ol>${T.host === S.uid ? `<button class="btn primary" data-a="next">Next round${icon('arrow-right', 18)}</button>` : '<p class="muted small">Next round starts in a moment.</p>'}`;
      } else if (mine) act_.innerHTML = '<p class="muted">This is your photo. Sit back while everyone guesses.</p>' + statusRow(g.status, Object.keys(g.status));
      else {
        const locked = pin && pin.locked;
        act_.innerHTML = `${!pin ? '<p class="muted small" style="margin-bottom:8px">Click the map to drop a pin, then lock in your guess.</p>' : ''}<button class="btn primary big" data-a="lock" ${!pin || locked ? 'disabled' : ''}>${icon(locked ? 'lock' : 'map-pin', 18)}${locked ? 'Locked in' : 'Lock in my guess'}</button>${statusRow(g.status, Object.keys(g.status))}`;
      }
    },
    tick(stage, T, left) { const h = $('#geoHint', stage); if (h && T.g.hint && left < T.total / 2 && T.phase === 'guess') h.textContent = ' · Hint: ' + T.g.hint; },
    click(a) {
      if (a === 'lock' && pin && !pin.locked) { pin.locked = true; safe(() => act({ type: 'guess', lat: pin.lat, lon: pin.lon, lock: true })); }
      if (a === 'next') safe(() => act({ type: 'next' }));
    },
  };

  /* ---------------- Doodle Dash ---------------- */
  const _cs = getComputedStyle(document.documentElement); const COLORS = ['--neutral-900', '--error', '--accent-orange', '--accent-gold', '--accent-green', '--brand-500', '--accent-blue', '--accent-purple', '--accent-pink'].map(v => _cs.getPropertyValue(v).trim());
  let color = 0, width = 8, cur = null, sent = 0, sendQ = Promise.resolve(), sendTimer = null;
  const cvs = () => $('#drCv', root);
  function redraw() {
    const cv = cvs(); if (!cv) return; const c = cv.getContext('2d'); c.fillStyle = '#ffffff'; c.fillRect(0, 0, 800, 600); c.lineCap = c.lineJoin = 'round';
    for (const s of strokes) {
      c.strokeStyle = c.fillStyle = COLORS[s.c] || COLORS[0]; c.lineWidth = s.w; const p = s.p;
      if (p.length === 1) { c.beginPath(); c.arc(p[0][0] * .8, p[0][1] * .6, s.w / 2, 0, 7); c.fill(); continue; }
      c.beginPath(); p.forEach((q, i) => i ? c.lineTo(q[0] * .8, q[1] * .6) : c.moveTo(q[0] * .8, q[1] * .6)); c.stroke();
    }
  }
  function flush(final) {
    if (!cur) return; const s = cur, from = sent, p = s.p.slice(from); if (!p.length && !final) return; sent = s.p.length;
    sendQ = sendQ.then(() => api('/api/games/act', { table: T.id, type: 'stroke', s: { id: s.id, c: s.c, w: s.w, from, p } })).catch(() => {});
  }
  G.draw = {
    mark: (g, id) => g.guessed && g.guessed[id] && g.drawer !== id,
    build(T) {
      const me = T.g.drawer === S.uid && T.phase === 'draw';
      return `<div class="dr"><div class="dr-word" id="drWord"></div><div class="dr-main"><div class="dr-board"><canvas id="drCv" width="800" height="600" aria-label="Drawing canvas"></canvas>${me ? `<div class="dr-tools">${COLORS.map((c, i) => `<button class="sw ${i === color ? 'on' : ''}" style="background:${c}" data-a="color" data-i="${i}" aria-label="Color ${i + 1}" aria-pressed="${i === color}"></button>`).join('')}<span class="sep"></span>${[4, 8, 18].map(w => `<button class="wd ${w === width ? 'on' : ''}" data-a="width" data-i="${w}" aria-label="Brush ${w}"><i style="width:${Math.min(w, 16)}px;height:${Math.min(w, 16)}px"></i></button>`).join('')}<span class="sep"></span><button class="btn small" data-a="undo">${icon('undo-2', 16)}Undo</button><button class="btn small" data-a="clear">${icon('eraser', 16)}Clear</button><button class="btn small ghost" data-a="skip" id="drSkip">New word</button></div>` : ''}</div>
        <div class="dr-chat"><ul id="drLog" aria-live="polite"></ul>${T.g.drawer !== S.uid && T.phase === 'draw' ? '<div class="dr-in"><input id="drIn" maxlength="40" placeholder="Type your guess" aria-label="Your guess" autocomplete="off" data-enter="guess"><button class="btn primary" data-a="guess">Guess</button></div><p class="dr-fb" id="drFb"></p>' : ''}</div></div></div>`;
    },
    bind(stage, T) {
      const cv = cvs(); redraw();
      if (T.g.drawer === S.uid && T.phase === 'draw') {
        const pt = e => { const r = cv.getBoundingClientRect(); return [Math.round(Den.clamp((e.clientX - r.left) / r.width, 0, 1) * 1000), Math.round(Den.clamp((e.clientY - r.top) / r.height, 0, 1) * 1000)]; };
        cv.style.touchAction = 'none';
        cv.onpointerdown = e => { cv.setPointerCapture(e.pointerId); cur = { id: Math.random().toString(36).slice(2, 10), c: color, w: width, p: [pt(e)] }; sent = 0; strokes.push(cur); redraw(); clearInterval(sendTimer); sendTimer = setInterval(() => flush(), 250); };
        cv.onpointermove = e => { if (!cur || cur.p.length > 2400) return; const p = pt(e), l = cur.p[cur.p.length - 1]; if (Math.abs(p[0] - l[0]) + Math.abs(p[1] - l[1]) < 5) return; cur.p.push(p); redraw(); };
        cv.onpointerup = cv.onpointercancel = () => { if (!cur) return; clearInterval(sendTimer); flush(true); cur = null; };
      }
      const i = $('#drIn', stage); if (i) i.focus();
    },
    patch(stage, T) {
      const g = T.g, w = $('#drWord', stage), log = $('#drLog', stage); if (!w) return; const me = g.drawer === S.uid;
      w.innerHTML = T.phase === 'reveal' ? `The word was <b>${esc(g.word)}</b>` : me ? `Draw: <b>${esc(g.word)}</b>` : `${chip(g.drawer)} is drawing <span class="mask">${esc(g.mask).replace(/ /g, '&nbsp;&nbsp;').replace(/_/g, '<i>_</i>')}</span>`;
      log.innerHTML = (g.log || []).map(l => l.kind === 'ok' ? `<li class="ok">${chip(l.uid)} ${icon('circle-check', 14)} <b>got it</b></li>` : `<li>${chip(l.uid)} <span>${esc(l.text)}</span></li>`).join('') || '<li class="muted">Guesses show up here.</li>'; log.scrollTop = log.scrollHeight;
      const inp = $('#drIn', stage); if (inp && g.guessed && g.guessed[S.uid]) { inp.disabled = true; inp.placeholder = 'You got it!'; }
      const sk = $('#drSkip', stage); if (sk) sk.hidden = g.skipped || strokes.length > 2;
    },
    click(a, el) {
      if (a === 'color') { color = +el.dataset.i; $$('.sw', root).forEach(b => b.classList.toggle('on', +b.dataset.i === color)); }
      if (a === 'width') { width = +el.dataset.i; $$('.wd', root).forEach(b => b.classList.toggle('on', +b.dataset.i === width)); }
      if (a === 'undo') { strokes.pop(); redraw(); safe(() => act({ type: 'undo' })); }
      if (a === 'clear') { strokes = []; redraw(); safe(() => act({ type: 'clear' })); }
      if (a === 'skip') safe(() => act({ type: 'skip' }));
      if (a === 'guess') { const i = $('#drIn', root); const text = i.value.trim(); if (!text) return; i.value = ''; safe(async () => { const r = await act({ type: 'guess', text }); const fb = $('#drFb', root); if (fb) fb.textContent = r.result === 'right' ? `Yes! +${r.pts}` : r.result === 'close' ? 'So close!' : ''; }); }
    },
  };

  /* ---------------- Emoji Charades ---------------- */
  let emojiFb = '';
  G.emoji = {
    mark: (g, id) => g.solved && g.solved[id],
    build(T) { emojiFb = ''; return `<div class="em"><div class="em-e">${esc(T.g.e)}</div><div class="em-meta"><span class="pc">${esc(T.g.cat)}</span><span class="em-pat" id="emPat"></span></div><div class="em-in" id="emIn"></div><div id="emRes"></div></div>`; },
    bind(stage, T) { G.emoji.patch(stage, T); const i = $('#emI', stage); if (i) i.focus(); },
    patch(stage, T) {
      const g = T.g, solved = g.mine, rev = T.phase === 'reveal';
      $('#emPat', stage).textContent = `${g.pattern}${g.hint ? '   ·   ' + g.hint : ''}`;
      const box = $('#emIn', stage), had = $('#emI', stage);
      if (rev) box.innerHTML = '';
      else if (solved) box.innerHTML = `<p class="ok-msg">${icon('circle-check', 18)}Got it. +${solved.pts}</p>`;
      else if (!had) box.innerHTML = `<input id="emI" maxlength="60" placeholder="What is it?" aria-label="Your guess" autocomplete="off" data-enter="send"><button class="btn primary" data-a="send">Guess</button><p class="dr-fb" id="emFb"></p>`;
      $('#emRes', stage).innerHTML = (rev ? `<div class="reveal"><h3>${esc(g.answer)}</h3><p class="muted">${Object.keys(g.gains || {}).length ? Object.entries(g.gains).sort((a, b) => b[1] - a[1]).map(([u, p]) => `${esc(name(u))} +${p}`).join(' · ') : 'Nobody got it.'}</p></div>` : '') + statusRow(g.solved, T.players.map(p => p.id));
    },
    click(a) { if (a === 'send') { const i = $('#emI', root); const text = i.value.trim(); if (!text) return; i.value = ''; safe(async () => { const r = await act({ type: 'guess', text }); const fb = $('#emFb', root); if (fb) fb.textContent = r.result === 'miss' ? 'Not it. Try again.' : ''; if (r.result === 'right') Den.toast('Got it! +' + r.pts); }); } },
  };

  /* ---------------- Two Truths & a Lie ---------------- */
  let tlie = 2;
  G.truths = {
    mark: (g, id) => (g.submitted && g.submitted[id]) || (g.voted && g.voted[id] && id !== g.author),
    build(T) {
      const g = T.g;
      if (T.phase === 'write') {
        if (g.mine) return `<div class="tl"><h3>Locked in</h3><p class="muted">Waiting for everyone else to finish writing.</p><div id="tlWait"></div></div>`;
        tlie = 2;
        return `<div class="tl"><h3>Write three things about yourself</h3><p class="muted">Two true, one lie. Make the lie believable and the truths surprising. Keep it friendly and work-safe.</p>${[0, 1, 2].map(i => `<div class="tl-row"><input id="tlS${i}" maxlength="110" placeholder="${['Something true…', 'Something else true…', 'The sneaky one…'][i]}" autocomplete="off"><label class="lie"><input type="radio" name="lie" value="${i}" ${i === 2 ? 'checked' : ''}> <span>This is the lie</span></label></div>`).join('')}<button class="btn primary" data-a="submit">Lock it in</button><div id="tlWait"></div></div>`;
      }
      const au = g.author === S.uid;
      return `<div class="tl"><h3>${esc(name(g.author))}’s statements</h3><p class="muted" id="tlSub"></p><div class="tl-opts">${g.items.map((s, i) => `<button class="tl-o" data-a="vote" data-i="${i}" ${au ? 'disabled' : ''}><b>${'ABC'[i]}</b>${esc(s)}<span class="tl-who"></span></button>`).join('')}</div><div id="tlRes"></div></div>`;
    },
    bind(stage, T) { $$('input[name=lie]', stage).forEach(r => r.onchange = () => { tlie = +r.value; }); },
    patch(stage, T) {
      const g = T.g, ids = T.players.map(p => p.id);
      if (T.phase === 'write') { const w = $('#tlWait', stage); if (w) w.innerHTML = statusRow(g.submitted, ids); return; }
      const rev = T.phase === 'reveal', au = g.author === S.uid;
      $('#tlSub', stage).textContent = rev ? 'The lie is revealed.' : au ? 'Everyone is judging you. Keep a poker face.' : 'Which one is the lie?';
      $$('.tl-o', stage).forEach((b, i) => {
        b.classList.toggle('picked', g.mine === i && !rev); b.classList.toggle('lie', rev && g.lie === i); b.classList.toggle('truth', rev && g.lie !== i); if (!rev && g.mine != null) b.disabled = true;
        if (rev && g.picks) $('.tl-who', b).innerHTML = Object.entries(g.picks).filter(([u, v]) => v === i && u !== g.author).map(([u]) => beastSVG(user(u).beast, 24)).join('');
      });
      $('#tlRes', stage).innerHTML = rev && g.res ? `<div class="reveal"><p>${g.res.left ? 'The author left, so this round is skipped.' : `${g.res.caught.length} spotted it${g.res.caught.length ? ` (${g.res.caught.map(u => esc(name(u))).join(', ')})` : ''}. ${g.res.fooled.length ? `${esc(name(g.author))} fooled ${g.res.fooled.length}.` : ''}`}</p></div>` : statusRow(g.voted, ids.filter(u => u !== g.author));
    },
    click(a, el) {
      if (a === 'submit') { const s = [0, 1, 2].map(i => $('#tlS' + i, root).value.trim()); if (s.some(x => x.length < 3)) return toast('Write all three statements first.'); safe(() => act({ type: 'submit', s, lie: tlie })); }
      if (a === 'vote') safe(() => act({ type: 'vote', choice: +el.dataset.i }));
    },
  };

  /* ---------------- Closest Wins ---------------- */
  G.closest = {
    mark: (g, id) => g.answered && g.answered[id],
    build(T) { return `<div class="cl"><h3 class="cl-q">${esc(T.g.q)}</h3><div id="clIn"></div><div id="clRes"></div></div>`; },
    patch(stage, T) {
      const g = T.g, rev = T.phase === 'reveal', box = $('#clIn', stage);
      if (rev) box.innerHTML = '';
      else if (g.mine != null) box.innerHTML = `<p class="ok-msg">${icon('circle-check', 18)}Your guess: <b>${g.mine.toLocaleString()}</b> ${esc(g.unit)}</p>`;
      else if (!$('#clI', stage)) { box.innerHTML = `<div class="cl-in"><input id="clI" inputmode="decimal" placeholder="Your best guess" aria-label="Your best guess" autocomplete="off" data-enter="send">${g.unit ? `<span class="muted">${esc(g.unit)}</span>` : ''}<button class="btn primary" data-a="send">Lock in</button></div>`; $('#clI', stage).focus(); }
      $('#clRes', stage).innerHTML = rev ? `<div class="reveal"><div class="cl-ans">${g.year ? g.answer : g.answer.toLocaleString()} <small>${esc(g.unit)}</small></div><ol class="geo-res">${(g.res || []).map((r, i) => `<li>${ordinal(i + 1)} ${chip(r.uid)}<span>${g.year ? r.guess : r.guess.toLocaleString()}</span><b>+${r.pts}</b></li>`).join('') || '<li class="muted">No guesses this time.</li>'}</ol></div>` : statusRow(g.answered, T.players.map(p => p.id));
    },
    click(a) { if (a === 'send') { const v = $('#clI', root).value.trim(); if (v) safe(() => act({ type: 'guess', value: v })); } },
  };

  /* ---------------- Quick Fire ---------------- */
  G.quickfire = {
    mark: (g, id) => g.answered && g.answered[id],
    build(T) { return `<div class="qf"><h3 class="cl-q">${esc(T.g.q)}</h3><div class="t-opts">${T.g.options.map((o, i) => `<button class="opt" data-a="pick" data-i="${i}"><kbd>${'ABCD'[i]}</kbd>${esc(o)}<span class="qf-n"></span></button>`).join('')}</div><div id="qfRes"></div></div>`; },
    patch(stage, T) {
      const g = T.g, rev = T.phase === 'reveal';
      $$('.opt', stage).forEach((b, i) => {
        b.disabled = rev || g.mine != null; b.classList.toggle('picked', g.mine === i && !rev);
        if (rev) { b.classList.toggle('right', i === g.answer); b.classList.toggle('wrong', g.mine === i && i !== g.answer); b.classList.toggle('dim', i !== g.answer && g.mine !== i); $('.qf-n', b).textContent = g.counts && g.counts[i] ? g.counts[i] + ' picked' : ''; }
      });
      $('#qfRes', stage).innerHTML = rev ? `<div class="reveal">${g.gain && g.gain[S.uid] ? `<p class="ok-msg">${icon('circle-check', 18)}+${g.gain[S.uid]} points</p>` : '<p class="muted">No points that time.</p>'}${g.note ? `<p class="muted">${esc(g.note)}</p>` : ''}</div>` : statusRow(g.answered, T.players.map(p => p.id));
    },
    click(a, el) { if (a === 'pick') safe(() => act({ type: 'pick', choice: +el.dataset.i })); },
  };
  addEventListener('keydown', e => { if (root && T && T.game === 'quickfire' && T.phase === 'ask' && T.g.mine == null && /^[a-dA-D]$/.test(e.key) && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) safe(() => act({ type: 'pick', choice: 'abcd'.indexOf(e.key.toLowerCase()) })); });

  /* ---------------- wiring ---------------- */
  function render() { if (!root) return; root.classList.toggle('in-table', !!T); if (!T) hub(); else table(); }
  function setTable(v) {
    if (v.gone) { if (T && T.id === v.id) { T = null; sig = ''; render(); } return; }
    const key = v.id + ':' + v.round, was = T && T.id === v.id;
    T = v; endAt = Date.now() + (v.left || 0);
    if (v.game === 'draw') { if (v.g && v.g.strokes) { strokes = v.g.strokes.map(s => ({ ...s, p: s.p.slice() })); strokeKey = key; } else if (key !== strokeKey) { strokes = []; strokeKey = key; } }
    render();
    if (v.game === 'draw' && !was) syncStrokes();
  }
  async function syncStrokes() { const v = await api('/api/games/table?id=' + T.id).catch(() => null); if (v && v.g && v.g.strokes && T && T.id === v.id) { strokes = v.g.strokes; strokeKey = v.id + ':' + v.round; redraw(); } }
  on('game', setTable);
  on('game-tables', d => { tables = d.tables; if (root && !T) hub(); else if (!root) { const lobby = tables.some(t => t.state === 'lobby' && !t.players.includes(S.uid)); const dot = $('.nav-item[data-id="games"] .dot'); if (dot) dot.hidden = !lobby; } });
  on('game-fx', d => {
    if (!T || d.table !== T.id) return;
    if (d.kind === 'stroke') { let s = strokes.find(x => x.id === d.s.id); if (!s) { s = { id: d.s.id, c: d.s.c, w: d.s.w, p: [] }; strokes.push(s); } s.p = s.p.slice(0, d.s.from).concat(d.s.p); redraw(); }
    else if (d.kind === 'undo') { strokes.pop(); redraw(); } else if (d.kind === 'clear') { strokes = []; redraw(); }
    else if (d.kind === 'close') toast('So close!', 1500);
  });
  register({
    id: 'games', title: 'Games', icon: 'gamepad-2', order: 25,
    render(el) {
      root = el; root.innerHTML = '<div class="loading">Setting up the table…</div>'; sig = '';
      const dot = $('.nav-item[data-id="games"] .dot'); if (dot) dot.hidden = true;
      world();
      el.onclick = e => {
        const t = e.target.closest('[data-join],[data-host],[data-create],[data-opt],[data-leave],[data-delphoto],#addPhoto'); if (!t) return;
        if (t.dataset.join) safe(async () => { const r = await api('/api/games/join', { table: t.dataset.join }); setTable(r.table); });
        else if (t.dataset.host !== undefined) { hostOpen = t.dataset.host || null; hub(); }
        else if (t.dataset.opt) { const [g, k, v] = t.dataset.opt.split('|'); const o = gmeta(g).opts.find(x => x.key === k); (hostOpts[g] = hostOpts[g] || {})[k] = o.choices.find(c => String(c) === v); hub(); }
        else if (t.dataset.create) safe(async () => { const r = await api('/api/games/create', { game: t.dataset.create, opts: hostOpts[t.dataset.create] || {} }); hostOpen = null; setTable(r.table); });
        else if (t.dataset.leave) leave();
        else if (t.dataset.delphoto) safe(async () => { await api('/api/geo/photo/delete', { id: t.dataset.delphoto }); loadPhotos(); });
        else if (t.id === 'addPhoto') photoModal();
      };
      safe(async () => { const r = await api('/api/games'); cat = r.catalog; tables = r.tables; T = r.mine; if (T) { endAt = Date.now() + (T.left || 0); if (T.g && T.g.strokes) { strokes = T.g.strokes; strokeKey = T.id + ':' + T.round; } } render(); });
      clearInterval(clock); clock = setInterval(tick, 200);
    },
    leave() { root = null; clearInterval(clock); sig = ''; },
  });
})();
