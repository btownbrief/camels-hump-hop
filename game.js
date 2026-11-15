/* Camel's Hump Hop — game shell: layout, input, hazards, juice, HUD, UI, saves, test hooks. */
(function () {
  'use strict';
  const { C, W, PXM, Sim, botSteer, zoneAt, ZONES } = window.World;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const TAU = Math.PI * 2;
  const $ = (id) => document.getElementById(id);
  const stage = $('stage'), cv = $('cv'), ctx = cv.getContext('2d');
  const UI = '700 "Barlow Semi Condensed", sans-serif';

  // ---------- saves ----------
  const SAVE_KEY = 'chh.save.v1';
  const save = { bestH: 0, bestChain: 0, bestScore: 0, tilt: false, plays: 0, summits: 0 };     // bestChain = best Clean Climb streak (old chain values carry over)
  try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) { /* ignore */ }
  const SUMMIT_M = 1244;            // the real Camel's Hump is 4,083 ft = 1,244 m
  // unlockable hats: the progression layer (cosmetic only, never changes the rules). A hat you've unlocked stays unlocked.
  const seen = (v, id) => Array.isArray(v.hatsSeen) && v.hatsSeen.includes(id);
  const HATS = [
    { id: 'red', name: 'Red Bobble', c: '#d9382f', b: '#f7efe0', p: '#ffffff', need: 'Starter hat', ok: () => true },
    { id: 'maple', name: 'Maple', c: '#e2701f', b: '#ffd27a', p: '#ffe9b0', need: 'Reach 600 m', ok: (v) => v.bestH >= 600 },
    { id: 'spruce', name: 'Spruce', c: '#2f7a52', b: '#e8f3ea', p: '#bfe8c8', need: 'Clean Climb streak of 15', ok: (v) => v.bestChain >= 15 || seen(v, 'spruce') },
    { id: 'summit', name: 'Summit Gold', c: '#f2b52c', b: '#7a3c0c', p: '#fff6c8', star: true, need: 'Summit 3 times (1,244 m)', ok: (v) => v.summits >= 3 },
    { id: 'regular', name: 'Trail Regular', c: '#2f78d0', b: '#f7efe0', p: '#ffd6f0', need: 'Daily Hike 3 days in a row', ok: (v) => (v.dStreakMax || 0) >= 3 },
    { id: 'owl', name: 'Night Owl', c: '#2a2f6c', b: '#ffe066', p: '#ffe066', star: true, need: 'Reach the Aurora (2,200 m)', ok: (v) => v.bestH >= 2200 },
    { id: 'legend', name: 'Legend', c: '#ff5fc8', b: '#ffffff', p: '#ffe066', star: true, need: 'Clean Climb streak of 30', ok: (v) => v.bestChain >= 30 || seen(v, 'legend') },
  ];
  if (!save.hat) save.hat = 'red'; if (!Array.isArray(save.hatsSeen)) save.hatsSeen = HATS.filter(h => h.ok(save)).map(h => h.id);
  const hatById = (id) => HATS.find(h => h.id === id) || HATS[0];
  const unlocked = () => HATS.filter(h => h.ok(save));
  const applyHat = () => { if (!hatById(save.hat).ok(save)) save.hat = 'red'; Art.hat = hatById(save.hat); };
  const dayKey = (d) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  const today = () => dayKey(new Date()), yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return dayKey(d); };
  const dailySeed = (k) => (Math.imul(k, 2654435761) ^ 0x5eed) >>> 0;
  const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const dayLabel = (k) => MON[((k / 100) | 0) % 100 - 1] + ' ' + (k % 100);
  const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } };

  // ---------- state ----------
  let H = 780, cssScale = 1, dpr = 1, insetTopW = 0, insetBotW = 0, lastLayout = { w: 0, h: 0 }, scaleK = 1;
  const S = {
    mode: 'title', paused: false, t: 0, sim: new Sim(7, 780),
    parts: [], pops: [], rings: [], haz: [], hazCd: { crow: 6, gust: 10 }, hazGap: 0,
    wind: { ax: 0, dir: 0, streaks: [] },
    shake: 0, freeze: 0, sqT: 9, hitFlash: 0, dizzy: 0, blinkT: 2,
    msg: null, zoneShown: 0, bestAtStart: 0, flagAt: 0, nbShown: false, steerAcc: 0, runT: 0,
    tum: null, camOverride: null, dazed: false, headless: false, daily: false, hr: Math.random, summited: false,
    noAutoPause: false, over: null, fakeSteer: null, botOn: false, mark: 0, hPop: 0, overlapMax: 0, sumT: 0, fallBank: 0, fallStreak: 0,
  };
  let sim = S.sim;

  // ---------- layout: sized once per orientation / real size change ----------
  function layout(force) {
    const vw = window.innerWidth, vh = window.innerHeight;
    if (!force && Math.abs(vw - lastLayout.w) < 2 && Math.abs(vh - lastLayout.h) / lastLayout.h < 0.2 && (vw > vh) === (lastLayout.w > lastLayout.h)) return;
    const rotated = lastLayout.w && ((vw > vh) !== (lastLayout.w > lastLayout.h));
    lastLayout = { w: vw, h: vh };
    const newH = clamp(W * vh / vw, 560, 860);
    const cw = Math.min(vw, vh * W / newH), ch = cw * newH / W;
    cssScale = cw / W;
    stage.style.width = W + 'px'; stage.style.height = newH + 'px'; stage.classList.toggle('short', newH < 700);
    stage.style.transform = `translate(${Math.round((vw - cw) / 2)}px, ${Math.round((vh - ch) / 2)}px) scale(${cssScale})`;
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:0;top:0;width:1px;visibility:hidden;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)';
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe), it = parseFloat(cs.paddingTop) || 0, ib = parseFloat(cs.paddingBottom) || 0;
    document.body.removeChild(probe);
    const touch = Math.abs(vh - ch) < 2;
    insetTopW = touch ? it / cssScale : 0; insetBotW = touch ? ib / cssScale : 0;
    document.documentElement.style.setProperty('--inset-top', insetTopW + 'px');
    document.documentElement.style.setProperty('--inset-bot', insetBotW + 'px');
    H = newH; sim.H = H;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    scaleK = cv.width / W;
    if (rotated && S.mode === 'play' && !S.paused) pauseGame();
  }

  // ---------- audio wrappers ----------
  const sfx = (name, a, b) => { if (S.headless || S.mode === 'title') return; if (window.Snd && Snd[name]) Snd[name](a, b); };
  const buzz = (ms) => { if (!S.headless && S.mode === 'play') Snd.buzz(ms); };

  // ---------- input ----------
  const ptrs = new Map(); const keys = { l: 0, r: 0, last: 0 };
  function stageSide(e) { const r = stage.getBoundingClientRect(); return e.clientX < r.left + r.width / 2 ? -1 : 1; }
  $('title').addEventListener('click', (e) => { if (S.mode === 'title' && !e.target.closest('button')) startRun(); });
  const skipTumble = () => { if (S.mode === 'tumble' && S.tum && S.tum.t > 0.3 && S.tum.t < S.tum.D) { S.tum.t = S.tum.D; return true; } return false; };
  window.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    if (skipTumble()) return;                                                    // tap skips the tumble
    if (S.mode !== 'play' || S.paused) return;
    e.preventDefault(); Snd.unlock();
    ptrs.set(e.pointerId, { side: stageSide(e), t: performance.now() });
    try { stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });
  window.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId) && S.mode === 'play' && !S.paused && (e.pointerType === 'touch' || (e.buttons & 1)) && !((document.elementFromPoint(e.clientX, e.clientY) || document.body).closest('button'))) ptrs.set(e.pointerId, { side: stageSide(e), t: performance.now() });   // a finger still down after RESUME counts again
    const p = ptrs.get(e.pointerId); if (p) { const s = stageSide(e); if (s !== p.side) { p.side = s; p.t = performance.now(); } } });
  const lift = (e) => { ptrs.delete(e.pointerId); };
  window.addEventListener('pointerup', lift); window.addEventListener('pointercancel', lift); stage.addEventListener('lostpointercapture', lift);
  window.addEventListener('blur', () => { ptrs.clear(); keys.l = keys.r = 0; if (S.mode === 'play' && !S.noAutoPause) pauseGame(); });
  for (const ev of ['gesturestart', 'dblclick', 'contextmenu']) document.addEventListener(ev, (e) => e.preventDefault());
  document.addEventListener('touchmove', (e) => { if (e.cancelable && !e.target.closest('.scroll')) e.preventDefault(); }, { passive: false });
  window.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') { keys.l = 1; keys.last = -1; e.preventDefault(); }
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') { keys.r = 1; keys.last = 1; e.preventDefault(); }
    else if (k === ' ' || k === 'Enter') { e.preventDefault(); if (S.mode === 'title') startRun(); else if (S.mode === 'over') startRun(); else if (skipTumble()) { /* skipped */ } else if (S.paused) resumeGame(); }
    else if (k === 'p' || k === 'P' || k === 'Escape') { if (S.mode === 'play') (S.paused ? resumeGame : pauseGame)(); }
    else if (k === 'm' || k === 'M') { Snd.setSfx(!Snd.sfxOn); Snd.setMusic(Snd.sfxOn); refreshSnd(); }
    if (S.mode === 'play') Snd.unlock();
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') keys.l = 0; else if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.r = 0;
  });
  function steer() {
    if (S.fakeSteer != null) return S.fakeSteer;
    if (ptrs.size) { let best = null; ptrs.forEach(p => { if (!best || p.t > best.t) best = p; }); return best.side; }
    if (keys.l || keys.r) return keys.l && keys.r ? keys.last : (keys.r - keys.l);
    if (Tilt.on) return Tilt.steer;
    return 0;
  }

  // ---------- tilt steering (optional; permission requested only when turned on) ----------
  const Tilt = {
    on: false, steer: 0, base: null, gotEvent: false,
    handler(e) {
      const ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
      let v = e.gamma; const a = ((ang % 360) + 360) % 360;
      if (a === 90) v = e.beta; else if (a === 270) v = -e.beta; else if (a === 180) v = -e.gamma;
      if (v == null) return;
      Tilt.gotEvent = true;                                   // only a real reading counts as a sensor
      if (Tilt.base == null) Tilt.base = v;
      const d = v - Tilt.base;
      Tilt.steer = Math.abs(d) < 1.5 ? 0 : clamp(d / 16, -1, 1);
    },
    async enable() {
      if (typeof DeviceOrientationEvent === 'undefined') return Tilt.fail('No tilt sensor here — using touch.');
      try {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
          const r = await DeviceOrientationEvent.requestPermission();
          if (r !== 'granted') return Tilt.fail('Tilt permission was declined — using touch.');
        }
      } catch (err) { return Tilt.fail('Tilt permission was declined — using touch.'); }
      Tilt.gotEvent = false; Tilt.base = null;
      window.addEventListener('deviceorientation', Tilt.handler);
      Tilt.on = true; save.tilt = true; persist(); refreshTilt();
      setTimeout(() => { if (Tilt.on && !Tilt.gotEvent) Tilt.fail('No tilt sensor found — using touch.'); }, 1800);
      toast('Tilt on — lean to steer. Touch still works.');
    },
    disable() { window.removeEventListener('deviceorientation', Tilt.handler); Tilt.on = false; Tilt.steer = 0; save.tilt = false; persist(); refreshTilt(); },
    fail(msg) { Tilt.disable(); toast(msg); },
    recalibrate() { Tilt.base = null; },
  };
  function refreshTilt() { for (const id of ['tTilt', 'pTilt']) { const b = $(id); b.textContent = 'TILT: ' + (Tilt.on ? 'ON' : 'OFF'); b.classList.toggle('on', Tilt.on); } }
  function toggleTilt() { Snd.unlock(); if (Tilt.on) { Tilt.disable(); toast('Tilt off — hold left or right half to steer.'); } else Tilt.enable(); }

  // ---------- small UI helpers ----------
  function toast(msg) { const t = $('toast'); t.firstElementChild.textContent = msg; t.classList.remove('go'); void t.offsetWidth; t.classList.add('go'); }
  function show(id, on) { $(id).classList.toggle('show', !!on); }
  function refreshSnd() {
    for (const id of ['tSfx', 'pSfx']) $(id).classList.toggle('off', !Snd.sfxOn);
    $('btnSound').classList.toggle('off', !Snd.sfxOn && !Snd.musicOn);
    for (const id of ['tMusic', 'pMusic']) $(id).classList.toggle('off', !Snd.musicOn);
  }
  function titleDaily() {
    const k = today(), played = save.dLast === k, st = save.dLast === k || save.dLast === yesterday() ? (save.dStreak || 0) : 0;
    $('dailySub').textContent = (played ? `today ${save.dBest || 0} m` : 'same mountain for everyone today') + (st ? ` · streak ${st}` : '');
    const un = unlocked().length; const hh = hatById(save.hat); $('tHat').innerHTML = `<i class="sw" style="background:${hh.c};border-color:${hh.b}"></i>HAT ${un}/${HATS.length}`;
  }
  function titleBest() {
    titleDaily();
    $('titleBest').innerHTML = save.bestH > 0 ? `BEST <b>${fmt(save.bestH)} m</b> &nbsp;·&nbsp; STREAK <b>${save.bestChain}</b>` + (save.summits ? ` &nbsp;·&nbsp; SUMMITS <b>${save.summits}</b>` : ` &nbsp;·&nbsp; SUMMIT <b>${fmt(SUMMIT_M)} m</b>`) : 'Hold left or right to steer · summit at <b>1,244 m</b>';
  }
  const fmt = (n) => Math.floor(n).toLocaleString('en-US');

  // ---------- run control ----------
  function newSeed() { return (Math.random() * 1e9) | 0; }
  function resetRunState() {
    S.parts.length = 0; S.pops.length = 0; S.rings.length = 0; S.haz.length = 0;
    S.hazCd = { crow: 5, gust: 8 }; S.hazGap = 2;
    S.wind.ax = 0; S.wind.dir = 0; S.wind.streaks.length = 0;
    S.shake = 0; S.freeze = 0; S.sqT = 9; S.hitFlash = 0; S.dizzy = 0;
    S.msg = null; S.zoneShown = 0; S.nbShown = false; S.steerAcc = 0; S.runT = 0; S.overlapMax = 0;
    S.tum = null; S.camOverride = null; S.dazed = false; S.over = null; S.summited = false; S.mark = 0; S.hPop = 0; S.sumT = 0; S.fallBank = 0; S.fallStreak = 0;
    ptrs.clear();
  }
  function startRun(seed, daily) {
    Snd.unlock(); Snd.click();
    if (daily != null) S.daily = !!daily;
    if (S.daily) {
      const k = today(); S.dayK = k; seed = dailySeed(k);
      if (save.dLast !== k) { save.dStreak = save.dLast === yesterday() ? (save.dStreak || 0) + 1 : 1; save.dLast = k; save.dBest = 0; }
      save.dStreakMax = Math.max(save.dStreakMax || 0, save.dStreak);
    }
    S.hr = S.daily ? World.mulberry32(seed ^ 0x51ab) : Math.random;          // daily: same hazards for everyone today
    S.sim = sim = new Sim(seed == null ? newSeed() : seed, H);
    resetRunState();
    S.mode = 'play'; S.paused = false;
    S.bestAtStart = save.bestH; S.flagAt = S.daily ? (save.dBest || 0) : save.bestH; save.plays++; persist();
    sim.H = H; Tilt.recalibrate();
    show('title', false); show('over', false); show('pause', false);
    $('hudbtns').style.display = 'flex';
    Snd.zoneIdx = 0;
  }
  function toTitle() {
    S.mode = 'title'; S.paused = false; S.daily = false; Snd.zoneIdx = 0;
    S.sim = sim = new Sim(newSeed(), H); resetRunState();
    show('pause', false); show('over', false); show('title', true); $('hudbtns').style.display = 'none';
    titleBest();
  }
  function pauseGame() { if (S.mode !== 'play' || S.paused) return; S.paused = true; ptrs.clear(); show('pause', true); Snd.suspend(); }
  function resumeGame() { if (!S.paused) return; S.paused = false; show('pause', false); Snd.resume(); Snd.click(); }
  const ZSHORT = ['Lot', 'Hardwood', 'Birches', 'Spruce-Fir', 'Treeline', 'Bare Rock', 'Clouds', 'Night Sky', 'Aurora'];
  function trailBar(h, prevBest, nb) {         // game over: the whole climb as a tall trail. Zone names on the left; summit, best flag and this run on the right
    const el = $('ovTrail'), BASE = 16, span = Math.max(60, el.clientHeight - BASE - 12);
    const top = Math.max(SUMMIT_M, h, prevBest) * 1.08, py = (m) => BASE + clamp(m / top, 0, 1) * span;
    let html = `<i class="tb-line" style="bottom:${BASE}px;height:${span}px"></i><i class="tb-fill" style="bottom:${BASE}px;height:${(py(h) - BASE).toFixed(1)}px;background:${Art.hat.c}"></i>`;
    html += `<b class="tb-zl tb-lot" style="bottom:0">TRAILHEAD</b>`;
    let lastY = BASE - 2;
    for (let z = 1; z < ZONES.length; z++) {
      const y = py(ZONES[z].at); if (ZONES[z].at >= top) break;
      html += `<i class="tb-z${h >= ZONES[z].at ? ' on' : ''}" style="bottom:${y.toFixed(1)}px"></i>`;
      if (y - lastY >= 14) { html += `<b class="tb-zl${h >= ZONES[z].at ? ' on' : ''}" style="bottom:${y.toFixed(1)}px">${ZSHORT[z]}</b>`; lastY = y; }
    }
    // right-hand markers: true positions for the marks, labels nudged apart so they never overlap
    const marks = [{ m: SUMMIT_M, cls: 'sum', txt: S.summited ? 'SUMMIT ✓' : 'SUMMIT' }];
    if (prevBest > 0) marks.push({ m: prevBest, cls: 'best', txt: (S.daily ? 'TODAY ' : nb ? 'OLD BEST ' : 'BEST ') + fmt(prevBest) });
    marks.push({ m: h, cls: 'run', txt: 'YOU ' + fmt(h) + ' m' });
    marks.forEach(k => { k.y = py(k.m); k.ly = k.y; });
    const byY = marks.slice().sort((a, b) => a.y - b.y || (a.cls === 'run' ? 1 : -1));
    for (let i = 1; i < byY.length; i++) byY[i].ly = Math.max(byY[i].ly, byY[i - 1].ly + 16);
    const over = byY[byY.length - 1].ly - (span + BASE + 6); if (over > 0) byY.forEach(k => { k.ly -= over; });
    for (let i = byY.length - 2; i >= 0; i--) byY[i].ly = Math.min(byY[i].ly, byY[i + 1].ly - 16);
    for (const k of marks) {
      const st = `bottom:${k.y.toFixed(1)}px`;
      if (k.cls === 'sum') html += `<i class="tb-sum" style="${st}"></i>`;
      if (k.cls === 'best') html += `<i class="tb-best" style="${st}"></i>`;
      if (k.cls === 'run') html += `<i class="tb-run" style="${st};background:${Art.hat.c}"></i>`;
      html += `<b class="tb-ml tb-${k.cls}l" style="bottom:${k.ly.toFixed(1)}px">${k.txt}</b>`;
    }
    el.innerHTML = html;
  }
  function gameOver() {
    const h = Math.floor(sim.bestAlt), nb = h > save.bestH, prevBest = S.daily ? S.flagAt : S.bestAtStart;
    S.over = { h, score: Math.floor(sim.score), streak: sim.maxStreak, nb, nbStreak: sim.maxStreak > save.bestChain };
    if (nb) save.bestH = h; if (sim.maxStreak > save.bestChain) save.bestChain = sim.maxStreak; if (sim.score > save.bestScore) save.bestScore = Math.floor(sim.score);
    persist();
    $('ovH').textContent = fmt(h) + ' m'; $('ovC').textContent = String(sim.maxStreak); $('ovS').textContent = fmt(sim.score);
    $('ovBank').style.display = S.fallBank ? 'block' : 'none'; $('ovBank').textContent = S.fallBank ? `incl. +${fmt(S.fallBank)} streak bank` : '';
    const badge = S.summited && nb ? 'SUMMIT + BEST!' : S.summited ? 'SUMMITED!' : nb ? 'NEW BEST!' : '';
    $('ovBadge').style.display = badge ? 'inline-block' : 'none'; $('ovBadge').textContent = badge;
    show('over', true); trailBar(h, prevBest, nb);              // shown first so the trail has a measured height
    const fresh = HATS.filter(x => x.ok(save) && !save.hatsSeen.includes(x.id));
    fresh.forEach(x => save.hatsSeen.push(x.id));
    if (fresh.length) { save.hat = fresh[fresh.length - 1].id; applyHat(); }
    $('ovUnlock').style.display = fresh.length ? 'block' : 'none';
    $('ovUnlock').innerHTML = fresh.length ? `NEW HAT${fresh.length > 1 ? 'S' : ''}:<br><b>${fresh.map(x => x.name).join(', ')}</b><br><small>now wearing it</small>` : '';
    // one line of goal text: your best if it's close, else the summit, else the next hat
    const toBest = prevBest - h, toSum = SUMMIT_M - h, nx = HATS.find(x => !x.ok(save));
    let goal;
    if (!nb && toBest > 0 && toBest <= 150) goal = `Only <b>${fmt(toBest)} m</b> short of your best.`;
    else if (!S.summited && toSum > 0) goal = `Summit is <b>${fmt(toSum)} m</b> higher.`;
    else if (nx && !fresh.length) goal = `Next hat: <b>${nx.need}</b>`;
    else goal = S.summited ? `Summits: <b>${save.summits}</b>` : 'Hop again!';
    $('ovGoal').innerHTML = goal;
    $('ovBest').innerHTML = S.daily ? `Daily ${dayLabel(S.dayK)} · today <b>${fmt(Math.max(save.dBest || 0, h))} m</b> · day streak <b>${save.dStreak}</b>`
      : `Bests: <b>${fmt(save.bestH)} m</b> · streak <b>${save.bestChain}</b> · score <b>${fmt(save.bestScore)}</b>`;
    if (S.daily && h > (save.dBest || 0)) save.dBest = h;
    persist();
    $('hudbtns').style.display = 'none'; $('ovRetry').textContent = S.daily ? 'DAILY AGAIN' : 'HOP AGAIN'; $('ovRetry').classList.toggle('dly', S.daily); $('ovRetry').title = S.daily ? 'Replays today\'s Daily Hike' : '';
    show('over', true); sfx('over');
  }

  // ---------- particles / popups / top-band messages ----------
  function part(o) { if (S.parts.length < 160) S.parts.push(Object.assign({ x: 0, y: 0, vx: 0, vy: 0, g: 0, age: 0, life: 0.6, size: 4, col: '#fff', kind: 'puff', rot: 0, vr: 0, grow: 0 }, o)); }
  function puffs(x, y, n, col, spread, up) {
    for (let i = 0; i < n; i++) part({ kind: 'puff', x: x + (Math.random() - .5) * 14, y: y - 1, vx: (Math.random() - .5) * (spread || 90), vy: -Math.random() * (up || 30), life: .35 + Math.random() * .2, size: 2.5 + Math.random() * 3, grow: 10, col });
  }
  function bits(x, y, n, cols) { for (let i = 0; i < n; i++) part({ kind: 'bit', x: x + (Math.random() - .5) * 30, y, vx: (Math.random() - .5) * 120, vy: -Math.random() * 100, g: 900, life: .6 + Math.random() * .3, size: 2.5 + Math.random() * 2.5, col: cols[(Math.random() * cols.length) | 0], rot: Math.random() * 6, vr: (Math.random() - .5) * 14 }); }
  function pop(txt, x, y, o) { S.pops.push(Object.assign({ txt, x, y, age: 0, life: 0.5, size: 16, col: '#fff', vy: -40 }, o || {})); }
  function shake(a) { S.shake = Math.max(S.shake, a); }
  function topMsg(txt, col, size, life, pri) {               // the one message slot, in the HUD band
    if (S.msg && S.msg.pri > (pri || 0) && S.msg.age < S.msg.life * 0.6) return;
    S.msg = { txt, col: col || '#fff', size: Math.min(28, size || 18), life: life || 0.9, age: 0, pri: pri || 0 };
  }
  const multCol = (m) => m >= 5 ? '#ff9ee0' : m >= 4 ? '#ffb86a' : m >= 3 ? '#ffd45a' : m >= 2 ? '#fff0a0' : '#ffffff';
  const sideX = (x) => x > W - 90 ? x - 46 : x + 46;          // score pops sit beside the ledge, on the roomier side

  // ---------- sim events ----------
  function handleEvents() {
    const evs = sim.events.splice(0); const p = sim.p;
    for (const e of evs) {
      if (e.type === 'land') {
        const l = e.ledge; S.sqT = 0;
        const dcol = l.type === 'ice' ? '#e6f7ff' : l.type === 'moss' ? '#8cc56c' : '#dcdad3';
        puffs(p.x, l.y, 4, dcol, 90, 22);
        if (S.mode !== 'play') continue;
        if (e.spring) { sfx('spring'); shake(3); buzz(25); }
        else sfx('bounce', e.fresh ? Math.min(1, e.streak / 20) : 0);
        if (e.perfect) {
          sfx('perfect', e.streak); buzz(12); S.rings.push({ x: p.x, y: l.y, age: 0 });
          pop(`+${e.pbonus}`, sideX(l.x), l.y - 12, { col: '#bff6ff' });
        }
        if (l.type === 'moss') { sfx('crumble'); bits(l.x, l.y, 5, ['#4f8f3e', '#86c264', '#7d8388']); }
        if (l.type === 'ice') {                                         // ice: a little skid puff in the direction you're sliding
          sfx('ice'); const dir = p.vx >= 0 ? 1 : -1;
          for (let i = 0; i < 4; i++) part({ kind: 'puff', x: p.x + dir * (4 + i * 5), y: l.y - 1, vx: dir * (90 + Math.random() * 70), vy: -Math.random() * 12, life: .3 + Math.random() * .15, size: 2 + Math.random() * 2, grow: 6, col: '#ffffff' });
        }
        if (e.step) {
          sfx('combo', e.mult * 2); buzz(e.mult >= 4 ? 30 : 15);
          topMsg(`×${e.mult}  CLEAN CLIMB`, multCol(e.mult), 20, 0.9, 2);
        } else if (!e.perfect && !e.spring) buzz(6);
      } else if (e.type === 'streakEnd') {
        if (S.mode !== 'play') continue;
        if (e.bank > 0) { sfx('bank', Math.min(10, Math.floor(e.streak / 2))); pop(`+${fmt(e.bank)}`, sideX(p.x), p.y - 30, { col: '#fff0a0', life: 0.8 }); topMsg(`STREAK ${e.streak} BANKED`, '#fff0a0', 18, 0.9, 1); }
      } else if (e.type === 'fell') { if (S.mode === 'play') { S.fallBank = e.bank || 0; S.fallStreak = e.streak || 0; if (S.fallBank) sfx('bank', Math.min(10, Math.floor(e.streak / 2))); beginTumble(); } }
    }
  }

  // ---------- hazards (always telegraphed; one at a time below 1,200 m, at most two above) ----------
  function hazardsUpdate(dt) {
    if (S.mode !== 'play') return;
    const m = sim.bestAlt, d = World.ramp(m).d, d3 = clamp(m / 3000, 0, 1);
    const cd = S.hazCd; for (const k in cd) cd[k] -= dt;
    const maxLive = m >= 1200 ? 2 : 1;
    if (S.haz.length < maxLive) S.hazGap -= dt;
    const active = (k) => S.haz.some(h => h.k === k);
    if (S.hazGap <= 0 && S.haz.length < maxLive) {
      const sy = clamp(sim.p.y - sim.camTop, 160, H - 200);
      if (m >= 220 && cd.crow <= 0 && !active('crow')) {
        const dir = S.hr() < .5 ? 1 : -1;
        S.haz.push({ k: 'crow', st: 'warn', t: 0, warn: 1.4, dir, sy: clamp(sy + (S.hr() * 150 - 90), 150, H - 210), x: 0, y: 0 });
        cd.crow = (6 + S.hr() * 5) * (1 - 0.35 * d3); S.hazGap = m >= 1200 ? 2.5 : 3.5; sfx('warn');
      } else if (m >= 650 && cd.gust <= 0 && !active('gust')) {
        const dir = S.hr() < .5 ? 1 : -1;
        S.haz.push({ k: 'gust', st: 'warn', t: 0, warn: 1.5, dir, dur: 2.4 + S.hr() });
        cd.gust = 12 + S.hr() * 8; S.hazGap = m >= 1200 ? 2.5 : 3.5; sfx('warn');
        topMsg(dir > 0 ? 'WIND  →' : '←  WIND', '#ffffff', 18, 1.5, 1);
      }
    }
    const p = sim.p, px = p.x, py = p.y - 18;
    let windAx = 0, live = 0;
    for (let i = S.haz.length - 1; i >= 0; i--) {
      const h = S.haz[i]; h.t += dt;
      if (h.st === 'live') live++;
      if (h.k === 'crow') {
        if (h.st === 'warn' && h.t >= h.warn) { h.st = 'live'; h.t = 0; h.x = h.dir > 0 ? -34 : W + 34; sfx('caw'); }
        if (h.st === 'live') {
          h.y = sim.camTop + h.sy;                                      // stays on the lane that was marked, even while the camera climbs
          h.x += h.dir * (250 + 90 * d) * dt;
          if (Math.abs(h.x - px) < 19 && Math.abs(h.y - py) < 13) hitPlayer(h.x, h.y);          // tight hazard box, generous player
          if (h.x < -60 || h.x > W + 60) { S.haz.splice(i, 1); if (m < 1200) S.hazGap = Math.max(S.hazGap, 3.5); }
        }
      } else if (h.k === 'gust') {
        if (h.st === 'warn' && h.t >= h.warn) { h.st = 'live'; h.t = 0; sfx('whoosh'); }
        else if (h.st === 'live') {
          const env = clamp(h.t / 0.35, 0, 1) * clamp((h.dur - h.t) / 0.5, 0, 1);
          windAx += h.dir * 520 * env; S.wind.dir = h.dir;
          if (h.t >= h.dur) { S.haz.splice(i, 1); if (m < 1200) S.hazGap = Math.max(S.hazGap, 3.5); }
        }
      }
    }
    S.overlapMax = Math.max(S.overlapMax, m < 1200 ? S.haz.length : 0);
    S.wind.ax = windAx; sim.windAx = windAx;
  }
  function hitPlayer(x, y) {
    if (!sim.knock()) return false;
    S.dizzy = 0.9; S.freeze = 0.07; shake(6); S.hitFlash = 0.18; sfx('hit'); buzz(40);
    for (let i = 0; i < 6; i++) part({ kind: 'bit', x, y, vx: (Math.random() - .5) * 220, vy: -Math.random() * 180, g: 700, life: .6, size: 3, col: ['#23232e', '#ffffff'][i % 2], rot: Math.random() * 6, vr: 10 });
    pop('OUCH!', sim.p.x, sim.p.y - 56, { col: '#ffb3a8', size: 18, life: 0.6 });
    return true;
  }

  // ---------- tumble (fall back to the parking lot): 1.2 s, tap to skip ----------
  function beginTumble() {
    S.mode = 'tumble'; S.msg = null; $('hudbtns').style.display = 'none'; S.haz.length = 0; sim.windAx = 0; S.wind.ax = 0; S.wind.streaks.length = 0; ptrs.clear();
    S.tum = { t: 0, D: 0.85, from: sim.camTop, gcam: -(H - 235), landed: false, spin: Math.random() < .5 ? 1 : -1, x: sim.p.x };
    sfx('fall'); buzz(60);
  }
  function tumbleUpdate(dt) {
    const T = S.tum; T.t += dt;
    if (T.t < T.D) {
      const u = T.t / T.D, e = u * u * (3 - 2 * u);
      S.camOverride = lerp(T.from, T.gcam, e);
    } else {
      S.camOverride = T.gcam;
      if (!T.landed) {
        T.landed = true; S.dazed = true; sfx('thud'); shake(8); buzz(50);
        puffs(W / 2, 0, 10, '#c9c6bf', 200, 40);
      }
      if (T.t > T.D + 0.35 && S.mode === 'tumble') { S.mode = 'over'; gameOver(); }
    }
  }

  // ---------- update ----------
  function update(dt) {
    S.t += dt; Snd.title = S.mode !== 'play'; Snd.intensity = S.mode === 'play' ? sim.mult : 0;
    S.sqT += dt; S.hitFlash = Math.max(0, S.hitFlash - dt); S.dizzy = Math.max(0, S.dizzy - dt); S.hatPop = Math.max(0, (S.hatPop || 0) - dt * 0.45); S.hPop = Math.max(0, S.hPop - dt * 2.5); S.sumT = Math.max(0, S.sumT - dt);
    if (S.msg) { S.msg.age += dt; if (S.msg.age > S.msg.life) S.msg = null; }
    S.shake = Math.max(0, S.shake - dt * 30);
    S.blinkT -= dt; if (S.blinkT < -0.12) S.blinkT = 2 + Math.random() * 3;
    if (S.mode === 'play' && !S.paused) {
      if (S.freeze > 0) S.freeze -= dt;
      else {
        S.runT += dt;
        const st = S.botOn ? botSteer(sim, { skip: 1 }) : steer();
        if (st !== 0) S.steerAcc += dt;
        sim.step(dt, st);
        hazardsUpdate(dt);
        handleEvents();
        progress();
      }
    } else if (S.mode === 'tumble') {
      tumbleUpdate(dt);
    }
    // always-on visual updates
    for (let i = S.parts.length - 1; i >= 0; i--) {
      const q = S.parts[i]; q.age += dt;
      if (q.age >= q.life) { S.parts.splice(i, 1); continue; }
      q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt; q.size += q.grow * dt;
    }
    for (let i = S.rings.length - 1; i >= 0; i--) { S.rings[i].age += dt; if (S.rings[i].age > 0.45) S.rings.splice(i, 1); }
    for (let i = S.pops.length - 1; i >= 0; i--) { const q = S.pops[i]; q.age += dt; q.y += q.vy * dt; q.vy *= 0.95; if (q.age > q.life) S.pops.splice(i, 1); }
    // wind streaks: a few, faint, only along the outer edges
    const gust = S.haz.find(h => h.k === 'gust' && h.st === 'live');
    if (gust && S.mode === 'play') while (S.wind.streaks.length < 8) {
      const left = S.wind.streaks.length % 2 === 0;
      S.wind.streaks.push({ x: left ? Math.random() * 60 : W - 60 + Math.random() * 60, lane: left ? 0 : 1, y: 110 + Math.random() * (H - 180), len: 18 + Math.random() * 22, spd: 260 + Math.random() * 160, a: .2 + Math.random() * .15 });
    }
    for (let i = S.wind.streaks.length - 1; i >= 0; i--) {
      const s = S.wind.streaks[i]; s.x += (S.wind.dir || 1) * s.spd * dt;
      const lo = s.lane ? W - 60 : 0, hi = lo + 60;
      if (s.x < lo - 10 || s.x > hi + 10) { if (gust) { s.x = (S.wind.dir || 1) > 0 ? lo : hi; s.y = 110 + Math.random() * (H - 180); } else S.wind.streaks.splice(i, 1); }
    }
  }
  function progress() {                // zones, 100 m trail markers, 500 m pops, summit, new best
    const a = sim.bestAlt, z = zoneAt(a);
    if (z > S.zoneShown) { S.zoneShown = z; Snd.zoneIdx = z; sfx('zone'); topMsg(ZONES[z].name.toUpperCase(), '#ffffff', 18, 1.5, 1); }
    const mk = Math.floor(a / 100);
    if (mk > S.mark) { S.mark = mk; if (mk % 5 === 0) { S.hPop = 1; sfx('mark'); } }
    if (!S.summited && a >= SUMMIT_M) {
      S.summited = true; save.summits++; persist();
      topMsg('SUMMIT!', '#ffe066', 28, 1.6, 3);
      sfx('summit'); shake(4); buzz(60); S.hPop = 1; S.sumT = 1.5;
      for (let i = 0; i < 12; i++) { const an = Math.random() * TAU, v = 120 + Math.random() * 120; part({ kind: 'spark', x: sim.p.x, y: sim.p.y - 24, vx: Math.cos(an) * v, vy: Math.sin(an) * v - 60, g: 300, life: .7, size: 3, col: ['#ffe066', '#ffffff', '#ffd45a'][i % 3] }); }
    }
    if (!S.nbShown && S.flagAt >= 40 && a > S.flagAt) {
      S.nbShown = true; sfx('newBest'); topMsg(S.daily ? 'NEW BEST TODAY' : 'NEW BEST', '#ffe066', 24, 1.2, 2);
    }
  }

  // ---------- render ----------
  function outText(str, x, y, size, fill, stroke, align, font) {
    const fw = font && /^\d00 /.test(font) ? font.slice(0, 4) : '', ff = fw ? font.slice(4) : font;
    ctx.font = `${fw}${size}px ${ff || '"Bevan", Georgia, serif'}`; ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic';
    if (stroke !== 'none') { ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, size * 0.2); ctx.strokeStyle = stroke || 'rgba(20,28,40,.85)'; ctx.strokeText(str, x, y); }
    ctx.fillStyle = fill || '#fff'; ctx.fillText(str, x, y);
  }
  const topFade = (sy) => clamp((sy - insetTopW - 110) / 34, 0, 1);      // nothing on the field shows behind the height, pips or banner text
  function render() {
    ctx.setTransform(scaleK, 0, 0, scaleK, 0, 0);
    const camTop = S.camOverride != null ? S.camOverride : sim.camTop;
    const sh = S.shake > 0 ? S.shake : 0, shx = sh ? (Math.random() - .5) * sh : 0, shy = sh ? (Math.random() - .5) * sh : 0;
    const altPx = -camTop, mCenter = Math.max(0, -(camTop + H * 0.5) / PXM);
    Art.background(ctx, { H, m: mCenter, altPx, t: S.t });
    ctx.save(); ctx.translate(shx, -camTop + shy);
    if (S.mode === 'play') drawMarkers(camTop);
    Art.ground(ctx, { H, camTop, t: S.t, dazed: S.dazed });
    if (S.mode === 'play') for (const l of sim.ledges) if (l.y > camTop - 30 && l.y < camTop + H + 30) Art.ledge(ctx, l, S.t, topFade(l.y - camTop));
    for (const q of S.parts) drawPart(q);
    if (S.mode === 'play') drawLandShadow();
    for (const r of S.rings) { const u = r.age / 0.45; ctx.save(); ctx.globalAlpha = 1 - u; ctx.strokeStyle = '#5aebff'; ctx.lineWidth = 3 * (1 - u) + 1; ctx.beginPath(); ctx.ellipse(r.x, r.y, 10 + u * 34, 3 + u * 8, 0, 0, TAU); ctx.stroke(); ctx.restore(); }
    drawClimber(camTop);
    const pale = mCenter > 1450;
    for (const h of S.haz) if (h.k === 'crow' && h.st === 'live') Art.crow(ctx, h.x, h.y, h.dir, S.t + h.x * 0.01, pale);
    drawPops();
    ctx.restore();
    // ---- screen-space layers ----
    if (S.wind.streaks.length) {
      ctx.lineCap = 'round'; const dir = S.wind.dir || 1;
      for (const s of S.wind.streaks) { ctx.strokeStyle = `rgba(255,255,255,${s.a})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - dir * s.len, s.y); ctx.stroke(); }
    }
    drawWarnings();
    if (S.mode === 'play') {
      const k = clamp((sim.bestAlt - C.CREEP_AT + 20) / 20, 0, 1), low = clamp((sim.p.y - sim.camTop - (H - 160)) / 120, 0, 1);
      Art.weather(ctx, { H, m: mCenter, k, low });
    }
    if (S.hitFlash > 0) { ctx.fillStyle = `rgba(255,80,60,${S.hitFlash})`; ctx.fillRect(0, 0, W, H); }
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.8); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,10,25,.18)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    if (S.mode === 'play') { Art.scrim(ctx, { m: mCenter, top: insetTopW }); drawHUD(); drawHints(); }
    if (S.mode === 'title' && S.hatPop > 0) {          // hat preview: a big hiker pops up above the HAT button
      const u = S.hatPop, e = Math.min(1, (1 - u) * 6), k = 1.7 * (0.75 + 0.25 * e), x = W / 2, y = H - 132 - insetBotW;          // sits above the best-height pill
      const lock = HATS.find(h => !h.ok(save));
      ctx.save(); ctx.globalAlpha = Math.min(1, u * 3);
      ctx.fillStyle = 'rgba(10,24,40,.82)'; Art.rr(ctx, x - 130, y - 92, 260, 112, 18); ctx.fill(); ctx.strokeStyle = 'rgba(255,248,232,.5)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.save(); ctx.translate(x - 76, y + 4); ctx.scale(k, k); Art.climber(ctx, { x: 0, y: 0, sx: 1, sy: 1, lean: 0, face: 1, pose: 0, t: S.t, blink: false }); ctx.restore();
      outText(hatById(save.hat).name.toUpperCase(), x + 30, y - 46, 20, '#ffe066', 'rgba(20,28,40,.9)', 'center');
      outText(lock ? 'Next hat:' : 'Every hat unlocked!', x + 30, y - 20, 14, '#cfe3da', 'none', 'center', UI);
      if (lock) outText(lock.need, x + 30, y - 2, 14, '#ffffff', 'none', 'center', UI);
      ctx.restore();
    }
  }
  function drawPart(q) {
    const u = q.age / q.life; ctx.save(); ctx.translate(q.x, q.y); ctx.globalAlpha = clamp(1 - u * u, 0, 1);
    if (q.kind === 'puff') { ctx.fillStyle = q.col; ctx.globalAlpha *= 0.55; ctx.beginPath(); ctx.arc(0, 0, q.size, 0, TAU); ctx.fill(); }
    else if (q.kind === 'spark') { ctx.fillStyle = q.col; ctx.rotate(q.age * 6); const s = q.size * (1 - u * .5); ctx.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? s * .4 : s * 1.6, a = i * Math.PI / 4; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill(); }
    else if (q.kind === 'bit') { ctx.rotate(q.rot); ctx.fillStyle = q.col; ctx.fillRect(-q.size / 2, -q.size / 2, q.size, q.size * .7); }
    ctx.restore();
  }
  function drawMarkers(camTop) {       // trail markers every 100 m, a hairline every 500 m, the summit line, your best flag
    const m0 = Math.floor(-(camTop + H) / PXM / 100), m1 = Math.ceil(-camTop / PXM / 100);
    ctx.save();
    for (let k = Math.max(1, m0); k <= m1; k++) {
      const m = k * 100, y = -m * PXM; if (m === 1200 && Math.abs(m - SUMMIT_M) < 50) { /* summit line nearby */ }
      const big = k % 5 === 0, f = topFade(y - 8 - camTop); if (f <= 0) continue;
      ctx.globalAlpha = (big ? 0.5 : 0.38) * f; ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, y - 0.75, 24, 1.5);
      if (big) { ctx.globalAlpha = 0.22 * f; ctx.fillRect(24, y - 0.5, W - 24, 1); ctx.globalAlpha = 0.5 * f; }
      outText(fmt(m), 4, y - 4, 12, '#ffffff', 'rgba(10,20,35,.5)', 'left', UI);
    }
    ctx.globalAlpha = 1;
    const sy = -SUMMIT_M * PXM;
    if (sy > camTop - 40 && sy < camTop + H + 40) {                 // the summit: a gold line across the mountain, a sign, and a 1.5 s flash when you cross it
      const f = topFade(sy - 26 - camTop), u = S.sumT / 1.5;
      if (u > 0) {
        const g = ctx.createLinearGradient(0, sy - 26, 0, sy + 26); g.addColorStop(0, 'rgba(255,224,102,0)'); g.addColorStop(0.5, `rgba(255,236,150,${0.7 * u})`); g.addColorStop(1, 'rgba(255,224,102,0)');
        ctx.fillStyle = g; ctx.fillRect(0, sy - 26, W, 52);
        ctx.fillStyle = `rgba(255,255,255,${u})`; ctx.fillRect(0, sy - 2 - 2 * u, W, 4 + 4 * u);
      }
      ctx.globalAlpha = f;
      ctx.fillStyle = 'rgba(40,26,12,.6)'; ctx.fillRect(0, sy - 2.5, W, 5);
      ctx.fillStyle = '#ffd84a'; ctx.fillRect(0, sy - 1.5, W, 3);
      ctx.fillStyle = 'rgba(70,45,22,.95)'; Art.rr(ctx, 4, sy - 30, 132, 25, 6); ctx.fill(); ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 1.5; ctx.stroke();
      outText(S.summited ? 'SUMMIT  ✓' : 'SUMMIT 1,244 m', 70, sy - 12, 15, '#ffe7a0', 'none', 'center', UI);
      ctx.globalAlpha = 1;
    }
    if (S.flagAt >= 20) {
      const fy = -S.flagAt * PXM, past = sim.bestAlt > S.flagAt;
      if (fy > camTop - 30 && fy < camTop + H + 30 && topFade(fy - 26 - camTop) > 0) {
        const x = W - 6, col = past ? '#ffd23a' : '#f4efe2'; ctx.globalAlpha = topFade(fy - 26 - camTop);
        ctx.fillStyle = 'rgba(20,28,40,.8)'; ctx.fillRect(x - 1, fy - 26, 2.5, 26);
        ctx.fillStyle = col; ctx.strokeStyle = 'rgba(20,28,40,.85)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x, fy - 26); ctx.lineTo(x - 20, fy - 20); ctx.lineTo(x, fy - 14); ctx.closePath(); ctx.fill(); ctx.stroke();
        outText(`${S.daily ? 'TODAY' : 'BEST'} ${fmt(S.flagAt)} m`, x - 24, fy - 16, 12, col, 'rgba(20,28,40,.8)', 'right', UI);
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }
  function drawLandShadow() {          // a soft shadow on the ledge you'll land on: helps aim the drop; cyan = lined up for PERFECT
    const p = sim.p; let best = null;
    for (const l of sim.ledges) { if (l.state !== 'ok' || l.y < p.y - 1 || l.y > p.y + 300) continue; if (Math.abs(World.wd(p.x, l.x)) > l.w / 2 + C.LEDGE_SLACK) continue; if (!best || l.y < best.y) best = l; }
    if (!best) return;
    const d = clamp((best.y - p.y) / 300, 0, 1), a = 0.34 * (1 - d) + 0.06, rx = 13 - 5 * d;
    const perf = best.level > sim.maxLevel && Math.abs(World.wd(p.x, best.x)) <= best.w * C.PERFECT;
    ctx.save(); ctx.fillStyle = perf ? `rgba(90,235,255,${a + 0.35})` : `rgba(20,25,35,${a})`; ctx.beginPath(); ctx.ellipse(p.x, best.y + 1.5, rx, 3.2, 0, 0, TAU); ctx.fill(); ctx.restore();
  }
  function climberAt(o) {
    Art.climber(ctx, o);
    if (o.x < 26) Art.climber(ctx, Object.assign({}, o, { x: o.x + W })); else if (o.x > W - 26) Art.climber(ctx, Object.assign({}, o, { x: o.x - W }));
  }
  function drawClimber() {
    const p = sim.p;
    if (S.mode === 'title') {                                        // waiting at the trailhead, a little impatient hop now and then
      const ph = S.t % 2.4, hop = ph < 0.36 ? Math.sin(ph / 0.36 * Math.PI) * 10 : 0;
      Art.climber(ctx, { x: 268, y: -2 - hop, sx: 1, sy: 1, lean: 0, face: -1, pose: hop > 1 ? -1 : 0, t: S.t, blink: S.blinkT < 0 });
      return;
    }
    if (S.mode === 'tumble' && S.tum) {
      const T = S.tum, u = clamp(T.t / T.D, 0, 1);
      const e = u * u * (3 - 2 * u), wy = lerp(T.from + H * 0.4, -2, e), x = T.x + Math.sin(T.t * 5) * 40 * (1 - u);
      if (T.t < T.D) Art.climber(ctx, { x, y: wy, sx: 1, sy: 1, lean: T.t * 9 * T.spin, face: T.spin, pose: 1, t: S.t, dizzy: true, blink: false });
      else { const r = T.t - T.D; Art.climber(ctx, { x: W / 2 + 8, y: 0, sx: 1.1, sy: 0.9, lean: r < .25 ? 1.45 : 0.12 * Math.sin(S.t * 3), face: 1, pose: 0, t: S.t, dizzy: true }); }
      return;
    }
    if (S.mode === 'over') { Art.climber(ctx, { x: W / 2 + 8, y: 0, sx: 1.05, sy: 0.95, lean: 0.12 * Math.sin(S.t * 3), face: 1, pose: 0, t: S.t, dizzy: true }); return; }
    if (sim.p.hit > 0 && Math.floor(S.t * 18) % 2 === 0) return;
    const sq = S.sqT < 0.12 ? 1 - S.sqT / 0.12 : 0;
    let sx = 1 + 0.32 * sq, sy = 1 - 0.3 * sq;
    if (!sq) { const st = clamp(Math.abs(p.vy) / 1000, 0, 1) * (p.vy < 0 ? 0.22 : 0.12); sy = 1 + st; sx = 1 - st * 0.6; }
    climberAt({ x: p.x, y: p.y, sx, sy, lean: clamp(p.vx / C.VMAX, -1, 1) * 0.2, face: p.face, pose: sq > 0 ? 0 : p.vy < -60 ? -1 : p.vy > 120 ? 1 : 0, t: S.t, blink: S.blinkT < 0, dizzy: S.dizzy > 0 });
  }
  function drawWarnings() {
    const pulse = 0.6 + 0.4 * Math.sin(S.t * 18);
    for (const h of S.haz) {
      if (h.st !== 'warn') continue;
      const a = clamp(h.t / 0.2, 0, 1);
      if (h.k === 'crow') {                                          // one red warning triangle at the edge the crow will enter from
        const y = h.sy, side = h.dir > 0 ? 20 : W - 20;
        ctx.save(); ctx.globalAlpha = a;
        ctx.fillStyle = `rgba(217,56,47,${0.75 + 0.25 * pulse})`; ctx.beginPath(); ctx.moveTo(side, y - 15); ctx.lineTo(side + 15, y + 11); ctx.lineTo(side - 15, y + 11); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); outText('!', side, y + 8, 16, '#fff', 'none', 'center');
        ctx.restore();
      } else if (h.k === 'gust') {                                   // three chevrons on the side the wind comes from
        const dir = h.dir;
        ctx.save(); ctx.globalAlpha = a * (0.45 + 0.35 * pulse); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (let i = 0; i < 3; i++) { const y = H * 0.35 + i * H * 0.15, x = (dir > 0 ? 18 : W - 18) + dir * ((S.t * 60 + i * 13) % 26); ctx.beginPath(); ctx.moveTo(x - dir * 8, y - 9); ctx.lineTo(x, y); ctx.lineTo(x - dir * 8, y + 9); ctx.stroke(); }
        ctx.restore();
      }
    }
  }
  function drawHUD() {
    const top = insetTopW + 10, alt = Math.max(0, Math.floor(sim.bestAlt));
    const k = 1 + 0.18 * Math.sin(Math.min(1, 1 - S.hPop) * Math.PI) * (S.hPop > 0 ? 1 : 0);
    ctx.save(); ctx.translate(14, top + 32); ctx.scale(k, k);
    outText(fmt(alt), 0, 0, 34); ctx.font = '34px "Bevan", serif'; const wdt = ctx.measureText(fmt(alt)).width;
    outText('m', wdt + 4, 0, 16); ctx.restore();
    const quiet = S.steerAcc < 0.9 && (S.runT < 14 || sim.maxLevel < 1);        // first seconds: just the height while the steering hint shows
    if (!quiet) {
      // next milestone: zone, summit, or your best
      const a = sim.bestAlt, zi = zoneAt(a); let nm = null, at = 0;
      const SHORT = ['Trailhead', 'Hardwood', 'Birches', 'Spruce-Fir', 'Treeline', 'Bare Rock', 'The Clouds', 'Night Sky', 'Aurora'];
      if (zi + 1 < ZONES.length) { nm = SHORT[zi + 1]; at = ZONES[zi + 1].at; }
      if (!S.summited && SUMMIT_M > a && (!nm || SUMMIT_M < at)) { nm = 'Summit'; at = SUMMIT_M; }
      if (S.flagAt > a && (!nm || S.flagAt < at)) { nm = S.daily ? 'Today\'s best' : 'Your best'; at = S.flagAt; }
      if (nm) outText(`NEXT: ${nm.toUpperCase()} · ${Math.ceil(at - a)} m`, 15, top + 52, 13, nm === 'Summit' ? '#ffe066' : '#d8f2e4', 'rgba(20,28,40,.8)', 'left', UI);
      // multiplier and five pips toward the next step
      const mx = 212, my = top + 28, mult = sim.mult, s = sim.streak;
      outText('×' + mult, mx, my, mult > 1 ? 24 : 20, multCol(mult), 'rgba(20,28,40,.85)', 'center');
      const filled = mult >= 5 ? 5 : s % 5;
      for (let i = 0; i < 5; i++) {
        const px = mx - 22 + i * 11, py = my + 10;
        ctx.beginPath(); ctx.arc(px, py, 3.6, 0, TAU); ctx.fillStyle = i < filled ? multCol(Math.min(5, mult + (mult >= 5 ? 0 : 1))) : 'rgba(20,28,40,.45)'; ctx.fill();
        ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(20,28,40,.8)'; ctx.stroke();
      }
    }
    if (S.daily) outText('DAILY · ' + dayLabel(S.dayK), W - 10, top + 58, 12, '#ffe7a8', 'rgba(20,28,40,.85)', 'right', UI);
    if (S.msg) {
      const m = S.msg, u = m.age / m.life, a = clamp(Math.min(m.age * 8, (1 - u) * 5), 0, 1), sc = m.age < 0.12 ? 0.8 + m.age / 0.12 * 0.2 : 1;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, top + 80); ctx.scale(sc, sc);
      outText(m.txt, 0, 0, m.size, m.col, 'rgba(20,28,40,.9)', 'center', m.size >= 24 ? null : '800 ' + UI.slice(4)); ctx.restore();
    }
  }
  function drawPops() {
    for (const q of S.pops) {
      const u = q.age / q.life; ctx.save(); ctx.globalAlpha = clamp(1.6 - u * 1.6, 0, 1); ctx.translate(clamp(q.x, 34, W - 34), q.y);
      outText(q.txt, 0, 0, q.size, q.col, 'rgba(20,28,40,.9)', 'center', UI); ctx.restore();
    }
  }
  function drawHints() {
    if (S.steerAcc < 0.9 && (S.runT < 14 || sim.maxLevel < 1)) {
      const a = 0.55 + 0.25 * Math.sin(S.t * 4);
      ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(0, H * 0.74, W / 2 - 3, H * 0.24); ctx.fillRect(W / 2 + 3, H * 0.74, W / 2 - 3, H * 0.24);
      ctx.globalAlpha = Math.min(1, a + .2);
      outText('◀', W * 0.25, H * 0.84, 46, '#fff', 'rgba(20,50,80,.9)', 'center', 'sans-serif'); outText('▶', W * 0.75, H * 0.84, 46, '#fff', 'rgba(20,50,80,.9)', 'center', 'sans-serif');
      outText('HOLD A SIDE TO STEER', W / 2, H * 0.91, 17, '#fff', 'rgba(20,50,80,.9)', 'center', UI);
      const gx = W * (0.25 + 0.5 * (Math.floor(S.t / 1.6) % 2)), gy = H * 0.93 + Math.sin(S.t * 6) * 4;      // ghost finger
      const ph = (S.t % 1.6) / 1.6, rip = clamp(ph * 3, 0, 1);
      ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - rip)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(gx, gy - 4, 14 + rip * 26, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#ffe2c4'; ctx.strokeStyle = 'rgba(40,30,25,.8)'; ctx.lineWidth = 2;
      Art.rr(ctx, gx - 11, gy - 14, 22, 52, 11); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.75)'; Art.rr(ctx, gx - 6, gy - 10, 12, 10, 5); ctx.fill();
      ctx.restore();
    }
  }

  // ---------- main loop ----------
  let last = 0;
  function frame(ts) {
    const dt = clamp((ts - last) / 1000, 0, 0.05); last = ts;
    if (!S.headless) { update(dt); render(); }
    requestAnimationFrame(frame);
  }

  // ---------- UI wiring ----------
  const on = (id, fn) => $(id).addEventListener('click', (e) => { e.stopPropagation(); fn(e); });
  on('btnPlay', () => startRun(null, false));
  on('btnDaily', () => startRun(null, true));
  on('tHat', () => {
    Snd.unlock(); Snd.click();
    const un = unlocked(), i = un.findIndex(h => h.id === save.hat), nx = un[(i + 1) % un.length];
    save.hat = nx.id; persist(); applyHat();
    titleDaily(); S.hatPop = 1;
  });
  on('ovRetry', () => startRun()); on('ovTitle', () => { Snd.unlock(); Snd.click(); toTitle(); });
  on('pResume', () => resumeGame()); on('pRestart', () => { show('pause', false); startRun(); }); on('pTitle', () => { Snd.click(); toTitle(); });
  on('btnPause', () => { Snd.unlock(); pauseGame(); });
  $('btnPause').addEventListener('pointerdown', (e) => { e.stopPropagation(); Snd.unlock(); pauseGame(); });   // works even while another finger is steering
  const togSfx = () => { Snd.unlock(); Snd.setSfx(!Snd.sfxOn); refreshSnd(); Snd.click(); };
  const togMus = () => { Snd.unlock(); Snd.setMusic(!Snd.musicOn); refreshSnd(); };
  const togAll = () => { Snd.unlock(); const on = !(Snd.sfxOn || Snd.musicOn); Snd.setSfx(on); Snd.setMusic(on); refreshSnd(); Snd.click(); };   // the in-game speaker is a master mute
  on('tSfx', togSfx); on('pSfx', togSfx); on('btnSound', togAll); on('tMusic', togMus); on('pMusic', togMus);
  on('tTilt', toggleTilt); on('pTilt', toggleTilt);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (S.mode === 'play' && !S.noAutoPause) pauseGame(); Snd.suspend(); ptrs.clear(); }
    else if (!S.paused) Snd.resume();
  });
  window.addEventListener('resize', () => layout(false));
  window.addEventListener('orientationchange', () => setTimeout(() => layout(true), 250));

  // ---------- test hooks ----------
  window.__T = {
    S,
    start(seed, daily) { startRun(seed, daily); return this.state(); }, HATS, today,
    step(ms) { const n = Math.max(1, Math.round(ms / 16.667)); for (let i = 0; i < n; i++) { update(1 / 60); } render(); return this.state(); },
    state() { const p = sim.p; return { mode: S.mode, paused: S.paused, alt: +(-p.y / PXM).toFixed(1), best: +sim.bestAlt.toFixed(1), x: +p.x.toFixed(1), y: +p.y.toFixed(1), vx: +p.vx.toFixed(1), vy: +p.vy.toFixed(1), streak: sim.streak, maxStreak: sim.maxStreak, chain: sim.streak, maxChain: sim.maxStreak, mult: sim.mult, score: Math.floor(sim.score), alive: sim.alive, level: sim.lastLevel, camTop: +sim.camTop.toFixed(1), H, haz: S.haz.map(h => h.k + ':' + h.st), landings: sim.landings, hit: +p.hit.toFixed(2), msg: S.msg && S.msg.txt }; },
    sim() { return sim; }, ptrs() { return ptrs.size; },
    setSteer(v) { S.fakeSteer = v; }, bot(on) { S.botOn = !!on; },
    warp(m) { sim.warp(m); S.zoneShown = zoneAt(m); S.mark = Math.floor(m / 100); if (m >= SUMMIT_M) S.summited = true; return this.state(); },
    spawn(kind) {
      if (kind === 'crow' || kind === 'cone') S.haz.push({ k: 'crow', st: 'warn', t: 0, warn: 1.4, dir: 1, sy: clamp(sim.p.y - sim.camTop, 150, H - 210), x: 0, y: 0 });
      if (kind === 'gust') S.haz.push({ k: 'gust', st: 'warn', t: 0, warn: 1.5, dir: -1, dur: 3 });
    },
    noAutoPause(v) { S.noAutoPause = !!v; }, headless(v) { S.headless = !!v; },
    layout() { return { H, cssScale, insetTopW, dpr }; },
    toTitle, pause: pauseGame, resume: resumeGame, save,
    fall() { sim.p.y = sim.camTop + H + 100; sim.p.vy = 400; },
  };

  // ---------- scripted scenes for screenshots: index.html#shot=title|play|streak|zone|hazard|summit|over ----------
  function runShot(name) {
    S.noAutoPause = true;
    const st = document.createElement('style'); st.textContent = '.screen.show,.btn.big,.hop span{animation:none!important}'; document.head.appendChild(st);   // screenshots: no half-faded frames
    const T = window.__T;
    if (name === 'title') return;
    startRun(11); S.flagAt = S.bestAtStart = 60;
    if (name === 'zone') { T.warp(860); S.steerAcc = 5; T.step(500); return; }
    if (name === 'hazard') { T.warp(700); S.steerAcc = 5; S.botOn = true; T.step(1500); T.spawn('crow'); T.step(800); return; }
    if (name === 'play') { T.step(200); return; }
    if (name === 'summit') { T.warp(1230); S.steerAcc = 5; S.botOn = true; let k = 0; while (k++ < 600 && sim.bestAlt < 1247) T.step(17); T.step(250); return; }
    S.botOn = true; S.steerAcc = 5;
    let n = 0; while (n++ < 3000 && (name === 'streak' || name === 'combo' || name === 'sight' ? sim.mult < 2 : sim.bestAlt < 160)) T.step(17);
    if (name === 'streak' || name === 'combo' || name === 'sight') { T.step(60); return; }
    S.botOn = false; T.fall(); T.step(2000);
  }

  // ---------- boot ----------
  layout(true);
  if (save.tilt) { /* needs a fresh user gesture on iOS; show as off until tapped */ save.tilt = false; persist(); }
  applyHat(); refreshSnd(); refreshTilt(); titleBest(); show('title', true);
  requestAnimationFrame((ts) => { last = ts; frame(ts); });
  { const m = /shot=(\w+)/.exec(location.hash); if (m) setTimeout(() => runShot(m[1]), 400); }
  if (document.fonts && document.fonts.load) { document.fonts.load('20px Bevan'); document.fonts.load('700 16px "Barlow Semi Condensed"'); }
})();
