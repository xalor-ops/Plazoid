// Bot AI: role-based (attacker / support / defender), ball-prediction intercepts, shot alignment,
// boost management, timed jumps, flips into the ball, aerials with boost, recoveries and kickoffs.
// Imperfect on purpose: reaction delay, aim noise, occasional missed flips.
window.RL = window.RL || {};
RL.Bot = (function () {
  const C = RL.C, U = RL.U;
  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion();
  const DIFF = {
    rookie: { skill: 0.5, reaction: 0.3, aerial: 0.15, flip: 0.5, aimNoise: 140, maxAerialZ: 700 },
    pro: { skill: 0.78, reaction: 0.17, aerial: 0.55, flip: 0.8, aimNoise: 70, maxAerialZ: 1300 },
    allstar: { skill: 0.95, reaction: 0.1, aerial: 0.85, flip: 0.92, aimNoise: 35, maxAerialZ: 1700 }
  };
  class Bot {
    constructor(car, match, difficulty) {
      this.car = car; this.match = match; this.d = DIFF[difficulty] || DIFF.pro;
      this.role = 'support'; this.thinkT = Math.random() * 0.1;
      this.plan = { mode: 'drive', target: new THREE.Vector3(0, 0, 0), desiredSpeed: 2300, boost: false, hp: new THREE.Vector3(), hpT: 1, shotDir: new THREE.Vector3(0, 1, 0), face: null };
      this.jumpSeq = null; this.aerial = null;
      this.noise = new THREE.Vector3(); this.noiseT = 0;
      this.roleT = 0; this.lastRoleChange = -10;
      this.sign = car.team === 0 ? 1 : -1; // +1: attack toward +y
      this.ownGoalY = -5120 * this.sign; this.oppGoalY = 5120 * this.sign;
      this.speedFlipT = 0; this.stuckT = 0; this.prevPos = new THREE.Vector3();
      this.idle = Math.random() * 10; this.aerials = 0;
    }
    update(dt, time) {
      const car = this.car;
      if (car.demolished) { car.clearInput(); return; }
      this.thinkT -= dt; this.noiseT -= dt;
      if (this.noiseT <= 0) { this.noiseT = 0.6 + Math.random() * 0.6; this.noise.set((Math.random() - 0.5) * this.d.aimNoise, (Math.random() - 0.5) * this.d.aimNoise, 0); }
      if (this.thinkT <= 0) { this.thinkT = this.d.reaction * (0.8 + Math.random() * 0.5); this.think(time); }
      this.act(dt, time);
    }
    // ---------- perception helpers ----------
    interceptFor(car, pred, allowAerial) {
      // first predicted sample the car can reach in time
      const cp = car.pos; const sp = car.speed;
      const effSpeed = U.clamp(sp * 0.45 + (car.boost > 15 ? 1500 : 1250), 900, 2100);
      for (let i = 0; i < pred.length; i++) {
        const s = pred[i]; const z = s.p.z;
        const maxZ = allowAerial ? (car.boost > 25 ? this.d.maxAerialZ : 300) : 300;
        if (z > maxZ) continue;
        const dx = s.p.x - cp.x, dy = s.p.y - cp.y; const dist = Math.sqrt(dx * dx + dy * dy);
        const ang = Math.abs(U.angleWrap(Math.atan2(dy, dx) - Math.atan2(car.fwd.y, car.fwd.x)));
        let t = dist / effSpeed + ang * 0.32;
        if (z > 300) t += 0.2 + z / 3200; // aerial setup time
        // being on the wrong side of the ball (closer to the opponent goal) costs time
        if ((s.p.y - cp.y) * this.sign < -250) t += 0.5;
        if (t <= s.t + 0.02) return { t: s.t, eta: t, p: s.p, v: s.v, idx: i };
      }
      const last = pred[pred.length - 1];
      return { t: last.t + 1, eta: last.t + 2, p: last.p, v: last.v, idx: pred.length - 1 };
    }
    landingPoint(pred) { for (let i = 1; i < pred.length; i++) if (pred[i].p.z < 200 && pred[i].v.z <= 0) return pred[i].p; return pred[pred.length - 1].p; }
    goalThreat(pred) {
      // does the predicted path cross our goal line?
      for (const s of pred) { if ((s.p.y - this.ownGoalY) * this.sign < 60 && Math.abs(s.p.x) < 1100 && s.p.z < 800) return s.t; }
      return -1;
    }
    // ---------- decision ----------
    _think(time) {
      const m = this.match, car = this.car, ball = m.ball;
      const pred = m.predictBall();
      const mates = m.cars.filter((c) => c.team === car.team && !c.demolished);
      const my = this.interceptFor(car, pred, true);
      // role assignment: everyone evaluated the same way (so teammates agree), hysteresis for the current attacker
      const myGround = this.interceptFor(car, pred, false);
      let bestMate = car, bestEta = myGround.eta - (this.role === 'attacker' ? 0.3 : 0) + (car.lastTouchT > time - 1.5 ? 1.5 : 0);
      for (const mt of mates) { if (mt === car) continue; const it = this.interceptFor(mt, pred, false); let eta = it.eta; if (mt.lastTouchT > time - 1.5) eta += 1.5; if (m.bots.some((b) => b.car === mt && b.role === 'attacker')) eta -= 0.3; if (eta < bestEta || (Math.abs(eta - bestEta) < 1e-6 && mt.id < car.id)) { bestEta = eta; bestMate = mt; } }
      let role;
      if (car.lastTouchT > time - 1.5 && mates.length > 1) role = 'support'; // rotate out after a touch
      else if (bestMate === car) role = 'attacker';
      else {
        // among non-attackers: nearest to own goal defends
        const others = mates.filter((c) => c !== bestMate).sort((a, b) => Math.abs(a.pos.y - this.ownGoalY) - Math.abs(b.pos.y - this.ownGoalY));
        role = others[0] === car ? 'defender' : 'support';
        if (mates.length === 1) role = 'attacker';
      }
      // kickoff
      if (m.kickoffActive) role = (m.kickoffTaker && m.kickoffTaker.team === car.team) ? (m.kickoffTaker === car ? 'kickoff' : 'kickoffSupport') : role;
      if (role !== this.role) { this.role = role; this.lastRoleChange = time; }
      const p = this.plan; p.boost = false; p.face = null; p.mode = 'drive';
      const threatT = this.goalThreat(pred);
      const hp = my.p;
      this._finishThink = () => { // keep drive targets off the walls (except inside the goal mouth)
        const t = p.target; const inMouth = Math.abs(t.x) < 800;
        t.x = U.clamp(t.x, -3900, 3900); if (!inMouth) t.y = U.clamp(t.y, -4900, 4900); else t.y = U.clamp(t.y, -5500, 5500);
      };
      if (role === 'kickoff') {
        p.target.set(ball.pos.x, ball.pos.y, 0); p.desiredSpeed = 2300; p.boost = true; p.mode = 'kickoff';
        p.hp.copy(ball.pos); p.hpT = 0;
        return;
      }
      if (role === 'kickoffSupport') {
        // grab the nearest big pad then fall back
        const pad = this.nearestPad(true, car.pos, 99999);
        if (pad && car.boost < 90) { p.target.set(pad.x, pad.y, 0); p.desiredSpeed = 2300; p.boost = false; }
        else { p.target.set(0, this.ownGoalY + this.sign * 600, 0); p.desiredSpeed = 1400; }
        return;
      }
      if (role === 'attacker' || (role === 'defender' && threatT > 0 && threatT < 3.5)) {
        const saving = role !== 'attacker' || (threatT > 0 && (hp.y - this.ownGoalY) * this.sign < 2600);
        // where do we want the ball to go
        if (saving) {
          const sx = (hp.x !== 0 ? Math.sign(hp.x) : (Math.random() < 0.5 ? -1 : 1));
          p.shotDir.set(sx * 3800 - hp.x, (this.ownGoalY + this.sign * 4200) - hp.y, 0).normalize();
        } else {
          const aimX = U.clamp(hp.x * 0.25, -650, 650) + this.noise.x * 2;
          p.shotDir.set(aimX - hp.x, this.oppGoalY - hp.y, 0).normalize();
        }
        p.hp.copy(hp); p.hpT = my.t;
        const off = C.BALL_R + 75;
        p.target.set(hp.x - p.shotDir.x * off + this.noise.x, hp.y - p.shotDir.y * off + this.noise.y, 0);
        // approach check: if we're on the wrong side, go around behind the ball first
        _v.set(hp.x - car.pos.x, hp.y - car.pos.y, 0); const dist = _v.length(); if (dist > 1e-3) _v.multiplyScalar(1 / dist);
        const align = _v.dot(p.shotDir);
        if (align < 0.15 && dist < 1800) { p.target.set(hp.x - p.shotDir.x * 850 - _v.y * 300 * Math.sign(_v.x * p.shotDir.y - _v.y * p.shotDir.x || 1), hp.y - p.shotDir.y * 850, 0); }
        // arrive on time
        p.desiredSpeed = my.t > 0.05 ? U.clamp(dist / my.t, 500, 2300) : 2300;
        if (hp.z > 300 && my.t > 0.6) p.desiredSpeed = Math.min(p.desiredSpeed, U.clamp(dist / Math.max(0.1, my.t - 0.3), 300, 2300));
        p.boost = car.boost > (saving ? 0 : 5) && (dist > 700 || saving) && p.desiredSpeed > 1900;
        p.mode = hp.z > 300 ? 'aerialSetup' : 'attack';
        // when the ball will be high for a long time, wait at the landing point
        if (hp.z > 300 && !(car.boost >= 25 && Math.random() < this.d.aerial)) { const lp = this.landingPoint(pred); p.target.set(lp.x - p.shotDir.x * 300, lp.y - p.shotDir.y * 300, 0); p.mode = 'attack'; p.desiredSpeed = 1500; p.hp.copy(lp); }
        return;
      }
      if (role === 'defender') {
        const gx = U.clamp(ball.pos.x * 0.35, -650, 650);
        p.target.set(gx, this.ownGoalY + this.sign * 480, 0); p.desiredSpeed = 1600;
        p.face = ball.pos;
        this.maybeBoostRoute(p, car, 40);
        return;
      }
      // support: sit behind the play, collect boost
      {
        const off = 1400;
        const lat = (car.id % 2 === 0 ? 1 : -1) * 700;
        p.target.set(U.clamp(hp.x * 0.5 + lat, -2600, 2600), U.clamp(hp.y - this.sign * off, -4600, 4600), 0);
        p.desiredSpeed = 1900;
        this.maybeBoostRoute(p, car, 55);
      }
    }
    think(time) { this._think(time); if (this._finishThink) this._finishThink(); }
    nearestPad(bigOnly, from, maxDist) {
      let best = null, bd = maxDist * maxDist;
      for (const pad of this.match.pads) { if (!pad.active || (bigOnly && !pad.big)) continue; const dx = pad.x - from.x, dy = pad.y - from.y; const d2 = dx * dx + dy * dy; if (d2 < bd) { bd = d2; best = pad; } }
      return best;
    }
    maybeBoostRoute(p, car, threshold) {
      if (car.boost >= threshold) return;
      let best = null, bs = 1e9;
      for (const pad of this.match.pads) {
        if (!pad.active) continue;
        const d1 = Math.hypot(pad.x - car.pos.x, pad.y - car.pos.y), d2 = Math.hypot(p.target.x - pad.x, p.target.y - pad.y), d0 = Math.hypot(p.target.x - car.pos.x, p.target.y - car.pos.y);
        const detour = d1 + d2 - d0;
        const score = detour - (pad.big ? 900 : 150) + d1 * 0.15;
        if (detour < (pad.big ? 1500 : 500) && score < bs) { bs = score; best = pad; }
      }
      if (best) { p.target.set(best.x, best.y, 0); p.desiredSpeed = 2300; p.mode = 'boost'; }
    }
    // ---------- action ----------
    act(dt, time) {
      const car = this.car, inp = car.input, p = this.plan, ball = this.match.ball;
      car.clearInput();
      if (this.match.phase !== 'play' && this.match.phase !== 'goal') return;
      // stuck detection (against a wall / upside down)
      if (car.speed < 60 && car.grounded) this.stuckT += dt; else this.stuckT = 0;
      if (car.grounded) {
        const onWall = car.gNormal.z < 0.5;
        // steering toward target
        _v.set(p.target.x - car.pos.x, p.target.y - car.pos.y, p.target.z - car.pos.z);
        const dist = Math.hypot(_v.x, _v.y);
        const lx = _v.dot(car.fwd), ly = _v.dot(car.left);
        let ang = Math.atan2(ly, lx);
        // small human-like wobble
        ang += Math.sin(time * 1.7 + this.idle) * 0.015;
        let steer = -U.clamp(ang * 2.4, -1, 1); // positive angle = target on the left = steer left (negative)
        let throttle = 1;
        const sp = car.vf;
        if (Math.abs(ang) > 2.35 && dist < 900 && sp < 500) { throttle = -1; steer = U.clamp(ang * 2.4, -1, 1); }
        else if (Math.abs(ang) > 1.35 && sp > 650) inp.handbrake = true;
        // speed management
        if (throttle > 0) {
          if (sp > p.desiredSpeed + 200) throttle = -0.35; else if (sp > p.desiredSpeed + 60) throttle = 0;
        }
        inp.steer = steer; inp.throttle = throttle;
        inp.boost = p.boost && Math.abs(ang) < 0.32 && sp < 2250 && sp >= 0 && throttle > 0;
        if (onWall) {
          // on a wall: unless the ball is right there, steer down toward the floor and hop off when high
          const ballNear = this.match.ball.pos.distanceTo(car.pos) < 700 && this.match.ball.pos.z > 150;
          if (!ballNear) {
            const dn = _v3.set(0, 0, -1).addScaledVector(car.gNormal, car.gNormal.z); // down projected on the wall
            const dl = Math.atan2(dn.dot(car.left), dn.dot(car.fwd));
            inp.steer = -U.clamp(dl * 2.5, -1, 1); inp.throttle = 1;
            if (car.pos.z > 260 || car.speed < 400) { inp.jump = true; }
          }
          inp.boost = false;
        }
        if (this.stuckT > 1.5) { inp.jump = true; inp.throttle = -1; this.stuckT = 0; }
        // jump / flip decisions (ball interactions)
        if (!this.jumpSeq) {
          const toBall = _v2.set(ball.pos.x - car.pos.x, ball.pos.y - car.pos.y, 0); const bd = toBall.length();
          const closing = bd > 1 ? -(ball.vel.x - car.vel.x) * toBall.x / bd - (ball.vel.y - car.vel.y) * toBall.y / bd : 0;
          const bAng = Math.abs(U.angleWrap(Math.atan2(toBall.y, toBall.x) - Math.atan2(car.fwd.y, car.fwd.x)));
          const tc = closing > 50 ? bd / closing : 99;
          const hz = ball.pos.z;
          if (p.mode === 'kickoff') {
            if (bd < 520 && car.speed > 1300 && Math.random() < 0.9) this.jumpSeq = { type: 'flipInto', t: 0, dir: toBall.clone() };
          } else if ((p.mode === 'attack' || p.mode === 'aerialSetup') && bAng < 0.6) {
            if (hz < 140 && tc < 0.28 && tc > 0.08 && closing > 700 && Math.random() < this.d.flip) this.jumpSeq = { type: 'flipInto', t: 0, dir: toBall.clone() };
            else if (hz >= 140 && hz < 330 && tc < 0.45) { const tstar = U.clamp((hz - 40) / 520, 0.12, 0.7); if (tc <= tstar + 0.05) this.jumpSeq = { type: 'jumpTimed', t: 0, hold: U.clamp((hz - 120) / 700, 0.02, 0.2), dodge: hz < 240 }; }
            else if (p.mode === 'aerialSetup' && p.hp.z >= 300 && p.hp.z < this.d.maxAerialZ && car.boost >= 20 && p.hpT > 0.35 && p.hpT < 3.0) {
              // take off when the ground path is roughly right and the timing works
              const need = p.hpT - 0.25;
              const dHp = Math.hypot(p.hp.x - car.pos.x, p.hp.y - car.pos.y);
              const horizT = dHp / Math.max(600, car.speed + 400);
              if (horizT > need - 0.35 && horizT < need + 0.25 && Math.random() < 0.6) { this.aerial = { target: p.hp.clone(), tHit: time + p.hpT, t: 0 }; this.jumpSeq = { type: 'aerial', t: 0 }; this.aerials++; }
            }
          }
          // speed flip for travel when low on boost
          if (!this.jumpSeq && car.boost < 12 && Math.abs(ang) < 0.12 && dist > 1700 && sp > 900 && sp < 1950 && p.mode !== 'kickoff' && Math.random() < 0.02) this.jumpSeq = { type: 'speedFlip', t: 0 };
        }
      } else {
        // airborne
        if (this.aerial) this.aerialControl(dt, time);
        else this.recover(dt);
      }
      this.runJumpSeq(dt);
    }
    runJumpSeq(dt) {
      const s = this.jumpSeq; if (!s) return;
      const car = this.car, inp = car.input;
      s.t += dt;
      if (s.type === 'flipInto' || s.type === 'speedFlip') {
        if (s.t < 0.03) inp.jump = true;
        else if (s.t < 0.11) inp.jump = false;
        else if (s.t < 0.15) {
          inp.jump = true;
          if (s.type === 'speedFlip') { inp.pitch = -1; inp.yaw = 0; }
          else { const lx = s.dir.dot(car.fwd), ly = s.dir.dot(car.left); const l = Math.hypot(lx, ly) || 1; inp.pitch = -lx / l; inp.yaw = -ly / l; }
        } else this.jumpSeq = null;
      } else if (s.type === 'jumpTimed') {
        if (s.t < s.hold + 0.02) inp.jump = true;
        else if (s.dodge && s.t > s.hold + 0.1 && s.t < s.hold + 0.14) { const b = this.match.ball; _v.set(b.pos.x - car.pos.x, b.pos.y - car.pos.y, 0); if (_v.length() < 260) { inp.jump = true; const lx = _v.dot(car.fwd), ly = _v.dot(car.left); const l = Math.hypot(lx, ly) || 1; inp.pitch = -lx / l; inp.yaw = -ly / l; } }
        else if (s.t > s.hold + 0.5) this.jumpSeq = null;
      } else if (s.type === 'aerial') {
        if (s.t < 0.2) { inp.jump = true; inp.pitch = -0.6; }
        else if (s.t > 0.25) this.jumpSeq = null;
      }
    }
    aerialControl(dt, time) {
      const car = this.car, inp = car.input, a = this.aerial, ball = this.match.ball;
      a.t += dt;
      // retarget to the live ball position while far, keep the planned time
      const tau = Math.max(0.05, a.tHit - time);
      _v.copy(ball.pos).addScaledVector(ball.vel, tau * 0.6);
      if (a.t > 2.6 || (car.grounded) || tau < 0.03 || _v.distanceTo(car.pos) > 3200) { this.aerial = null; return; }
      // required acceleration to reach the target
      _v2.copy(_v).sub(car.pos).addScaledVector(car.vel, -tau).multiplyScalar(2 / (tau * tau)); _v2.z += C.GRAVITY;
      const need = _v2.length(); _v2.multiplyScalar(1 / Math.max(1e-3, need));
      this.orientTo(_v2, dt);
      const align = car.fwd.dot(_v2);
      inp.boost = align > 0.85 && need > 200 && car.boost > 0;
      // dodge into the ball at the last moment
      if (_v.distanceTo(car.pos) < 200 && car.canDoubleJump && Math.random() < 0.3) { inp.jump = true; inp.pitch = -1; }
    }
    orientTo(dir, dt) {
      const car = this.car, inp = car.input;
      // angular error in local frame: rotate fwd toward dir
      _v3.copy(car.fwd).cross(dir); // world axis
      const err = Math.asin(U.clamp(_v3.length(), 0, 1)) * (car.fwd.dot(dir) < 0 ? 2 : 1);
      if (_v3.lengthSq() > 1e-8) _v3.normalize().multiplyScalar(err);
      _q.copy(car.q).invert(); _v3.applyQuaternion(_q); // local: x roll, y pitch, z yaw
      const wl = _v.copy(car.w).applyQuaternion(_q);
      inp.pitch = U.clamp(-(_v3.y * 4.5 - wl.y * 0.55), -1, 1);
      inp.yaw = U.clamp(-(_v3.z * 4.5 - wl.z * 0.55), -1, 1);
      // roll to keep the roof up
      const rollErr = car.left.z; // >0 means left side up -> roll right
      inp.roll = U.clamp(-(rollErr * 3.0 + wl.x * 0.3), -1, 1);
    }
    recover(dt) {
      const car = this.car, inp = car.input;
      if (car.flipping) return;
      // align wheels down and nose along velocity
      _v.set(car.vel.x, car.vel.y, 0); if (_v.lengthSq() < 200 * 200) _v.copy(car.fwd).setZ(0); _v.normalize();
      const upErr = car.up.z; // want 1
      const wl = _v2.copy(car.w).applyQuaternion(_q.copy(car.q).invert());
      // pitch: nose pitch relative to horizon
      const pitch = Math.asin(U.clamp(car.fwd.z, -1, 1));
      inp.pitch = U.clamp(pitch * 3.0 - wl.y * 0.5, -1, 1);
      const rollErr = car.left.z;
      inp.roll = U.clamp(-(rollErr * 3.0 + wl.x * 0.35), -1, 1);
      if (upErr < -0.2) inp.roll = car.left.z > 0 ? -1 : 1;
      const yawErr = Math.atan2(_v.y, _v.x) - Math.atan2(car.fwd.y, car.fwd.x);
      inp.yaw = U.clamp(U.angleWrap(yawErr) * 1.5 - wl.z * 0.4, -1, 1);
      inp.boost = false;
    }
  }
  Bot.DIFF = DIFF;
  return Bot;
})();
