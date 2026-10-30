// Daily photos for "Where in the World": optional importer for Microsoft's Bing daily wallpaper feed.
// Off when running "node server.js" directly; the start scripts turn it on. Enable manually with DEN_DAILY_PHOTOS=1 on a machine that is allowed to reach the internet.
// Each day Bing publishes ~8 photos with a location in the credit line. We download the image, look up its coordinates,
// and add it to the game pool with the credit shown on reveal. Images are Microsoft/Bing content with photographer credit:
// check your own policy before using it internally.
'use strict';

module.exports = ctx => {
  const { state } = ctx;
  state.geo = state.geo || { photos: [] };
  state.geo.daily = state.geo.daily || []; state.geo.dailyTried = state.geo.dailyTried || {};
  const ON = /^(1|true|yes)$/i.test(process.env.DEN_DAILY_PHOTOS || '');
  const BING = (process.env.DEN_BING_BASE || 'https://www.bing.com').replace(/\/$/, '');
  const GEO = (process.env.DEN_GEOCODE_BASE || 'https://nominatim.openstreetmap.org').replace(/\/$/, '');
  const MAX = 60, UA = 'BeastDen/1.0 (internal team game)';
  const status = { enabled: ON, last: 0, added: 0, error: '' };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const get = (url, opt = {}) => fetch(url, { headers: { 'User-Agent': UA, ...(opt.headers || {}) }, signal: AbortSignal.timeout(20000) });

  const parse = img => {
    const m = /^(.*?)\s*\(©\s*(.*?)\)\s*$/.exec(String(img.copyright || '').trim());
    return { place: (m ? m[1] : String(img.copyright || '')).trim(), credit: m ? '© ' + m[2].trim() : '' };
  };
  async function geocode(place) {
    const r = await get(`${GEO}/search?q=${encodeURIComponent(place)}&format=json&limit=1`); if (!r.ok) return null;
    const j = await r.json(); if (!Array.isArray(j) || !j[0]) return null;
    const lat = parseFloat(j[0].lat), lon = parseFloat(j[0].lon); return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
  }
  async function download(base) {
    for (const size of ['1920x1080', '1366x768', '1280x720']) {
      const r = await get(`${BING}${base}_${size}.jpg`); if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer()); if (buf.length <= 1_400_000) return buf;
    }
    return null;
  }
  async function sync() {
    if (!ON) return status;
    try {
      const r = await get(`${BING}/HPImageArchive.aspx?format=js&idx=0&n=8&mkt=en-US`); if (!r.ok) throw new Error('Bing archive answered ' + r.status);
      const list = (await r.json()).images || []; let added = 0;
      for (const im of list) {
        const id = String(im.startdate || '') + ':' + String(im.urlbase || ''); if (!im.urlbase || state.geo.dailyTried[id]) continue;
        state.geo.dailyTried[id] = Date.now();
        const { place, credit } = parse(im); if (!place) continue;
        let pos = await geocode(place); await sleep(1100);
        if (!pos && place.includes(',')) { const parts = place.split(',').map(x => x.trim()); pos = await geocode(parts.slice(-2).join(', ')); await sleep(1100); } // e.g. "Some Park, Region, Country" -> "Region, Country"
        if (!pos) continue;
        const buf = await download(im.urlbase); if (!buf) continue;
        const img = ctx.saveImage('data:image/jpeg;base64,' + buf.toString('base64'));
        state.geo.daily.push({ id: ctx.rid(4), img, lat: pos.lat, lon: pos.lon, label: place, credit: credit || 'Bing daily photo', date: String(im.startdate || ''), ts: Date.now() }); added++;
      }
      while (state.geo.daily.length > MAX) { const old = state.geo.daily.shift(); ctx.deleteUpload(old.img); }
      for (const k of Object.keys(state.geo.dailyTried)) if (Object.keys(state.geo.dailyTried).length > 400) delete state.geo.dailyTried[k];
      status.last = Date.now(); status.added = added; status.error = ''; ctx.save();
      if (added) ctx.broadcast('toast', { text: `${added} new daily photo${added > 1 ? 's' : ''} for Where in the World.` });
    } catch (e) { status.error = String(e.message || e).slice(0, 160); console.error('daily photos:', status.error); }
    return status;
  }
  let busy = false, lastTry = 0;
  const run = async () => { if (busy || !ON) return; busy = true; try { await sync(); } finally { busy = false; lastTry = Date.now(); } };
  if (ON) { console.log('  Daily photos: ON (' + BING + ')'); setTimeout(run, 4000); }

  return {
    id: 'dailyphotos',
    routes: {
      'GET /api/geo/daily': () => ({ enabled: ON, count: state.geo.daily.length, last: status.last, error: status.error }),
      'POST /api/geo/daily/sync': () => { if (!ON) throw ctx.err(409, 'Daily photos are switched off on this server.'); if (!busy) run(); return { started: true }; },
    },
    tick: () => { if (ON && !busy && Date.now() - lastTry > 6 * 3600 * 1000) run(); },
  };
};
