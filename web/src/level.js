// Builds a three.js scene from an exported level, and the collision data the
// player moves against. Level geometry is MuJoCo world space:
//   x right, y "north", z up, half-extents, one cell = xy_scale (2.0).
// three.js is y-up, so we map  (mx, my, mz) -> (mx, mz, -my).
import * as THREE from '../vendor/three.module.js';
import { RENDER } from './config.js';

const texLoader = new THREE.TextureLoader();
const texCache = new Map();

function texture(name, repeatU, repeatV) {
  const key = `${name}|${repeatU.toFixed(3)}|${repeatV.toFixed(3)}`;
  let tex = texCache.get(key);
  if (!tex) {
    tex = texLoader.load(`assets/textures/${name}.png`);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatU, repeatV);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    texCache.set(key, tex);
  }
  return tex;
}

function wallMaterials(sx, sy, sz, texName) {
  // MJCF texturing planes use texrepeat = extent / xy_scale, i.e. one tile per
  // maze cell. BoxGeometry face order: +x, -x, +y, -y, +z, -z (three space).
  const faces = [
    [sy, sz], [sy, sz], // +x / -x  (span world y, z)
    [sx, sy], [sx, sy], // +y / -y  (top / bottom: span world x, y)
    [sx, sz], [sx, sz], // +z / -z  (span world x, z)
  ];
  return faces.map(([u, v]) => new THREE.MeshLambertMaterial({
    map: texName ? texture(texName, u, v) : null,
    color: texName ? 0xffffff : 0x8a8a8a,
  }));
}

export function buildLevel(data) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(RENDER.background);
  scene.fog = new THREE.Fog(RENDER.background, RENDER.fogNear, RENDER.fogFar);

  // Flat-ish lighting, similar to MuJoCo's headlight look.
  scene.add(new THREE.AmbientLight(0xffffff, 1.35));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(0.4, 1, 0.25);
  scene.add(key);
  const fill = new THREE.HemisphereLight(0x8899bb, 0x201a14, 0.5);
  scene.add(fill);

  // Ground (below the textured floor tiles, catches any gap).
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshLambertMaterial({ color: 0x0a0d12 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  scene.add(ground);

  for (const f of data.floors) {
    const [sx, sy] = f.size;
    const mat = new THREE.MeshLambertMaterial({
      map: f.tex ? texture(f.tex, f.texrepeat[0], f.texrepeat[1]) : null,
      color: f.tex ? 0xffffff : 0x27405a,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2 * sx, 2 * sy), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(f.pos[0], 0.0, -f.pos[1]);
    scene.add(mesh);
  }

  const boxes = [];
  for (const w of data.walls) {
    const [sx, sy, sz] = w.size;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(2 * sx, 2 * sz, 2 * sy),
      wallMaterials(sx, sy, sz, w.tex));
    mesh.position.set(w.pos[0], w.pos[2], -w.pos[1]);
    scene.add(mesh);
    // Collision AABB in maze coordinates (x, y), z is irrelevant: walls are
    // taller than the walker and the floor is flat.
    boxes.push({
      minX: w.pos[0] - sx, maxX: w.pos[0] + sx,
      minY: w.pos[1] - sy, maxY: w.pos[1] + sy,
    });
  }

  const targets = data.targets.map((t, i) => {
    const color = new THREE.Color(t.color[0], t.color[1], t.color[2]);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(t.radius, 32, 24),
      new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.22 }));
    mesh.position.set(t.pos[0], t.pos[2], -t.pos[1]);
    scene.add(mesh);
    return { index: i, x: t.pos[0], y: t.pos[1], radius: t.radius, color, mesh, hex: `#${color.getHexString()}` };
  });

  return { scene, data, boxes, targets, spawns: data.spawns };
}

export async function loadLevelIndex() {
  const res = await fetch('levels/index.json');
  if (!res.ok) throw new Error('levels/index.json missing - run tools/export.sh');
  return (await res.json()).levels;
}

export async function loadLevel(file) {
  const res = await fetch(`levels/${file}`);
  if (!res.ok) throw new Error(`cannot load level ${file}`);
  return buildLevel(await res.json());
}
