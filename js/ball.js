// Ball physics (Rocket League bounce model with slip friction and spin) + visual.
window.RL = window.RL || {};
RL.Ball = (function () {
  const C = RL.C, U = RL.U, A = RL.Arena;
  const _n = new THREE.Vector3(), _vperp = new THREE.Vector3(), _s = new THREE.Vector3(), _dv = new THREE.Vector3(), _t = new THREE.Vector3();
  class Ball {
    constructor(scene) {
      this.pos = new THREE.Vector3(0, 0, C.BALL_R); this.vel = new THREE.Vector3(); this.w = new THREE.Vector3(); this.q = new THREE.Quaternion();
      this.R = C.BALL_R;
      this.lastTouch = null; this.lastTouchT = -99; this.prevTouch = null; this.prevTouchT = -99;
      this.events = [];
      const tex = A.ballTexture();
      this.mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.42, metalness: 0.12, envMapIntensity: 0.9 });
      this.mesh = new THREE.Mesh(new THREE.SphereGeometry(this.R, 40, 28), this.mat);
      this.mesh.castShadow = true; this.mesh.receiveShadow = false;
      this.mesh.rotation.x = Math.PI / 2;
      this.group = new THREE.Group(); this.group.add(this.mesh);
      // soft contact shadow blob (cheap, always visible even beyond shadow frustum)
      const c = U.canvas(128, 128), g = c.getContext('2d');
      const grd = g.createRadialGradient(64, 64, 8, 64, 64, 64); grd.addColorStop(0, 'rgba(0,0,0,0.55)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
      this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: U.canvasTexture(c), transparent: true, depthWrite: false }));
      this.blob.renderOrder = 1;
      scene.add(this.group); scene.add(this.blob);
      this.visible = true;
    }
    reset() { this.pos.set(0, 0, C.BALL_R); this.vel.set(0, 0, 0); this.w.set(0, 0, 0); this.lastTouch = null; this.prevTouch = null; this.lastTouchT = -99; }
    setVisible(v) { this.visible = v; this.group.visible = v; this.blob.visible = v; }
    step(dt) {
      const vel = this.vel, pos = this.pos;
      vel.z -= C.GRAVITY * dt;
      vel.multiplyScalar(Math.max(0, 1 - C.BALL_DRAG * dt));
      pos.addScaledVector(vel, dt);
      const pen = A.sphereContact(pos, this.R, _n);
      if (pen > 0) {
        pos.addScaledVector(_n, pen);
        this.bounce(_n);
      }
      const sp = vel.length(); if (sp > C.BALL_MAX_V) vel.multiplyScalar(C.BALL_MAX_V / sp);
      const wl = this.w.length(); if (wl > C.BALL_MAX_W) this.w.multiplyScalar(C.BALL_MAX_W / wl);
      U.integrateQuat(this.q, this.w, dt);
      if (!isFinite(pos.x) || !isFinite(vel.x)) this.reset();
    }
    bounce(n) {
      const vel = this.vel;
      const vn = vel.dot(n);
      if (vn >= 0) return;
      _vperp.copy(n).multiplyScalar(vn);
      // slip velocity at the contact point: v_para + R (n x w)
      _s.copy(vel).sub(_vperp);
      _t.copy(n).cross(this.w).multiplyScalar(this.R); _s.add(_t);
      const slen = _s.length();
      const ratio = slen > 1e-4 ? Math.abs(vn) / slen : 1e9;
      const e = -vn > 12 ? C.BALL_REST : 0;
      // perpendicular
      vel.addScaledVector(_vperp, -(1 + e));
      // parallel (friction) with rolling coupling
      if (slen > 1e-4) {
        const f = Math.min(1, C.BALL_MU * ratio) / 3.5;
        _dv.copy(_s).multiplyScalar(-f);
        vel.add(_dv);
        _t.copy(n).cross(_dv).multiplyScalar(-2.5 / this.R);
        this.w.add(_t);
      }
      if (-vn > 60) this.events.push({ type: 'bounce', speed: -vn, pos: this.pos.clone() });
    }
    syncVisual() {
      this.group.position.copy(this.pos); this.group.quaternion.copy(this.q);
      // ground blob: scale with height
      const h = Math.max(0, this.pos.z - this.R);
      const s = this.R * 2.2 * (1 + h / 900);
      this.blob.position.set(this.pos.x, this.pos.y, 2.5);
      this.blob.scale.set(s, s, 1);
      this.blob.material.opacity = U.clamp(1 - h / 1400, 0.15, 1) * 0.9;
    }
  }
  return Ball;
})();
