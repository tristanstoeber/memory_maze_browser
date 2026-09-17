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

// ---------------------------------------------------------------- auth

const GOOGLE_CLIENT_ID = '866673679689-pevk4clk9ogt1ap6nnen6b1uaqb0m81v.apps.googleusercontent.com';
const APPS_SCRIPT_URL = localStorage.getItem('mmb_apps_script_url') || 'https://script.google.com/macros/s/AKfycbzxr6XSGg8OXWeEjstLUSDUVTrm19uVor7m-1KJOHiJf-JPl5oNtkEZ4slvhXf_5ZHx/exec';
let signedInUser = null;

function decodeJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error('Failed to decode JWT', e);
    return null;
  }
}

function updateAuthUI() {
  const startBtn = $('startBtn');
  const authNote = $('authNote');
  const playerInfo = $('playerInfo');
  const playerGreeting = $('playerGreeting');
  const gBtn = $('g_id_signin');

  if (signedInUser) {
    if (gBtn) gBtn.hidden = true;
    if (authNote) authNote.hidden = true;
    if (playerInfo) playerInfo.hidden = false;
    if (playerGreeting) playerGreeting.textContent = `Signed in as: ${signedInUser.name}`;
    if (startBtn) startBtn.disabled = false;
  } else {
    if (gBtn) gBtn.hidden = false;
    if (authNote) {
      authNote.textContent = 'Sign in with Google to play.';
      authNote.hidden = false;
    }
    if (playerInfo) playerInfo.hidden = true;
    if (startBtn) startBtn.disabled = true;
  }
}

async function hashId(rawId) {
  const encoder = new TextEncoder();
  const data = encoder.encode('mm_salt_study_' + rawId);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return 'p_' + hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

async function handleCredentialResponse(response) {
  const payload = decodeJwt(response.credential);
  if (!payload) return;
  const pseudonym = await hashId(payload.sub);
  signedInUser = {
    pseudonym: pseudonym,
    name: payload.name || 'Participant',
  };
  try {
    sessionStorage.setItem('mm_user', JSON.stringify(signedInUser));
  } catch (_) {}
  updateAuthUI();
}

function signOut() {
  signedInUser = null;
  try {
    sessionStorage.removeItem('mm_user');
  } catch (_) {}
  if (window.google?.accounts?.id) {
    google.accounts.id.disableAutoSelect();
  }
  updateAuthUI();
  setupGoogleBtn();
}

function setupGoogleBtn() {
  if (!window.google?.accounts?.id) return;
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleCredentialResponse,
  });
  const container = $('g_id_signin');
  if (container) {
    container.innerHTML = '';
    google.accounts.id.renderButton(container, {
      theme: 'filled_blue',
      size: 'large',
      shape: 'rectangular',
      text: 'signin_with',
    });
  }
}

function initAuth() {
  try {
    const saved = sessionStorage.getItem('mm_user');
    if (saved) signedInUser = JSON.parse(saved);
  } catch (_) {}

  $('signOutBtn')?.addEventListener('click', signOut);
  updateAuthUI();

  if (window.google?.accounts?.id) {
    setupGoogleBtn();
  } else {
    const timer = setInterval(() => {
      if (window.google?.accounts?.id) {
        clearInterval(timer);
        setupGoogleBtn();
      }
    }, 100);
  }
}

// ---------------------------------------------------------------- boot

init().catch((err) => {
  $('menuError').textContent = String(err.message || err);
  $('menuError').hidden = false;
});

async function init() {
  levelIndex = await loadLevelIndex();
  buildSizeCards();
  bindUI();
  initAuth();
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
  window.addEventListener('click', () => { if (state === 'play') input.requestLock(); });
}

function applySettingsToUI() {
  $('classicToggle').checked = settings.classicControls;
  $('retroToggle').checked = settings.retro;
  $('invertToggle').checked = settings.invertY;
  $('sensRange').value = settings.mouseSensitivity;
}

// ---------------------------------------------------------------- episode

async function start() {
  if (!signedInUser) {
    updateAuthUI();
    return;
  }
  input.requestLock(); // Request synchronously while user click gesture is active!

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
  input.requestLock();
  setState('play');
  lastTime = performance.now();
}

async function sendGameRecord(reason) {
  if (!game) return;
  const record = {
    timestamp: new Date().toISOString(),
    participant_id: signedInUser?.pseudonym || 'anonymous',
    maze_size: selected.size,
    maze_seed: selected.seed,
    time_scale: selected.timeScale,
    time_limit_seconds: game.duration,
    elapsed_seconds: Math.round(game.elapsed * 10) / 10,
    score: game.score,
    finish_reason: reason,
    classic_controls: settings.classicControls,
    retro_view: settings.retro,
    practice_mode: selected.practice,
    invert_y: settings.invertY,
    mouse_sensitivity: settings.mouseSensitivity,
    path: game.path,
  };

  console.log('Game run record:', record);

  const url = APPS_SCRIPT_URL || localStorage.getItem('mmb_apps_script_url');
  if (url) {
    try {
      await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      });
      console.log('Record sent to Google Apps Script');
    } catch (err) {
      console.error('Failed to send record to Apps Script:', err);
    }
  }
}

function toMenu() {
  if (game && !game.finished && game.elapsed > 2) {
    sendGameRecord('quit');
  }
  setState('menu');
  input.releaseLock();
  level = null; game = null;
  buildSizeCards();
}

function finish() {
  sendGameRecord('completed');
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
  border.style.borderColor = t.hex;
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
  const side = Math.min(w, h);
  if (settings.retro) {
    const n = RENDER.retroSize;
    renderer.setPixelRatio(1);
    renderer.setSize(n, n, false);
    camera.aspect = 1;
    canvas.classList.add('retro');
    document.body.classList.add('retro');
  } else {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(side, side, false);
    camera.aspect = 1;
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
