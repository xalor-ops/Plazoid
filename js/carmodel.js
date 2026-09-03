// Procedural car bodies: Octane and Fennec. Local frame: +x forward, +y left, +z up.
// The returned group's origin is the physics pivot (17.01 uu above the ground at rest).
window.RL = window.RL || {};
RL.CarModel = (function () {
  const U = RL.U;

  RL.PALETTE = {
    blue: ['#1f6fe0', '#0b4fb8', '#12a0d6', '#08c3d1', '#26d97a', '#0a7d3c', '#6c3fe0', '#3b1f8c', '#2a1a5e', '#4a90ff', '#b0c4de', '#2f3f5f', '#ffffff', '#1a1a1e', '#8a8f99'],
    orange: ['#ff8a00', '#e04c00', '#c21f1f', '#8a0f1f', '#ffc21a', '#ffe066', '#ff5fa2', '#b0006b', '#ff9f66', '#d9c6a5', '#5a2d0c', '#ffffff', '#1a1a1e', '#8a8f99', '#f2f2f2'],
    accent: ['#ffffff', '#1a1a1e', '#8a8f99', '#cfd4dc', '#ff2a2a', '#ffd400', '#00e5ff', '#39ff14', '#ff8a00', '#1f6fe0'],
    wheel: ['#cfd4dc', '#1a1a1e', '#ff2a2a', '#ffd400', '#00e5ff', '#39ff14', '#ff8a00', '#1f6fe0', '#ffffff', '#8a5a2b']
  };

  // Extrude a side profile (x,z points) across the width (y), with optional per-x width scaling.
  function profileGeo(profile, halfWidth, widthFn, bevel) {
    const shape = new THREE.Shape();
    shape.moveTo(profile[0][0], profile[0][1]);
    for (let i = 1; i < profile.length; i++) shape.lineTo(profile[i][0], profile[i][1]);
    shape.closePath();
    const depth = Math.max(1, halfWidth * 2 - bevel * 2);
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, steps: 1, curveSegments: 6 });
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const X = p.getX(i), Y = p.getY(i), Z = p.getZ(i);
      const ny = -(Z - depth / 2) * (widthFn ? widthFn(X) : 1);
      p.setXYZ(i, X, ny, Y);
    }
    geo.deleteAttribute('uv');
    geo.computeVertexNormals();
    return geo;
  }
  // split a non-indexed geometry into 2 groups by face normal test (true -> group 0)
  function splitByNormal(geo, test) {
    const p = geo.attributes.position;
    const a = [], b = [];
    const fn = new THREE.Vector3(), tA = new THREE.Vector3(), tB = new THREE.Vector3(), tC = new THREE.Vector3();
    for (let i = 0; i < p.count; i += 3) {
      tA.fromBufferAttribute(p, i); tB.fromBufferAttribute(p, i + 1); tC.fromBufferAttribute(p, i + 2);
      fn.subVectors(tB, tA).cross(tC.sub(tA)).normalize();
      (test(fn, tA) ? a : b).push(i, i + 1, i + 2);
    }
    geo.setIndex(a.concat(b));
    geo.clearGroups();
    geo.addGroup(0, a.length, 0); geo.addGroup(a.length, b.length, 1);
    return geo;
  }
  function roundedRectShape(w, h, r) {
    const s = new THREE.Shape(); const x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }
  // closed hemisphere dome (fender pod), flat side down, scaled per axis
  function domeGeo(r, sx, sy, sz) {
    const dome = new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    const cap = new THREE.CircleGeometry(r, 20); cap.rotateX(Math.PI / 2); // faces -y after rotate? we want facing down (-z): CircleGeometry faces +z, rotate PI about x
    const cap2 = new THREE.CircleGeometry(r, 20); cap2.rotateX(Math.PI);
    const geo = U.mergeGeos([{ geo: dome }, { geo: cap2 }]);
    geo.scale(sx, sy, sz);
    geo.computeVertexNormals();
    return geo;
  }

  function rimTexture(colorHex) {
    const S = 256; const c = U.canvas(S, S), g = c.getContext('2d');
    g.clearRect(0, 0, S, S);
    g.fillStyle = '#17181b'; g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#2a2b2f'; g.lineWidth = 3; g.beginPath(); g.arc(S / 2, S / 2, S * 0.43, 0, Math.PI * 2); g.stroke();
    const rr = S * 0.35;
    g.fillStyle = '#0c0d10'; g.beginPath(); g.arc(S / 2, S / 2, rr, 0, Math.PI * 2); g.fill();
    g.save(); g.translate(S / 2, S / 2);
    const grad = g.createRadialGradient(0, 0, 10, 0, 0, rr); grad.addColorStop(0, U.shade(colorHex, 1.2)); grad.addColorStop(1, U.shade(colorHex, 0.7));
    g.fillStyle = grad;
    for (let i = 0; i < 5; i++) {
      g.rotate(Math.PI * 2 / 5);
      g.beginPath(); g.moveTo(-9, 0); g.lineTo(-17, rr - 9); g.lineTo(17, rr - 9); g.lineTo(9, 0); g.closePath(); g.fill();
    }
    g.restore();
    g.strokeStyle = U.shade(colorHex, 0.95); g.lineWidth = 11; g.beginPath(); g.arc(S / 2, S / 2, rr - 5, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.28)'; g.lineWidth = 2; g.beginPath(); g.arc(S / 2, S / 2, rr - 1, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#2b2d33'; g.beginPath(); g.arc(S / 2, S / 2, 20, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#9aa0aa'; g.beginPath(); g.arc(S / 2, S / 2, 8, 0, Math.PI * 2); g.fill();
    return U.canvasTexture(c, { aniso: 8 });
  }

  function makeMaterials(colors) {
    const paint = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(colors.primary), metalness: 0.4, roughness: 0.3, clearcoat: 1.0, clearcoatRoughness: 0.08, envMapIntensity: 1.2 });
    const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(colors.accent), metalness: 0.5, roughness: 0.4 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x0b0e14, metalness: 0.9, roughness: 0.06, clearcoat: 1.0, clearcoatRoughness: 0.03, envMapIntensity: 1.4 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xe8ebf0, metalness: 1.0, roughness: 0.18 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x14151a, metalness: 0.3, roughness: 0.7 });
    const tire = new THREE.MeshStandardMaterial({ color: 0x1b1c20, roughness: 0.92, metalness: 0.0 });
    const rim = new THREE.MeshStandardMaterial({ map: rimTexture(colors.wheel), metalness: 0.7, roughness: 0.35 });
    const headlight = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4d6, emissiveIntensity: 1.6, roughness: 0.2 });
    const taillight = new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff1a1a, emissiveIntensity: 1.4, roughness: 0.3 });
    return { paint, accent, glass, chrome, dark, tire, rim, headlight, taillight };
  }

  function makeWheel(radius, width, mats) {
    const geo = new THREE.CylinderGeometry(radius, radius, width, 24, 1, false);
    const sideCount = 24 * 6;
    geo.clearGroups();
    geo.addGroup(0, sideCount, 0); geo.addGroup(sideCount, geo.index.count - sideCount, 1);
    const mesh = new THREE.Mesh(geo, [mats.tire, mats.rim]);
    mesh.castShadow = true;
    mesh.rotation.order = 'ZYX';
    return mesh;
  }

  const BODIES = {
    octane: {
      hull: { profile: [[72, 12], [73.5, 17], [71.5, 22.5], [60, 26], [40, 30], [24, 32.5], [12, 34], [-30, 36], [-42, 34.5], [-46.5, 30], [-47.5, 22], [-46, 13.5], [-38, 10.5], [60, 10.5]], half: 33, bevel: 3.5, width: (x) => x > 55 ? U.lerp(1.0, 0.7, (x - 55) / 18.5) : (x < -36 ? U.lerp(1.0, 0.94, (-36 - x) / 12) : 1) },
      cabin: { profile: [[20, 33], [7, 50], [-8, 52.5], [-24, 52], [-33, 44], [-34, 33]], half: 30, bevel: 2.5, width: (x) => x > 8 ? U.lerp(1, 0.9, (x - 8) / 12) : 1 },
      wheels: [{ x: 51, y: 33, r: 13.5, w: 14, front: true }, { x: 51, y: -33, r: 13.5, w: 14, front: true }, { x: -33, y: 34, r: 15.5, w: 15, front: false }, { x: -33, y: -34, r: 15.5, w: 15, front: false }],
      pods: [{ x: 51, y: 33, z: 13, r: 19, sx: 1.3, sy: 0.5, sz: 0.85 }, { x: -33, y: 34, z: 15, r: 21, sx: 1.3, sy: 0.45, sz: 0.82 }],
      wing: { x: -41, z: 60.5, w: 84, len: 15, tilt: 0.17, struts: [{ x: -34, y: 24, z: 47, len: 26, tilt: -0.42 }] },
      engine: { x: -38, z: 40, w: 34, len: 14, h: 8 },
      scoop: { x: -25, z: 55.5, w: 16, len: 11, h: 7 },
      bullbar: true, pillars: 'octane',
      headlights: [{ y: 22, z: 22.5, r: 4.6 }, { y: -22, z: 22.5, r: 4.6 }, { y: 9, z: 15.5, r: 2.4 }, { y: -9, z: 15.5, r: 2.4 }],
      headX: 71.5, grille: { z: 17.5, w: 40, h: 6 },
      taillights: [{ y: 28, z: 28 }, { y: -28, z: 28 }],
      tailX: -48,
      exhaust: [{ y: 0, z: 19 }],
      skirts: { x: 8, len: 66, z: 12.5 },
      boost: [-52, 0, 19]
    },
    fennec: {
      hull: { profile: [[66, 12], [68, 20], [67, 27.5], [62, 30.5], [30, 31.5], [-40, 32.5], [-47, 29.5], [-48.5, 20], [-46.5, 13], [-36, 10.5], [58, 10.5]], half: 34, bevel: 3.5, width: (x) => x > 52 ? U.lerp(1.0, 0.9, (x - 52) / 16) : 1 },
      cabin: { profile: [[24, 31], [13, 51.5], [-14, 54], [-36, 53], [-44, 42], [-45, 31]], half: 33, bevel: 2.5, width: (x) => 1 },
      wheels: [{ x: 48, y: 34, r: 14.5, w: 15, front: true }, { x: 48, y: -34, r: 14.5, w: 15, front: true }, { x: -34, y: 34, r: 14.5, w: 15, front: false }, { x: -34, y: -34, r: 14.5, w: 15, front: false }],
      flares: [{ x: 48, y: 34, z: 16 }, { x: -34, y: 34, z: 16 }],
      wing: { x: -46, z: 55, w: 76, len: 12, tilt: -0.12, struts: [] },
      pillars: 'fennec', mirrors: true,
      headlights: [{ y: 26, z: 25, r: 4.4 }, { y: -26, z: 25, r: 4.4 }, { y: 17, z: 25, r: 4.4 }, { y: -17, z: 25, r: 4.4 }],
      headX: 67.5, grille: { z: 23.5, w: 26, h: 7 },
      taillights: [{ y: 27, z: 27 }, { y: -27, z: 27 }],
      tailX: -49,
      exhaust: [{ y: 19, z: 15 }, { y: -19, z: 15 }],
      skirts: { x: 6, len: 70, z: 12.5 },
      boost: [-52, 0, 19]
    }
  };

  function build(bodyId, colors) {
    const def = BODIES[bodyId] || BODIES.octane;
    const mats = makeMaterials(colors);
    const root = new THREE.Group();
    const g = new THREE.Group(); g.position.z = -RL.C.REST_Z; root.add(g);
    const paintParts = [], accentParts = [], darkParts = [], chromeParts = [];
    const add = (list, geo, x, y, z, rx, ry, rz) => list.push({ geo, matrix: U.mat(x || 0, y || 0, z || 0, rx, ry, rz) });

    // hull
    add(paintParts, profileGeo(def.hull.profile, def.hull.half, def.hull.width, def.hull.bevel), 0, 0, 0);
    // cabin (roof = paint, rest = glass)
    const cabin = splitByNormal(profileGeo(def.cabin.profile, def.cabin.half, def.cabin.width, def.cabin.bevel), (n) => n.z > 0.6);
    const cabinMesh = new THREE.Mesh(cabin, [mats.paint, mats.glass]); cabinMesh.castShadow = true; g.add(cabinMesh);
    // pillars
    if (def.pillars === 'octane') {
      const ws = def.cabin.profile; const a = ws[0], b = ws[1]; const len = Math.hypot(b[0] - a[0], b[1] - a[1]); const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      for (const sy of [-1, 1]) add(paintParts, new THREE.BoxGeometry(len, 2.6, 2.6), (a[0] + b[0]) / 2, sy * (def.cabin.half - 1), (a[1] + b[1]) / 2 + 0.5, 0, -ang, 0);
      for (const sy of [-1, 1]) add(paintParts, new THREE.BoxGeometry(3, 3, 19), -26, sy * (def.cabin.half - 0.5), 43);
    } else if (def.pillars === 'fennec') {
      const ws = def.cabin.profile; const a = ws[0], b = ws[1]; const len = Math.hypot(b[0] - a[0], b[1] - a[1]); const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      for (const sy of [-1, 1]) add(paintParts, new THREE.BoxGeometry(len, 3, 3), (a[0] + b[0]) / 2, sy * (def.cabin.half - 1), (a[1] + b[1]) / 2 + 0.5, 0, -ang, 0);
      add(paintParts, new THREE.BoxGeometry(4, def.cabin.half * 2 + 1.5, 21), -6, 0, 42);
      for (const sy of [-1, 1]) add(paintParts, new THREE.BoxGeometry(3.5, 3, 20), -40, sy * (def.cabin.half - 0.5), 42);
      add(paintParts, new THREE.BoxGeometry(60, def.cabin.half * 2 + 1, 2.5), -12, 0, 53.5);
    }
    // fenders
    if (def.pods) for (const pd of def.pods) for (const sy of [-1, 1]) add(paintParts, domeGeo(pd.r, pd.sx, pd.sy, pd.sz), pd.x, sy * pd.y, pd.z);
    if (def.flares) for (const fl of def.flares) for (const sy of [-1, 1]) {
      const geo = new THREE.ExtrudeGeometry(roundedRectShape(46, 24, 8), { depth: 4.5, bevelEnabled: true, bevelThickness: 2.5, bevelSize: 2.5, bevelSegments: 2 });
      add(paintParts, geo, fl.x, sy * (def.hull.half + 2.5), fl.z + 10, Math.PI / 2, 0, 0);
    }
    // wing
    if (def.wing) {
      const wg = def.wing;
      add(paintParts, new THREE.BoxGeometry(wg.len, wg.w, 2.6), wg.x, 0, wg.z, 0, wg.tilt, 0);
      for (const sy of [-1, 1]) add(accentParts, new THREE.BoxGeometry(wg.len + 3, 2.5, 11), wg.x, sy * wg.w / 2, wg.z + 2, 0, wg.tilt, 0);
      for (const st of wg.struts) for (const sy of [-1, 1]) add(paintParts, new THREE.BoxGeometry(3, 5, st.len), st.x, sy * st.y, st.z, 0, st.tilt, 0);
    }
    if (def.engine) { add(darkParts, new THREE.BoxGeometry(def.engine.len, def.engine.w, def.engine.h), def.engine.x, 0, def.engine.z); add(paintParts, new THREE.BoxGeometry(def.engine.len - 4, def.engine.w - 6, 2), def.engine.x, 0, def.engine.z + def.engine.h / 2 + 0.5); }
    if (def.scoop) { add(accentParts, new THREE.BoxGeometry(def.scoop.len, def.scoop.w, def.scoop.h), def.scoop.x, 0, def.scoop.z); add(darkParts, new THREE.BoxGeometry(2, def.scoop.w - 4, def.scoop.h - 3), def.scoop.x + def.scoop.len / 2, 0, def.scoop.z + 0.5); }
    if (def.bullbar) {
      for (const sy of [-1, 1]) add(chromeParts, new THREE.CylinderGeometry(2.2, 2.2, 15, 10), 73.5, sy * 14, 19.5, Math.PI / 2, 0, 0);
      add(chromeParts, new THREE.CylinderGeometry(2.2, 2.2, 34, 10), 74, 0, 26.5);
      add(chromeParts, new THREE.CylinderGeometry(2.2, 2.2, 34, 10), 74, 0, 12.5);
      add(darkParts, new THREE.BoxGeometry(6, 62, 5), 71, 0, 10.5);
    }
    if (def.grille) add(darkParts, new THREE.BoxGeometry(2.5, def.grille.w, def.grille.h), def.headX + 0.6, 0, def.grille.z);
    if (def.mirrors) for (const sy of [-1, 1]) { add(paintParts, new THREE.BoxGeometry(6, 9, 4), 18, sy * (def.hull.half + 5), 36.5); add(darkParts, new THREE.BoxGeometry(2, 5, 4), 18, sy * (def.hull.half + 2), 35); }
    if (def.skirts) for (const sy of [-1, 1]) add(darkParts, new THREE.BoxGeometry(def.skirts.len, 3, 5), def.skirts.x, sy * (def.hull.half + 0.5), def.skirts.z);
    add(darkParts, new THREE.BoxGeometry(100, def.hull.half * 2 - 4, 5), 10, 0, 10);
    // lights
    const hl = [];
    for (const h of def.headlights) hl.push({ geo: new THREE.CylinderGeometry(h.r, h.r, 3, 14), matrix: U.mat(def.headX, h.y, h.z, 0, 0, Math.PI / 2) });
    g.add(new THREE.Mesh(U.mergeGeos(hl), mats.headlight));
    const tl = [];
    for (const t of def.taillights) tl.push({ geo: new THREE.BoxGeometry(2, 12, 5), matrix: U.mat(def.tailX, t.y, t.z) });
    g.add(new THREE.Mesh(U.mergeGeos(tl), mats.taillight));
    for (const e of def.exhaust) add(darkParts, new THREE.CylinderGeometry(4.5, 4, 9, 12), def.tailX - 2, e.y, e.z, 0, 0, Math.PI / 2);

    const paintMesh = new THREE.Mesh(U.mergeGeos(paintParts), mats.paint); paintMesh.castShadow = true; g.add(paintMesh);
    const accentMesh = new THREE.Mesh(U.mergeGeos(accentParts), mats.accent); accentMesh.castShadow = true; g.add(accentMesh);
    g.add(new THREE.Mesh(U.mergeGeos(darkParts), mats.dark));
    if (chromeParts.length) g.add(new THREE.Mesh(U.mergeGeos(chromeParts), mats.chrome));

    const wheels = [];
    for (const w of def.wheels) {
      const m = makeWheel(w.r, w.w, mats); m.position.set(w.x, w.y, w.r); g.add(m);
      wheels.push({ mesh: m, radius: w.r, front: w.front, spin: 0 });
    }
    const boostPos = new THREE.Vector3(def.boost[0], def.boost[1], def.boost[2] - RL.C.REST_Z);
    const api = {
      group: root, wheels, boostPos, mats, bodyId,
      setColors(c) {
        mats.paint.color.set(c.primary); mats.accent.color.set(c.accent);
        if (mats.rim.map) mats.rim.map.dispose();
        mats.rim.map = rimTexture(c.wheel); mats.rim.needsUpdate = true;
      },
      setEnv(env) { for (const k in mats) { mats[k].envMap = env; mats[k].needsUpdate = true; } },
      dispose() { root.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); for (const k in mats) mats[k].dispose(); }
    };
    return api;
  }
  return { build, BODIES, rimTexture };
})();
