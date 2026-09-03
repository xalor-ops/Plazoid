// Mannfield surroundings: tiered stands with an animated crowd (instanced, split per side for culling),
// roof trusses with light bars, big screens, banners, flags, sky dome with baked clouds, sun, mountains, skyline.
window.RL = window.RL || {};
RL.Stadium = (function () {
  const C = RL.C, U = RL.U;
  const GOAL_CUT_X = 1080, GOAL_CUT_Z = 780;

  function octagon(o) {
    const X = C.ARENA_X + o, Y = C.ARENA_Y + o;
    const K = C.CORNER + o * Math.SQRT2;
    const cx = K - Y, cy = K - X; // back walls reach |x| = cx, side walls reach |y| = cy
    return [[X, -cy], [X, cy], [cx, Y], [-cx, Y], [-X, cy], [-X, -cy], [-cx, -Y], [cx, -Y]];
  }
  function alongOctagon(poly, spacing, cb) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const dx = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dx, dy); const n = Math.max(1, Math.floor(L / spacing));
      for (let k = 0; k < n; k++) { const t = (k + 0.5) / n; cb(a[0] + dx * t, a[1] + dy * t, dx / L, dy / L, i); }
    }
  }
  // quad strip between two octagons (possibly at different heights); segments 2 and 6 are the back walls
  // and get a gap for the goal recess when below GOAL_CUT_Z
  function ringStrip(items, polyIn, polyOut, z0, z1, color, cutGoals) {
    const n = polyIn.length;
    const pos = [], nor = [];
    const quad = (A, B, Cc, D) => {
      const ux = B[0] - A[0], uy = B[1] - A[1], vx = Cc[0] - A[0], vy = Cc[1] - A[1], vz = Cc[2] - A[2];
      let nx = uy * vz, ny = -ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      const mx = (A[0] + D[0]) / 2, my = (A[1] + D[1]) / 2;
      if (nx * mx + ny * my > 0 && nz < 0.5) { nx = -nx; ny = -ny; nz = -nz; }
      if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const tri = (p, q, r) => { pos.push(p[0], p[1], p[2], q[0], q[1], q[2], r[0], r[1], r[2]); for (let k = 0; k < 3; k++) nor.push(nx, ny, nz); };
      tri(A, Cc, B); tri(B, Cc, D);
    };
    for (let i = 0; i < n; i++) {
      const a = polyIn[i], b = polyIn[(i + 1) % n], c = polyOut[i], d = polyOut[(i + 1) % n];
      const isBack = (i === 2 || i === 6);
      if (cutGoals && isBack && Math.min(z0, z1) < GOAL_CUT_Z) {
        // split into two pieces leaving |x| < GOAL_CUT_X open
        const pieces = [];
        const lerpP = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
        const tA = (GOAL_CUT_X * Math.sign(a[0] || 1) - a[0]) / ((b[0] - a[0]) || 1e-9);
        const tB = (-GOAL_CUT_X * Math.sign(a[0] || 1) - a[0]) / ((b[0] - a[0]) || 1e-9);
        const t1 = U.clamp(Math.min(tA, tB), 0, 1), t2 = U.clamp(Math.max(tA, tB), 0, 1);
        pieces.push([0, t1], [t2, 1]);
        for (const [s, e] of pieces) {
          if (e - s < 1e-4) continue;
          const A = [...lerpP(a, b, s), z0], B = [...lerpP(a, b, e), z0], Cc = [...lerpP(c, d, s), z1], D = [...lerpP(c, d, e), z1];
          quad(A, B, Cc, D);
        }
      } else quad([a[0], a[1], z0], [b[0], b[1], z0], [c[0], c[1], z1], [d[0], d[1], z1]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    items.push({ geo, color });
  }

  function crowdPalette(side, r) {
    const p = r();
    const teamHue = side < 0 ? [0x1f6fe0, 0x2a8cff, 0x123f8a, 0x5aa7ff] : [0xff8a1a, 0xe06a00, 0xffb060, 0xc24d00];
    if (p < 0.42) return teamHue[Math.floor(r() * teamHue.length)];
    if (p < 0.58) return [0xffffff, 0xe6e6e6, 0xcccccc][Math.floor(r() * 3)];
    if (p < 0.74) return [0x1c1c22, 0x2a2a30, 0x3b3b44][Math.floor(r() * 3)];
    return [0xd62828, 0xf2c14e, 0x3ba55c, 0x9b5de5, 0xff5fa2, 0x00b4d8][Math.floor(r() * 6)];
  }

  function buildStands(group) {
    const r = U.rng(11);
    const structure = [];
    const people = [];
    const OFF0 = 260, Z0 = 330;
    const ROW_D = 64, ROW_H = 38;
    const tiers = [{ rows: 13, off: OFF0, z: Z0 }, { rows: 15, off: OFF0 + 13 * ROW_D + 380, z: Z0 + 13 * ROW_H + 300 }];
    ringStrip(structure, octagon(0), octagon(OFF0), 0, 0, 0x2a2c31, true);
    ringStrip(structure, octagon(OFF0 - 20), octagon(OFF0 - 20), 0, Z0 - 10, 0x3a3d45, true);
    for (const T of tiers) {
      for (let k = 0; k < T.rows; k++) {
        const oIn = T.off + k * ROW_D, oOut = oIn + ROW_D, z = T.z + k * ROW_H;
        ringStrip(structure, octagon(oIn), octagon(oOut), z, z, k % 2 ? 0x8d9199 : 0x83878f, true);
        ringStrip(structure, octagon(oOut), octagon(oOut), z, z + ROW_H, 0x5c6068, true);
        const poly = octagon(oIn + ROW_D * 0.55);
        alongOctagon(poly, 66, (x, y, tx, ty, seg) => {
          if (r() > 0.93) return;
          if ((seg === 2 || seg === 6) && Math.abs(x) < GOAL_CUT_X + 40 && z < GOAL_CUT_Z) return;
          const side = y < 0 ? -1 : 1;
          people.push({ x: x + (r() - 0.5) * 10, y: y + (r() - 0.5) * 10, z: z + 2, color: crowdPalette(side, r), seg });
        });
      }
      const oTop = T.off + T.rows * ROW_D, zTop = T.z + T.rows * ROW_H;
      ringStrip(structure, octagon(oTop), octagon(oTop + 160), zTop, zTop, 0x4d5058, true);
    }
    // goal recess housing: dark walls around the cut on both back walls
    for (const s of [-1, 1]) {
      const depth = 900, w = GOAL_CUT_X, h = GOAL_CUT_Z;
      const items = [];
      items.push({ geo: new THREE.BoxGeometry(2 * w + 60, depth, 30), matrix: U.mat(0, s * (C.ARENA_Y + depth / 2), h + 15), color: 0x2a2d34 });
      for (const sx of [-1, 1]) items.push({ geo: new THREE.BoxGeometry(30, depth, h + 30), matrix: U.mat(sx * (w + 15), s * (C.ARENA_Y + depth / 2), (h + 30) / 2), color: 0x2a2d34 });
      items.push({ geo: new THREE.BoxGeometry(2 * w + 60, 30, h + 30), matrix: U.mat(0, s * (C.ARENA_Y + depth + 15), (h + 30) / 2), color: 0x23262c });
      for (const it of items) structure.push(it);
    }
    const last = tiers[tiers.length - 1];
    const oBack = last.off + last.rows * ROW_D + 160, zBack = last.z + last.rows * ROW_H;
    ringStrip(structure, octagon(oBack), octagon(oBack), zBack, 2400, 0x2f323a, false);
    ringStrip(structure, octagon(oBack - 8), octagon(oBack - 8), zBack, zBack + 90, 0x1d1f24, false);
    const up = tiers[1];
    ringStrip(structure, octagon(up.off - 6), octagon(up.off - 6), up.z - 110, up.z, 0x3a3d45, false);
    const geo = U.mergeGeos(structure, true);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    group.add(new THREE.Mesh(geo, mat));

    // crowd: one instanced mesh per stadium side (frustum culled), body + head in one geometry
    const bodyGeo = new THREE.BoxGeometry(22, 18, 36); bodyGeo.translate(0, 0, 18);
    const headGeo = new THREE.BoxGeometry(11, 11, 12); headGeo.translate(0, 0, 42);
    const person = U.mergeGeos([{ geo: bodyGeo }, { geo: headGeo }]);
    const nv = person.attributes.position.count; const aHead = new Float32Array(nv);
    for (let i = 0; i < nv; i++) aHead[i] = person.attributes.position.getZ(i) > 36.5 ? 1 : 0;
    person.setAttribute('aHead', new THREE.BufferAttribute(aHead, 1));
    const mat2 = new THREE.MeshLambertMaterial({});
    mat2.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = RL.Stadium.timeUniform;
      sh.vertexShader = 'uniform float uTime; attribute float aHead;\n' + sh.vertexShader
        .replace('#include <color_vertex>', '#ifdef USE_INSTANCING_COLOR\n float sk = fract(float(gl_InstanceID) * 0.137);\n vec3 skin = mix(vec3(0.96,0.78,0.58), vec3(0.42,0.27,0.15), floor(sk * 4.0) / 3.0);\n vColor = mix(instanceColor.rgb, skin, aHead);\n#endif')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n float ph = float(gl_InstanceID) * 1.37;\n transformed.z += (sin(uTime * 2.1 + ph) * 0.5 + 0.5) * 3.2 * step(0.35, fract(ph * 0.618));');
    };
    mat2.customProgramCacheKey = () => 'crowd2';
    const bySeg = [[], [], [], [], [], [], [], []];
    for (const p of people) bySeg[p.seg].push(p);
    const m = new THREE.Matrix4(), col = new THREE.Color();
    let total = 0;
    for (let s = 0; s < 8; s++) {
      const list = bySeg[s]; if (!list.length) continue;
      const im = new THREE.InstancedMesh(person, mat2, list.length);
      list.forEach((p, i) => { m.makeRotationZ(r() * 0.4 - 0.2); m.setPosition(p.x, p.y, p.z); im.setMatrixAt(i, m); col.setHex(p.color); col.multiplyScalar(0.75 + r() * 0.35); im.setColorAt(i, col); });
      im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.userData.crowd = true; im.userData.full = list.length;
      group.add(im); total += list.length;
    }
    return { crowdCount: total, oBack, zBack };
  }

  function screenTexture(w, h, team) {
    const c = U.canvas(w, h), g = c.getContext('2d');
    g.fillStyle = '#07090f'; g.fillRect(0, 0, w, h);
    const grad = g.createLinearGradient(0, 0, w, h); grad.addColorStop(0, team ? '#3a1a00' : '#001a3a'); grad.addColorStop(1, '#07090f');
    g.fillStyle = grad; g.fillRect(8, 8, w - 16, h - 16);
    g.save(); g.translate(w * 0.2, h * 0.5); g.scale(h / 260, h / 260);
    g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(-60, -60); g.lineTo(60, -60); g.lineTo(60, 20); g.lineTo(0, 66); g.lineTo(-60, 20); g.closePath(); g.fill();
    g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(0, -8, 32, 0, Math.PI * 2); g.fill(); g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(0, -8, 22, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'destination-out'; g.fillRect(-24, -14, 48, 12); g.globalCompositeOperation = 'source-over';
    g.restore();
    g.fillStyle = '#ffffff'; g.textBaseline = 'middle';
    g.font = 'italic 900 ' + Math.round(h * 0.34) + 'px "Titillium Web", "Segoe UI Black", "Franklin Gothic Heavy", Impact, sans-serif';
    g.fillText('ROCKET', w * 0.34, h * 0.36); g.fillText('LEAGUE', w * 0.34, h * 0.68);
    return U.canvasTexture(c, { aniso: 4 });
  }
  function bannerTexture(teamHex) {
    const c = U.canvas(128, 512), g = c.getContext('2d');
    g.fillStyle = teamHex; g.fillRect(0, 0, 128, 512);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 4; i++) { const y = 70 + i * 110; g.beginPath(); g.moveTo(30, y); g.lineTo(64, y + 40); g.lineTo(98, y); g.lineTo(98, y + 26); g.lineTo(64, y + 66); g.lineTo(30, y + 26); g.closePath(); g.fill(); }
    return U.canvasTexture(c, { aniso: 4 });
  }
  function flagTexture(i) {
    const c = U.canvas(96, 64), g = c.getContext('2d');
    const cols = ['#d62828', '#ffffff', '#1f4fd6', '#f2c14e', '#0a7d3c', '#111111', '#ff7a00'];
    const a = cols[i % cols.length], b = cols[(i * 3 + 1) % cols.length], d = cols[(i * 5 + 2) % cols.length];
    if (i % 3 === 0) { g.fillStyle = a; g.fillRect(0, 0, 32, 64); g.fillStyle = b; g.fillRect(32, 0, 32, 64); g.fillStyle = d; g.fillRect(64, 0, 32, 64); }
    else if (i % 3 === 1) { g.fillStyle = a; g.fillRect(0, 0, 96, 22); g.fillStyle = b; g.fillRect(0, 22, 96, 20); g.fillStyle = d; g.fillRect(0, 42, 96, 22); }
    else { g.fillStyle = a; g.fillRect(0, 0, 96, 64); g.fillStyle = b; g.fillRect(36, 0, 24, 64); g.fillRect(0, 20, 96, 24); }
    return U.canvasTexture(c);
  }

  function buildRoof(group, info) {
    const items = [];
    const steel = 0xd8dde6, steelDark = 0x9aa1ad;
    const box = (x, y, z, sx, sy, sz, rx, ry, rz, color) => items.push({ geo: new THREE.BoxGeometry(sx, sy, sz), matrix: U.mat(x, y, z, rx, ry, rz), color });
    const outer = info.oBack + 60;
    const LY = C.ARENA_Y + outer, LX = C.ARENA_X + outer;
    const xs = [-4200, -2100, 0, 2100, 4200];
    const zb = 2110, zt = 2330;
    const lights = [];
    for (const x of xs) {
      box(x, 0, zb, 54, LY * 2, 54, 0, 0, 0, steel);
      box(x, 0, zt, 54, LY * 2, 54, 0, 0, 0, steel);
      for (let y = -LY + 300; y < LY - 300; y += 560) { box(x, y, (zb + zt) / 2, 26, 26, 300, ((y / 560) | 0) % 2 ? 0.75 : -0.75, 0, 0, steelDark); }
      for (let y = -C.ARENA_Y + 200; y <= C.ARENA_Y - 200; y += 430) lights.push([x, y, zb - 40]);
    }
    for (const x of [-LX + 200, LX - 200]) { box(x, 0, zt, 54, LY * 2, 54, 0, 0, 0, steel); }
    for (let y = -LY + 600; y <= LY - 600; y += 1500) {
      box(0, y, zt, LX * 2, 46, 46, 0, 0, 0, steel);
      box(0, y, zb + 30, LX * 2, 40, 40, 0, 0, 0, steelDark);
      for (let x = -LX + 400; x < LX - 400; x += 500) box(x, y, (zb + zt) / 2 + 15, 22, 22, 240, 0, ((x / 500) | 0) % 2 ? 0.7 : -0.7, 0, steelDark);
    }
    for (const x of [-LX + 200, LX - 200]) for (let y = -LY + 600; y <= LY - 600; y += 1500) box(x, y, (info.zBack + zt) / 2, 90, 90, zt - info.zBack, 0, 0, 0, 0x6b7078);
    const geo = U.mergeGeos(items, true);
    group.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })));
    const lg = [];
    for (const [x, y, z] of lights) lg.push({ geo: new THREE.BoxGeometry(280, 96, 26), matrix: U.mat(x, y, z) });
    group.add(new THREE.Mesh(U.mergeGeos(lg, false), new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xfff1cc, emissiveIntensity: 3.0, roughness: 0.4 })));
    // single hex glass roof over the whole stadium (faces down)
    const roofMat = new THREE.MeshBasicMaterial({ map: RL.Stadium.hexTex, transparent: true, side: THREE.FrontSide, depthWrite: false, color: 0xdde8ff });
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(LX * 2, LY * 2), roofMat); roof.position.z = zt + 60; roof.rotation.x = Math.PI;
    const uvs = roof.geometry.attributes.uv; const p = roof.geometry.attributes.position;
    for (let i = 0; i < uvs.count; i++) uvs.setXY(i, p.getX(i) / 2048, p.getY(i) / 2048);
    group.add(roof);
    return { LX, LY, zt };
  }

  function buildDecor(group, info, roof) {
    for (const s of [-1, 1]) {
      const tex = screenTexture(1024, 384, s > 0 ? 1 : 0);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2200, 820), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.9, roughness: 0.6 }));
      m.position.set(0, s * (C.ARENA_Y + info.oBack - 30), info.zBack + 500);
      m.rotation.set(Math.PI / 2, s > 0 ? Math.PI : 0, 0);
      group.add(m);
    }
    const bt = [bannerTexture(RL.TEAM_COLOR[0]), bannerTexture(RL.TEAM_COLOR[1])];
    const bannerItems = [[], []];
    const bannerGeo = new THREE.PlaneGeometry(190, 760);
    for (const sx of [-1, 1]) for (let y = -4200; y <= 4200; y += 1400) {
      const team = y < 0 ? 0 : 1;
      bannerItems[team].push({ geo: bannerGeo, matrix: U.mat(sx * (C.ARENA_X + 260 + 13 * 64 + 320), y, 330 + 13 * 38 + 300 - 60 - 380, Math.PI / 2, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 0) });
    }
    for (const team of [0, 1]) group.add(new THREE.Mesh(U.mergeGeos(bannerItems[team]), new THREE.MeshLambertMaterial({ map: bt[team], side: THREE.DoubleSide })));
    // flags: one merged mesh with a flag-strip texture
    const fc = U.canvas(96 * 14, 64), fg = fc.getContext('2d');
    for (let i = 0; i < 14; i++) fg.drawImage(flagTexture(i).image, i * 96, 0);
    const flagTex = U.canvasTexture(fc);
    const flagItems = [];
    for (let i = 0; i < 14; i++) {
      const geo = new THREE.PlaneGeometry(260, 170); const uv = geo.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / 14);
      flagItems.push({ geo, matrix: U.mat(C.ARENA_X + 900, -4550 + i * 700, roof.zt - 260, Math.PI / 2, 0, 0.12) });
    }
    group.add(new THREE.Mesh(U.mergeGeos(flagItems), new THREE.MeshLambertMaterial({ map: flagTex, side: THREE.DoubleSide })));
  }

  function skyTexture(sunDir) {
    const W = 1536, H = 768; const c = U.canvas(W, H), g = c.getContext('2d');
    const img = g.createImageData(W, H); const d = img.data;
    const noise = U.makeNoise(21);
    const sunU = (Math.atan2(sunDir.y, sunDir.x) / (2 * Math.PI) + 0.5), sunV = Math.asin(U.clamp(sunDir.z, -1, 1)) / Math.PI + 0.5;
    for (let y = 0; y < H; y++) {
      const v = 1 - y / H; const el = (v - 0.5) * 2;
      for (let x = 0; x < W; x++) {
        const u = x / W; const i = (y * W + x) * 4;
        let r, gg, b;
        if (el >= 0) { const t = Math.pow(el, 0.55); r = U.lerp(205, 62, t); gg = U.lerp(225, 128, t); b = U.lerp(245, 230, t); }
        else { const t = U.clamp(-el * 3, 0, 1); r = U.lerp(205, 120, t); gg = U.lerp(225, 140, t); b = U.lerp(245, 160, t); }
        let du = Math.abs(u - sunU); if (du > 0.5) du = 1 - du; const dv = v - sunV;
        const ang = Math.sqrt(du * du * 4 + dv * dv);
        const glow = Math.exp(-ang * ang * 90) * 1.0 + Math.exp(-ang * 14) * 0.5;
        r += 255 * glow * 0.5; gg += 235 * glow * 0.42; b += 200 * glow * 0.25;
        if (el > 0.02) {
          const sc = 3.0 / Math.max(0.12, Math.sin(el * Math.PI / 2 + 0.05));
          const n = noise.fbm(u * 18 + 3, (v - 0.5) * sc * 4 + 7, 5, 2.2, 0.5);
          const n2 = noise.fbm(u * 40, (v - 0.5) * sc * 8 + 13, 3, 2.0, 0.5);
          let cl = U.smoothstep(0.52, 0.66, n + (n2 - 0.5) * 0.25);
          cl *= U.smoothstep(0.0, 0.12, el) * (1 - U.smoothstep(0.75, 1.0, el));
          const shade = 0.72 + 0.28 * U.smoothstep(0.55, 0.85, n);
          r = U.lerp(r, 255 * shade, cl); gg = U.lerp(gg, 250 * shade, cl); b = U.lerp(b, 250 * shade, cl);
        }
        d[i] = U.clamp(r, 0, 255); d[i + 1] = U.clamp(gg, 0, 255); d[i + 2] = U.clamp(b, 0, 255); d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return U.canvasTexture(c, { aniso: 4 });
  }

  function buildMountains(group) {
    const r = U.rng(5);
    const segs = 160, rows = 10;
    const pos = [], col = [];
    const peakAt = (th) => {
      let h = 2200 + 1500 * Math.sin(th * 3.1 + 1) + 1200 * Math.sin(th * 7.3) + 800 * Math.sin(th * 13.7 + 2);
      const dMain = Math.abs(U.angleWrap(th - Math.PI / 2)); h += 9000 * Math.exp(-dMain * dMain * 9);
      const d2 = Math.abs(U.angleWrap(th - Math.PI / 2 - 0.55)); h += 4500 * Math.exp(-d2 * d2 * 30);
      const d3 = Math.abs(U.angleWrap(th - Math.PI / 2 + 0.7)); h += 3800 * Math.exp(-d3 * d3 * 25);
      const d4 = Math.abs(U.angleWrap(th + Math.PI / 2)); h += 3200 * Math.exp(-d4 * d4 * 6);
      return Math.max(600, h);
    };
    const R0 = 13000, R1 = 34000;
    const grid = [];
    for (let j = 0; j <= rows; j++) {
      const row = [];
      for (let i = 0; i <= segs; i++) {
        const th = i / segs * Math.PI * 2; const t = j / rows; const rad = U.lerp(R0, R1, t); const pk = peakAt(th);
        const prof = Math.sin(Math.PI * Math.min(1, t * 1.15));
        let h = pk * Math.pow(prof, 1.4) * (0.85 + 0.3 * r()) - 200;
        if (j === 0 || j === rows) h = -300;
        row.push([Math.cos(th) * rad, Math.sin(th) * rad, h, pk]);
      }
      grid.push(row);
    }
    const colorFor = (h, pk, slope) => {
      const snow = U.smoothstep(pk * 0.5, pk * 0.72, h) * (1 - U.smoothstep(0.65, 0.92, slope));
      const rock = [0.40, 0.38, 0.40], grass = [0.30, 0.40, 0.27], snowC = [0.95, 0.97, 1.0];
      const g2 = U.smoothstep(1500, 500, h);
      const c = [U.lerp(rock[0], grass[0], g2), U.lerp(rock[1], grass[1], g2), U.lerp(rock[2], grass[2], g2)];
      return [U.lerp(c[0], snowC[0], snow), U.lerp(c[1], snowC[1], snow), U.lerp(c[2], snowC[2], snow)];
    };
    for (let j = 0; j < rows; j++) for (let i = 0; i < segs; i++) {
      const a = grid[j][i], b = grid[j][i + 1], c = grid[j + 1][i], d = grid[j + 1][i + 1];
      const tri = (p, q, s) => {
        const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2], vx = s[0] - p[0], vy = s[1] - p[1], vz = s[2] - p[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nz /= l;
        if (nz < 0) nz = -nz;
        const slope = 1 - nz; const hm = (p[2] + q[2] + s[2]) / 3; const pk = (p[3] + q[3] + s[3]) / 3;
        const cc = colorFor(hm, pk, slope);
        for (const v of [p, q, s]) { pos.push(v[0], v[1], v[2]); col.push(cc[0], cc[1], cc[2]); }
      };
      tri(a, b, c); tri(b, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    group.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
    const items = [];
    const cr = U.rng(9);
    for (let i = 0; i < 34; i++) {
      const ang = -Math.PI * 0.55 - cr() * 1.3; const dist = 9500 + cr() * 5000;
      const w = 350 + cr() * 500, h = 1200 + cr() * 3800;
      items.push({ geo: new THREE.BoxGeometry(w, w * (0.7 + cr() * 0.6), h), matrix: U.mat(Math.cos(ang) * dist, Math.sin(ang) * dist, h / 2 - 200, 0, 0, cr() * 0.5), color: [0x6f8fb0, 0x8aa6c4, 0x55708f, 0x9fb5cc][i % 4] });
    }
    group.add(new THREE.Mesh(U.mergeGeos(items, true), new THREE.MeshLambertMaterial({ vertexColors: true })));
  }

  function hexTexture() {
    const c = U.canvas(512, 592), g = c.getContext('2d'); g.clearRect(0, 0, 512, 592);
    g.fillStyle = 'rgba(190,215,245,0.08)'; g.fillRect(0, 0, 512, 592);
    const R = 148, h = Math.sqrt(3) / 2 * R; g.strokeStyle = 'rgba(235,245,255,0.55)'; g.lineWidth = 5;
    for (let row = -1; row <= 3; row++) for (let col = -1; col <= 3; col++) { const cx = col * 2 * h + (row % 2 ? h : 0), cy = row * 1.5 * R; g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; const x = cx + R * Math.cos(a), y = cy + R * Math.sin(a); if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); } g.closePath(); g.stroke(); }
    return U.canvasTexture(c, { repeat: true, aniso: 8 });
  }

  function build(scene, sunDir) {
    RL.Stadium.timeUniform = { value: 0 };
    const group = new THREE.Group(); group.name = 'stadium';
    RL.Stadium.hexTex = hexTexture();
    const info = buildStands(group);
    const roof = buildRoof(group, info);
    buildDecor(group, info, roof);
    buildMountains(group);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(60000, 48), new THREE.MeshLambertMaterial({ color: 0x3f4a38 }));
    ground.position.z = -60; ground.renderOrder = 2; group.add(ground);
    const skyTex = skyTexture(sunDir);
    const sky = new THREE.Mesh(new THREE.SphereGeometry(58000, 48, 24), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }));
    sky.rotation.x = Math.PI / 2; sky.renderOrder = 3;
    group.add(sky);
    const sc = U.canvas(256, 256); const sg = sc.getContext('2d');
    const grd = sg.createRadialGradient(128, 128, 6, 128, 128, 128); grd.addColorStop(0, 'rgba(255,255,250,1)'); grd.addColorStop(0.12, 'rgba(255,250,220,0.9)'); grd.addColorStop(0.3, 'rgba(255,230,170,0.35)'); grd.addColorStop(1, 'rgba(255,220,150,0)');
    sg.fillStyle = grd; sg.fillRect(0, 0, 256, 256);
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: U.canvasTexture(sc), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    sun.position.copy(sunDir).multiplyScalar(50000); sun.scale.set(14000, 14000, 1);
    group.add(sun);
    scene.add(group);
    return { group, update: (t) => { RL.Stadium.timeUniform.value = t; }, crowdCount: info.crowdCount };
  }
  return { build };
})();
