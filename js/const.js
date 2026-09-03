// Rocket League physics constants (Unreal units: 1 uu ~ 1.9 cm). x = side, y = length (blue goal at -y), z = up.
window.RL = window.RL || {};
RL.C = {
  GRAVITY: 650,
  // arena
  ARENA_X: 4096, ARENA_Y: 5120, ARENA_Z: 2044,
  CORNER: 8064,            // |x|+|y| = 8064 corner planes
  GOAL_HALF_W: 892.755, GOAL_H: 642.775, GOAL_DEPTH: 880,
  GOAL_LINE: 5124.25,      // ball center beyond +radius => goal
  CURVE_R: 400,            // floor/wall rounding radius
  CURVE_R_TOP: 500,
  CORNER_K: 320,           // smooth-max radius at 45deg corners
  // ball
  BALL_R: 92.75, BALL_MASS: 30, BALL_REST: 0.6, BALL_MU: 2.0, BALL_DRAG: 0.0305,
  BALL_MAX_V: 6000, BALL_MAX_W: 6.0,
  // car
  CAR_MASS: 180, CAR_MAX_V: 2300, CAR_MAX_DRIVE: 1410, SUPERSONIC: 2200, SUPERSONIC_KEEP: 2100,
  CAR_MAX_W: 5.5, REST_Z: 17.01,
  HITBOX: { hx: 59.0037, hy: 42.0997, hz: 18.0795, ox: 13.8757, oy: 0, oz: 20.755 },
  THROTTLE_CURVE: [[0, 1600], [1400, 160], [1410, 0]],
  BRAKE: 3500, COAST: 525,
  BOOST_ACC_GROUND: 991.667, BOOST_ACC_AIR: 1058.333, BOOST_USE: 33.333, BOOST_MIN_T: 0.1,
  AIR_THROTTLE: 66.667,
  STICKY: 325,
  CURVATURE: [[0, 0.0069], [500, 0.00398], [1000, 0.00235], [1500, 0.001375], [1750, 0.0011], [2300, 0.00088]],
  JUMP_V: 291.667, JUMP_ACC: 1458.333, JUMP_MIN_T: 0.025, JUMP_MAX_T: 0.2, DJ_WINDOW: 1.25,
  FLIP_V: 500, FLIP_TORQUE_T: 0.65, FLIP_TIMEOUT: 0.95, FLIP_W: 6.6, FLIP_PITCHLOCK: 1.0,
  FLIP_ZDAMP_START: 0.15, FLIP_ZDAMP_END: 0.21, FLIP_ZDAMP: 0.35,
  AIR_T: { roll: 38.34, pitch: 12.46, yaw: 9.11 },
  AIR_D: { roll: 4.79, pitch: 2.876, yaw: 1.917 },
  CAR_WORLD_REST: 0.3, CAR_WORLD_MU: 0.3,
  CARCAR_REST: 0.1,
  BUMP_MIN_SPEED: 700,
  DEMO_RESPAWN: 3.0,
  // boost pads (x, y, big)
  PADS: [
    [0, -4240, 0], [-1792, -4184, 0], [1792, -4184, 0], [-3072, -4096, 1], [3072, -4096, 1],
    [-940, -3308, 0], [940, -3308, 0], [0, -2816, 0], [-3584, -2484, 0], [3584, -2484, 0],
    [-1788, -2300, 0], [1788, -2300, 0], [-2048, -1036, 0], [0, -1024, 0], [2048, -1036, 0],
    [-3584, 0, 1], [-1024, 0, 0], [1024, 0, 0], [3584, 0, 1],
    [-2048, 1036, 0], [0, 1024, 0], [2048, 1036, 0],
    [-1788, 2300, 0], [1788, 2300, 0], [-3584, 2484, 0], [3584, 2484, 0],
    [0, 2816, 0], [-940, 3308, 0], [940, 3308, 0],
    [-3072, 4096, 1], [3072, 4096, 1], [-1792, 4184, 0], [1792, 4184, 0], [0, 4240, 0]
  ],
  PAD_SMALL_R: 144, PAD_BIG_R: 208, PAD_SMALL_H: 165, PAD_BIG_H: 168,
  PAD_SMALL_AMT: 12, PAD_BIG_AMT: 100, PAD_SMALL_CD: 4, PAD_BIG_CD: 10,
  // kickoff spawns for blue (mirror for orange): x, y, yaw(rad)
  SPAWNS: [[-2048, -2560, 0.25 * Math.PI], [2048, -2560, 0.75 * Math.PI], [-256, -3840, 0.5 * Math.PI], [256, -3840, 0.5 * Math.PI], [0, -4608, 0.5 * Math.PI]],
  RESPAWNS: [[-2304, -4608, 0.5 * Math.PI], [2304, -4608, 0.5 * Math.PI], [-2688, -4608, 0.5 * Math.PI], [2688, -4608, 0.5 * Math.PI]],
  MATCH_SECONDS: 300,
  PHYS_HZ: 120
};
RL.TEAM = { BLUE: 0, ORANGE: 1 };
RL.TEAM_COLOR = ['#1f7fff', '#ff8a00'];
RL.TEAM_COLOR_DARK = ['#0d3b8c', '#a04a00'];
RL.TEAM_NAME = ['BLUE', 'ORANGE'];
