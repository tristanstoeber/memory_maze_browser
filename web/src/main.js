import * as THREE from '../vendor/three.module.js';
import { PHYS, RENDER, DEFAULT_SETTINGS, SETTINGS_KEY, SCORES_KEY, HUMAN_BASELINE } from './config.js';
import { loadLevel, loadLevelIndex } from './level.js';
import { Game } from './game.js';
import { Input } from './input.js';
import { drawMinimap } from './minimap.js';

const $ = (id) => document.getElementById(id);
const canvas = $('view');

const settings = { ...DEFAULT_SETTINGS, ...readJSON(SETTINGS_KEY, {}) };
const scores = readJSON(SCORES_KEY, {});

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
const camera = new THREE.PerspectiveCamera(PHYS.fovY, 1, 0.05, 120);
camera.rotation.order = 'YXZ';
const eye = new THREE.Vector3();

const input = new Input(canvas, settings);
input.onEscape = () => { if (state === 'play') pause(); };

let levelIndex = [];
let level = null;
let game = null;
let state = 'menu'; // menu | play | paused | end
let selected = { size: '9x9', seed: 1, timeScale: 1, practice: false };
let lastTime = performance.now();
let mapClock = 0;

// ---------------------------------------------------------------- boot

init().catch((err) => {
  $('menuError').textContent = String(err.message || err);
  $('menuError').hidden = false;
});

async function init() {
  levelIndex = await loadLevelIndex();
  buildSizeCards();
  bindUI();
  applySettingsToUI();
  resize();
  window.addEventListener('resize', resize);
  requestAnimationFrame(frame);
  applyDeepLink();
}

// ?size=13x13&maze=4&start=1 links straight to one maze, so a particular maze
// can be shared or replayed.
function applyDeepLink() {
  const q = new URLSearchParams(location.search);
  const size = q.get('size');
  if (size && levelIndex.some((l) => l.size === size)) selectSize(size);
  const maze = q.get('maze');
  if (maze && [...$('levelSelect').options].some((o) => o.value === maze)) $('levelSelect').value = maze;
  if (q.get('short') === '1') { $('timeSelect').value = '0.25'; selected.timeScale = 0.25; }
  if (q.get('practice') === '1') { $('practiceToggle').checked = true; selected.practice = true; }
  if (q.get('retro') === '1') { settings.retro = true; $('retroToggle').checked = true; resize(); }
  if (q.get('classic') === '1') { settings.classicControls = true; $('classicToggle').checked = true; }
  if (q.get('start') === '1') start();
}

// ---------------------------------------------------------------- menu

function buildSizeCards() {
  const sizes = [...new Set(levelIndex.map((l) => l.size))];
  const grid = $('sizeGrid');
  grid.innerHTML = '';
  for (const size of sizes) {
    const meta = levelIndex.find((l) => l.size === size);
    const best = scores[size]?.best ?? 0;
    const card = document.createElement('button');
    card.className = 'card';
    card.dataset.size = size;
    card.innerHTML = `
      <span class="card-size">${size}</span>
      <span class="card-meta">${meta.n_targets} objects · ${fmtTime(meta.time_limit)}</span>
      <span class="card-stat">best <b>${best}</b> · human ${HUMAN_BASELINE[size] ?? '–'}</span>`;
    card.addEventListener('click', () => selectSize(size));
    grid.appendChild(card);
  }
  selectSize(selected.size in HUMAN_BASELINE ? selected.size : sizes[0]);
}

function selectSize(size) {
  selected.size = size;
  for (const card of $('sizeGrid').children) card.classList.toggle('on', card.dataset.size === size);
  const levels = levelIndex.filter((l) => l.size === size);
  const sel = $('levelSelect');
  sel.innerHTML = '<option value="random">Random maze</option>' +
    levels.map((l) => `<option value="${l.seed}">Maze ${l.seed}</option>`).join('');
  sel.value = 'random';
}

function bindUI() {
  $('startBtn').addEventListener('click', start);
  $('resumeBtn').addEventListener('click', resume);
  $('quitBtn').addEventListener('click', toMenu);
  $('againBtn').addEventListener('click', start);
  $('endMenuBtn').addEventListener('click', toMenu);
  $('timeSelect').addEventListener('change', (e) => { selected.timeScale = parseFloat(e.target.value); });
  $('practiceToggle').addEventListener('change', (e) => { selected.practice = e.target.checked; });
  $('classicToggle').addEventListener('change', (e) => saveSetting('classicControls', e.target.checked));
  $('retroToggle').addEventListener('change', (e) => { saveSetting('retro', e.target.checked); resize(); });
  $('invertToggle').addEventListener('change', (e) => saveSetting('invertY', e.target.checked));
  $('sensRange').addEventListener('input', (e) => saveSetting('mouseSensitivity', parseFloat(e.target.value)));
  canvas.addEventListener('click', () => { if (state === 'play') input.requestLock(); });
}

function applySettingsToUI() {
  $('classicToggle').checked = settings.classicControls;
  $('retroToggle').checked = settings.retro;
  $('invertToggle').checked = settings.invertY;
  $('sensRange').value = settings.mouseSensitivity;
}

// ---------------------------------------------------------------- episode

async function start() {
  const choice = $('levelSelect').value;
  const pool = levelIndex.filter((l) => l.size === selected.size);
  const entry = choice === 'random'
    ? pool[Math.floor(Math.random() * pool.length)]
    : pool.find((l) => String(l.seed) === choice);
  selected.seed = entry.seed;

  setState('loading');
  level = await loadLevel(entry.file);
  game = new Game(level, settings, { timeScale: selected.timeScale });
  mapClock = 1; // draw the practice map on the first frame
  setState('play');
  input.requestLock();
  lastTime = performance.now();
}

function pause() {
  if (state !== 'play') return;
  setState('paused');
  input.releaseLock();
}

function resume() {
  if (state !== 'paused') return;
  setState('play');
  input.requestLock();
  lastTime = performance.now();
}

function toMenu() {
  setState('menu');
  input.releaseLock();
  level = null; game = null;
  buildSizeCards();
}

function finish() {
  setState('end');
  input.releaseLock();
  const scored = selected.timeScale === 1 && !selected.practice;
  const rec = scores[selected.size] || { best: 0, played: 0 };
  rec.played += 1;
  let isBest = false;
  if (scored && game.score > rec.best) { rec.best = game.score; isBest = true; }
  scores[selected.size] = rec;
  writeJSON(SCORES_KEY, scores);

  $('endScore').textContent = game.score;
  $('endTitle').textContent = isBest ? 'New personal best' : 'Time';
  $('endNote').innerHTML = scored
    ? `${selected.size} maze ${selected.seed} · your best <b>${rec.best}</b> · human mean ${HUMAN_BASELINE[selected.size] ?? '–'}`
    : `${selected.size} maze ${selected.seed} · unranked run (${selected.practice ? 'practice' : 'short timer'})`;
  drawMinimap($('endMap'), level, { path: game.path, player: game.player, current: -1 });
}

// ---------------------------------------------------------------- loop

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  if (state === 'play' && game) {
    const cmd = input.sample(settings.classicControls);
    const event = game.update(dt, cmd);
    if (event === 'collect') { blip(880, 0.09); flashBorder(); }
    if (event === 'end') { blip(180, 0.5); finish(); }
    updateHud(dt);
  }
  if (level && (state === 'play' || state === 'paused')) {
    const p = game.player;
    p.eye(eye);
    camera.position.copy(eye);
    camera.rotation.set(p.pitch + PHYS.basePitch, p.yaw - Math.PI / 2, 0);
    renderer.render(level.scene, camera);
  }
}

function updateHud(dt) {
  const t = game.target;
  $('hudScore').textContent = game.score;
  $('hudTime').textContent = fmtTime(game.remaining);
  const border = $('border');
  border.style.borderColor = `rgb(${t.color.r * 255 * 0.7 | 0},${t.color.g * 255 * 0.7 | 0},${t.color.b * 255 * 0.7 | 0})`;
  $('hudSwatch').style.background = t.hex;

  if (selected.practice) {
    mapClock += dt;
    if (mapClock > 0.12) {
      mapClock = 0;
      drawMinimap($('practiceMap'), level, { player: game.player, current: game.currentTarget });
    }
  }
}

function flashBorder() {
  const b = $('border');
  b.classList.remove('flash');
  void b.offsetWidth;
  b.classList.add('flash');
}

// ---------------------------------------------------------------- plumbing

function setState(next) {
  state = next;
  $('menu').hidden = next !== 'menu';
  $('pause').hidden = next !== 'paused';
  $('end').hidden = next !== 'end';
  $('hud').hidden = !(next === 'play' || next === 'paused');
  $('border').hidden = !(next === 'play' || next === 'paused');
  $('loading').hidden = next !== 'loading';
  $('practiceMap').hidden = !(selected.practice && (next === 'play' || next === 'paused'));
  document.body.classList.toggle('playing', next === 'play');
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  if (settings.retro) {
    const n = RENDER.retroSize;
    renderer.setPixelRatio(1);
    renderer.setSize(n, n, false);
    camera.aspect = 1;
    canvas.classList.add('retro');
    document.body.classList.add('retro');
  } else {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    canvas.classList.remove('retro');
    document.body.classList.remove('retro');
  }
  camera.updateProjectionMatrix();
}

let audio = null;
function blip(freq, dur) {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audio.createOscillator(), gain = audio.createGain();
    osc.frequency.value = freq;
    osc.type = 'triangle';
    gain.gain.setValueAtTime(0.14, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + dur);
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + dur);
  } catch (e) { /* audio is a nicety */ }
}

function fmtTime(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function saveSetting(key, value) {
  settings[key] = value;
  writeJSON(SETTINGS_KEY, settings);
}

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (e) { return fallback; }
}
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
}

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
