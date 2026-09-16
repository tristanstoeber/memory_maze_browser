"""Export memory-maze levels to JSON + PNG for the browser port.

Runs inside the `memory-maze` docker image (it needs mujoco/dm_control/labmaze).
See tools/export.sh.

For each (maze size, seed) it instantiates the real dm_control environment, lets
it generate the maze, and then walks the resulting MJCF to dump the actual
geometry: wall boxes, floor tiles, their labmaze textures, target spheres and
spawn points. The browser game rebuilds exactly that geometry, so levels look
and measure the same as the Python original.

Coordinates are MuJoCo world coordinates: x right, y "north", z up, one maze
cell = xy_scale = 2.0 units. Wall/floor `size` is a half-extent, as in MJCF.
"""

import argparse
import hashlib
import json
import os

import numpy as np

from memory_maze import tasks

SIZES = {
    '9x9': (tasks.memory_maze_9x9, 250),
    '11x11': (tasks.memory_maze_11x11, 500),
    '13x13': (tasks.memory_maze_13x13, 750),
    '15x15': (tasks.memory_maze_15x15, 1000),
}


def _texture_of(geom):
    """(texture_name, png_bytes, texrepeat) for a textured geom, or None."""
    mat = geom.material
    if mat is None or mat.texture is None:
        return None
    tex = mat.texture
    name = tex.file.prefix  # e.g. 'wall_yellow_d', stable across levels
    repeat = mat.texrepeat
    repeat = [1.0, 1.0] if repeat is None else [float(r) for r in repeat]
    return name, tex.file.contents, repeat


def _wall_texture(arena, wall_geom):
    """Walls are collision boxes; their skin lives on separate texturing planes."""
    for face in ('pos_x', 'pos_y', 'pos_z', 'neg_x', 'neg_y'):
        plane = arena.mjcf_model.worldbody.find('geom', f'{wall_geom.name}_texturing_{face}')
        if plane is not None:
            tex = _texture_of(plane)
            if tex is not None:
                return tex
    return None


def export_level(size_name, seed, textures):
    make_env, time_limit = SIZES[size_name]
    env = make_env(seed=seed)
    env.reset()
    task = env.task
    arena = task._maze_arena
    physics = env.physics
    xy_scale = float(arena._xy_scale)
    body_off = np.array(arena._maze_body.pos if arena._maze_body.pos is not None else [0, 0, 0], float)

    walls = []
    for g in arena._maze_body.geom:
        tex = _wall_texture(arena, g)
        if tex is not None:
            textures.setdefault(tex[0], tex[1])
        walls.append({
            'pos': (np.array(g.pos, float) + body_off).round(4).tolist(),
            'size': np.array(g.size, float).round(4).tolist(),
            'tex': tex[0] if tex else None,
        })

    floors = []
    for g in arena.mjcf_model.worldbody.geom:
        if not (g.name or '').startswith('floor'):
            continue
        tex = _texture_of(g)
        if tex is not None:
            textures.setdefault(tex[0], tex[1])
        floors.append({
            'pos': np.array(g.pos, float).round(4).tolist(),
            'size': np.array(g.size, float)[:2].round(4).tolist(),
            'tex': tex[0] if tex else None,
            'texrepeat': [round(r, 4) for r in tex[2]] if tex else [1.0, 1.0],
        })

    targets = []
    for i, t in enumerate(task._targets):
        targets.append({
            'pos': np.array(physics.bind(t.geom).xpos, float).round(4).tolist(),
            'color': np.array(task._target_colors[i], float).round(4).tolist(),
            'radius': float(task._target_radius),
        })

    entity = arena.maze.entity_layer
    variations = arena.maze.variations_layer

    return {
        'name': f'{size_name} #{seed}',
        'size': size_name,
        'seed': seed,
        'xy_scale': xy_scale,
        'wall_height': float(arena._z_height) if hasattr(arena, '_z_height') else 1.5,
        'time_limit': time_limit,
        'n_targets': int(task.n_targets),
        'walls': walls,
        'floors': floors,
        'targets': targets,
        'spawns': [np.array(p, float)[:2].round(4).tolist() for p in arena.spawn_positions],
        'grid': {
            'entity': [''.join(row) for row in np.asarray(entity)],
            'variations': [''.join(row) for row in np.asarray(variations)],
            # grid cell (row, col) -> world: x = (col - x_off) * s, y = -(row - y_off) * s
            'x_offset': float(arena._x_offset),
            'y_offset': float(arena._y_offset),
        },
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='web', help='web root to write levels/ and assets/ into')
    ap.add_argument('--sizes', default='9x9,11x11,13x13,15x15')
    ap.add_argument('--seeds', type=int, default=12, help='levels per size')
    ap.add_argument('--seed-start', type=int, default=1)
    args = ap.parse_args()

    levels_dir = os.path.join(args.out, 'levels')
    tex_dir = os.path.join(args.out, 'assets', 'textures')
    os.makedirs(levels_dir, exist_ok=True)
    os.makedirs(tex_dir, exist_ok=True)

    textures = {}
    index = []
    for size_name in args.sizes.split(','):
        for seed in range(args.seed_start, args.seed_start + args.seeds):
            level = export_level(size_name, seed, textures)
            fname = f'{size_name}_{seed:03d}.json'
            with open(os.path.join(levels_dir, fname), 'w') as f:
                json.dump(level, f, separators=(',', ':'))
            index.append({
                'file': fname,
                'size': size_name,
                'seed': seed,
                'n_targets': level['n_targets'],
                'time_limit': level['time_limit'],
            })
            print(f'  {fname}: {len(level["walls"])} walls, {len(level["targets"])} targets')

    for name, data in textures.items():
        path = os.path.join(tex_dir, f'{name}.png')
        with open(path, 'wb') as f:
            f.write(data)
    print(f'wrote {len(textures)} textures: {sorted(textures)}')

    with open(os.path.join(levels_dir, 'index.json'), 'w') as f:
        json.dump({'levels': index}, f, indent=1)
    print(f'wrote {len(index)} levels to {levels_dir}')


if __name__ == '__main__':
    main()
