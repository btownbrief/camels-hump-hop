// Reachability, difficulty and streak-rule test for Camel's Hump Hop.  Run: node test/reach-test.js
const Wd = require('../world.js');
const { C, Sim, botSteer, wd, TUNE } = Wd;
let fails = 0; const log = (...a) => console.log(...a);
const fail = (m) => { fails++; if (fails < 25) console.log('FAIL', m); };
const MAXDX = TUNE.dx2 + 0.01;

// ---- 1. static invariants over thousands of generated rows ----
let rows = 0, maxDy = 0, minDy = 1e9, maxGap = 0, extras = 0, leaps = 0, types = {}, iceN = 0, spineHigh = 0, springSpares = 0;
const SEEDS = 60;
for (let seed = 1; seed <= SEEDS; seed++) {
  const sim = new Sim(seed, 780);
  while (sim.gen.row < 400) sim.genRow();
  const spine = sim.ledges.filter(l => l.spine).sort((a, b) => a.level - b.level);
  const byRow = {};
  sim.ledges.forEach(l => { (byRow[l.level] = byRow[l.level] || []).push(l); types[l.type] = (types[l.type] || 0) + 1; });
  for (let i = 1; i < spine.length; i++) {
    const a = spine[i - 1], b = spine[i];
    const dy = a.y - b.y; rows++;
    if (b.landing) { leaps++; if (a.type !== 'spring' || dy > C.LEAP_DY + 0.001) fail(`leap without spring at ${b.level}`); }
    else { maxDy = Math.max(maxDy, dy); minDy = Math.min(minDy, dy); if (dy > C.MAX_DY + 0.001 || dy < C.MIN_DY - 0.001) fail(`seed ${seed} row ${b.level} dy=${dy}`); }
    if (!(b.level === a.level + 1)) fail('level numbering');
    const gap = Math.abs(wd(b.ax, a.ax)) + b.amp + a.amp; maxGap = Math.max(maxGap, gap);
    if (gap > MAXDX) fail(`gap ${gap.toFixed(1)} at level ${b.level}`);
    if (a.type === 'moving' && b.type === 'moving') fail('two movers in a row');
    if (a.type === 'ice' && b.type === 'ice' && -b.y / C.PXM < 1500) fail(`two ice ledges in a row below 1,500 m at ${b.level}`);
    if (b.type === 'ice') iceN++; if (-b.y / C.PXM > 650) spineHigh++;
    if (!Wd.STABLE[a.type]) fail('spine not stable: ' + a.type);
    if (b.w < C.MIN_W) fail('spine too narrow ' + b.w);
    if (b.ax - b.amp < b.w / 2 - 1 || b.ax + b.amp > Wd.W - b.w / 2 + 1) fail('spine off-screen');
  }
  springSpares += sim.ledges.filter(l => !l.spine && l.type === 'spring' && -l.y / C.PXM < 900).length;
  for (const k in byRow) {
    const r = byRow[k]; if (r.length > 1) extras++;
    if (r.filter(l => l.spine).length !== 1 && k > 0) fail('row without exactly one spine ' + k);
    if (r.length > 1) for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
      const dd = Math.abs(wd(r[i].ax, r[j].ax)); if (dd < 90) fail(`overlap in row ${k}: ${dd}`);
    }
  }
}
if (iceN / spineHigh > 0.25) fail(`ice is ${(iceN / spineHigh * 100).toFixed(0)}% of the main path above 650 m (cap 25%)`);
if (springSpares) fail(`${springSpares} spring spare ledges below 900 m`);
log(`ice: ${(iceN / spineHigh * 100).toFixed(1)}% of the main path above 650 m; spring spares below 900 m: ${springSpares}`);
log(`static: ${rows} spine rows over ${SEEDS} seeds; dy ${minDy.toFixed(1)}..${maxDy.toFixed(1)} (jump ${C.JUMP.toFixed(0)}); max spine reach ${maxGap.toFixed(1)}px; ${leaps} spring leaps; rows with extras ${extras}`, types);

// ---- 2. difficulty shape: gap by altitude band, visible ledges while climbing ----
{
  const s = new Sim(5, 780); s.camTop = -40000; s.ensure();
  const sp = s.ledges.filter(l => l.spine && !l.landing);
  const band = (a, b) => { const v = []; for (let i = 1; i < sp.length; i++) { const m = -sp[i].y / 8; if (m >= a && m < b) v.push(sp[i - 1].y - sp[i].y); } return v.reduce((p, c) => p + c, 0) / v.length; };
  const g1 = band(400, 900), g2 = band(1500, 3000), g0 = band(100, 400);
  log(`gaps: 100–400 m ${g0.toFixed(0)}px, 400–900 m ${g1.toFixed(0)}px, 1500–3000 m ${g2.toFixed(0)}px`);
  if (g1 < 95) fail('400–900 m average gap below 95'); if (g2 < 120) fail('1500+ m average gap below 120');
  const vis = (m) => { let tot = 0, n = 0; for (let sd = 0; sd < 10; sd++) { const q = new Sim(70 + sd, 779); q.warp(m); let t = 0; while (t < 20 && q.alive) { q.step(1 / 60, botSteer(q, {})); t += 1 / 60; if (Math.round(t * 60) % 30 === 0) { tot += q.ledges.filter(l => l.y > q.camTop && l.y < q.camTop + q.H).length; n++; } } } return tot / n; };
  const v1 = vis(150), v5 = vis(500), v8 = vis(800), v23 = vis(2300);
  log(`visible ledges: ${v1.toFixed(1)} at 150 m, ${v5.toFixed(1)} at 500 m, ${v8.toFixed(1)} at 800 m, ${v23.toFixed(1)} at 2,300 m`);
  if (v1 > 9.5) fail('too many ledges on screen at 150 m'); if (v5 > 8.5) fail('too many ledges on screen at 500 m');
  if (v8 > 8.5) fail('too many ledges on screen at 800 m'); if (v23 > 6) fail('too many ledges on screen at 2,300 m');
}

// ---- 3. physical pair test: from the worst start on every spine ledge, bot reaches the next spine ledge ----
function pairTest(seed, deg, nrows) {
  const base = new Sim(seed, 780); while (base.gen.row < nrows) base.genRow();
  const spine = base.ledges.filter(l => l.spine).sort((a, b) => a.level - b.level);
  const saved = { ACC: C.ACC, VMAX: C.VMAX };
  C.ACC *= deg; C.VMAX *= deg;
  let ok = 0, bad = 0;
  for (let i = 0; i < spine.length - 1; i++) {
    const a = spine[i], b = spine[i + 1];
    for (const off of [0, 1, -1]) {                                  // start at centre or at either ledge edge
      const sim = new Sim(seed, 780); sim.creep = false;
      sim.ledges = [Object.assign({}, a, { state: 'gone' }), Object.assign({}, b, { state: 'ok', wob: 0 })];   // the bot only ever targets b
      sim.gen.y = -1e9;                                               // no more generation
      sim.p.x = ((a.x + off * (a.w / 2 - 2)) % C.W + C.W) % C.W; sim.p.y = a.y; sim.p.vx = 0; sim.p.vy = a.type === 'spring' ? -C.SPRING : -C.BOUNCE;
      sim.p.slip = a.type === 'ice' ? C.ICE_SLIP : 0;                 // leaving an ice ledge: half steering for the first moment
      sim.lastLevel = a.level; sim.maxLevel = a.level; sim.camTop = a.y - 600;
      let landed = null, t = 0;
      while (t < 3 && sim.alive) {
        sim.step(1 / 60, botSteer(sim, { skip: 1 })); t += 1 / 60;
        const ev = sim.events.splice(0); const lnd = ev.find(e => e.type === 'land'); if (lnd) { landed = lnd.ledge; break; }
        sim.camTop = sim.p.y - 500;
      }
      if (landed && landed.id === b.id) ok++; else { bad++; if (bad < 5) fail(`seed ${seed} deg ${deg} level ${a.level}->${b.level} ${a.type}->${b.type} dx ${wd(b.x, a.x).toFixed(1)} dy ${(a.y - b.y).toFixed(1)} w ${b.w} off ${off}`); }
    }
  }
  C.ACC = saved.ACC; C.VMAX = saved.VMAX;
  return { ok, bad };
}
let tot = 0, tbad = 0;
for (let seed = 100; seed < 120; seed++) { const r = pairTest(seed, 1, 400); tot += r.ok + r.bad; tbad += r.bad; }
log(`pair test (full-strength steering): ${tot} hops, ${tbad} unreachable`);
let tot2 = 0, tbad2 = 0;
for (let seed = 200; seed < 220; seed++) { const r = pairTest(seed, 0.75, 400); tot2 += r.ok + r.bad; tbad2 += r.bad; }
log(`pair test (steering degraded to 75% — margin check): ${tot2} hops, ${tbad2} unreachable`);

// ---- 4. full-world runs: a perfect bot climbs for minutes without falling, weather line and all ----
let fallsA = 0, minAlt = 1e9, maxAlt = 0, landA = 0;
for (let seed = 1; seed <= 20; seed++) {
  const sim = new Sim(seed, 780); let t = 0;
  while (t < 300 && sim.alive) { sim.step(1 / 60, botSteer(sim, { skip: 1 })); t += 1 / 60; sim.events.length = 0; }
  landA += sim.landings; if (!sim.alive) fallsA++; minAlt = Math.min(minAlt, sim.bestAlt); maxAlt = Math.max(maxAlt, sim.bestAlt);
}
log(`full runs, perfect bot: 20 runs of 300 s, ${landA} landings, ${fallsA} falls; altitude ${minAlt.toFixed(0)}..${maxAlt.toFixed(0)} m`);
if (fallsA > 1) fail('a perfect bot should not fall in the full world');
{ // zero input never leaves the parking lot, and below 150 m idling is safe forever
  const sim = new Sim(9, 780); let t = 0; while (t < 180 && sim.alive) { sim.step(1 / 60, 0); t += 1 / 60; }
  if (!sim.alive || sim.maxLevel > 0) fail('zero input should bounce on the parking lot forever'); else log('idle on the lot: safe for 180 s');
}
{ // idle at 400 m: the weather line gets you within 12 s
  const sim = new Sim(9, 780); sim.warp(400); let t = 0; while (t < 30 && sim.alive) { sim.step(1 / 60, 0); t += 1 / 60; }
  if (sim.alive || t > 12) fail(`idle at 400 m should die within 12 s (t=${t.toFixed(1)})`); else log(`idle at 400 m: the weather line wins after ${t.toFixed(1)} s`);
}

// ---- 5. rule checks ----
const L = (id, y, level, x) => ({ id, type: 'rock', x: x || 100, ax: x || 100, y, w: 76, level, spine: true, state: 'ok', ct: 0, vy: 0, wob: 0, amp: 0, sp: 0, ph: 0 });
function dropOn(sim, l, vx) { sim.ledges.push(l); sim.p.x = l.x; sim.p.y = l.y - 1; sim.p.vy = 50; sim.p.vx = vx || 0; sim.events.length = 0; sim.step(1 / 60, 0); return sim.events.find(e => e.type === 'land'); }
{
  const sim = new Sim(5, 780); sim.creep = false; sim.ledges = [];
  let e = dropOn(sim, L(901, -150, 1));
  if (!e || sim.streak !== 1) fail('new higher landing should start a streak'); else log('rule: new higher ledge => streak 1');
  e = dropOn(sim, L(902, -150, 1, 200));
  if (sim.streak !== 0) fail('repeat-level landing should end the streak'); else log('rule: same-level landing => streak reset');
  for (let i = 0; i < 4; i++) dropOn(sim, L(910 + i, -300 - i * 100, 2 + i));
  if (sim.mult !== 1 || sim.streak !== 4) fail('×1 for streak 0–4');
  e = dropOn(sim, L(920, -800, 6));
  if (sim.mult !== 2 || !e.step) fail('×2 at streak 5'); else log('rule: streak 5 => ×2 (step event)');
  for (let i = 0; i < 5; i++) dropOn(sim, L(930 + i, -900 - i * 100, 7 + i));
  if (sim.mult !== 3) fail('×3 at 10');
  for (let i = 0; i < 5; i++) dropOn(sim, L(940 + i, -1500 - i * 100, 12 + i));
  if (sim.mult !== 4) fail('×4 at 15');
  for (let i = 0; i < 10; i++) dropOn(sim, L(950 + i, -2100 - i * 100, 17 + i));
  if (sim.mult !== 5 || sim.streak !== 25) fail('×5 cap at 20+'); else log('rule: ×3 at 10, ×4 at 15, ×5 cap from 20 OK');
  const before = sim.score; e = dropOn(sim, L(990, -3000, 26, 250));
  const bankEv = sim.events.find(x => x.type === 'streakEnd');
  if (sim.streak !== 0 || sim.score - before < 10 * 25 * 25) fail('streak ≥5 ending on a repeat should bank 10 × streak²'); else log(`rule: repeat landing banks ${10 * 25 * 25} for a streak of 25`);
  for (let i = 0; i < 6; i++) dropOn(sim, L(1000 + i, -3100 - i * 100, 27 + i));
  const sc = sim.score; sim.knock();
  if (sim.streak !== 0 || sim.mult !== 1 || sim.score !== sc) fail('a hit should reset the streak and bank nothing'); else log('rule: hazard hit => streak reset, nothing banked');
}
{ // a fall banks the open streak (same 10 × streak² rule), so score never depends on a hidden step-back
  const sim = new Sim(5, 780); sim.creep = false; sim.ledges = [];
  for (let i = 0; i < 7; i++) dropOn(sim, L(3000 + i, -150 - i * 100, 1 + i));
  const sc = sim.score; sim.ledges = []; sim.p.y = sim.camTop + sim.H + 200; sim.p.vy = 400; sim.events.length = 0; sim.step(1 / 60, 0);
  const fe = sim.events.find(x => x.type === 'fell');
  if (sim.alive || !fe || fe.bank !== 490 || Math.round(sim.score - sc) !== 490) fail(`a fall with streak 7 should bank 490 (got ${fe && fe.bank}, +${(sim.score - sc).toFixed(0)})`); else log('rule: a fall banks the open streak (streak 7 => +490)');
}
{ // ice: no landing grip and half steering for ICE_SLIP seconds
  const sim = new Sim(5, 780); sim.creep = false; sim.ledges = [];
  const li = Object.assign(L(3100, -150, 1), { type: 'ice' }); dropOn(sim, li, 200);
  const vIce = sim.p.vx, slip = sim.p.slip;
  sim.ledges = []; dropOn(sim, L(3101, -300, 2), 200);
  if (!(slip > 0.3) || !(vIce > sim.p.vx + 15)) fail(`ice landing should keep speed and set slip (vx ${vIce.toFixed(0)} vs rock ${sim.p.vx.toFixed(0)}, slip ${slip})`); else log(`rule: ice keeps sideways speed (${vIce.toFixed(0)} vs ${sim.p.vx.toFixed(0)} on rock) and halves steering for ${C.ICE_SLIP} s`);
}
{ // one jump height, always: apex over 200 normal landings at any speed or streak
  const sim = new Sim(11, 780); sim.creep = false; let lo = 1e9, hi = -1e9;
  for (let i = 0; i < 200; i++) {
    sim.ledges = []; sim.p.hit = 0;
    const l = L(2000 + i, -200 - i * 50, i % 3 === 0 ? 1 : i + 2, 180);
    dropOn(sim, l, (i * 37) % 600 - 300);
    const y0 = l.y; let minY = y0;
    for (let k = 0; k < 90; k++) { sim.step(1 / 120, i % 2 ? 1 : -1); minY = Math.min(minY, sim.p.y); if (sim.p.vy > 0) break; }
    const apex = y0 - minY; lo = Math.min(lo, apex); hi = Math.max(hi, apex);
  }
  if (hi - lo > 2) fail(`apex varies ${lo.toFixed(1)}..${hi.toFixed(1)}`); else log(`apex: ${lo.toFixed(1)}..${hi.toFixed(1)} px over 200 bounces (≤ 2 px spread)`);
}
{ // daily determinism: same seed, same mountain
  const a = new Sim(424242, 780), b = new Sim(424242, 780);
  while (a.ledges.length < 200) a.genRow(); while (b.ledges.length < 200) b.genRow();
  const same = a.ledges.slice(0, 200).every((l, i) => { const m = b.ledges[i]; return l.x === m.x && l.y === m.y && l.type === m.type && l.w === m.w; });
  if (!same) fail('same seed must give the same first 200 ledges'); else log('daily: same seed gives identical first 200 ledges');
}
log(fails ? `\n${fails} FAILURES` : '\nALL REACHABILITY CHECKS PASSED');
process.exit(fails ? 1 : 0);
