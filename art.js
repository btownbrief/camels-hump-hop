/* Camel's Hump Hop — code-drawn art with PNG drop-in slots (ASSETS). Set a key's `src` to use a painted image. */
(function () {
  'use strict';
  const W = 360, TAU = Math.PI * 2;
  const ZN = [0, 60, 220, 420, 650, 900, 1200, 1550, 2200];

  // Every key has a code-drawn fallback. To use painted art later: set src: 'assets/<file>.png'.
  const ASSETS = {
    logo: { src: null }, climber: { src: null }, crow: { src: null },
    ledge_rock: { src: null }, ledge_moss: { src: null }, ledge_ice: { src: null },
    ledge_moving: { src: null }, ledge_spring: { src: null },
    bg_lot: { src: null }, bg_hardwood: { src: null }, bg_birch: { src: null }, bg_spruce: { src: null },
    bg_treeline: { src: null }, bg_summit: { src: null }, bg_clouds: { src: null }, bg_night: { src: null }, bg_aurora: { src: null },
  };
  const BG_KEYS = ['bg_lot', 'bg_hardwood', 'bg_birch', 'bg_spruce', 'bg_treeline', 'bg_summit', 'bg_clouds', 'bg_night', 'bg_aurora'];
  Object.keys(ASSETS).forEach(k => { const a = ASSETS[k]; if (a.src) { a.img = new Image(); a.img.onload = () => { a.ready = true; }; a.img.src = a.src; } });
  const asset = (k) => { const a = ASSETS[k]; return a && a.ready ? a.img : null; };

  // ---------- helpers ----------
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const hash = (n) => { n = Math.sin(n * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };
  const hex = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const rgb = (c, a) => a == null || a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const shade = (c, k) => [clamp(c[0] * k, 0, 255), clamp(c[1] * k, 0, 255), clamp(c[2] * k, 0, 255)];
  function rr(c, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  // ---------- zone palettes ----------
  const P = [
    { top: '#7ec8f4', bot: '#eaf7ff', far: '#8fb2cf', mid: '#6f97b4', near: '#4d7f57', trunk: 0, cloud: .35, star: 0, haze: '#ffffff' },
    { top: '#f4a85c', bot: '#ffe6bd', far: '#c0907c', mid: '#ad6244', near: '#c4541f', trunk: .55, cloud: .3, star: 0, haze: '#ffe2b0' },
    { top: '#aedcc4', bot: '#f4fbe8', far: '#9ab8a8', mid: '#7fa38c', near: '#6c9a62', trunk: .6, cloud: .25, star: 0, haze: '#f4ffe6' },
    { top: '#2c5a82', bot: '#86bccb', far: '#3d6578', mid: '#2c5163', near: '#1d4a40', trunk: .55, cloud: .25, star: 0, haze: '#a7d3dd' },
    { top: '#5a7aa6', bot: '#c5d6e6', far: '#7790ac', mid: '#66798f', near: '#55654f', trunk: .15, cloud: .4, star: 0, haze: '#dfe9f3' },
    { top: '#cf98a2', bot: '#ffe3c9', far: '#9a8f98', mid: '#7e7478', near: '#6a625f', trunk: 0, cloud: .4, star: 0, haze: '#ffe9d6' },
    { top: '#4ea2f2', bot: '#f3fbff', far: '#c5dcf4', mid: '#e5f0fb', near: '#ffffff', trunk: 0, cloud: 1, star: 0, haze: '#ffffff' },
    { top: '#050824', bot: '#2a2d6c', far: '#1b2050', mid: '#151a40', near: '#0e1230', trunk: 0, cloud: .4, star: 1, haze: '#5a5fc0' },
    { top: '#020a14', bot: '#0d3a3c', far: '#0f2a33', mid: '#0b2129', near: '#081820', trunk: 0, cloud: .15, star: 1, haze: '#3fd6a0' },
  ].map(p => ({ top: hex(p.top), bot: hex(p.bot), far: hex(p.far), mid: hex(p.mid), near: hex(p.near), trunk: p.trunk, cloud: p.cloud, star: p.star, haze: hex(p.haze) }));

  function zoneIdx(m) { let z = 0; for (let i = 0; i < ZN.length; i++) if (m >= ZN[i]) z = i; return z; }
  const _pal = { top: [0, 0, 0], bot: [0, 0, 0], far: [0, 0, 0], mid: [0, 0, 0], near: [0, 0, 0], haze: [0, 0, 0], trunk: 0, cloud: 0, star: 0, z: 0, style: 0 };
  function palette(m) {
    const z = zoneIdx(m), n = Math.min(z + 1, P.length - 1);
    const t = z === n ? 0 : sstep((m - (ZN[n] - 60)) / 90);
    const a = P[z], b = P[n];
    for (const k of ['top', 'bot', 'far', 'mid', 'near', 'haze']) _pal[k] = mix(a[k], b[k], t);
    for (const k of ['trunk', 'cloud', 'star']) _pal[k] = lerp(a[k], b[k], t);
    _pal.z = z; _pal.style = t > 0.5 ? n : z;
    return _pal;
  }

  // ---------- background: a two-stop sky, one low-contrast far ridge, at most two faint clouds. Nothing else on the field. ----------
  function ridge(c, baseY, amp, seed, color, hero, H) {
    c.beginPath(); c.moveTo(-10, H + 10);
    for (let x = -10; x <= W + 10; x += 10) {
      let h = (Math.sin(x * 0.018 + seed) * 0.5 + Math.sin(x * 0.043 + seed * 2.3) * 0.3 + Math.sin(x * 0.095 + seed * 0.7) * 0.2) * 0.5 + 0.5;
      h *= amp;
      if (hero) {                                   // the Camel's Hump: one big hump and a shoulder
        const hump = Math.exp(-Math.pow((x - 238) / 54, 2)), sh = Math.exp(-Math.pow((x - 108) / 46, 2)) * 0.62;
        h = h * 0.35 + amp * 1.05 * Math.max(hump, sh, 0.18);
      }
      c.lineTo(x, baseY - h);
    }
    c.lineTo(W + 10, H + 10); c.closePath(); c.fillStyle = color; c.fill();
  }
  function cloud(c, x, y, s, col, a) {
    c.fillStyle = rgb(col, a);
    c.beginPath(); c.arc(x, y, 24 * s, 0, TAU); c.arc(x + 26 * s, y + 6 * s, 19 * s, 0, TAU); c.arc(x - 26 * s, y + 8 * s, 17 * s, 0, TAU); c.arc(x + 8 * s, y - 12 * s, 19 * s, 0, TAU);
    c.rect(x - 40 * s, y + 8 * s, 82 * s, 16 * s); c.fill();
  }
  function background(c, o) {
    const H = o.H, m = o.m, alt = o.altPx, pal = palette(m), t = o.t;
    const bgImg = asset(BG_KEYS[pal.style]);
    if (bgImg) { c.drawImage(bgImg, 0, 0, W, H); return; }
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, rgb(pal.top)); g.addColorStop(1, rgb(pal.bot)); c.fillStyle = g; c.fillRect(0, 0, W, H);
    if (m > 2140) {                                  // aurora: two soft drifting glows, top third only, no hard edges
      const ak = clamp((m - 2140) / 90, 0, 1); c.save(); c.globalCompositeOperation = 'lighter';
      for (let b = 0; b < 2; b++) {
        const cols = [[63, 214, 160], [120, 90, 230]][b], cx = W * (0.3 + 0.4 * b) + Math.sin(t * 0.15 + b * 2) * 60, cy = H * 0.12;
        c.save(); c.translate(cx, cy); c.scale(2.4, 1);
        const gg = c.createRadialGradient(0, 0, 0, 0, 0, H * 0.18);
        gg.addColorStop(0, rgb(cols, 0.22 * ak)); gg.addColorStop(1, rgb(cols, 0));
        c.fillStyle = gg; c.fillRect(-H * 0.18, -H * 0.18, H * 0.36, H * 0.36); c.restore();
      }
      c.restore();
    }
    if (pal.star > 0.01) {                          // faint, still stars: part of the sky, not things to look at
      c.fillStyle = '#fff';
      for (let i = 0; i < 40; i++) {
        const x = hash(i) * W, y = ((hash(i + 50) * H * 1.4 + alt * 0.03 * (0.5 + hash(i + 9))) % (H + 20));
        c.globalAlpha = pal.star * (0.18 + 0.22 * hash(i + 3));
        const s = 0.8 + hash(i + 7) * 0.9; c.fillRect(x, y, s, s);
      }
      c.globalAlpha = 1;
    }
    // at most two faint clouds, drifting past slowly
    const cl = pal.cloud;
    if (cl > 0.02) {
      const span = 520, sh = alt * 0.12, base = sh % span, idx0 = Math.floor(sh / span), ccol = pal.star > 0.5 ? mix(pal.bot, [150, 160, 230], 0.4) : mix(pal.bot, [255, 255, 255], 0.6);
      let n = 0;
      for (let j = -1; j * span - base < H + 60 && n < 2; j++) {
        const id = j - idx0, y = j * span + base + hash(id) * 120, x = hash(id + 9) * (W + 60) - 30;
        if (y < -60 || y > H + 60) continue;
        cloud(c, x, y, 1.1, ccol, Math.min(0.32, cl * 0.32)); n++;
      }
    }
    // one far ridge, close to the sky colour, sinking as you climb
    const mAlpha = clamp(1 - (m - 760) / 160, 0, 1);
    if (mAlpha > 0.01) {
      const baseFar = H * 0.86 + alt * 0.06;
      if (baseFar - 200 < H) { c.globalAlpha = mAlpha; ridge(c, baseFar, 170, 1.7, rgb(mix(pal.bot, pal.far, 0.42)), true, H); c.globalAlpha = 1; }
    }
  }
  // the weather line: a soft band of mist along the bottom edge once it starts creeping
  function weather(c, o) {
    const pal = palette(o.m), H = o.H, k = o.k, h = 36 + 14 * (o.low || 0);
    if (k <= 0.01) return;
    const col = pal.star > 0.5 ? pal.haze : mix(pal.haze, pal.top, 0.38);          // light skies: tint it so the mist still reads
    const g = c.createLinearGradient(0, H - h, 0, H);
    g.addColorStop(0, rgb(col, 0)); g.addColorStop(0.55, rgb(col, 0.45 * k)); g.addColorStop(1, rgb(col, 0.85 * k));
    c.fillStyle = g; c.fillRect(0, H - h, W, h);
  }
  // HUD band: a zone-coloured scrim so ledges dim as they slide under the height readout and buttons
  function scrim(c, o) {
    const pal = palette(o.m), y1 = o.top + 96;
    const g = c.createLinearGradient(0, 0, 0, y1);
    g.addColorStop(0, rgb(pal.top, 0.96)); g.addColorStop(Math.max(0.01, (y1 - 40) / y1), rgb(pal.top, 0.7)); g.addColorStop(1, rgb(pal.top, 0));
    c.fillStyle = g; c.fillRect(0, 0, W, y1);
  }

  // ---------- parking-lot start scene (world y = 0 is the top of the curb) ----------
  function ground(c, o) {
    const H = o.H, top = o.camTop, bot = top + H + 8; if (bot < -60) return;
    c.save(); c.translate(0, -6);                     // asphalt top sits at y = 2, so feet that land beside the curb touch the ground
    // asphalt
    const y0 = 8, g = c.createLinearGradient(0, y0, 0, y0 + 160); g.addColorStop(0, '#4a4f58'); g.addColorStop(1, '#2d3138');
    c.fillStyle = g; c.fillRect(-10, y0, W + 20, Math.max(bot - y0 + 20, 0));
    c.fillStyle = '#6a707a'; c.fillRect(-10, y0, W + 20, 3);
    // painted stripes
    c.fillStyle = '#e9d86a';
    for (let i = 0; i < 7; i++) { c.save(); c.translate(24 + i * 54, y0 + 28); c.transform(1, 0, -0.35, 1, 0, 0); c.fillRect(-2, 0, 4, 70); c.restore(); }
    // grass strip + trailhead sign (right) + wagon (left)
    c.fillStyle = '#3f7a45'; c.fillRect(-10, y0 - 3, 40, 6);
    // trailhead sign
    c.fillStyle = '#5a3c26'; c.fillRect(296, -78, 6, 86); c.fillRect(334, -78, 6, 86);
    c.fillStyle = '#7a5232'; rr(c, 286, -96, 64, 42, 5); c.fill(); c.strokeStyle = '#3d2615'; c.lineWidth = 2; c.stroke();
    c.fillStyle = '#f3e3b8'; c.font = '700 10px "Barlow Semi Condensed", sans-serif'; c.textAlign = 'center'; c.fillText('THE HUMP', 318, -77); c.fillText('↑  SUMMIT', 318, -63); c.textAlign = 'start';
    // station wagon
    const wx = 14, wy = 8;
    c.fillStyle = '#2f6f5f'; rr(c, wx, wy - 30, 112, 26, 7); c.fill();
    c.fillStyle = '#3a8470'; rr(c, wx + 22, wy - 48, 66, 22, 8); c.fill();
    c.fillStyle = '#bfe3ef'; rr(c, wx + 28, wy - 44, 24, 14, 3); c.fill(); rr(c, wx + 56, wy - 44, 26, 14, 3); c.fill();
    c.fillStyle = '#25382f'; c.fillRect(wx + 20, wy - 52, 70, 3);
    c.fillStyle = '#1a1d22'; c.beginPath(); c.arc(wx + 24, wy - 4, 10, 0, TAU); c.arc(wx + 90, wy - 4, 10, 0, TAU); c.fill();
    c.fillStyle = '#9aa1ab'; c.beginPath(); c.arc(wx + 24, wy - 4, 4, 0, TAU); c.arc(wx + 90, wy - 4, 4, 0, TAU); c.fill();
    // everyone else who underestimated the hike
    hiker(c, 170, 8, '#e0723a', -1, o.t, o.dazed, 0);
    hiker(c, 232, 8, '#4b8f7b', 1, o.t, o.dazed, 1);
    hiker(c, 150, 8, '#7a62c9', 1, o.t, o.dazed, 2);
    c.restore();
  }
  function hiker(c, x, y, hat, face, t, dazed, k) {              // a tiny seated hiker, catching their breath
    c.save(); c.translate(x, y); c.scale(face, 1);
    c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(0, 0, 13, 3, 0, 0, TAU); c.fill();
    c.fillStyle = '#c96a2c'; rr(c, -12, -22, 10, 18, 4); c.fill();             // pack
    c.fillStyle = '#3a6f8c'; rr(c, -4, -20, 14, 16, 5); c.fill();               // body
    c.fillStyle = '#35384a'; rr(c, 4, -8, 16, 6, 3); c.fill();                  // legs out
    c.fillStyle = '#6b4a2e'; rr(c, 16, -9, 7, 8, 3); c.fill();                  // boot
    const hy = -27 + Math.sin(t * 2 + k) * 0.6;
    c.fillStyle = '#f0c7a0'; c.beginPath(); c.arc(4, hy, 7, 0, TAU); c.fill();
    c.fillStyle = hat; c.beginPath(); c.arc(4, hy - 2, 7.4, Math.PI, TAU); c.fill(); c.fillRect(-3.4, hy - 3, 14.8, 3);
    c.fillStyle = '#fff'; c.beginPath(); c.arc(4, hy - 10, 2.2, 0, TAU); c.fill();
    c.fillStyle = '#2b2b2b'; c.fillRect(7, hy - 1, 1.8, 2.4);
    if (dazed) { c.strokeStyle = '#ffd86a'; c.lineWidth = 1.5; for (let i = 0; i < 3; i++) { const a = t * 4 + i * 2.1 + k; c.beginPath(); c.arc(4 + Math.cos(a) * 9, hy - 14 + Math.sin(a) * 2.5, 1.4, 0, TAU); c.stroke(); } }
    c.restore();
  }

  // ---------- ledges: one silhouette family, behaviour shown by colour only. Cached sprites per type + width. ----------
  const SK = 2, cache = {};
  const LEDGE_W = { start: 170, rock: 76, branch: 86, ice: 76, moving: 70, moss: 66, spring: 62 };
  const LOOK = {
    rock: ['#c3c7cc', '#868c94'], branch: ['#c3c7cc', '#868c94'], moving: ['#c3c7cc', '#868c94'],
    moss: ['#86c264', '#3f7f37'], ice: ['#eefaff', '#93cde6'], spring: ['#a58cec', '#6a4fc0'],      // spring: violet, a colour nothing else on the field uses
  };
  const LH = 12, OUTL = 'rgba(16,22,32,.92)';
  function slab(c, w, top, bot) {
    const g = c.createLinearGradient(0, 0, 0, LH); g.addColorStop(0, top); g.addColorStop(1, bot);
    rr(c, -w / 2, 0, w, LH, 5); c.fillStyle = g; c.fill(); c.lineWidth = 2; c.strokeStyle = OUTL; c.stroke();
    c.fillStyle = 'rgba(255,255,255,.5)'; rr(c, -w / 2 + 5, 2, w - 10, 2.2, 1.1); c.fill();
  }
  function drawLedge(c, type, w) {
    if (type === 'start') {                                     // painted concrete wheel-stop on the trailhead lot
      slab(c, w, '#c3c7cc', '#868c94');
      c.save(); rr(c, -w / 2, 0, w, LH, 5); c.clip(); c.fillStyle = '#e9c93a'; for (let x = -w / 2; x < w / 2; x += 18) { c.beginPath(); c.moveTo(x, 4); c.lineTo(x + 9, 4); c.lineTo(x + 3, 12); c.lineTo(x - 6, 12); c.fill(); } c.restore();
      return;
    }
    const L = LOOK[type] || LOOK.rock;
    slab(c, w, L[0], L[1]);
    if (type === 'moss') {                                      // a visible crack: this one breaks
      c.strokeStyle = 'rgba(20,40,18,.9)'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-2, 0.5); c.lineTo(2, 4); c.lineTo(-3, 7.5); c.lineTo(1, 11.5); c.stroke();
    } else if (type === 'moving') {                             // yellow end caps: this one slides
      c.fillStyle = '#f2c84b'; c.save(); rr(c, -w / 2, 0, w, LH, 5); c.clip(); c.fillRect(-w / 2, 0, 7, LH); c.fillRect(w / 2 - 7, 0, 7, LH); c.restore();
      rr(c, -w / 2, 0, w, LH, 5); c.lineWidth = 2; c.strokeStyle = OUTL; c.stroke();
    } else if (type === 'spring') {                             // springy bough: light up-chevrons
      c.strokeStyle = 'rgba(246,240,255,.95)'; c.lineWidth = 1.8; c.lineJoin = 'round';
      for (const x of [-w * 0.25, 0, w * 0.25]) { c.beginPath(); c.moveTo(x - 4, 9); c.lineTo(x, 5); c.lineTo(x + 4, 9); c.stroke(); }
    }
  }
  function ledgeSprite(type, w) {
    w = Math.round(w); const key = type + '|' + w; if (cache[key]) return cache[key];
    const padX = 4, up = 4, down = 6, cw = (w + padX * 2) * SK, ch = (LH + up + down) * SK;
    const cv = document.createElement('canvas'); cv.width = Math.ceil(cw); cv.height = Math.ceil(ch);
    const c = cv.getContext('2d'); c.scale(SK, SK); c.translate(w / 2 + padX, up);
    drawLedge(c, type, w);
    return (cache[key] = { cv, ox: w / 2 + padX, oy: up, w: cw / SK, h: ch / SK });
  }
  function ledge(c, l, t, fade) {           // fade: 0..1, so ledges vanish before they slide under the HUD band
    const w = l.type === 'start' ? LEDGE_W.start : l.w, spr = ledgeSprite(l.type, w);
    const a = asset('ledge_' + (l.type === 'start' ? 'rock' : l.type === 'branch' ? 'rock' : l.type));
    let wob = l.wob, sy = 1, dy = 0, rot = 0, alpha = 1, shake = 0;
    if (wob > 0) { dy = Math.sin((1 - wob) * 18) * wob * 3; if (l.type === 'spring') sy = 1 - Math.sin((1 - wob) * 14) * wob * 0.25; }
    if (l.state === 'crumble') shake = Math.sin(t * 90) * 1.8;
    if (l.state === 'fall') { rot = (l.id % 2 ? 1 : -1) * Math.min(1, l.vy / 600); alpha = clamp(1 - (l.vy / 900), 0.2, 1); }
    if (fade != null) { alpha *= fade; if (alpha <= 0.01) return; }
    c.save(); c.globalAlpha = alpha; c.translate(l.x + shake, l.y + dy); if (rot) c.rotate(rot); if (sy !== 1) c.scale(1, sy);
    if (a) c.drawImage(a, -w / 2 - 4, -4, w + 8, LH + 10); else c.drawImage(spr.cv, -spr.ox, -spr.oy, spr.w, spr.h);
    c.restore();
  }

  // ---------- the climber: a small hiker, big pack, bobble hat (colours from Art.hat, set by the game) ----------
  const HAT0 = { c: '#d9382f', b: '#f7efe0', p: '#ffffff' };
  function climber(c, o) {
    // o: x,y(feet),sx,sy,lean,face,pose(-1 rising,0 land,1 falling),t,flash,dizzy
    const a = asset('climber');
    c.save(); c.translate(o.x, o.y); c.rotate(o.lean || 0); c.scale(o.sx * o.face, o.sy);
    if (a) { c.drawImage(a, -24, -52, 48, 56); c.restore(); return; }
    const t = o.t, rise = o.pose < 0, fall = o.pose > 0;
    const legSwing = rise ? 0.0 : fall ? Math.sin(t * 14) * 0.25 : 0;
    // shadow-ish outline stroke helper
    const OUT = '#2b1d14';
    c.lineJoin = 'round'; c.lineCap = 'round';
    // legs
    c.strokeStyle = OUT; c.lineWidth = 7.4;
    const kneeUp = rise ? 5 : 0;
    c.beginPath(); c.moveTo(-3.5, -12); c.lineTo(-4 + legSwing * 6, -3 - kneeUp * 0.4); c.moveTo(4, -12); c.lineTo(5 - legSwing * 6, -3 - kneeUp); c.stroke();
    c.strokeStyle = '#3b4a77'; c.lineWidth = 4.6;
    c.beginPath(); c.moveTo(-3.5, -12); c.lineTo(-4 + legSwing * 6, -3 - kneeUp * 0.4); c.moveTo(4, -12); c.lineTo(5 - legSwing * 6, -3 - kneeUp); c.stroke();
    // boots
    c.fillStyle = '#6b4226'; c.strokeStyle = OUT; c.lineWidth = 1.5;
    rr(c, -8 + legSwing * 6, -5 - kneeUp * 0.4, 9, 5.5, 2.5); c.fill(); c.stroke(); rr(c, 1 - legSwing * 6, -5 - kneeUp, 10, 5.5, 2.5); c.fill(); c.stroke();
    // backpack (behind: negative x, since the hiker faces +x)
    const g = c.createLinearGradient(-20, -34, -6, -10); g.addColorStop(0, '#f08a3c'); g.addColorStop(1, '#c4561f');
    c.fillStyle = g; c.strokeStyle = OUT; c.lineWidth = 1.8; rr(c, -19, -37, 15, 27, 6); c.fill(); c.stroke();
    c.fillStyle = '#e1b14a'; rr(c, -19, -41, 15, 7, 3.5); c.fill(); c.stroke();              // bedroll on top
    c.fillStyle = '#8a3a14'; c.fillRect(-17, -27, 11, 2.2); c.fillRect(-17, -20, 11, 2.2);
    c.fillStyle = 'rgba(255,255,255,.35)'; rr(c, -17, -36, 3, 18, 1.5); c.fill();
    // torso (jacket)
    const jg = c.createLinearGradient(0, -32, 0, -12); jg.addColorStop(0, '#3fb0a3'); jg.addColorStop(1, '#25766d');
    c.fillStyle = jg; c.strokeStyle = OUT; c.lineWidth = 1.8; rr(c, -6, -33, 14, 22, 5.5); c.fill(); c.stroke();
    c.fillStyle = '#e9f5ef'; c.fillRect(-5, -24, 12, 2);
    // arms
    c.strokeStyle = OUT; c.lineWidth = 6; c.beginPath();
    const ah = rise ? -9 : fall ? -2 : -14, ax = rise ? 9 : fall ? 11 : 6;
    c.moveTo(2, -29); c.lineTo(ax, ah - 14 + (rise ? 0 : 6)); c.stroke();
    c.strokeStyle = '#3fb0a3'; c.lineWidth = 3.6; c.beginPath(); c.moveTo(2, -29); c.lineTo(ax, ah - 14 + (rise ? 0 : 6)); c.stroke();
    c.fillStyle = '#f2c9a2'; c.beginPath(); c.arc(ax, ah - 14 + (rise ? 0 : 6), 2.6, 0, TAU); c.fill();
    // head
    c.fillStyle = '#f2c9a2'; c.strokeStyle = OUT; c.lineWidth = 1.8; c.beginPath(); c.arc(3, -39, 8.4, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = '#e3a98f'; c.beginPath(); c.arc(8.4, -37, 1.9, 0, TAU); c.fill();           // cheek
    c.fillStyle = '#23201f';
    if (o.dizzy) { c.strokeStyle = '#23201f'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(5, -42); c.lineTo(8.5, -39); c.moveTo(8.5, -42); c.lineTo(5, -39); c.stroke(); }
    else if (o.blink) c.fillRect(5.6, -40, 3.2, 1.2); else { c.beginPath(); c.ellipse(7, -40.3, 1.4, 2, 0, 0, TAU); c.fill(); c.fillStyle = '#fff'; c.fillRect(7.1, -41.6, .8, .8); }
    c.strokeStyle = '#7a3a2a'; c.lineWidth = 1.3; c.beginPath(); if (fall) c.arc(8, -34.6, 1.6, 0, TAU); else c.arc(7.2, -35.4, 2, 0.15, Math.PI - 0.2); c.stroke();
    // bobble hat
    const HT = Art.hat || HAT0;
    c.fillStyle = HT.c; c.strokeStyle = OUT; c.lineWidth = 1.8;
    c.beginPath(); c.arc(3, -41, 8.9, Math.PI * 1.02, TAU * 1.0); c.lineTo(12, -43); c.lineTo(-6, -43); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = HT.b; rr(c, -6.4, -44.6, 18.8, 4.8, 2.2); c.fill(); c.stroke();
    c.fillStyle = HT.c; for (let i = 0; i < 4; i++) c.fillRect(-4 + i * 4.6, -44, 1.4, 3.6);
    if (HT.star) { c.fillStyle = HT.p; c.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 1.2 : 3, a = -Math.PI / 2 + i * Math.PI / 5; c.lineTo(3 + Math.cos(a) * r, -48 + Math.sin(a) * r); } c.closePath(); c.fill(); }
    const bx = -5 + Math.sin(t * 9) * (rise ? 1.5 : 3) - (rise ? 0 : 0), by = -52 + (fall ? -2 : 0);
    c.strokeStyle = OUT; c.lineWidth = 1; c.fillStyle = HT.p; c.beginPath(); c.arc(bx, by, 4.2, 0, TAU); c.fill(); c.stroke();
    c.restore();
  }

  // ---------- hazards ----------
  function crow(c, x, y, dir, t, pale) {
    const a = asset('crow');
    c.save(); c.translate(x, y); c.scale(dir, 1);
    if (a) { c.drawImage(a, -22, -16, 44, 32); c.restore(); return; }
    const flap = Math.sin(t * 16), OUT = pale ? '#e9eef7' : '#0d0d12';
    if (pale) c.lineWidth = 2;
    c.fillStyle = '#23232e'; c.strokeStyle = OUT; c.lineWidth = pale ? 2 : 1.5;
    c.beginPath(); c.ellipse(0, 0, 14, 8, 0, 0, TAU); c.fill(); c.stroke();                   // body
    c.beginPath(); c.moveTo(-12, -1); c.lineTo(-24, -5 + flap * 2); c.lineTo(-22, 4); c.closePath(); c.fill(); c.stroke();    // tail
    c.beginPath(); c.arc(12, -4, 6, 0, TAU); c.fill(); c.stroke();                            // head
    c.fillStyle = '#e8b23a'; c.beginPath(); c.moveTo(17, -5); c.lineTo(25, -2); c.lineTo(17, -1); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(13.5, -5.4, 1.7, 0, TAU); c.fill(); c.fillStyle = '#000'; c.beginPath(); c.arc(14, -5.4, .8, 0, TAU); c.fill();
    c.fillStyle = '#2f2f3d'; c.beginPath(); c.moveTo(-4, -2); c.quadraticCurveTo(-2, -22 * flap - 4, 10, -26 * flap - 2); c.quadraticCurveTo(6, -2, 4, 0); c.closePath(); c.fill(); c.stroke();   // wing
    c.restore();
  }
  window.Art = { W, ASSETS, palette, zoneIdx, background, weather, scrim, ground, ledge, climber, crow, hiker, hash, lerp, clamp, sstep, rr, rgb, mix, ledgeSprite };
})();
