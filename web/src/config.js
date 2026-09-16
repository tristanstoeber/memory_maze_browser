// Constants ported from the Python environment. The movement numbers were
// measured by stepping the real dm_control env (see README, "Fidelity"):
//   forward speed  2.00 world units/s   (= 1 maze cell per second)
//   turn rate      73.6 deg/s
//   walker ball    radius 0.20, egocentric camera at z=0.90, pitch -5.74, fovy 80
//   target sphere  radius 0.60, centre at ground level, touch at 0.80
const DEG = Math.PI / 180;

export const PHYS = {
  maxSpeed: 2.0,
  turnRate: 73.6 * DEG,
  // Time constants of the damped roll/steer joints (damping 5.0 / 20.0 in MJCF),
  // fitted to how fast the measured env reaches terminal speed.
  accelTau: 0.12,
  turnTau: 0.07,
  ballRadius: 0.2,
  eyeHeight: 0.9,
  eyeForward: 0.15,
  basePitch: -5.74 * DEG,
  fovY: 80,
  targetRadius: 0.6,
  // Contact distance walker-centre to target-centre: 0.2 + 0.6, plus MuJoCo's
  // contact slack. Measured activation happened at 0.788-0.81.
  targetTouch: 0.81,
  strafeFactor: 0.75, // modern controls only; the RL env has no strafe
  backFactor: 0.6,
  maxPitch: 35 * DEG,
};

export const RENDER = {
  fogNear: 6,
  fogFar: 26,
  background: 0x0c1016,
  retroSize: 64, // the resolution the RL agent actually sees
};

export const SETTINGS_KEY = 'mmb.settings';
export const SCORES_KEY = 'mmb.scores';

export const DEFAULT_SETTINGS = {
  classicControls: false, // true = forward + turn only, exactly like the env
  retro: false,           // render at 64x64 like the agent observation
  mouseSensitivity: 1.0,
  invertY: false,
};

// Human baselines from the paper, shown as a target to beat.
export const HUMAN_BASELINE = { '9x9': 26.4, '11x11': 44.3, '13x13': 55.5, '15x15': 67.7 };
