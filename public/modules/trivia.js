'use strict';
/* Daily trivia: five questions, same for everyone, speed bonus, streaks. */
(() => {
  const { $, esc, api, safe, register, beastSVG, user, S, on, icon } = Den;
  let mode = 'daily', E = null, er = null, run = 0, eStart = 0, root = null, v = null, qStart = 0, barTimer = null, tab = 'today', picked = null, result = null;

  const lbRows = rows => rows.length ? rows.map((r, i) => `<li><span class="rk">${i + 1}</span>${beastSVG(r.beast, 34)}<b>${esc(r.name)}</b><em>${r.score != null ? r.score : r.points != null && tab === 'all' ? r.points : r.streak}</em></li>`).join('') : '<li class="empty">Nobody yet. You could be first.</li>';
  function board() {
    const b = v.board; const rows = tab === 'today' ? b.today : tab === 'all' ? b.allTime : b.streaks;
    const unit = tab === 'streaks' ? 'days' : 'pts';
    return `<div class="lb"><div class="tabs">${[['today', 'Today'], ['all', 'All time'], ['streaks', 'Streaks']].map(([k, t]) => `<button class="tab ${tab === k ? 'on' : ''}" data-tab="${k}" aria-pressed="${tab === k}">${t}</button>`).join('')}</div><ol class="lb-list" data-unit="${unit}">${lbRows(rows)}</ol></div>`;
  }
  const modeTabs = () => `<div class="tabs t-mode" role="tablist">${[['daily', 'Daily 20'], ['endless', 'Endless']].map(([k, t]) => `<button class="tab ${mode === k ? 'on' : ''}" role="tab" aria-selected="${mode === k}" data-mode="${k}">${t}</button>`).join('')}</div>`;
  function drawEndless() {
    if (!root) return; clearInterval(barTimer);
    if (!E) { root.innerHTML = `<div class="trivia"><div class="t-main">${modeTabs()}<div class="loading">Shuffling the deck…</div></div></div>`; return; }
    const q = E.question, d = E.day;
    const card = `<div class="t-card"><div class="t-endmeta"><span class="pc">${icon('zap', 14)}Run: ${run}</span><span class="muted small">${d.right} of ${d.total} right today</span></div><div class="t-timer"><i id="tBar"></i></div><h3>${esc(q.q)}</h3>
      <div class="t-opts">${q.options.map((o, i) => `<button class="opt ${er ? (i === er.answer ? 'right' : i === er.picked ? 'wrong' : 'dim') : ''}" data-i="${i}" ${er ? 'disabled' : ''}><kbd>${'ABCD'[i]}</kbd>${esc(o)}</button>`).join('')}</div>
      ${er ? `<div class="t-result ${er.correct ? 'ok' : 'no'}"><b>${icon(er.correct ? 'circle-check' : 'circle-x', 18)} ${er.correct ? (er.gain ? `Correct. +${er.gain} points` : 'Correct.') : 'Not this time.'}</b>${er.note ? `<p>${esc(er.note)}</p>` : ''}${er.capped ? `<p>You have hit today’s practice cap of ${d.cap} points. Keep playing just for fun.</p>` : ''}<button class="btn primary" id="eNext">Next question</button></div>` : ''}</div>`;
    root.innerHTML = `<div class="trivia"><div class="t-main">${modeTabs()}<div class="t-head"><h2>Endless trivia</h2><p>Always on. ${E.pool} questions, no repeats for a long while. Practice points are capped at ${d.cap} a day, so the Daily 20 stays the main event.</p></div>${card}</div><div class="t-side">${v ? board() : ''}<div class="lb"><div class="t-endmeta"><b>Practice today</b></div><p class="muted small">${d.pts} of ${d.cap} points · ${d.right} right out of ${d.total}</p></div></div></div>`;
    if (!er) { eStart = Date.now(); const bar = () => { const el = $('#tBar', root); if (el) el.style.width = Math.max(0, 100 - (Date.now() - eStart) / 60) + '%'; }; barTimer = setInterval(bar, 100); }
  }
  async function loadEndless() { E = await api('/api/trivia/endless'); er = null; drawEndless(); }
  async function endlessPick(i) {
    clearInterval(barTimer);
    await safe(async () => {
      const r = await api('/api/trivia/endless/answer', { choice: i });
      er = { picked: i, correct: r.correct, answer: r.answer, note: r.note, gain: r.gain, capped: r.capped }; run = r.correct ? run + 1 : 0; E.day = r.day; drawEndless();
      if (r.correct && run > 0 && run % 5 === 0) Den.toast(`${run} in a row. Nice.`);
      const nb = $('#eNext', root); if (nb) nb.focus();
    });
  }
  function draw() {
    if (mode === 'endless') return drawEndless();
    if (!root) return; clearInterval(barTimer);
    const q = v.question; const answered = v.answers.length;
    let main;
    if (v.done) {
      const right = v.answers.filter(a => a.correct).length;
      main = `<div class="t-card done"><div class="t-big">${right} of ${v.total}</div><p>${right === v.total ? 'A perfect round.' : right >= v.total * 0.6 ? 'Solid. The Den approves.' : 'Tomorrow is a fresh set.'}</p><div class="t-stats"><span><b>${v.score}</b> points today</span><span><b>${(S.me.streak) || 1}</b> day streak</span></div><p class="muted">New questions every day. Come back tomorrow to keep your streak.</p></div>`;
    } else if (q) {
      main = `<div class="t-card"><div class="t-dots">${Array.from({ length: v.total }, (_, i) => `<i class="${i < answered ? (v.answers[i].correct ? 'ok' : 'no') : i === answered ? 'cur' : ''}"></i>`).join('')}</div>
        <div class="t-timer"><i id="tBar"></i></div><h3>${esc(q.q)}</h3>
        <div class="t-opts">${q.options.map((o, i) => `<button class="opt ${result ? (i === result.answer ? 'right' : i === picked ? 'wrong' : 'dim') : ''}" data-i="${i}" ${result ? 'disabled' : ''}><kbd>${'ABCD'[i]}</kbd>${esc(o)}</button>`).join('')}</div>
        ${result ? `<div class="t-result ${result.correct ? 'ok' : 'no'}"><b>${icon(result.correct ? 'circle-check' : 'circle-x', 18)} ${result.correct ? `Correct. +${result.gain} points${result.bonus ? ` (${result.bonus} speed bonus)` : ''}` : 'Not this time.'}</b>${result.note ? `<p>${esc(result.note)}</p>` : ''}<button class="btn primary" id="tNext">${v.done ? 'See results' : 'Next question'}</button></div>` : ''}</div>`;
      if (!result) { qStart = Date.now(); const bar = () => { const el = $('#tBar', root); if (el) el.style.width = Math.max(0, 100 - (Date.now() - qStart) / 150) + '%'; }; barTimer = setInterval(bar, 100); }
    } else main = '<div class="t-card"><p>No questions today.</p></div>';
    root.innerHTML = `<div class="trivia"><div class="t-main">${modeTabs()}<div class="t-head"><h2>Daily ${v.total}</h2><p>${v.done ? 'You are done for today.' : `Same ${v.total} questions for everyone, answer at your own pace. Faster correct answers earn bonus points.`}</p></div>${main}</div><div class="t-side">${board()}</div></div>`;
  }
  async function load() { v = await api('/api/trivia'); picked = null; result = null; draw(); }

  register({
    id: 'trivia', title: 'Trivia', icon: 'brain', order: 20,
    render(el) {
      root = el; root.innerHTML = '<div class="loading">Shuffling the deck…</div>'; tab = 'today'; mode = 'daily'; E = null; er = null; run = 0; safe(load);
      el.onclick = e => {
        const opt = e.target.closest('.opt'); const tb = e.target.closest('[data-tab]'); const md = e.target.closest('[data-mode]');
        if (md) { mode = md.dataset.mode; if (mode === 'endless') { if (!E || er) { E = null; drawEndless(); safe(loadEndless); } else drawEndless(); } else draw(); }
        else if (mode === 'endless') { if (opt && !er) endlessPick(+opt.dataset.i); else if (e.target.id === 'eNext') safe(loadEndless); else if (tb) { tab = tb.dataset.tab; drawEndless(); } }
        else if (tb) { tab = tb.dataset.tab; draw(); }
        else if (opt && !result) pick(+opt.dataset.i);
        else if (e.target.id === 'tNext') { if (v.done) { picked = null; result = null; draw(); } else { picked = null; result = null; draw(); } }
      };
      el.onkeydown = null;
    },
    leave() { root = null; clearInterval(barTimer); },
  });
  async function pick(i) {
    picked = i; clearInterval(barTimer);
    await safe(async () => {
      const r = await api('/api/trivia/answer', { index: v.question.index, choice: i });
      result = { correct: r.correct, answer: r.answer, note: r.note, gain: r.gain, bonus: r.bonus };
      const nextView = r.view; const finishing = nextView.done;
      // keep the current question on screen to show feedback, then advance on "Next"
      const keep = v.question; v = { ...nextView, question: keep, done: false, answers: nextView.answers, _next: nextView };
      v.done = false; draw();
      const nb = document.getElementById('tNext'); if (nb) { nb.onclick = () => { v = v._next; picked = null; result = null; if (finishing) Den.confetti(); draw(); }; }
    });
  }
  on('trivia', () => { if (root && v) api('/api/trivia').then(x => { v.board = x.board; if (!result) draw(); else { const s = document.querySelector('.t-side'); if (s) s.innerHTML = board(); } }).catch(() => {}); });
  addEventListener('keydown', e => { if (root && mode === 'endless' && E && !er && /^[a-dA-D]$/.test(e.key) && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) return endlessPick('abcd'.indexOf(e.key.toLowerCase())); if (root && mode === 'daily' && v && v.question && !result && /^[a-dA-D]$/.test(e.key) && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) pick('abcd'.indexOf(e.key.toLowerCase())); });
})();
