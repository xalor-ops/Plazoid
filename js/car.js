// Car physics: ground driving (throttle curve, steering curvature, powerslide, wall riding via the arena SDF),
// jumps / double jumps / dodges with Rocket League impulses, air control torques, and rigid-body wall impacts.
window.RL = window.RL || {};
RL.Car = (function () {
  const C = RL.C, U = RL.U, A = RL.Arena;
  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Quaternion(), _qi = new THREE.Quaternion();
  const _rc = new THREE.Vector3(), _vp = new THREE.Vector3(), _rn = new THREE.Vector3(), _irn = new THREE.Vector3(), _t = new THREE.Vector3();
  const HB = C.HITBOX;
  const CORNERS = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) CORNERS.push(new THREE.Vector3(HB.ox + sx * HB.hx, HB.oy + sy * HB.hy, HB.oz + sz * HB.hz));
  // box inertia (local, diagonal)
  const L = HB.hx * 2, W = HB.hy * 2, H = HB.hz * 2, m12 = C.CAR_MASS / 12;
  const INERTIA = new THREE.Vector3(m12 * (W * W + H * H), m12 * (L * L + H * H), m12 * (L * L + W * W));
  const INV_I = new THREE.Vector3(1 / INERTIA.x, 1 / INERTIA.y, 1 / INERTIA.z);
  const SCALE_TABLE = [[0, 0.65], [500, 0.65], [2300, 0.55], [4600, 0.30]];

  class Car {
    constructor(opts) {
      this.team = opts.team; this.name = opts.name || 'Player'; this.isBot = !!opts.isBot; this.id = opts.id || 0;
      this.bodyId = opts.body || 'octane'; this.colors = opts.colors;
      this.pos = new THREE.Vector3(0, 0, C.REST_Z); this.vel = new THREE.Vector3(); this.q = new THREE.Quaternion(); this.w = new THREE.Vector3();
      this.fwd = new THREE.Vector3(1, 0, 0); this.left = new THREE.Vector3(0, 1, 0); this.up = new THREE.Vector3(0, 0, 1);
      this.gNormal = new THREE.Vector3(0, 0, 1);
      this.input = { throttle: 0, steer: 0, pitch: 0, yaw: 0, roll: 0, jump: false, boost: false, handbrake: false };
      this.prevJump = false;
      this.grounded = true; this.airT = 0; this.hb = 0; this.yawRate = 0;
      this.boost = 33.33; this.boosting = false; this.boostT = 0;
      this.jumping = false; this.jumpT = 0; this.canDoubleJump = false; this.djTimer = 0;
      this.flipping = false; this.flipT = 0; this.flipDx = 0; this.flipDy = 0; this.flipCancel = false; this.pitchLockT = 99;
      this.supersonic = false; this.speed = 0; this.vf = 0;
      this.demolished = false; this.respawnT = 0; this.bumpCooldown = 0; this.stuckT = 0;
      this.lastTouchT = -99; this.lastJumpT = -99;
      this.stats = { score: 0, goals: 0, assists: 0, saves: 0, shots: 0, touches: 0, demos: 0 };
      this.events = [];
      this.model = RL.CarModel.build(this.bodyId, this.colors);
      this.group = this.model.group; this.group.name = 'car-' + this.name;
      this.visualQ = new THREE.Quaternion();
      this.steerVis = 0;
    }
    setBody(bodyId, colors) {
      const parent = this.group.parent; if (parent) parent.remove(this.group);
      this.model.dispose(); this.bodyId = bodyId; this.colors = colors;
      this.model = RL.CarModel.build(bodyId, colors); this.group = this.model.group; this.group.name = 'car-' + this.name;
      if (parent) parent.add(this.group);
      if (this.env) this.model.setEnv(this.env);
    }
    setEnv(env) { this.env = env; this.model.setEnv(env); }
    reset(x, y, yaw, boost) {
      this.pos.set(x, y, C.REST_Z); this.vel.set(0, 0, 0); this.w.set(0, 0, 0);
      U.setYaw(this.q, yaw); this.visualQ.copy(this.q);
      this.grounded = true; this.gNormal.set(0, 0, 1); this.airT = 0; this.hb = 0;
      this.boost = boost === undefined ? 33.33 : boost; this.boosting = false;
      this.jumping = false; this.canDoubleJump = false; this.flipping = false; this.pitchLockT = 99;
      this.demolished = false; this.group.visible = true; this.stuckT = 0; this.supersonic = false;
      this.updateBasis();
    }
    updateBasis() {
      this.fwd.set(1, 0, 0).applyQuaternion(this.q); this.left.set(0, 1, 0).applyQuaternion(this.q); this.up.set(0, 0, 1).applyQuaternion(this.q);
    }
    clearInput() { const i = this.input; i.throttle = i.steer = i.pitch = i.yaw = i.roll = 0; i.jump = i.boost = i.handbrake = false; }

    step(dt, time) {
      this.time = time;
      if (this.demolished) { this.respawnT -= dt; return; }
      const inp = this.input;
      this.updateBasis();
      // boost
      if (inp.boost && this.boost > 0 && !this.boosting) { this.boosting = true; this.boostT = 0; }
      if (this.boosting) {
        this.boostT += dt; this.boost -= C.BOOST_USE * dt;
        if (this.boost <= 0) { this.boost = 0; this.boosting = false; }
        else if (!inp.boost && this.boostT >= C.BOOST_MIN_T) this.boosting = false;
      }
      const jumpPressed = inp.jump && !this.prevJump; this.prevJump = inp.jump;
      this.pitchLockT += dt; this.bumpCooldown -= dt;
      if (this.grounded) this.stepGround(dt, jumpPressed); else this.stepAir(dt, jumpPressed);
      // clamps
      this.speed = this.vel.length();
      if (this.speed > C.CAR_MAX_V) { this.vel.multiplyScalar(C.CAR_MAX_V / this.speed); this.speed = C.CAR_MAX_V; }
      const wl = this.w.length(); const wmax = this.flipping ? 7.5 : C.CAR_MAX_W; if (wl > wmax) this.w.multiplyScalar(wmax / wl);
      if (this.speed >= C.SUPERSONIC) this.supersonic = true; else if (this.speed < C.SUPERSONIC_KEEP) this.supersonic = false;
      // safety
      if (!isFinite(this.pos.x) || !isFinite(this.vel.x) || !isFinite(this.q.x)) { this.reset(0, this.team === 0 ? -4000 : 4000, this.team === 0 ? Math.PI / 2 : -Math.PI / 2); }
      if (this.pos.z < -50 || Math.abs(this.pos.x) > 4300 || Math.abs(this.pos.y) > 6200) { this.reset(0, this.team === 0 ? -4000 : 4000, this.team === 0 ? Math.PI / 2 : -Math.PI / 2); }
    }

    stepGround(dt, jumpPressed) {
      const inp = this.input, n = this.gNormal, vel = this.vel;
      let vf = vel.dot(this.fwd), vl = vel.dot(this.left);
      const speed = Math.abs(vf);
      let th = inp.throttle;
      let acc = 0;
      const braking = Math.abs(th) > 0.001 && th * vf < 0 && speed > 25;
      if (Math.abs(th) > 0.001) {
        if (braking) acc = -C.BRAKE * U.sign(vf) * Math.min(1, Math.abs(th));
        else acc = th * U.table(C.THROTTLE_CURVE, speed);
      } else if (speed > 25) acc = -C.COAST * U.sign(vf);
      else vf = 0;
      if (this.boosting) { acc += C.BOOST_ACC_GROUND; if (th <= 0.001 && vf >= 0) acc += U.table(C.THROTTLE_CURVE, speed); }
      const vf0 = vf; vf += acc * dt;
      if ((braking || Math.abs(th) < 0.001) && vf0 * vf < 0 && !this.boosting) vf = 0;
      const maxV = this.boosting ? C.CAR_MAX_V : C.CAR_MAX_DRIVE;
      if (Math.abs(vf) > maxV) {
        if (Math.abs(vf0) <= maxV) vf = U.sign(vf) * maxV;
        else vf = U.sign(vf) * Math.max(maxV, Math.abs(vf) - 420 * dt);
      }
      // powerslide blend
      this.hb = U.damp(this.hb, inp.handbrake ? 1 : 0, inp.handbrake ? 14 : 5, dt);
      const wallness = 1 - Math.max(0, n.z);
      const slide = 1 - 0.85 * wallness * (1 - U.smoothstep(250, 700, speed));
      const gripRate = U.lerp(30, 2.4, this.hb) * slide;
      vl *= Math.exp(-gripRate * dt);
      vf *= Math.exp(-0.3 * this.hb * dt);
      // steering
      const curv = U.table(C.CURVATURE, speed) * (1 + 0.6 * this.hb);
      const yawRate = -inp.steer * vf * curv;
      this.yawRate = yawRate; this.vf = vf;
      vel.copy(this.fwd).multiplyScalar(vf).addScaledVector(this.left, vl);
      // tangential gravity (slide down walls / slow when climbing)
      const gn = -C.GRAVITY * n.z;
      vel.x += (-gn * n.x) * dt; vel.y += (-gn * n.y) * dt; vel.z += (-C.GRAVITY - gn * n.z) * dt;
      if (jumpPressed) {
        vel.addScaledVector(this.up, C.JUMP_V);
        this.grounded = false; this.jumping = true; this.jumpT = 0; this.airT = 0; this.canDoubleJump = true; this.djTimer = 0;
        this.w.copy(n).multiplyScalar(yawRate * 0.5);
        this.pos.addScaledVector(vel, dt);
        this.events.push({ type: 'jump' });
        return;
      }
      if (yawRate !== 0) { _q.setFromAxisAngle(n, yawRate * dt); this.q.premultiply(_q).normalize(); }
      this.pos.addScaledVector(vel, dt);
      // surface follow
      const d = -A.sd(this.pos.x, this.pos.y, this.pos.z);
      A.normalAt(this.pos.x, this.pos.y, this.pos.z, _n);
      const gDotN = -C.GRAVITY * _n.z;
      if (d > C.REST_Z + 45 || gDotN > C.STICKY || _n.dot(this.up) < 0.35) {
        this.grounded = false; this.airT = 0; this.w.copy(n).multiplyScalar(yawRate);
        return;
      }
      const err = C.REST_Z - d;
      this.pos.addScaledVector(_n, err * Math.min(1, dt * 45));
      const vn = vel.dot(_n); vel.addScaledVector(_n, -vn);
      this.gNormal.copy(_n);
      U.alignUp(this.q, _n, this.q);
      this.w.copy(_n).multiplyScalar(yawRate);
    }

    stepAir(dt, jumpPressed) {
      const inp = this.input, vel = this.vel;
      this.airT += dt;
      if (this.jumping) {
        this.jumpT += dt;
        if (inp.jump && this.jumpT <= C.JUMP_MAX_T) vel.addScaledVector(this.up, C.JUMP_ACC * dt);
        else this.jumping = false;
      }
      if (this.canDoubleJump && !this.jumping) { this.djTimer += dt; if (this.djTimer > C.DJ_WINDOW) this.canDoubleJump = false; }
      if (jumpPressed && this.canDoubleJump && !this.jumping) {
        let dx = -inp.pitch, dy = -inp.yaw;
        const mag = Math.hypot(dx, dy);
        if (mag > 0.5) {
          dx /= mag; dy /= mag;
          const yaw = U.yawOf(this.q); const fx = Math.cos(yaw), fy = Math.sin(yaw);
          const vfh = vel.x * fx + vel.y * fy; const s = Math.abs(vfh) / 2300;
          const backward = Math.abs(vfh) < 100 ? dx < 0 : ((dx >= 0) !== (vfh > 0));
          const ix = C.FLIP_V * dx * (backward ? (16 / 15) * (1 + 1.5 * s) : 1), iy = C.FLIP_V * dy * (1 + 0.9 * s);
          vel.x += fx * ix + (-fy) * iy; vel.y += fy * ix + fx * iy;
          this.flipping = true; this.flipT = 0; this.flipDx = dx; this.flipDy = dy; this.flipCancel = false; this.pitchLockT = 0;
          this.events.push({ type: 'flip' });
        } else {
          vel.addScaledVector(this.up, C.JUMP_V);
          this.events.push({ type: 'jump' });
        }
        this.canDoubleJump = false;
      }
      // angular velocity in local frame
      _qi.copy(this.q).invert();
      const wl = _v.copy(this.w).applyQuaternion(_qi);
      let r = inp.roll, p = this.pitchLockT < C.FLIP_PITCHLOCK ? 0 : inp.pitch, y = inp.yaw;
      const torquePhase = this.flipping && this.flipT < C.FLIP_TORQUE_T;
      if (!torquePhase) {
        wl.x += (C.AIR_T.roll * r - C.AIR_D.roll * wl.x) * dt;
        wl.y += (-C.AIR_T.pitch * p - C.AIR_D.pitch * wl.y * (1 - Math.abs(p))) * dt;
      }
      wl.z += (-C.AIR_T.yaw * y - C.AIR_D.yaw * wl.z * (1 - Math.abs(y))) * dt;
      if (this.flipping) {
        this.flipT += dt;
        if (this.flipT >= C.FLIP_ZDAMP_START && this.flipT < C.FLIP_ZDAMP_END) vel.z *= Math.pow(1 - C.FLIP_ZDAMP, dt * 120);
        if (torquePhase) {
          if (this.flipDx !== 0 && (-inp.pitch) * this.flipDx < -0.3 && this.flipT > 0.05) this.flipCancel = true;
          const tp = this.flipCancel ? 0 : this.flipDx * C.FLIP_W, tr = -this.flipDy * C.FLIP_W;
          wl.y = U.damp(wl.y, tp, this.flipCancel ? 40 : 28, dt); wl.x = U.damp(wl.x, tr, 28, dt);
        } else {
          wl.y *= Math.exp(-C.AIR_D.pitch * dt); wl.x *= Math.exp(-C.AIR_D.roll * dt);
          if (this.flipT > C.FLIP_TIMEOUT) this.flipping = false;
        }
      }
      this.w.copy(wl).applyQuaternion(this.q);
      vel.z -= C.GRAVITY * dt;
      if (this.boosting) vel.addScaledVector(this.fwd, C.BOOST_ACC_AIR * dt);
      if (inp.throttle) vel.addScaledVector(this.fwd, inp.throttle * C.AIR_THROTTLE * dt);
      U.integrateQuat(this.q, this.w, dt);
      this.pos.addScaledVector(vel, dt);
      this.collideArena(dt, jumpPressed);
    }

    collideArena(dt, jumpPressed) {
      const vel = this.vel, pos = this.pos;
      this.updateBasis();
      const d = -A.sd(pos.x, pos.y, pos.z);
      A.normalAt(pos.x, pos.y, pos.z, _n);
      const upDotN = this.up.dot(_n);
      const vn = vel.dot(_n);
      // landing on wheels
      if (d < C.REST_Z + 7 && upDotN > 0.62 && vn <= 0 && -C.GRAVITY * _n.z <= C.STICKY) {
        this.grounded = true; this.gNormal.copy(_n);
        pos.addScaledVector(_n, C.REST_Z - d);
        vel.addScaledVector(_n, -vn);
        const wn = this.w.dot(_n); this.w.copy(_n).multiplyScalar(wn);
        U.alignUp(this.q, _n, this.q);
        this.flipping = false; this.jumping = false; this.canDoubleJump = false; this.pitchLockT = 99;
        this.events.push({ type: 'land', speed: -vn });
        return;
      }
      // hitbox corner impacts (rigid body)
      let hit = 0;
      for (let iter = 0; iter < 2; iter++) {
        for (let i = 0; i < 8; i++) {
          _rc.copy(CORNERS[i]).applyQuaternion(this.q);
          _t.copy(pos).add(_rc);
          const pen = A.sd(_t.x, _t.y, _t.z);
          if (pen <= 0) continue;
          A.normalAt(_t.x, _t.y, _t.z, _n);
          pos.addScaledVector(_n, pen);
          _vp.copy(this.w).cross(_rc).add(vel);
          const vpn = _vp.dot(_n);
          if (vpn < 0) {
            _rn.copy(_rc).cross(_n);
            _irn.copy(_rn).applyQuaternion(_qi.copy(this.q).invert()); _irn.multiply(INV_I); _irn.applyQuaternion(this.q);
            const K = 1 / C.CAR_MASS + _v2.copy(_irn).cross(_rc).dot(_n);
            const e = -vpn > 200 ? C.CAR_WORLD_REST : 0.05;
            const J = -(1 + e) * vpn / K;
            vel.addScaledVector(_n, J / C.CAR_MASS);
            this.w.addScaledVector(_irn, J);
            // friction
            _v2.copy(_vp).addScaledVector(_n, -vpn); const vt = _v2.length();
            if (vt > 1e-3) { const jt = Math.min(vt * 0.5, C.CAR_WORLD_MU * J / C.CAR_MASS); vel.addScaledVector(_v2, -jt / vt); }
            hit = Math.max(hit, -vpn);
          }
        }
      }
      if (hit > 150) this.events.push({ type: 'wallhit', speed: hit });
      // auto-roll toward the surface when close (helps land wheels down)
      if (d < 110 && upDotN < 0.62 && upDotN > -0.85 && vel.z < 50) {
        _v2.copy(this.up).cross(_n); // axis to rotate up toward n
        this.w.addScaledVector(_v2, 14 * dt);
      }
      // stuck on the roof: allow jump to flip back
      if (d < C.REST_Z + 30 && upDotN < -0.4 && this.speed < 150) {
        this.stuckT += dt;
        if (jumpPressed || this.stuckT > 1.2) {
          vel.addScaledVector(_n, 260); this.w.addScaledVector(this.fwd, 7); this.stuckT = 0;
        }
      } else this.stuckT = 0;
    }

    demolish(time) {
      this.demolished = true; this.respawnT = C.DEMO_RESPAWN; this.group.visible = false; this.vel.set(0, 0, 0); this.boosting = false;
      this.events.push({ type: 'demolished' });
    }
    respawn(spawn) { this.reset(spawn[0], spawn[1] * (this.team === 0 ? 1 : -1), this.team === 0 ? spawn[2] : -spawn[2], 33.33); }

    syncVisual(dt) {
      if (this.demolished) return;
      this.group.position.copy(this.pos);
      this.visualQ.slerp(this.q, 1 - Math.exp(-dt * 45));
      this.group.quaternion.copy(this.visualQ);
      const vf = this.grounded ? this.vf : this.vel.dot(this.fwd);
      this.steerVis = U.damp(this.steerVis, -this.input.steer * 0.55, 14, dt);
      for (const w of this.model.wheels) {
        w.spin -= vf / w.radius * dt;
        w.mesh.rotation.set(0, w.spin, w.front ? this.steerVis : 0);
      }
    }
  }
  return Car;
})();
