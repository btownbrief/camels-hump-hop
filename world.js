/* Camel's Hump Hop — pure game world: constants, zones, ledge generator, physics and combo rules.
   No DOM. Loaded by the browser (window.World) and by node (test/reach-test.js). */
(function (root) {
  'use strict';

  const W = 360;          // logical playfield width; the screen wraps at this width
  const PXM = 8;          // pixels per metre of altitude

  const C = {
    W, PXM,
    G: 1500,              // gravity px/s^2
    BOUNCE: 760,          // normal bounce speed  -> jump height 192px
    SPRING: 1180,         // springy pine bough
    ACC: 2600,            // steering acceleration
    REV: 1.6,             // extra grip when steering against current motion
    DRAG: 6.5,            // air drag when not steering (release drift ~46px at full speed)
    VMAX: 300,
    HALF: 12,             // climber half-width
    PH: 40,               // climber height
    TERM: 1300,
    STEP: 1 / 120,
    FASTVX: 150,          // |vx| needed for a combo landing
    CHAIN_T: 2.6,         // combo timer (shrinks as the chain grows; perfect landings top it up)
    PERFECT: 0.2,         // landing within ±20% of a ledge's width from its centre is PERFECT
    PERFECT_T: 0.7,       // seconds a perfect landing adds back to a running chain
    LIFT: 3300, LIFT_VMAX: -820,
    LEDGE_SLACK: 9,       // horizontal landing forgiveness beyond the ledge edge
    MAX_DY: 86, MIN_DY: 58,
  };
  C.JUMP = C.BOUNCE * C.BOUNCE / (2 * C.G);

  const ZONES = [
    { name: 'Trailhead Parking Lot', at: 0 },
    { name: 'Hardwood Forest', at: 60 },
    { name: 'Birch Stands', at: 220 },
    { name: 'Spruce-Fir Forest', at: 420 },
    { name: 'Treeline', at: 650 },
    { name: 'Bare Rock Ridge', at: 900 },
    { name: 'Above the Clouds', at: 1200 },
    { name: 'Night Sky', at: 1550 },
    { name: 'Aurora', at: 2200 },
  ];
  function zoneAt(m) { let z = 0; for (let i = 0; i < ZONES.length; i++) if (m >= ZONES[i].at) z = i; return z; }

  const WIDTH = { start: 170, rock: 76, branch: 86, ice: 76, moving: 70, moss: 66, spring: 62 };
  const STABLE = { start: 1, rock: 1, branch: 1, ice: 1, moving: 1 };

  // spine (always reachable, never crumbles) and extra (risky or rewarding) ledge mixes per zone
  const SPINE_MIX = [
    { rock: 1 },
    { rock: .55, branch: .45 },
    { branch: .85, rock: .15 },
    { branch: .5, rock: .5 },
    { rock: .45, ice: .3, branch: .25 },
    { rock: .5, ice: .5 },
    { rock: .4, ice: .6 },
    { rock: .4, ice: .6 },
    { rock: .4, ice: .6 },
  ];
  const EXTRA_MIX = [
    { rock: .8, spring: .2 },
    { moss: .3, spring: .1, rock: .4, branch: .2 },
    { moss: .3, spring: .1, moving: .2, branch: .4 },
    { moss: .25, spring: .25, moving: .15, branch: .35 },
    { ice: .3, moving: .25, spring: .15, moss: .1, rock: .2 },
    { ice: .35, moving: .3, spring: .1, rock: .25 },
    { moving: .4, ice: .25, spring: .25, rock: .1 },
    { moving: .4, ice: .25, spring: .25, rock: .1 },
    { moving: .45, ice: .3, spring: .2, rock: .05 },
  ];
  const EXTRA_P = [0.3, 0.4, 0.45, 0.5, 0.5, 0.5, 0.5, 0.5, 0.55];

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const wd = (a, b) => { let d = a - b; d -= W * Math.round(d / W); return d; };   // wrapped signed distance a-b
  const chainDur = (n) => Math.max(1.5, C.CHAIN_T - 0.09 * Math.min(n, 12));
  const pick = (rnd, mix) => { let r = rnd(), s = 0, last = null; for (const k in mix) { last = k; s += mix[k]; if (r < s) return k; } return last; };

  function Sim(seed, H) { this.H = H || 780; this.reset(seed == null ? (Math.random() * 1e9) | 0 : seed); }

  Sim.prototype.reset = function (seed) {
    this.seed = seed; this.rnd = mulberry32(seed);
    this.t = 0; this.acc = 0;
    this.ledges = []; this.updrafts = []; this.events = [];
    this.nextId = 1;
    this.gen = { y: 0, x: W / 2, row: 0, lastUpdraftY: 1e9 };
    this.windAx = 0;
    const s = this.mk('start', W / 2, 0, 0, true);
    s.w = W + 2;                                         // the whole parking lot is solid ground (art still draws the curb)
    this.p = { x: W / 2, y: 0, vx: 0, vy: -C.BOUNCE, face: 1, hit: 0, inUp: false };
    this.camTop = -(this.H - 235);
    this.lastLevel = 0; this.maxLevel = 0;
    this.chain = 0; this.chainT = 0; this.maxChain = 0; this.mult = 1;
    this.score = 0; this.bestAlt = 0; this.alive = true; this.landings = 0; this.perfects = 0;
    this.ensure();
  };

  Sim.prototype.mk = function (type, x, y, level, spine) {
    const l = { id: this.nextId++, type, x, ax: x, y, w: WIDTH[type], level, spine: !!spine, state: 'ok', ct: 0, vy: 0, wob: 0, amp: 0, sp: 0, ph: 0 };
    this.ledges.push(l); return l;
  };

  // generate one row (a spine ledge that is always reachable, plus an optional extra)
  Sim.prototype.genRow = function () {
    const g = this.gen, r = this.rnd;
    const m = -g.y / PXM, z = zoneAt(m + 8), d = clamp(m / 1200, 0, 1);
    const dy = C.MIN_DY + r() * (74 + 12 * d - C.MIN_DY);      // easy early, up to MAX_DY late
    const y = g.y - Math.min(dy, C.MAX_DY);
    g.row++;
    let type = pick(r, SPINE_MIX[z]);
    let amp = 0;
    if (z >= 2 && r() < 0.10 + 0.05 * d) { type = 'moving'; amp = 22 + r() * 16; }
    const w = WIDTH[type];
    const maxDx = (62 + 98 * d) - amp - (g.amp || 0);                     // wrapped horizontal gap limit for spine -> spine
    const lo = w / 2 + amp + 8, hi = W - w / 2 - amp - 8;
    let x = g.x + (r() * 2 - 1) * maxDx;
    if (x < lo || x > hi) x = g.x - (x - g.x);          // flip direction instead of leaving the screen
    x = clamp(x, lo, hi);
    if (g.row <= 8) {                                   // tutorial rows: each steps 52–62 px sideways in one direction, so you can't climb without steering
      if (g.row === 1) g.dir = r() < 0.5 ? -1 : 1;
      let nx = g.x + g.dir * (52 + r() * 10);
      if (nx < lo || nx > hi) { g.dir = -g.dir; nx = g.x + g.dir * (52 + r() * 10); }
      x = clamp(nx, lo, hi);
    }
    const s = this.mk(type, x, y, g.row, true);
    if (type === 'moving') { s.amp = amp; s.sp = 0.9 + r() * 0.6; s.ph = r() * 6.28; s.ax = x; }
    g.x = x; g.y = y; g.amp = amp;
    // optional extra ledge on the same row
    if (g.row > 2 && r() < EXTRA_P[z]) {
      const et = pick(r, EXTRA_MIX[z]);
      const ew = WIDTH[et];
      let eamp = et === 'moving' ? 40 + r() * 40 : 0;
      const elo = ew / 2 + eamp + 6, ehi = W - ew / 2 - eamp - 6;
      for (let k = 0; k < 8; k++) {
        const ex = elo + r() * (ehi - elo);
        if (Math.abs(wd(ex, x)) >= 96 + eamp * 0.6) {
          const e = this.mk(et, ex, y + (r() * 12 - 6), g.row, false);
          if (et === 'moving') { e.amp = eamp; e.sp = 0.7 + r() * 0.7; e.ph = r() * 6.28; }
          break;
        }
      }
    }
    // rare updraft columns in the gaps
    if (z >= 1 && g.lastUpdraftY - y > 1500) {
      const pr = z >= 6 ? 0.045 : 0.014;
      if (r() < pr) { this.updrafts.push({ id: this.nextId++, x: 50 + r() * 260, y: y - 90, w: 74, h: 250 }); g.lastUpdraftY = y; }
    }
  };
  Sim.prototype.ensure = function () { while (this.gen.y > this.camTop - 1500) this.genRow(); };

  // jump straight to an altitude (used by tests / screenshots): fresh start ledge there, world generated above
  Sim.prototype.warp = function (m) {
    const y = -m * PXM;
    this.ledges = []; this.updrafts = [];
    this.gen.y = y; this.gen.x = W / 2; this.gen.lastUpdraftY = y;
    const s = this.mk('rock', W / 2, y, this.gen.row, true);
    this.p.x = W / 2; this.p.y = y; this.p.vx = 0; this.p.vy = -C.BOUNCE;
    this.lastLevel = this.gen.row; this.maxLevel = this.gen.row;
    this.camTop = y - (this.H - 170); this.bestAlt = m; this.ensure();
  };

  Sim.prototype.knock = function () {
    const p = this.p; if (p.hit > 0) return false;
    p.hit = 1.5; p.vx *= 0.4;
    if (p.y - this.camTop > this.H * 0.62) p.vy = -430;            // knocked while already low: a scrambling recovery hop, so a hit never ends the run by itself
    else p.vy = Math.max(p.vy, 0) + 160;
    if (this.chain > 0) this.events.push({ type: 'chainEnd', chain: this.chain, lost: true });
    this.chain = 0; this.chainT = 0; this.mult = 1;
    return true;
  };

  Sim.prototype.step = function (dt, steer, opts) {
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= C.STEP) { this.acc -= C.STEP; this.sub(C.STEP, steer, opts); }
  };

  Sim.prototype.sub = function (dt, steer, opts) {
    const p = this.p; this.t += dt;
    // ledges
    for (let i = 0; i < this.ledges.length; i++) {
      const l = this.ledges[i];
      if (l.type === 'moving' && l.state === 'ok') l.x = l.ax + l.amp * Math.sin(l.ph + this.t * l.sp);
      if (l.wob > 0) l.wob = Math.max(0, l.wob - dt * 2.4);
      if (l.state === 'crumble') { l.ct -= dt; if (l.ct <= 0) { l.state = 'fall'; l.vy = 0; } }
      else if (l.state === 'fall') { l.vy += C.G * 0.9 * dt; l.y += l.vy * dt; }
    }
    if (!this.alive) return;
    if (p.hit > 0) p.hit = Math.max(0, p.hit - dt);
    // steering
    let s = clamp(steer || 0, -1, 1);
    let ax = s * C.ACC; if (s * p.vx < 0) ax *= C.REV;
    p.vx += (ax + this.windAx) * dt;
    p.vx *= Math.exp(-C.DRAG * (1 - Math.abs(s)) * dt);
    const vmax = C.VMAX + (this.windAx ? 70 : 0);
    p.vx = clamp(p.vx, -vmax, vmax);
    if (Math.abs(p.vx) > 20) p.face = p.vx > 0 ? 1 : -1;
    p.x += p.vx * dt; if (p.x < 0) p.x += W; else if (p.x >= W) p.x -= W;
    // updraft
    let up = false;
    for (let i = 0; i < this.updrafts.length; i++) {
      const u = this.updrafts[i];
      if (Math.abs(wd(p.x, u.x)) < u.w / 2 && p.y > u.y - u.h / 2 && p.y - C.PH < u.y + u.h / 2 && p.y > u.y - u.h / 2) { up = true; break; }
    }
    if (up && !p.inUp) this.events.push({ type: 'updraft' });
    p.inUp = up;
    const prevY = p.y;
    p.vy += C.G * dt;
    if (up) { p.vy -= C.LIFT * dt; if (p.vy < C.LIFT_VMAX) p.vy = C.LIFT_VMAX; }
    if (p.vy > C.TERM) p.vy = C.TERM;
    p.y += p.vy * dt;
    // landing
    if (p.vy > 0) {
      let best = null;
      for (let i = 0; i < this.ledges.length; i++) {
        const l = this.ledges[i];
        if (l.state !== 'ok') continue;
        if (prevY <= l.y + 6 && p.y >= l.y && Math.abs(wd(p.x, l.x)) <= l.w / 2 + C.LEDGE_SLACK) {
          if (!best || l.y < best.y) best = l;
        }
      }
      if (best) this.land(best);
    }
    // altitude, score, chain timer
    const alt = -p.y / PXM;
    if (alt > this.bestAlt) { this.score += (alt - this.bestAlt) * this.mult; this.bestAlt = alt; }
    if (this.chain > 0) {
      this.chainT -= dt;
      if (this.chainT <= 0) { const bank = 15 * this.chain * this.chain; this.score += bank; this.events.push({ type: 'chainEnd', chain: this.chain, lost: false, bank }); this.chain = 0; this.mult = 1; this.chainT = 0; }   // a chain that runs out is banked as a bonus; a hit loses it
    }
    // camera: eases upward only
    const target = p.y - this.H * 0.45;
    if (target < this.camTop) this.camTop += (target - this.camTop) * Math.min(1, dt * 7);
    if (p.y - this.camTop < 70) this.camTop = p.y - 70;
    this.ensure();
    // cull
    while (this.ledges.length && this.ledges[0].y > this.camTop + this.H + 500) this.ledges.shift();
    for (let i = this.ledges.length - 1; i >= 0; i--) if (this.ledges[i].y > this.camTop + this.H + 500) this.ledges.splice(i, 1);
    while (this.updrafts.length && this.updrafts[0].y > this.camTop + this.H + 600) this.updrafts.shift();
    if (p.y > this.camTop + this.H + 60) { this.alive = false; this.events.push({ type: 'fell' }); }
  };

  Sim.prototype.land = function (l) {
    const p = this.p;
    p.y = l.y;
    const fast = Math.abs(p.vx) >= C.FASTVX;
    const perfect = l.type !== 'start' && Math.abs(wd(p.x, l.x)) <= l.w * C.PERFECT;
    const combo = !!(this.lastLevel != null && l.level - this.lastLevel >= 2 && l.level > this.maxLevel && fast && p.hit <= 0);
    let bounce = C.BOUNCE + Math.min(Math.abs(p.vx), C.VMAX) * 0.2;           // small sprint boost
    if (combo) {
      this.chain++; this.maxChain = Math.max(this.maxChain, this.chain);
      this.chainT = chainDur(this.chain);
      this.mult = 1 + this.chain;
      this.score += 20 * this.chain * (1 + this.chain) * 0.5;
      bounce *= 1 + 0.03 * Math.min(this.chain, 8);
    }
    let pbonus = 0;
    if (perfect) {
      this.perfects++; pbonus = 10 * (1 + this.chain) * (combo ? 2 : 1); this.score += pbonus;
      if (this.chain > 0 && !combo) this.chainT = Math.min(chainDur(this.chain), this.chainT + C.PERFECT_T);
    }
    const big = l.type === 'spring';
    if (big) bounce = C.SPRING * (combo ? 1.04 : 1);
    p.vy = -bounce;
    if (l.type === 'ice') p.vx *= 1.04; else p.vx *= 0.88;
    this.lastLevel = l.level; if (l.level > this.maxLevel) this.maxLevel = l.level;
    this.landings++;
    l.wob = 1;
    if (l.type === 'moss') { l.state = 'crumble'; l.ct = 0.4; }
    this.events.push({ type: 'land', ledge: l, combo, chain: this.chain, mult: this.mult, spring: big, ice: l.type === 'ice', strong: Math.abs(p.vx), bonus: combo ? 10 * this.chain * (1 + this.chain) : 0, perfect, pbonus });
  };

  // ---------- test bot (also drives the title-screen attract mode) ----------
  function botSteer(sim, o) {
    o = o || {};
    const p = sim.p, skip = o.skip || 1;
    const rising = p.vy < 0;
    const apexY = p.y - (rising ? p.vy * p.vy / (2 * C.G) : 0);
    let best = null;
    for (let i = 0; i < sim.ledges.length; i++) {
      const l = sim.ledges[i];
      if (l.state !== 'ok') continue;
      const panic = !rising && p.vy > 450 && l.y < p.y + 420;           // long fall (spring / updraft): land on anything solid
      if (!panic && (!l.spine || l.level <= sim.lastLevel || l.level > sim.lastLevel + skip + 3)) continue;
      if (rising ? l.y < apexY + 8 : l.y < p.y + 2) continue;
      const disc = p.vy * p.vy + 2 * C.G * (l.y - p.y);
      const T = Math.max(0.05, (-p.vy + Math.sqrt(Math.max(0, disc))) / C.G);
      const tx = l.type === 'moving' ? l.ax + l.amp * Math.sin(l.ph + (sim.t + T) * l.sp) : l.x;
      const dx = wd(tx, p.x);
      const need = Math.max(0, Math.abs(dx) - l.w / 2 + 6) / (C.VMAX * T);          // 1 = needs full speed the whole way
      const feasible = need < 0.8;
      const score = (feasible ? 1000 : 0) + (panic ? 0 : (l.level <= sim.lastLevel + skip ? 500 : 0)) + l.level * (o.skip > 1 ? 60 : 0.01) - need * 100 - (panic ? (l.y - p.y) * 0.3 : 0);
      if (!best || score > best.score) best = { l, T, dx, score };
    }
    if (!best) return 0;
    let vd = clamp(best.dx / Math.max(best.T, 0.12), -C.VMAX, C.VMAX);
    if (o.fast && Math.abs(best.dx) > 6) vd = Math.sign(best.dx) * Math.max(Math.abs(vd), 175);   // keep moving: combo landings need speed
    return clamp((vd - p.vx) / (o.soft || 70), -1, 1);
  }

  const api = { C, W, PXM, ZONES, zoneAt, Sim, botSteer, chainDur, wd, mulberry32, WIDTH, STABLE, clamp };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.World = api;
})(typeof window !== 'undefined' ? window : globalThis);
