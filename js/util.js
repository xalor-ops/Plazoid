// Small helpers: math, interpolation tables, canvas textures, seeded random, geometry merging.
window.RL = window.RL || {};
RL.U = (function () {
  const V3 = THREE.Vector3;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const damp = (cur, target, rate, dt) => lerp(cur, target, 1 - Math.exp(-rate * dt));
  const sign = (v) => v < 0 ? -1 : 1;
  function table(tbl, x) {
    if (x <= tbl[0][0]) return tbl[0][1];
    for (let i = 1; i < tbl.length; i++) {
      if (x <= tbl[i][0]) { const x0 = tbl[i - 1][0], y0 = tbl[i - 1][1], x1 = tbl[i][0], y1 = tbl[i][1]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
    }
    return tbl[tbl.length - 1][1];
  }
  function rng(seed) {
    let a = seed >>> 0;
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  const rand = (a, b) => a + Math.random() * (b - a);
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function canvasTexture(c, opts) {
    const t = new THREE.CanvasTexture(c);
    opts = opts || {};
    t.wrapS = t.wrapT = opts.repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    t.anisotropy = opts.aniso || 8;
    t.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    if (opts.nearest) t.magFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    return t;
  }
  function makeNoise(seed) {
    const r = rng(seed); const N = 256; const perm = new Uint8Array(N * 2); const grad = new Float32Array(N);
    for (let i = 0; i < N; i++) { perm[i] = i; grad[i] = r(); }
    for (let i = N - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
    for (let i = 0; i < N; i++) perm[i + N] = perm[i];
    const fade = (t) => t * t * (3 - 2 * t);
    function v(x, y) { return grad[perm[perm[x & 255] + (y & 255)]]; }
    function noise(x, y) {
      const xi = Math.floor(x), yi = Math.floor(y); const fx = fade(x - xi), fy = fade(y - yi);
      const a = v(xi, yi), b = v(xi + 1, yi), c = v(xi, yi + 1), d = v(xi + 1, yi + 1);
      return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
    }
    function fbm(x, y, oct, lac, gain) {
      let s = 0, amp = 0.5, f = 1, norm = 0;
      for (let i = 0; i < oct; i++) { s += amp * noise(x * f, y * f); norm += amp; amp *= (gain || 0.5); f *= (lac || 2); }
      return s / norm;
    }
    return { noise, fbm };
  }
  function hexToRgb(hex) { const n = parseInt(hex.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rgba(hex, a) { const c = hexToRgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function shade(hex, f) { const c = hexToRgb(hex); const k = (v) => clamp(Math.round(v * f), 0, 255); return 'rgb(' + k(c[0]) + ',' + k(c[1]) + ',' + k(c[2]) + ')'; }
  function fmtTime(s) { s = Math.max(0, Math.ceil(s)); const m = Math.floor(s / 60); const r = s % 60; return m + ':' + (r < 10 ? '0' : '') + r; }
  const _q = new THREE.Quaternion(), _v = new V3(), _v2 = new V3();
  function integrateQuat(q, w, dt) {
    const len = w.length(); if (len < 1e-9) return;
    _v.copy(w).multiplyScalar(1 / len);
    _q.setFromAxisAngle(_v, len * dt);
    q.premultiply(_q).normalize();
  }
  function alignUp(q, n, out) {
    _v.set(0, 0, 1).applyQuaternion(q);
    _q.setFromUnitVectors(_v, n);
    out.copy(q).premultiply(_q).normalize();
    return out;
  }
  function yawOf(q) { _v.set(1, 0, 0).applyQuaternion(q); return Math.atan2(_v.y, _v.x); }
  function setYaw(q, yaw) { q.setFromAxisAngle(_v2.set(0, 0, 1), yaw); return q; }
  function dist2d(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
  function angleWrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

  // Merge a list of {geo, matrix?, color?} into one non-indexed BufferGeometry (position, normal, uv, optional color).
  function mergeGeos(items, withColor) {
    let total = 0; const parts = [];
    for (const it of items) {
      let g = it.geo.index ? it.geo.toNonIndexed() : it.geo;
      if (it.matrix) { g = g.clone(); g.applyMatrix4(it.matrix); }
      if (!g.attributes.normal) g.computeVertexNormals();
      parts.push({ g, color: it.color }); total += g.attributes.position.count;
    }
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
    const col = withColor ? new Float32Array(total * 3) : null;
    let off = 0;
    for (const p of parts) {
      const n = p.g.attributes.position.count;
      pos.set(p.g.attributes.position.array, off * 3); nor.set(p.g.attributes.normal.array, off * 3);
      if (p.g.attributes.uv) uv.set(p.g.attributes.uv.array, off * 2);
      if (col) { const c = new THREE.Color(p.color === undefined ? 0xffffff : p.color); for (let i = 0; i < n; i++) { col[(off + i) * 3] = c.r; col[(off + i) * 3 + 1] = c.g; col[(off + i) * 3 + 2] = c.b; } }
      off += n;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
  }
  const _m = new THREE.Matrix4(), _p = new V3(), _s = new V3(1, 1, 1), _e = new THREE.Euler(), _qq = new THREE.Quaternion();
  function mat(x, y, z, rx, ry, rz, sx, sy, sz) {
    _p.set(x, y, z); _e.set(rx || 0, ry || 0, rz || 0); _qq.setFromEuler(_e); _s.set(sx || 1, sy || 1, sz || 1);
    return new THREE.Matrix4().compose(_p, _qq, _s);
  }
  return { clamp, lerp, smoothstep, damp, sign, table, rng, rand, canvas, canvasTexture, makeNoise, hexToRgb, rgba, shade, fmtTime, integrateQuat, alignUp, yawOf, setYaw, dist2d, angleWrap, mergeGeos, mat };
})();
