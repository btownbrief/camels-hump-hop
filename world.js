/* Camel's Hump Hop — pure game world: constants, zones, ledge generator, physics and streak rules.
   No DOM. Loaded by the browser (window.World) and by node (test/reach-test.js). */
(function (root) {
  'use strict';

  const W = 360;          // logical playfield width; the screen wraps at this width
  const PXM = 8;          // pixels per metre of altitude

  const C = {
    W, PXM,
    G: 1500,              // gravity px/s^2
    BOUNCE: 760,          // every normal bounce, always -> jump height 192px
    SPRING: 1180,         // springy pine bough -> 464px
    ACC: 2600,            // steering acceleration
    REV: 1.6,             // extra grip when steering against current motion
    DRAG: 6.5,            // air drag when not steering (release drift ~46px at full speed)
    VMAX: 300,
    HALF: 12,             // climber half-width
    PH: 40,               // climber height
    TERM: 1300,
    STEP: 1 / 120,
    PERFECT: 0.2,         // landing within ±20% of a ledge's width from its centre is PERFECT
    LEDGE_SLACK: 10,      // horizontal landing forgiveness beyond the ledge edge (the hiker's boots reach ~10 px past his centre)
    ICE_SLIP: 0.35,       // after landing on ice: this long with half steering (and no landing grip)
    MIN_DY: 58,           // tutorial rows
    MAX_DY: 160,          // never more than 83% of the jump height between spine ledges
    LEAP_DY: 300,         // spring "leap of faith" stretch above the clouds
    MIN_W: 44,            // narrowest spine ledge
    FOG: 4,               // a ledge whose top is within this of the screen bottom (or below it) is in the weather: not landable
    DEAD: 44,             // feet this far below the screen bottom = fell
    CREEP_AT: 150,        // the weather line starts creeping up once your best passes this altitude (m)
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
  const STABLE = { start: 1, rock: 1, branch: 1, ice: 1, moving: 1, spring: 1 };

  // spine (always reachable, never crumbles) and extra (one-use bail-outs) ledge mixes per zone.
  // Each zone adds one idea: birch = crumbling moss, spruce = moving spine ledges, treeline = ice + gusts,
  // bare rock = precision stretches, clouds = spring leaps, night = fast wide movers, aurora = the tightest gaps.
  const SPINE_MIX = [
    { rock: 1 },
    { rock: .55, branch: .45 },
    { branch: .7, rock: .3 },
    { branch: .5, rock: .5 },
    { rock: .75, ice: .25 },
    { rock: .78, ice: .22 },
    { rock: .78, ice: .22 },
    { rock: .78, ice: .22 },
    { rock: .75, ice: .25 },
  ];
  const EXTRA_MIX = [
    { rock: 1 },
    { rock: .6, branch: .4 },
    { moss: .55, branch: .45 },
    { moss: .5, branch: .5 },
    { moss: .45, ice: .15, rock: .4 },
    { moss: .55, ice: .15, rock: .3 },
    { moss: .5, ice: .15, rock: .35 },
    { moss: .5, ice: .15, rock: .35 },
    { moss: .55, ice: .15, rock: .3 },
  ];
  const EXTRA_P = [0.3, 0.12, 0.12, 0.14, 0.12, 0.45, 0.42, 0.42, 0.42];     // the opening zones hand out few spares, so the climb has risk from the start

  // tuning knobs (exported so node tuning scripts can try values without editing this file)
  const TUNE = {
    dRamp0: 30, dRampLen: 1930, d2Ramp0: 1960, d2RampLen: 2000,
    dyLo0: 74, dyLo1: 100, dyLo2: 120, dyHi0: 100, dyHi1: 150, dyHi2: 160,
    shrink1: 16, shrink2: 8,
    dx0: 62, dx1: 115, dx2: 150, outer: 0.4,
    exCut: 0.7, movP0: 0.10, movP1: 0.25, amp0: 16, amp1: 30,
    c0: 30, c1: 80, c2: 95, creepLen: 1500,
    ease: 2,
  };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const wd = (a, b) => { let d = a - b; d -= W * Math.round(d / W); return d; };   // wrapped signed distance a-b
  const pick = (rnd, mix) => { let r = rnd(), s = 0, last = null; for (const k in mix) { last = k; s += mix[k]; if (r < s) return k; } return last; };

  // difficulty: d ramps 60 m -> 1,960 m, then d2 keeps tightening slowly to 3,960 m
  function ramp(m) {
    const T = TUNE, d = clamp((m - T.dRamp0) / T.dRampLen, 0, 1);
    // dy uses an eased copy (dE): gaps open early, so the screen thins out fast, while width and sideways reach ramp linearly
    return { d, dE: 1 - Math.pow(1 - d, T.ease), d2: clamp((m - T.d2Ramp0) / T.d2RampLen, 0, 1) };
  }
  // the weather line: how fast the bottom of the screen climbs on its own (px/s)
  function creepSpeed(m) {
    if (m < C.CREEP_AT) return 0;
    const T = TUNE, k = clamp((m - C.CREEP_AT) / T.creepLen, 0, 1), { d2 } = ramp(m);
    return Math.min(T.c2, lerp(T.c0, T.c1, k) + (T.c2 - T.c1) * d2);
  }
  // Clean Climb streak -> multiplier on height points
  const multFor = (s) => s >= 20 ? 5 : s >= 15 ? 4 : s >= 10 ? 3 : s >= 5 ? 2 : 1;
  const nextStep = (s) => s >= 20 ? null : (Math.floor(s / 5) + 1) * 5;

  function Sim(seed, H) { this.H = H || 780; this.reset(seed == null ? (Math.random() * 1e9) | 0 : seed); }

  Sim.prototype.reset = function (seed) {
    this.seed = seed; this.rnd = mulberry32(seed);
    this.t = 0; this.acc = 0;
    this.ledges = []; this.events = [];
    this.nextId = 1;
    this.gen = { y: 0, x: W / 2, row: 0, z: 0, zrow: 0, amp: 0, leapCd: 3, leap: 0, dry: 0, dryCd: 7, prevMoving: false, prevIce: false };
    this.windAx = 0;
    const s = this.mk('start', W / 2, 0, 0, true);
    s.w = W + 2;                                         // the whole parking lot is solid ground (art still draws the curb)
    this.p = { x: W / 2, y: 0, vx: 0, vy: -C.BOUNCE, face: 1, hit: 0, slip: 0 };
    this.camTop = -(this.H - 235);
    this.lastLevel = 0; this.maxLevel = 0;
    this.streak = 0; this.maxStreak = 0; this.mult = 1;
    this.score = 0; this.bestAlt = 0; this.alive = true; this.landings = 0; this.perfects = 0;
    this.creep = true;
    this.ensure();
  };

  Sim.prototype.mk = function (type, x, y, level, spine, w) {
    const l = { id: this.nextId++, type, x, ax: x, y, w: w || WIDTH[type], level, spine: !!spine, state: 'ok', ct: 0, vy: 0, wob: 0, amp: 0, sp: 0, ph: 0 };
    this.ledges.push(l); return l;
  };

  // generate one row: a spine ledge that is always reachable, plus an optional extra
  Sim.prototype.genRow = function () {
    const g = this.gen, r = this.rnd, T = TUNE;
    const m = -g.y / PXM, z = zoneAt(m + 8), { d, dE, d2 } = ramp(m);
    g.row++;
    if (z !== g.z) { g.z = z; g.zrow = 0; }
    g.zrow++;
    const tut = g.row <= 8, intro = z > 0 && g.zrow <= 3 && !tut;      // a new zone opens gently, and shows its new idea on a wide ledge
    const landing = g.leap === 1;                                       // the wide ledge at the top of a spring leap
    let leapRow = false;
    if (!landing && z >= 6 && !intro && --g.leapCd <= 0) leapRow = true;

    // vertical gap
    let lo = lerp(T.dyLo0, T.dyLo1, dE) + (T.dyLo2 - T.dyLo1) * d2, hi = lerp(T.dyHi0, T.dyHi1, dE) + (T.dyHi2 - T.dyHi1) * d2;
    if (intro) hi = lo + (hi - lo) * 0.35;
    let dy = tut ? C.MIN_DY + r() * (74 - C.MIN_DY) : Math.min(C.MAX_DY, lo + r() * (hi - lo));
    if (landing) dy = C.LEAP_DY;
    const y = g.y - dy;

    // spine type
    let type = landing ? 'rock' : leapRow ? 'spring' : pick(r, SPINE_MIX[z]);
    let amp = 0, sp = 0;
    if (!tut && !landing && !leapRow && z >= 3 && !g.prevMoving) {
      const first = intro && g.zrow === 2 && z === 3;                  // Spruce-Fir: the first mover is slow and wide
      if (first || r() < T.movP0 + T.movP1 * d) {
        type = 'moving';
        amp = first ? 22 : 22 + r() * (T.amp0 + T.amp1 * d);
        sp = first ? 0.8 : 0.8 + r() * (0.3 + 0.4 * d);
      }
    }
    if (intro && g.zrow === 2 && z === 4) type = 'ice';                // Treeline: first ice ledge on an easy hop
    if (type === 'ice' && g.prevIce && m < 1500) type = 'rock';       // ice is a hazard now: never two in a row below 1,500 m
    let w = Math.max(C.MIN_W, WIDTH[type] - T.shrink1 * d - T.shrink2 * d2);
    if (intro || tut) w = WIDTH[type] - T.shrink1 * d * 0.5;
    if (landing) w = 90;
    if (leapRow) w = 70;
    w = Math.round(w);

    // horizontal: wrapped spine-to-spine limit, picked from the outer part of the range once it gets harder
    let maxDx = Math.max(0, lerp(T.dx0, T.dx1, d) + (T.dx2 - T.dx1) * d2 - amp - g.amp);
    if (landing) maxDx = Math.min(maxDx, 90);
    if (g.prevIce) maxDx *= 0.85;                                      // taking off from ice steers at half strength for a moment: a shorter reach
    const xlo = w / 2 + amp + 8, xhi = W - w / 2 - amp - 8;
    const outer = intro || landing ? 0 : clamp((d - 0.25) / 0.35, 0, 1) * T.outer;
    const off = (outer + r() * (1 - outer)) * maxDx * (r() < 0.5 ? -1 : 1);
    let x = g.x + off;
    if (x < xlo || x > xhi) x = g.x - off;                             // flip direction instead of leaving the screen
    x = clamp(x, xlo, xhi);
    if (tut) {                                                          // tutorial rows: each steps 52–62 px sideways in one direction, so you can't climb without steering
      if (g.row === 1) g.dir = r() < 0.5 ? -1 : 1;
      let nx = g.x + g.dir * (52 + r() * 10);
      if (nx < xlo || nx > xhi) { g.dir = -g.dir; nx = g.x + g.dir * (52 + r() * 10); }
      x = clamp(nx, xlo, xhi);
    }
    const s = this.mk(type, x, y, g.row, true, w);
    if (type === 'moving') { s.amp = amp; s.sp = sp; s.ph = r() * 6.28; s.ax = x; }
    if (landing) s.landing = true;
    g.x = x; g.y = y; g.amp = amp; g.prevMoving = type === 'moving'; g.prevIce = type === 'ice';
    if (leapRow) { g.leap = 1; g.leapCd = 12 + Math.floor(r() * 8); } else if (landing) g.leap = 0;

    // optional extra ledge on the same row. Above 900 m: precision stretches (two rows with no extras every 6–10 rows)
    let allow = g.row > 2 && !leapRow && !landing;
    if (z >= 5) {
      if (g.dry > 0) { g.dry--; allow = false; }
      else if (--g.dryCd <= 0) { g.dry = 1; allow = false; g.dryCd = 6 + Math.floor(r() * 5); }
    }
    const forceMoss = intro && z === 2 && g.zrow === 2;               // Birch: the first crumbling ledge
    if (allow && (forceMoss || r() < EXTRA_P[z] * (1 - T.exCut * d))) {
      let et = forceMoss ? 'moss' : pick(r, EXTRA_MIX[z]);
      if (m > 900 && et !== 'moss' && r() < 0.35) et = 'moss';         // up high a spare ledge is mostly a one-use bail-out
      const ew = Math.round(Math.max(C.MIN_W, WIDTH[et] - T.shrink1 * d * 0.6));
      const elo = ew / 2 + 6, ehi = W - ew / 2 - 6;
      for (let k = 0; k < 8; k++) {
        const ex = elo + r() * (ehi - elo);
        if (Math.abs(wd(ex, x)) >= 96 + amp) { this.mk(et, ex, y + (r() * 12 - 6), g.row, false, ew); break; }
      }
    }
  };
  Sim.prototype.ensure = function () { while (this.gen.y > this.camTop - 1500) this.genRow(); };

  // jump straight to an altitude (used by tests / screenshots): fresh ledge there, world generated above
  Sim.prototype.warp = function (m) {
    const y = -m * PXM;
    this.ledges = [];
    const g = this.gen;
    g.y = y; g.x = W / 2; g.amp = 0; g.prevMoving = false; g.prevIce = false; g.z = zoneAt(m + 8); g.zrow = 9; g.leap = 0; g.leapCd = 4;
    if (g.row < 9) g.row = 9;
    this.mk('rock', W / 2, y, g.row, true, 80);
    this.p.x = W / 2; this.p.y = y; this.p.vx = 0; this.p.vy = -C.BOUNCE; this.p.slip = 0;
    this.lastLevel = g.row; this.maxLevel = g.row; this.streak = 0; this.mult = 1;
    this.camTop = y - (this.H - 170); this.bestAlt = m; this.ensure();
  };

  Sim.prototype.knock = function () {
    const p = this.p; if (p.hit > 0) return false;
    p.hit = 1.5; p.vx *= 0.4;
    if (p.y - this.camTop > this.H * 0.62) p.vy = -430;            // knocked while already low: a scrambling recovery hop, so a hit never ends the run by itself
    else p.vy = Math.max(p.vy, 0) + 160;
    if (this.streak > 0) this.events.push({ type: 'streakEnd', streak: this.streak, lost: true, bank: 0 });
    this.streak = 0; this.mult = 1;
    return true;
  };

  Sim.prototype.step = function (dt, steer) {
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= C.STEP) { this.acc -= C.STEP; this.sub(C.STEP, steer); }
  };

  Sim.prototype.sub = function (dt, steer) {
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
    if (p.slip > 0) p.slip = Math.max(0, p.slip - dt);
    // steering (half strength for a moment after an ice landing)
    const s = clamp(steer || 0, -1, 1);
    let ax = s * C.ACC; if (s * p.vx < 0) ax *= C.REV;
    if (p.slip > 0) ax *= 0.5;
    p.vx += (ax + this.windAx) * dt;
    p.vx *= Math.exp(-C.DRAG * (1 - Math.abs(s)) * dt);
    const vmax = C.VMAX + (this.windAx ? 70 : 0);
    p.vx = clamp(p.vx, -vmax, vmax);
    if (Math.abs(p.vx) > 20) p.face = p.vx > 0 ? 1 : -1;
    p.x += p.vx * dt; if (p.x < 0) p.x += W; else if (p.x >= W) p.x -= W;
    const prevY = p.y;
    p.vy += C.G * dt;
    if (p.vy > C.TERM) p.vy = C.TERM;
    p.y += p.vy * dt;
    // landing (never on a ledge that has sunk into the weather at the bottom of the screen)
    if (p.vy > 0) {
      const fog = this.camTop + this.H - C.FOG;
      let best = null;
      for (let i = 0; i < this.ledges.length; i++) {
        const l = this.ledges[i];
        if (l.state !== 'ok' || l.y > fog) continue;
        if (prevY <= l.y + 6 && p.y >= l.y && Math.abs(wd(p.x, l.x)) <= l.w / 2 + C.LEDGE_SLACK) {
          if (!best || l.y < best.y) best = l;
        }
      }
      if (best) this.land(best);
    }
    // altitude, score
    const alt = -p.y / PXM;
    if (alt > this.bestAlt) { this.score += (alt - this.bestAlt) * this.mult; this.bestAlt = alt; }
    // camera: eases upward only, and the weather line creeps up on its own (paused for 0.6 s after a hazard knock)
    const target = p.y - this.H * 0.45;
    if (target < this.camTop) this.camTop += (target - this.camTop) * Math.min(1, dt * 7);
    if (this.creep && p.hit <= 0.9) this.camTop -= creepSpeed(this.bestAlt) * dt;
    if (p.y - this.camTop < 150) this.camTop = p.y - 150;            // never let the hiker slide under the HUD band
    this.ensure();
    // cull
    for (let i = this.ledges.length - 1; i >= 0; i--) if (this.ledges[i].y > this.camTop + this.H + 500) this.ledges.splice(i, 1);
    if (p.y > this.camTop + this.H + C.DEAD) {
      this.alive = false;
      const bank = this.streak >= 5 ? 10 * this.streak * this.streak : 0;     // a fall banks the open streak, same rule as stepping back
      this.score += bank;
      this.events.push({ type: 'fell', streak: this.streak, bank });
    }
  };

  Sim.prototype.land = function (l) {
    const p = this.p;
    p.y = l.y;
    const fresh = l.level > this.maxLevel;            // a ledge higher than any you've touched
    let step = false;
    if (fresh) {
      this.streak++; this.maxStreak = Math.max(this.maxStreak, this.streak);
      const nm = multFor(this.streak); step = nm > this.mult; this.mult = nm;
    } else if (this.streak > 0 && l.type !== 'start') {
      const bank = this.streak >= 5 ? 10 * this.streak * this.streak : 0;
      this.score += bank;
      this.events.push({ type: 'streakEnd', streak: this.streak, lost: false, bank });
      this.streak = 0; this.mult = 1;
    }
    const perfect = fresh && Math.abs(wd(p.x, l.x)) <= l.w * C.PERFECT;
    let pbonus = 0;
    if (perfect) { this.perfects++; pbonus = 10 * this.mult; this.score += pbonus; }
    const big = l.type === 'spring';
    p.vy = -(big ? C.SPRING : C.BOUNCE);              // one jump height, always
    if (l.type === 'ice') p.slip = C.ICE_SLIP; else { p.vx *= 0.88; p.slip = 0; }      // ice: no landing grip, and steering is weak for a moment
    this.lastLevel = l.level; if (l.level > this.maxLevel) this.maxLevel = l.level;
    this.landings++;
    l.wob = 1;
    if (l.type === 'moss') { l.state = 'crumble'; l.ct = 0.4; }
    this.events.push({ type: 'land', ledge: l, fresh, streak: this.streak, mult: this.mult, step, spring: big, ice: l.type === 'ice', perfect, pbonus });
  };

  // ---------- test bot ----------
  function botSteer(sim, o) {
    o = o || {};
    const p = sim.p, skip = o.skip || 1;
    const rising = p.vy < 0;
    const apexY = p.y - (rising ? p.vy * p.vy / (2 * C.G) : 0);
    const fog = sim.camTop + sim.H - C.FOG;
    let best = null;
    for (let i = 0; i < sim.ledges.length; i++) {
      const l = sim.ledges[i];
      if (l.state !== 'ok' || l.y > fog) continue;
      const panic = !rising && p.vy > 450 && l.y < p.y + 420;           // long fall: land on anything solid
      if (!panic && (!l.spine || l.level <= sim.lastLevel || l.level > sim.lastLevel + skip + 3)) continue;
      if (rising ? l.y < apexY + 8 : l.y < p.y + 2) continue;
      const disc = p.vy * p.vy + 2 * C.G * (l.y - p.y);
      const T = Math.max(0.05, (-p.vy + Math.sqrt(Math.max(0, disc))) / C.G);
      const tx = l.type === 'moving' ? l.ax + l.amp * Math.sin(l.ph + (sim.t + T) * l.sp) : l.x;
      const dx = wd(tx, p.x);
      const need = Math.max(0, Math.abs(dx) - l.w / 2 + 6) / (C.VMAX * T);          // 1 = needs full speed the whole way
      const feasible = need < 0.8;
      const score = (feasible ? 1000 : 0) + (panic ? 0 : (l.level <= sim.lastLevel + skip ? 500 : 0)) + l.level * 0.01 - need * 100 - (panic ? (l.y - p.y) * 0.3 : 0);
      if (!best || score > best.score) best = { l, T, dx, score };
    }
    if (!best) return 0;
    const want = best.dx / Math.max(best.T, 0.12);
    if (Math.abs(want) >= C.VMAX * 0.9) return Math.sign(want);           // a long hop: hold the side, like a thumb would
    return clamp((want - p.vx) / (o.soft || 70), -1, 1);
  }

  const api = { C, W, PXM, ZONES, zoneAt, Sim, botSteer, wd, mulberry32, WIDTH, STABLE, clamp, lerp, ramp, creepSpeed, multFor, nextStep, TUNE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.World = api;
})(typeof window !== 'undefined' ? window : globalThis);
