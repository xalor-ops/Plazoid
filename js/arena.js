// Arena: signed-distance collision field (floor, walls, curves, 45deg corners, goals) + the playable-volume mesh
// (vertical columns along the wall perimeter, clean goal-mouth cutouts), wall panel / glass materials, field texture,
// goals (cavity, nets, frame) and boost pads. Everything procedural (no external assets).
window.RL = window.RL || {};
RL.Arena = (function () {
  const C = RL.C, U = RL.U;
  const SQRT1_2 = Math.SQRT1_2;

  // ---------- SDF (negative inside the playable volume) ----------
  function sdRoundBoxIn(x, y, z, hx, hy, hz, cz, r) {
    const qx = Math.abs(x) - (hx - r), qy = Math.abs(y) - (hy - r), qz = Math.abs(z - cz) - (hz - r);
    const mx = qx > 0 ? qx : 0, my = qy > 0 ? qy : 0, mz = qz > 0 ? qz : 0;
    const outside = Math.sqrt(mx * mx + my * my + mz * mz);
    const inside = Math.min(Math.max(qx, qy, qz), 0);
    return outside + inside - r;
  }
  function smax(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; }
  function sdArenaBody(x, y, z) {
    const r = z < 1022 ? C.CURVE_R : C.CURVE_R_TOP;
    const dbox = sdRoundBoxIn(x, y, z, C.ARENA_X, C.ARENA_Y, 1022, 1022, r);
    const dcorner = (Math.abs(x) + Math.abs(y) - C.CORNER) * SQRT1_2;
    return smax(dbox, dcorner, C.CORNER_K);
  }
  // goal cavity box: |x|<=892.755, |y| in [4500, 6000] (extends into the field so the mouth floor stays flat), z in [0, 642.775]
  function sdGoal(x, y, z) {
    const rg = 28;
    const ay = Math.abs(y);
    const qx = Math.abs(x) - (C.GOAL_HALF_W - rg), qy = Math.abs(ay - 5250) - (750 - rg), qz = Math.abs(z - C.GOAL_H * 0.5) - (C.GOAL_H * 0.5 - rg);
    const mx = qx > 0 ? qx : 0, my = qy > 0 ? qy : 0, mz = qz > 0 ? qz : 0;
    const outside = Math.sqrt(mx * mx + my * my + mz * mz);
    const inside = Math.min(Math.max(qx, qy, qz), 0);
    return outside + inside - rg;
  }
  function sd(x, y, z) {
    const a = sdArenaBody(x, y, z);
    if (Math.abs(y) > 4400 && Math.abs(x) < 1100 && z < 800) { const g = sdGoal(x, y, z); return g < a ? g : a; }
    return a;
  }
  const EPS = 0.5;
  function normalAt(x, y, z, out) {
    const nx = sd(x + EPS, y, z) - sd(x - EPS, y, z);
    const ny = sd(x, y + EPS, z) - sd(x, y - EPS, z);
    const nz = sd(x, y, z + EPS) - sd(x, y, z - EPS);
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    out.set(-nx / l, -ny / l, -nz / l);
    return out;
  }
  function bodyNormalAt(x, y, z, out) {
    const nx = sdArenaBody(x + EPS, y, z) - sdArenaBody(x - EPS, y, z);
    const ny = sdArenaBody(x, y + EPS, z) - sdArenaBody(x, y - EPS, z);
    const nz = sdArenaBody(x, y, z + EPS) - sdArenaBody(x, y, z - EPS);
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    out.set(-nx / l, -ny / l, -nz / l);
    return out;
  }
  const _n = new THREE.Vector3();
  function sphereContact(p, r, out) {
    const d = sd(p.x, p.y, p.z);
    const pen = d + r;
    if (pen <= 0) return 0;
    normalAt(p.x, p.y, p.z, out || _n);
    return pen;
  }
  // march from an inside point along a horizontal direction until the arena body surface (bisection)
  function marchOut(sx, sy, z, dx, dy, maxT) {
    let a = 0, b = maxT;
    if (sdArenaBody(sx + dx * b, sy + dy * b, z) < 0) return b;
    for (let k = 0; k < 30; k++) { const m = (a + b) * 0.5; if (sdArenaBody(sx + dx * m, sy + dy * m, z) < 0) a = m; else b = m; }
    return (a + b) * 0.5;
  }

  // ---------- textures ----------
  function fieldTexture() {
    const W = 2048, H = 2560;
    const c = U.canvas(W, H), g = c.getContext('2d');
    const sx = W / 8192, sy = H / 10240;
    const toX = (x) => (x + 4096) * sx, toY = (y) => (5120 - y) * sy;
    g.fillStyle = '#3a7f2b'; g.fillRect(0, 0, W, H);
    const sq = 1024;
    for (let i = 0; i < 8; i++) for (let j = 0; j < 10; j++) {
      const light = (i + j) % 2 === 0;
      g.fillStyle = light ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
      g.fillRect(toX(-4096 + i * sq), toY(5120 - j * sq), sq * sx + 1, sq * sy + 1);
    }
    const noise = U.makeNoise(7);
    const nw = W >> 1, nh = H >> 1; const nc = U.canvas(nw, nh), ng = nc.getContext('2d');
    const img = ng.createImageData(nw, nh); const d = img.data;
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
      const i = (y * nw + x) * 4;
      const n = (noise.fbm(x * 0.18, y * 0.18, 3, 2.1, 0.55) - 0.5) * 60 + (Math.random() - 0.5) * 24;
      d[i] = 128 + n * 0.8; d[i + 1] = 128 + n; d[i + 2] = 128 + n * 0.6; d[i + 3] = 255;
    }
    ng.putImageData(img, 0, 0);
    g.save(); g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.9; g.drawImage(nc, 0, 0, W, H); g.restore();
    function wedges(sign, color) {
      g.save(); g.globalAlpha = 0.5; g.fillStyle = color;
      const ox = toX(0), oy = toY(sign * 5900);
      const base = sign > 0 ? -Math.PI / 2 : Math.PI / 2;
      const n = 7, L = 9500;
      for (let k = 0; k < n; k++) {
        const a0 = base + (k - (n - 1) / 2) * 0.235 - 0.05;
        const a1 = a0 + 0.1;
        g.beginPath(); g.moveTo(ox, oy);
        g.lineTo(ox + Math.cos(a0) * L * sx, oy - Math.sin(a0) * L * sy);
        g.lineTo(ox + Math.cos(a1) * L * sx, oy - Math.sin(a1) * L * sy);
        g.closePath(); g.fill();
      }
      g.restore();
    }
    g.save(); g.beginPath(); g.rect(0, toY(5120), W, toY(650) - toY(5120)); g.clip(); wedges(1, '#f0a055'); g.restore();
    g.save(); g.beginPath(); g.rect(0, toY(-650), W, toY(-5120) - toY(-650)); g.clip(); wedges(-1, '#6aa9ff'); g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(toX(-4096), toY(0)); g.lineTo(toX(4096), toY(0)); g.stroke();
    g.beginPath(); g.ellipse(toX(0), toY(0), 1024 * sx, 1024 * sy, 0, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.ellipse(toX(0), toY(0), 22 * sx, 22 * sy, 0, 0, Math.PI * 2); g.fill();
    for (const s of [1, -1]) {
      g.beginPath(); g.moveTo(toX(-1900), toY(s * 5120)); g.lineTo(toX(-1900), toY(s * (5120 - 1000))); g.lineTo(toX(1900), toY(s * (5120 - 1000))); g.lineTo(toX(1900), toY(s * 5120)); g.stroke();
      g.beginPath(); g.ellipse(toX(0), toY(s * (5120 - 1000)), 900 * sx, 900 * sy, 0, s > 0 ? 0 : Math.PI, s > 0 ? Math.PI : Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(toX(-892), toY(s * 5120)); g.lineTo(toX(892), toY(s * 5120)); g.stroke();
    }
    return U.canvasTexture(c, { aniso: 8 });
  }
  function hexGlassTexture() {
    const W = 512, H = 592;
    const c = U.canvas(W, H), g = c.getContext('2d');
    g.clearRect(0, 0, W, H);
    const R = 148; const h = Math.sqrt(3) / 2 * R;
    function hex(cx, cy, rr) { g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; const x = cx + rr * Math.cos(a), y = cy + rr * Math.sin(a); if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); } g.closePath(); g.stroke(); }
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 4;
    for (let row = -1; row <= 3; row++) for (let col = -1; col <= 3; col++) hex(col * 2 * h + (row % 2 ? h : 0), row * 1.5 * R, R);
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1.6;
    for (let row = -1; row <= 3; row++) for (let col = -1; col <= 3; col++) hex(col * 2 * h + (row % 2 ? h : 0), row * 1.5 * R, R);
    return U.canvasTexture(c, { repeat: true, aniso: 8 });
  }
  // dark metallic wall panels: 512 x 512 covers 512 uu along the wall and the 0..420 uu band vertically
  function wallPanelTexture() {
    const S = 512; const c = U.canvas(S, S), g = c.getContext('2d');
    g.fillStyle = '#2e323a'; g.fillRect(0, 0, S, S);
    const noise = U.makeNoise(31);
    const img = g.getImageData(0, 0, S, S); const d = img.data;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = (y * S + x) * 4; const n = (noise.fbm(x * 0.05, y * 0.05, 3) - 0.5) * 18 + (Math.random() - 0.5) * 6; d[i] += n; d[i + 1] += n; d[i + 2] += n * 1.2; }
    g.putImageData(img, 0, 0);
    g.globalAlpha = 0.08; for (let x = 0; x < S; x += 3) { g.fillStyle = Math.random() < 0.5 ? '#ffffff' : '#000000'; g.fillRect(x, 0, 1, S); } g.globalAlpha = 1;
    g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 3;
    for (let x = 0; x <= S; x += 128) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, S); g.stroke(); }
    g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 1;
    for (let x = 0; x <= S; x += 128) { g.beginPath(); g.moveTo(x + 3.5, 0); g.lineTo(x + 3.5, S); g.stroke(); }
    for (const yy of [S * 0.5, S * 0.76]) { g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, yy); g.lineTo(S, yy); g.stroke(); g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, yy + 2.5); g.lineTo(S, yy + 2.5); g.stroke(); }
    const top = g.createLinearGradient(0, S - 30, 0, S); top.addColorStop(0, 'rgba(255,255,255,0)'); top.addColorStop(1, 'rgba(255,255,255,0.28)'); g.fillStyle = top; g.fillRect(0, S - 30, S, 30);
    const bot = g.createLinearGradient(0, 0, 0, 40); bot.addColorStop(0, 'rgba(200,210,225,0.35)'); bot.addColorStop(1, 'rgba(200,210,225,0)'); g.fillStyle = bot; g.fillRect(0, 0, S, 40);
    g.fillStyle = 'rgba(255,255,255,0.35)'; for (let x = 16; x < S; x += 64) { g.beginPath(); g.arc(x, S - 14, 2.2, 0, Math.PI * 2); g.fill(); }
    return U.canvasTexture(c, { repeat: true, aniso: 8 });
  }
  function drawLogo(g, x, y, s, color) {
    g.save(); g.translate(x, y); g.scale(s, s);
    g.fillStyle = color; g.beginPath(); g.moveTo(-60, -60); g.lineTo(60, -60); g.lineTo(60, 20); g.lineTo(0, 66); g.lineTo(-60, 20); g.closePath(); g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.arc(0, -8, 32, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = color; g.beginPath(); g.arc(0, -8, 22, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'destination-out'; g.fillRect(-24, -14, 48, 12); g.globalCompositeOperation = 'source-over';
    g.restore();
  }
  function boardsTexture(teamHex) {
    const W = 2048, H = 512;
    const c = U.canvas(W, H), g = c.getContext('2d');
    g.fillStyle = '#0b0d12'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#12151c'; g.fillRect(24, 28, 976, H - 56);
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 4; g.strokeRect(24, 28, 976, H - 56);
    drawLogo(g, 200, H / 2, 2, '#ffffff');
    g.fillStyle = '#ffffff';
    g.font = 'italic 900 150px "Titillium Web", "Segoe UI Black", "Franklin Gothic Heavy", Impact, sans-serif';
    g.textBaseline = 'middle';
    g.fillText('ROCKET', 380, H / 2 - 74); g.fillText('LEAGUE', 380, H / 2 + 76);
    g.fillStyle = teamHex; g.fillRect(1024 + 24, 28, 976, H - 56);
    g.strokeRect(1024 + 24, 28, 976, H - 56);
    g.fillStyle = 'rgba(255,255,255,0.88)';
    for (let i = 0; i < 6; i++) {
      const x = 1024 + 120 + i * 150;
      g.beginPath(); g.moveTo(x, 100); g.lineTo(x + 120, H / 2); g.lineTo(x, H - 100); g.lineTo(x + 52, H - 100); g.lineTo(x + 172, H / 2); g.lineTo(x + 52, 100); g.closePath(); g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(0, 0, W, 8);
    return U.canvasTexture(c, { repeat: true, aniso: 8 });
  }
  function netTexture() {
    const S = 128; const c = U.canvas(S, S), g = c.getContext('2d');
    g.clearRect(0, 0, S, S);
    g.strokeStyle = 'rgba(240,242,246,0.95)'; g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(S, S); g.moveTo(S, 0); g.lineTo(0, S); g.stroke();
    return U.canvasTexture(c, { repeat: true, aniso: 8 });
  }
  function ballTexture() {
    const W = 1024, H = 512; const c = U.canvas(W, H), g = c.getContext('2d');
    g.fillStyle = '#93927a'; g.fillRect(0, 0, W, H);
    const noise = U.makeNoise(3); const img = g.getImageData(0, 0, W, H); const d = img.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; const n = (noise.fbm(x * 0.05, y * 0.05, 3) - 0.5) * 22; d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.8; }
    g.putImageData(img, 0, 0);
    g.strokeStyle = 'rgba(30,32,28,0.92)'; g.lineWidth = 9; g.lineJoin = 'round';
    const R = 64, h = Math.sqrt(3) / 2 * R;
    const hexPath = (cx, cy, rr) => { g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; const x = cx + rr * Math.cos(a), y = cy + rr * Math.sin(a); if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); } g.closePath(); g.stroke(); };
    for (let row = -1; row < 8; row++) for (let col = -1; col < 10; col++) hexPath(col * 2 * h + (row % 2 ? h : 0), row * 1.5 * R + 20, R - 6);
    g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 3;
    for (let row = -1; row < 8; row++) for (let col = -1; col < 10; col++) hexPath(col * 2 * h + (row % 2 ? h : 0), row * 1.5 * R + 20, R - 16);
    return U.canvasTexture(c, { aniso: 8 });
  }

  // ---------- glass shader (hex lines + fresnel reflections from the captured cubemap) ----------
  function glassMaterial(hexTex, envCube) {
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      hexMap: { value: null }, envMap: { value: null }, tint: { value: new THREE.Color(0x9fc0e8) }, lineAlpha: { value: 0.55 }
    }]);
    uniforms.hexMap.value = hexTex; uniforms.envMap.value = envCube;
    const mat = new THREE.ShaderMaterial({
      uniforms, fog: true, transparent: true, depthWrite: false, side: THREE.FrontSide,
      vertexShader: [
        'varying vec3 vWP; varying vec3 vN; varying vec2 vUv;',
        '#include <fog_pars_vertex>',
        'void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 wp = modelMatrix * vec4(position,1.0); vWP = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;',
        '#include <fog_vertex>',
        '}'].join('\n'),
      fragmentShader: [
        'uniform sampler2D hexMap; uniform samplerCube envMap; uniform vec3 tint; uniform float lineAlpha;',
        'varying vec3 vWP; varying vec3 vN; varying vec2 vUv;',
        '#include <fog_pars_fragment>',
        'void main(){',
        '  vec3 V = normalize(cameraPosition - vWP); vec3 N = normalize(vN);',
        '  float ndv = max(dot(N, V), 0.0);',
        '  float fres = pow(1.0 - ndv, 3.0);',
        '  vec3 R = reflect(-V, N);',
        '  vec3 env = textureCube(envMap, vec3(-R.x, R.y, R.z)).rgb;',
        '  vec4 hex = texture2D(hexMap, vUv);',
        '  vec3 col = tint * 0.5 + env * (0.2 + 0.6 * fres);',
        '  float a = 0.045 + 0.24 * fres;',
        '  col = mix(col, vec3(0.92, 0.96, 1.0), hex.a * 0.9);',
        '  a = a + hex.a * lineAlpha * (0.35 + 0.65 * ndv);',
        '  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));',
        '#include <tonemapping_fragment>',
        '#include <colorspace_fragment>',
        '#include <fog_fragment>',
        '}'].join('\n')
    });
    return mat;
  }

  // ---------- playable-volume mesh: columns along the wall perimeter, rows in height ----------
  function buildVolumeMesh(mats) {
    const X = C.ARENA_X, Y = C.ARENA_Y, K = C.CORNER;
    const cy = K - X, cx = K - Y; // side walls reach |y| = cy, back walls reach |x| = cx
    const poly = [[X, -cy], [X, cy], [cx, Y], [-cx, Y], [-X, cy], [-X, -cy], [-cx, -Y], [cx, -Y]];
    const cols = [];
    const SP = 46, FILLET_STEPS = 6;
    let arc = 0;
    for (let i = 0; i < 8; i++) {
      const a = poly[i], b = poly[(i + 1) % 8];
      const dx = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dx, dy);
      const tx = dx / L, ty = dy / L; const nx = ty, ny = -tx; // outward normal (CCW polygon)
      const n = Math.max(2, Math.round(L / SP));
      const ts = []; for (let k = 0; k <= n; k++) ts.push(k / n);
      const isBack = (i === 2 || i === 6);
      if (isBack) for (const px of [C.GOAL_HALF_W, -C.GOAL_HALF_W]) { const t = (px - a[0]) / dx; if (t > 0 && t < 1) ts.push(t); }
      ts.sort((p, q) => p - q);
      for (let k = 0; k < ts.length; k++) {
        const t = ts[k]; if (k > 0 && t - ts[k - 1] < 1e-6) continue;
        cols.push({ x: a[0] + dx * t, y: a[1] + dy * t, nx, ny, seg: i, arc: arc + L * t, back: isBack });
      }
      arc += L;
      // fillet columns at the vertex: blend this normal into the next segment's normal
      const b2 = poly[(i + 2) % 8]; const dx2 = b2[0] - b[0], dy2 = b2[1] - b[1]; const L2 = Math.hypot(dx2, dy2);
      const nx2 = dy2 / L2, ny2 = -dx2 / L2;
      const ang = Math.atan2(nx * ny2 - ny * nx2, nx * nx2 + ny * ny2);
      for (let k = 1; k < FILLET_STEPS; k++) {
        const f = k / FILLET_STEPS; const ca = Math.cos(ang * f), sa = Math.sin(ang * f);
        cols.push({ x: b[0], y: b[1], nx: nx * ca - ny * sa, ny: nx * sa + ny * ca, seg: i, arc: arc + 240 * f, back: false, fillet: true });
      }
      arc += 240;
    }
    const zs = [0.5, 8, 22, 42, 68, 100, 140, 185, 235, 290, 345, 400, 420, 500, 580, 630, 642.775, 660, 730, 900, 1100, 1300, 1500, 1650, 1780, 1880, 1950, 2000, 2025, 2040, 2043.5];
    const rows = zs.length, ncol = cols.length;
    const pos = new Float32Array(rows * ncol * 3), nor = new Float32Array(rows * ncol * 3), uv = new Float32Array(rows * ncol * 2);
    const n = new THREE.Vector3();
    for (let r = 0; r < rows; r++) {
      const z = zs[r];
      for (let c = 0; c < ncol; c++) {
        const col = cols[c];
        const sx = col.x - col.nx * 1100, sy = col.y - col.ny * 1100;
        const t = marchOut(sx, sy, z, col.nx, col.ny, 1400);
        const x = sx + col.nx * t, y = sy + col.ny * t;
        const i = r * ncol + c;
        pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
        bodyNormalAt(x, y, z, n); nor[i * 3] = n.x; nor[i * 3 + 1] = n.y; nor[i * 3 + 2] = n.z;
        uv[i * 2] = -col.arc / 2048; uv[i * 2 + 1] = z / 2048;
      }
    }
    // groups: 0 wall panels (curve + band under the boards), 1 boards blue, 2 boards orange, 3 glass
    const groups = [[], [], [], []];
    const inMouth = (col) => col.back && Math.abs(col.x) <= C.GOAL_HALF_W + 0.6;
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < ncol - 1; c++) {
      const c2 = c + 1;
      const zTop = zs[r + 1];
      if (inMouth(cols[c]) && inMouth(cols[c2]) && zTop <= C.GOAL_H + 0.01) continue;
      const a = r * ncol + c, b = r * ncol + c2, d = (r + 1) * ncol + c, e = (r + 1) * ncol + c2;
      const zmid = (zs[r] + zs[r + 1]) * 0.5;
      const ym = (pos[a * 3 + 1] + pos[b * 3 + 1]) * 0.5;
      let m;
      if (zmid < 420) m = 0; else if (zmid < 630) m = ym < 0 ? 1 : 2; else m = 3;
      groups[m].push(a, d, b, b, d, e);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const idx = []; let start = 0;
    groups.forEach((g, mi) => { for (let i = 0; i < g.length; i++) idx.push(g[i]); geo.addGroup(start, g.length, mi); start += g.length; });
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, mats);
    mesh.receiveShadow = true;
    return mesh;
  }

  // ---------- goals: cavity walls, post-base cheeks, nets, frame, glow ----------
  function buildGoals(group) {
    const net = netTexture(); net.repeat.set(18, 8);
    const netMat = new THREE.MeshLambertMaterial({ map: net, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, color: 0xffffff });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.45, metalness: 0.65 });
    const cavityMat = new THREE.MeshLambertMaterial({ color: 0x2a2e36, emissive: 0x171a20 });
    const floorMat = new THREE.MeshLambertMaterial({ color: 0x23262d, emissive: 0x14161a });
    const W = C.GOAL_HALF_W, H = C.GOAL_H, D = C.GOAL_DEPTH, T = 34, R = C.CURVE_R;
    for (const s of [1, -1]) {
      const team = s < 0 ? 0 : 1;
      const col = new THREE.Color(RL.TEAM_COLOR[team]);
      const glowMat = new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.4), emissive: col, emissiveIntensity: 1.7, roughness: 0.4 });
      const M = (x, y, z, rx, ry, rz) => { const m = U.mat(x, y, z, rx, ry, rz); const g2 = new THREE.Matrix4().makeRotationZ(s > 0 ? 0 : Math.PI); g2.setPosition(0, s * C.ARENA_Y, 0); return g2.multiply(m); };
      // cavity: side walls (inward facing), ceiling, back
      const cav = [
        { geo: new THREE.PlaneGeometry(D, H), matrix: M(-W, D / 2, H / 2, Math.PI / 2, Math.PI / 2, 0) },
        { geo: new THREE.PlaneGeometry(D, H), matrix: M(W, D / 2, H / 2, Math.PI / 2, -Math.PI / 2, 0) },
        { geo: new THREE.PlaneGeometry(2 * W, D), matrix: M(0, D / 2, H, Math.PI, 0, 0) },
        { geo: new THREE.PlaneGeometry(2 * W, H), matrix: M(0, D, H / 2, Math.PI / 2, Math.PI, 0) }
      ];
      // post-base cheeks: fill under the floor curve beside the mouth (quarter disc in the y-z plane at x = +-W)
      const cheek = new THREE.Shape(); cheek.moveTo(-R, 0); cheek.lineTo(0, 0); cheek.lineTo(0, R);
      for (let k = 1; k <= 14; k++) { const a = (k / 14) * Math.PI / 2; cheek.lineTo(-R + R * Math.cos(a), R - R * Math.sin(a)); }
      cheek.closePath();
      const cheekGeo = new THREE.ShapeGeometry(cheek);
      for (const sx of [-1, 1]) {
        const g = cheekGeo.clone();
        const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const yy = p.getX(i), zz = p.getY(i); p.setXYZ(i, sx * W, yy, zz); }
        // wind faces so the normal points into the mouth corridor (toward x = 0)
        const idx = g.index; const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3(), fn = new THREE.Vector3();
        p0.fromBufferAttribute(p, idx.getX(0)); p1.fromBufferAttribute(p, idx.getX(1)); p2.fromBufferAttribute(p, idx.getX(2));
        fn.subVectors(p1, p0).cross(p2.sub(p0));
        if ((fn.x > 0) !== (sx < 0)) { for (let i = 0; i < idx.count; i += 3) { const t = idx.getX(i + 1); idx.setX(i + 1, idx.getX(i + 2)); idx.setX(i + 2, t); } }
        g.computeVertexNormals();
        cav.push({ geo: g, matrix: M(0, 0, 0) });
      }
      group.add(new THREE.Mesh(U.mergeGeos(cav), cavityMat));
      const frame = [
        { geo: new THREE.BoxGeometry(T, T, H + T), matrix: M(-W - T / 2, 0, (H + T) / 2) }, { geo: new THREE.BoxGeometry(T, T, H + T), matrix: M(W + T / 2, 0, (H + T) / 2) },
        { geo: new THREE.BoxGeometry(2 * W + 2 * T, T, T), matrix: M(0, 0, H + T / 2) },
        { geo: new THREE.BoxGeometry(T + 8, 60, 40), matrix: M(-W - T / 2, 0, 20) }, { geo: new THREE.BoxGeometry(T + 8, 60, 40), matrix: M(W + T / 2, 0, 20) }
      ];
      const glow = [
        { geo: new THREE.BoxGeometry(10, 14, H), matrix: M(-W + 5, -8, H / 2) }, { geo: new THREE.BoxGeometry(10, 14, H), matrix: M(W - 5, -8, H / 2) },
        { geo: new THREE.BoxGeometry(2 * W, 14, 10), matrix: M(0, -8, H - 5) }
      ];
      const nets = [
        { geo: new THREE.PlaneGeometry(2 * W - 20, H - 12), matrix: M(0, D - 14, H / 2, Math.PI / 2, 0, 0) },
        { geo: new THREE.PlaneGeometry(2 * W - 20, D - 20), matrix: M(0, D / 2, H - 12) },
        { geo: new THREE.PlaneGeometry(D - 20, H - 12), matrix: M(-W + 12, D / 2, H / 2, Math.PI / 2, Math.PI / 2, 0) },
        { geo: new THREE.PlaneGeometry(D - 20, H - 12), matrix: M(W - 12, D / 2, H / 2, Math.PI / 2, Math.PI / 2, 0) }
      ];
      const fm = new THREE.Mesh(U.mergeGeos(frame), frameMat); fm.receiveShadow = true; group.add(fm);
      group.add(new THREE.Mesh(U.mergeGeos(glow), glowMat));
      group.add(new THREE.Mesh(U.mergeGeos(nets), netMat));
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(2 * W, D), floorMat); fl.applyMatrix4(M(0, D / 2, 1.0)); fl.receiveShadow = true; group.add(fl);
    }
  }

  // ---------- boost pads (merged bases, instanced glow parts; glow sprites are batched in FX) ----------
  let padDots = null, padOrbs = null;
  const _m4 = new THREE.Matrix4(), _zero = new THREE.Matrix4().makeScale(0, 0, 0), _s3 = new THREE.Vector3();
  function buildPads(group) {
    const pads = [];
    const smallBaseGeo = new THREE.CylinderGeometry(78, 84, 6, 20); smallBaseGeo.rotateX(Math.PI / 2);
    const bigBaseGeo = new THREE.CylinderGeometry(150, 165, 10, 6); bigBaseGeo.rotateX(Math.PI / 2);
    const ringGeo = new THREE.TorusGeometry(150, 6, 6, 6);
    const items = [];
    const smallDotGeo = new THREE.CylinderGeometry(26, 30, 8, 14); smallDotGeo.rotateX(Math.PI / 2);
    const orbGeo = new THREE.SphereGeometry(52, 18, 12);
    const smallGlowMat = new THREE.MeshStandardMaterial({ color: 0xffb040, emissive: 0xffa020, emissiveIntensity: 2.2, roughness: 0.3 });
    const orbMat = new THREE.MeshStandardMaterial({ color: 0xffc060, emissive: 0xff9a1a, emissiveIntensity: 2.6, roughness: 0.25 });
    let nSmall = 0, nBig = 0;
    C.PADS.forEach(([x, y, big], i) => {
      const pad = { x, y, big: !!big, r: big ? C.PAD_BIG_R : C.PAD_SMALL_R, amount: big ? C.PAD_BIG_AMT : C.PAD_SMALL_AMT, cooldown: big ? C.PAD_BIG_CD : C.PAD_SMALL_CD, timer: 0, active: true, index: i, spawnT: 1, inst: big ? nBig++ : nSmall++ };
      items.push({ geo: big ? bigBaseGeo : smallBaseGeo, matrix: U.mat(x, y, big ? 5 : 3), color: 0x15171c });
      if (big) items.push({ geo: ringGeo, matrix: U.mat(x, y, 12), color: 0x3a3d45 });
      pads.push(pad);
    });
    const bases = new THREE.Mesh(U.mergeGeos(items, true), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.4 }));
    bases.receiveShadow = true; group.add(bases);
    padDots = new THREE.InstancedMesh(smallDotGeo, smallGlowMat, nSmall); padDots.frustumCulled = false;
    padOrbs = new THREE.InstancedMesh(orbGeo, orbMat, nBig); padOrbs.frustumCulled = false;
    group.add(padDots); group.add(padOrbs);
    resetPads(pads);
    return pads;
  }
  function setPadMatrix(p, scale, time) {
    if (scale <= 0.001) { (p.big ? padOrbs : padDots).setMatrixAt(p.inst, _zero); return; }
    if (p.big) { const z = 85 + Math.sin((time || 0) * 2.2 + p.index) * 6; _m4.makeRotationZ((time || 0) * 0.8); _m4.scale(_s3.set(scale, scale, scale)); _m4.setPosition(p.x, p.y, z); padOrbs.setMatrixAt(p.inst, _m4); }
    else { _m4.makeScale(scale, scale, scale); _m4.setPosition(p.x, p.y, 8); padDots.setMatrixAt(p.inst, _m4); }
  }
  function updatePads(pads, dt, time) {
    for (const p of pads) {
      if (!p.active) { p.timer -= dt; if (p.timer <= 0) { p.active = true; p.spawnT = 0; } else continue; }
      if (p.spawnT < 0.5) { p.spawnT += dt; setPadMatrix(p, Math.max(0.01, U.smoothstep(0, 0.5, p.spawnT)), time); }
      else if (p.big) setPadMatrix(p, 1, time);
    }
    padDots.instanceMatrix.needsUpdate = true; padOrbs.instanceMatrix.needsUpdate = true;
  }
  function takePad(p) { p.active = false; p.timer = p.cooldown; setPadMatrix(p, 0); (p.big ? padOrbs : padDots).instanceMatrix.needsUpdate = true; }
  function resetPads(pads) { for (const p of pads) { p.active = true; p.timer = 0; p.spawnT = 1; setPadMatrix(p, 1, 0); } padDots.instanceMatrix.needsUpdate = true; padOrbs.instanceMatrix.needsUpdate = true; }

  // ---------- assemble ----------
  function build(scene, envCube) {
    const group = new THREE.Group(); group.name = 'arena';
    const hexTex = hexGlassTexture();
    const glassMat = envCube ? glassMaterial(hexTex, envCube) : new THREE.MeshBasicMaterial({ map: hexTex, transparent: true, side: THREE.FrontSide, depthWrite: false, color: 0xdde8ff });
    const panelTex = wallPanelTexture(); panelTex.repeat.set(4, 2048 / 420);
    const wallMat = new THREE.MeshStandardMaterial({ map: panelTex, roughness: 0.42, metalness: 0.62, envMapIntensity: 1.0 });
    const boardsBlue = boardsTexture(RL.TEAM_COLOR[0]); const boardsOrange = boardsTexture(RL.TEAM_COLOR[1]);
    const mkBoards = (tex) => {
      const m = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.6, roughness: 0.4, metalness: 0.2 });
      m.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n vMapUv = vec2(uv.x, (uv.y*2048.0-420.0)/210.0); vEmissiveMapUv = vMapUv;'); };
      m.customProgramCacheKey = () => 'boards';
      return m;
    };
    const volume = buildVolumeMesh([wallMat, mkBoards(boardsBlue), mkBoards(boardsOrange), glassMat]);
    group.add(volume);
    const fieldTex = fieldTexture();
    const fieldMat = new THREE.MeshLambertMaterial({ map: fieldTex });
    const field = new THREE.Mesh(new THREE.PlaneGeometry(8192, 10240), fieldMat); field.receiveShadow = true; group.add(field);
    // team-colored light trim on top of the boards + light line at the curve base (one mesh per team)
    const X = C.ARENA_X, Y = C.ARENA_Y, K = C.CORNER; const cyv = K - X, cxv = K - Y;
    for (const s of [-1, 1]) {
      const col = new THREE.Color(RL.TEAM_COLOR[s < 0 ? 0 : 1]);
      const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 2.0 });
      const items = [];
      const addSeg = (x0, y0, x1, y1, z, w, h) => { const dx = x1 - x0, dy = y1 - y0; const L = Math.hypot(dx, dy); items.push({ geo: new THREE.BoxGeometry(L, w, h), matrix: U.mat((x0 + x1) / 2, (y0 + y1) / 2, z, 0, 0, Math.atan2(dy, dx)) }); };
      addSeg(-X + 4, 0, -X + 4, s * cyv, 632, 8, 14); addSeg(X - 4, 0, X - 4, s * cyv, 632, 8, 14);
      addSeg(X, s * cyv, cxv, s * (Y - 4), 632, 8, 14); addSeg(-X, s * cyv, -cxv, s * (Y - 4), 632, 8, 14);
      addSeg(cxv, s * (Y - 4), C.GOAL_HALF_W + 40, s * (Y - 4), 632, 8, 14); addSeg(-cxv, s * (Y - 4), -C.GOAL_HALF_W - 40, s * (Y - 4), 632, 8, 14);
      const o = -C.CURVE_R; const Xo = X + o, Yo = Y + o, Ko = K + o * Math.SQRT2; const cyo = Ko - Xo, cxo = Ko - Yo;
      addSeg(-Xo, 0, -Xo, s * cyo, 3, 14, 5); addSeg(Xo, 0, Xo, s * cyo, 3, 14, 5);
      addSeg(Xo, s * cyo, cxo, s * Yo, 3, 14, 5); addSeg(-Xo, s * cyo, -cxo, s * Yo, 3, 14, 5);
      addSeg(cxo, s * Yo, C.GOAL_HALF_W + 30, s * Yo, 3, 14, 5); addSeg(-cxo, s * Yo, -C.GOAL_HALF_W - 30, s * Yo, 3, 14, 5);
      group.add(new THREE.Mesh(U.mergeGeos(items), mat));
    }
    buildGoals(group);
    const pads = buildPads(group);
    scene.add(group);
    return { group, pads, glassMat, fieldTex, field, volume, wallMat };
  }

  return { sd, normalAt, sphereContact, build, updatePads, takePad, resetPads, ballTexture };
})();
