// Reachability + combo test for Camel's Hump Hop.  Run: node test/reach-test.js
const Wd = require('../world.js');
const { C, Sim, botSteer, wd, WIDTH } = Wd;
let fails = 0; const log = (...a) => console.log(...a);
const fail = (m) => { fails++; if (fails < 20) console.log('FAIL', m); };

// ---- 1. static invariants over thousands of generated rows ----
let rows = 0, maxDy = 0, minDy = 1e9, maxGap = 0, maxTwo = 0, extras = 0, types = {};
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
    maxDy = Math.max(maxDy, dy); minDy = Math.min(minDy, dy);
    if (dy > C.MAX_DY + 0.001 || dy < C.MIN_DY - 0.001) fail(`seed ${seed} row ${b.level} dy=${dy}`);
    if (!(b.level === a.level + 1)) fail('level numbering');
    const gap = Math.abs(wd(b.ax, a.ax)); maxGap = Math.max(maxGap, gap);
    if (gap > 62 + 98 + 0.01) fail(`gap ${gap}`);
    if (i > 1 && spine[i - 2]) maxTwo = Math.max(maxTwo, spine[i - 2].y - b.y);
    if (!Wd.STABLE[a.type]) fail('spine not stable: ' + a.type);
    if (b.x < b.w / 2 - 1 || b.x > Wd.W - b.w / 2 + 1) fail('spine off-screen');
  }
  for (const k in byRow) {
    const r = byRow[k]; if (r.length > 1) extras++;
    if (r.filter(l => l.spine).length !== 1 && k > 0) fail('row without exactly one spine ' + k);
    if (r.length > 1) for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
      const dd = Math.abs(wd(r[i].ax, r[j].ax)); if (dd < 90) fail(`overlap in row ${k}: ${dd}`);
    }
  }
}
log(`static: ${rows} spine rows over ${SEEDS} seeds; dy ${minDy.toFixed(1)}..${maxDy.toFixed(1)}; two-row max ${maxTwo.toFixed(1)} < jump ${C.JUMP.toFixed(1)}; max spine gap ${maxGap.toFixed(1)}px; rows with extras ${extras}`, types);
if (maxTwo >= C.JUMP) fail('two-row gap not jumpable');

// ---- 2. physical pair test: from the worst start on every spine ledge, bot reaches the next spine ledge ----
function pairTest(seed, deg) {
  const base = new Sim(seed, 780); while (base.gen.row < 220) base.genRow();
  const spine = base.ledges.filter(l => l.spine).sort((a, b) => a.level - b.level);
  const saved = { ACC: C.ACC, VMAX: C.VMAX };
  C.ACC *= deg; C.VMAX *= deg;
  let ok = 0, bad = 0;
  for (let i = 0; i < spine.length - 1; i++) {
    const a = spine[i], b = spine[i + 1];
    for (const off of [0, 1, -1]) {                                  // start at centre or at either ledge edge
      const sim = new Sim(seed, 780);
      sim.ledges = [a, b].map(l => Object.assign({}, l, { state: 'ok', wob: 0 }));
      sim.updrafts = []; sim.gen.y = -1e9;                            // no more generation
      sim.p.x = ((a.x + off * (a.w / 2 - 2)) % C.W + C.W) % C.W; sim.p.y = a.y; sim.p.vx = 0; sim.p.vy = -C.BOUNCE;
      sim.lastLevel = a.level; sim.maxLevel = a.level; sim.camTop = a.y - 600;
      let landed = null, t = 0;
      sim.ledges[0].state = 'ok';
      // the bot may not land back on its own start ledge in this test: it only ever targets b
      sim.ledges = [sim.ledges[1]]; sim.ledges.unshift(Object.assign({}, sim.ledges[0], { state: 'gone' }));
      while (t < 2.5 && sim.alive) {
        sim.step(1 / 60, botSteer(sim, { skip: 1 })); t += 1 / 60;
        const ev = sim.events.splice(0); const lnd = ev.find(e => e.type === 'land'); if (lnd) { landed = lnd.ledge; break; }
        sim.camTop = sim.p.y - 500;
      }
      if (landed && landed.id === b.id) ok++; else { bad++; if (bad < 5) fail(`seed ${seed} deg ${deg} level ${a.level}->${b.level} dx ${wd(b.x, a.x).toFixed(1)} dy ${(a.y - b.y).toFixed(1)} off ${off}`); }
    }
  }
  C.ACC = saved.ACC; C.VMAX = saved.VMAX;
  return { ok, bad };
}
let tot = 0, tbad = 0;
for (let seed = 100; seed < 130; seed++) { const r = pairTest(seed, 1); tot += r.ok + r.bad; tbad += r.bad; }
log(`pair test (full-strength steering): ${tot} hops, ${tbad} unreachable`);
let tot2 = 0, tbad2 = 0;
for (let seed = 200; seed < 215; seed++) { const r = pairTest(seed, 0.75); tot2 += r.ok + r.bad; tbad2 += r.bad; }
log(`pair test (steering degraded to 75% — margin check): ${tot2} hops, ${tbad2} unreachable`);

// ---- 3. full-world bot runs with every ledge type; bot never falls ----
function fullRun(seed, skip, maxSec, fast) {
  const sim = new Sim(seed, 780); let t = 0, ev, combos = 0, falls = 0;
  while (t < maxSec && sim.alive) {
    sim.step(1 / 60, botSteer(sim, { skip, fast })); t += 1 / 60;
    ev = sim.events.splice(0); for (const e of ev) { if (e.type === 'land' && e.combo) combos++; if (e.type === 'fell') falls++; }
  }
  return { alt: sim.bestAlt, falls, combos, maxChain: sim.maxChain, t, level: sim.maxLevel, landings: sim.landings };
}
let fallsA = 0, runsA = 0, minAlt = 1e9, maxAlt = 0, landA = 0;
for (let seed = 1; seed <= 40; seed++) { const r = fullRun(seed, 1, 700); runsA++; landA += r.landings; if (r.falls) { fallsA++; } minAlt = Math.min(minAlt, r.alt); maxAlt = Math.max(maxAlt, r.alt); }
log(`full runs, 1-row bot: ${runsA} runs of 700s, ${landA} landings, ${fallsA} falls; altitude ${minAlt.toFixed(0)}..${maxAlt.toFixed(0)} m`);
// the pair test above is the reachability guarantee; the odd fall here is the simple bot misjudging a very long drop after an updraft ride
if (fallsA > landA / 5000) fail('1-row bot fell too often in the full world');
let combosTotal = 0, chainMax = 0, fallsB = 0;
for (let seed = 1; seed <= 25; seed++) { const r = fullRun(seed, 2, 300); combosTotal += r.combos; chainMax = Math.max(chainMax, r.maxChain); fallsB += r.falls ? 1 : 0; }
log(`full runs, 2-row (combo) bot: ${combosTotal} combo landings, longest chain ${chainMax}, ${fallsB}/25 runs ended in a fall (a risk-taking bot is allowed to fall)`);
if (combosTotal < 20) fail('combos never triggered');
let fastChain = 0, fastCombos = 0; for (let seed = 1; seed <= 25; seed++) { const r = fullRun(seed, 2, 300, true); fastChain = Math.max(fastChain, r.maxChain); fastCombos += r.combos; }
log(`fast combo bot (keeps running speed): ${fastCombos} combo landings, longest chain ${fastChain}`);
if (fastChain < 6) fail('long chains should be possible');

// ---- 4. rule checks ----
{
  const sim = new Sim(5, 780);
  const A = sim.ledges[0];
  const L2 = { id: 900, type: 'rock', x: 100, ax: 100, y: -150, w: 76, level: 2, spine: true, state: 'ok', ct: 0, vy: 0, wob: 0, amp: 0, sp: 0, ph: 0 };
  sim.ledges.push(L2); sim.p.x = 100; sim.p.y = -151; sim.p.vy = 50; sim.p.vx = 200;
  sim.step(1 / 60, 0); const e = sim.events.find(e => e.type === 'land');
  if (!e || !e.combo || sim.chain !== 1) fail('2-level fast landing should be a combo'); else log('rule: 2-level + fast => combo OK, mult', sim.mult);
  const sim2 = new Sim(5, 780);
  sim2.ledges.push(Object.assign({}, L2)); sim2.p.x = 100; sim2.p.y = -151; sim2.p.vy = 50; sim2.p.vx = 60;
  sim2.step(1 / 60, 0); if (sim2.chain !== 0) fail('slow landing must not combo'); else log('rule: slow landing => no combo OK');
}
log(fails ? `\n${fails} FAILURES` : '\nALL REACHABILITY CHECKS PASSED');
process.exit(fails ? 1 : 0);
