/* Camel's Hump Hop — game shell: layout, input, hazards, juice, HUD, UI, saves, test hooks. */
(function () {
  'use strict';
  const { C, W, PXM, Sim, botSteer, zoneAt, ZONES } = window.World;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const TAU = Math.PI * 2;
  const $ = (id) => document.getElementById(id);
  const stage = $('stage'), cv = $('cv'), ctx = cv.getContext('2d');

  // ---------- saves ----------
  const SAVE_KEY = 'chh.save.v1';
  const save = { bestH: 0, bestChain: 0, bestScore: 0, tilt: false, tipCombo: false, plays: 0, summits: 0 };
  try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) { /* ignore */ }
  const SUMMIT_M = 1244;            // the real Camel's Hump is 4,083 ft = 1,244 m
  // unlockable hats: the progression layer (cosmetic only, never changes the rules)
  const HATS = [
    { id: 'red', name: 'Red Bobble', c: '#d9382f', b: '#f7efe0', p: '#ffffff', need: 'Starter hat', ok: () => true },
    { id: 'maple', name: 'Maple', c: '#e2701f', b: '#ffd27a', p: '#ffe9b0', need: 'Reach 600 m', ok: (v) => v.bestH >= 600 },
    { id: 'spruce', name: 'Spruce', c: '#2f7a52', b: '#e8f3ea', p: '#bfe8c8', need: 'Hit a chain of 10', ok: (v) => v.bestChain >= 10 },
    { id: 'summit', name: 'Summit Gold', c: '#f2b52c', b: '#7a3c0c', p: '#fff6c8', star: true, need: 'Summit 3 times (1,244 m)', ok: (v) => v.summits >= 3 },
    { id: 'regular', name: 'Trail Regular', c: '#7a62c9', b: '#f7efe0', p: '#ffd6f0', need: 'Daily Hike 3 days in a row', ok: (v) => (v.dStreakMax || 0) >= 3 },
    { id: 'owl', name: 'Night Owl', c: '#2a2f6c', b: '#ffe066', p: '#ffe066', star: true, need: 'Reach the Aurora (2,200 m)', ok: (v) => v.bestH >= 2200 },
    { id: 'legend', name: 'Legend', c: '#ff5fc8', b: '#ffffff', p: '#ffe066', star: true, need: 'Hit a chain of 20', ok: (v) => v.bestChain >= 20 },
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
    mode: 'title', paused: false, t: 0, sim: new Sim(7, 780), demo: true,
    parts: [], pops: [], trail: [], rings: [], haz: [], hazCd: { crow: 9, cone: 8, gust: 18 }, hazGap: 0,
    wind: { ax: 0, dir: 0, streaks: [] },
    shake: 0, freeze: 0, sqT: 9, hitFlash: 0, dizzy: 0, blinkT: 2,
    banner: null, callout: null, zoneShown: 0, bestAtStart: 0, nbShown: false, steerAcc: 0, runT: 0, tipT: 0,
    tum: null, camOverride: null, dazed: false, headless: false, daily: false, hr: Math.random, summited: false, zoneFlash: 0, chainMsg: null, lastTick: 9, noAutoPause: false, lastAmb: 0, over: null, fakeSteer: null, botOn: false,
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
  window.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    if (S.mode === 'tumble' && S.tum && S.tum.t > 0.6 && S.tum.t < S.tum.D) { S.tum.t = S.tum.D; return; }      // tap skips the tumble
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
  document.addEventListener('touchmove', (e) => { if (!e.target.closest('.scroll')) e.preventDefault(); }, { passive: false });
  window.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') { keys.l = 1; keys.last = -1; e.preventDefault(); }
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') { keys.r = 1; keys.last = 1; e.preventDefault(); }
    else if (k === ' ' || k === 'Enter') { e.preventDefault(); if (S.mode === 'title') startRun(); else if (S.mode === 'over') startRun(); else if (S.mode === 'tumble' && S.tum && S.tum.t > 0.6 && S.tum.t < S.tum.D) S.tum.t = S.tum.D; else if (S.paused) resumeGame(); }
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
  let toastT = 0;
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
    $('titleBest').innerHTML = save.bestH > 0 ? `BEST <b>${fmt(save.bestH)} m</b> &nbsp;·&nbsp; CHAIN <b>${save.bestChain}</b>` + (save.summits ? ` &nbsp;·&nbsp; SUMMITS <b>${save.summits}</b>` : `<br><span class="goal">Summit: <b>${fmt(SUMMIT_M)} m</b></span>`) : 'Hold left or right to steer · summit at <b>1,244 m</b>';
  }
  const fmt = (n) => Math.floor(n).toLocaleString('en-US');

  // ---------- run control ----------
  function newSeed() { return (Math.random() * 1e9) | 0; }
  function resetRunState() {
    S.parts.length = 0; S.pops.length = 0; S.trail.length = 0; S.rings.length = 0; S.haz.length = 0;
    S.hazCd = { crow: 8, cone: 7, gust: 16 }; S.hazGap = 3;
    S.wind.ax = 0; S.wind.dir = 0; S.wind.streaks.length = 0;
    S.shake = 0; S.freeze = 0; S.sqT = 9; S.hitFlash = 0; S.dizzy = 0;
    S.banner = null; S.callout = null; S.zoneShown = 0; S.nbShown = false; S.steerAcc = 0; S.runT = 0; S.tipT = 0;
    S.tum = null; S.camOverride = null; S.dazed = false; S.over = null; S.summited = false; S.zoneFlash = 0; S.chainMsg = null; S.lastTick = 9;
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
    S.mode = 'play'; S.paused = false; S.demo = false;
    S.bestAtStart = save.bestH; save.plays++; persist();
    sim.H = H; Tilt.recalibrate();
    show('title', false); show('over', false); show('pause', false);
    $('hudbtns').style.display = 'flex';
    Snd.zoneIdx = 0;                     // no banner at the trailhead: you can see you're in the parking lot
  }
  function toTitle() {
    S.mode = 'title'; S.paused = false; S.demo = true; S.daily = false; Snd.zoneIdx = 0;
    S.sim = sim = new Sim(newSeed(), H); resetRunState();
    show('pause', false); show('over', false); show('title', true); $('hudbtns').style.display = 'none';
    titleBest();
  }
  function pauseGame() { if (S.mode !== 'play' || S.paused) return; S.paused = true; ptrs.clear(); show('pause', true); Snd.suspend(); }
  function resumeGame() { if (!S.paused) return; S.paused = false; show('pause', false); Snd.resume(); Snd.click(); }
  function gameOver() {
    const h = Math.floor(sim.bestAlt), nb = h > save.bestH;
    S.over = { h, score: Math.floor(sim.score), chain: sim.maxChain, nb, nbChain: sim.maxChain > save.bestChain };
    if (nb) save.bestH = h; if (sim.maxChain > save.bestChain) save.bestChain = sim.maxChain; if (sim.score > save.bestScore) save.bestScore = Math.floor(sim.score);
    persist();
    $('ovH').textContent = fmt(h) + ' m'; $('ovS').textContent = fmt(sim.score); $('ovC').textContent = sim.maxChain ? String(sim.maxChain) : '–';
    const badge = S.summited && nb ? 'SUMMITED · NEW BEST!' : S.summited ? 'SUMMITED!' : nb ? 'NEW BEST HEIGHT!' : '';
    $('ovBadge').style.display = badge ? 'inline-block' : 'none'; $('ovBadge').textContent = badge;
    const short = SUMMIT_M - h;
    $('ovGoal').innerHTML = S.summited ? `Summit count: <b>${save.summits}</b>` : short <= 300 ? `Only <b>${fmt(short)} m</b> short of the summit!` : `Summit is <b>${fmt(short)} m</b> higher. Hop again!`;
    $('ovBest').innerHTML = `Best <b>${fmt(save.bestH)} m</b> · chain <b>${save.bestChain}</b> · score <b>${fmt(save.bestScore)}</b>`;
    if (S.daily) { const dnb = h > (save.dBest || 0); if (dnb) save.dBest = h; $('ovBest').innerHTML = `Daily Hike ${dayLabel(S.dayK)} · today's best <b>${fmt(save.dBest)} m</b> · streak <b>${save.dStreak}</b>`; }
    const fresh = HATS.filter(x => x.ok(save) && !save.hatsSeen.includes(x.id));
    fresh.forEach(x => save.hatsSeen.push(x.id));
    if (fresh.length) { save.hat = fresh[fresh.length - 1].id; applyHat(); }
    $('ovUnlock').style.display = fresh.length ? 'block' : 'none';
    $('ovUnlock').innerHTML = fresh.length ? `NEW HAT${fresh.length > 1 ? 'S' : ''}: <b>${fresh.map(x => x.name).join(', ')}</b><br><small>now wearing ${fresh[fresh.length - 1].name}</small>` : '';
    $('ovJoke').textContent = S.summited ? 'You stood on top of the Hump. Then you tumbled all the way back to the car. Worth it.' : 'Back at the parking lot with everyone else who underestimated the hike.';
    if (!fresh.length) { const nx = HATS.find(x => !x.ok(save)); $('ovNext').textContent = nx ? `Next hat: ${nx.need}` : 'Every hat unlocked. Legend.'; } else $('ovNext').textContent = '';
    persist();
    $('hudbtns').style.display = 'none'; $('ovRetry').textContent = S.daily ? 'DAILY AGAIN' : 'HOP AGAIN'; $('ovRetry').classList.toggle('dly', S.daily); $('ovRetry').title = S.daily ? 'Replays today\'s Daily Hike' : '';
    show('over', true); sfx('over');
  }

  // ---------- particles / popups ----------
  function part(o) { if (S.parts.length < 420) S.parts.push(Object.assign({ x: 0, y: 0, vx: 0, vy: 0, g: 0, age: 0, life: 0.6, size: 4, col: '#fff', kind: 'puff', rot: 0, vr: 0, grow: 0 }, o)); }
  function puffs(x, y, n, col, spread, up) {
    for (let i = 0; i < n; i++) part({ kind: 'puff', x: x + (Math.random() - .5) * 14, y: y - 1, vx: (Math.random() - .5) * (spread || 90), vy: -Math.random() * (up || 30), life: .45 + Math.random() * .3, size: 3 + Math.random() * 4, grow: 14, col });
  }
  function sparks(x, y, n, hue, speed, life) {
    for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = (speed || 160) * (0.4 + Math.random() * .8); part({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, g: 300, life: (life || .6) + Math.random() * .3, size: 2.5 + Math.random() * 2.5, col: `hsl(${hue + Math.random() * 40},95%,65%)` }); }
  }
  function bits(x, y, n, cols) { for (let i = 0; i < n; i++) part({ kind: 'bit', x: x + (Math.random() - .5) * 30, y, vx: (Math.random() - .5) * 120, vy: -Math.random() * 120, g: 900, life: .7 + Math.random() * .4, size: 2.5 + Math.random() * 3, col: cols[(Math.random() * cols.length) | 0], rot: Math.random() * 6, vr: (Math.random() - .5) * 14 }); }
  function pop(txt, x, y, o) { S.pops.push(Object.assign({ txt, x, y, age: 0, life: 1.0, size: 18, col: '#fff', vy: -50 }, o || {})); }
  function shake(a) { S.shake = Math.max(S.shake, a); }
  function showBanner(name, z) { S.banner = { name, z, age: 0, life: 2.6 }; }
  const CALL = { 1: 'COMBO!', 2: 'NICE!', 3: 'SKIPPING!', 4: 'SPRY!', 5: 'HUMP HOPPER!', 6: 'MOUNTAIN FEVER!', 7: 'UNSTOPPABLE!', 8: 'LEGEND OF THE HUMP!' };
  const comboCol = (n) => n >= 8 ? '#ff7ad9' : n >= 6 ? '#ff7a4a' : n >= 4 ? '#ffb13a' : '#ffe066';

  // ---------- sim events ----------
  function handleEvents() {
    const evs = sim.events.splice(0); const p = sim.p;
    for (const e of evs) {
      if (e.type === 'land') {
        const l = e.ledge; S.sqT = 0;
        const dcol = l.type === 'ice' ? '#dff6ff' : l.type === 'moss' ? '#7bb85a' : l.type === 'spring' ? '#6fcf8e' : l.type === 'branch' ? '#d8c7a8' : '#d5d3cc';
        puffs(p.x, l.y, e.spring ? 8 : 5, dcol, 110, 28);
        if (S.mode !== 'play') continue;
        if (e.spring) { sfx('spring'); shake(4); buzz(25); for (let i = 0; i < 10; i++) part({ kind: 'bit', x: p.x, y: l.y, vx: (Math.random() - .5) * 200, vy: -Math.random() * 260, g: 600, life: .8, size: 3, col: '#2f9a5f', rot: Math.random() * 6, vr: 8 }); pop('BOING!', p.x, p.y - 50, { col: '#8dffb0', size: 22 }); }
        else sfx('bounce', Math.min(1, Math.abs(p.vx) / 300));
        if (e.perfect) {
          sfx('perfect', e.chain); buzz(12); S.rings.push({ x: p.x, y: l.y, age: 0, gold: e.combo });
          pop(e.combo ? `PERFECT +${e.bonus + e.pbonus}` : `PERFECT +${e.pbonus}`, p.x, p.y - (e.combo ? 84 : 52), { col: '#ffffff', size: 17, life: 0.9, vy: -70 });
        }
        if (l.type === 'moss') { sfx('crumble'); bits(l.x, l.y, 8, ['#4f8f3e', '#74b857', '#7d8388']); }
        if (l.type === 'ice') { sfx('ice'); sparks(p.x, l.y, 5, 180, 90, .4); }
        if (e.combo) {
          sfx('combo', e.chain); buzz(e.chain >= 4 ? 30 : 15);
          const col = comboCol(e.chain);
          S.callout = { txt: CALL[e.chain] || `CHAIN ${e.chain}!`, age: 0, life: 1.1, col, n: e.chain };
          if (e.chain === 1 && save.plays <= 4) { S.callout.sub = 'you skipped a ledge at full speed!'; S.callout.life = 1.8; }
          pop(`+${e.bonus}`, p.x, p.y - 56, { col, size: 22 + Math.min(10, e.chain * 2), life: 1.1 });
          sparks(p.x, p.y - 20, 6 + e.chain * 2, e.chain * 40, 130 + e.chain * 12);
          if (e.chain >= 3) S.freeze = Math.max(S.freeze, 0.05);
          if (e.chain >= 5) shake(3 + Math.min(4, e.chain - 5));
          if (!save.tipCombo) { save.tipCombo = true; persist(); }
        } else buzz(6);
      } else if (e.type === 'chainEnd') {
        if (S.mode === 'play' && e.chain >= 2) { S.chainMsg = { txt: e.lost ? 'CHAIN BROKEN' : `CHAIN ×${e.chain} BANKED +${fmt(e.bank)}`, col: e.lost ? '#ff9a8a' : '#fff0b0', age: 0, life: 1.4 }; if (!e.lost) sfx('bank', e.chain); }
      } else if (e.type === 'updraft') { if (S.mode === 'play') { sfx('updraft'); pop('UPDRAFT!', p.x, p.y - 56, { col: '#bff0ff', size: 22 }); } }
      else if (e.type === 'fell') { if (S.mode === 'play') beginTumble(); }
    }
  }

  // ---------- hazards (always telegraphed) ----------
  function hazardsUpdate(dt) {
    if (S.mode !== 'play' || S.demo) return;
    const m = sim.bestAlt, d = clamp(m / 3000, 0, 1), zi = zoneAt(m);          // hazards keep ramping to 3,000 m
    S.hazGap -= dt;
    const cd = S.hazCd;
    for (const k in cd) cd[k] -= dt;
    const active = (k) => S.haz.some(h => h.k === k);
    const sy = clamp(sim.p.y - sim.camTop, 140, H - 200);
    if (S.hazGap <= 0) {
      if (m >= 110 && cd.crow <= 0 && !active('crow')) {
        const dir = S.hr() < .5 ? 1 : -1;
        S.haz.push({ k: 'crow', st: 'warn', t: 0, warn: 1.5, dir, sy: clamp(sy + (S.hr() * 150 - 90), 130, H - 210), x: 0, y: 0 });
        cd.crow = (7 + S.hr() * 6) * (1 - 0.35 * d); S.hazGap = 2; sfx('warn');
      } else if (m >= 250 && cd.cone <= 0 && !active('cone')) {
        S.haz.push({ k: 'cone', st: 'warn', t: 0, warn: 1.05, x: clamp(sim.p.x + (S.hr() * 220 - 110), 24, W - 24), y: 0, vy: 0, rot: 0 });
        cd.cone = (6 + S.hr() * 4) * (zi === 3 ? 0.7 : 1) * (1 - 0.3 * d); S.hazGap = 1.6; sfx('warn');
      } else if (m >= 520 && cd.gust <= 0 && !active('gust')) {
        S.haz.push({ k: 'gust', st: 'warn', t: 0, warn: 1.6, dir: S.hr() < .5 ? 1 : -1, dur: 2.6 + S.hr() });
        cd.gust = 14 + S.hr() * 8; S.hazGap = 2.5; sfx('warn');
      }
    }
    const p = sim.p, px = p.x, py = p.y - 18;
    let windAx = 0;
    for (let i = S.haz.length - 1; i >= 0; i--) {
      const h = S.haz[i]; h.t += dt;
      if (h.k === 'crow') {
        if (h.st === 'warn' && h.t >= h.warn) { h.st = 'live'; h.t = 0; h.x = h.dir > 0 ? -34 : W + 34; h.y = sim.camTop + h.sy; sfx('caw'); }
        if (h.st === 'live') {
          h.y = sim.camTop + h.sy;                                      // stays on the lane that was marked, even while the camera climbs
          h.x += h.dir * (250 + 70 * d) * dt;
          const dx = Math.abs(h.x - px), dy = Math.abs(h.y - py);
          if (dx < 19 && dy < 13 && hitPlayer(h.x, h.y)) { h.vy = -1; }          // tight hazard box, generous player
          if (h.x < -60 || h.x > W + 60) S.haz.splice(i, 1);
        }
      } else if (h.k === 'cone') {
        if (h.st === 'warn' && h.t >= h.warn) { h.st = 'live'; h.t = 0; h.y = sim.camTop - 24; h.vy = 120; }
        else if (h.st === 'live') {
          h.vy = Math.min(720, h.vy + 1100 * dt); h.y += h.vy * dt; h.rot += dt * 5;
          if (Math.abs(h.x - px) < 17 && Math.abs(h.y - py) < 20) { if (hitPlayer(h.x, h.y)) h.y = sim.camTop + H + 100; }
          if (h.y > sim.camTop + H + 40) S.haz.splice(i, 1);
        }
      } else if (h.k === 'gust') {
        if (h.st === 'warn' && h.t >= h.warn) { h.st = 'live'; h.t = 0; sfx('whoosh'); }
        else if (h.st === 'live') {
          const env = clamp(h.t / 0.35, 0, 1) * clamp((h.dur - h.t) / 0.5, 0, 1);
          windAx += h.dir * 520 * env; S.wind.dir = h.dir;
          if (h.t >= h.dur) S.haz.splice(i, 1);
        }
      }
    }
    S.wind.ax = windAx; sim.windAx = windAx;
  }
  function hitPlayer(x, y) {
    if (!sim.knock()) return false;
    S.dizzy = 0.9; S.freeze = 0.07; shake(8); S.hitFlash = 0.25; sfx('hit'); buzz(40);
    for (let i = 0; i < 10; i++) part({ kind: 'bit', x, y, vx: (Math.random() - .5) * 260, vy: -Math.random() * 200, g: 700, life: .8, size: 3, col: ['#23232e', '#ffd86a', '#ffffff'][i % 3], rot: Math.random() * 6, vr: 10 });
    pop('OUCH!', sim.p.x, sim.p.y - 56, { col: '#ff9a8a', size: 24 });
    return true;
  }

  // ---------- tumble (fall back to the parking lot) ----------
  function beginTumble() {
    S.mode = 'tumble'; S.banner = null; S.callout = null; $('hudbtns').style.display = 'none'; S.haz.length = 0; sim.windAx = 0; S.wind.ax = 0; ptrs.clear();
    const gcam = -(H - 235);
    S.tum = { t: 0, D: clamp(1.1 + Math.log10(1 + Math.max(0, sim.bestAlt)) * 0.25, 1.2, 1.9), from: sim.camTop, gcam, landed: false, spin: Math.random() < .5 ? 1 : -1, x: sim.p.x, hit: 0 };
    sfx('fall'); buzz(60);
  }
  function tumbleUpdate(dt) {
    const T = S.tum; T.t += dt;
    if (T.t < T.D) {
      const u = T.t / T.D, e = u * u * (3 - 2 * u);
      S.camOverride = lerp(T.from, T.gcam, e);
      if (Math.random() < .5) part({ kind: 'puff', x: T.x + (Math.random() - .5) * 30, y: S.camOverride + H * 0.3 + (Math.random() - .5) * 30, vx: 0, vy: -300, life: .4, size: 3, grow: 6, col: '#ffffff' });
    } else {
      S.camOverride = T.gcam;
      if (!T.landed) {
        T.landed = true; S.dazed = true; sfx('thud'); shake(10); buzz(50);
        puffs(W / 2, 0, 14, '#c9c6bf', 220, 40);
        for (let i = 0; i < 8; i++) part({ kind: 'spark', x: W / 2, y: -20, vx: (Math.random() - .5) * 200, vy: -Math.random() * 240, g: 500, life: .7, size: 3, col: '#ffe066' });
      }
      if (T.t > T.D + 0.55 && S.mode === 'tumble') { S.mode = 'over'; gameOver(); }
    }
  }

  // ---------- update ----------
  function update(dt) {
    S.t += dt; Snd.title = S.mode !== 'play'; Snd.intensity = S.mode === 'play' ? sim.chain : 0;
    S.sqT += dt; S.hitFlash = Math.max(0, S.hitFlash - dt); S.dizzy = Math.max(0, S.dizzy - dt); S.zoneFlash = Math.max(0, S.zoneFlash - dt); S.hatPop = Math.max(0, (S.hatPop || 0) - dt * 0.45);
    if (S.chainMsg) { S.chainMsg.age += dt; if (S.chainMsg.age > S.chainMsg.life) S.chainMsg = null; }
    S.shake = Math.max(0, S.shake - dt * 30);
    S.blinkT -= dt; if (S.blinkT < -0.12) S.blinkT = 2 + Math.random() * 3;
    if (S.mode === 'play' && !S.paused) {
      if (S.freeze > 0) S.freeze -= dt;
      else {
        S.runT += dt; if (!save.tipCombo && sim.bestAlt > 28) S.tipT += dt;
        const st = S.botOn ? botSteer(sim, { skip: 2, fast: true }) : steer();
        if (st !== 0) S.steerAcc += dt;
        sim.step(dt, st);
        hazardsUpdate(dt);
        handleEvents();
        zoneAndBest();
        trailUpdate(dt);
      }
    } else if (S.mode === 'title') {
      const st = botSteer(sim, { skip: 1 });
      sim.step(dt, st); sim.events.length = 0;
      if (!sim.alive) { S.sim = sim = new Sim(newSeed(), H); }
    } else if (S.mode === 'tumble') {
      tumbleUpdate(dt);
    }
    // always-on visual updates
    for (let i = S.parts.length - 1; i >= 0; i--) {
      const q = S.parts[i]; q.age += dt;
      if (q.age >= q.life) { S.parts.splice(i, 1); continue; }
      q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt; q.size += q.grow * dt;
      if (q.kind === 'amb') q.vx = Math.sin(S.t * 2 + q.rot) * 30 - 18;
    }
    for (let i = S.rings.length - 1; i >= 0; i--) { S.rings[i].age += dt; if (S.rings[i].age > 0.45) S.rings.splice(i, 1); }
    for (let i = S.pops.length - 1; i >= 0; i--) { const q = S.pops[i]; q.age += dt; q.y += q.vy * dt; q.vy *= 0.96; if (q.age > q.life) S.pops.splice(i, 1); }
    if (S.banner) { S.banner.age += dt; if (S.banner.age > S.banner.life) S.banner = null; }
    if (S.callout) { S.callout.age += dt; if (S.callout.age > S.callout.life) S.callout = null; }
    // wind streaks
    const gust = S.haz.find(h => h.k === 'gust');
    if (gust && gust.st === 'live' && S.mode === 'play') {
      while (S.wind.streaks.length < 22) S.wind.streaks.push({ x: gust.dir > 0 ? -60 : W + 60, y: Math.random() * H, len: 40 + Math.random() * 70, spd: 700 + Math.random() * 500, a: .35 + Math.random() * .4 });
    }
    for (let i = S.wind.streaks.length - 1; i >= 0; i--) {
      const s = S.wind.streaks[i]; s.x += (S.wind.dir || 1) * s.spd * dt;
      if (s.x < -140 || s.x > W + 140) { if (gust && gust.st === 'live') { s.x = S.wind.dir > 0 ? -80 : W + 80; s.y = Math.random() * H; } else S.wind.streaks.splice(i, 1); }
    }
    // ambient zone particles (leaves, flecks)
    if (!S.headless && (S.mode === 'play' || S.mode === 'title')) {
      S.lastAmb -= dt; if (S.lastAmb <= 0) {
        S.lastAmb = 0.35; const z = zoneAt(Math.max(0, -sim.camTop / PXM + 40));
        const cols = [null, ['#e0792a', '#c4401f', '#f0b43a'], ['#d9e27a', '#a8c960', '#f4f2d0'], ['#2f6e45'], ['#e8eef5'], ['#e8dcd2', '#ffffff'], ['#ffffff'], ['#bfc8ff', '#fff'], ['#7fffd0', '#c7b6ff']][z];
        if (cols) part({ kind: 'amb', x: W * (0.2 + Math.random() * 0.9), y: sim.camTop - 10, vx: -20, vy: 40 + Math.random() * 30, life: 8, size: 3 + Math.random() * 2, col: cols[(Math.random() * cols.length) | 0], rot: Math.random() * 6, vr: 2 });
      }
    }
  }
  function zoneAndBest() {
    const z = zoneAt(sim.bestAlt);
    if (z > S.zoneShown) {
      S.zoneShown = z; showBanner(ZONES[z].name, z); sfx('zone'); Snd.zoneIdx = z; S.zoneFlash = 0.35;
      for (let i = 0; i < 18; i++) part({ kind: 'spark', x: 40 + Math.random() * (W - 80), y: sim.camTop + insetTopW + 110 + Math.random() * 50, vx: (Math.random() - .5) * 120, vy: -40 - Math.random() * 80, g: 220, life: .9 + Math.random() * .4, size: 2.5 + Math.random() * 2, col: `hsl(${40 + Math.random() * 20},95%,${70 + Math.random() * 20}%)` });
    }
    if (!S.summited && sim.bestAlt >= SUMMIT_M) {
      S.summited = true; save.summits++; persist();
      S.callout = { txt: 'SUMMIT!', sub: '1,244 m — top of the Hump', age: 0, life: 2.2, col: '#ffe066', n: 6 };
      sfx('best'); shake(5); buzz(60); S.zoneFlash = 0.5; S.freeze = Math.max(S.freeze, 0.08);
      const cols = ['#d9382f', '#ffcf5a', '#3f9a5f', '#3d7fc4', '#ffffff'];
      for (let i = 0; i < 40; i++) part({ kind: 'bit', x: Math.random() * W, y: sim.camTop + Math.random() * 120, vx: (Math.random() - .5) * 80, vy: Math.random() * 60, g: 160, life: 1.6 + Math.random(), size: 4 + Math.random() * 3, col: cols[i % 5], rot: Math.random() * 6, vr: (Math.random() - .5) * 10 });
      sparks(sim.p.x, sim.p.y - 30, 30, 40, 260, 1);
    }
    if (!S.nbShown && S.bestAtStart >= 40 && sim.bestAlt > S.bestAtStart) {
      S.nbShown = true; sfx('best'); pop('NEW BEST!', sim.p.x, sim.p.y - 70, { col: '#ffe066', size: 28, life: 1.5 });
      sparks(sim.p.x, sim.p.y - 30, 24, 40, 220, .9);
    }
  }
  function comboSight(dt) {           // gold glint on ledges that would score a combo right now
    const p = sim.p, fast = Math.abs(p.vx) >= C.FASTVX && p.hit <= 0;
    const apexY = p.vy < 0 ? p.y - p.vy * p.vy / (2 * C.G) : p.y;
    const cand = [];                   // only ledges you can actually reach on this jump, nearest three
    if (fast) for (const l of sim.ledges) {
      if (l.state !== 'ok' || l.level - sim.lastLevel < 2 || l.level <= sim.maxLevel || l.y < apexY - 6) continue;
      const fallT = (-p.vy + Math.sqrt(Math.max(0, p.vy * p.vy + 2 * C.G * (l.y - p.y)))) / C.G, dx = Math.abs(World.wd(l.x, p.x));
      if (dx - l.w / 2 > C.VMAX * fallT * 0.9) continue;
      cand.push([dx, l]);
    }
    cand.sort((a, b) => a[0] - b[0]); const lit = new Set(cand.slice(0, 3).map(c => c[1]));
    for (const l of sim.ledges) { const on = lit.has(l); l.gl = (l.gl || 0) + ((on ? 1 : 0) - (l.gl || 0)) * Math.min(1, dt * (on ? 14 : 8)); }
    S.fastK = (S.fastK || 0) + ((fast ? 1 : 0) - (S.fastK || 0)) * Math.min(1, dt * 12);
  }
  function trailUpdate(dt) {
    comboSight(dt);
    if (sim.chain > 0) { const k = Math.ceil(sim.chainT / 0.2); if (sim.chainT < 0.6 && k < S.lastTick) { S.lastTick = k; sfx('tick', k); } if (sim.chainT >= 0.6) S.lastTick = 9; }
    const p = sim.p, hot = sim.chain >= 2 || Math.abs(p.vy) > 1000;
    if (hot) S.trail.push({ x: p.x, y: p.y - 20, a: 1 });
    for (let i = S.trail.length - 1; i >= 0; i--) { S.trail[i].a -= dt * 3.2; if (S.trail[i].a <= 0) S.trail.splice(i, 1); }
    if (sim.chain >= 4 && Math.random() < .5) part({ kind: 'spark', x: p.x + (Math.random() - .5) * 14, y: p.y - 20 + (Math.random() - .5) * 20, vx: (Math.random() - .5) * 30, vy: 20, g: 0, life: .5, size: 2.5, col: `hsl(${(S.t * 300) % 360},95%,70%)` });
  }

  // ---------- render ----------
  function outText(str, x, y, size, fill, stroke, align, font) {
    ctx.font = `${size}px ${font || '"Bevan", Georgia, serif'}`; ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, size * 0.2); ctx.strokeStyle = stroke || 'rgba(20,28,40,.85)'; ctx.strokeText(str, x, y);
    ctx.fillStyle = fill || '#fff'; ctx.fillText(str, x, y);
  }
  function render() {
    ctx.setTransform(scaleK, 0, 0, scaleK, 0, 0);
    const camTop = S.camOverride != null ? S.camOverride : sim.camTop;
    const sh = S.shake > 0 ? S.shake : 0, shx = sh ? (Math.random() - .5) * sh : 0, shy = sh ? (Math.random() - .5) * sh : 0;
    const altPx = -camTop, mCenter = Math.max(0, -(camTop + H * 0.5) / PXM);
    Art.background(ctx, { H, m: mCenter, altPx, t: S.t });
    Art.trunks(ctx, { m: mCenter, camTop, H });
    ctx.save(); ctx.translate(shx, -camTop + shy);
    const z = Art.zoneIdx(mCenter);
    // best-height marker
    const bestY = -(S.mode === 'play' ? S.bestAtStart : save.bestH) * PXM;
    if (bestY < -80 && bestY > camTop - 40 && bestY < camTop + H + 40 && S.mode === 'play') {
      ctx.save(); ctx.setLineDash([10, 8]); ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(255,240,170,.9)'; ctx.beginPath(); ctx.moveTo(0, bestY); ctx.lineTo(W, bestY); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,224,102,.95)'; Art.rr(ctx, W - 96, bestY - 20, 92, 20, 6); ctx.fill();
      outText(`BEST ${S.mode === 'play' ? S.bestAtStart : save.bestH} m`, W - 50, bestY - 5, 12, '#4a2a08', 'rgba(0,0,0,0)', 'center', '"Barlow Semi Condensed", sans-serif'); ctx.restore();
    }
    Art.ground(ctx, { H, camTop, t: S.t, dazed: S.dazed });
    for (const u of sim.updrafts) if (u.y + u.h / 2 > camTop && u.y - u.h / 2 < camTop + H) Art.updraft(ctx, u, S.t, camTop, H);
    if (S.mode !== 'tumble' && S.mode !== 'over') for (const l of sim.ledges) if (l.y > camTop - 60 && l.y < camTop + H + 60) { if (S.mode === 'title') ctx.globalAlpha = 0.4; Art.ledge(ctx, l, S.t, Art.zoneIdx(Math.max(0, -l.y / PXM))); ctx.globalAlpha = 1; if (l.gl > 0.02 && S.mode === 'play') drawGlint(l); }
    drawSummit(camTop);
    for (const q of S.parts) if (q.kind !== 'amb') drawPart(q);
    // trail ribbon
    if (S.trail.length > 1) {
      const col = sim.chain >= 6 ? `hsl(${(S.t * 400) % 360},95%,65%)` : sim.chain >= 4 ? '#ff9a3a' : '#ffe066';
      ctx.lineCap = 'round';
      for (let i = 1; i < S.trail.length; i++) {
        const a = S.trail[i - 1], b = S.trail[i]; if (Math.abs(a.x - b.x) > W / 2) continue;
        ctx.strokeStyle = col; ctx.globalAlpha = Math.max(0, b.a) * 0.55; ctx.lineWidth = 3 + 11 * b.a; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (S.mode === 'play') drawLandShadow();
    for (const r of S.rings) { const u = r.age / 0.45; ctx.save(); ctx.globalAlpha = 1 - u; ctx.strokeStyle = r.gold ? '#ffe066' : '#5aebff'; ctx.lineWidth = 3 * (1 - u) + 1; ctx.beginPath(); ctx.ellipse(r.x, r.y, 10 + u * 40, 3 + u * 9, 0, 0, TAU); ctx.stroke(); ctx.restore(); }
    drawClimber(camTop);
    for (const q of S.parts) if (q.kind === 'amb') drawPart(q);
    for (const h of S.haz) {
      if (h.k === 'crow' && h.st === 'live') Art.crow(ctx, h.x, h.y, h.dir, S.t + h.x * 0.01);
      if (h.k === 'cone' && h.st === 'live') Art.cone(ctx, h.x, h.y, h.rot);
    }
    ctx.restore();
    // ---- screen-space layers ----
    if (S.mode === 'play' || S.mode === 'title') Art.foreground(ctx, { camTop, H, m: mCenter });
    drawWarnings(camTop);
    if (S.wind.streaks.length) {
      ctx.lineCap = 'round'; const dir = S.wind.dir || 1;
      for (const s of S.wind.streaks) { ctx.strokeStyle = `rgba(255,255,255,${s.a})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - dir * s.len, s.y + 3); ctx.stroke(); }
    }
    if (S.mode === 'play' || S.mode === 'tumble' || S.mode === 'over') {
      const dg = clamp((sim.p.y - sim.camTop - H * 0.72) / (H * 0.2), 0, 1);       // gentle red edge when low on the screen
      if (S.mode === 'play' && dg > 0) { const g = ctx.createLinearGradient(0, H - 150, 0, H); g.addColorStop(0, 'rgba(217,56,47,0)'); g.addColorStop(1, `rgba(217,56,47,${0.45 * dg})`); ctx.fillStyle = g; ctx.fillRect(0, H - 150, W, 150); }
    }
    if (S.hitFlash > 0) { ctx.fillStyle = `rgba(255,80,60,${S.hitFlash * 1.2})`; ctx.fillRect(0, 0, W, H); }
    if (S.zoneFlash > 0) { ctx.fillStyle = `rgba(255,250,230,${S.zoneFlash * 0.7})`; ctx.fillRect(0, 0, W, H); }
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.78); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,10,25,.22)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    if (S.mode === 'play') drawHUD();
    drawPops(camTop);
    if (S.mode === 'play') { drawHints(); }
    drawBanner(); drawCallout();
    if (S.mode === 'title' && S.hatPop > 0) {          // hat preview: a big hiker pops up above the HAT button
      const u = S.hatPop, e = Math.min(1, (1 - u) * 6), k = 1.7 * (0.75 + 0.25 * e), x = W / 2, y = H - 92 - insetBotW;
      const lock = HATS.find(h => !h.ok(save));
      ctx.save(); ctx.globalAlpha = Math.min(1, u * 3);
      ctx.fillStyle = 'rgba(10,24,40,.82)'; Art.rr(ctx, x - 130, y - 92, 260, 112, 18); ctx.fill(); ctx.strokeStyle = 'rgba(255,248,232,.5)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.save(); ctx.translate(x - 76, y + 4); ctx.scale(k, k); Art.climber(ctx, { x: 0, y: 0, sx: 1, sy: 1, lean: 0, face: 1, pose: 0, t: S.t, blink: false }); ctx.restore();
      outText(hatById(save.hat).name.toUpperCase(), x + 30, y - 46, 20, '#ffe066', 'rgba(20,28,40,.9)', 'center');
      outText(lock ? 'Next hat:' : 'Every hat unlocked!', x + 30, y - 20, 14, '#cfe3da', 'rgba(0,0,0,0)', 'center', '"Barlow Semi Condensed", sans-serif');
      if (lock) outText(lock.need, x + 30, y - 2, 14, '#ffffff', 'rgba(0,0,0,0)', 'center', '"Barlow Semi Condensed", sans-serif');
      ctx.restore();
    }
  }
  function drawPart(q) {
    const u = q.age / q.life; ctx.save(); ctx.translate(q.x, q.y); ctx.globalAlpha = clamp(1 - u * u, 0, 1);
    if (q.kind === 'puff') { ctx.fillStyle = q.col; ctx.globalAlpha *= 0.6; ctx.beginPath(); ctx.arc(0, 0, q.size, 0, TAU); ctx.fill(); }
    else if (q.kind === 'spark') { ctx.fillStyle = q.col; ctx.rotate(q.age * 6); const s = q.size * (1 - u * .5); ctx.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? s * .4 : s * 1.6, a = i * Math.PI / 4; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill(); }
    else if (q.kind === 'bit') { ctx.rotate(q.rot); ctx.fillStyle = q.col; ctx.fillRect(-q.size / 2, -q.size / 2, q.size, q.size * .7); }
    else if (q.kind === 'amb') { ctx.rotate(q.rot + q.age * q.vr); ctx.fillStyle = q.col; ctx.globalAlpha *= 0.75; ctx.beginPath(); ctx.ellipse(0, 0, q.size, q.size * .5, 0, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  function drawGlint(l) {            // combo-eligible ledge: gold rim + a sparkle running along the top
    const pulse = 0.75 + 0.25 * Math.sin(S.t * 12 + l.id);
    ctx.save(); ctx.globalAlpha = l.gl * pulse;
    ctx.strokeStyle = 'rgba(110,50,0,.75)'; ctx.lineWidth = 6; Art.rr(ctx, l.x - l.w / 2 - 3, l.y - 4, l.w + 6, 11, 5.5); ctx.stroke();   // dark outer edge: reads on bright skies
    ctx.strokeStyle = 'rgba(255,190,40,.35)'; ctx.lineWidth = 12; Art.rr(ctx, l.x - l.w / 2 - 3, l.y - 4, l.w + 6, 11, 5.5); ctx.stroke();   // soft glow without shadowBlur
    ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 3.2; Art.rr(ctx, l.x - l.w / 2 - 3, l.y - 4, l.w + 6, 11, 5.5); ctx.stroke();
    ctx.shadowBlur = 0;
    const u = (S.t * 1.1 + l.id * 0.37) % 1, sx = l.x - l.w / 2 + 6 + u * (l.w - 12), r = 5 * Math.sin(u * Math.PI);
    ctx.fillStyle = '#fffbe6'; ctx.beginPath();
    for (let i = 0; i < 8; i++) { const rr2 = i % 2 ? r * .35 : r, a = i * Math.PI / 4; ctx.lineTo(sx + Math.cos(a) * rr2, l.y - 4 + Math.sin(a) * rr2); }
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
  function drawSummit(camTop) {      // bunting across the screen at the real summit height, plus a trail sign
    const y = -SUMMIT_M * PXM; if (y < camTop - 90 || y > camTop + H + 40) return;
    const segs = 4, sw = W / segs, sag = 16, cols = ['#d9382f', '#ffcf5a', '#3f9a5f', '#3d7fc4', '#f7efe0'];
    ctx.save(); ctx.strokeStyle = 'rgba(55,38,24,.9)'; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i < segs; i++) { ctx.moveTo(i * sw, y); ctx.quadraticCurveTo(i * sw + sw / 2, y + sag * 2, i * sw + sw, y); }
    ctx.stroke(); let k = 0;
    for (let i = 0; i < segs; i++) for (let j = 1; j <= 6; j++) {
      const u = j / 7, x = i * sw + u * sw, yy = y + 4 * sag * u * (1 - u) * 1, fl = Math.sin(S.t * 5 + k) * 2;
      ctx.fillStyle = cols[k++ % 5]; ctx.beginPath(); ctx.moveTo(x - 6, yy); ctx.lineTo(x + 6, yy); ctx.lineTo(x + fl, yy + 15); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(40,25,15,.5)'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.fillStyle = '#7a5232'; Art.rr(ctx, 8, y - 36, 120, 28, 6); ctx.fill(); ctx.strokeStyle = '#3d2615'; ctx.lineWidth = 2; ctx.stroke();
    outText(S.summited ? 'SUMMIT  ✓' : 'SUMMIT 1,244 m', 68, y - 16, 14, '#fbe9bf', 'rgba(0,0,0,0)', 'center', '"Barlow Semi Condensed", sans-serif');
    ctx.restore();
  }
  function drawLandShadow() {          // a soft shadow on the ledge you'll land on: helps aim the drop
    const p = sim.p; let best = null;
    for (const l of sim.ledges) { if (l.state !== 'ok' || l.y < p.y - 1 || l.y > p.y + 300) continue; if (Math.abs(World.wd(p.x, l.x)) > l.w / 2 + C.LEDGE_SLACK) continue; if (!best || l.y < best.y) best = l; }
    if (!best) return;
    const d = clamp((best.y - p.y) / 300, 0, 1), a = 0.34 * (1 - d) + 0.06, rx = 13 - 5 * d;
    const perf = Math.abs(World.wd(p.x, best.x)) <= best.w * C.PERFECT;
    ctx.save(); ctx.fillStyle = perf ? `rgba(90,235,255,${a + 0.35})` : `rgba(20,25,35,${a})`; ctx.beginPath(); ctx.ellipse(p.x, best.y + 1.5, rx, 3.2, 0, 0, TAU); ctx.fill(); ctx.restore();
  }
  function drawSpeed(p) {            // speed lines behind the climber when fast enough to combo
    const k = S.fastK || 0; if (k < 0.05) return;
    const dir = p.vx > 0 ? 1 : -1;
    ctx.save(); ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const ph = (S.t * 7 + i * 0.37) % 1, yy = p.y - 10 - i * 11, x0 = p.x - dir * (18 + ph * 12), len = 11 + 10 * (1 - ph);
      ctx.globalAlpha = 0.85 * k * (1 - ph); ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x0 - dir * len, yy);
      ctx.strokeStyle = 'rgba(30,50,80,.55)'; ctx.lineWidth = 4.6; ctx.stroke(); ctx.strokeStyle = '#ffe9a0'; ctx.lineWidth = 2.4; ctx.stroke();
    }
    ctx.restore();
  }
  function drawClimber(camTop) {
    const p = sim.p;
    if (S.mode === 'tumble' && S.tum) {
      const T = S.tum, u = clamp(T.t / T.D, 0, 1), cam = S.camOverride;
      const e = u * u * (3 - 2 * u), wy = lerp(T.from + H * 0.4, -2, e), x = T.x + Math.sin(T.t * 5) * 40 * (1 - u);
      if (T.t < T.D) {
        ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        for (let i = 0; i < 9; i++) { const sx = Art.hash(i + 3) * W, sy = cam + ((Art.hash(i) * H - T.t * 1400) % H + H) % H, len = 50 + 70 * Art.hash(i + 9); ctx.globalAlpha = 0.25 + 0.4 * Art.hash(i + 5); ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy - len * (1 - u * 0.6)); ctx.stroke(); }
        ctx.restore();
        Art.climber(ctx, { x, y: wy, sx: 1, sy: 1, lean: 0, face: T.spin, pose: 1, t: S.t, dizzy: true, blink: false }); }
      else { const r = T.t - T.D; Art.climber(ctx, { x: W / 2 + 8, y: 0, sx: 1.1, sy: 0.9, lean: r < .25 ? 1.45 : 0.12 * Math.sin(S.t * 3), face: 1, pose: 0, t: S.t, dizzy: true }); }
      return;
    }
    if (S.mode === 'over') { Art.climber(ctx, { x: W / 2 + 8, y: 0, sx: 1.05, sy: 0.95, lean: 0.12 * Math.sin(S.t * 3), face: 1, pose: 0, t: S.t, dizzy: true }); return; }
    if (sim.p.hit > 0 && Math.floor(S.t * 18) % 2 === 0) return;
    const sq = S.sqT < 0.12 ? 1 - S.sqT / 0.12 : 0;
    let sx = 1 + 0.32 * sq, sy = 1 - 0.3 * sq;
    if (!sq) { const st = clamp(Math.abs(p.vy) / 1000, 0, 1) * (p.vy < 0 ? 0.22 : 0.12); sy = 1 + st; sx = 1 - st * 0.6; }
    if (S.mode === 'play') drawSpeed(p);
    const o = { x: p.x, y: p.y, sx, sy, lean: clamp(p.vx / C.VMAX, -1, 1) * 0.2, face: p.face, pose: sq > 0 ? 0 : p.vy < -60 ? -1 : p.vy > 120 ? 1 : 0, t: S.t, blink: S.blinkT < 0, dizzy: S.dizzy > 0 };
    Art.climber(ctx, o);
    if (p.x < 26) Art.climber(ctx, Object.assign({}, o, { x: p.x + W })); else if (p.x > W - 26) Art.climber(ctx, Object.assign({}, o, { x: p.x - W }));
  }
  function drawWarnings(camTop) {
    const pulse = 0.6 + 0.4 * Math.sin(S.t * 18);
    for (const h of S.haz) {
      if (h.st !== 'warn') continue;
      if (h.k === 'crow') {
        const y = h.sy, side = h.dir > 0 ? 18 : W - 18, a = clamp(h.t / 0.2, 0, 1);
        ctx.save(); ctx.globalAlpha = a; ctx.setLineDash([10, 8]); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); ctx.strokeStyle = `rgba(217,56,47,${0.7 + 0.25 * pulse})`; ctx.lineWidth = 3.5; ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = `rgba(217,56,47,${0.7 + 0.3 * pulse})`; ctx.beginPath(); ctx.moveTo(side, y - 16); ctx.lineTo(side + 15, y + 11); ctx.lineTo(side - 15, y + 11); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); outText('!', side, y + 8, 17, '#fff', 'rgba(0,0,0,0)', 'center');
        ctx.globalAlpha = a * 0.55; Art.crow(ctx, h.dir > 0 ? -2 + h.t * 14 : W + 2 - h.t * 14, y, h.dir, S.t); ctx.restore();
      } else if (h.k === 'cone') {
        const x = h.x, y0 = insetTopW + 104, sx = Math.sin(h.t * 40) * 3 * Math.min(1, h.t * 2);
        ctx.save(); ctx.setLineDash([4, 7]); ctx.strokeStyle = `rgba(255,214,120,${0.3 + 0.3 * pulse})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y0 + 16); ctx.lineTo(x, H * 0.82); ctx.stroke(); ctx.setLineDash([]);
        Art.cone(ctx, x + sx, y0, 0); outText('!', x, y0 + 38, 18, '#ffd878', 'rgba(60,30,0,.9)', 'center'); ctx.restore();
      } else if (h.k === 'gust') {
        const dir = h.dir, a = clamp(h.t / 0.25, 0, 1) * (0.55 + 0.35 * pulse);
        ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        for (let i = 0; i < 6; i++) { const y = 110 + i * ((H - 240) / 5), x = (dir > 0 ? 16 : W - 16) + dir * (((S.t * 70 + i * 17) % 40)); ctx.beginPath(); ctx.moveTo(x - dir * 22, y); ctx.lineTo(x, y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x - dir * 6, y - 7); ctx.lineTo(x, y); ctx.lineTo(x - dir * 6, y + 7); ctx.stroke(); }
        ctx.restore();
        outText('WIND ' + (dir > 0 ? '→' : '←'), W / 2, insetTopW + 150, 22, '#fff', 'rgba(30,60,90,.9)', 'center');
      }
    }
  }
  function drawHUD() {
    const top = insetTopW + 12, alt = Math.max(0, Math.floor(sim.bestAlt));
    outText(fmt(alt), 14, top + 32, 38);
    ctx.font = '38px "Bevan", serif'; const wdt = ctx.measureText(fmt(alt)).width;
    outText('m', 14 + wdt + 4, top + 32, 18);
    outText(fmt(sim.score) + ' pts', 15, top + 52, 15, '#fff6d8', 'rgba(20,28,40,.85)', 'left', '"Barlow Semi Condensed", sans-serif');
    let ly = top + 72; const sm = H < 700 ? 15 : 13;
    const quiet = S.steerAcc < 0.9 && (S.runT < 14 || sim.maxLevel < 1);        // first seconds: just height + points while the steering hint shows
    if (!quiet && S.bestAtStart > 0) { outText('BEST ' + fmt(Math.max(save.bestH, S.bestAtStart)) + ' m', 15, ly, sm, 'rgba(255,240,190,.95)', 'rgba(20,28,40,.8)', 'left', '"Barlow Semi Condensed", sans-serif'); ly += 17; }
    const a = sim.bestAlt, zi = zoneAt(a); let nm = null, at = 0;          // the next milestone: zone, summit, or your best
    const SHORT = ['Trailhead', 'Hardwood', 'Birches', 'Spruce-Fir', 'Treeline', 'Bare Rock', 'The Clouds', 'Night Sky', 'Aurora'];   // short names keep the line clear of the chain meter
    if (zi + 1 < ZONES.length) { nm = SHORT[zi + 1]; at = ZONES[zi + 1].at; }
    if (!S.summited && SUMMIT_M > a && (!nm || SUMMIT_M < at)) { nm = 'Summit'; at = SUMMIT_M; }
    if (!nm && S.bestAtStart > a) { nm = 'Your best'; at = S.bestAtStart; }
    if (nm && !quiet) outText(`▲ ${nm.toUpperCase()} · ${Math.ceil(at - a)} m`, 15, ly, sm, nm === 'Summit' ? '#ffe066' : '#c9f2dc', 'rgba(20,28,40,.8)', 'left', '"Barlow Semi Condensed", sans-serif');
    if (S.daily) outText('DAILY HIKE · ' + dayLabel(S.dayK), W - 10, top + 62, 12, '#ffe7a8', 'rgba(20,28,40,.85)', 'right', '"Barlow Semi Condensed", sans-serif');
    if (S.chainMsg) { const m = S.chainMsg, u = m.age / m.life; ctx.save(); ctx.globalAlpha = clamp((1 - u) * 3, 0, 1); outText(m.txt, W - 10, top + 84 - u * 8, 16, m.col, 'rgba(20,28,40,.9)', 'right', '"Barlow Semi Condensed", sans-serif'); ctx.restore(); }
    if (sim.chain > 0) {
      const dur = World.chainDur(sim.chain), f = clamp(sim.chainT / dur, 0, 1), col = comboCol(sim.chain);
      const late = sim.chainT < 0.6, cx = W / 2 + 6 + (late ? Math.sin(S.t * 60) * 2.5 : 0), cy = top + 40, k = 1 + 0.12 * Math.sin(S.t * 14) * (f < .3 ? 1 : 0);
      ctx.save(); ctx.translate(cx, cy); ctx.scale(k, k);
      outText('×' + (sim.chain + 1), 0, 0, 34 + Math.min(14, sim.chain * 2), col, 'rgba(60,20,0,.9)', 'center');
      ctx.restore();
      outText(`CHAIN ${sim.chain}`, cx + 50, cy + 19, 13, '#fff6d8', 'rgba(20,28,40,.85)', 'left', '"Barlow Semi Condensed", sans-serif');
      ctx.fillStyle = 'rgba(20,28,40,.6)'; Art.rr(ctx, cx - 44, cy + 10, 88, 9, 4.5); ctx.fill();
      ctx.fillStyle = f < .3 ? '#ff6a5a' : col; Art.rr(ctx, cx - 43, cy + 11, 86 * f, 7, 3.5); ctx.fill();
    }
  }
  function drawPops(camTop) {
    for (const q of S.pops) {
      const u = q.age / q.life, sc = u < .15 ? 0.6 + (u / .15) * 0.5 : 1.1 - (u - .15) * .1;
      const sy = q.y - camTop; ctx.save(); ctx.globalAlpha = clamp(1.4 - u * 1.4, 0, 1); ctx.translate(clamp(q.x, 50, W - 50), sy); ctx.scale(sc, sc);
      outText(q.txt, 0, 0, q.size, q.col, 'rgba(20,28,40,.9)', 'center'); ctx.restore();
    }
  }
  function drawBanner() {
    const b = S.banner; if (!b) return;
    const u = b.age / b.life, slide = u < .12 ? u / .12 : u > .85 ? (1 - u) / .15 : 1, e = slide * slide * (3 - 2 * slide);
    const y = insetTopW + 152 - (1 - e) * 22;                 // drops in place (never sweeps across the HUD numbers)
    ctx.save(); ctx.globalAlpha = e; ctx.translate(W / 2, y); ctx.scale(0.86 + 0.14 * e, 0.86 + 0.14 * e);
    const g = ctx.createLinearGradient(0, -24, 0, 24); g.addColorStop(0, '#8a5c36'); g.addColorStop(1, '#5e3b20');
    ctx.fillStyle = g; Art.rr(ctx, -150, -26, 300, 52, 10); ctx.fill(); ctx.strokeStyle = '#2e1c0e'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#2e1c0e'; for (const sx of [-138, 138]) { ctx.beginPath(); ctx.arc(sx, 0, 3.2, 0, TAU); ctx.fill(); }
    outText(b.name.toUpperCase(), 0, 4, 19, '#fbe9bf', 'rgba(40,20,5,.9)', 'center');
    outText(ZONES[b.z].at + ' m', 0, 19, 12, '#ffd98a', 'rgba(0,0,0,0)', 'center', '"Barlow Semi Condensed", sans-serif');
    ctx.restore();
  }
  function drawCallout() {
    const c = S.callout; if (!c) return;
    const u = c.age / c.life, s = u < .18 ? 0.4 + (u / .18) * 0.85 + Math.sin(u / .18 * Math.PI) * .25 : 1.25 - (u - .18) * .25;
    const fs = 30 + Math.min(14, c.n * 2); ctx.font = `${fs}px "Bevan", Georgia, serif`;
    const fit = Math.min(1, (W - 30) / (ctx.measureText(c.txt).width * 1.3));        // never clip at the screen edges
    const a = clamp((1 - u) * 2.2, 0, 1), cy = insetTopW + (S.banner ? 236 : H * 0.21) - u * 18;                 // above the climber's usual band
    ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, cy); ctx.scale(s * fit, s * fit); ctx.rotate(-0.05);
    outText(c.txt, 0, 0, fs, c.col, 'rgba(50,15,0,.92)', 'center'); ctx.restore();
    if (c.sub) { ctx.save(); ctx.globalAlpha = a * clamp(c.age * 5 - 0.5, 0, 1); outText(c.sub, W / 2, cy + 30, 18, '#ffffff', 'rgba(20,28,40,.9)', 'center', '"Barlow Semi Condensed", sans-serif'); ctx.restore(); }
  }
  function drawHints() {
    if (S.steerAcc < 0.9 && (S.runT < 14 || sim.maxLevel < 1)) {
      const a = 0.55 + 0.25 * Math.sin(S.t * 4);
      ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(0, H * 0.74, W / 2 - 3, H * 0.24); ctx.fillRect(W / 2 + 3, H * 0.74, W / 2 - 3, H * 0.24);
      ctx.globalAlpha = Math.min(1, a + .2);
      outText('◀', W * 0.25, H * 0.84, 46, '#fff', 'rgba(20,50,80,.9)', 'center', 'sans-serif'); outText('▶', W * 0.75, H * 0.84, 46, '#fff', 'rgba(20,50,80,.9)', 'center', 'sans-serif');
      outText('HOLD A SIDE TO STEER', W / 2, H * 0.91, 17, '#fff', 'rgba(20,50,80,.9)', 'center', '"Barlow Semi Condensed", sans-serif');
      // ghost finger
      const gx = W * (0.25 + 0.5 * (Math.floor(S.t / 1.6) % 2)), gy = H * 0.93 + Math.sin(S.t * 6) * 4;
      const ph = (S.t % 1.6) / 1.6, rip = clamp(ph * 3, 0, 1);
      ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - rip)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(gx, gy - 4, 14 + rip * 26, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#ffe2c4'; ctx.strokeStyle = 'rgba(40,30,25,.8)'; ctx.lineWidth = 2;
      Art.rr(ctx, gx - 11, gy - 14, 22, 52, 11); ctx.fill(); ctx.stroke();                      // fingertip pressing down
      ctx.fillStyle = 'rgba(255,255,255,.75)'; Art.rr(ctx, gx - 6, gy - 10, 12, 10, 5); ctx.fill();   // nail
      ctx.restore();
    } else if (!save.tipCombo && sim.bestAlt > 28 && S.tipT < 6) {
      ctx.save(); ctx.globalAlpha = clamp(Math.min(S.tipT * 3, (6 - S.tipT) * 2), 0, 1);
      const y = H - 150 - insetBotW; ctx.fillStyle = 'rgba(25,45,40,.78)'; Art.rr(ctx, 24, y - 22, W - 48, 50, 14); ctx.fill();
      outText('Skip a ledge while moving fast', W / 2, y - 2, 17, '#fff', 'rgba(0,0,0,0)', 'center', '"Barlow Semi Condensed", sans-serif');
      outText('to start a COMBO chain!', W / 2, y + 17, 17, '#ffe066', 'rgba(0,0,0,0)', 'center', '"Barlow Semi Condensed", sans-serif'); ctx.restore();
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
    const lock = HATS.find(h => !h.ok(save));
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
    state() { const p = sim.p; return { mode: S.mode, paused: S.paused, alt: +(-p.y / PXM).toFixed(1), best: +sim.bestAlt.toFixed(1), x: +p.x.toFixed(1), y: +p.y.toFixed(1), vx: +p.vx.toFixed(1), vy: +p.vy.toFixed(1), chain: sim.chain, maxChain: sim.maxChain, mult: sim.mult, score: Math.floor(sim.score), alive: sim.alive, level: sim.lastLevel, camTop: +sim.camTop.toFixed(1), H, haz: S.haz.map(h => h.k + ':' + h.st), landings: sim.landings, hit: +p.hit.toFixed(2) }; },
    sim() { return sim; }, ptrs() { return ptrs.size; },
    setSteer(v) { S.fakeSteer = v; }, bot(on) { S.botOn = !!on; },
    warp(m) { sim.warp(m); S.zoneShown = zoneAt(m); if (m >= SUMMIT_M) S.summited = true; S.bestAtStart = Math.max(S.bestAtStart, 0); return this.state(); },
    spawn(kind) {
      if (kind === 'crow') S.haz.push({ k: 'crow', st: 'warn', t: 0, warn: 1.5, dir: 1, sy: clamp(sim.p.y - sim.camTop, 140, H - 200), x: 0, y: 0 });
      if (kind === 'cone') S.haz.push({ k: 'cone', st: 'warn', t: 0, warn: 1.05, x: sim.p.x, y: 0, vy: 0, rot: 0 });
      if (kind === 'gust') S.haz.push({ k: 'gust', st: 'warn', t: 0, warn: 1.6, dir: -1, dur: 3 });
    },
    noAutoPause(v) { S.noAutoPause = !!v; }, headless(v) { S.headless = !!v; },
    layout() { return { H, cssScale, insetTopW, dpr }; },
    toTitle, pause: pauseGame, resume: resumeGame, save,
    fall() { sim.p.y = sim.camTop + H + 100; },
  };

  // ---------- scripted scenes for screenshots: index.html#shot=title|play|combo|zone|hazard|over ----------
  function runShot(name) {
    S.noAutoPause = true;
    const st = document.createElement('style'); st.textContent = '.screen.show,.btn.big,.hop span{animation:none!important}'; document.head.appendChild(st);   // screenshots: no half-faded frames
    const T = window.__T;
    if (name === 'title') return;
    startRun(11); S.bestAtStart = 60;
    if (name === 'zone') { T.warp(860); T.step(500); S.banner = null; showBanner(ZONES[5].name, 5); S.banner.age = 0.5; T.step(100); return; }
    if (name === 'hazard') { T.warp(540); S.zoneShown = 3; S.banner = null; S.steerAcc = 5; T.step(400); T.spawn('crow'); T.spawn('cone'); T.step(700); return; }
    if (name === 'play') { T.step(200); return; }
    if (name === 'summit') { T.warp(1236); S.zoneShown = 6; S.banner = null; S.steerAcc = 5; T.step(500); if (S.callout) S.callout.age = 0.35; T.step(17); return; }
    if (name === 'sight') { S.steerAcc = 5; S.banner = null; S.fakeSteer = 1; T.step(450); return; }
    S.botOn = true; S.steerAcc = 5; S.banner = null;
    let n = 0; while (n++ < 3000 && sim.chain < (name === 'combo' ? 3 : 1)) T.step(17);
    if (name === 'combo') { T.step(60); return; }
    S.botOn = false; T.fall(); T.step(3700);
  }

  // ---------- boot ----------
  layout(true);
  if (save.tilt) { /* needs a fresh user gesture on iOS; show as off until tapped */ save.tilt = false; persist(); }
  applyHat(); refreshSnd(); refreshTilt(); titleBest(); show('title', true);
  requestAnimationFrame((ts) => { last = ts; frame(ts); });
  { const m = /shot=(\w+)/.exec(location.hash); if (m) setTimeout(() => runShot(m[1]), 400); }
  if (document.fonts && document.fonts.load) { document.fonts.load('20px Bevan'); document.fonts.load('700 16px "Barlow Semi Condensed"'); }
})();
