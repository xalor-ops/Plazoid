// Visual effects: batched billboard particles (one draw call), boost jets + ribbon trails, supersonic trails,
// ball trail, goal explosion shockwave, boost pad glows, plus a lightweight bloom post-process.
window.RL = window.RL || {};
RL.FX = (function () {
  const U = RL.U, C = RL.C;
  let scene, quality = 'high';
  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

  // ---- batched camera-facing quads ----
  class BillboardBatch {
    constructor(max, texture, additive, depthTest) {
      this.max = max; this.count = 0;
      const geo = new THREE.BufferGeometry();
      this.center = new Float32Array(max * 4 * 3); this.corner = new Float32Array(max * 4 * 2); this.color = new Float32Array(max * 4 * 4); this.size = new Float32Array(max * 4);
      for (let i = 0; i < max; i++) { const o = i * 8; this.corner[o] = -0.5; this.corner[o + 1] = -0.5; this.corner[o + 2] = 0.5; this.corner[o + 3] = -0.5; this.corner[o + 4] = 0.5; this.corner[o + 5] = 0.5; this.corner[o + 6] = -0.5; this.corner[o + 7] = 0.5; }
      const idx = new Uint32Array(max * 6); for (let i = 0; i < max; i++) { const a = i * 4, o = i * 6; idx[o] = a; idx[o + 1] = a + 1; idx[o + 2] = a + 2; idx[o + 3] = a; idx[o + 4] = a + 2; idx[o + 5] = a + 3; }
      geo.setAttribute('position', new THREE.BufferAttribute(this.center, 3));
      geo.setAttribute('aCorner', new THREE.BufferAttribute(this.corner, 2));
      geo.setAttribute('aColor', new THREE.BufferAttribute(this.color, 4));
      geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.setDrawRange(0, 0);
      geo.attributes.position.setUsage(THREE.DynamicDrawUsage); geo.attributes.aColor.setUsage(THREE.DynamicDrawUsage); geo.attributes.aSize.setUsage(THREE.DynamicDrawUsage);
      const mat = new THREE.ShaderMaterial({
        uniforms: { map: { value: texture } },
        vertexShader: 'attribute vec2 aCorner; attribute vec4 aColor; attribute float aSize; varying vec2 vUv; varying vec4 vColor;\nvoid main(){ vUv = aCorner + 0.5; vColor = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0); mv.xy += aCorner * aSize; gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'uniform sampler2D map; varying vec2 vUv; varying vec4 vColor;\nvoid main(){ vec4 t = texture2D(map, vUv); gl_FragColor = vec4(t.rgb * vColor.rgb, t.a * vColor.a); }',
        transparent: true, depthWrite: false, depthTest: depthTest !== false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
      });
      this.mesh = new THREE.Mesh(geo, mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 5;
      this.geo = geo;
    }
    begin() { this.count = 0; }
    add(x, y, z, size, r, g, b, a) {
      if (this.count >= this.max) return;
      const i = this.count++; const o3 = i * 12, o4 = i * 16, o1 = i * 4;
      for (let k = 0; k < 4; k++) { this.center[o3 + k * 3] = x; this.center[o3 + k * 3 + 1] = y; this.center[o3 + k * 3 + 2] = z; this.color[o4 + k * 4] = r; this.color[o4 + k * 4 + 1] = g; this.color[o4 + k * 4 + 2] = b; this.color[o4 + k * 4 + 3] = a; this.size[o1 + k] = size; }
    }
    end() {
      this.geo.setDrawRange(0, this.count * 6);
      this.geo.attributes.position.needsUpdate = true; this.geo.attributes.aColor.needsUpdate = true; this.geo.attributes.aSize.needsUpdate = true;
      this.mesh.visible = this.count > 0;
    }
  }

  // ---- ribbon trail ----
  class Ribbon {
    constructor(n, width, color, opacity, additive) {
      this.n = n; this.width = width; this.pts = []; for (let i = 0; i < n; i++) this.pts.push(new THREE.Vector3());
      this.count = 0; this.fade = 0;
      const geo = new THREE.BufferGeometry();
      this.pos = new Float32Array(n * 2 * 3); this.col = new Float32Array(n * 2 * 4);
      geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
      const idx = []; for (let i = 0; i < n - 1; i++) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, b, c, b, d, c); }
      geo.setIndex(idx);
      this.mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
      this.mesh = new THREE.Mesh(geo, this.mat); this.mesh.frustumCulled = false; this.mesh.visible = false;
      this.color = new THREE.Color(color); this.opacity = opacity;
      scene.add(this.mesh);
    }
    setColor(c) { this.color.set(c); }
    push(p, active, camPos) {
      if (active) {
        for (let i = this.n - 1; i > 0; i--) this.pts[i].copy(this.pts[i - 1]);
        this.pts[0].copy(p);
        this.count = Math.min(this.n, this.count + 1);
        this.fade = 1;
      } else {
        this.fade = Math.max(0, this.fade - 0.06);
        for (let i = this.n - 1; i > 0; i--) this.pts[i].lerp(this.pts[i - 1], 0.35);
        if (this.fade <= 0) { this.mesh.visible = false; this.count = 0; return; }
      }
      if (this.count < 2) { this.mesh.visible = false; return; }
      this.mesh.visible = true;
      const c = this.color;
      for (let i = 0; i < this.n; i++) {
        const t = i / (this.n - 1);
        const p0 = this.pts[Math.min(i, this.count - 1)], p1 = this.pts[Math.min(i + 1, this.count - 1)];
        _v.subVectors(p0, p1); if (_v.lengthSq() < 1e-6) _v.set(0, 0, 1);
        _v2.subVectors(camPos, p0);
        _v3.crossVectors(_v, _v2).normalize();
        const w = this.width * (1 - t * 0.7) * (i < this.count ? 1 : 0);
        const a = (1 - t) * this.opacity * this.fade * (i < this.count ? 1 : 0);
        const j = i * 2;
        this.pos[j * 3] = p0.x + _v3.x * w; this.pos[j * 3 + 1] = p0.y + _v3.y * w; this.pos[j * 3 + 2] = p0.z + _v3.z * w;
        this.pos[j * 3 + 3] = p0.x - _v3.x * w; this.pos[j * 3 + 4] = p0.y - _v3.y * w; this.pos[j * 3 + 5] = p0.z - _v3.z * w;
        for (let k = 0; k < 2; k++) { const o = (j + k) * 4; this.col[o] = c.r; this.col[o + 1] = c.g; this.col[o + 2] = c.b; this.col[o + 3] = a; }
      }
      this.mesh.geometry.attributes.position.needsUpdate = true; this.mesh.geometry.attributes.color.needsUpdate = true;
    }
    dispose() { scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mat.dispose(); }
  }

  // ---- particles (CPU simulated, drawn through one batch) ----
  let particleTex, particles = [], batch, glowBatch;
  const MAXP = 700;
  function makeParticleTex() {
    const c = U.canvas(64, 64), g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 32); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.4, 'rgba(255,255,255,0.6)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    return U.canvasTexture(c);
  }
  const _c = new THREE.Color();
  function spawn(pos, vel, size, color, life, opts) {
    if (particles.length >= MAXP) particles.shift();
    _c.set(color);
    particles.push({ x: pos.x, y: pos.y, z: pos.z, vx: vel.x, vy: vel.y, vz: vel.z, life, maxLife: life, size, r: _c.r, g: _c.g, b: _c.b, gravity: opts && opts.gravity !== undefined ? opts.gravity : 0, drag: opts && opts.drag !== undefined ? opts.drag : 1.5, shrink: opts && opts.shrink !== undefined ? opts.shrink : 1 });
  }
  function burst(pos, count, speed, size, color, life, opts) {
    for (let i = 0; i < count; i++) {
      _v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      if (opts && opts.up) _v.z += opts.up;
      spawn(pos, _v, size * (0.6 + Math.random() * 0.8), color, life * (0.6 + Math.random() * 0.7), opts);
    }
  }
  function updateParticles(dt) {
    batch.begin();
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.vz -= p.gravity * dt; const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; p.vz *= k;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const t = p.life / p.maxLife;
      const a = Math.min(1, t * 1.6);
      const s = p.size * (p.shrink ? (0.3 + 0.7 * t) : 1);
      batch.add(p.x, p.y, p.z, s, p.r, p.g, p.b, a);
    }
    batch.end();
  }

  // ---- boost pad glows (batched) ----
  let pads = null;
  function setPads(list) { pads = list; }
  function updatePadGlows(time) {
    if (!pads) return;
    glowBatch.begin();
    for (const p of pads) {
      if (!p.active) continue;
      const s = p.spawnT < 0.5 ? U.smoothstep(0, 0.5, p.spawnT) : 1;
      if (p.big) { const z = 85 + Math.sin(time * 2.2 + p.index) * 6; glowBatch.add(p.x, p.y, z, 300 * s, 1, 0.62, 0.22, 0.8 * s); glowBatch.add(p.x, p.y, z, 130 * s, 1, 0.9, 0.6, 0.6 * s); }
      else glowBatch.add(p.x, p.y, 14, 72 * s, 1, 0.6, 0.2, 0.7 * s);
    }
    glowBatch.end();
  }

  // ---- goal explosion (mouth-centered shockwave, flash sphere, ground ring, sparks) ----
  let explosions = [];
  const ringGeo = new THREE.TorusGeometry(1, 0.06, 8, 96);
  const sphereGeo = new THREE.SphereGeometry(1, 32, 20);
  function goalExplosion(pos, team, dirSign) {
    const col = new THREE.Color(RL.TEAM_COLOR[team]);
    const mk = (geo, color, op) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); m.position.copy(pos); scene.add(m); return m; };
    const groundRing = mk(ringGeo, col, 0.95); groundRing.position.z = 6;
    const wallRing = mk(ringGeo, 0xffffff, 0.9); wallRing.rotation.x = Math.PI / 2; // plane facing +-y (vertical, parallel to the goal)
    const sphere = mk(sphereGeo, 0xffffff, 1.0);
    const sphere2 = mk(sphereGeo, col, 0.7);
    explosions.push({ groundRing, wallRing, sphere, sphere2, t: 0, col, dirSign: dirSign || -Math.sign(pos.y) });
    const n = quality === 'low' ? 120 : 260;
    burst(pos, n, 3000, 80, col, 2.2, { gravity: 900, drag: 0.7, up: 1300 });
    burst(pos, n * 0.5, 2000, 120, 0xffffff, 1.4, { gravity: 700, drag: 1.0, up: 900 });
    burst(pos, 40, 900, 360, col, 0.9, { drag: 2.0 });
    burst(pos, 24, 300, 700, col, 1.6, { drag: 1.0, shrink: 0 });
    // a wave of sparks along the ground
    for (let i = 0; i < (quality === 'low' ? 40 : 90); i++) { const a = Math.random() * Math.PI * 2; _v.set(Math.cos(a) * 2600, Math.sin(a) * 2600, 120 + Math.random() * 300); _v2.copy(pos); _v2.z = 30; spawn(_v2, _v, 40 + Math.random() * 40, Math.random() < 0.5 ? col : 0xffffff, 1.2 + Math.random() * 0.6, { gravity: 300, drag: 0.8 }); }
  }
  function updateExplosions(dt) {
    for (let i = explosions.length - 1; i >= 0; i--) {
      const e = explosions[i]; e.t += dt;
      const t = e.t / 1.6;
      if (t >= 1) { for (const k of ['groundRing', 'wallRing', 'sphere', 'sphere2']) { scene.remove(e[k]); e[k].material.dispose(); } explosions.splice(i, 1); continue; }
      const r = 150 + 5200 * Math.pow(t, 0.5);
      e.groundRing.scale.set(r, r, 1); e.groundRing.material.opacity = 0.95 * (1 - t) * (1 - t);
      const r2 = 120 + 3600 * Math.pow(t, 0.55); e.wallRing.scale.set(r2, r2, 1); e.wallRing.material.opacity = 0.9 * (1 - t);
      const f = 120 + 2600 * Math.pow(Math.min(1, t * 2.2), 0.5); e.sphere.scale.set(f, f, f); e.sphere.material.opacity = Math.max(0, 1 - t * 2.4);
      const f2 = 200 + 1600 * Math.pow(Math.min(1, t * 1.6), 0.6); e.sphere2.scale.set(f2, f2, f2); e.sphere2.material.opacity = Math.max(0, 0.7 - t * 1.4);
    }
  }

  // ---- per car effects ----
  const carFx = new Map();
  let jetTex;
  function makeJetTex() {
    const c = U.canvas(128, 64), g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 128, 0); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.15, 'rgba(255,220,120,0.95)'); grd.addColorStop(0.5, 'rgba(255,120,30,0.6)'); grd.addColorStop(1, 'rgba(255,60,10,0)');
    g.fillStyle = grd;
    g.beginPath(); g.moveTo(0, 20); g.quadraticCurveTo(64, -10, 128, 32); g.quadraticCurveTo(64, 74, 0, 44); g.closePath(); g.fill();
    return U.canvasTexture(c);
  }
  function attachCar(car) {
    if (carFx.has(car)) return carFx.get(car);
    const jetMat = new THREE.MeshBasicMaterial({ map: jetTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const jet = new THREE.Group();
    for (let i = 0; i < 2; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(90, 34), jetMat); m.position.x = -45; m.rotation.x = i * Math.PI / 2; jet.add(m); }
    jet.position.copy(car.model.boostPos); jet.visible = false;
    car.group.add(jet);
    const fx = { jet, trail: new Ribbon(26, 16, 0xff9a30, 0.55, true), ss1: new Ribbon(18, 6, 0xffffff, 0.35, false), ss2: new Ribbon(18, 6, 0xffffff, 0.35, false), t: Math.random() * 10 };
    carFx.set(car, fx);
    return fx;
  }
  function detachCar(car) { const fx = carFx.get(car); if (!fx) return; fx.trail.dispose(); fx.ss1.dispose(); fx.ss2.dispose(); car.group.remove(fx.jet); carFx.delete(car); }
  function updateCars(cars, dt, camPos) {
    for (const car of cars) {
      const fx = attachCar(car);
      fx.t += dt;
      const boosting = car.boosting && !car.demolished;
      fx.jet.visible = boosting;
      _v.copy(car.model.boostPos).applyQuaternion(car.q).add(car.pos);
      if (boosting) {
        const fl = 0.85 + 0.3 * Math.sin(fx.t * 61) * Math.sin(fx.t * 37);
        fx.jet.scale.set(fl * (1 + car.speed / 4000), 1 + 0.25 * Math.sin(fx.t * 53), 1 + 0.25 * Math.cos(fx.t * 47));
        // glow at the nozzle + sparks
        spawn(_v, _v2.set(0, 0, 0), 62 * fl, 0xffa040, 0.05, { drag: 0, shrink: 0 });
        if (Math.random() < 0.6) {
          _v2.copy(car.fwd).multiplyScalar(-600 - Math.random() * 300).addScaledVector(car.vel, 0.3); _v2.x += (Math.random() - 0.5) * 120; _v2.y += (Math.random() - 0.5) * 120; _v2.z += (Math.random() - 0.5) * 120;
          spawn(_v, _v2, 30 + Math.random() * 25, Math.random() < 0.5 ? 0xffb050 : 0xff7a20, 0.28 + Math.random() * 0.2, { drag: 3 });
        }
      }
      fx.trail.push(_v, boosting, camPos);
      const ss = car.supersonic && !car.demolished;
      _v2.set(-30, 44, 8).applyQuaternion(car.q).add(car.pos); fx.ss1.push(_v2, ss, camPos);
      _v2.set(-30, -44, 8).applyQuaternion(car.q).add(car.pos); fx.ss2.push(_v2, ss, camPos);
    }
  }

  // ---- ball trail ----
  let ballTrail;
  function updateBall(ball, dt, camPos) {
    const sp = ball.vel.length();
    const active = sp > 1100 && ball.visible;
    if (ball.lastTouch) ballTrail.setColor(ball.lastTouch.team === 0 ? 0x4aa3ff : 0xffa040); else ballTrail.setColor(0xffffff);
    ballTrail.opacity = U.clamp((sp - 1100) / 2500, 0, 0.5);
    ballTrail.push(ball.pos, active, camPos);
  }

  // ---- events ----
  function onEvent(e, cam) {
    switch (e.type) {
      case 'pad': burst(e.pos, e.big ? 26 : 10, e.big ? 700 : 350, e.big ? 60 : 30, 0xffb040, 0.45, { drag: 3, up: 200 }); break;
      case 'ballHit': if (e.speed > 350) burst(e.pos, Math.min(14, e.speed / 120 | 0), 500, 26, 0xffffff, 0.3, { drag: 4 }); if (e.speed > 900 && cam) cam.shake(Math.min(12, e.speed / 200)); break;
      case 'bump': burst(e.pos, 12, 500, 30, 0xffffff, 0.3, { drag: 4 }); break;
      case 'demo': burst(e.pos, 70, 1500, 60, 0xff6a2a, 1.0, { gravity: 700, drag: 1.5, up: 300 }); burst(e.pos, 25, 700, 120, 0xffffff, 0.5, { drag: 3 }); if (cam) cam.shake(10); break;
      case 'land': if (e.speed > 250) { _v.copy(e.car.pos); _v.z -= 10; burst(_v, 8, 260, 40, 0xb8b8a0, 0.5, { drag: 3, up: 60 }); } break;
      case 'wallhit': if (e.speed > 500) burst(e.car.pos, 10, 400, 30, 0xffffff, 0.3, { drag: 4 }); break;
    }
  }

  // ---- bloom (cheap: downsample bright pass, 2 blur passes, additive composite) ----
  let bloom = null;
  function makeBloom(renderer) {
    const rtOpts = { type: THREE.HalfFloatType, depthBuffer: false };
    const scale = quality === 'high' ? 0.5 : 0.35;
    const w = Math.max(1, Math.floor(renderer.domElement.width * scale)), h = Math.max(1, Math.floor(renderer.domElement.height * scale));
    const rtScene = new THREE.WebGLRenderTarget(renderer.domElement.width, renderer.domElement.height, { type: quality === 'low' ? THREE.UnsignedByteType : THREE.HalfFloatType, depthBuffer: true, samples: quality === 'high' ? 4 : (quality === 'medium' ? 2 : 4) });
    const rtA = new THREE.WebGLRenderTarget(w, h, rtOpts), rtB = new THREE.WebGLRenderTarget(w, h, rtOpts);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const vs = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
    const bright = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, threshold: { value: 0.9 } }, vertexShader: vs, fragmentShader: 'uniform sampler2D tDiffuse; uniform float threshold; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); float l = max(max(c.r,c.g),c.b); float k = smoothstep(threshold, threshold + 0.8, l); gl_FragColor = vec4(c.rgb * k, 1.0); }' });
    const blur = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, dir: { value: new THREE.Vector2(1, 0) }, texel: { value: new THREE.Vector2(1 / w, 1 / h) } }, vertexShader: vs, fragmentShader: 'uniform sampler2D tDiffuse; uniform vec2 dir; uniform vec2 texel; varying vec2 vUv; void main(){ vec2 o = dir * texel; vec4 s = texture2D(tDiffuse, vUv) * 0.227; s += (texture2D(tDiffuse, vUv + o*1.385) + texture2D(tDiffuse, vUv - o*1.385)) * 0.316; s += (texture2D(tDiffuse, vUv + o*3.23) + texture2D(tDiffuse, vUv - o*3.23)) * 0.070; gl_FragColor = s; }' });
    const comp = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, tBloom: { value: null }, strength: { value: 0.55 } }, vertexShader: vs, fragmentShader: 'uniform sampler2D tDiffuse; uniform sampler2D tBloom; uniform float strength; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); vec4 b = texture2D(tBloom, vUv); gl_FragColor = vec4(c.rgb + b.rgb * strength, 1.0); }', depthTest: false, depthWrite: false });
    const copy = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null } }, vertexShader: vs, fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tDiffuse, vUv); }', depthTest: false, depthWrite: false });
    const sceneQ = new THREE.Scene(); sceneQ.add(quad);
    bloom = { rtScene, rtA, rtB, quad, cam, bright, blur, comp, copy, sceneQ, w, h, enabled: quality !== 'low' };
  }
  function resizeBloom(renderer) { if (!bloom) return; disposeBloom(); makeBloom(renderer); }
  function disposeBloom() { if (!bloom) return; bloom.rtScene.dispose(); bloom.rtA.dispose(); bloom.rtB.dispose(); bloom = null; }
  function render(renderer, scene3, camera) {
    if (!bloom) { renderer.render(scene3, camera); return; }
    const b = bloom;
    renderer.setRenderTarget(b.rtScene); renderer.render(scene3, camera);
    const tm = renderer.toneMapping; renderer.toneMapping = THREE.NoToneMapping;
    if (!b.enabled) {
      // performance preset: MSAA resolve + copy only (tone mapping already applied when rendering to the RT)
      b.quad.material = b.copy; b.copy.uniforms.tDiffuse.value = b.rtScene.texture;
      renderer.setRenderTarget(null); renderer.render(b.sceneQ, b.cam);
      renderer.toneMapping = tm; return;
    }
    b.quad.material = b.bright; b.bright.uniforms.tDiffuse.value = b.rtScene.texture; renderer.setRenderTarget(b.rtA); renderer.render(b.sceneQ, b.cam);
    b.quad.material = b.blur;
    for (let i = 0; i < 2; i++) {
      b.blur.uniforms.tDiffuse.value = b.rtA.texture; b.blur.uniforms.dir.value.set(1 + i, 0); renderer.setRenderTarget(b.rtB); renderer.render(b.sceneQ, b.cam);
      b.blur.uniforms.tDiffuse.value = b.rtB.texture; b.blur.uniforms.dir.value.set(0, 1 + i); renderer.setRenderTarget(b.rtA); renderer.render(b.sceneQ, b.cam);
    }
    b.quad.material = b.comp; b.comp.uniforms.tDiffuse.value = b.rtScene.texture; b.comp.uniforms.tBloom.value = b.rtA.texture;
    renderer.setRenderTarget(null); renderer.render(b.sceneQ, b.cam);
    renderer.toneMapping = tm;
  }

  function init(scene3, q, renderer) {
    scene = scene3; quality = q;
    particleTex = makeParticleTex(); jetTex = makeJetTex();
    batch = new BillboardBatch(MAXP, particleTex, true, true); scene.add(batch.mesh);
    glowBatch = new BillboardBatch(80, particleTex, true, true); scene.add(glowBatch.mesh);
    ballTrail = new Ribbon(22, 40, 0xffffff, 0.4, true);
    makeBloom(renderer);
  }
  function setQuality(q, renderer) { quality = q; disposeBloom(); makeBloom(renderer); }
  function update(dt, time) { updateParticles(dt); updateExplosions(dt); updatePadGlows(time || 0); }
  function clear() { particles.length = 0; }
  return { init, update, updateCars, updateBall, onEvent, goalExplosion, burst, attachCar, detachCar, render, resizeBloom, setQuality, clear, setPads, BillboardBatch, get bloomEnabled() { return !!(bloom && bloom.enabled); } };
})();
