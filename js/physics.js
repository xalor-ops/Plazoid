// World stepping and inter-object collisions: car-ball (rigid impulse + Psyonix "hit direction" impulse),
// car-car (bumps and demolitions), boost pad pickups.
window.RL = window.RL || {};
RL.Physics = (function () {
  const C = RL.C, U = RL.U;
  const HB = C.HITBOX;
  const _c = new THREE.Vector3(), _d = new THREE.Vector3(), _n = new THREE.Vector3(), _cp = new THREE.Vector3(), _rc = new THREE.Vector3();
  const _vp = new THREE.Vector3(), _vrel = new THREE.Vector3(), _rn = new THREE.Vector3(), _irn = new THREE.Vector3(), _t = new THREE.Vector3(), _t2 = new THREE.Vector3(), _n2 = new THREE.Vector3(), _qi = new THREE.Quaternion();
  const L = HB.hx * 2, W = HB.hy * 2, H = HB.hz * 2, m12 = C.CAR_MASS / 12;
  const INV_I = new THREE.Vector3(1 / (m12 * (W * W + H * H)), 1 / (m12 * (L * L + H * H)), 1 / (m12 * (L * L + W * W)));
  const SCALE_TABLE = [[0, 0.65], [500, 0.65], [2300, 0.55], [4600, 0.30]];
  const BUMP_V = [[0, 0], [1400, 1100], [2200, 1530]], BUMP_UP = [[0, 0], [1400, 278], [2200, 417]];

  function carBall(car, ball, time, events) {
    if (car.demolished) return;
    _c.set(HB.ox, HB.oy, HB.oz).applyQuaternion(car.q).add(car.pos);
    _d.copy(ball.pos).sub(_c);
    const lx = _d.dot(car.fwd), ly = _d.dot(car.left), lz = _d.dot(car.up);
    const cx = U.clamp(lx, -HB.hx, HB.hx), cy = U.clamp(ly, -HB.hy, HB.hy), cz = U.clamp(lz, -HB.hz, HB.hz);
    const dx = lx - cx, dy = ly - cy, dz = lz - cz;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist >= ball.R) return;
    if (dist < 1e-3) { _n.copy(car.up); }
    else { _n.copy(car.fwd).multiplyScalar(dx / dist).addScaledVector(car.left, dy / dist).addScaledVector(car.up, dz / dist); }
    _cp.copy(_c).addScaledVector(car.fwd, cx).addScaledVector(car.left, cy).addScaledVector(car.up, cz);
    const pen = ball.R - dist;
    ball.pos.addScaledVector(_n, pen);
    _rc.copy(_cp).sub(car.pos);
    _vp.copy(car.w).cross(_rc).add(car.vel);
    _vrel.copy(ball.vel).sub(_vp);
    const vn = _vrel.dot(_n);
    if (vn >= 0) return;
    // relative speed before the impulse (for the extra impulse)
    const dv = Math.min(_t.copy(ball.vel).sub(car.vel).length(), 4600);
    // inelastic normal impulse including car rotation
    _rn.copy(_rc).cross(_n);
    _irn.copy(_rn).applyQuaternion(_qi.copy(car.q).invert()).multiply(INV_I).applyQuaternion(car.q);
    const K = 1 / C.BALL_MASS + 1 / C.CAR_MASS + _t.copy(_irn).cross(_rc).dot(_n);
    const J = -vn / K;
    ball.vel.addScaledVector(_n, J / C.BALL_MASS);
    car.vel.addScaledVector(_n, -J / C.CAR_MASS);
    car.w.addScaledVector(_irn, -J * 0.6);
    // tangential friction -> ball spin
    _t.copy(_vrel).addScaledVector(_n, -vn); const vt = _t.length();
    if (vt > 1e-3) {
      const f = Math.min(0.3, 2.0 * J / (C.BALL_MASS * vt));
      _t2.copy(_t).multiplyScalar(-f);
      ball.vel.add(_t2);
      _t.copy(_n).cross(_t2).multiplyScalar(-2.5 / ball.R); ball.w.add(_t);
    }
    // Psyonix extra impulse: pushes the ball along car->ball (flattened) scaled by relative speed
    _n2.copy(ball.pos).sub(car.pos); _n2.z *= 0.35; _n2.normalize();
    const scale = U.table(SCALE_TABLE, dv);
    ball.vel.addScaledVector(_n2, dv * scale);
    // touch bookkeeping
    if (ball.lastTouch !== car) { ball.prevTouch = ball.lastTouch; ball.prevTouchT = ball.lastTouchT; }
    ball.lastTouch = car; ball.lastTouchT = time; car.lastTouchT = time; car.stats.touches++;
    events.push({ type: 'ballHit', car, speed: -vn, dv, pos: _cp.clone(), ballSpeed: ball.vel.length() });
  }

  // capsule-capsule closest points (segments along each car's forward axis)
  const _pa = new THREE.Vector3(), _pb = new THREE.Vector3(), _da = new THREE.Vector3(), _db = new THREE.Vector3(), _r = new THREE.Vector3();
  function carCar(a, b, time, events) {
    if (a.demolished || b.demolished) return;
    const HL = 46, RAD = 41;
    _pa.set(HB.ox, 0, HB.oz).applyQuaternion(a.q).add(a.pos); _pb.set(HB.ox, 0, HB.oz).applyQuaternion(b.q).add(b.pos);
    if (_pa.distanceToSquared(_pb) > 160 * 160) return;
    _da.copy(a.fwd).multiplyScalar(HL * 2); _db.copy(b.fwd).multiplyScalar(HL * 2);
    _pa.addScaledVector(a.fwd, -HL); _pb.addScaledVector(b.fwd, -HL);
    _r.copy(_pa).sub(_pb);
    const A_ = _da.dot(_da), B_ = _da.dot(_db), Cc = _db.dot(_db), D_ = _da.dot(_r), E_ = _db.dot(_r);
    const den = A_ * Cc - B_ * B_;
    let s = den !== 0 ? U.clamp((B_ * E_ - Cc * D_) / den, 0, 1) : 0;
    let t = (B_ * s + E_) / Cc;
    if (t < 0) { t = 0; s = U.clamp(-D_ / A_, 0, 1); } else if (t > 1) { t = 1; s = U.clamp((B_ - D_) / A_, 0, 1); }
    _t.copy(_pa).addScaledVector(_da, s); _t2.copy(_pb).addScaledVector(_db, t);
    _n.copy(_t2).sub(_t); const dist = _n.length();
    if (dist >= RAD * 2 || dist < 1e-4) return;
    _n.multiplyScalar(1 / dist);
    const pen = RAD * 2 - dist;
    a.pos.addScaledVector(_n, -pen * 0.5); b.pos.addScaledVector(_n, pen * 0.5);
    _vrel.copy(b.vel).sub(a.vel); const vn = _vrel.dot(_n);
    if (vn < 0) {
      const J = -(1 + C.CARCAR_REST) * vn / (2 / C.CAR_MASS);
      a.vel.addScaledVector(_n, -J / C.CAR_MASS); b.vel.addScaledVector(_n, J / C.CAR_MASS);
    }
    // bump / demo (attacker must hit with its front, fast enough)
    for (const [att, vic, dir] of [[a, b, 1], [b, a, -1]]) {
      const toward = att.vel.dot(_n) * dir;
      const frontal = att.fwd.dot(_n) * dir;
      if (toward > C.BUMP_MIN_SPEED && frontal > 0.55 && att.bumpCooldown <= 0) {
        att.bumpCooldown = 0.25;
        if (att.supersonic && att.team !== vic.team) {
          vic.demolish(time); att.stats.demos++; att.stats.score += 25;
          events.push({ type: 'demo', attacker: att, victim: vic, pos: vic.pos.clone() });
        } else {
          const sp = att.speed;
          const fh = _t.set(att.fwd.x, att.fwd.y, 0).normalize();
          vic.vel.addScaledVector(fh, U.table(BUMP_V, sp) * 0.85);
          vic.vel.z += U.table(BUMP_UP, sp);
          vic.grounded = false; vic.airT = 0;
          vic.w.addScaledVector(vic.up, (Math.random() - 0.5) * 3);
          events.push({ type: 'bump', attacker: att, victim: vic, speed: sp, pos: vic.pos.clone() });
        }
      }
    }
  }

  function pads(cars, padList, events) {
    for (const p of padList) {
      if (!p.active) continue;
      for (const car of cars) {
        if (car.demolished || car.boost >= 100) continue;
        const dx = car.pos.x - p.x, dy = car.pos.y - p.y;
        const h = p.big ? C.PAD_BIG_H : C.PAD_SMALL_H;
        if (dx * dx + dy * dy < p.r * p.r && car.pos.z < h + 20) {
          car.boost = Math.min(100, car.boost + p.amount);
          RL.Arena.takePad(p);
          events.push({ type: 'pad', car, big: p.big, pos: new THREE.Vector3(p.x, p.y, 40) });
          break;
        }
      }
    }
  }

  function step(world, dt, time, events) {
    const cars = world.cars, ball = world.ball;
    for (const c of cars) c.step(dt, time);
    ball.step(dt);
    for (const c of cars) carBall(c, ball, time, events);
    for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) carCar(cars[i], cars[j], time, events);
    pads(cars, world.pads, events);
    for (const c of cars) { for (const e of c.events) { e.car = c; events.push(e); } c.events.length = 0; }
    for (const e of ball.events) events.push(e); ball.events.length = 0;
  }
  return { step, carBall, carCar, pads };
})();
