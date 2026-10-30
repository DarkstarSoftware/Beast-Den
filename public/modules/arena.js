'use strict';
/* Arena: self-reported game stats, leaderboards, challenges and tournament brackets. */
(() => {
  const { $, $$, esc, api, safe, register, beastSVG, on, S, ago, toast, icon, confetti } = Den;
  const KIND_ICON = { racing: 'flag', fighting: 'swords', shooter: 'target', adventure: 'compass', puzzle: 'puzzle', sports: 'trophy', other: 'gamepad-2' };
  const KIND_TILE = { racing: 'orange', fighting: 'purple', shooter: 'blue', adventure: 'green', puzzle: '', sports: 'gold', other: '' };
  let root = null, D = null, tab = 'boards', gid = null, period = 'week', B = null, timer = 0;

  const U = id => (D && D.users[id]) || Den.user(id);
  const G = id => D && D.games.find(g => g.id === id);
  const who = id => esc(U(id).name);
  function fmt(g, v) {
    if (!g || g.metric !== 'time') return Number(v).toLocaleString();
    const t = Math.round(v), ms = t % 1000, s = Math.floor(t / 1000) % 60, m = Math.floor(t / 60000) % 60, h = Math.floor(t / 3600000);
    const p = (n, l) => String(n).padStart(l, '0');
    return (h ? h + ':' + p(m, 2) : m) + (h || m ? ':' + p(s, 2) : s) + '.' + p(ms, 3);
  }
  const metricWords = g => g.metric === 'time' ? 'Fastest wins' : g.metric === 'low' ? 'Lowest wins' : 'Highest wins';
  const gtile = (g, size = 40) => `<span class="tile ${KIND_TILE[g.kind] || ''}" style="width:${size}px;height:${size}px" aria-hidden="true">${icon(KIND_ICON[g.kind] || 'gamepad-2', Math.round(size * .5))}</span>`;
  const av = (id, s = 24) => beastSVG(U(id).beast, s);
  const rankBadge = r => r <= 3 ? `<span class="ar-rk r${r}" aria-label="Rank ${r}">${r === 1 ? icon('crown', 16) : icon('medal', 16)}</span>` : `<span class="ar-rk">${r}</span>`;
  function left(ts) { const ms = ts - Date.now(); if (ms <= 0) return 'Ended'; const h = Math.floor(ms / 3600000); return h >= 48 ? Math.floor(h / 24) + ' days left' : h >= 1 ? h + 'h left' : Math.max(1, Math.floor(ms / 60000)) + 'm left'; }

  /* ---------- data ---------- */
  async function load() { D = await api('/api/arena'); if (gid && !G(gid)) gid = null; if (gid) await loadBoard(); draw(); }
  async function loadBoard() { B = await api(`/api/arena/board?gid=${encodeURIComponent(gid)}&period=${period}`); }
  function refresh() { clearTimeout(timer); timer = setTimeout(() => { if (root) safe(load); }, 350); }

  /* ---------- views ---------- */
  function head() {
    return `<div class="t-head ar-head"><div><h2>Arena</h2><p>Log your best runs from any game on any platform. Climb the boards, start a challenge, run a bracket.</p></div><button class="btn primary" data-act="log">${icon('plus', 18)}Log a score</button></div>
    <div class="tabs ar-tabs" role="tablist">${[['boards', 'Boards'], ['challenges', 'Challenges'], ['tourneys', 'Tournaments']].map(([k, n]) => `<button class="tab ${tab === k ? 'on' : ''}" role="tab" aria-selected="${tab === k}" data-tab="${k}">${n}</button>`).join('')}</div>`;
  }
  function entryLine(e) {
    const g = G(e.gid) || {}; const mine = e.uid === S.uid;
    return `<li class="ar-feed-i"><span>${av(e.uid, 28)}</span><div class="ar-fi"><b>${who(e.uid)}</b> <span class="muted">logged</span> <b class="ar-v">${esc(fmt(g, e.value))}</b><small>${esc(g.name || 'Game')}${e.detail ? ' · ' + esc(e.detail) : ''} · ${ago(e.ts)}</small>${e.note ? `<p>${esc(e.note)}</p>` : ''}</div>
      <div class="ar-ea">${e.img ? `<button class="ar-ic" data-proof="${esc(e.img)}" aria-label="View proof screenshot">${icon('image', 16)}</button>` : ''}${mine ? '' : `<button class="ar-cheer ${e.cheered ? 'on' : ''}" data-cheer="${e.id}" aria-pressed="${e.cheered}" aria-label="Cheer">${icon('thumbs-up', 14)}${e.cheers || ''}</button>`}${mine && e.cheers ? `<span class="ar-cheer on static">${icon('thumbs-up', 14)}${e.cheers}</span>` : ''}</div></li>`;
  }
  function side() {
    const ch = D.champs.length ? `<ol class="ar-champs">${D.champs.map((c, i) => `<li>${rankBadge(i + 1)}${av(c.id, 28)}<b>${esc(c.name)}</b><em>${c.arena} pts</em></li>`).join('')}</ol><p class="muted small">Weekly champions: 5, 3 and 2 points for the top three on each board, 1 for placing.</p>` : '<p class="muted small">Nobody on the boards yet this week. Log a score and you are the champion.</p>';
    return `<aside class="ar-side"><section class="card"><h3 class="ar-h">${icon('trophy', 16)}Weekly champions</h3>${ch}</section><section class="card"><h3 class="ar-h">${icon('zap', 16)}Live feed</h3>${D.feed.length ? `<ul class="ar-feed">${D.feed.map(entryLine).join('')}</ul>` : '<p class="muted small">Scores land here as people log them.</p>'}</section></aside>`;
  }
  function gamesGrid() {
    const list = [...D.games].sort((a, b) => b.week - a.week || b.n - a.n);
    return `<div class="ar-grid">${list.map(g => `<button class="gcard ar-g" data-game="${g.id}"><div class="gc-top">${gtile(g)}<div class="ar-gn"><h4>${esc(g.name)}</h4><small>${esc(g.platform)} · ${esc(g.unit)}</small></div>${g.myRank ? `<span class="pc ar-me" title="Your rank">#${g.myRank}</span>` : ''}</div>
      ${g.top.length ? `<ol class="ar-top">${g.top.map((t, i) => `<li>${rankBadge(i + 1)}${av(t.uid, 22)}<span class="ar-nm">${who(t.uid)}</span><b>${esc(fmt(g, t.value))}</b></li>`).join('')}</ol>` : '<p class="ar-empty">No scores this week. Be the first.</p>'}
      <div class="ar-gf"><span>${g.players} ${g.players === 1 ? 'player' : 'players'}</span><span>${metricWords(g)}</span></div></button>`).join('')}<button class="gcard ar-g ar-add" data-act="addgame">${icon('plus', 24)}<b>Add a game</b><small>Any game, any platform</small></button></div>`;
  }
  function boardView() {
    const g = G(gid); if (!g || !B) return '<p class="muted">Loading…</p>';
    const rows = B.rows;
    const me = rows.find(r => r.uid === S.uid), idx = me ? rows.indexOf(me) : -1;
    let rival = '';
    if (me && idx > 0) { const up = rows[idx - 1]; const diff = Math.abs(me.value - up.value); rival = `<p class="ar-rival">${icon('trending-up', 16)}You are <b>${esc(fmt(g, diff))}${g.metric === 'time' ? 's' : ''}</b> behind ${who(up.uid)}. Go get them.</p>`; }
    else if (me && idx === 0 && rows.length > 1) rival = `<p class="ar-rival top">${icon('crown', 16)}You are on top. ${who(rows[1].uid)} is ${esc(fmt(g, Math.abs(me.value - rows[1].value)))}${g.metric === 'time' ? 's' : ''} behind.</p>`;
    return `<div class="ar-bh"><button class="btn ghost small" data-act="back">${icon('chevron-left', 16)}All games</button></div>
    <section class="card ar-board"><div class="ar-bt">${gtile(g, 48)}<div><h3>${esc(g.name)}</h3><small>${esc(g.platform)} · ${esc(g.unit)} · ${metricWords(g)}</small></div><button class="btn primary small" data-act="log" data-gid="${g.id}">${icon('plus', 16)}Log</button></div>
      <div class="tabs ar-per">${[['week', 'This week'], ['all', 'All time']].map(([k, n]) => `<button class="tab ${period === k ? 'on' : ''}" data-per="${k}">${n}</button>`).join('')}</div>${rival}
      ${rows.length ? `<ol class="ar-rows">${rows.map(r => `<li class="${r.uid === S.uid ? 'me' : ''}">${rankBadge(r.rank)}${av(r.uid, 32)}<div class="ar-rn"><b>${who(r.uid)}</b><small>${r.detail ? esc(r.detail) + ' · ' : ''}${ago(r.ts)}</small></div><strong class="ar-val">${esc(fmt(g, r.value))}</strong><div class="ar-ea">${r.img ? `<button class="ar-ic" data-proof="${esc(r.img)}" aria-label="View proof screenshot">${icon('image', 16)}</button>` : ''}${r.uid === S.uid ? `<button class="ar-ic" data-del="${r.id}" aria-label="Remove my entry">${icon('trash-2', 16)}</button>` : `<button class="ar-cheer ${r.cheered ? 'on' : ''}" data-cheer="${r.id}" aria-pressed="${r.cheered}" aria-label="Cheer">${icon('thumbs-up', 14)}${r.cheers || ''}</button><button class="ar-ic" data-flag="${r.id}" aria-label="${r.flagged ? 'Remove flag' : 'Flag as suspicious'}" title="${r.flagged ? 'Flagged. Click to undo' : 'Flag as suspicious'}">${icon('flag', 14)}</button>`}</div></li>`).join('')}</ol>` : `<div class="ar-none">${icon('trophy', 24)}<b>No scores ${period === 'week' ? 'this week' : 'yet'}.</b><p>Be the first on the board.</p></div>`}</section>`;
  }
  function chCard(c) {
    const g = G(c.gid) || {};
    return `<article class="card ar-ch ${c.done ? 'done' : ''}"><header>${gtile(g, 40)}<div class="ar-cn"><h4>${esc(c.title)}</h4><small>${esc(g.name || '')} · by ${who(c.uid)}</small></div><span class="pc ${c.done ? '' : 'live'}">${c.done ? 'Finished' : left(c.ends)}</span></header>
      ${c.standings.length ? `<ol class="ar-top">${c.standings.map(r => `<li>${rankBadge(r.rank)}${av(r.uid, 22)}<span class="ar-nm">${who(r.uid)}</span><b>${esc(fmt(g, r.value))}</b></li>`).join('')}</ol>` : '<p class="ar-empty">No entries yet.</p>'}
      ${c.done ? (c.winner ? `<p class="ar-win">${icon('crown', 16)}${who(c.winner)} won.</p>` : '<p class="muted small">Not enough entries for a winner.</p>') : `<button class="btn primary small" data-act="log" data-gid="${c.gid}" data-cid="${c.id}">Enter this challenge</button>`}</article>`;
  }
  function challengesView() {
    const live = D.challenges.filter(c => !c.done), done = D.challenges.filter(c => c.done);
    return `<div class="ar-two"><div><div class="ar-bar"><h3 class="ar-h">Live challenges</h3><button class="btn small" data-act="newch">${icon('plus', 16)}New challenge</button></div>
      ${live.length ? `<div class="ar-cards">${live.map(chCard).join('')}</div>` : `<div class="ar-none">${icon('swords', 24)}<b>No live challenges.</b><p>Throw down: pick a game, set a title and a deadline.</p></div>`}
      ${done.length ? `<h3 class="ar-h" style="margin-top:var(--space-5)">Recently finished</h3><div class="ar-cards">${done.map(chCard).join('')}</div>` : ''}</div>${side()}</div>`;
  }
  function matchCard(t, r, i, m) {
    const slot = (id, other) => id ? `<div class="mt-p ${m.winner === id ? 'win' : m.winner ? 'lose' : ''}">${av(id, 22)}<span>${who(id)}</span>${m.winner === id ? icon('check', 14) : ''}</div>` : `<div class="mt-p empty"><span>${m.bye && other ? 'Bye' : 'TBD'}</span></div>`;
    const canAct = !m.winner && m.a && m.b && t.state === 'active' && (t.host === S.uid || S.uid === m.a || S.uid === m.b);
    return `<div class="mt ${m.dispute ? 'dispute' : ''}">${slot(m.a, m.b)}${slot(m.b, m.a)}${canAct ? `<div class="mt-act"><span class="muted small">${m.dispute ? 'Reports disagree. Host decides.' : 'Who won?'}</span>${[m.a, m.b].map(id => `<button class="btn small" data-rep="${t.id}|${r}|${i}|${id}">${esc(U(id).name.split(' ')[0])}</button>`).join('')}</div>` : ''}</div>`;
  }
  function tCard(t) {
    const g = G(t.gid) || {}; const inn = t.players.includes(S.uid); const host = t.host === S.uid;
    const names = ['Round 1', 'Quarterfinals', 'Semifinals', 'Final'];
    const rn = (ri, n) => n - ri === 1 ? 'Final' : n - ri === 2 ? 'Semifinals' : n - ri === 3 ? 'Quarterfinals' : 'Round ' + (ri + 1);
    return `<article class="card ar-t"><header>${gtile(g, 40)}<div class="ar-cn"><h4>${esc(t.title)}</h4><small>${esc(g.name || '')} · hosted by ${who(t.host)}</small></div><span class="pc ${t.state === 'active' ? 'live' : ''}">${t.state === 'open' ? 'Sign-ups open' : t.state === 'active' ? 'In progress' : 'Finished'}</span></header>
      ${t.state === 'open' ? `<div class="ar-pl">${t.players.map(id => `<span class="pc">${av(id, 22)}${who(id)}</span>`).join('')}</div><div class="ar-ta">${host ? '' : `<button class="btn small ${inn ? '' : 'primary'}" data-tj="${t.id}">${inn ? 'Leave' : 'Join'}</button>`}${host ? `<button class="btn small primary" data-ts="${t.id}" ${t.players.length < 3 ? 'disabled' : ''}>Start bracket</button><button class="btn small ghost" data-tc="${t.id}">Cancel</button>` : ''}<span class="muted small">${t.players.length}/16 players${host && t.players.length < 3 ? ' · need 3 to start' : ''}</span></div>`
      : `${t.champion ? `<p class="ar-win">${icon('crown', 16)}${who(t.champion)} is the champion.</p>` : ''}<div class="br" role="group" aria-label="Bracket">${t.rounds.map((rd, ri) => `<div class="br-col"><h5>${rn(ri, t.rounds.length)}</h5><div class="br-ms">${rd.map((m, i) => matchCard(t, ri, i, m)).join('')}</div></div>`).join('')}</div>`}</article>`;
  }
  function tourneysView() {
    const list = D.tourneys;
    return `<div class="ar-bar"><h3 class="ar-h">Tournaments</h3><button class="btn small" data-act="newt">${icon('plus', 16)}New tournament</button></div>${list.length ? `<div class="ar-tl">${list.map(tCard).join('')}</div>` : `<div class="ar-none">${icon('swords', 24)}<b>No brackets yet.</b><p>Host a lunchtime Mario Kart cup or a Smash showdown. Three to sixteen players, single elimination.</p></div>`}`;
  }
  function draw() {
    if (!root || !D) return; const keep = root.scrollTop;
    let body;
    if (tab === 'boards') body = gid ? `<div class="ar-two"><div>${boardView()}</div>${side()}</div>` : `<div class="ar-two"><div>${gamesGrid()}</div>${side()}</div>`;
    else if (tab === 'challenges') body = challengesView(); else body = tourneysView();
    root.innerHTML = `<div class="arena">${head()}${body}</div>`; root.scrollTop = keep;
  }

  /* ---------- modals ---------- */
  function modal(label, html, setup) {
    const opener = document.activeElement; const m = document.createElement('div'); m.className = 'modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', label);
    m.innerHTML = `<div class="modal-card" tabindex="-1">${html}</div>`; document.body.appendChild(m); $('.modal-card', m).focus();
    const close = () => { m.remove(); if (opener && opener.focus) opener.focus(); };
    m.addEventListener('keydown', e => { if (e.key === 'Escape') close(); if (e.key === 'Tab') { const f = $$('button:not([disabled]), input, select, textarea, a[href]', m).filter(x => x.offsetParent || x.type === 'file'); if (!f.length) return; const a = f[0], z = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } } });
    m.addEventListener('mousedown', e => { if (e.target === m) close(); });
    setup(m, close); return m;
  }
  function downscale(file) {
    return new Promise((res, rej) => { const i = new Image(), u = URL.createObjectURL(file); i.onload = () => { const k = Math.min(1, 1200 / Math.max(i.width, i.height)); const c = document.createElement('canvas'); c.width = Math.round(i.width * k); c.height = Math.round(i.height * k); c.getContext('2d').drawImage(i, 0, 0, c.width, c.height); URL.revokeObjectURL(u); res(c.toDataURL('image/jpeg', .82)); }; i.onerror = () => rej(new Error('Could not read that image.')); i.src = u; });
  }
  const gameOpts = sel => D.games.map(g => `<option value="${g.id}" ${g.id === sel ? 'selected' : ''}>${esc(g.name)}</option>`).join('');

  function logModal(pre = {}) {
    modal('Log a score', `<h3>Log a score</h3><p class="muted small">Your best per game counts on the board. A screenshot is optional and earns trust.</p>
      <label class="field"><span>Game</span><select id="lgG">${gameOpts(pre.gid || gid || (D.games.find(g => g.myRank) || D.games[0]).id)}</select></label>
      <label class="field"><span id="lgUnit">Result</span><input id="lgV" inputmode="decimal" autocomplete="off" maxlength="14"></label>
      <label class="field"><span>Track, mode or character <i class="muted">(optional)</i></span><input id="lgD" maxlength="40" autocomplete="off" placeholder="e.g. Rainbow Road, 150cc"></label>
      <label class="field"><span>Trash talk or a note <i class="muted">(optional)</i></span><input id="lgN" maxlength="140" autocomplete="off" placeholder="Beat that."></label>
      <label class="field" id="lgCw" hidden><span>Counts toward a challenge</span><select id="lgC"></select></label>
      <label class="file"><input type="file" id="lgF" accept="image/jpeg,image/png,image/webp"><span>${icon('image-plus', 18)}Add a screenshot of your result</span></label><div class="pm-prev" id="lgP" hidden></div><div class="err" id="lgE"></div>
      <div class="modal-act"><button class="btn ghost" id="lgX">Cancel</button><button class="btn primary" id="lgGo">Log it</button></div>`, (m, close) => {
      let img = null; const sync = () => {
        const g = G($('#lgG', m).value); $('#lgUnit', m).textContent = `${g.unit} · ${metricWords(g)}`; $('#lgV', m).placeholder = 'e.g. ' + g.hint;
        const cs = D.challenges.filter(c => !c.done && c.gid === g.id); $('#lgCw', m).hidden = !cs.length; $('#lgC', m).innerHTML = '<option value="">No challenge, just the board</option>' + cs.map(c => `<option value="${c.id}" ${c.id === pre.cid ? 'selected' : ''}>${esc(c.title)}</option>`).join('');
      };
      $('#lgG', m).onchange = sync; sync(); $('#lgX', m).onclick = close; $('#lgV', m).focus();
      $('#lgF', m).onchange = async e => { const f = e.target.files[0]; if (!f) return; try { img = await downscale(f); const p = $('#lgP', m); p.hidden = false; p.innerHTML = `<img src="${img}" alt="Preview of your screenshot">`; } catch (er) { $('#lgE', m).textContent = er.message; } };
      $('#lgGo', m).onclick = async () => {
        const btn = $('#lgGo', m); btn.disabled = true; $('#lgE', m).textContent = '';
        try {
          const g = G($('#lgG', m).value);
          const r = await api('/api/arena/log', { gid: g.id, value: $('#lgV', m).value, detail: $('#lgD', m).value, note: $('#lgN', m).value, img, cid: $('#lgC', m).value || undefined });
          close(); gid = g.id; period = 'all'; tab = 'boards';
          toast(`${r.pb ? 'New personal best. ' : 'Logged. '}${r.rank ? 'You are #' + r.rank + '. ' : ''}${r.pts ? '+' + r.pts + ' pts' : ''}`.trim());
          if (r.top || r.rank === 1) confetti();
          await load();
        } catch (er) { $('#lgE', m).textContent = er.message || 'Something went wrong.'; btn.disabled = false; }
      };
    });
  }
  function addGameModal() {
    modal('Add a game', `<h3>Add a game</h3><p class="muted small">Anyone on the team can add one. Pick how it is scored.</p>
      <label class="field"><span>Name</span><input id="agN" maxlength="40" autocomplete="off" placeholder="e.g. Mario Party Jamboree"></label>
      <label class="field"><span>Platform</span><input id="agP" maxlength="20" autocomplete="off" placeholder="Switch, PC, Phone…"></label>
      <label class="field"><span>How is it scored?</span><select id="agM"><option value="high">Highest score wins</option><option value="time">Fastest time wins</option><option value="low">Lowest number wins</option></select></label>
      <label class="field"><span>What are you measuring?</span><input id="agU" maxlength="30" autocomplete="off" placeholder="e.g. Stars, Lap time, Strokes"></label>
      <label class="field"><span>Type</span><select id="agK">${D.kinds.map(k => `<option value="${k}" ${k === 'other' ? 'selected' : ''}>${k[0].toUpperCase() + k.slice(1)}</option>`).join('')}</select></label><div class="err" id="agE"></div>
      <div class="modal-act"><button class="btn ghost" id="agX">Cancel</button><button class="btn primary" id="agGo">Add game</button></div>`, (m, close) => {
      $('#agX', m).onclick = close; $('#agN', m).focus();
      $('#agGo', m).onclick = async () => { try { const r = await api('/api/arena/game', { name: $('#agN', m).value, platform: $('#agP', m).value, metric: $('#agM', m).value, unit: $('#agU', m).value, kind: $('#agK', m).value }); close(); gid = r.game.id; await load(); toast('Game added.'); } catch (e) { $('#agE', m).textContent = e.message; } };
    });
  }
  function newChModal() {
    modal('New challenge', `<h3>Throw down a challenge</h3><p class="muted small">Everyone gets until the deadline. The best result wins 20 points and the lightning badge.</p>
      <label class="field"><span>Game</span><select id="ncG">${gameOpts(gid)}</select></label>
      <label class="field"><span>Title</span><input id="ncT" maxlength="60" autocomplete="off" placeholder="e.g. Beat my Rainbow Road time"></label>
      <label class="field"><span>Deadline</span><select id="ncD"><option value="1">24 hours</option><option value="3" selected>3 days</option><option value="7">7 days</option></select></label><div class="err" id="ncE"></div>
      <div class="modal-act"><button class="btn ghost" id="ncX">Cancel</button><button class="btn primary" id="ncGo">Post challenge</button></div>`, (m, close) => {
      $('#ncX', m).onclick = close; $('#ncT', m).focus();
      $('#ncGo', m).onclick = async () => { try { await api('/api/arena/challenge', { gid: $('#ncG', m).value, title: $('#ncT', m).value, days: $('#ncD', m).value }); close(); tab = 'challenges'; await load(); } catch (e) { $('#ncE', m).textContent = e.message; } };
    });
  }
  function newTModal() {
    modal('New tournament', `<h3>Host a tournament</h3><p class="muted small">Single elimination for three to sixteen players. You start the bracket when enough people have joined.</p>
      <label class="field"><span>Game</span><select id="ntG">${gameOpts(gid)}</select></label>
      <label class="field"><span>Name</span><input id="ntT" maxlength="60" autocomplete="off" placeholder="e.g. Friday Lunch Cup"></label><div class="err" id="ntE"></div>
      <div class="modal-act"><button class="btn ghost" id="ntX">Cancel</button><button class="btn primary" id="ntGo">Open sign-ups</button></div>`, (m, close) => {
      $('#ntX', m).onclick = close; $('#ntT', m).focus();
      $('#ntGo', m).onclick = async () => { try { await api('/api/arena/t/create', { gid: $('#ntG', m).value, title: $('#ntT', m).value }); close(); tab = 'tourneys'; await load(); } catch (e) { $('#ntE', m).textContent = e.message; } };
    });
  }
  function proofModal(src) { modal('Proof screenshot', `<img class="ar-proof" src="${esc(src)}" alt="Screenshot submitted as proof"><div class="modal-act"><button class="btn primary" id="prX">Close</button></div>`, (m, close) => { $('#prX', m).onclick = close; $('#prX', m).focus(); }); }

  /* ---------- events ---------- */
  function click(e) {
    const t = e.target;
    const tb = t.closest('[data-tab]'); if (tb) { tab = tb.dataset.tab; draw(); return; }
    const gm = t.closest('[data-game]'); if (gm) { gid = gm.dataset.game; safe(async () => { await loadBoard(); draw(); }); return; }
    const per = t.closest('[data-per]'); if (per) { period = per.dataset.per; safe(async () => { await loadBoard(); draw(); }); return; }
    const act = t.closest('[data-act]');
    if (act) { const a = act.dataset.act; if (a === 'back') { gid = null; B = null; draw(); } else if (a === 'log') logModal({ gid: act.dataset.gid, cid: act.dataset.cid }); else if (a === 'addgame') addGameModal(); else if (a === 'newch') newChModal(); else if (a === 'newt') newTModal(); return; }
    const pr = t.closest('[data-proof]'); if (pr) { proofModal(pr.dataset.proof); return; }
    const ch = t.closest('[data-cheer]'); if (ch) { safe(() => api('/api/arena/cheer', { id: ch.dataset.cheer })); return; }
    const fl = t.closest('[data-flag]'); if (fl) { safe(async () => { const r = await api('/api/arena/flag', { id: fl.dataset.flag }); toast(r.hidden ? 'Thanks. That entry is hidden pending review.' : 'Flagged. If two people flag it, it is hidden.'); }); return; }
    const del = t.closest('[data-del]'); if (del) { if (confirm('Remove this entry?')) safe(() => api('/api/arena/delete', { id: del.dataset.del })); return; }
    const tj = t.closest('[data-tj]'); if (tj) { safe(() => api('/api/arena/t/join', { id: tj.dataset.tj })); return; }
    const ts = t.closest('[data-ts]'); if (ts) { safe(() => api('/api/arena/t/start', { id: ts.dataset.ts })); return; }
    const tc = t.closest('[data-tc]'); if (tc) { if (confirm('Cancel this tournament?')) safe(() => api('/api/arena/t/cancel', { id: tc.dataset.tc })); return; }
    const rp = t.closest('[data-rep]'); if (rp) { const [id, r, i, winner] = rp.dataset.rep.split('|'); safe(() => api('/api/arena/t/report', { id, r: +r, i: +i, winner })); return; }
  }

  register({
    id: 'arena', title: 'Arena', icon: 'trophy', order: 26,
    render(el) { root = el; el.onclick = click; el.innerHTML = '<div class="arena"><p class="muted">Loading the Arena…</p></div>'; safe(load); },
    leave() { root = null; clearTimeout(timer); },
  });
  on('arena', refresh);
  on('user', () => { if (root) refresh(); });
})();
