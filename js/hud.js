// In-match HUD: score/timer, boost gauge, ball cam indicator, countdown, goal banner, nameplates, popups,
// scoreboard, pause menu and match-end panel. Pure DOM.
window.RL = window.RL || {};
RL.HUD = (function () {
  const U = RL.U;
  const $ = (id) => document.getElementById(id);
  let els = {}, plates = new Map(), popupCount = 0;
  let boostShown = -1, timeShown = '', blueShown = -1, orangeShown = -1;
  const ARC_START = 135, ARC_SWEEP = 270;
  function arcPath(cx, cy, r, a0, a1) {
    const s = (a0) * Math.PI / 180, e = (a1) * Math.PI / 180;
    const x0 = cx + r * Math.cos(s), y0 = cy + r * Math.sin(s), x1 = cx + r * Math.cos(e), y1 = cy + r * Math.sin(e);
    const large = (a1 - a0) > 180 ? 1 : 0;
    return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
  }
  function init() {
    els = { hud: $('hud'), sblue: $('sblue'), sorange: $('sorange'), stime: $('stime'), otlabel: $('otlabel'), boostarc: $('boostarc'), boostbg: $('boostbg'), boostval: $('boostval'), ballcam: $('ballcam'), countdown: $('countdown'), goalbanner: $('goalbanner'), bigmsg: $('bigmsg'), replaytag: $('replaytag'), skiphint: $('skiphint'), replaybar: $('replaybar'), popups: $('popups'), plates: $('plates'), scoreboard: $('scoreboard'), endpanel: $('endpanel'), pause: $('pause'), pauselist: $('pauselist'), bckey: $('bckey') };
    els.boostbg.setAttribute('d', arcPath(100, 100, 78, ARC_START - 90, ARC_START - 90 + ARC_SWEEP));
    const ticks = $('boostticks'); let s = '';
    for (let i = 0; i <= 10; i++) { const a = (ARC_START - 90 + ARC_SWEEP * i / 10) * Math.PI / 180; const r0 = 64, r1 = i % 5 === 0 ? 56 : 60; s += `<line x1="${100 + r0 * Math.cos(a)}" y1="${100 + r0 * Math.sin(a)}" x2="${100 + r1 * Math.cos(a)}" y2="${100 + r1 * Math.sin(a)}"/>`; }
    ticks.innerHTML = s;
    els.bckey.textContent = RL.KEY_LABELS.ballCam;
  }
  function show() { els.hud.classList.remove('hidden'); }
  function hide() { els.hud.classList.add('hidden'); clearPlates(); }
  function setScore(b, o) { if (b !== blueShown) { els.sblue.textContent = b; blueShown = b; } if (o !== orangeShown) { els.sorange.textContent = o; orangeShown = o; } }
  function setTime(sec, overtime) {
    const t = (overtime ? '+' : '') + U.fmtTime(sec);
    if (t !== timeShown) { els.stime.textContent = t; timeShown = t; }
    els.stime.parentElement.classList.toggle('ot', !!overtime);
    els.otlabel.classList.toggle('hidden', !overtime);
  }
  function setBoost(v) {
    const iv = Math.round(v);
    if (iv === boostShown) return; boostShown = iv;
    els.boostval.textContent = iv;
    const sweep = ARC_SWEEP * U.clamp(v / 100, 0, 1);
    els.boostarc.setAttribute('d', sweep > 0.5 ? arcPath(100, 100, 78, ARC_START - 90, ARC_START - 90 + sweep) : '');
  }
  function setBallCam(on) { els.ballcam.classList.toggle('off', !on); }
  let centerTimer = 0;
  function showCountdown(n) {
    els.goalbanner.classList.add('hidden'); els.bigmsg.classList.add('hidden');
    const c = els.countdown; c.classList.remove('hidden'); c.classList.toggle('go', n === 0);
    c.textContent = n === 0 ? 'GO!' : String(n);
    c.style.animation = 'none'; void c.offsetWidth; c.style.animation = '';
  }
  function hideCenter() { els.countdown.classList.add('hidden'); els.goalbanner.classList.add('hidden'); els.bigmsg.classList.add('hidden'); }
  function showGoal(team, scorer, kph, ownGoal) {
    hideCenter();
    const g = els.goalbanner; g.classList.remove('hidden');
    const t = g.querySelector('.g'); t.className = 'g ' + (team === 0 ? 'blue' : 'orange'); t.textContent = 'GOAL!';
    g.querySelector('.who').textContent = (ownGoal ? 'OWN GOAL • ' : '') + scorer;
    g.querySelector('.spd').textContent = Math.round(kph) + ' KPH';
    g.style.animation = 'none'; void g.offsetWidth; g.style.animation = '';
  }
  function goalFlash(team) {
    let f = document.getElementById('goalflash');
    if (!f) { f = document.createElement('div'); f.id = 'goalflash'; document.body.appendChild(f); }
    f.className = team === 0 ? 'blue' : 'orange';
    f.style.animation = 'none'; void f.offsetWidth; f.style.animation = '';
  }
  function showBig(text, sub, cls) {
    hideCenter();
    const b = els.bigmsg; b.classList.remove('hidden'); b.className = cls || '';
    b.innerHTML = text + (sub ? '<small>' + sub + '</small>' : '');
  }
  function setReplay(on, scorerName, team, timeStr) {
    els.replaytag.classList.toggle('hidden', !on); els.skiphint.classList.toggle('hidden', !on); els.replaybar.classList.toggle('hidden', !on);
    if (on) { const n = $('rbname'); n.textContent = scorerName; n.className = 'n ' + (team === 0 ? 'blue' : 'orange'); $('rbtext').textContent = 'GOAL'; $('rbtime').textContent = timeStr; }
    els.ballcam.classList.toggle('hidden', on); $('boostwrap').classList.toggle('hidden', on);
  }
  function popup(points, label) {
    const d = document.createElement('div'); d.className = 'p'; d.innerHTML = '<b>+' + points + '</b>' + label;
    els.popups.appendChild(d); popupCount++;
    setTimeout(() => { d.remove(); }, 2200);
    while (els.popups.children.length > 5) els.popups.firstChild.remove();
  }
  // nameplates
  const _v = new THREE.Vector3();
  function clearPlates() { for (const [, el] of plates) el.remove(); plates.clear(); }
  function updatePlates(cars, player, camera, w, h) {
    for (const car of cars) {
      let el = plates.get(car);
      if (!el) {
        el = document.createElement('div'); el.className = 'nameplate ' + (car.team === 0 ? 'blue' : 'orange');
        el.innerHTML = '<span class="nm">' + car.name + '</span>' + (car.team === player.team ? '<span class="bb"><i></i></span>' : '');
        els.plates.appendChild(el); plates.set(car, el);
      }
      if (car === player || car.demolished) { el.style.display = 'none'; continue; }
      _v.copy(car.pos); _v.z += 95;
      const d = _v.distanceTo(camera.position);
      _v.project(camera);
      if (_v.z > 1 || Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1) { el.style.display = 'none'; continue; }
      el.style.display = '';
      const sx = (_v.x * 0.5 + 0.5) * w, sy = (-_v.y * 0.5 + 0.5) * h;
      const scale = U.clamp(1.15 - d / 6000, 0.55, 1.0);
      el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%,-100%) scale(${scale.toFixed(3)})`;
      if (car.team === player.team) { const bar = el.querySelector('.bb i'); if (bar) bar.style.width = car.boost + '%'; }
    }
  }
  function renderScoreboard(cars, player, score) {
    let html = '';
    for (const team of [0, 1]) {
      const list = cars.filter((c) => c.team === team).sort((a, b) => b.stats.score - a.stats.score);
      html += `<div class="team ${team === 0 ? 'blue' : 'orange'}"><div class="hdr"><span class="tn">${RL.TEAM_NAME[team]}</span><span class="ts">${score[team]}</span></div><table><tr><th>PLAYER</th><th>SCORE</th><th>GOALS</th><th>ASSISTS</th><th>SAVES</th><th>SHOTS</th></tr>`;
      for (const c of list) html += `<tr class="${c === player ? 'me' : ''}"><td>${c.name}</td><td>${c.stats.score}</td><td>${c.stats.goals}</td><td>${c.stats.assists}</td><td>${c.stats.saves}</td><td>${c.stats.shots}</td></tr>`;
      html += '</table></div>';
    }
    els.scoreboard.innerHTML = html;
  }
  function showScoreboard(on) { els.scoreboard.classList.toggle('hidden', !on); }
  function showEnd(buttons) {
    els.endpanel.classList.remove('hidden');
    els.endpanel.innerHTML = '<div class="btns">' + buttons.map((b, i) => `<button class="btn ${b.cls || ''}" data-i="${i}"><span>${b.label}</span></button>`).join('') + '</div>';
    els.endpanel.querySelectorAll('button').forEach((btn) => { btn.onclick = () => { RL.Audio.ui('select'); buttons[+btn.dataset.i].action(); }; btn.onmouseenter = () => RL.Audio.ui('hover'); });
    els.endpanel.style.pointerEvents = 'auto';
  }
  function hideEnd() { els.endpanel.classList.add('hidden'); els.endpanel.innerHTML = ''; }
  function showPause(items) {
    els.pause.classList.remove('hidden');
    els.pauselist.innerHTML = items.map((it, i) => `<div class="mitem ${i === 0 ? 'sel' : ''}" data-i="${i}">${it.label}</div>`).join('');
    els.pauselist.querySelectorAll('.mitem').forEach((el) => { el.onclick = () => { RL.Audio.ui('select'); items[+el.dataset.i].action(); }; el.onmouseenter = () => { els.pauselist.querySelectorAll('.mitem').forEach((e) => e.classList.remove('sel')); el.classList.add('sel'); RL.Audio.ui('hover'); }; });
    els.pause._items = items;
  }
  function hidePause() { els.pause.classList.add('hidden'); }
  function pauseNav(dir) {
    const items = els.pauselist.querySelectorAll('.mitem'); if (!items.length) return;
    let idx = [...items].findIndex((e) => e.classList.contains('sel')); idx = (idx + dir + items.length) % items.length;
    items.forEach((e) => e.classList.remove('sel')); items[idx].classList.add('sel'); RL.Audio.ui('hover');
  }
  function pauseAccept() { const items = els.pauselist.querySelectorAll('.mitem'); const sel = [...items].find((e) => e.classList.contains('sel')); if (sel) { RL.Audio.ui('select'); els.pause._items[+sel.dataset.i].action(); } }
  function resetShown() { boostShown = -1; timeShown = ''; blueShown = -1; orangeShown = -1; }
  return { init, show, hide, setScore, setTime, setBoost, setBallCam, showCountdown, hideCenter, showGoal, goalFlash, showBig, setReplay, popup, updatePlates, clearPlates, renderScoreboard, showScoreboard, showEnd, hideEnd, showPause, hidePause, pauseNav, pauseAccept, resetShown };
})();
