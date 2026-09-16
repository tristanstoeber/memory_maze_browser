// Episode rules, ported from MemoryMazeTask: one target of a given colour is
// active at a time, touching it scores +1 and picks a new random target (never
// the one you are standing on), the maze never changes, the episode ends when
// the clock runs out.
import { PHYS } from './config.js';
import { Player } from './player.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Game {
  constructor(level, settings, { seed = Date.now(), timeScale = 1 } = {}) {
    this.level = level;
    this.settings = settings;
    this.rng = mulberry32(seed);
    this.player = new Player();
    this.duration = level.data.time_limit * timeScale;
    this.reset();
  }

  reset() {
    this.player.spawn(this.level, this.rng);
    this.score = 0;
    this.elapsed = 0;
    this.finished = false;
    this.path = [[this.player.x, this.player.y]];
    this._pathClock = 0;
    this.currentTarget = this.pickTarget(-1);
  }

  pickTarget(previous) {
    const n = this.level.targets.length;
    const eligible = [];
    for (let i = 0; i < n; i++) {
      if (i === previous) continue;
      const t = this.level.targets[i];
      // Skip a target the player is already touching, like _pick_new_target().
      if (Math.hypot(this.player.x - t.x, this.player.y - t.y) <= PHYS.targetTouch) continue;
      eligible.push(i);
    }
    const pool = eligible.length ? eligible : [...Array(n).keys()];
    return pool[Math.floor(this.rng() * pool.length)];
  }

  get target() { return this.level.targets[this.currentTarget]; }
  get remaining() { return Math.max(0, this.duration - this.elapsed); }

  update(dt, input) {
    if (this.finished) return null;
    this.player.update(dt, input, this.level, this.settings.classicControls);

    this.elapsed += dt;
    this._pathClock += dt;
    if (this._pathClock >= 0.25) {
      this._pathClock = 0;
      this.path.push([this.player.x, this.player.y]);
    }

    let event = null;
    const t = this.target;
    if (Math.hypot(this.player.x - t.x, this.player.y - t.y) <= PHYS.targetTouch) {
      this.score += 1;
      this.currentTarget = this.pickTarget(this.currentTarget);
      event = 'collect';
    }
    if (this.elapsed >= this.duration) {
      this.finished = true;
      event = 'end';
    }
    return event;
  }
}
