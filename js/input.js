// Keyboard + mouse + gamepad input mapped to Rocket League controls.
window.RL = window.RL || {};
RL.Input = (function () {
  const keys = {};
  const state = { throttle: 0, steer: 0, pitch: 0, yaw: 0, roll: 0, jump: false, boost: false, handbrake: false, rear: false, anyGamepad: false };
  const edges = { ballCam: false, pause: false, scoreboard: false, skip: false, any: false, menuUp: false, menuDown: false, menuLeft: false, menuRight: false, menuAccept: false, menuBack: false };
  let mouseButtons = 0;
  let padPrev = {};
  const binds = {
    throttle: ['KeyW', 'ArrowUp'], reverse: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
    jump: ['Space'], boost: ['ShiftLeft', 'ShiftRight'], handbrake: ['ControlLeft', 'ControlRight', 'KeyX'], rollLeft: ['KeyQ'], rollRight: ['KeyE'],
    ballCam: ['KeyY', 'KeyC'], rear: ['KeyR'], pause: ['Escape'], scoreboard: ['Tab'], skip: ['Enter', 'Space', 'KeyF']
  };
  RL.KEY_LABELS = { ballCam: 'Y', boost: 'SHIFT', jump: 'SPACE', handbrake: 'CTRL', rear: 'R', airRoll: 'Q / E' };
  const down = (list) => list.some((k) => keys[k]);
  function init() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) { if (['Tab', 'Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault(); return; }
      keys[e.code] = true;
      if (binds.ballCam.includes(e.code)) edges.ballCam = true;
      if (binds.pause.includes(e.code)) edges.pause = true;
      if (binds.scoreboard.includes(e.code)) edges.scoreboard = true;
      if (binds.skip.includes(e.code)) edges.skip = true;
      if (e.code === 'ArrowUp' || e.code === 'KeyW') edges.menuUp = true;
      if (e.code === 'ArrowDown' || e.code === 'KeyS') edges.menuDown = true;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') edges.menuLeft = true;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') edges.menuRight = true;
      if (e.code === 'Enter' || e.code === 'Space') edges.menuAccept = true;
      if (e.code === 'Escape' || e.code === 'Backspace') edges.menuBack = true;
      edges.any = true;
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { keys[e.code] = false; });
    window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseButtons = 0; });
    window.addEventListener('mousedown', (e) => { if (e.target && e.target.closest && e.target.closest('.ui')) return; mouseButtons |= (1 << e.button); if (e.button === 2) edges.any = true; });
    window.addEventListener('mouseup', (e) => { mouseButtons &= ~(1 << e.button); });
    window.addEventListener('contextmenu', (e) => { if (!(e.target && e.target.closest && e.target.closest('.ui'))) e.preventDefault(); });
  }
  function dz(v, d) { d = d || 0.14; const a = Math.abs(v); if (a < d) return 0; return Math.sign(v) * (a - d) / (1 - d); }
  function pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null; for (const p of pads) if (p && p.connected) { gp = p; break; }
    state.anyGamepad = !!gp;
    if (!gp) return null;
    const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    const val = (i) => (gp.buttons[i] ? gp.buttons[i].value : 0);
    const out = {
      steer: dz(gp.axes[0] || 0), pitch: dz(gp.axes[1] || 0),
      throttle: val(7) - val(6), jump: b(0), boost: b(1), handbrake: b(2), ballCam: b(3), rollLeft: b(4), rollRight: b(5), pause: b(9), scoreboard: b(8), rear: b(10) || b(11),
      dUp: b(12), dDown: b(13), dLeft: b(14), dRight: b(15)
    };
    // edges
    const edge = (k) => out[k] && !padPrev[k];
    if (edge('ballCam')) edges.ballCam = true;
    if (edge('pause')) { edges.pause = true; edges.menuBack = true; }
    if (edge('scoreboard')) edges.scoreboard = true;
    if (edge('jump')) { edges.skip = true; edges.menuAccept = true; edges.any = true; }
    if (edge('boost')) { edges.menuBack = true; }
    if (edge('dUp') || (dz(gp.axes[1]) < -0.6 && !(padPrev.stickY < -0.6))) edges.menuUp = true;
    if (edge('dDown') || (dz(gp.axes[1]) > 0.6 && !(padPrev.stickY > 0.6))) edges.menuDown = true;
    if (edge('dLeft') || (dz(gp.axes[0]) < -0.6 && !(padPrev.stickX < -0.6))) edges.menuLeft = true;
    if (edge('dRight') || (dz(gp.axes[0]) > 0.6 && !(padPrev.stickX > 0.6))) edges.menuRight = true;
    padPrev = Object.assign({}, out, { stickX: dz(gp.axes[0]), stickY: dz(gp.axes[1]) });
    return out;
  }
  function update() {
    const gp = pollGamepad();
    let throttle = (down(binds.throttle) ? 1 : 0) - (down(binds.reverse) ? 1 : 0);
    let steer = (down(binds.right) ? 1 : 0) - (down(binds.left) ? 1 : 0);
    let pitch = -throttle; // W pushes the nose down in the air
    let roll = (down(binds.rollRight) ? 1 : 0) - (down(binds.rollLeft) ? 1 : 0);
    let jump = down(binds.jump) || !!(mouseButtons & 2);
    let boost = down(binds.boost) || !!(mouseButtons & 1);
    let handbrake = down(binds.handbrake);
    let rear = down(binds.rear);
    if (gp) {
      if (Math.abs(gp.throttle) > 0.02) throttle = U_clamp(gp.throttle);
      if (Math.abs(gp.steer) > 0.02) steer = gp.steer;
      if (Math.abs(gp.pitch) > 0.02) pitch = gp.pitch;
      if (gp.rollLeft) roll = -1; if (gp.rollRight) roll = 1;
      jump = jump || gp.jump; boost = boost || gp.boost; handbrake = handbrake || gp.handbrake; rear = rear || gp.rear;
    }
    state.throttle = throttle; state.steer = steer; state.pitch = pitch; state.roll = roll;
    state.jump = jump; state.boost = boost; state.handbrake = handbrake; state.rear = rear;
    // air roll: while powerslide is held, steer becomes roll (RL default behavior)
    if (handbrake && roll === 0) { state.roll = steer; state.yaw = 0; } else state.yaw = steer;
  }
  function U_clamp(v) { return v < -1 ? -1 : v > 1 ? 1 : v; }
  function applyTo(car) {
    const i = car.input;
    i.throttle = state.throttle; i.steer = state.steer; i.pitch = state.pitch; i.yaw = state.yaw; i.roll = state.roll;
    i.jump = state.jump; i.boost = state.boost; i.handbrake = state.handbrake;
  }
  function consume(name) { const v = edges[name]; edges[name] = false; return v; }
  function clearEdges() { for (const k in edges) edges[k] = false; }
  function isDown(code) { return !!keys[code]; }
  return { init, update, applyTo, consume, clearEdges, state, isDown, binds };
})();
