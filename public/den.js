'use strict';
/* Beast Den core: identity, beasts, realtime, shell. Features live in /modules/*.js and call Den.register(). */
const Den = (() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const S = { uid: localStorage.getItem('den.uid') || '', me: null, users: {}, presence: [], fire: 0, boot: null, mods: [], handlers: {}, active: null };

  /* ---------------- tiny event bus ---------------- */
  const on = (evt, fn) => { (S.handlers[evt] = S.handlers[evt] || []).push(fn); };
  const emit = (evt, data) => (S.handlers[evt] || []).forEach(fn => { try { fn(data); } catch (e) { console.error(e); } });
  const register = mod => { S.mods.push(mod); S.mods.sort((a, b) => (a.order || 50) - (b.order || 50)); };

  /* ---------------- api ---------------- */
  async function api(path, body) {
    const opt = body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: S.uid, ...body }) };
    const url = body === undefined ? path + (path.includes('?') ? '&' : '?') + 'uid=' + encodeURIComponent(S.uid) : path;
    const res = await fetch(url, opt);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.error || 'Something went wrong.'); e.status = res.status; if (res.status === 401) { localStorage.removeItem('den.uid'); location.reload(); } throw e; }
    return data;
  }
  const safe = async (fn) => { try { return await fn(); } catch (e) { toast(e.message); } };

  /* ---------------- beasts ---------------- */
  const EARS = 3, EYES = 4, MOUTHS = 3, ACCS = 5;
  const randBeast = () => ({ hue: Math.floor(Math.random() * 360), ears: Math.floor(Math.random() * EARS), eyes: Math.floor(Math.random() * EYES), mouth: Math.floor(Math.random() * MOUTHS), acc: Math.floor(Math.random() * ACCS) });
  const PSKIN = ['#FBD9C0', '#F2C29B', '#DDA373', '#B97B4E', '#8A5634', '#5E3A22'];
  const PHAIR = ['#2B1D14', '#5A3A22', '#9A6A3A', '#D9B35F', '#B5452B', '#8C8C92', '#E6E6EA', '#3B5BDB'];
  const PN = { hair: 8, hc: 8, skin: 6, eyes: 4, mouth: 4, fh: 3, acc: 5 };
  const rnd = n => Math.floor(Math.random() * n);
  const randPerson = () => ({ kind: 'person', skin: rnd(6), hair: rnd(8), hc: rnd(8), eyes: rnd(4), mouth: rnd(4), fh: rnd(3) === 0 ? 1 + rnd(2) : 0, acc: rnd(5), hue: rnd(360) });
  const randAvatar = kind => kind === 'person' ? randPerson() : randBeast();
  function personSVG(p, size = 48) {
    const g = (k, n) => Math.max(0, Math.min(n - 1, +p[k] || 0));
    const skin = PSKIN[g('skin', 6)], hair = PHAIR[g('hc', 8)], hs = g('hair', 8), ink = '#2a1a2e', shade = 'rgba(70,35,20,.35)';
    const shirt = `hsl(${(+p.hue || 0) % 360} 55% 50%)`, cap = `hsl(${(+p.hue || 0) % 360} 60% 42%)`;
    const top = `<path d="M27 48 C25 22 40 18 50 18 C62 18 76 24 73 48 C70 38 64 33 50 33 C38 33 31 38 27 48Z" fill="${hair}"/>`;
    const back = [
      '', '', '', '',
      `<path d="M24 54 C20 20 36 14 50 14 C64 14 80 20 76 54 L79 94 L21 94Z" fill="${hair}"/>`,
      `<circle cx="50" cy="12" r="10" fill="${hair}"/>`,
      [[28, 34, 9], [38, 24, 10], [50, 20, 10], [62, 24, 10], [72, 34, 9], [24, 48, 8], [76, 48, 8]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${hair}"/>`).join(''),
      `<path d="M24 30 C26 12 74 12 76 30 L79 68 C79 75 69 75 68 66 L32 66 C31 75 21 75 21 68Z" fill="${hair}"/>`,
    ][hs];
    const front = [
      '', top, `<path d="M28 44 C28 26 40 22 50 22 C61 22 72 27 72 44 C68 34 60 31 50 31 C40 31 32 34 28 44Z" fill="${hair}" opacity=".85"/>`,
      `<path d="M26 52 C22 22 40 15 54 17 C70 19 78 32 74 52 C72 40 66 33 56 31 C46 36 36 36 30 44 C28 46 27 50 26 52Z" fill="${hair}"/>`,
      top, top, top, `<path d="M27 46 C28 26 40 21 50 21 C60 21 72 26 73 46 C66 36 58 33 50 33 C42 33 34 36 27 46Z" fill="${hair}"/>`,
    ][hs];
    const eyes = [
      `<circle cx="40" cy="50" r="3.2" fill="${ink}"/><circle cx="60" cy="50" r="3.2" fill="${ink}"/><circle cx="41" cy="49" r="1" fill="#fff"/><circle cx="61" cy="49" r="1" fill="#fff"/>`,
      `<path d="M35 52 q5 -7 10 0" stroke="${ink}" stroke-width="2.8" fill="none" stroke-linecap="round"/><path d="M55 52 q5 -7 10 0" stroke="${ink}" stroke-width="2.8" fill="none" stroke-linecap="round"/>`,
      `<ellipse cx="40" cy="50" rx="5.6" ry="6" fill="#fff"/><ellipse cx="60" cy="50" rx="5.6" ry="6" fill="#fff"/><circle cx="40.6" cy="51" r="3" fill="${ink}"/><circle cx="59.4" cy="51" r="3" fill="${ink}"/>`,
      `<path d="M35 51 h10" stroke="${ink}" stroke-width="2.8" stroke-linecap="round"/><path d="M55 52 q5 -7 10 0" stroke="${ink}" stroke-width="2.8" fill="none" stroke-linecap="round"/>`,
    ][g('eyes', 4)];
    const brows = `<path d="M34 42 q6 -3 12 0 M54 42 q6 -3 12 0" stroke="${hs === 0 || hs === 2 ? shade : hair}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
    const mouth = [
      `<path d="M43 63 q7 6 14 0" stroke="${ink}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
      `<path d="M42 62 q8 11 16 0Z" fill="#7a2a3a"/>`,
      `<path d="M44 64 h12" stroke="${ink}" stroke-width="2.6" stroke-linecap="round"/>`,
      `<path d="M43 65 q8 3 14 -3" stroke="${ink}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
    ][g('mouth', 4)];
    const fh = [
      '', `<path d="M40 60 q10 -6 20 0 q-10 3 -20 0Z" fill="${hair}"/>`,
      `<path d="M28 54 C28 80 72 80 72 54 C69 66 61 69 50 69 C39 69 31 66 28 54Z" fill="${hair}"/><path d="M40 60 q10 -5 20 0 q-10 3 -20 0Z" fill="${hair}"/>`,
    ][g('fh', 3)];
    const acc = [
      '',
      `<circle cx="40" cy="50" r="8.5" fill="rgba(255,255,255,.2)" stroke="#2b2b3a" stroke-width="2.2"/><circle cx="60" cy="50" r="8.5" fill="rgba(255,255,255,.2)" stroke="#2b2b3a" stroke-width="2.2"/><path d="M48.5 50 h3" stroke="#2b2b3a" stroke-width="2.2"/>`,
      `<rect x="30.5" y="43.5" width="18" height="14" rx="3.5" fill="rgba(255,255,255,.2)" stroke="#2b2b3a" stroke-width="2.2"/><rect x="51.5" y="43.5" width="18" height="14" rx="3.5" fill="rgba(255,255,255,.2)" stroke="#2b2b3a" stroke-width="2.2"/><path d="M48.5 49 h3" stroke="#2b2b3a" stroke-width="2.2"/>`,
      `<path d="M26 52 C22 10 78 10 74 52" stroke="#2b2b3a" stroke-width="4.5" fill="none"/><rect x="20" y="46" width="10" height="20" rx="5" fill="#2b2b3a"/><rect x="70" y="46" width="10" height="20" rx="5" fill="#2b2b3a"/>`,
      `<path d="M26 40 C26 12 74 12 74 40Z" fill="${cap}"/><path d="M22 40 h40 q6 -1 10 3 q-30 4 -50 -3Z" fill="${cap}" opacity=".9"/><rect x="24" y="36" width="52" height="6" rx="3" fill="rgba(0,0,0,.18)"/>`,
    ][g('acc', 5)];
    return `<svg class="beast pav" viewBox="-5 -5 110 110" width="${size}" height="${size}" aria-hidden="true">${back}<path d="M10 112 C10 88 30 80 50 80 C70 80 90 88 90 112Z" fill="${shirt}"/><rect x="42" y="64" width="16" height="20" rx="6" fill="${skin}"/><rect x="42" y="64" width="16" height="9" fill="${shade}"/><circle cx="28.5" cy="52" r="4.5" fill="${skin}"/><circle cx="71.5" cy="52" r="4.5" fill="${skin}"/><ellipse cx="50" cy="50" rx="22" ry="26" fill="${skin}"/><path d="M50 53 q-3.5 6 0 7.5" stroke="${shade}" stroke-width="1.8" fill="none" stroke-linecap="round"/>${brows}${eyes}${fh}${mouth}${front}${acc}</svg>`;
  }
  function beastSVG(b, size = 48) {
    if (b && b.kind === 'person') return personSVG(b, size);
    b = b || { hue: 200, ears: 0, eyes: 0, mouth: 0, acc: 0 };
    const fur = `hsl(${b.hue} 36% 64%)`, dark = `hsl(${b.hue} 34% 46%)`, light = `hsl(${(b.hue + 12) % 360} 40% 90%)`, inner = `hsl(${(b.hue + 330) % 360} 45% 84%)`;
    const ink = '#2a1a2e';
    let ears = '';
    if (b.ears === 0) ears = `<circle cx="24" cy="32" r="13" fill="${dark}"/><circle cx="76" cy="32" r="13" fill="${dark}"/><circle cx="24" cy="32" r="7" fill="${inner}"/><circle cx="76" cy="32" r="7" fill="${inner}"/>`;
    else if (b.ears === 1) ears = `<path d="M17 50 L22 10 L46 30Z" fill="${dark}"/><path d="M83 50 L78 10 L54 30Z" fill="${dark}"/><path d="M24 40 L25 20 L38 31Z" fill="${inner}"/><path d="M76 40 L75 20 L62 31Z" fill="${inner}"/>`;
    else ears = `<ellipse cx="16" cy="52" rx="10" ry="21" fill="${dark}" transform="rotate(14 16 52)"/><ellipse cx="84" cy="52" rx="10" ry="21" fill="${dark}" transform="rotate(-14 84 52)"/>`;
    const eyes = [
      `<circle cx="38" cy="52" r="4.2" fill="${ink}"/><circle cx="62" cy="52" r="4.2" fill="${ink}"/><circle cx="39.4" cy="50.6" r="1.3" fill="#fff"/><circle cx="63.4" cy="50.6" r="1.3" fill="#fff"/>`,
      `<path d="M32 54 q6 -8 12 0" stroke="${ink}" stroke-width="3.2" fill="none" stroke-linecap="round"/><path d="M56 54 q6 -8 12 0" stroke="${ink}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`,
      `<circle cx="37" cy="51" r="7.5" fill="#fff"/><circle cx="63" cy="51" r="7.5" fill="#fff"/><circle cx="38.5" cy="52" r="3.8" fill="${ink}"/><circle cx="61.5" cy="52" r="3.8" fill="${ink}"/>`,
      `<path d="M32 52 h12" stroke="${ink}" stroke-width="3.2" stroke-linecap="round"/><path d="M56 54 q6 -8 12 0" stroke="${ink}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`,
    ][b.eyes];
    const mouth = [
      `<path d="M43 73 q7 6 14 0" stroke="${ink}" stroke-width="2.8" fill="none" stroke-linecap="round"/>`,
      `<path d="M43 71 q7 12 14 0Z" fill="#7a2a3a"/>`,
      `<path d="M43 72 q7 6 14 0" stroke="${ink}" stroke-width="2.8" fill="none" stroke-linecap="round"/><ellipse cx="50" cy="79" rx="4" ry="3.4" fill="#ff7a9a"/>`,
    ][b.mouth];
    const acc = [
      '',
      `<path d="M16 54 C16 18 84 18 84 54" stroke="#2b2b3a" stroke-width="5" fill="none"/><rect x="10" y="48" width="12" height="20" rx="6" fill="#2b2b3a"/><rect x="78" y="48" width="12" height="20" rx="6" fill="#2b2b3a"/><path d="M14 66 q4 14 22 14" stroke="#2b2b3a" stroke-width="3" fill="none"/><circle cx="37" cy="80" r="3.4" fill="#2b2b3a"/>`,
      `<circle cx="38" cy="52" r="10.5" fill="rgba(255,255,255,.18)" stroke="#2b2b3a" stroke-width="2.6"/><circle cx="62" cy="52" r="10.5" fill="rgba(255,255,255,.18)" stroke="#2b2b3a" stroke-width="2.6"/><path d="M48.5 52 h3" stroke="#2b2b3a" stroke-width="2.6"/>`,
      `<path d="M20 38 C20 8 80 8 80 38Z" fill="#007F9E"/><rect x="18" y="34" width="64" height="9" rx="4.5" fill="#06617C"/><circle cx="50" cy="9" r="5" fill="#FFB020"/>`,
      `<path d="M30 28 L36 10 L43 22 L50 6 L57 22 L64 10 L70 28Z" fill="#ffc15e" stroke="#e09a2b" stroke-width="2"/>`,
    ][b.acc];
    return `<svg class="beast" viewBox="-5 -5 110 110" width="${size}" height="${size}" aria-hidden="true">${ears}<ellipse cx="50" cy="58" rx="35" ry="31" fill="${fur}"/><ellipse cx="50" cy="69" rx="18" ry="13" fill="${light}"/><ellipse cx="50" cy="63" rx="5.2" ry="3.7" fill="${ink}"/>${eyes}${mouth}${acc}</svg>`;
  }

  /* ---------------- icons (Lucide, bundled in icons.js) ---------------- */
  const icon = (name, size = 20, cls = '') => LUCIDE[name] ? `<svg class="i ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${LUCIDE[name]}</svg>` : '';
  const EMOJI_ICON = { '☕': 'coffee', '🎮': 'gamepad-2', '🎧': 'headphones', '🌿': 'leaf', '🌳': 'trees', '💧': 'droplets', '🧘': 'person-standing', '👋': 'hand', '🚶': 'footprints', '✨': 'sparkles', '🌍': 'globe', '🎨': 'palette', '🕵️': 'search', '🎯': 'target', '⚡': 'zap', '🎲': 'dice-5', '🤔': 'smile', '🔥': 'flame' };
  const iconFor = (emoji, size = 20) => EMOJI_ICON[emoji] ? icon(EMOJI_ICON[emoji], size) : esc(emoji);

  /* ---------------- fire ---------------- */
  const fireLabel = l => l < 15 ? 'Embers' : l < 40 ? 'Crackling' : l < 70 ? 'Roaring' : 'Blazing';
  function fireSVG(level, uid = '') {
    const s = (0.32 + clamp(level, 0, 100) / 100 * 0.78).toFixed(2); const glow = (0.15 + level / 100 * 0.7).toFixed(2);
    const sparks = Math.round(2 + level / 14);
    let sp = ''; for (let i = 0; i < sparks; i++) sp += `<circle class="spark" cx="${50 + (i * 17) % 40}" cy="110" r="${1.4 + (i % 3) * 0.6}" style="animation-delay:${(i * 0.37).toFixed(2)}s;--dx:${((i % 5) - 2) * 7}px"/>`;
    return `<svg class="fire" viewBox="0 0 120 140" style="--s:${s}" role="img" aria-label="Den fire: ${fireLabel(level)}">
            <g class="flames"><path class="f1" d="M60 14C80 46 94 62 90 94c-3 20-17 31-30 31S33 114 30 94C27 64 50 52 60 14Z" fill="#E96F3D"/>
      <path class="f2" d="M60 40C72 60 82 70 79 94c-2 14-10 22-19 22s-17-8-19-22c-3-24 11-34 19-54Z" fill="#FFB020"/>
      <path class="f3" d="M60 66c6 10 11 16 9 28-1 8-5 12-9 12s-8-4-9-12c-2-12 3-18 9-28Z" fill="#FFF3D6"/></g>
      <rect x="22" y="118" width="76" height="12" rx="6" fill="#586168" transform="rotate(-5 60 124)"/><rect x="22" y="118" width="76" height="12" rx="6" fill="#3D4449" transform="rotate(6 60 124)"/>${sp}</svg>`;
  }

  /* ---------------- toast + confetti ---------------- */
  function toast(text, ms = 3200) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = text; const box = $('#toasts'); box.appendChild(t); while (box.children.length > 2) box.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, ms);
  }
  function confetti() {
    const c = $('#confetti'); const ctx = c.getContext('2d'); c.width = innerWidth; c.height = innerHeight;
    const cs = getComputedStyle(document.documentElement); const cols = ['--brand-500', '--accent-gold', '--accent-green', '--accent-pink', '--accent-purple', '--accent-orange'].map(v => cs.getPropertyValue(v).trim());
    const ps = Array.from({ length: 140 }, () => ({ x: innerWidth / 2 + (Math.random() - .5) * 200, y: innerHeight * .55, vx: (Math.random() - .5) * 16, vy: -8 - Math.random() * 12, r: 3 + Math.random() * 5, c: cols[Math.floor(Math.random() * cols.length)], rot: Math.random() * 6, vr: (Math.random() - .5) * .4, life: 0 }));
    if (DenTheme.reduced()) return;
    (function frame() {
      ctx.clearRect(0, 0, c.width, c.height); let alive = 0;
      for (const p of ps) { p.life++; p.x += p.vx; p.y += p.vy; p.vy += 0.38; p.vx *= .99; p.rot += p.vr; if (p.y < c.height + 20 && p.life < 220) { alive++; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c; ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); ctx.restore(); } }
      if (alive) requestAnimationFrame(frame); else ctx.clearRect(0, 0, c.width, c.height);
    })();
  }

  /* ---------------- avatar editor (shared by sign-up and the profile panel) ---------------- */
  const ROWS = {
    beast: [['Ears', 'ears', EARS], ['Eyes', 'eyes', EYES], ['Mouth', 'mouth', MOUTHS], ['Gear', 'acc', ACCS]],
    person: [['Hair', 'hair', 8], ['Hair color', 'hc', 8], ['Skin', 'skin', 6], ['Eyes', 'eyes', 4], ['Mouth', 'mouth', 4], ['Beard', 'fh', 3], ['Gear', 'acc', 5]],
  };
  /* st = { kind, beast, person }; returns { get() } and keeps st current. */
  function avatarEditor(host, st, size = 140) {
    const cur = () => st[st.kind];
    const draw = (full = true) => {
      $('.ob-preview', host).innerHTML = beastSVG(cur(), size);
      if (!full) return;
      $$('.seg button', host).forEach(b => { const on = b.dataset.kind === st.kind; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
      const a = cur();
      $('.ob-controls', host).innerHTML = ROWS[st.kind].map(([label, k, n]) => `<div class="ob-row"><span>${label}</span><button type="button" class="btn small" data-k="${k}" data-d="-1" aria-label="Previous ${label}">${icon('chevron-left', 18)}</button><button type="button" class="btn small" data-k="${k}" data-d="1" aria-label="Next ${label}">${icon('chevron-right', 18)}</button></div>`).join('') +
        `<div class="ob-row"><span>${st.kind === 'person' ? 'Shirt' : 'Color'}</span><input type="range" min="0" max="359" value="${a.hue}" class="hue" aria-label="${st.kind === 'person' ? 'Shirt color' : 'Color'}"></div>`;
      $('.hue', host).oninput = e => { cur().hue = +e.target.value; draw(false); };
    };
    host.innerHTML = `<div class="av-ed"><div class="seg" role="group" aria-label="Avatar style"><button type="button" data-kind="beast">${icon('paw-print', 18)}Beast</button><button type="button" data-kind="person">${icon('user-round', 18)}Person</button></div>
      <div class="ob-preview"></div><div class="ob-controls"></div>
      <button type="button" class="btn ghost" data-roll>${icon('shuffle', 18)}Surprise me</button></div>`;
    host.onclick = e => {
      const kb = e.target.closest('[data-kind]'); if (kb) { st.kind = kb.dataset.kind; draw(); return; }
      if (e.target.closest('[data-roll]')) { st[st.kind] = randAvatar(st.kind); draw(); return; }
      const t = e.target.closest('[data-k]'); if (!t) return;
      const n = ROWS[st.kind].find(r => r[1] === t.dataset.k)[2]; cur()[t.dataset.k] = (cur()[t.dataset.k] + +t.dataset.d + n) % n; draw(false);
    };
    draw();
    return { get: () => ({ ...cur() }) };
  }
  const editState = av => {
    const person = av && av.kind === 'person';
    return { kind: person ? 'person' : 'beast', beast: person ? randBeast() : { ...(av || randBeast()) }, person: person ? { ...av } : randPerson() };
  };

  /* ---------------- sign up / sign in screen ---------------- */
  function onboarding() {
    return new Promise(resolve => {
      $('#boot').hidden = true; $('#shell').hidden = true; $('#onboard').hidden = false;
      const st = editState(null); st.kind = 'beast';
      let mode = 'new';
      const body = $('#obBody');
      const finish = r => { S.uid = r.user.id; localStorage.setItem('den.uid', S.uid); $('#onboard').hidden = true; resolve(r.user); };
      const paint = () => {
        body.innerHTML = `<div class="seg" role="tablist"><button type="button" data-m="new" class="${mode === 'new' ? 'on' : ''}" role="tab">New here</button><button type="button" data-m="in" class="${mode === 'in' ? 'on' : ''}" role="tab">Sign in</button></div>` + (mode === 'new'
          ? `<h1>Pick your look</h1><p class="ob-sub">This is how everyone in the Den will see you. You can change it any time.</p>
             <div class="ob-two"><div id="obEd"></div><div class="ob-side">
             <label class="field"><span>Your name</span><input id="obName" maxlength="24" placeholder="What should we call you?" autocomplete="username"></label>
             <label class="field"><span>PIN (optional)</span><input id="obPin" type="password" maxlength="20" placeholder="4+ characters, lets you sign back in" autocomplete="new-password"></label>
             <p class="ob-note">Add a PIN to sign back in on another browser or after signing out. Without one, this browser is the only way back to your profile.</p>
             <div class="ob-actions"><button class="btn primary big" id="obGo" style="flex:1">Enter the Den</button></div></div></div></div>`
          : `<h1>Welcome back</h1><p class="ob-sub">Use the name and PIN you set when you joined.</p>
             <label class="field"><span>Your name</span><input id="obName" maxlength="24" autocomplete="username"></label>
             <label class="field"><span>PIN</span><input id="obPin" type="password" maxlength="20" autocomplete="current-password"></label>
             <div class="ob-actions"><button class="btn primary big" id="obGo" style="flex:1">Sign in</button></div>`) + `<p class="ob-err" id="obErr" role="alert"></p>`;
        $('#onboard').classList.toggle('wide', mode === 'new');
        if (mode === 'new') avatarEditor($('#obEd'), st, 150);
        $$('[data-m]', body).forEach(b => b.onclick = () => { mode = b.dataset.m; paint(); });
        const go = async () => {
          const name = $('#obName').value.trim(), pin = $('#obPin').value;
          if (!name) { $('#obErr').textContent = mode === 'new' ? 'Every Den member needs a name.' : 'Enter your name.'; $('#obName').focus(); return; }
          if (mode === 'in' && !pin) { $('#obErr').textContent = 'Enter your PIN.'; $('#obPin').focus(); return; }
          const btn = $('#obGo'); btn.disabled = true; $('#obErr').textContent = '';
          try {
            const r = mode === 'new' ? await api('/api/join', { name, beast: st[st.kind], ...(pin ? { pin } : {}) }) : await api('/api/login', { name, pin });
            finish(r);
          } catch (e) { $('#obErr').textContent = e.message; btn.disabled = false; }
        };
        $('#obGo').onclick = go; body.onkeydown = e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') go(); };
        $('#obName').focus();
      };
      paint();
    });
  }

  /* ---------------- profile panel: avatar, settings, account ---------------- */
  let pfOpen = false;
  function profilePanel(tab = 'avatar') {
    if (pfOpen) return; pfOpen = true;
    const opener = document.activeElement;
    const st = editState(S.me && S.me.beast);
    const wrap = document.createElement('div'); wrap.className = 'modal';
    wrap.innerHTML = `<div class="modal-card pf-card" role="dialog" aria-modal="true" aria-labelledby="pfTitle"><div class="pf-head"><h3 id="pfTitle">Your profile</h3><button class="btn ghost icon" data-x aria-label="Close">${icon('x', 20)}</button></div>
      <div class="seg" role="tablist">${[['avatar', 'palette', 'Avatar'], ['settings', 'settings', 'Settings'], ['account', 'key-round', 'Account']].map(([id, ic, l]) => `<button type="button" role="tab" data-tab="${id}">${icon(ic, 16)}${l}</button>`).join('')}</div>
      <div class="pf-body" id="pfBody"></div></div>`;
    document.body.appendChild(wrap);
    const body = $('#pfBody', wrap); let editor = null;
    const close = () => { pfOpen = false; wrap.remove(); document.removeEventListener('keydown', onKey); if (opener && opener.focus) opener.focus(); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(); });
    $('[data-x]', wrap).onclick = close;
    const msg = (el, t, ok) => { el.textContent = t; el.className = ok ? 'pf-ok' : 'err'; };

    const tabs = {
      avatar() {
        body.innerHTML = `<div id="pfEd"></div><label class="pf-field"><span>Name</span><input id="pfName" maxlength="24" value="${esc(S.me.name)}" autocomplete="off"></label><p class="err" id="pfErr" role="alert"></p><div class="modal-act"><button class="btn" data-x>Cancel</button><button class="btn primary" id="pfSave">Save</button></div>`;
        editor = avatarEditor($('#pfEd'), st, 130);
        $('[data-x]', body).onclick = close;
        const save = async () => {
          const name = $('#pfName').value.trim(); if (!name) return msg($('#pfErr'), 'Your name can’t be empty.');
          const b = $('#pfSave'); b.disabled = true; msg($('#pfErr'), '');
          try {
            const r = await api('/api/profile', { name, beast: editor.get() });
            S.me = r.user; S.users[r.user.id] = { ...S.users[r.user.id], ...r.user };
            const p = S.presence.find(x => x.id === r.user.id); if (p) { p.name = r.user.name; p.beast = r.user.beast; }
            renderBar(); renderRail(); route(); toast('Profile updated.', 2200); close();
          } catch (e) { msg($('#pfErr'), e.message); b.disabled = false; }
        };
        $('#pfSave').onclick = save; $('#pfName').onkeydown = e => { if (e.key === 'Enter') save(); };
      },
      settings() {
        const p = DenTheme.get();
        const sw = (k, label, hint) => `<div class="pf-row"><div><b id="l_${k}">${label}</b><small>${hint}</small></div><button type="button" class="sw-t" role="switch" aria-checked="${!!p[k]}" aria-labelledby="l_${k}" data-sw="${k}"></button></div>`;
        body.innerHTML = `<div class="pf-row" style="display:grid;gap:var(--space-2)"><div><b>Theme</b><small>Auto follows your computer’s light or dark setting.</small></div>
          <div class="seg" role="group" aria-label="Theme">${[['light', 'sun', 'Light'], ['dark', 'moon', 'Dark'], ['auto', 'monitor', 'Auto']].map(([v, ic, l]) => `<button type="button" data-theme="${v}" class="${p.theme === v ? 'on' : ''}" aria-pressed="${p.theme === v}">${icon(ic, 16)}${l}</button>`).join('')}</div></div>` +
          sw('reduceMotion', 'Reduce motion', 'Calms the fireplace, confetti and animations.') + sw('popups', 'Activity pop-ups', 'Show a pop-up when someone wins, joins or hits a streak.') +
          `<p class="ob-note" style="margin:0">These settings are saved in this browser only.</p>`;
        body.onclick = e => {
          const t = e.target.closest('[data-theme]'); if (t) { DenTheme.set({ theme: t.dataset.theme }); tabs.settings(); return; }
          const s = e.target.closest('[data-sw]'); if (s) { const k = s.dataset.sw; DenTheme.set({ [k]: !DenTheme.get()[k] }); tabs.settings(); if (k === 'reduceMotion') route(); }
        };
      },
      account() {
        const has = !!S.me.hasPin;
        body.innerHTML = `<div class="pf-row"><div><b>${esc(S.me.name)}</b><small>${has ? 'PIN is set. You can sign back in from any browser.' : 'No PIN yet. Signing out would lose this profile.'}</small></div></div>
          <form id="pinF" class="pf-field" style="gap:var(--space-3)" onsubmit="return false">
          ${has ? '<label class="pf-field"><span>Current PIN</span><input type="password" id="pfCur" maxlength="20" autocomplete="current-password"></label>' : ''}
          <label class="pf-field"><span>${has ? 'New PIN' : 'Set a PIN'}</span><input type="password" id="pfNew" maxlength="20" placeholder="4 to 20 characters" autocomplete="new-password"></label>
          <p class="err" id="pfErr" role="alert"></p>
          <div class="modal-act">${has ? '<button type="button" class="btn danger" id="pfRm">Remove PIN</button>' : ''}<button type="button" class="btn primary" id="pfPin">${has ? 'Change PIN' : 'Save PIN'}</button></div></form>
          <div class="pf-row" style="border-top:1px solid var(--border-default)"><div><b>Sign out</b><small>Return to the sign-in screen.</small></div><button class="btn" id="pfOut">${icon('log-out', 16)}Sign out</button></div><div id="pfWarn"></div>`;
        const run = async (payload, okText) => {
          const err = $('#pfErr'); msg(err, '');
          try { await api('/api/pin', payload); S.me.hasPin = !payload.remove; msg(err, okText, true); setTimeout(() => { if (pfOpen && $('#pfBody')) tabs.account(); }, 900); }
          catch (e) { msg(err, e.message); }
        };
        $('#pfPin').onclick = () => { const n = $('#pfNew').value; if (!n) return msg($('#pfErr'), 'Type a PIN first.'); run({ pin: n, ...(has ? { current: $('#pfCur').value } : {}) }, 'PIN saved.'); };
        if (has) $('#pfRm').onclick = () => run({ remove: true, current: $('#pfCur').value }, 'PIN removed.');
        $('#pfOut').onclick = () => {
          if (has) return signOut();
          $('#pfWarn').innerHTML = `<div class="pf-note"><span>You haven’t set a PIN, so you won’t be able to sign back in as ${esc(S.me.name)}. You’d need to create a new profile.</span><div class="modal-act"><button class="btn" id="pfSet">Set a PIN first</button><button class="btn danger" id="pfOut2">Sign out anyway</button></div></div>`;
          $('#pfSet').onclick = () => $('#pfNew').focus(); $('#pfOut2').onclick = signOut;
        };
      },
    };
    const show = t => { $$('.seg [data-tab]', wrap).forEach(b => { const on = b.dataset.tab === t; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); }); body.onclick = null; tabs[t](); };
    $$('.seg [data-tab]', wrap).forEach(b => b.onclick = () => show(b.dataset.tab));
    show(tab);
    const first = $('input, button.on', wrap); if (first) first.focus();
  }
  function signOut() {
    try { if (S.es) S.es.close(); } catch (e) { /* ignore */ }
    localStorage.removeItem('den.uid'); S.uid = ''; location.hash = ''; location.reload();
  }

  /* ---------------- shell ---------------- */
  /* Brand slot: drop your company logo at public/brand/logo.svg (or logo.png) and it replaces the placeholder mark. */
  const BRAND = { src: null };
  (function probe() { fetch('/api/brand').then(r => r.json()).then(j => { if (!j.src) return; BRAND.src = j.src; document.documentElement.classList.add('has-logo'); if (S.mods && S.mods.length) renderNav(); const ob = document.getElementById('obBrand'); if (ob) ob.innerHTML = `<img class="brand-logo" src="${j.src}" alt="Beast Code">`; }).catch(() => {}); })();
  function renderNav() {
    const mark = (BRAND.src ? `<img class="brand-logo" src="${BRAND.src}" alt="Beast Code">` : `<span class="bi" aria-hidden="true">${icon('flame', 20)}</span>`) + 'Beast Den';
    $('#nav').innerHTML = `<div class="nav-brand">${mark}</div>` + S.mods.filter(m => m.nav !== false).map(m =>
      `<a class="nav-item ${S.active === m.id ? 'on' : ''}" href="#/${m.id}" data-id="${m.id}" ${S.active === m.id ? 'aria-current="page"' : ''}>${icon(m.icon, 20)}<span class="nl">${esc(m.title)}</span>${m.short ? `<span class="ns">${esc(m.short)}</span>` : ''}<i class="dot" hidden title="New table open"></i></a>`).join('');
  }
  function renderBar() {
    const m = S.mods.find(x => x.id === S.active);
    $('#barTitle').textContent = m ? m.title : '';
    const lvl = S.fire;
    $('#fireMeter').innerHTML = `<span class="fm-label">${icon('flame', 16)}${fireLabel(lvl)}</span><span class="fm-bar"><i style="width:${Math.max(4, lvl)}%"></i></span>`;
    const me = S.me; $('#meChip').innerHTML = me ? `${beastSVG(me.beast, 30)}<span>${esc(me.name)}</span><b>${me.points || 0} pts</b>` : '';
  }
  const STATUSES = ['Heads down', 'Open to chat', 'At lunch', 'On a walk', 'In a meeting'];
  const roomEmoji = id => { const r = (S.boot.modules.lobby.rooms || []).find(x => x.id === id); return r ? r.emoji : ''; };
  function renderRail() {
    const online = S.presence; const mine = online.find(p => p.id === S.uid);
    const rail = $('#rail');
    const keepFocus = document.activeElement && document.activeElement.id === 'statusIn';
    if (!keepFocus) {
      rail.innerHTML = `<div class="rail-h"><h3>Who’s here</h3><span class="count">${online.length}</span></div>
      <div class="status-set"><input id="statusIn" aria-label="Your status" maxlength="40" placeholder="What’s your vibe today?" value="${esc(mine ? mine.status : '')}" autocomplete="off"><div class="chips">${STATUSES.map(s => `<button class="chip" data-st="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>
      <ul class="people">${online.map(p => `<li class="person ${p.id === S.uid ? 'me' : ''}">${beastSVG(p.beast, 38)}<div class="pi"><b>${esc(p.name)}${p.id === S.uid ? ' (you)' : ''}</b><span>${iconFor(roomEmoji(p.room), 14)} ${esc(p.status || 'Around')}</span></div>${(p.badges || []).slice(-3).map(b => `<i class="bdg">${b}</i>`).join('')}</li>`).join('') || '<li class="empty">Quiet in here. Say hi to the fire.</li>'}</ul>
      <p class="rail-foot">${Object.keys(S.users).length} beasts have joined the Den.</p>`;
    } else {
      $('.rail-h .count', rail).textContent = online.length;
    }
  }
  function show(id) {
    const m = S.mods.find(x => x.id === id) || S.mods[0];
    const prev = S.mods.find(x => x.id === S.active);
    if (prev && prev.leave) prev.leave();
    S.active = m.id; renderNav(); renderBar();
    const root = $('#view'); root.innerHTML = ''; root.className = 'view v-' + m.id; m.render(root);
    root.scrollTop = 0;
  }
  const route = () => show((location.hash.match(/^#\/(\w+)/) || [])[1]);

  /* ---------------- realtime ---------------- */
  function connect() {
    const es = S.es = new EventSource('/api/stream?uid=' + encodeURIComponent(S.uid));
    const names = ['presence', 'user', 'fire', 'chat', 'emote', 'focus', 'toast', 'coffee', 'coffee-end', 'coffee-queue', 'trivia', 'wall', 'wall-react', 'wall-delete', 'quest', 'game', 'game-fx', 'game-tables', 'arena'];
    names.forEach(n => es.addEventListener(n, e => {
      const d = JSON.parse(e.data);
      if (n === 'presence') { S.presence = d; d.forEach(u => S.users[u.id] = { ...S.users[u.id], ...u }); renderRail(); }
      else if (n === 'user') { S.users[d.id] = d; if (d.id === S.uid) { S.me = d; renderBar(); } renderRail(); }
      else if (n === 'fire') { S.fire = d.level; renderBar(); }
      else if (n === 'toast') { if (DenTheme.get().popups !== false) toast(d.text, 5000); if (d.confetti) confetti(); }
      emit(n, d);
    }));
    es.onerror = () => { $('#shell').classList.add('offline'); };
    es.onopen = () => { $('#shell').classList.remove('offline'); };
  }

  async function start() {
    try {
      if (S.uid) { try { S.boot = await api('/api/bootstrap'); } catch { S.uid = ''; } }
      if (!S.uid) { await onboarding(); S.boot = await api('/api/bootstrap'); }
      S.me = S.boot.me; S.users = S.boot.users; S.presence = S.boot.presence; S.fire = S.boot.fire;
      $('#boot').hidden = true; $('#onboard').hidden = true; $('#shell').hidden = false;
      renderRail(); connect(); renderNav(); renderBar();
      addEventListener('hashchange', route); route();
      $('#meChip').onclick = () => profilePanel();
      $('#rail').addEventListener('click', e => { const c = e.target.closest('[data-st]'); if (c) safe(() => api('/api/status', { status: c.dataset.st })); });
      $('#rail').addEventListener('keydown', e => { if (e.target.id === 'statusIn' && e.key === 'Enter') { safe(() => api('/api/status', { status: e.target.value })); e.target.blur(); } });
      $('#rail').addEventListener('focusout', e => { if (e.target.id === 'statusIn') { safe(() => api('/api/status', { status: e.target.value })); setTimeout(renderRail, 50); } });
    } catch (e) { $('#boot').innerHTML = `<p class="boot-err">Could not reach the Den. ${esc(e.message)}</p>`; console.error(e); }
  }

  const ago = ts => { const s = Math.max(1, Math.round((Date.now() - ts) / 1000)); return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + 'm ago' : s < 86400 ? Math.round(s / 3600) + 'h ago' : Math.round(s / 86400) + 'd ago'; };
  const user = id => S.users[id] || { id, name: 'A beast', beast: null };

  return { S, $, $$, esc, clamp, icon, iconFor, api, safe, on, emit, register, toast, confetti, beastSVG, personSVG, fireSVG, fireLabel, start, ago, user, roomEmoji };
})();
