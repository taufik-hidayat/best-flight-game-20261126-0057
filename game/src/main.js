// Ridgeline Courier — boot and the one loop. Input is read every frame, the
// world advances in fixed 1/60 s steps, and the renderer paints what is
// there. Screens: title, play, paused, and end (complete or crashed).
//
// ?seed=N fixes the world seed. ?shot=start|play|lake|land stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady.
import { BEST_KEY, WORLD } from './config.js';
import { createFlightState, stepFlight, altitudeAboveGround, headingDegrees } from './physics.js';
import { createMission, startRun, stepMission, nextRing } from './missions.js';
import { createRenderer } from './render.js';
import { createHud } from './hud.js';
import { createInput, ACTION_CONFIRM, ACTION_PAUSE, ACTION_MUTE, ACTION_RESTART } from './input.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const SCREEN_TITLE = 'title';
const SCREEN_PLAY = 'play';
const SCREEN_PAUSED = 'paused';
const SCREEN_END = 'end';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const flight = createFlightState();
const mission = createMission();
const renderer = createRenderer(canvas);
const hud = createHud();
const audio = createAudio();
startRun(mission, 1);
renderer.rebuildRings(mission);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts the visit.
  }
}

let best = readBest();
let screen = SCREEN_TITLE;
let endKind = '';
let endTitle = '';
let endBody = '';
let missionClock = 0;
let cameraMode = 'chase';

const titleEl = document.getElementById('screen-title');
const pauseEl = document.getElementById('screen-pause');
const endEl = document.getElementById('screen-end');
const endTitleEl = document.getElementById('end-title');
const endBodyEl = document.getElementById('end-body');
const endBestEl = document.getElementById('end-best');

function showOnly(element) {
  for (const el of [titleEl, pauseEl, endEl]) el.classList.toggle('hidden', el !== element);
}

function showScreen(name) {
  screen = name;
  if (name === SCREEN_TITLE) showOnly(titleEl);
  else if (name === SCREEN_PAUSED) showOnly(pauseEl);
  else if (name === SCREEN_END) showOnly(endEl);
  else showOnly(null);
}

function startGame() {
  const keepScore = mission.outcome === 'complete';
  const run = keepScore ? mission.run + 1 : 1;
  const score = keepScore ? mission.score : 0;
  Object.assign(flight, createFlightState());
  Object.assign(mission, createMission());
  startRun(mission, run);
  mission.score = score;
  missionClock = 0;
  cameraMode = 'chase';
  renderer.rebuildRings(mission);
  renderer.snapCamera(flight, 'chase');
  showScreen(SCREEN_PLAY);
  hud.announce(`Run ${run}. Fly the rings, then land on the runway.`);
}

function endGame(kind, title, body) {
  endKind = kind;
  endTitle = title;
  endBody = body;
  if (mission.score > best) {
    best = mission.score;
    saveBest(best);
  }
  endTitleEl.textContent = title;
  endBodyEl.textContent = body;
  endBestEl.textContent = `Score ${mission.score.toLocaleString('en-US')} · Best ${best.toLocaleString('en-US')} · Rings ${mission.ringsFlown}`;
  showScreen(SCREEN_END);
  hud.announce(`${title} Score ${mission.score}.`);
}

/** Gentle valley wind, in m/s, drifting with the mission clock. It blows
 *  mostly along the runway (a headwind or tailwind), with only a whisper
 *  across it: a crosswind that shoves the plane off the strip on final
 *  approach is realistic, but it is not fun. */
function windAt(t) {
  return { x: Math.sin(t * 0.05) * 0.9, z: Math.cos(t * 0.043) * 2.2 };
}

function handleFlightEvent(event) {
  if (event === 'takeoff') {
    audio.touchdown();
    mission.message = 'Airborne — fly the rings!';
    mission.messageUntil = missionClock + 3;
  } else if (event === 'landed') {
    audio.touchdown();
  } else if (event === 'rough') {
    audio.touchdown();
  } else if (event === 'crash' || event === 'ditch') {
    audio.crash();
    mission.outcome = 'crashed';
    endGame(
      'crash',
      event === 'ditch' ? 'Ditched in Mirror Lake' : 'Crashed',
      event === 'ditch'
        ? 'The Kestrel went down in the lake. The rings are still out there — try again.'
        : 'The Kestrel hit the ground hard. Throttle discipline and a gentle descent keep you flying.',
    );
  }
}

function handleMissionEvent(event) {
  if (event === 'ring') {
    audio.ringChime();
    const next = nextRing(mission);
    hud.announce(next ? `Ring flown. Next: ${next.name}.` : 'All rings flown. Land on the runway.');
  } else if (event === 'complete') {
    audio.fanfare();
    endGame(
      'complete',
      `Run ${mission.run} complete!`,
      `Every ring flown and a landing on the runway. Run ${mission.run + 1} adds two more rings — press Enter to fly it.`,
    );
  } else if (event === 'fuel') {
    audio.crash();
    endGame('fuel', 'Out of fuel', 'The tanks ran dry. Rings top the tanks up a little — fly them, and mind the throttle.');
  } else if (event === 'time') {
    endGame('time', 'Out of time', 'The clock ran out. Rings add eight seconds each — keep the line tight.');
  } else if (event === 'crash') {
    audio.crash();
    endGame('crash', 'Airframe lost', 'Too much damage. A rough field landing costs the airframe — the runway is the safe place to put her down.');
  }
}

function runShot(name) {
  const staged = stageShot(name, { flight, mission, renderer, hud });
  screen = staged.screen === 'title' ? SCREEN_TITLE : SCREEN_PLAY;
  cameraMode = staged.cameraMode;
  showScreen(screen);
  // Let the world settle a few fixed steps so the propeller spins, the
  // clouds drift and the plane sits naturally in the frame.
  for (let i = 0; i < 24; i += 1) {
    missionClock += STEP;
    if (screen === SCREEN_PLAY && !flight.grounded) {
      stepFlight(flight, { pitch: 0, roll: 0, throttle: 0, brake: false }, windAt(missionClock), STEP);
    }
  }
  let painted = 0;
  function paint() {
    hud.update(flight, mission, best, missionClock);
    renderer.update(flight, mission, STEP, missionClock, cameraMode);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let accumulator = 0;
  let last = performance.now();

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
      hud.announce(audio.isMuted() ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM) {
      audio.unlock();
      audio.click();
      if (screen === SCREEN_TITLE || screen === SCREEN_END) startGame();
      else if (screen === SCREEN_PAUSED) showScreen(SCREEN_PLAY);
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        showScreen(SCREEN_PAUSED);
        hud.announce('Paused.');
      } else if (screen === SCREEN_PAUSED) showScreen(SCREEN_PLAY);
    }
    if (actions & ACTION_RESTART && (screen === SCREEN_PLAY || screen === SCREEN_PAUSED)) {
      startGame();
    }
  }

  function step() {
    missionClock += STEP;
    const controls = input.read();
    const flightEvent = stepFlight(flight, controls, windAt(missionClock), STEP);
    handleFlightEvent(flightEvent);
    if (screen === SCREEN_PLAY) {
      const missionEvent = stepMission(mission, flight, flightEvent, STEP, missionClock);
      handleMissionEvent(missionEvent);
    }
    audio.update(flight.throttle, flight.speed, !flight.grounded);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE) {
      // The parked plane idles on the runway; the world stays alive behind it.
      missionClock += STEP;
      renderer.update(flight, mission, STEP, missionClock, 'title');
      hud.update(flight, mission, best, missionClock);
      return;
    }
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED || screen === SCREEN_END) {
      hud.update(flight, mission, best, missionClock);
      // Off the play screen the world holds still: no propeller, no drift.
      renderer.update(flight, mission, screen === SCREEN_PLAY ? STEP : 0, missionClock, cameraMode);
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      showScreen(SCREEN_PAUSED);
      hud.announce('Paused.');
    }
  });

  // Buttons on the overlays: the same actions as the keys.
  document.getElementById('btn-start').addEventListener('click', () => {
    audio.unlock();
    audio.click();
    startGame();
  });
  document.getElementById('btn-resume').addEventListener('click', () => {
    audio.click();
    showScreen(SCREEN_PLAY);
  });
  document.getElementById('btn-again').addEventListener('click', () => {
    audio.unlock();
    audio.click();
    startGame();
  });
  document.getElementById('btn-title').addEventListener('click', () => {
    audio.click();
    Object.assign(flight, createFlightState());
    Object.assign(mission, createMission());
    startRun(mission, 1);
    missionClock = 0;
    renderer.rebuildRings(mission);
    renderer.snapCamera(flight, 'chase');
    showScreen(SCREEN_TITLE);
  });

  hud.announce('Ridgeline Courier. Press Enter or click Start to fly.');
  showScreen(SCREEN_TITLE);
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();

// A tiny debug hook, only with ?debug=1: lets a play-test read the flight
// state and the mission, and pose the plane, without touching the game.
if (params.get('debug')) {
  window.__game = {
    flight,
    mission,
    startGame,
    showScreen,
    SCREEN_END,
    telemetry() {
      return {
        agl: Math.round(altitudeAboveGround(flight) * 10) / 10,
        vsi: Math.round(flight.verticalSpeed * 10) / 10,
        heading: Math.round(headingDegrees(flight)),
      };
    },
  };
}
