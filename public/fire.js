/* Den fireplace: a cozy canvas fire (brick, grate, logs, flames, embers). Offline, no assets. */
(() => {
  const TAU = Math.PI * 2;
  const rnd = (a, b) => a + Math.random() * (b - a);
  // pre-rendered soft blobs, one per heat stage (white-yellow core -> orange -> deep red)
  const STAGES = ['255,226,140', '255,190,80', '255,140,36', '232,92,18', '184,50,12', '110,26,8'];
  const sprites = STAGES.map(c => { const s = document.createElement('canvas'); s.width = s.height = 64; const x = s.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, `rgba(${c},.8)`); g.addColorStop(.5, `rgba(${c},.35)`); g.addColorStop(1, `rgba(${c},0)`); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return s; });
  let stop = null;

  function brickLayer(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    x.fillStyle = '#120a07'; x.fillRect(0, 0, w, h);
    const bh = Math.max(22, h / 8), bw = bh * 2.3; let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let row = 0, y = 0; y < h; row++, y += bh) for (let bx = -(row % 2) * bw / 2; bx < w; bx += bw) {
      const l = 14 + r() * 10; x.fillStyle = `hsl(${12 + r() * 10} 38% ${l}%)`; x.fillRect(bx + 2, y + 2, bw - 4, bh - 4);
      x.fillStyle = 'rgba(0,0,0,.28)'; x.fillRect(bx + 2, y + bh - 6, bw - 4, 4);
    }
    return c;
  }

  function mount(canvas, getLevel) {
    if (stop) stop();
    const ctx = canvas.getContext('2d'); let W = 0, H = 0, dpr = 1, bg = null, raf = 0, last = 0, dead = false;
    const P = [], E = []; const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches || (window.DenTheme && DenTheme.reduced());
    function size() {
      dpr = Math.min(2, devicePixelRatio || 1); W = canvas.clientWidth || 600; H = canvas.clientHeight || 220;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); bg = brickLayer(Math.round(W * dpr), Math.round(H * dpr));
    }
    size(); const ro = new ResizeObserver(() => { if (canvas.clientWidth !== W || canvas.clientHeight !== H) size(); }); ro.observe(canvas);
    const flameCx = () => W * (W > 520 ? .72 : .5);
    function step(dt, lv) {
      const heat = .25 + lv / 100 * .75, rate = 90 + 220 * heat, span = Math.min(W * .2, 90) * (.7 + heat * .4);
      for (let n = rate * dt + Math.random(); n > 1; n--) P.push({ x: flameCx() + rnd(-span, span) * .5, y: H * .74 + rnd(-6, 6), vx: rnd(-8, 8), vy: -rnd(70, 150) * (.6 + heat * .6), life: 0, max: rnd(.7, 1.5), s: rnd(9, 20) * (.7 + heat * .5), ph: rnd(0, TAU) });
      if (Math.random() < dt * (3 + 10 * heat)) E.push({ x: flameCx() + rnd(-span, span) * .6, y: H * .7, vx: rnd(-14, 14), vy: -rnd(35, 90), life: 0, max: rnd(1.4, 3), ph: rnd(0, TAU) });
      for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; p.life += dt; if (p.life > p.max) { P.splice(i, 1); continue; } p.x += (p.vx + Math.sin(p.life * 7 + p.ph) * 14) * dt; p.y += p.vy * dt; p.vy *= (1 - .25 * dt); }
      for (let i = E.length - 1; i >= 0; i--) { const e = E[i]; e.life += dt; if (e.life > e.max || e.y < -4) { E.splice(i, 1); continue; } e.x += (e.vx + Math.sin(e.life * 4 + e.ph) * 18) * dt; e.y += e.vy * dt; }
      if (P.length > 700) P.splice(0, P.length - 700);
    }
    function logRect(x, y, w, h, rot, tone) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2); g.addColorStop(0, `hsl(22 30% ${tone + 10}%)`); g.addColorStop(.5, `hsl(18 28% ${tone}%)`); g.addColorStop(1, '#0d0705');
      ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, h * .45); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1; for (let i = 0; i < 7; i++) { const yy = -h / 2 + (i + .7) * h / 7.5; ctx.beginPath(); ctx.moveTo(-w * .46, yy); ctx.lineTo(w * .46, yy + Math.sin(i * 3) * 2); ctx.stroke(); }
      ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,120,30,.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, h * .45); ctx.stroke(); ctx.restore();
    }
    function frame(t) {
      if (dead) return; if (!canvas.isConnected) { stop && stop(); return; }
      const dt = Math.min(.05, (t - last) / 1000 || .016); last = t; const lv = Math.max(0, Math.min(100, +getLevel() || 0)), heat = .25 + lv / 100 * .75;
      step(dt, lv);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.clearRect(0, 0, W, H); ctx.drawImage(bg, 0, 0, W, H);
      const fl = .85 + Math.sin(t / 110) * .06 + Math.sin(t / 47) * .04, cx = flameCx();
      // wall glow
      ctx.globalCompositeOperation = 'lighter'; let g = ctx.createRadialGradient(cx, H * .75, 8, cx, H * .75, Math.max(W, H) * .7 * heat + 60);
      g.addColorStop(0, `rgba(255,140,40,${.5 * fl * heat})`); g.addColorStop(.5, `rgba(200,70,20,${.22 * heat})`); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
      // firebox shadow and hearth
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, H * .88, W, H * .12);
      // back log + coals
      logRect(cx - 4, H * .78, Math.min(W * .34, 190), 24, -.03, 18);
      ctx.globalCompositeOperation = 'lighter'; g = ctx.createLinearGradient(0, H * .78, 0, H * .92); g.addColorStop(0, `rgba(255,110,30,${.55 * heat})`); g.addColorStop(1, 'rgba(120,20,5,.1)'); ctx.fillStyle = g; ctx.fillRect(cx - Math.min(W * .22, 140), H * .8, Math.min(W * .44, 280), H * .1); ctx.globalCompositeOperation = 'source-over';
      // flames
      ctx.globalCompositeOperation = 'lighter';
      for (const p of P) { const k = p.life / p.max, si = Math.min(STAGES.length - 1, 1 + Math.floor(k * (STAGES.length - 1))); const s = p.s * (1 - k * .65) * (fl > 0 ? 1 : 1); ctx.globalAlpha = Math.min(1, (1 - k) * 1.2) * (.2 + heat * .26); ctx.drawImage(sprites[si], p.x - s * .8, p.y - s * 2, s * 1.6, s * 4); }
      ctx.globalAlpha = 1;
      for (const e of E) { const k = e.life / e.max; ctx.fillStyle = `rgba(255,${170 - k * 90 | 0},60,${(1 - k) * (.6 + .4 * Math.sin(t / 60 + e.ph))})`; ctx.beginPath(); ctx.arc(e.x, e.y, 1.4, 0, TAU); ctx.fill(); }
      ctx.globalCompositeOperation = 'source-over';
      // front logs + grate
      logRect(cx - 52, H * .86, Math.min(W * .3, 170), 22, .05, 22); logRect(cx + 46, H * .87, Math.min(W * .26, 150), 20, -.06, 20);
      ctx.fillStyle = '#0a0605'; ctx.fillRect(cx - Math.min(W * .27, 170), H * .93, Math.min(W * .54, 340), 5);
      for (let bx = cx - Math.min(W * .27, 170) + 8; bx < cx + Math.min(W * .27, 170); bx += 22) ctx.fillRect(bx, H * .93, 5, H * .07);
      ctx.globalCompositeOperation = 'lighter'; g = ctx.createRadialGradient(cx, H * .9, 4, cx, H * .9, 90); g.addColorStop(0, `rgba(255,120,30,${.28 * heat * fl})`); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(cx - 100, H * .8, 200, H * .2); ctx.globalCompositeOperation = 'source-over';
      if (!reduce) raf = requestAnimationFrame(frame);
    }
    if (reduce) { for (let i = 0; i < 40; i++) step(.03, +getLevel() || 0); frame(performance.now()); }
    else raf = requestAnimationFrame(frame);
    stop = () => { dead = true; cancelAnimationFrame(raf); ro.disconnect(); stop = null; };
  }
  window.DenFire = { mount };
})();
