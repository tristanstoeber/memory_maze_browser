# Memory Maze — browser port

[Memory Maze](https://github.com/jurgisp/memory-maze) as a game you can just play:
a static web page, no server, no Python at runtime. Levels are generated once by
the real dm_control/MuJoCo environment and exported to JSON; the browser rebuilds
that exact geometry in three.js and reimplements the walker and the task rules.

```sh
./serve.sh            # http://localhost:8765/
```

Install it as an app from the browser ("Install" / "Add to Home Screen") — it is a
PWA and works offline after the first load.

## The game

You are dropped into a maze with a few coloured objects. The border of the screen
tells you which colour to find. Touch that object: +1, and a new colour is asked
for. The maze and the objects never move, so after one exploration you should be
able to go straight to any of them — that is the whole test. The clock is the same
as in the paper's human baseline (4:10 for 9×9 up to 16:40 for 15×15).

| Maze | Objects | Episode | Mean human score |
|---|---|---|---|
| 9×9 | 3 | 4:10 | 26.4 |
| 11×11 | 4 | 8:20 | 44.3 |
| 13×13 | 5 | 12:30 | 55.5 |
| 15×15 | 6 | 16:40 | 67.7 |

**Controls.** `W A S D` move, mouse looks (click to capture the pointer), `←` `→`
turn, `Esc` pauses. On a phone: left half of the screen moves, right half looks.
*Classic controls* in the options restricts you to forward + turn, which is exactly
what the RL agent gets. *Agent view* renders at 64×64 — the observation the agent
actually sees. *Practice* shows the map while you play (and marks the run unranked).

A specific maze can be linked directly:
`index.html?size=13x13&maze=4&start=1` (also `short=1`, `practice=1`, `retro=1`,
`classic=1`).

## Fidelity

Everything that can be exported from the original is exported rather than
reinvented: the maze layout, the wall boxes and their labmaze textures, the floor
tiles with their texture repeats, the object positions and colours, the spawn
points. `tools/export_levels.py` walks the MJCF that dm_control generates, so the
mazes are the real thing, and the wall/floor variation cues that make the mazes
memorable survive.

The walker is not MuJoCo. It is a damped-velocity first-person controller with
circle-vs-AABB collision, tuned to numbers measured from the Python environment
by stepping it (`repos/memory-maze`):

| | measured | in the port |
|---|---|---|
| forward speed | 2.00 units/s (1 cell/s) | `PHYS.maxSpeed` |
| turn rate | 73.6 °/s | `PHYS.turnRate` |
| walker radius | 0.20 (MJCF `shell`) | `PHYS.ballRadius` |
| eye height / pitch / fov | 0.90 / −5.7° / 80° | `PHYS.eyeHeight`, `basePitch`, `fovY` |
| object touch distance | 0.80 (0.2 + 0.6) | `PHYS.targetTouch` |
| episode length | 250–1000 s | from the level file |

What differs: no rigid-body dynamics (no bumping momentum off walls), lighting is
three.js rather than MuJoCo's headlight, and mouse-look plus strafing are additions
that the discrete 6-action environment does not have. **Scores here are therefore
not comparable to the published human baseline** — the baseline number is shown
only as something to aim at. For a comparable run, use classic controls and the
full episode length; for a strictly comparable one, use the Python GUI.

## Layout

```
tools/export_levels.py   walks the generated MJCF, writes levels + textures
tools/export.sh          runs the exporter in the memory-maze docker image
web/src/level.js         level JSON -> three.js scene + collision boxes
web/src/player.js        movement and collision
web/src/game.js          task rules: targets, scoring, timer
web/src/minimap.js       the post-episode map reveal
web/levels/*.json        48 exported mazes (12 per size), ~8 KB each
web/assets/textures/     labmaze wall/floor textures, straight from the package
web/test.html            self test: geometry, collision, autopilot scoring, timer
```

## Regenerating levels

Needs the `memory-maze` docker image (the Python env with MuJoCo):

```sh
docker build -t memory-maze:latest ../../repos/memory-maze
./tools/export.sh --seeds 12                  # all sizes, 12 mazes each
./tools/export.sh --sizes 9x9 --seeds 50      # more of one size
```

Each level is a self-contained JSON: wall boxes and floor tiles as MuJoCo
half-extents, object positions and colours, spawn points, and the maze character
grid (used for the map). Bump `CACHE` in `web/sw.js` after re-exporting so
installed copies pick the new levels up.

## Tests

`web/test.html` checks that levels load, that spawns are not inside walls, that the
player never ends up embedded in geometry, that a shortest-path autopilot scores at
a sane rate, and that the timer ends the episode. Open it in a browser, or:

```sh
./serve.sh &
google-chrome --headless=new --virtual-time-budget=60000 \
  --dump-dom http://localhost:8765/test.html | grep -E 'PASS|FAIL'
```

## Packaging

The PWA install is usually enough. For a store-style build, point a wrapper at
`web/` — it needs no build step:

- desktop: [Tauri](https://tauri.app) with `frontendDist: "../web"` (~5 MB binary)
- mobile: [Capacitor](https://capacitorjs.com) with `webDir: "web"`
- anywhere: copy `web/` to any static host

## Credits

Memory Maze is by Jurgis Pasukonis, Timothy Lillicrap and Danijar Hafner
([paper](https://arxiv.org/abs/2210.13383), MIT licence). The wall and floor
textures come from DeepMind's `labmaze` package (Apache 2.0) and are redistributed
here unmodified. three.js is MIT.
