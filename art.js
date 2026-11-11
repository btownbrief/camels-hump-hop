/* Camel's Hump Hop — code-drawn art with PNG drop-in slots (ASSETS). Set a key's `src` to use a painted image. */
(function () {
  'use strict';
  const W = 360, TAU = Math.PI * 2;
  const ZN = [0, 60, 220, 420, 650, 900, 1200, 1550, 2200];

  // Every key has a code-drawn fallback. To use painted art later: set src: 'assets/<file>.png'.
  const ASSETS = {
    logo: { src: null }, climber: { src: null }, crow: { src: null }, cone: { src: null },
    ledge_rock: { src: null }, ledge_branch: { src: null }, ledge_moss: { src: null }, ledge_ice: { src: null },
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

  // ---------- background ----------
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
  function treeRow(c, baseY, style, color, off, H, size) {
    c.fillStyle = color;
    for (let i = -1; i < 14; i++) {
      const x = i * 29 + hash(i + off) * 14, h = size * (0.7 + hash(i * 3.3 + off) * 0.6);
      if (style === 1 || style === 2) {             // round-topped hardwood / birch
        c.beginPath(); c.arc(x, baseY - h * 0.7, h * 0.5, 0, TAU); c.arc(x - h * 0.25, baseY - h * 0.45, h * 0.38, 0, TAU); c.arc(x + h * 0.28, baseY - h * 0.45, h * 0.38, 0, TAU); c.fill();
        c.fillRect(x - 2, baseY - h * 0.4, 4, h * 0.4 + 40);
      } else if (style === 0 || style >= 6) {       // low shrubs
        c.beginPath(); c.arc(x, baseY - 4, h * 0.3, 0, TAU); c.fill(); c.fillRect(x - h * 0.3, baseY - 4, h * 0.6, 60);
      } else {                                       // spruce triangles
        c.beginPath(); c.moveTo(x - h * 0.28, baseY); c.lineTo(x, baseY - h * 1.1); c.lineTo(x + h * 0.28, baseY); c.closePath(); c.fill(); c.fillRect(x - h * 0.28, baseY, h * 0.56, 70);
      }
    }
  }
  function cloud(c, x, y, s, col, a) {
    c.fillStyle = rgb(col, a);
    c.beginPath(); c.arc(x, y, 24 * s, 0, TAU); c.arc(x + 26 * s, y + 6 * s, 19 * s, 0, TAU); c.arc(x - 26 * s, y + 8 * s, 17 * s, 0, TAU); c.arc(x + 8 * s, y - 12 * s, 19 * s, 0, TAU);
    c.rect(x - 40 * s, y + 8 * s, 82 * s, 16 * s); c.fill();
  }
  function background(c, o) {
    const H = o.H, m = o.m, alt = o.altPx, pal = palette(m), t = o.t;
    const bgImg = asset(BG_KEYS[pal.style]);
    if (bgImg) { c.drawImage(bgImg, 0, 0, W, H); } else {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, rgb(pal.top)); g.addColorStop(1, rgb(pal.bot)); c.fillStyle = g; c.fillRect(0, 0, W, H);
    }
    if (m > 2140) {                                  // aurora ribbons fade in around 2,200 m
      const ak = clamp((m - 2140) / 90, 0, 1); c.save(); c.globalCompositeOperation = 'lighter';
      for (let b = 0; b < 3; b++) {
        const base = 90 + b * 70, cols = [[63, 214, 160], [120, 90, 230], [80, 200, 255]][b], g = c.createLinearGradient(0, base - 60, 0, base + 120);
        g.addColorStop(0, rgb(cols, 0)); g.addColorStop(0.35, rgb(cols, 0.42 * ak)); g.addColorStop(1, rgb(cols, 0));
        c.fillStyle = g; c.beginPath(); c.moveTo(-10, base + 140);
        for (let x = -10; x <= W + 10; x += 12) c.lineTo(x, base + Math.sin(x * 0.012 + t * 0.4 + b * 2) * 26 + Math.sin(x * 0.031 - t * 0.7 + b) * 10);
        for (let x = W + 10; x >= -10; x -= 12) c.lineTo(x, base + 120 + Math.sin(x * 0.01 + t * 0.3 + b) * 20);
        c.closePath(); c.fill();
      }
      c.restore();
    }
    if (pal.star > 0.01) {                          // stars + moon
      c.fillStyle = '#fff';
      for (let i = 0; i < 60; i++) {
        const x = hash(i) * W, y = ((hash(i + 50) * H * 1.4 + alt * 0.04 * (0.5 + hash(i + 9))) % (H + 20));
        c.globalAlpha = pal.star * (0.35 + 0.65 * Math.abs(Math.sin(t * (0.8 + hash(i + 3)) + i)));
        const s = 0.8 + hash(i + 7) * 1.4; c.fillRect(x, y, s, s);
      }
      c.globalAlpha = pal.star; const mx = 282, my = 118 + alt * 0.01 % 40;
      c.fillStyle = '#fff6d8'; c.beginPath(); c.arc(mx, my, 24, 0, TAU); c.fill();
      c.fillStyle = rgb(pal.top); c.beginPath(); c.arc(mx + 9, my - 5, 21, 0, TAU); c.fill(); c.globalAlpha = 1;
    } else if (pal.cloud < 0.9) {                   // sun glow in the day zones
      const sg = c.createRadialGradient(80, 110, 6, 80, 110, 150); sg.addColorStop(0, rgb(pal.haze, 0.8)); sg.addColorStop(1, rgb(pal.haze, 0)); c.fillStyle = sg; c.fillRect(0, 0, W, 300);
      // slow sun rays fanning down from the glow
      c.save(); c.translate(80, 110); c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) {
        const a = 0.35 + i * 0.32 + Math.sin(t * 0.15 + i * 1.7) * 0.06, w = 0.05 + hash(i + 40) * 0.05, len = H * 1.25;
        const rg = c.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len); rg.addColorStop(0, rgb(pal.haze, 0.07 * (1 - pal.cloud * 0.5))); rg.addColorStop(1, rgb(pal.haze, 0));
        c.fillStyle = rg; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a - w) * len, Math.sin(a - w) * len); c.lineTo(Math.cos(a + w) * len, Math.sin(a + w) * len); c.closePath(); c.fill();
      }
      c.restore();
    }
    // wispy / puffy clouds at three depths, tiling vertically
    const cl = pal.cloud;
    for (let L = 0; L < 3; L++) {
      const pk = [0.1, 0.22, 0.42][L], sc = [0.6, 0.95, 1.4][L], span = [300, 420, 560][L], a = (cl * [0.5, 0.7, 0.9][L]);
      if (a < 0.02) continue;
      const sh = alt * pk, base = sh % span, idx0 = Math.floor(sh / span);
      for (let j = -1; j * span - base < H + 60; j++) {
        const id = j - idx0 + L * 31, y = j * span + base + hash(id) * 80, x = hash(id + 9) * (W + 60) - 30;
        cloud(c, x, y, sc, pal.star > 0.5 ? mix(pal.bot, [140, 150, 230], 0.5) : mix(pal.haze, [255, 255, 255], 0.5), a);
      }
    }
    // parallax mountains + tree line sink as you climb
    const mAlpha = clamp(1 - (m - 880) / 120, 0, 1) * (pal.star > 0.5 ? 1 - pal.star * 0.5 : 1);
    if (mAlpha > 0.01) {
      c.globalAlpha = mAlpha;
      const baseFar = H * 0.72 + alt * 0.045, baseMid = H * 0.8 + alt * 0.09, baseNear = H * 0.9 + alt * 0.17;
      if (baseFar - 260 < H) ridge(c, baseFar, 170, 1.7, rgb(pal.far), true, H);
      if (baseMid - 200 < H) ridge(c, baseMid, 150, 4.1, rgb(pal.mid), false, H);
      if (baseNear - 120 < H) treeRow(c, baseNear, pal.style, rgb(pal.near), 5, H, 70);
      c.globalAlpha = 1;
    }
    // haze at the bottom for depth
    const hz = c.createLinearGradient(0, H * 0.6, 0, H); hz.addColorStop(0, rgb(pal.haze, 0)); hz.addColorStop(1, rgb(pal.haze, pal.star > 0.5 ? 0.1 : 0.28)); c.fillStyle = hz; c.fillRect(0, H * 0.6, W, H * 0.4);
  }

  // world-fixed tree trunks along the climb (forest zones)
  const TRX = [12, 52, 120, 205, 262, 318, 350];
  function trunks(c, o) {
    const pal = palette(o.m), tr = pal.trunk; if (tr < 0.02) return;
    const st = pal.style, H = o.H;
    for (let i = 0; i < TRX.length; i++) {
      const far = i % 2 === 0, pf = far ? 0.8 : 1, w = (far ? 9 : 15) + hash(i) * 5, x = TRX[i] + hash(i + 4) * 8;
      const scroll = o.camTop * pf, a = tr * (far ? 0.45 : 0.62);
      const base = st === 2 ? [236, 232, 220] : st === 3 ? [58, 44, 36] : st === 4 ? [78, 66, 56] : [92, 62, 42];
      const g = c.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
      g.addColorStop(0, rgb(shade(base, 0.7), a)); g.addColorStop(0.4, rgb(shade(base, 1.1), a)); g.addColorStop(1, rgb(shade(base, 0.6), a));
      c.fillStyle = g; c.fillRect(x - w / 2, 0, w, H);
      const k0 = Math.floor(scroll / 64);
      for (let k = k0; k < k0 + H / 64 + 2; k++) {
        const y = k * 64 - scroll + hash(k * 7 + i) * 40, hh = hash(k + i * 3);
        if (st === 2) { c.fillStyle = `rgba(30,30,30,${a * 0.85})`; c.fillRect(x - w / 2, y, w * (0.4 + hh * 0.5), 3 + hh * 3); }
        else if (st === 3 || st === 4) { c.fillStyle = rgb(shade(base, 0.5), a); c.fillRect(x - w / 2 - 6, y, w + 12, 2); }
        else { c.fillStyle = rgb(shade(base, 0.55), a); c.beginPath(); c.ellipse(x + (hh - .5) * w * .5, y, 2.5, 4.5, 0, 0, TAU); c.fill(); }
      }
    }
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

  // ---------- ledges: cached sprites (2x) per type + skin ----------
  const SK = 2, cache = {};
  const LEDGE_W = { start: 170, rock: 76, branch: 86, ice: 76, moving: 70, moss: 66, spring: 62 };
  function skinFor(type, z) {
    if (type === 'rock' || type === 'start') return z === 0 ? 'curb' : z >= 6 ? 'sky' : z === 5 ? 'summit' : z === 4 ? 'alpine' : 'forest';
    if (type === 'branch') return z <= 1 ? 'hard' : z === 2 ? 'birch' : 'spruce';
    return 'x';
  }
  function dot(c, x, y, r, col) { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
  function drawRock(c, w, skin) {
    const pal = { curb: ['#b9bdc4', '#8d929b', '#5f636b'], forest: ['#a9aeb2', '#7d8388', '#4e5459'], alpine: ['#c2c7cb', '#98a0a6', '#6a7278'], summit: ['#d3bfb6', '#a8938c', '#74625d'], sky: ['#e6ecff', '#aab6e6', '#6f7bb8'] }[skin];
    const h = 17;
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, pal[0]); g.addColorStop(0.35, pal[1]); g.addColorStop(1, pal[2]);
    c.beginPath(); c.moveTo(-w / 2 + 6, 0); c.lineTo(w / 2 - 6, 0); c.quadraticCurveTo(w / 2 + 2, 2, w / 2 - 3, h - 3); c.quadraticCurveTo(w / 2 - 12, h + 2, w / 2 - 24, h - 1); c.lineTo(-w / 2 + 26, h + 1); c.quadraticCurveTo(-w / 2 + 4, h, -w / 2 + 2, h - 5); c.quadraticCurveTo(-w / 2 - 3, 3, -w / 2 + 6, 0); c.closePath();
    c.fillStyle = g; c.fill(); c.strokeStyle = 'rgba(30,34,40,.55)'; c.lineWidth = 1.6; c.stroke();
    c.fillStyle = 'rgba(255,255,255,.55)'; rr(c, -w / 2 + 9, 0.5, w - 18, 3, 1.5); c.fill();
    if (skin === 'curb') {                                       // painted concrete wheel-stop
      c.save(); c.clip(); c.fillStyle = '#e9c93a'; for (let x = -w / 2; x < w / 2; x += 18) { c.beginPath(); c.moveTo(x, 4); c.lineTo(x + 9, 4); c.lineTo(x + 3, 14); c.lineTo(x - 6, 14); c.fill(); } c.restore();
    } else {
      c.strokeStyle = 'rgba(30,34,40,.35)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-w * .18, 5); c.lineTo(-w * .1, 11); c.lineTo(-w * .16, 15); c.moveTo(w * .15, 4); c.lineTo(w * .22, 9); c.stroke();
      if (skin === 'forest') { dot(c, -w * .3, 1, 4, '#5b8f4a'); dot(c, -w * .22, 0, 3, '#6fa55a'); dot(c, w * .28, 1, 3, '#5b8f4a'); }
      if (skin === 'alpine') { dot(c, w * .1, 8, 2.6, '#d6c066'); dot(c, w * .17, 11, 2, '#c9b25a'); }
      if (skin === 'sky') { c.fillStyle = 'rgba(255,255,255,.6)'; dot(c, -w * .25, 9, 1.4, '#fff'); dot(c, w * .2, 6, 1.2, '#fff'); }
    }
  }
  function drawBranch(c, w, skin) {
    const base = skin === 'birch' ? ['#f4f1e8', '#c9c4b4', '#8f897a'] : skin === 'spruce' ? ['#6a4a35', '#4d3526', '#32221a'] : ['#9a6b45', '#74502f', '#4b331e'];
    const h = 12, g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, base[0]); g.addColorStop(.5, base[1]); g.addColorStop(1, base[2]);
    rr(c, -w / 2, 0, w, h, 6); c.fillStyle = g; c.fill(); c.strokeStyle = 'rgba(25,20,15,.6)'; c.lineWidth = 1.5; c.stroke();
    c.fillStyle = 'rgba(255,255,255,.4)'; rr(c, -w / 2 + 6, 1, w - 12, 2.4, 1); c.fill();
    if (skin === 'birch') { c.fillStyle = '#26262a'; for (let i = 0; i < 5; i++) c.fillRect(-w / 2 + 10 + i * 16, 3 + (i % 2) * 3, 7, 2.4); }
    if (skin === 'hard') { for (let i = 0; i < 3; i++) { const lx = -w * .3 + i * w * .3; dot(c, lx, -1, 5, i % 2 ? '#d9822b' : '#b8451e'); dot(c, lx + 4, 1, 3.4, '#e8a43a'); } }
    if (skin === 'spruce') { c.fillStyle = '#2f5e45'; for (let i = 0; i < 6; i++) { const lx = -w / 2 + 8 + i * 14; c.beginPath(); c.moveTo(lx - 7, 2); c.lineTo(lx, -9); c.lineTo(lx + 7, 2); c.closePath(); c.fill(); } c.fillStyle = '#3f7a58'; for (let i = 0; i < 5; i++) { const lx = -w / 2 + 15 + i * 14; c.beginPath(); c.moveTo(lx - 5, 0); c.lineTo(lx, -7); c.lineTo(lx + 5, 0); c.closePath(); c.fill(); } }
    c.fillStyle = skin === 'birch' ? '#8bb36a' : '#5c8f46'; dot(c, w / 2 - 5, -2, 3.4, c.fillStyle);
  }
  function drawMoss(c, w) {
    drawRock(c, w, 'forest');
    c.fillStyle = '#4f8f3e'; c.beginPath(); c.moveTo(-w / 2 + 3, 2); for (let x = -w / 2 + 3; x <= w / 2 - 3; x += 6) c.lineTo(x + 3, -3 - ((x * 7) & 3)); c.lineTo(w / 2 - 3, 2); c.lineTo(w / 2 - 6, 8); c.lineTo(-w / 2 + 6, 8); c.closePath(); c.fill();
    c.fillStyle = '#74b857'; for (let x = -w / 2 + 8; x < w / 2 - 6; x += 9) dot(c, x, -2, 2.3, '#7bc05b');
    c.strokeStyle = 'rgba(20,40,20,.55)'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(-6, 8); c.lineTo(-2, 12); c.lineTo(-7, 16); c.moveTo(11, 6); c.lineTo(15, 11); c.stroke();
  }
  function drawIce(c, w) {
    const g = c.createLinearGradient(0, 0, 0, 16); g.addColorStop(0, '#f2fdff'); g.addColorStop(.5, '#b9e8f7'); g.addColorStop(1, '#7cc3e6');
    rr(c, -w / 2, 0, w, 15, 7); c.fillStyle = g; c.fill(); c.strokeStyle = '#3b88b3'; c.lineWidth = 1.6; c.stroke();
    c.fillStyle = 'rgba(255,255,255,.85)'; rr(c, -w / 2 + 7, 1.5, w - 24, 3, 1.5); c.fill(); c.fillRect(w / 2 - 14, 5, 4, 2);
    c.fillStyle = 'rgba(190,235,250,.9)'; for (const x of [-w * .28, -w * .05, w * .25]) { c.beginPath(); c.moveTo(x - 4, 13); c.lineTo(x, 13 + 8 + Math.abs(x) % 6); c.lineTo(x + 4, 13); c.fill(); }
  }
  function drawMoving(c, w) {
    drawRock(c, w, 'forest');
    c.fillStyle = '#e9b13a'; c.strokeStyle = '#6a4a12'; c.lineWidth = 1;
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * (w / 2 - 12), 5); c.lineTo(s * (w / 2 - 22), 9); c.lineTo(s * (w / 2 - 12), 13); c.closePath(); c.fill(); c.stroke(); }
    c.fillStyle = '#4d3a1f'; rr(c, -w / 2 + 3, 15, w - 6, 4, 2); c.fill();
  }
  function drawSpring(c, w) {
    const h = 10;
    c.strokeStyle = '#3a2a1c'; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.moveTo(-w / 2 + 2, 6); c.quadraticCurveTo(0, 10, w / 2 - 2, 6); c.stroke();
    c.strokeStyle = '#7a5434'; c.lineWidth = 3; c.stroke();
    c.lineCap = 'butt';
    const cols = ['#1f6b44', '#2d8a58', '#3fa86c'];
    for (let r = 0; r < 3; r++) for (let i = -3; i <= 3; i++) {
      const x = i * (w / 7.2), y = 4 - r * 3 + Math.abs(i) * 1.2;
      c.fillStyle = cols[r]; c.beginPath(); c.moveTo(x - 7, y + 4); c.lineTo(x + (r % 2 ? 2 : -2), y - 12 + r * 2); c.lineTo(x + 7, y + 4); c.closePath(); c.fill();
    }
    dot(c, -w * .26, 9, 4, '#8a5a30'); dot(c, w * .22, 10, 3.6, '#8a5a30');
    c.fillStyle = '#d1f0dc'; c.font = '900 9px sans-serif'; c.textAlign = 'center'; c.fillText('▲', 0, -3); c.textAlign = 'start';
  }
  function ledgeSprite(type, skin) {
    const key = type + '|' + skin; if (cache[key]) return cache[key];
    const w = LEDGE_W[type], padX = 14, up = 30, down = 34, cw = (w + padX * 2) * SK, ch = (up + down) * SK;
    const cv = document.createElement('canvas'); cv.width = Math.ceil(cw); cv.height = Math.ceil(ch);
    const c = cv.getContext('2d'); c.scale(SK, SK); c.translate(w / 2 + padX, up);
    c.shadowColor = 'rgba(0,0,0,.22)'; c.shadowBlur = 0;
    if (type === 'rock' || type === 'start') drawRock(c, w, skin);
    else if (type === 'branch') drawBranch(c, w, skin);
    else if (type === 'moss') drawMoss(c, w);
    else if (type === 'ice') drawIce(c, w);
    else if (type === 'moving') drawMoving(c, w);
    else if (type === 'spring') drawSpring(c, w);
    return (cache[key] = { cv, ox: w / 2 + padX, oy: up, w: cw / SK, h: ch / SK });
  }
  function ledge(c, l, t, z) {
    const skin = skinFor(l.type, z), spr = ledgeSprite(l.type, skin);
    const a = asset('ledge_' + (l.type === 'start' ? 'rock' : l.type));
    let wob = l.wob, sy = 1, dy = 0, sx = 1, rot = 0, alpha = 1, shake = 0;
    if (wob > 0) { dy = Math.sin((1 - wob) * 18) * wob * 4; if (l.type === 'spring') { sy = 1 - Math.sin((1 - wob) * 14) * wob * 0.25; } }
    if (l.state === 'crumble') { shake = Math.sin(t * 90) * 1.8; }
    if (l.state === 'fall') { rot = (l.id % 2 ? 1 : -1) * Math.min(1, l.vy / 600); alpha = clamp(1 - (l.vy / 900), 0.2, 1); }
    c.save(); c.globalAlpha = alpha; c.translate(l.x + shake, l.y + dy); if (rot) c.rotate(rot); c.scale(sx, sy);
    if (a) c.drawImage(a, -l.w / 2 - 14, -30, l.w + 28, 64); else c.drawImage(spr.cv, -spr.ox, -spr.oy, spr.w, spr.h);
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
  function crow(c, x, y, dir, t) {
    const a = asset('crow');
    c.save(); c.translate(x, y); c.scale(dir, 1);
    if (a) { c.drawImage(a, -22, -16, 44, 32); c.restore(); return; }
    const flap = Math.sin(t * 16), OUT = '#0d0d12';
    c.fillStyle = '#23232e'; c.strokeStyle = OUT; c.lineWidth = 1.5;
    c.beginPath(); c.ellipse(0, 0, 14, 8, 0, 0, TAU); c.fill(); c.stroke();                   // body
    c.beginPath(); c.moveTo(-12, -1); c.lineTo(-24, -5 + flap * 2); c.lineTo(-22, 4); c.closePath(); c.fill(); c.stroke();    // tail
    c.beginPath(); c.arc(12, -4, 6, 0, TAU); c.fill(); c.stroke();                            // head
    c.fillStyle = '#e8b23a'; c.beginPath(); c.moveTo(17, -5); c.lineTo(25, -2); c.lineTo(17, -1); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(13.5, -5.4, 1.7, 0, TAU); c.fill(); c.fillStyle = '#000'; c.beginPath(); c.arc(14, -5.4, .8, 0, TAU); c.fill();
    c.fillStyle = '#2f2f3d'; c.beginPath(); c.moveTo(-4, -2); c.quadraticCurveTo(-2, -22 * flap - 4, 10, -26 * flap - 2); c.quadraticCurveTo(6, -2, 4, 0); c.closePath(); c.fill(); c.stroke();   // wing
    c.restore();
  }
  function cone(c, x, y, rot) {
    const a = asset('cone');
    c.save(); c.translate(x, y); c.rotate(rot);
    if (a) { c.drawImage(a, -10, -16, 20, 32); c.restore(); return; }
    const g = c.createLinearGradient(-9, 0, 9, 0); g.addColorStop(0, '#6b4524'); g.addColorStop(.5, '#a8713c'); g.addColorStop(1, '#5a3a1e');
    c.fillStyle = g; c.strokeStyle = '#2d1c0e'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(0, -15); c.quadraticCurveTo(11, -4, 6, 11); c.quadraticCurveTo(0, 16, -6, 11); c.quadraticCurveTo(-11, -4, 0, -15); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(40,24,10,.6)'; c.lineWidth = 1;
    for (let r = 0; r < 4; r++) { c.beginPath(); c.moveTo(-6 + r, -8 + r * 5); c.quadraticCurveTo(0, -4 + r * 5, 6 - r, -8 + r * 5); c.stroke(); }
    c.fillStyle = '#2f6e45'; c.beginPath(); c.moveTo(-1, -15); c.lineTo(-7, -21); c.lineTo(2, -18); c.lineTo(8, -22); c.lineTo(1, -14); c.fill();
    c.restore();
  }
  function updraft(c, u, t, camTop, H) {
    const x0 = u.x - u.w / 2, y0 = u.y - u.h / 2;
    const g = c.createLinearGradient(0, y0, 0, y0 + u.h); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.5, 'rgba(235,250,255,.3)'); g.addColorStop(1, 'rgba(255,255,255,.1)');
    c.fillStyle = g; rr(c, x0, y0, u.w, u.h, 30); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 2; c.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const f = ((t * 0.9 + i / 7) % 1), yy = y0 + u.h - f * u.h, xx = x0 + 10 + ((i * 37) % (u.w - 20)) + Math.sin(f * 9 + i) * 5;
      c.globalAlpha = Math.sin(f * Math.PI) * 0.9; c.beginPath(); c.moveTo(xx, yy); c.lineTo(xx + Math.sin(f * 9 + i) * 3, yy - 20); c.stroke();
    }
    c.globalAlpha = 1; c.lineCap = 'butt';
  }

  // ---------- foreground: dark leaves / boughs / rock / cloud wisps poking in from the screen edges, scrolling faster than the world ----------
  function foreground(c, o) {
    const pal = palette(o.m), st = pal.style, H = o.H, k = 1.35, sc = -o.camTop * k, span = 380;
    const col = st >= 6 ? rgb(mix(pal.haze, [255, 255, 255], .4), st >= 7 ? 0.18 : 0.5) : rgb(shade(pal.near, 0.5), 0.6);
    const j0 = Math.floor((sc - H) / span);
    for (let j = j0; j <= j0 + Math.ceil(H / span) + 2; j++) {
      if (hash(j * 3.1) < 0.3) continue;
      const y = sc - j * span - hash(j) * 140, side = hash(j + 7) < .5 ? -1 : 1, x = side < 0 ? 0 : W;
      if (y < -120 || y > H + 120) continue;
      c.save(); c.translate(x, y); c.scale(-side, 1); c.fillStyle = col;      // drawn as if on the left edge, mirrored on the right
      const s = 0.8 + hash(j + 2) * 0.5;
      if (st === 1 || st === 2) {                     // a leafy twig reaching in from the edge
        c.strokeStyle = col; c.lineWidth = 3.2 * s; c.lineCap = 'round'; c.beginPath(); c.moveTo(-4, 6 * s); c.quadraticCurveTo(18 * s, -2 * s, 36 * s, -22 * s); c.stroke();
        for (let i = 0; i < 7; i++) { const u = i / 6, lx = -2 + u * 36 * s, ly = 6 * s - u * 26 * s, sd = i % 2 ? 1 : -1;
          c.save(); c.translate(lx, ly); c.rotate(-0.6 + sd * 0.9); c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(7 * s, -6 * s, 16 * s, 0); c.quadraticCurveTo(7 * s, 6 * s, 0, 0); c.fill(); c.restore(); }
      }
      else if (st === 3) { for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-2, -40 * s + i * 22 * s); c.lineTo(30 * s - i * 2, -28 * s + i * 22 * s); c.lineTo(-2, -16 * s + i * 22 * s); c.closePath(); c.fill(); } }
      else if (st === 4 || st === 5) { c.beginPath(); c.moveTo(-4, -60 * s); c.lineTo(16 * s, -38 * s); c.lineTo(26 * s, -6 * s); c.lineTo(14 * s, 30 * s); c.lineTo(22 * s, 58 * s); c.lineTo(-4, 70 * s); c.closePath(); c.fill(); }
      else if (st >= 6) { c.beginPath(); c.arc(0, 0, 34 * s, 0, TAU); c.arc(10 * s, 30 * s, 26 * s, 0, TAU); c.arc(4 * s, -30 * s, 22 * s, 0, TAU); c.fill(); }
      c.restore();
    }
  }

  window.Art = { W, ASSETS, foreground, palette, zoneIdx, background, trunks, ground, ledge, climber, crow, cone, updraft, hiker, hash, lerp, clamp, sstep, rr, rgb, mix, ledgeSprite, skinFor };
})();
