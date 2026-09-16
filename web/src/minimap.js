// Top-down reveal of the maze, drawn from the exported grid. Shown after the
// episode (and in practice mode), never during a scored run - the whole point
// of the task is that the map has to live in your head.
const WALL_COLORS = {
  '*': '#c9b458', '0': '#c9b458', '1': '#7fa8c9', '2': '#8bc98b',
  '3': '#c98b8b', '4': '#b28bc9', '5': '#c9a08b', '6': '#8bc9bd',
  '7': '#c98bb4', '8': '#a9c98b', '9': '#8b96c9',
};

export function drawMinimap(canvas, level, { path = [], player = null, targets = true, current = -1 } = {}) {
  const grid = level.data.grid;
  const rows = grid.entity.length, cols = grid.entity[0].length;
  const dpr = window.devicePixelRatio || 1;
  const box = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(box.width)), h = Math.max(1, Math.floor(box.height));
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const cell = Math.floor(Math.min(w / cols, h / rows));
  const ox = Math.floor((w - cell * cols) / 2);
  const oy = Math.floor((h - cell * rows) / 2);
  const s = level.data.xy_scale;
  const toPx = (x, y) => [
    ox + (x / s + grid.x_offset + 0.5) * cell,
    oy + (-y / s + grid.y_offset + 0.5) * cell,
  ];

  ctx.fillStyle = '#0c1016';
  ctx.fillRect(ox, oy, cell * cols, cell * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = grid.entity[r][c];
      const vr = grid.variations[r] ? grid.variations[r][c] : '.';
      if (WALL_COLORS[ch]) {
        ctx.fillStyle = WALL_COLORS[ch];
      } else {
        ctx.fillStyle = vr && vr !== '.' ? '#1b2b3d' : '#121a24';
      }
      ctx.fillRect(ox + c * cell, oy + r * cell, cell, cell);
    }
  }

  if (path.length > 1) {
    ctx.strokeStyle = 'rgba(255,255,255,0.32)';
    ctx.lineWidth = Math.max(1, cell * 0.12);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    path.forEach(([x, y], i) => {
      const [px, py] = toPx(x, y);
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    });
    ctx.stroke();
  }

  if (targets) {
    level.targets.forEach((t, i) => {
      const [px, py] = toPx(t.x, t.y);
      ctx.beginPath();
      ctx.arc(px, py, cell * 0.36, 0, Math.PI * 2);
      ctx.fillStyle = t.hex;
      ctx.fill();
      if (i === current) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = Math.max(1.5, cell * 0.12);
        ctx.stroke();
      }
    });
  }

  if (player) {
    const [px, py] = toPx(player.x, player.y);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-player.yaw);
    ctx.beginPath();
    ctx.moveTo(cell * 0.45, 0);
    ctx.lineTo(-cell * 0.3, cell * 0.28);
    ctx.lineTo(-cell * 0.3, -cell * 0.28);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
  }
}
