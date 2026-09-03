// Rocket League camera: car cam / ball cam with distance, height, angle, stiffness, swivel; rear view;
// cinematic modes for replays and menus; impact shake.
window.RL = window.RL || {};
RL.Camera = (function () {
  const U = RL.U;
  const _dir = new THREE.Vector3(), _want = new THREE.Vector3(), _tgt = new THREE.Vector3(), _tmp = new THREE.Vector3(), _right = new THREE.Vector3(), _q = new THREE.Quaternion();
  class Camera {
    constructor(aspect) {
      this.settings = { fov: 110, distance: 270, height: 110, angle: -3, stiffness: 0.45, swivel: 5, transition: 1.2, invertSwivel: false };
      this.cam = new THREE.PerspectiveCamera(70, aspect, 10, 120000);
      this.cam.up.set(0, 0, 1);
      this.ballCam = true;
      this.pos = new THREE.Vector3(0, -600, 200); this.target = new THREE.Vector3();
      this.dirSmooth = new THREE.Vector3(0, 1, 0);
      this.yaw = Math.PI / 2;
      this.rear = false;
      this.mode = 'follow'; // follow | free | cinematic
      this.shakeAmt = 0; this.shakeT = 0;
      this.transitionT = 0;
      this.setAspect(aspect);
    }
    setAspect(aspect) { this.cam.aspect = aspect; this.applyFov(); }
    applyFov() {
      const h = this.settings.fov * Math.PI / 180;
      const v = 2 * Math.atan(Math.tan(h / 2) / this.cam.aspect);
      this.cam.fov = v * 180 / Math.PI; this.cam.updateProjectionMatrix();
    }
    toggleBallCam() { this.ballCam = !this.ballCam; this.transitionT = 0.55; }
    shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }
    snapTo(car, ball) {
      this.computeDesired(car, ball, _want, _tgt, 0.016, true);
      this.pos.copy(_want); this.target.copy(_tgt);
    }
    computeDesired(car, ball, outPos, outTarget, dt, instant) {
      const s = this.settings;
      const cp = car.pos;
      let useBall = this.ballCam && ball;
      if (useBall) {
        _dir.set(cp.x - ball.pos.x, cp.y - ball.pos.y, 0);
        const d2 = _dir.length();
        const fh = _tmp.set(car.fwd.x, car.fwd.y, 0);
        if (fh.lengthSq() < 0.05) fh.set(Math.cos(this.yaw), Math.sin(this.yaw), 0); else fh.normalize();
        const wBall = U.smoothstep(120, 520, d2);
        if (d2 > 1e-3) _dir.multiplyScalar(1 / d2); else _dir.copy(fh).negate();
        _dir.lerp(_tmp.copy(fh).negate(), 1 - wBall).normalize();
        if (this.rear) _dir.negate();
        // swivel smoothing
        const rate = instant ? 1e9 : U.lerp(6, 40, s.stiffness) * (this.transitionT > 0 ? 0.5 : 1);
        this.dirSmooth.lerp(_dir, 1 - Math.exp(-rate * dt)).normalize();
        outPos.copy(cp).addScaledVector(this.dirSmooth, s.distance).add(_tmp.set(0, 0, s.height));
        outTarget.copy(ball.pos); outTarget.z += 20;
        // limit the upward pitch so the car stays in frame when the ball is high and close
        const hd = Math.hypot(outTarget.x - outPos.x, outTarget.y - outPos.y);
        const maxRise = hd * 1.05 + 60;
        if (outTarget.z - outPos.z > maxRise) outTarget.z = outPos.z + maxRise;
      } else {
        // car cam: follow the car's yaw with lag; use velocity direction if the car faces up/down
        const fh = _tmp.set(car.fwd.x, car.fwd.y, 0);
        let yawT = this.yaw;
        if (fh.lengthSq() > 0.09) yawT = Math.atan2(fh.y, fh.x);
        else if (car.vel.lengthSq() > 300 * 300) yawT = Math.atan2(car.vel.y, car.vel.x);
        const rate = instant ? 1e9 : U.lerp(4, 30, s.stiffness) * 0.6 + s.swivel * 0.6;
        this.yaw += U.angleWrap(yawT - this.yaw) * (1 - Math.exp(-rate * dt));
        const dx = Math.cos(this.yaw), dy = Math.sin(this.yaw);
        const back = this.rear ? 1 : -1;
        outPos.set(cp.x + back * dx * s.distance, cp.y + back * dy * s.distance, cp.z + s.height);
        outTarget.set(cp.x - back * dx * 40, cp.y - back * dy * 40, cp.z + 30);
      }
    }
    update(dt, car, ball) {
      if (this.mode !== 'follow' || !car) return this.finalize(dt);
      this.computeDesired(car, ball, _want, _tgt, dt, false);
      const s = this.settings;
      const rate = U.lerp(14, 70, s.stiffness) * (this.transitionT > 0 ? 0.55 : 1);
      this.pos.lerp(_want, 1 - Math.exp(-rate * dt));
      this.target.lerp(_tgt, 1 - Math.exp(-Math.max(rate, 25) * dt));
      if (this.transitionT > 0) this.transitionT -= dt;
      // never let the camera get closer to the car than most of the configured distance (avoids clipping into the body)
      _tmp.subVectors(this.pos, car.pos); _tmp.z = 0; const hd = _tmp.length(); const minD = s.distance * 0.82;
      if (hd < minD && hd > 1e-3) { _tmp.multiplyScalar((minD - hd) / hd); this.pos.x += _tmp.x; this.pos.y += _tmp.y; }
      // stay above the floor
      if (this.pos.z < 30) this.pos.z = 30;
      this.finalize(dt);
    }
    finalize(dt) {
      const c = this.cam;
      c.position.copy(this.pos);
      c.lookAt(this.target);
      // angle offset (pitch) around the camera's right axis
      if (this.mode === 'follow') {
        const a = this.settings.angle * Math.PI / 180;
        _right.set(1, 0, 0).applyQuaternion(c.quaternion);
        _q.setFromAxisAngle(_right, a);
        c.quaternion.premultiply(_q);
      }
      if (this.shakeAmt > 0.01) {
        this.shakeT += dt * 60;
        const k = this.shakeAmt;
        _tmp.set(Math.sin(this.shakeT * 1.3) * k, Math.cos(this.shakeT * 1.7) * k, Math.sin(this.shakeT * 2.3) * k * 0.6);
        c.position.add(_tmp);
        this.shakeAmt *= Math.exp(-dt * 6);
      }
    }
    // direct placement for cinematic/replay/menu cameras
    setFree(pos, target, smooth, dt) {
      this.mode = 'free';
      if (smooth) { this.pos.lerp(pos, 1 - Math.exp(-smooth * dt)); this.target.lerp(target, 1 - Math.exp(-smooth * dt)); }
      else { this.pos.copy(pos); this.target.copy(target); }
    }
    setFollow() { this.mode = 'follow'; }
  }
  return Camera;
})();
