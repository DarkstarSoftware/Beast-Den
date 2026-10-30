#!/usr/bin/env node
// One-time photo pack builder for "Where in the World". Run this on a machine that is allowed to reach the internet.
// It downloads freely licensed landmark photos (Wikipedia / Wikimedia Commons) into public/photos/ and writes data/geo-photos.json.
// It is safe to run again: photos you already have are kept and only missing ones are retried. The app itself never calls the internet.
//   node tools/fetch-photos.js            (all landmarks)
//   node tools/fetch-photos.js 10         (first 10, as a test)
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const WIKI = (process.env.WIKI_BASE || 'https://en.wikipedia.org').replace(/\/$/, '');
const COMMONS = (process.env.COMMONS_BASE || 'https://commons.wikimedia.org').replace(/\/$/, '');
const UA = 'BeastDenPhotoPack/1.1 (internal team game; one-time download' + (process.env.DEN_CONTACT ? '; ' + process.env.DEN_CONTACT : '') + ')';
const list = JSON.parse(fs.readFileSync(path.join(__dirname, 'landmarks.json'), 'utf8'));
const limit = +process.argv[2] || list.length;
const OUT = path.join(ROOT, 'public', 'photos'); fs.mkdirSync(OUT, { recursive: true });
const PACK = path.join(ROOT, 'data', 'geo-photos.json');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// GET with retries: Wikimedia answers 429 (slow down) now and then; wait and try again.
async function get(u, tries = 5) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': UA, 'Accept': '*/*' }, signal: AbortSignal.timeout(40000) });
      if (r.status === 429 || r.status >= 500) { last = new Error('http ' + r.status); const ra = +r.headers.get('retry-after') || 0; await sleep(Math.max(ra * 1000, 2500 * (i + 1))); continue; }
      return r;
    } catch (e) { last = e; await sleep(1500 * (i + 1)); }
  }
  throw last || new Error('failed');
}
const commonsName = src => { const m = /\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/]+)/.exec(src || ''); return m ? decodeURIComponent(m[1]) : ''; };
const isPhoto = n => /\.(jpe?g|png|webp)$/i.test(n) && !/(map|locator|location|flag|logo|coat|seal|diagram|plan|panorama_of_the_world)/i.test(n);
// Try a few standard Wikimedia thumbnail widths (they only serve certain sizes) until one is a decent size.
async function download(fname) {
  for (const w of [1280, 960, 500]) {
    const r = await get(`${COMMONS}/wiki/Special:FilePath/${encodeURIComponent(fname)}?width=${w}`);
    if (!r.ok) continue;
    const buf = Buffer.from(await r.arrayBuffer()); const head = buf.subarray(0, 4).toString('hex');
    if (!(head.startsWith('ffd8') || head === '89504e47' || buf.subarray(0, 4).toString() === 'RIFF')) continue;
    if (buf.length > 1_450_000) continue;
    return { buf, ext: head.startsWith('ffd8') ? '.jpg' : head === '89504e47' ? '.png' : '.webp' };
  }
  return null;
}
async function candidates(title) {
  const t = encodeURIComponent(title.replace(/ /g, '_')); const out = [];
  const r = await get(`${WIKI}/api/rest_v1/page/summary/${t}`);
  if (r.ok) { const j = await r.json(); for (const s of [j.originalimage && j.originalimage.source, j.thumbnail && j.thumbnail.source]) { const n = commonsName(s); if (n && isPhoto(n) && !out.includes(n)) out.push(n); } }
  // Fall back to other pictures in the article if the lead image is not usable.
  try {
    const m = await get(`${WIKI}/api/rest_v1/page/media-list/${t}`);
    if (m.ok) { const j = await m.json(); for (const it of (j.items || [])) { if (it.type !== 'image') continue; const n = commonsName((it.srcset && it.srcset[0] && 'https:' + it.srcset[0].src.replace(/^https?:/, '')) || ''); const nm = n || (it.title || '').replace(/^File:/, ''); if (nm && isPhoto(nm) && !out.includes(nm)) out.push(nm); if (out.length >= 6) break; } }
  } catch (e) { /* ignore */ }
  if (!out.length) throw new Error('no usable photo on the Wikipedia page');
  return out;
}
(async () => {
  let existing = []; try { existing = JSON.parse(fs.readFileSync(PACK, 'utf8')).photos || []; } catch (e) { /* first run */ }
  const pack = existing.filter(p => fs.existsSync(path.join(ROOT, 'public', p.img))); const have = new Set(pack.map(p => p.id));
  const credits = []; const reasons = []; let added = 0;
  for (const [title, label, lat, lon] of list.slice(0, limit)) {
    const id = 'photo-' + slug(label + '-' + title);
    if (have.has(id)) { console.log('have ', label); continue; }
    try {
      const names = await candidates(title); let got = null, fname = '';
      for (const n of names) { got = await download(n); if (got) { fname = n; break; } await sleep(600); }
      if (!got) throw new Error('could not download any of the ' + names.length + ' candidate photos');
      const file = slug(label + '-' + title) + got.ext; fs.writeFileSync(path.join(OUT, file), got.buf);
      const page = `${COMMONS}/wiki/File:${encodeURIComponent(fname)}`;
      pack.push({ id, img: '/photos/' + file, label, lat, lon, credit: 'Photo: Wikimedia Commons', source: page, hint: '' }); added++;
      console.log('ok   ', label, '-', fname);
    } catch (e) { reasons.push(`${label}: ${e.message}`); console.log('skip ', label, '-', e.message); }
    fs.writeFileSync(PACK, JSON.stringify({ _note: 'Real landmark photos for Where in the World. Built by tools/fetch-photos.js. See public/photos/CREDITS.txt.', photos: pack }, null, 1));
    await sleep(900);
  }
  for (const p of pack) credits.push(`${p.label}: ${p.source}`);
  fs.writeFileSync(path.join(OUT, 'CREDITS.txt'), 'Photos from Wikimedia Commons under their individual free licenses (Creative Commons or public domain). Each file page lists the author and license:\n\n' + credits.join('\n') + '\n');
  console.log(`\n${added} new photos, ${pack.length} total, ${reasons.length} still missing. Restart Beast Den to use them.`);
  if (reasons.length) console.log('Run the same command again to retry the missing ones.');
})();
