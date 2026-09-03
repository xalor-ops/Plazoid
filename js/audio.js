// Procedural audio (Web Audio): engine, boost, jumps, ball impacts, boost pads, bumps/demos, goal explosion + crowd,
// countdown, UI, ambience and a synth menu music loop. No external files.
window.RL = window.RL || {};
RL.Audio = (function () {
  const U = RL.U;
  let ctx = null, master, sfx, music, amb, noiseBuf, ready = false, unlocked = false;
  const vol = { master: 0.8, sfx: 0.9, music: 0.5 };
  let listener = { pos: new THREE.Vector3() };
  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = vol.master; master.connect(ctx.destination);
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -12; comp.knee.value = 20; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
      comp.connect(master);
      sfx = ctx.createGain(); sfx.gain.value = vol.sfx; sfx.connect(comp);
      music = ctx.createGain(); music.gain.value = vol.music; music.connect(comp);
      amb = ctx.createGain(); amb.gain.value = 0.35; amb.connect(comp);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      ready = true;
    } catch (e) { console.warn('audio unavailable', e); return false; }
    return true;
  }
  function unlock() { if (!ensure()) return; if (ctx.state === 'suspended') ctx.resume(); unlocked = true; }
  function setVolumes(v) { Object.assign(vol, v); if (!ctx) return; master.gain.value = vol.master; sfx.gain.value = vol.sfx; music.gain.value = vol.music; }
  const now = () => ctx.currentTime;
  function env(g, t0, a, peak, d, sustain, r) {
    g.gain.cancelScheduledValues(t0); g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0001), t0 + a);
    if (sustain !== undefined) { g.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t0 + a + d); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d + r); }
    else g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }
  function osc(type, f, t0, dur, gain, dest, sweepTo, detune) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t0); if (detune) o.detune.value = detune;
    if (sweepTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, sweepTo), t0 + dur);
    const g = ctx.createGain(); o.connect(g); g.connect(dest || sfx);
    o.start(t0); o.stop(t0 + dur + 0.05);
    return { o, g };
  }
  function noise(t0, dur, dest, filterType, freq, q, sweepTo) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.playbackRate.value = 1;
    const f = ctx.createBiquadFilter(); f.type = filterType || 'bandpass'; f.frequency.setValueAtTime(freq || 1000, t0); if (q) f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t0 + dur);
    const g = ctx.createGain(); s.connect(f); f.connect(g); g.connect(dest || sfx);
    s.start(t0); s.stop(t0 + dur + 0.05);
    return { s, f, g };
  }
  function distGain(pos, ref) { if (!pos) return 1; const d = pos.distanceTo(listener.pos); return U.clamp((ref || 1800) / Math.max(200, d), 0.08, 1); }

  // ------------- one-shots -------------
  const S = {
    jump(g) { const t = now(); const n = noise(t, 0.09, sfx, 'lowpass', 900); env(n.g, t, 0.005, 0.25 * g, 0.08); const o = osc('sine', 260, t, 0.09, 0, sfx, 110); env(o.g, t, 0.003, 0.22 * g, 0.08); },
    flip(g) { const t = now(); const n = noise(t, 0.32, sfx, 'bandpass', 500, 1.2, 1400); env(n.g, t, 0.03, 0.2 * g, 0.28); },
    land(g, s) { const t = now(); const k = U.clamp(s / 900, 0.15, 1); const n = noise(t, 0.12, sfx, 'lowpass', 420); env(n.g, t, 0.004, 0.45 * g * k, 0.11); const o = osc('sine', 95, t, 0.12, 0, sfx, 45); env(o.g, t, 0.003, 0.5 * g * k, 0.1); },
    ballHit(g, s) {
      const t = now(); const k = U.clamp(s / 1800, 0.12, 1);
      const o = osc('sine', 170 + 60 * k, t, 0.09, 0, sfx, 55); env(o.g, t, 0.002, 0.9 * g * k, 0.085);
      const o2 = osc('triangle', 420, t, 0.05, 0, sfx, 200); env(o2.g, t, 0.001, 0.35 * g * k, 0.045);
      const n = noise(t, 0.05, sfx, 'bandpass', 1400 + 1500 * k, 0.8); env(n.g, t, 0.001, 0.5 * g * k, 0.045);
      if (k > 0.55) { const n2 = noise(t, 0.03, sfx, 'highpass', 3500); env(n2.g, t, 0.001, 0.25 * g * (k - 0.5), 0.028); }
    },
    bounce(g, s) { const t = now(); const k = U.clamp(s / 1500, 0.1, 1); const o = osc('sine', 120, t, 0.1, 0, sfx, 50); env(o.g, t, 0.002, 0.45 * g * k, 0.09); const n = noise(t, 0.06, sfx, 'lowpass', 700); env(n.g, t, 0.002, 0.3 * g * k, 0.055); },
    padSmall(g) { const t = now(); const o = osc('sine', 1046, t, 0.09, 0, sfx, 1400); env(o.g, t, 0.003, 0.22 * g, 0.085); const o2 = osc('sine', 2093, t, 0.05, 0, sfx); env(o2.g, t, 0.002, 0.08 * g, 0.045); },
    padBig(g) { const t = now(); const o = osc('sine', 220, t, 0.28, 0, sfx, 440); env(o.g, t, 0.01, 0.45 * g, 0.26); const o2 = osc('sine', 1318, t, 0.22, 0, sfx, 1760); env(o2.g, t, 0.01, 0.16 * g, 0.2); const n = noise(t, 0.25, sfx, 'bandpass', 900, 1, 2600); env(n.g, t, 0.02, 0.18 * g, 0.22); },
    bump(g, s) { const t = now(); const k = U.clamp(s / 2000, 0.3, 1); const n = noise(t, 0.12, sfx, 'bandpass', 700, 0.7); env(n.g, t, 0.002, 0.6 * g * k, 0.11); const o = osc('square', 130, t, 0.06, 0, sfx, 70); env(o.g, t, 0.002, 0.25 * g * k, 0.055); const o2 = osc('sine', 2400, t, 0.03, 0, sfx, 900); env(o2.g, t, 0.001, 0.15 * g * k, 0.028); },
    demo(g) { const t = now(); const n = noise(t, 0.6, sfx, 'lowpass', 2600, 0.5, 120); env(n.g, t, 0.005, 0.9 * g, 0.55); const o = osc('sine', 70, t, 0.5, 0, sfx, 30); env(o.g, t, 0.005, 0.8 * g, 0.45); },
    wallhit(g, s) { const t = now(); const k = U.clamp(s / 1500, 0.15, 1); const n = noise(t, 0.1, sfx, 'lowpass', 600); env(n.g, t, 0.003, 0.5 * g * k, 0.09); const o = osc('sine', 110, t, 0.1, 0, sfx, 50); env(o.g, t, 0.002, 0.4 * g * k, 0.09); },
    goal() {
      const t = now();
      const n = noise(t, 1.1, sfx, 'lowpass', 4200, 0.6, 90); env(n.g, t, 0.01, 1.0, 1.0);
      const o = osc('sine', 60, t, 0.9, 0, sfx, 28); env(o.g, t, 0.005, 1.0, 0.8);
      // power chord sting
      const chord = [82.41, 123.47, 164.81, 246.94];
      chord.forEach((f, i) => { for (const dt of [-6, 6]) { const s = osc('sawtooth', f, t + 0.02, 1.6, 0, sfx, f * 0.995, dt); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(2200, t); lp.frequency.exponentialRampToValueAtTime(300, t + 1.5); s.o.disconnect(); s.o.connect(lp); lp.connect(s.g); env(s.g, t + 0.02, 0.04, 0.16 - i * 0.02, 1.4); } });
      S.cheer(1.0, 3.5);
    },
    cheer(g, dur) {
      const t = now();
      const n = noise(t, dur, amb, 'bandpass', 950, 0.6); n.g.gain.setValueAtTime(0.0001, t); n.g.gain.exponentialRampToValueAtTime(0.9 * g, t + 0.35); n.g.gain.setValueAtTime(0.9 * g, t + dur * 0.45); n.g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const n2 = noise(t, dur, amb, 'bandpass', 1900, 0.8); n2.g.gain.setValueAtTime(0.0001, t); n2.g.gain.exponentialRampToValueAtTime(0.35 * g, t + 0.4); n2.g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 5.5; const lg = ctx.createGain(); lg.gain.value = 250; lfo.connect(lg); lg.connect(n.f.frequency); lfo.start(t); lfo.stop(t + dur);
    },
    beep(n) { const t = now(); const f = n === 0 ? 990 : 660; const o = osc('square', f, t, n === 0 ? 0.35 : 0.13, 0, sfx); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; o.o.disconnect(); o.o.connect(lp); lp.connect(o.g); env(o.g, t, 0.005, 0.28, n === 0 ? 0.33 : 0.12); if (n === 0) { const o2 = osc('square', 1980, t, 0.3, 0, sfx); env(o2.g, t, 0.005, 0.08, 0.28); } },
    whistle() { const t = now(); const o = osc('sine', 2200, t, 0.5, 0, sfx, 2600); env(o.g, t, 0.02, 0.2, 0.45); },
    ui(kind) {
      const t = now();
      if (kind === 'hover') { const o = osc('sine', 1500, t, 0.03, 0, sfx); env(o.g, t, 0.002, 0.07, 0.025); const n = noise(t, 0.015, sfx, 'highpass', 3000); env(n.g, t, 0.001, 0.05, 0.012); }
      else if (kind === 'select') { const o = osc('sine', 880, t, 0.08, 0, sfx); env(o.g, t, 0.003, 0.18, 0.075); const o2 = osc('sine', 1320, t + 0.03, 0.08, 0, sfx); env(o2.g, t + 0.03, 0.003, 0.14, 0.07); }
      else if (kind === 'back') { const o = osc('sine', 660, t, 0.1, 0, sfx, 440); env(o.g, t, 0.003, 0.16, 0.095); }
      else if (kind === 'found') { [660, 880, 1320].forEach((f, i) => { const o = osc('sine', f, t + i * 0.09, 0.25, 0, sfx); env(o.g, t + i * 0.09, 0.005, 0.2, 0.22); }); }
    }
  };

  // ------------- loops: engine, boost, supersonic, crowd -------------
  let engine = null, boostLoop = null, ssLoop = null, crowd = null;
  function startEngine() {
    if (engine || !ready) return;
    const t = now();
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; const o2 = ctx.createOscillator(); o2.type = 'square'; o2.detune.value = 7; const o3 = ctx.createOscillator(); o3.type = 'sine';
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.Q.value = 1.2;
    const g = ctx.createGain(); g.gain.value = 0;
    const g3 = ctx.createGain(); g3.gain.value = 0.15;
    o1.connect(lp); o2.connect(lp); o3.connect(g3); g3.connect(lp); lp.connect(g); g.connect(sfx);
    o1.start(t); o2.start(t); o3.start(t);
    engine = { o1, o2, o3, lp, g, g3 };
  }
  function stopEngine() { if (!engine) return; const t = now(); engine.g.gain.setTargetAtTime(0, t, 0.05); const e = engine; setTimeout(() => { try { e.o1.stop(); e.o2.stop(); e.o3.stop(); } catch (er) { } }, 300); engine = null; }
  function updateEngine(car, dt) {
    if (!ready || !unlocked) return;
    if (!engine) startEngine();
    const sp = car ? car.speed : 0; const th = car ? Math.abs(car.input.throttle) : 0;
    const base = 42 + (sp / 2300) * 130;
    const t = now();
    engine.o1.frequency.setTargetAtTime(base, t, 0.08); engine.o2.frequency.setTargetAtTime(base * 0.5, t, 0.08); engine.o3.frequency.setTargetAtTime(base * 6, t, 0.08);
    engine.lp.frequency.setTargetAtTime(380 + th * 500 + sp * 0.35, t, 0.1);
    const target = car && !car.demolished ? (0.045 + th * 0.06 + (sp / 2300) * 0.05) : 0;
    engine.g.gain.setTargetAtTime(target, t, 0.08);
    // boost loop
    const boosting = car && car.boosting && !car.demolished;
    if (boosting && !boostLoop) {
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.9;
      const lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 5000;
      const g = ctx.createGain(); g.gain.value = 0.0001;
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 58; const og = ctx.createGain(); og.gain.value = 0.35; const olp = ctx.createBiquadFilter(); olp.type = 'lowpass'; olp.frequency.value = 260;
      s.connect(bp); bp.connect(lp2); lp2.connect(g); o.connect(olp); olp.connect(og); og.connect(g); g.connect(sfx);
      s.start(t); o.start(t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.05);
      boostLoop = { s, bp, g, o, t0: t };
    }
    if (boostLoop) {
      if (!boosting) { const b = boostLoop; b.g.gain.setTargetAtTime(0.0001, t, 0.06); setTimeout(() => { try { b.s.stop(); b.o.stop(); } catch (e) { } }, 250); boostLoop = null; }
      else { boostLoop.bp.frequency.setTargetAtTime(700 + sp * 0.5, t, 0.1); boostLoop.o.frequency.setTargetAtTime(50 + sp * 0.02, t, 0.1); }
    }
    const ss = car && car.supersonic && !car.demolished;
    if (ss && !ssLoop) { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800; const g = ctx.createGain(); g.gain.value = 0.0001; s.connect(hp); hp.connect(g); g.connect(sfx); s.start(t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.2); ssLoop = { s, g }; }
    if (ssLoop && !ss) { const l = ssLoop; l.g.gain.setTargetAtTime(0.0001, t, 0.1); setTimeout(() => { try { l.s.stop(); } catch (e) { } }, 400); ssLoop = null; }
  }
  function stopLoops() { stopEngine(); const t = ctx ? now() : 0; if (boostLoop) { const b = boostLoop; b.g.gain.setTargetAtTime(0.0001, t, 0.05); setTimeout(() => { try { b.s.stop(); b.o.stop(); } catch (e) { } }, 250); boostLoop = null; } if (ssLoop) { const l = ssLoop; l.g.gain.setTargetAtTime(0.0001, t, 0.05); setTimeout(() => { try { l.s.stop(); } catch (e) { } }, 250); ssLoop = null; } }
  function startCrowd() {
    if (crowd || !ready) return;
    const t = now();
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 800; bp.Q.value = 0.5;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
    const g = ctx.createGain(); g.gain.value = 0.0001;
    s.connect(bp); bp.connect(lp); lp.connect(g); g.connect(amb); s.start(t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 1.5);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.23; const lg = ctx.createGain(); lg.gain.value = 0.05; lfo.connect(lg); lg.connect(g.gain); lfo.start(t);
    crowd = { s, g, lfo, bp };
  }
  function stopCrowd() { if (!crowd) return; const c = crowd; const t = now(); c.g.gain.setTargetAtTime(0.0001, t, 0.4); setTimeout(() => { try { c.s.stop(); c.lfo.stop(); } catch (e) { } }, 1500); crowd = null; }
  function setCrowdExcitement(x) { if (!crowd) return; const t = now(); crowd.g.gain.setTargetAtTime(0.16 + 0.3 * U.clamp(x, 0, 1), t, 0.5); crowd.bp.frequency.setTargetAtTime(800 + 500 * x, t, 0.5); }

  // ------------- music (step sequencer) -------------
  let seq = null, trackIdx = 0;
  const TRACKS = [
    { name: 'HIT THE FIELD [VIP Mix]', bpm: 126, root: 45, prog: [[0, 3, 7], [-4, 0, 3], [-7, -3, 0], [-5, -1, 2]], lead: [0, 7, 12, 7, 3, 7, 10, 7] },
    { name: 'SUPERSONIC', bpm: 132, root: 43, prog: [[0, 3, 7], [-2, 2, 5], [-4, 0, 3], [-5, -1, 2]], lead: [0, 3, 7, 12, 10, 7, 3, 5] },
    { name: 'MANNFIELD NIGHTS', bpm: 118, root: 40, prog: [[0, 4, 7], [-3, 0, 4], [-5, -1, 2], [-7, -3, 0]], lead: [0, 4, 7, 11, 12, 7, 4, 2] }
  ];
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function startMusic() {
    if (!ready || seq) return;
    const tr = TRACKS[trackIdx % TRACKS.length];
    const stepDur = 60 / tr.bpm / 4;
    seq = { tr, step: 0, next: now() + 0.1, stepDur, timer: null, bus: ctx.createGain() };
    seq.bus.gain.value = 0.0001; seq.bus.connect(music); seq.bus.gain.exponentialRampToValueAtTime(1, now() + 1.5);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5000; seq.padBus = ctx.createGain(); seq.padBus.gain.value = 0.5; seq.padBus.connect(lp); lp.connect(seq.bus);
    const tick = () => {
      if (!seq) return;
      while (seq.next < now() + 0.25) { scheduleStep(seq.step, seq.next); seq.step = (seq.step + 1) % 64; seq.next += stepDur; }
      seq.timer = setTimeout(tick, 60);
    };
    tick();
  }
  function scheduleStep(step, t) {
    const tr = seq.tr, bus = seq.bus; const bar = Math.floor(step / 16) % 4, s16 = step % 16;
    const chord = tr.prog[bar]; const root = tr.root;
    // kick
    if (s16 % 4 === 0) { const o = osc('sine', 150, t, 0.14, 0, bus, 38); env(o.g, t, 0.002, 0.9, 0.13); }
    // clap
    if (s16 === 4 || s16 === 12) { const n = noise(t, 0.12, bus, 'bandpass', 1800, 0.9); env(n.g, t, 0.002, 0.28, 0.1); }
    // hats
    if (s16 % 2 === 1) { const n = noise(t, 0.035, bus, 'highpass', 7000); env(n.g, t, 0.001, s16 % 4 === 3 ? 0.14 : 0.08, 0.03); }
    // bass (sidechained feel)
    if (s16 % 2 === 0) { const f = mtof(root - 12 + chord[0]); const o = osc('sawtooth', f, t, seq.stepDur * 1.8, 0, bus); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(400, t); lp.frequency.exponentialRampToValueAtTime(140, t + seq.stepDur * 1.6); o.o.disconnect(); o.o.connect(lp); lp.connect(o.g); env(o.g, t, 0.01, 0.42, seq.stepDur * 1.6); const o2 = osc('square', f, t, seq.stepDur * 1.8, 0, bus); env(o2.g, t, 0.01, 0.12, seq.stepDur * 1.6); }
    // pad chord (once per bar, sustained)
    if (s16 === 0) { for (const n of chord) { const f = mtof(root + n); for (const dt of [-8, 8]) { const o = osc('sawtooth', f, t, seq.stepDur * 16, 0, seq.padBus, f, dt); env(o.g, t, 0.3, 0.09, seq.stepDur * 16 - 0.6, 0.06, 0.4); } } }
    // arp lead (16ths)
    const ld = tr.lead[s16 % 8]; if (s16 % 2 === 0 || bar % 2 === 1) { const f = mtof(root + 12 + chord[(s16 >> 1) % 3] + (ld % 12 > 7 ? 0 : 0)); const o = osc('triangle', f * (s16 % 8 === 6 ? 2 : 1), t, 0.22, 0, bus); env(o.g, t, 0.005, 0.16, 0.2); const o2 = osc('square', f, t, 0.12, 0, bus); env(o2.g, t, 0.005, 0.045, 0.1); }
  }
  function stopMusic() { if (!seq) return; const s = seq; seq = null; clearTimeout(s.timer); const t = now(); s.bus.gain.setTargetAtTime(0.0001, t, 0.4); setTimeout(() => { try { s.bus.disconnect(); } catch (e) { } }, 2500); }
  function nextTrack() { trackIdx = (trackIdx + 1) % TRACKS.length; const was = !!seq; stopMusic(); if (was) setTimeout(startMusic, 300); return TRACKS[trackIdx].name; }
  function trackName() { return TRACKS[trackIdx % TRACKS.length].name; }

  function onEvent(e) {
    if (!ready || !unlocked) return;
    const g = distGain(e.pos || (e.car && e.car.pos));
    switch (e.type) {
      case 'jump': S.jump(g); break;
      case 'flip': S.flip(g); break;
      case 'land': if (e.speed > 120) S.land(g, e.speed); break;
      case 'ballHit': S.ballHit(Math.max(g, 0.5), e.speed + e.dv * 0.3); break;
      case 'bounce': S.bounce(g, e.speed); break;
      case 'pad': if (e.big) S.padBig(g); else S.padSmall(g); break;
      case 'bump': S.bump(g, e.speed); break;
      case 'demo': S.demo(Math.max(g, 0.6)); break;
      case 'wallhit': S.wallhit(g, e.speed); break;
      case 'goal': S.goal(); break;
      case 'countdown': S.beep(e.n); break;
      case 'whistle': S.whistle(); break;
    }
  }
  function ui(kind) { if (!ready || !unlocked) return; try { S.ui(kind); } catch (e) { } }
  function setListener(pos) { listener.pos.copy(pos); }
  return { ensure, unlock, setVolumes, onEvent, ui, updateEngine, stopLoops, startCrowd, stopCrowd, setCrowdExcitement, startMusic, stopMusic, nextTrack, trackName, setListener, get ready() { return ready; }, get unlocked() { return unlocked; }, vol };
})();
