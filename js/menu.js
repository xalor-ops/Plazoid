// Menus: main menu (with the 3D showcase backdrop), playlist tiles + matchmaking, garage, options, profile, news.
window.RL = window.RL || {};
RL.Menu = (function () {
  const U = RL.U;
  const $ = (id) => document.getElementById(id);
  let game, screen = 'none', mainSel = 0, tileSel = 1, optionsReturn = null;
  let showcase = null, orbit = { a: 0.9, drag: false, lastX: 0, vel: 0 }, garageTeam = 0;
  const MAIN_ITEMS = [
    { id: 'play', label: 'PLAY', sub: 'HIT THE FIELD' }, { id: 'shop', label: 'ITEM SHOP', cls: 'orange' }, { id: 'garage', label: 'GARAGE' }, { id: 'profile', label: 'PROFILE' }, { id: 'options', label: 'OPTIONS' }, { id: 'quit', label: 'QUIT' }
  ];
  const TILES = [
    { mode: '3v3', big: '3v3', small: 'STANDARD', img: 0 }, { mode: '2v2', big: '2v2', small: 'DOUBLES', img: 1 }, { mode: '1v1', big: '1v1', small: 'DUEL', img: 2 },
    { mode: 'rumble', big: '3v3', small: 'RUMBLE', img: 3, locked: true }, { mode: 'hoops', big: '2v2', small: 'HOOPS', img: 4, locked: true }, { mode: 'dropshot', big: '3v3', small: 'DROPSHOT', img: 5, locked: true }
  ];
  const _v = new THREE.Vector3(), _t = new THREE.Vector3();

  function init(g) {
    game = g;
    buildMain(); buildTiles(); buildGarage(); buildOptions(); buildProfile();
    $('newstab').onclick = () => { RL.Audio.ui('select'); show('news'); };
    $('newsback').onclick = () => back();
    $('playback').onclick = () => back();
    $('garageback').onclick = () => back();
    $('optback').onclick = () => back();
    $('profback').onclick = () => back();
    $('findmatch').onclick = () => findMatch();
    $('skiptrack').onclick = () => { RL.Audio.ui('select'); $('trackname').textContent = RL.Audio.nextTrack(); };
    drawAvatar(); drawAlbum();
    // garage orbit drag
    const canvas = game.renderer.domElement;
    window.addEventListener('mousedown', (e) => { if (screen === 'garage' && !(e.target.closest && e.target.closest('.panel'))) { orbit.drag = true; orbit.lastX = e.clientX; } });
    window.addEventListener('mousemove', (e) => { if (orbit.drag) { const dx = e.clientX - orbit.lastX; orbit.lastX = e.clientX; orbit.a -= dx * 0.008; orbit.vel = -dx * 0.25; } });
    window.addEventListener('mouseup', () => { orbit.drag = false; });
  }
  function drawAvatar() {
    const c = $('avatar'), g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 96, 96); grd.addColorStop(0, '#1f7fff'); grd.addColorStop(1, '#0b2a6b');
    g.fillStyle = grd; g.fillRect(0, 0, 96, 96);
    g.fillStyle = 'rgba(255,255,255,0.12)'; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(i * 22 - 10, 0); g.lineTo(i * 22 + 30, 96); g.lineTo(i * 22 + 18, 96); g.lineTo(i * 22 - 22, 0); g.fill(); }
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(48, 18); g.lineTo(78, 32); g.lineTo(72, 62); g.lineTo(48, 82); g.lineTo(24, 62); g.lineTo(18, 32); g.closePath(); g.fill();
    g.fillStyle = '#0b2a6b'; g.beginPath(); g.arc(48, 46, 15, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(48, 46, 9, 0, Math.PI * 2); g.fill(); g.fillStyle = '#0b2a6b'; g.fillRect(38, 43, 20, 6);
  }
  function drawAlbum() {
    const c = $('albumart'), g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 96, 96); grd.addColorStop(0, '#0b2a6b'); grd.addColorStop(0.5, '#1f7fff'); grd.addColorStop(1, '#ff8a00');
    g.fillStyle = grd; g.fillRect(0, 0, 96, 96);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 60, 96, 36);
    g.fillStyle = '#fff'; g.font = 'italic 900 13px "Titillium Web", "Segoe UI Black", Impact, sans-serif'; g.fillText('ROCKET', 8, 76); g.fillText('LEAGUE', 8, 90);
    g.beginPath(); g.arc(70, 30, 16, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill(); g.fillStyle = '#1f7fff'; g.beginPath(); g.arc(70, 30, 6, 0, Math.PI * 2); g.fill();
  }
  // ---------- main ----------
  function buildMain() {
    const list = $('mainlist'); list.innerHTML = '';
    MAIN_ITEMS.forEach((it, i) => {
      const el = document.createElement('div');
      el.className = 'mitem ' + (it.id === 'play' ? 'play' : '') + ' ' + (it.cls || '');
      el.innerHTML = it.id === 'play' ? `<span class="glyph a">A</span><div class="txt"><b>PLAY</b><small>HIT THE FIELD</small></div>` : it.label;
      el.onmouseenter = () => { if (mainSel !== i) { mainSel = i; refreshMain(); RL.Audio.ui('hover'); } };
      el.onclick = () => { mainSel = i; activateMain(); };
      list.appendChild(el);
    });
    refreshMain();
  }
  function refreshMain() { [...$('mainlist').children].forEach((el, i) => el.classList.toggle('sel', i === mainSel)); }
  function activateMain() {
    const it = MAIN_ITEMS[mainSel]; RL.Audio.ui('select');
    switch (it.id) {
      case 'play': show('play'); break;
      case 'garage': show('garage'); break;
      case 'profile': show('profile'); break;
      case 'options': show('options'); break;
      case 'shop': show('news'); $('news').querySelector('h2').textContent = 'ITEM SHOP'; $('news').querySelector('p').textContent = 'The shop is closed for this stadium build. Head to the Garage to paint your Octane or Fennec and pick your wheels.'; break;
      case 'quit': quit(); break;
    }
  }
  function quit() {
    document.body.innerHTML = '<div style="position:fixed;inset:0;background:#05080f;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:var(--font);color:#fff"><div style="font-size:64px;font-weight:900;font-style:italic">THANKS FOR PLAYING</div><div style="margin-top:12px;color:#9fb8ff;letter-spacing:4px;font-weight:700">YOU CAN CLOSE THIS TAB</div></div>';
    try { window.close(); } catch (e) { }
  }
  // ---------- play ----------
  function buildTiles() {
    const wrap = $('tiles'); wrap.innerHTML = '';
    TILES.forEach((t, i) => {
      const el = document.createElement('div'); el.className = 'tile' + (t.locked ? ' locked' : '') + (i === tileSel ? ' sel' : '');
      el.innerHTML = `<div class="shade"></div><div class="lbl"><b>${t.big}</b><small>${t.small}</small></div>`;
      el.onmouseenter = () => { if (tileSel !== i) { tileSel = i; refreshTiles(); RL.Audio.ui('hover'); } };
      el.onclick = () => { tileSel = i; refreshTiles(); RL.Audio.ui('select'); if (!t.locked) findMatch(); };
      wrap.appendChild(el);
    });
  }
  function setTileImages(urls) { [...$('tiles').children].forEach((el, i) => { const t = TILES[i]; const u = urls[t.img]; if (u) el.style.backgroundImage = `url(${u})`; }); }
  function refreshTiles() { [...$('tiles').children].forEach((el, i) => el.classList.toggle('sel', i === tileSel)); }
  let searching = false;
  function findMatch() {
    const t = TILES[tileSel]; if (t.locked || searching) { if (t.locked) RL.Audio.ui('back'); return; }
    searching = true; RL.Audio.ui('select');
    const s = $('searching'); s.classList.remove('hidden'); $('searchtext').textContent = 'SEARCHING FOR MATCH'; $('searchsub').textContent = 'MANNFIELD • ' + t.big + ' ' + t.small;
    $('tiles').style.opacity = '0.25';
    setTimeout(() => { $('searchtext').textContent = 'MATCH FOUND'; $('searchsub').textContent = 'JOINING • MANNFIELD'; RL.Audio.ui('found'); }, 1300);
    setTimeout(() => { s.classList.add('hidden'); $('tiles').style.opacity = ''; searching = false; game.startMatch({ mode: t.mode }); }, 2300);
  }
  // ---------- garage ----------
  function buildGarage() {
    const bl = $('bodylist'); bl.innerHTML = '';
    for (const id of ['octane', 'fennec']) {
      const el = document.createElement('div'); el.className = 'mitem'; el.textContent = id.toUpperCase(); el.dataset.id = id;
      el.onclick = () => { RL.Audio.ui('select'); game.settings.body = id; game.saveSettings(); refreshGarage(); rebuildShowcase(); };
      el.onmouseenter = () => RL.Audio.ui('hover');
      bl.appendChild(el);
    }
    $('teamtabs').querySelectorAll('.tab').forEach((tab) => { tab.onclick = () => { RL.Audio.ui('select'); garageTeam = +tab.dataset.team; refreshGarage(); rebuildShowcase(); }; });
    refreshGarage();
  }
  function swatches(id, list, key) {
    const wrap = $(id); wrap.innerHTML = '';
    const cur = game.settings.colors[garageTeam][key];
    for (const hex of list) {
      const el = document.createElement('div'); el.className = 'sw' + (hex === cur ? ' sel' : ''); el.style.background = hex;
      el.onclick = () => { RL.Audio.ui('select'); game.settings.colors[garageTeam][key] = hex; game.saveSettings(); refreshGarage(); if (showcase) showcase.model.setColors(game.settings.colors[garageTeam]); };
      el.onmouseenter = () => RL.Audio.ui('hover');
      wrap.appendChild(el);
    }
  }
  function refreshGarage() {
    [...$('bodylist').children].forEach((el) => el.classList.toggle('sel', el.dataset.id === game.settings.body));
    $('teamtabs').querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('sel', +tab.dataset.team === garageTeam));
    swatches('swPrimary', garageTeam === 0 ? RL.PALETTE.blue : RL.PALETTE.orange, 'primary');
    swatches('swAccent', RL.PALETTE.accent, 'accent');
    swatches('swWheel', RL.PALETTE.wheel, 'wheel');
  }
  // ---------- options ----------
  const OPTS = [
    { h: 'CAMERA' },
    { k: 'camera.fov', label: 'FIELD OF VIEW', min: 60, max: 110, step: 5 },
    { k: 'camera.distance', label: 'DISTANCE', min: 100, max: 400, step: 10 },
    { k: 'camera.height', label: 'HEIGHT', min: 40, max: 200, step: 10 },
    { k: 'camera.angle', label: 'ANGLE', min: -15, max: 0, step: 1 },
    { k: 'camera.stiffness', label: 'STIFFNESS', min: 0, max: 1, step: 0.05 },
    { k: 'camera.swivel', label: 'SWIVEL SPEED', min: 1, max: 10, step: 0.5 },
    { h: 'GAMEPLAY' },
    { k: 'bots', label: 'BOT DIFFICULTY', seg: [['rookie', 'ROOKIE'], ['pro', 'PRO'], ['allstar', 'ALL-STAR']] },
    { k: 'matchLength', label: 'MATCH LENGTH', seg: [[180, '3 MIN'], [300, '5 MIN'], [420, '7 MIN']] },
    { h: 'AUDIO' },
    { k: 'audio.master', label: 'MASTER VOLUME', min: 0, max: 1, step: 0.05 },
    { k: 'audio.sfx', label: 'GAMEPLAY VOLUME', min: 0, max: 1, step: 0.05 },
    { k: 'audio.music', label: 'MUSIC VOLUME', min: 0, max: 1, step: 0.05 },
    { k: 'musicInMatch', label: 'MUSIC DURING MATCH', seg: [[false, 'OFF'], [true, 'ON']] },
    { h: 'VIDEO' },
    { k: 'video.quality', label: 'QUALITY', seg: [['auto', 'AUTO'], ['low', 'PERFORMANCE'], ['medium', 'BALANCED'], ['high', 'QUALITY']] },
    { k: 'video.showFps', label: 'SHOW FPS', seg: [[false, 'OFF'], [true, 'ON']] },
    { h: 'CONTROLS' },
    { ctrl: [['THROTTLE / REVERSE', 'W / S'], ['STEER', 'A / D'], ['JUMP', 'SPACE or RMB'], ['BOOST', 'SHIFT or LMB'], ['POWERSLIDE / AIR ROLL', 'CTRL (hold)'], ['AIR ROLL LEFT / RIGHT', 'Q / E'], ['BALL CAM', 'Y or C'], ['REAR VIEW', 'R (hold)'], ['SCOREBOARD', 'TAB (hold)'], ['PAUSE', 'ESC'], ['GAMEPAD', 'A jump • B boost • X slide • Y ball cam • RT/LT drive']] }
  ];
  const get = (obj, path) => path.split('.').reduce((o, k) => o[k], obj);
  const set = (obj, path, v) => { const ks = path.split('.'); const last = ks.pop(); ks.reduce((o, k) => o[k], obj)[last] = v; };
  function buildOptions() {
    const p = $('optpanel'); p.innerHTML = '';
    for (const o of OPTS) {
      if (o.h) { const h = document.createElement('h3'); h.textContent = o.h; p.appendChild(h); continue; }
      if (o.ctrl) { for (const [a, b] of o.ctrl) { const r = document.createElement('div'); r.className = 'orow'; r.innerHTML = `<div>${a}</div><div style="color:#dbe4f2;font-weight:700">${b}</div><div></div>`; p.appendChild(r); } continue; }
      const r = document.createElement('div'); r.className = 'orow';
      const cur = get(game.settings, o.k);
      if (o.seg) {
        r.innerHTML = `<div>${o.label}</div><div class="seg"></div><div></div>`;
        const seg = r.querySelector('.seg');
        for (const [val, lbl] of o.seg) { const d = document.createElement('div'); d.textContent = lbl; d.classList.toggle('sel', val === cur); d.onclick = () => { RL.Audio.ui('select'); set(game.settings, o.k, val); [...seg.children].forEach((c) => c.classList.remove('sel')); d.classList.add('sel'); game.applySettings(o.k); game.saveSettings(); }; seg.appendChild(d); }
      } else {
        r.innerHTML = `<div>${o.label}</div><input type="range" min="${o.min}" max="${o.max}" step="${o.step}" value="${cur}"><div class="val">${fmtVal(o, cur)}</div>`;
        const inp = r.querySelector('input'); const val = r.querySelector('.val');
        inp.oninput = () => { const v = parseFloat(inp.value); set(game.settings, o.k, v); val.textContent = fmtVal(o, v); game.applySettings(o.k); };
        inp.onchange = () => { game.saveSettings(); RL.Audio.ui('hover'); };
      }
      p.appendChild(r);
    }
  }
  function fmtVal(o, v) { if (o.step < 1) return Math.round(v * 100) / 100; return v; }
  // ---------- profile ----------
  function buildProfile() {
    const inp = $('nameinput'); inp.value = game.settings.name;
    inp.onchange = () => { const v = inp.value.trim().slice(0, 16) || 'ROOKIE'; game.settings.name = v; inp.value = v; game.saveSettings(); refreshCard(); };
    inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') inp.blur(); };
    inp.onkeyup = (e) => e.stopPropagation();
  }
  function refreshProfile() {
    const st = game.settings.stats;
    $('profstats').innerHTML = `<div><b>${st.matches}</b><span>MATCHES</span></div><div><b>${st.wins}</b><span>WINS</span></div><div><b>${st.goals}</b><span>GOALS</span></div><div><b>${st.saves}</b><span>SAVES</span></div><div><b>${st.shots}</b><span>SHOTS</span></div><div><b>${game.settings.level}</b><span>LEVEL</span></div>`;
  }
  function refreshCard() {
    $('pname').textContent = game.settings.name.toUpperCase(); $('lvl').textContent = game.settings.level;
    $('xpbar').style.width = Math.round((game.settings.xp % 1000) / 10) + '%';
    $('trackname').textContent = RL.Audio.trackName();
  }
  // ---------- showcase car (menu backdrop / garage) ----------
  function rebuildShowcase() {
    if (showcase) { game.scene.remove(showcase.group); showcase.model.dispose(); showcase = null; }
    const team = screen === 'garage' ? garageTeam : 0;
    const colors = game.settings.colors[team];
    showcase = new RL.Car({ team, name: 'showcase', body: game.settings.body, colors });
    if (game.env) showcase.setEnv(game.env);
    showcase.reset(-900, -2500, 0.75, 100); showcase.syncVisual(1);
    game.scene.add(showcase.group);
  }
  function removeShowcase() { if (showcase) { game.scene.remove(showcase.group); showcase.model.dispose(); showcase = null; } }
  // ---------- navigation ----------
  function show(name) {
    if (screen === 'none') blockInput(0.35);
    screen = name;
    $('menu').classList.remove('hidden');
    for (const id of ['play', 'garage', 'options', 'profile', 'news']) $(id).classList.toggle('hidden', id !== name);
    $('mainmenu').classList.toggle('hidden', name !== 'main');
    if (name === 'main') { refreshCard(); if (!showcase) rebuildShowcase(); showcase.reset(-900, -2500, 0.75, 100); showcase.syncVisual(1); }
    if (name === 'garage') { rebuildShowcase(); showcase.reset(0, 0, 0, 100); showcase.syncVisual(1); orbit.a = 0.9; refreshGarage(); }
    if (name === 'profile') refreshProfile();
    if (name === 'options') buildOptions();
    game.camera.mode = 'free';
  }
  function hide() { screen = 'none'; $('menu').classList.add('hidden'); removeShowcase(); }
  function back() {
    RL.Audio.ui('back');
    if (screen === 'options' && optionsReturn) { const cb = optionsReturn; optionsReturn = null; hide(); cb(); return; }
    if (screen !== 'main') { if (screen === 'news') { $('news').querySelector('h2').textContent = 'WELCOME TO MANNFIELD'; } show('main'); }
  }
  function openOptions(returnCb) { optionsReturn = returnCb; show('options'); }
  let blockUntil = 0;
  function blockInput(sec) { blockUntil = performance.now() + sec * 1000; }
  function update(dt, time) {
    if (screen === 'none') return;
    const inp = RL.Input;
    if (performance.now() < blockUntil) inp.clearEdges();
    if (screen === 'main') {
      if (inp.consume('menuUp')) { mainSel = (mainSel + MAIN_ITEMS.length - 1) % MAIN_ITEMS.length; refreshMain(); RL.Audio.ui('hover'); }
      if (inp.consume('menuDown')) { mainSel = (mainSel + 1) % MAIN_ITEMS.length; refreshMain(); RL.Audio.ui('hover'); }
      if (inp.consume('menuAccept')) activateMain();
      inp.consume('menuBack');
    } else if (screen === 'play') {
      if (inp.consume('menuLeft')) { tileSel = (tileSel + 5) % 6; refreshTiles(); RL.Audio.ui('hover'); }
      if (inp.consume('menuRight')) { tileSel = (tileSel + 1) % 6; refreshTiles(); RL.Audio.ui('hover'); }
      if (inp.consume('menuUp') || inp.consume('menuDown')) { tileSel = (tileSel + 3) % 6; refreshTiles(); RL.Audio.ui('hover'); }
      if (inp.consume('menuAccept')) findMatch();
      if (inp.consume('menuBack') && !searching) back();
    } else {
      if (inp.consume('menuBack')) back();
      inp.consume('menuAccept'); inp.consume('menuUp'); inp.consume('menuDown'); inp.consume('menuLeft'); inp.consume('menuRight');
    }
    // 3D backdrop camera
    const cam = game.camera;
    if (screen === 'garage' && showcase) {
      if (!orbit.drag) { orbit.a += (0.12 + orbit.vel * 0.02) * dt; orbit.vel *= Math.exp(-dt * 3); }
      const c = showcase.pos;
      _v.set(c.x + Math.cos(orbit.a) * 330, c.y + Math.sin(orbit.a) * 330, c.z + 105); _t.set(c.x, c.y, c.z + 22);
      cam.setFree(_v, _t, 12, dt);
    } else if (showcase) {
      // main menu: 3/4 front-right view, car sitting right of center; subtle drift
      const c = showcase.pos; const f = showcase.fwd;
      const ang = Math.atan2(f.y, f.x) - 0.78 + Math.sin(time * 0.15) * 0.04;
      _v.set(c.x + Math.cos(ang) * 330, c.y + Math.sin(ang) * 330, c.z + 78 + Math.sin(time * 0.2) * 4);
      // look left of the car (camera-left = (sin a, -cos a)) so the car sits right of center
      const lx = Math.sin(ang), ly = -Math.cos(ang);
      _t.set(c.x + lx * 48, c.y + ly * 48, c.z + 40);
      cam.setFree(_v, _t, 6, dt);
    }
    cam.cam.fov = 40; cam.cam.updateProjectionMatrix();
    cam.finalize(dt);
    if (showcase) { showcase.syncVisual(dt); }
  }
  return { init, show, hide, update, back, openOptions, setTileImages, refreshCard, blockInput, get screen() { return screen; }, get showcase() { return showcase; } };
})();
