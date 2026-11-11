/* Camel's Hump Hop — WebAudio synth sound, a light music loop, haptics. No audio files. */
(function () {
  'use strict';
  const KEY = 'chh.audio';
  const Snd = {
    ctx: null, master: null, sfxGain: null, musicGain: null, sfxOn: true, musicOn: true, started: false,
    _noiseBuf: null, _timer: null, _next: 0, _step: 0, zoneIdx: 0,

    load() { try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); if (typeof s.sfx === 'boolean') this.sfxOn = s.sfx; if (typeof s.music === 'boolean') this.musicOn = s.music; } catch (e) { /* */ } },
    save() { try { localStorage.setItem(KEY, JSON.stringify({ sfx: this.sfxOn, music: this.musicOn })); } catch (e) { /* */ } },

    unlock() {                                   // call from a user gesture (iOS)
      try {
        if (!this.ctx) {
          const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
          this.ctx = new AC();
          this.master = this.ctx.createGain(); this.master.gain.value = 0.9;
          const comp = this.ctx.createDynamicsCompressor(); this.master.connect(comp); comp.connect(this.ctx.destination);
          this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = this.sfxOn ? 0.8 : 0;
          this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = this.musicOn ? 0.45 : 0;
          this.sfxGain.connect(this.master); this.musicGain.connect(this.master);
          const len = this.ctx.sampleRate; this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
          const d = this._noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        }
        if (this.ctx.state !== 'running') this.ctx.resume();
        this.started = true; this.startMusic();
      } catch (e) { /* no audio */ }
    },
    suspend() { try { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); } catch (e) { /* */ } },
    resume() { try { if (this.ctx && this.ctx.state !== 'running' && this.started) this.ctx.resume(); } catch (e) { /* */ } },
    setSfx(on) { this.sfxOn = on; if (this.sfxGain) this.sfxGain.gain.value = on ? 0.8 : 0; this.save(); },
    setMusic(on) { this.musicOn = on; if (this.musicGain) this.musicGain.gain.value = on ? 0.45 : 0; this.save(); },

    tone(freq, dur, type, vol, slideTo, delay, dest) {
      if (!this.ctx || (!this.sfxOn && !dest)) return;
      const t0 = this.ctx.currentTime + (delay || 0);
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(dest || this.sfxGain); o.start(t0); o.stop(t0 + dur + 0.03);
    },
    noise(dur, vol, ff, ft, delay, slideTo) {
      if (!this.ctx || !this.sfxOn) return;
      const t0 = this.ctx.currentTime + (delay || 0);
      const s = this.ctx.createBufferSource(); s.buffer = this._noiseBuf;
      const f = this.ctx.createBiquadFilter(); f.type = ft || 'highpass'; f.frequency.setValueAtTime(ff || 2000, t0);
      if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      const g = this.ctx.createGain(); g.gain.setValueAtTime(vol || 0.2, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      s.connect(f); f.connect(g); g.connect(this.sfxGain); s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.03);
    },

    ladder: [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31],
    pitch(step) { const s = this.ladder[Math.min(step, this.ladder.length - 1)]; return 392 * Math.pow(2, s / 12); },

    bounce(v) { const f = 210 + (v || 0) * 70; this.tone(f, 0.12, 'sine', 0.18, f * 1.9); this.noise(0.05, 0.05, 1500, 'bandpass'); },
    combo(chain) {                                // rising pentatonic per chain step
      const f = this.pitch(chain);
      this.tone(f, 0.2, 'triangle', 0.26); this.tone(f * 2, 0.12, 'sine', 0.09, 0, 0.02);
      if (chain >= 4) this.tone(f * 1.5, 0.18, 'triangle', 0.1, 0, 0.06);
    },
    spring() { this.tone(180, 0.3, 'sine', 0.3, 760); this.tone(520, 0.22, 'triangle', 0.14, 1400, 0.03); this.noise(0.12, 0.06, 3000, 'highpass'); },
    crumble() { this.noise(0.28, 0.2, 700, 'lowpass'); this.noise(0.16, 0.12, 2500, 'bandpass', 0.05); this.tone(110, 0.2, 'square', 0.06, 60); },
    ice() { this.tone(1200, 0.1, 'sine', 0.1, 1700); },
    updraft() { this.noise(0.6, 0.1, 400, 'bandpass', 0, 2400); this.tone(300, 0.5, 'sine', 0.08, 900); },
    caw() { this.tone(520, 0.12, 'sawtooth', 0.09, 320); this.tone(480, 0.14, 'sawtooth', 0.09, 280, 0.14); },
    warn() { this.tone(880, 0.07, 'square', 0.05); this.tone(880, 0.07, 'square', 0.05, 0, 0.12); },
    whoosh() { this.noise(1.2, 0.1, 500, 'bandpass', 0, 1800); },
    thud() { this.tone(120, 0.12, 'sine', 0.25, 60); },
    hit() { this.tone(240, 0.3, 'sawtooth', 0.16, 70); this.noise(0.18, 0.2, 1200, 'bandpass'); },
    zone() { [0, 7, 12, 16].forEach((s, i) => this.tone(523.25 * Math.pow(2, s / 12), 0.35, 'triangle', 0.14, 0, i * 0.09)); },
    best() { [0, 4, 7, 12, 16, 19].forEach((s, i) => this.tone(523.25 * Math.pow(2, s / 12), 0.3, 'triangle', 0.16, 0, i * 0.07)); },
    fall() { this.tone(520, 1.3, 'sine', 0.2, 70); this.noise(1.1, 0.1, 3000, 'bandpass', 0, 300); },
    over() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.34, 'triangle', 0.18, 0, i * 0.18 + 0.1)); },
    click() { this.tone(660, 0.05, 'triangle', 0.12); },
    perfect(chain) { const f = 1568 * Math.pow(2, Math.min(chain || 0, 8) / 24); this.tone(f, 0.09, 'sine', 0.12); this.tone(f * 1.5, 0.14, 'sine', 0.07, 0, 0.05); },
    tick(k) { this.tone(1400 - (k || 0) * 120, 0.045, 'square', 0.05); },               // chain about to run out
    bank(chain) { const f = this.pitch(Math.min(chain || 2, 10)); this.tone(f, 0.12, 'triangle', 0.14); this.tone(f * 1.5, 0.22, 'triangle', 0.14, 0, 0.09); },

    // ---- music: a light folk-pop loop. 16th-note scheduler, 4-bar progression, layers build with zone and chain ----
    intensity: 0, title: false,
    startMusic() { if (this._timer || !this.ctx) return; this._next = this.ctx.currentTime + 0.15; this._step = 0; this._timer = setInterval(() => this._sched(), 60); },
    _mt(f, dur, type, vol, t0, slide) {          // music tone at absolute time t0
      const c = this.ctx, o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t0); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(this.musicGain); o.start(t0); o.stop(t0 + dur + 0.05);
    },
    _pad(freqs, dur, vol, t0) {                  // soft detuned saw chord through a lowpass
      const c = this.ctx, f = c.createBiquadFilter(), g = c.createGain();
      f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 0.3;
      g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.25); g.gain.setValueAtTime(vol, t0 + dur - 0.3); g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
      f.connect(g); g.connect(this.musicGain);
      for (const fr of freqs) for (const d of [-6, 6]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.detune.value = d; o.connect(f); o.start(t0); o.stop(t0 + dur + 0.05); }
    },
    _hit(kind, t0, vol) {                         // percussion from the noise buffer / a sine drop
      const c = this.ctx;
      if (kind === 'kick') { this._mt(130, 0.16, 'sine', vol, t0, 45); this._mt(1100, 0.018, 'triangle', vol * 0.35, t0, 500); return; }   // + a click so phone speakers hear it
      const s = c.createBufferSource(); s.buffer = this._noiseBuf;
      const f = c.createBiquadFilter(), g = c.createGain(), dur = kind === 'hat' ? 0.04 : 0.11;
      f.type = kind === 'hat' ? 'highpass' : 'bandpass'; f.frequency.value = kind === 'hat' ? 7000 : 1800;
      g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      s.connect(f); f.connect(g); g.connect(this.musicGain); s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.02);
    },
    _sched() {
      if (!this.ctx || this.ctx.state !== 'running' || !this.musicOn) { if (this.ctx) this._next = Math.max(this._next, this.ctx.currentTime + 0.05); return; }
      const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
      const progA = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];      // Am F C G
      const progB = [[53, 57, 60], [55, 59, 62], [52, 55, 59], [57, 60, 64]];      // F G Em Am (the bridge)
      const mel = [76, -1, 72, 74, 76, -1, 79, -1, 76, 74, 72, -1, 69, -1, 72, -1,   // two-bar pentatonic hook, then an answer
                   74, -1, 72, 69, 67, -1, 69, -1, 72, -1, 74, 76, 74, -1, -1, -1,
                   76, -1, 79, 81, 79, -1, 76, -1, 74, 76, 74, 72, 69, -1, 72, -1,
                   67, -1, 69, 72, 74, -1, 72, -1, 69, -1, -1, -1, 67, -1, 69, -1];
      const melB = [81, -1, -1, 79, 77, -1, 76, -1, 74, -1, 76, 77, 79, -1, -1, -1,   // longer, higher bridge line
                    79, -1, -1, 77, 76, -1, 74, -1, 71, -1, 72, 74, 76, -1, -1, -1,
                    76, -1, 74, 72, 71, -1, 72, -1, 74, -1, 76, -1, 79, -1, 76, -1,
                    76, -1, -1, 74, 72, -1, 71, -1, 69, -1, -1, -1, 72, -1, 76, -1];
      const hot = this.intensity;
      while (this._next < this.ctx.currentTime + 0.25) {
        // song form A A' B A (16 bars): A' lifts the melody an octave, B is the bridge with a drum fill on its last bar
        if (this._z == null || this._step % 64 === 0) this._z = this.title ? 0 : Math.min(this.zoneIdx, 7);   // tempo/key change only at a phrase start
        const z = this._z, bpm = 100 + z * 3.5, s16 = 60 / bpm / 4, key = [0, 0, 2, 2, 3, 5, 5, 7][z];   // the key only ever lifts as you climb
        const t0 = this._next, sec = ((this._step % 256) / 64) | 0, st = this._step % 64, bar = (st / 16) | 0, i = st % 16;
        const isB = sec === 2, ch = (isB ? progB : progA)[bar].map(m => m + key);
        if (i === 0) this._pad(ch.map(mf), s16 * 16, 0.022 + (z >= 3 ? 0.008 : 0), t0);
        // bass: root on 1, fifth on the "and" of 2, root on 3, walk-up pickup on 4
        const bassNote = i === 0 || i === 8 ? ch[0] - 12 : i === 6 ? ch[2] - 12 : i === 14 ? ch[0] - 10 : null;     // 87–150 Hz: audible on phone speakers
        if (bassNote != null) { this._mt(mf(bassNote), s16 * 2.2, 'triangle', 0.11, t0); this._mt(mf(bassNote) * 2, s16 * 1.2, 'sine', 0.05, t0); }
        // drums: kick on 1 and 3, shaker on off-beats, clap on 2 and 4 once you're in the trees
        if (!this.title) {
          if (i === 0 || i === 8 || (z >= 4 && i === 11)) this._hit('kick', t0, 0.16);
          if (i % 4 === 2) this._hit('hat', t0, 0.035); else if (z >= 2 && i % 2 === 1) this._hit('hat', t0, 0.014);
          if (z >= 1 && (i === 4 || i === 12)) this._hit('clap', t0, 0.05);
          if (isB && bar === 3 && i >= 12) this._hit('clap', t0, 0.03 + (i - 12) * 0.012);     // fill back into the hook
        }
        // melody: a plucky lead from the first trees on; title gets it softer
        const m = (isB ? melB : mel)[st], lift = sec === 1 && !this.title ? 12 : 0;
        if (m > 0) { const f = mf(m + key - 12 + lift); this._mt(f, s16 * 2.6, 'triangle', this.title || z === 0 ? 0.045 : 0.075, t0); this._mt(f * 2, s16 * 0.9, 'square', 0.008, t0); }
        // chain sparkle: a high arpeggio that only plays while you hold a combo chain
        if (hot >= 2 && i % 2 === 0) { const a = ch[(i / 2) % 3] + 24; this._mt(mf(a), s16 * 1.4, 'sine', Math.min(0.03, 0.012 + hot * 0.003), t0); }
        this._next += s16; this._step++;
      }
    },
    buzz(ms) { try { if (navigator.vibrate && this.sfxOn && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(ms); } catch (e) { /* iOS */ } },
  };
  Snd.load();
  window.Snd = Snd;
})();
