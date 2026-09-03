// Match director: teams, kickoffs and countdown, fixed-step simulation, goals + explosion + replay,
// clock / overtime / zero-second rule, stats and score events, pause, match end.
window.RL = window.RL || {};
RL.Match = (function () {
  const C = RL.C, U = RL.U;
  const BOT_NAMES = ['Armstrong', 'Bandit', 'Beast', 'Boomer', 'Buzz', 'C-Block', 'Casper', 'Caveman', 'Centice', 'Chipper', 'Cougar', 'Dude', 'Foamer', 'Fury', 'Gerwin', 'Goose', 'Heater', 'Hollywood', 'Hound', 'Iceman', 'Imp', 'Jester', 'Junker', 'Khan', 'Marley', 'Maverick', 'Merlin', 'Middy', 'Mountain', 'Myrtle', 'Outlaw', 'Poncho', 'Rainmaker', 'Raja', 'Rex', 'Roundhouse', 'Sabretooth', 'Saltie', 'Samara', 'Scout', 'Shepard', 'Slider', 'Squall', 'Sticks', 'Stinger', 'Storm', 'Sultan', 'Sundown', 'Swabbie', 'Tex', 'Tusk', 'Viper', 'Wolfman', 'Yuri'];
  const H = 1 / C.PHYS_HZ;
  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

  class Match {
    constructor(game, cfg) {
      this.game = game; this.cfg = cfg;
      this.scene = game.scene; this.ball = game.ball; this.pads = game.arena.pads; this.camera = game.camera;
      this.cars = []; this.bots = []; this.player = null;
      this.phase = 'intro'; this.phaseT = 0; this.time = 0; this.acc = 0;
      this.score = [0, 0]; this.clock = cfg.length || C.MATCH_SECONDS; this.overtime = false; this.timeUp = false; this.ended = false;
      this.events = [];
      this.frames = []; this.replay = null; this.goalInfo = null;
      this.kickoffActive = false; this.kickoffTaker = null; this.kickoffT = 0;
      this.shot = null; this.sbTimer = 0; this.predCache = { step: -1, samples: [] }; this.stepCount = 0;
      this.paused = false; this.prevPhase = null; this.stats = { kickoffs: 0 };
      this.setup();
    }
    setup() {
      const g = this.game, s = g.settings;
      const n = this.cfg.mode === '3v3' ? 3 : this.cfg.mode === '2v2' ? 2 : 1;
      const pool = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
      let id = 0;
      const pcol = s.colors[0];
      this.player = new RL.Car({ team: 0, name: s.name, isBot: !!this.cfg.botPlayer, body: s.body, colors: pcol, id: id++ });
      this.cars.push(this.player);
      for (let team = 0; team < 2; team++) {
        const count = team === 0 ? n - 1 : n;
        for (let i = 0; i < count; i++) {
          const pal = team === 0 ? RL.PALETTE.blue : RL.PALETTE.orange;
          const colors = { primary: pal[Math.floor(Math.random() * 10)], accent: RL.PALETTE.accent[Math.floor(Math.random() * RL.PALETTE.accent.length)], wheel: RL.PALETTE.wheel[Math.floor(Math.random() * RL.PALETTE.wheel.length)] };
          const car = new RL.Car({ team, name: pool.pop(), isBot: true, body: Math.random() < 0.5 ? 'octane' : 'fennec', colors, id: id++ });
          this.cars.push(car);
        }
      }
      for (const car of this.cars) { this.scene.add(car.group); if (g.env) car.setEnv(g.env); RL.FX.attachCar(car); if (car.isBot) this.bots.push(new RL.Bot(car, this, s.bots)); }
      this.ball.reset(); this.ball.setVisible(true);
      RL.Arena.resetPads(this.pads);
      RL.HUD.resetShown(); RL.HUD.show(); RL.HUD.hideCenter(); RL.HUD.setReplay(false); RL.HUD.hideEnd(); RL.HUD.hidePause();
      RL.HUD.setScore(0, 0); RL.HUD.setTime(this.clock, false); RL.HUD.setBallCam(this.camera.ballCam);
      this.placeKickoff();
      this.phase = 'intro'; this.phaseT = 0;
      this.introFrom = new THREE.Vector3(-3300, -4300, 1500); this.introTo = new THREE.Vector3(-1500, -3100, 420);
      this.camera.mode = 'free';
      RL.Audio.startCrowd();
    }
    dispose() {
      for (const car of this.cars) { RL.FX.detachCar(car); this.scene.remove(car.group); car.model.dispose(); }
      this.cars = []; this.bots = [];
      RL.HUD.hide(); RL.HUD.hideEnd(); RL.HUD.hidePause(); RL.HUD.setReplay(false);
      RL.Audio.stopLoops(); RL.Audio.stopCrowd(); RL.FX.clear();
      this.ball.setVisible(true); this.ball.reset();
    }
    // ---------- kickoff ----------
    placeKickoff() {
      const n = this.cars.filter((c) => c.team === 0).length;
      const idx = [0, 1, 2, 3, 4].sort(() => Math.random() - 0.5);
      let picks;
      if (n === 1) picks = [idx[0]];
      else if (n === 2) picks = Math.random() < 0.5 ? [0, 1] : [idx.find((i) => i < 2), idx.find((i) => i >= 2)];
      else { picks = [0, 1, [2, 3, 4][Math.floor(Math.random() * 3)]]; }
      for (let team = 0; team < 2; team++) {
        const list = this.cars.filter((c) => c.team === team).sort(() => Math.random() - 0.5);
        list.forEach((car, i) => {
          const sp = C.SPAWNS[picks[i]];
          const sgn = team === 0 ? 1 : -1;
          car.reset(sp[0] * sgn, sp[1] * sgn, team === 0 ? sp[2] : sp[2] + Math.PI, 33.33);
          car.syncVisual(1);
        });
      }
      this.ball.reset(); this.ball.setVisible(true); this.ball.syncVisual();
      RL.Arena.resetPads(this.pads);
      // kickoff taker per team: the car closest to the ball
      this.kickoffTaker = null;
      for (const team of [0, 1]) { const list = this.cars.filter((c) => c.team === team); list.sort((a, b) => a.pos.length() - b.pos.length()); if (team === 1) this.kickoffTaker = list[0]; }
      this.kickoffTakers = [0, 1].map((t) => { const list = this.cars.filter((c) => c.team === t); list.sort((a, b) => a.pos.length() - b.pos.length()); return list[0]; });
      this.shot = null; this.frames.length = 0;
    }
    startCountdown() {
      this.placeKickoff();
      this.phase = 'countdown'; this.phaseT = 0; this.countShown = -1;
      this.camera.setFollow(); this.camera.snapTo(this.player, this.ball);
      RL.HUD.hideCenter(); RL.HUD.setReplay(false);
      this.ball.setVisible(true);
      if (this.overtime && !this.otAnnounced) { RL.HUD.showBig('OVERTIME', 'NEXT GOAL WINS', 'gold'); this.otAnnounced = true; }
    }
    // ---------- main update ----------
    update(dt) {
      const inp = RL.Input;
      // pause
      if (inp.consume('pause')) {
        if (this.paused) this.resume();
        else if (['countdown', 'play', 'goal', 'replay'].includes(this.phase)) this.pause();
      }
      if (this.paused) { this.updatePauseMenu(); return; }
      if (inp.consume('ballCam') && this.phase !== 'replay') { this.camera.toggleBallCam(); RL.HUD.setBallCam(this.camera.ballCam); RL.Audio.ui('hover'); }
      this.camera.rear = inp.state.rear && this.phase !== 'replay';
      this.phaseT += dt;
      switch (this.phase) {
        case 'intro': this.updateIntro(dt); break;
        case 'countdown': this.updateCountdown(dt); break;
        case 'play': case 'goal': this.updatePlay(dt); break;
        case 'replay': this.updateReplay(dt); break;
        case 'end': this.updateEnd(dt); break;
      }
      // scoreboard
      const sb = inp.isDown('Tab') || this.phase === 'end';
      if (sb) { this.sbTimer -= dt; if (this.sbTimer <= 0) { RL.HUD.renderScoreboard(this.cars, this.player, this.score); this.sbTimer = 0.3; } }
      RL.HUD.showScoreboard(sb && (this.phase !== 'end' || this.phaseT > 2.6));
      // visuals
      if (this.phase !== 'replay') {
        for (const car of this.cars) car.syncVisual(dt);
        this.ball.syncVisual();
      }
      const camPos = this.camera.cam.position;
      RL.FX.updateCars(this.cars, dt, camPos);
      RL.FX.updateBall(this.ball, dt, camPos);
      RL.FX.update(dt, this.game.time);
      RL.HUD.updatePlates(this.cars, this.player, this.camera.cam, window.innerWidth, window.innerHeight);
      RL.HUD.setBoost(this.player.boost);
      RL.Audio.setListener(camPos);
      RL.Audio.updateEngine(this.phase === 'replay' ? null : this.player, dt);
      // crowd excitement: ball near a goal or fast
      const ex = U.clamp((Math.abs(this.ball.pos.y) - 3000) / 2200, 0, 1) * 0.6 + U.clamp(this.ball.vel.length() / 4000, 0, 0.4);
      RL.Audio.setCrowdExcitement(this.phase === 'goal' ? 1 : ex);
    }
    updateIntro(dt) {
      const t = U.smoothstep(0, 2.6, this.phaseT);
      _v.lerpVectors(this.introFrom, this.introTo, t);
      _v2.set(0, 0, 200);
      this.camera.setFree(_v, _v2); this.camera.finalize(dt);
      if (this.phaseT > 2.7) { this.startCountdown(); }
    }
    updateCountdown(dt) {
      const remaining = 3 - this.phaseT;
      const n = Math.ceil(remaining);
      if (n !== this.countShown && n >= 1 && n <= 3) { this.countShown = n; RL.HUD.showCountdown(n); RL.Audio.onEvent({ type: 'countdown', n }); }
      // camera follows (players can look around)
      if (this.player.isBot) this.updateBotsInput(0);
      this.camera.update(dt, this.player, this.ball);
      if (remaining <= 0) {
        this.phase = 'play'; this.phaseT = 0; this.kickoffActive = true; this.kickoffT = 0; this.touchedSinceKickoff = false;
        RL.HUD.showCountdown(0); RL.Audio.onEvent({ type: 'countdown', n: 0 });
        this.acc = 0;
      }
    }
    updatePlay(dt) {
      // player input
      if (!this.player.isBot && !this.player.demolished) RL.Input.applyTo(this.player);
      // fixed-step simulation
      this.acc += Math.min(dt, 0.1);
      let steps = 0;
      while (this.acc >= H && steps < 10) {
        this.stepSim(H); this.acc -= H; steps++;
      }
      if (steps === 10) this.acc = 0;
      // clock
      if (this.phase === 'play') {
        if (!this.overtime) { this.clock -= dt; if (this.clock <= 0) { this.clock = 0; this.timeUp = true; } }
        else this.clock += dt;
        RL.HUD.setTime(this.clock, this.overtime);
        if (this.kickoffActive) { this.kickoffT += dt; if (this.kickoffT > 4 || this.touchedSinceKickoff) this.kickoffActive = false; }
        // zero-second rule
        if (this.timeUp && this.ball.pos.z < C.BALL_R + 4 && Math.abs(this.ball.vel.z) < 40) {
          if (this.score[0] === this.score[1]) { this.overtime = true; this.otAnnounced = false; this.startCountdown(); RL.Audio.onEvent({ type: 'whistle' }); }
          else this.endMatch();
          return;
        }
      } else if (this.phase === 'goal') {
        if (this.phaseT > 3.3) this.startReplay();
      }
      this.camera.update(dt, this.player, this.phase === 'goal' ? null : this.ball);
      this.recordFrame();
    }
    stepSim(h) {
      this.time += h; this.stepCount++;
      // bots at 60 Hz
      if (this.stepCount % 2 === 0) this.updateBotsInput(h * 2);
      RL.Physics.step({ cars: this.cars, ball: this.ball, pads: this.pads }, h, this.time, this.events);
      for (const car of this.cars) if (car.demolished && car.respawnT <= 0) { car.respawn(C.RESPAWNS[Math.floor(Math.random() * 4)]); car.syncVisual(1); }
      this.processEvents();
      if (this.phase === 'play') {
        const by = this.ball.pos.y;
        if (Math.abs(by) > C.GOAL_LINE + C.BALL_R) this.onGoal(by > 0 ? 0 : 1);
      }
    }
    updateBotsInput(dt) { for (const b of this.bots) b.update(dt, this.time); }
    processEvents() {
      const ev = this.events;
      for (const e of ev) {
        if (e.type === 'ballHit') {
          this.touchedSinceKickoff = true;
          this.onTouch(e);
        }
        if (e.type === 'demo' && e.attacker === this.player) RL.HUD.popup(25, 'DEMOLITION');
        RL.FX.onEvent(e, this.camera);
        RL.Audio.onEvent(e);
      }
      ev.length = 0;
    }
    onTouch(e) {
      const car = e.car;
      // save?
      if (this.shot && this.shot.team !== car.team && this.shot.onTarget) {
        car.stats.saves++; car.stats.score += 50; if (car === this.player) RL.HUD.popup(50, 'SAVE');
        this.shot = null;
      }
      // shot?
      const pred = this.predictBall(true);
      const oppY = car.team === 0 ? 5120 : -5120;
      let on = false;
      for (const s of pred) { if (s.t > 2.5) break; if ((oppY - s.p.y) * Math.sign(oppY) < 30 && Math.abs(s.p.x) < 950 && s.p.z < 700) { on = true; break; } }
      if (on && e.ballSpeed > 900) {
        if (!this.shot || this.shot.car !== car || this.time - this.shot.t > 1.5) { car.stats.shots++; car.stats.score += 10; if (car === this.player) RL.HUD.popup(10, 'SHOT ON GOAL'); }
        this.shot = { car, team: car.team, t: this.time, onTarget: true };
      } else if (this.shot && this.shot.team === car.team) { this.shot = { car, team: car.team, t: this.time, onTarget: false }; }
      else if (this.shot && this.shot.team !== car.team) this.shot = null;
      // center / clear (small points, natural feel)
      if (car === this.player && Math.abs(this.ball.pos.y) > 3000) {
        const defensive = (this.ball.pos.y * (car.team === 0 ? -1 : 1)) > 3000;
        if (defensive && e.ballSpeed > 1200 && (this.ball.vel.y * (car.team === 0 ? 1 : -1)) > 600) { car.stats.score += 20; RL.HUD.popup(20, 'CLEAR BALL'); }
        else if (!defensive && e.ballSpeed > 900 && Math.abs(this.ball.vel.x) > Math.abs(this.ball.vel.y) * 0.8 && Math.abs(this.ball.pos.x) > 1500) { car.stats.score += 20; RL.HUD.popup(20, 'CENTER BALL'); }
      }
    }
    // ---------- ball prediction (shared with bots) ----------
    predictBall(force) {
      const pc = this.predCache;
      if (!force && pc.step === this.stepCount) return pc.samples;
      const samples = pc.samples; samples.length = 0;
      const dt = 1 / 30, R = C.BALL_R;
      const p = _v.copy(this.ball.pos), v = _v2.copy(this.ball.vel), n = _v3;
      for (let i = 0; i < 120; i++) {
        v.z -= C.GRAVITY * dt; v.multiplyScalar(1 - C.BALL_DRAG * dt); p.addScaledVector(v, dt);
        const pen = RL.Arena.sphereContact(p, R, n);
        if (pen > 0) { p.addScaledVector(n, pen); const vn = v.dot(n); if (vn < 0) { v.addScaledVector(n, -(1 + (vn < -12 ? C.BALL_REST : 0)) * vn); v.multiplyScalar(0.92); } }
        samples.push({ t: (i + 1) * dt, p: p.clone(), v: v.clone() });
      }
      pc.step = this.stepCount;
      return samples;
    }
    // ---------- goals ----------
    onGoal(team) {
      this.score[team]++;
      RL.HUD.setScore(this.score[0], this.score[1]);
      const ball = this.ball;
      const lt = ball.lastTouch;
      let scorer = null, assist = null, ownGoal = false;
      if (lt && lt.team === team) { scorer = lt; if (ball.prevTouch && ball.prevTouch.team === team && ball.prevTouch !== lt && this.time - ball.prevTouchT < 6) assist = ball.prevTouch; }
      else if (lt) { ownGoal = true; scorer = lt; }
      const kph = ball.vel.length() * 0.036;
      if (scorer && !ownGoal) { scorer.stats.goals++; scorer.stats.score += 100; if (scorer === this.player) RL.HUD.popup(100, 'GOAL'); }
      if (assist) { assist.stats.assists++; assist.stats.score += 50; if (assist === this.player) RL.HUD.popup(50, 'ASSIST'); }
      this.goalInfo = { team, scorer: scorer ? scorer.name : RL.TEAM_NAME[team], scorerCar: scorer, ownGoal, kph, time: this.time, clock: this.clock, pos: ball.pos.clone() };
      RL.HUD.showGoal(team, this.goalInfo.scorer, kph, ownGoal);
      // explosion centered on the goal mouth so it is visible from the field
      const sg = Math.sign(ball.pos.y);
      const ex = new THREE.Vector3(U.clamp(ball.pos.x, -700, 700), sg * (C.ARENA_Y - 200), 230);
      RL.FX.goalExplosion(ex, team, sg);
      RL.HUD.goalFlash(team);
      this.camera.shake(34);
      RL.Audio.onEvent({ type: 'goal' });
      // shockwave pushes cars away from the mouth
      for (const car of this.cars) { _v.copy(car.pos).sub(ex); const d = _v.length(); if (d < 3200 && d > 1) { _v.multiplyScalar(1 / d); car.vel.addScaledVector(_v, 1700 * (1 - d / 3200) + 350); car.vel.z += 420 * (1 - d / 3200); car.grounded = false; } }
      ball.vel.set(0, 0, 0); ball.w.set(0, 0, 0); ball.setVisible(false); ball.pos.set(0, 0, -2000);
      this.phase = 'goal'; this.phaseT = 0;
      this.shot = null;
      if (this.timeUp || this.overtime) this.ended = true;
      this.game.onGoalScored && this.game.onGoalScored(team, scorer);
    }
    recordFrame() {
      const f = { t: this.time, ball: [this.ball.pos.x, this.ball.pos.y, this.ball.pos.z, this.ball.q.x, this.ball.q.y, this.ball.q.z, this.ball.q.w, this.ball.visible ? 1 : 0], cars: [] };
      for (const c of this.cars) f.cars.push([c.pos.x, c.pos.y, c.pos.z, c.q.x, c.q.y, c.q.z, c.q.w, c.boosting ? 1 : 0, c.demolished ? 0 : 1, c.supersonic ? 1 : 0]);
      this.frames.push(f);
      while (this.frames.length > 600 && this.frames[0].t < this.time - 9) this.frames.shift();
    }
    startReplay() {
      const gi = this.goalInfo;
      const start = gi.time - 5.6, end = gi.time + 0.9;
      const frames = this.frames.filter((f) => f.t >= start - 0.1 && f.t <= end);
      if (frames.length < 10) { this.afterGoal(); return; }
      this.replay = { frames, t: frames[0].t, end: frames[frames.length - 1].t, goalT: gi.time, shot: 0, camPos: new THREE.Vector3(), camTgt: new THREE.Vector3(), init: false };
      this.phase = 'replay'; this.phaseT = 0;
      RL.HUD.hideCenter(); RL.HUD.setReplay(true, gi.scorer, gi.team, U.fmtTime(gi.clock));
      this.camera.mode = 'free';
      this.saveState = { camBall: this.camera.ballCam };
      for (const car of this.cars) car.boosting = false;
      RL.Input.consume('skip');
    }
    applyFrame(f) {
      this.ball.pos.set(f.ball[0], f.ball[1], f.ball[2]); this.ball.q.set(f.ball[3], f.ball[4], f.ball[5], f.ball[6]); this.ball.setVisible(f.ball[7] === 1); this.ball.syncVisual();
      f.cars.forEach((c, i) => { const car = this.cars[i]; if (!car) return; car.pos.set(c[0], c[1], c[2]); car.q.set(c[3], c[4], c[5], c[6]); car.visualQ.copy(car.q); car.boosting = c[7] === 1; car.group.visible = c[8] === 1; car.demolished = c[8] === 0; car.supersonic = c[9] === 1; car.updateBasis(); car.group.position.copy(car.pos); car.group.quaternion.copy(car.q); });
    }
    updateReplay(dt) {
      const r = this.replay;
      const skip = RL.Input.consume('skip') || RL.Input.consume('menuAccept');
      // playback speed: slow motion around the goal
      const toGoal = r.goalT - r.t;
      const speed = (toGoal < 0.75 && toGoal > -0.35) ? 0.35 : 1.0;
      r.t += dt * speed;
      if (skip || r.t >= r.end) { this.afterGoal(); return; }
      // find frame
      const fr = r.frames; let i = r.idx || 0; while (i < fr.length - 1 && fr[i + 1].t <= r.t) i++; r.idx = i;
      this.applyFrame(fr[i]);
      // camera: broadcast side-chase of the ball, then the in-goal camera for the finish
      const gi = this.goalInfo; const bp = this.ball.visible ? this.ball.pos : gi.pos;
      const gy = gi.team === 0 ? 5120 : -5120; // goal that was scored on
      const sg = Math.sign(gy);
      if (toGoal > 1.4) {
        if (!r.side) r.side = (gi.scorerCar && gi.scorerCar.pos.x > bp.x) ? 1 : -1;
        _v.set(bp.x + r.side * 700, bp.y + sg * 260, bp.z + 250);
        _v.x = U.clamp(_v.x, -3700, 3700); _v.y = U.clamp(_v.y, -4900, 4900); _v.z = Math.max(90, Math.min(1700, _v.z));
        _v2.copy(bp); _v2.z += 30;
        if (!r.init) { this.camera.setFree(_v, _v2); r.init = true; } else this.camera.setFree(_v, _v2, 2.6, dt);
      } else {
        _v.set(U.clamp(bp.x * 0.3, -500, 500), gy + sg * 720, 360);
        _v2.copy(bp); _v2.z += 20;
        this.camera.setFree(_v, _v2, 5, dt);
      }
      this.camera.finalize(dt);
    }
    afterGoal() {
      this.replay = null;
      RL.HUD.setReplay(false); RL.HUD.hideCenter();
      this.ball.setVisible(true);
      for (const car of this.cars) car.group.visible = !car.demolished;
      if (this.ended) { this.endMatch(); return; }
      this.startCountdown();
    }
    // ---------- end ----------
    endMatch() {
      this.phase = 'end'; this.phaseT = 0; this.ended = true;
      const winner = this.score[0] > this.score[1] ? 0 : 1;
      const won = winner === this.player.team;
      RL.HUD.showBig(RL.TEAM_NAME[winner] + ' WINS', won ? 'VICTORY' : 'DEFEAT', winner === 0 ? 'blue' : 'orange');
      RL.Audio.onEvent({ type: 'whistle' }); RL.Audio.startCrowd(); RL.Audio.setCrowdExcitement(1);
      this.camera.mode = 'free';
      this.game.onMatchEnd && this.game.onMatchEnd(this, won);
      this.endButtonsShown = false;
    }
    updateEnd(dt) {
      // slow orbit around the player's car
      const a = this.phaseT * 0.25 + 1.2; const c = this.player.pos;
      _v.set(c.x + Math.cos(a) * 520, c.y + Math.sin(a) * 520, c.z + 190); _v2.set(c.x, c.y, c.z + 30);
      this.camera.setFree(_v, _v2, 4, dt); this.camera.finalize(dt);
      if (this.phaseT > 2.6 && !this.endButtonsShown) {
        this.endButtonsShown = true; RL.HUD.hideCenter();
        RL.HUD.showEnd([{ label: 'REMATCH', action: () => this.game.rematch() }, { label: 'MAIN MENU', cls: 'orange', action: () => this.game.toMenu() }]);
      }
      if (this.endButtonsShown && RL.Input.consume('menuAccept')) this.game.rematch();
    }
    pause() {
      this.paused = true; this.game.setPaused(true);
      RL.HUD.showPause([
        { label: 'RESUME', action: () => this.resume() },
        { label: (this.camera.ballCam ? 'BALL CAM: ON' : 'BALL CAM: OFF'), action: () => { this.camera.toggleBallCam(); RL.HUD.setBallCam(this.camera.ballCam); this.pause(); } },
        { label: 'OPTIONS', action: () => { RL.Menu.openOptions(() => { this.pause(); }); RL.HUD.hidePause(); } },
        { label: 'FORFEIT', action: () => this.game.toMenu() }
      ]);
      RL.Audio.stopLoops();
    }
    resume() { this.paused = false; this.game.setPaused(false); RL.HUD.hidePause(); RL.Input.clearEdges(); }
    updatePauseMenu() {
      const inp = RL.Input;
      if (inp.consume('menuUp')) RL.HUD.pauseNav(-1);
      if (inp.consume('menuDown')) RL.HUD.pauseNav(1);
      if (inp.consume('menuAccept')) RL.HUD.pauseAccept();
    }
  }
  return Match;
})();
