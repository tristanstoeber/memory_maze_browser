// First-person movement with damped velocity and circle-vs-AABB collision,
// standing in for the MuJoCo rolling-ball walker. Works in maze coordinates
// (x, y with y "north"); yaw 0 faces +x, increasing yaw turns left (+y).
import { PHYS } from './config.js';

export class Player {
  constructor() {
    this.x = 0; this.y = 0; this.yaw = 0; this.pitch = 0;
    this.vx = 0; this.vy = 0;  // world-frame velocity
    this.angVel = 0;
  }

  spawn(level, rng) {
    const spawns = level.spawns.length ? level.spawns : [[0, 0]];
    const s = spawns[Math.floor(rng() * spawns.length)];
    this.x = s[0]; this.y = s[1];
    this.yaw = rng() * Math.PI * 2;
    this.pitch = 0;
    this.vx = this.vy = 0;
    this.angVel = 0;
  }

  update(dt, input, level, classic) {
    // Turning: keys drive the steer joint, the mouse sets yaw directly.
    const turnTarget = input.turn * PHYS.turnRate;
    this.angVel += (turnTarget - this.angVel) * (1 - Math.exp(-dt / PHYS.turnTau));
    this.yaw += this.angVel * dt + input.mouseYaw;
    if (!classic) {
      this.pitch = Math.max(-PHYS.maxPitch, Math.min(PHYS.maxPitch, this.pitch + input.mousePitch));
    } else {
      this.pitch = 0;
    }

    // Desired velocity in the walker frame, then rotated into the world.
    let fwd = input.forward;
    if (fwd < 0) fwd *= PHYS.backFactor;
    const strafe = classic ? 0 : input.strafe * PHYS.strafeFactor;
    const len = Math.hypot(fwd, strafe);
    const scale = len > 1 ? 1 / len : 1;
    const cos = Math.cos(this.yaw), sin = Math.sin(this.yaw);
    const tx = (fwd * cos - strafe * sin) * PHYS.maxSpeed * scale;
    const ty = (fwd * sin + strafe * cos) * PHYS.maxSpeed * scale;

    const k = 1 - Math.exp(-dt / PHYS.accelTau);
    this.vx += (tx - this.vx) * k;
    this.vy += (ty - this.vy) * k;

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.resolveCollisions(level);
  }

  resolveCollisions(level) {
    const r = PHYS.ballRadius;
    for (let pass = 0; pass < 2; pass++) {
      let hit = false;
      for (const b of level.boxes) {
        const cx = Math.max(b.minX, Math.min(this.x, b.maxX));
        const cy = Math.max(b.minY, Math.min(this.y, b.maxY));
        let dx = this.x - cx, dy = this.y - cy;
        let d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        hit = true;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2);
          const push = (r - d) / d;
          this.x += dx * push; this.y += dy * push;
          // Kill the velocity component into the wall, keep the slide.
          const nx = dx / d, ny = dy / d;
          const vn = this.vx * nx + this.vy * ny;
          if (vn < 0) { this.vx -= vn * nx; this.vy -= vn * ny; }
        } else {
          // Centre inside the box: escape along the shallowest axis.
          const left = this.x - b.minX, right = b.maxX - this.x;
          const down = this.y - b.minY, up = b.maxY - this.y;
          const m = Math.min(left, right, down, up);
          if (m === left) this.x = b.minX - r;
          else if (m === right) this.x = b.maxX + r;
          else if (m === down) this.y = b.minY - r;
          else this.y = b.maxY + r;
          this.vx = this.vy = 0;
        }
      }
      if (!hit) break;
    }
  }

  // Eye position, matching the walker's camera offset.
  eye(out) {
    out.set(
      this.x + Math.cos(this.yaw) * PHYS.eyeForward,
      PHYS.eyeHeight,
      -(this.y + Math.sin(this.yaw) * PHYS.eyeForward));
    return out;
  }
}
