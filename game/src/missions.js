// The courier run: a chain of glowing rings across the valley, then a
// landing back on the runway. Rings pay points, time and a little fuel;
// the clock, the fuel and the airframe are the three things that can end
// a run. Each finished run starts a longer one.
import { MISSION, PLANE } from './config.js';
import { createRandom } from './random.js';
import { groundHeight } from './terrain.js';

/** Hand-placed ring course: a tour of the valley's landmarks. */
const COURSE = [
  { x: 0, y: 95, z: -120, name: 'Millbrook Rise' },
  { x: -330, y: 110, z: -420, name: 'Mirror Lake' },
  { x: -620, y: 150, z: -120, name: 'West Ridge' },
  { x: -420, y: 130, z: 320, name: 'Pine Hollow' },
  { x: 60, y: 100, z: 620, name: 'South Fields' },
  { x: 480, y: 140, z: 420, name: 'East Bluff' },
  { x: 640, y: 190, z: -140, name: 'High Pass' },
  { x: 320, y: 150, z: -560, name: 'North Gate' },
  { x: -180, y: 170, z: -720, name: 'Eagle Crag' },
  { x: 620, y: 210, z: -620, name: 'Summit Turn' },
];

export function createMission() {
  return {
    run: 1,
    ringIndex: 0,
    rings: [],
    score: 0,
    timeLeft: MISSION.START_TIME,
    fuel: PLANE.FUEL_CAPACITY,
    damage: 0,
    ringsFlown: 0,
    /** 'flying' | 'complete' | 'crashed' | 'out-of-fuel' | 'out-of-time' */
    outcome: 'flying',
    message: '',
    messageUntil: 0,
  };
}

/** Lay out this run's rings: the base course, plus two extra on later runs. */
export function startRun(mission, run) {
  mission.run = run;
  mission.ringIndex = 0;
  mission.rings = [];
  const count = Math.min(COURSE.length, MISSION.BASE_RINGS + (run - 1) * 2);
  const rng = createRandom(1000 + run * 77);
  const order = COURSE.slice(0, count);
  // Later runs shuffle the middle of the course so the route stays fresh.
  if (run > 1) {
    for (let i = 1; i < order.length - 1; i += 1) {
      const j = 1 + rng.int(0, order.length - 3);
      const tmp = order[i];
      order[i] = order[j];
      order[j] = tmp;
    }
  }
  for (const spot of order) {
    mission.rings.push({
      x: spot.x,
      y: Math.max(spot.y, groundHeight(spot.x, spot.z) + 45),
      z: spot.z,
      name: spot.name,
      passed: false,
    });
  }
  mission.timeLeft = MISSION.START_TIME;
  mission.fuel = PLANE.FUEL_CAPACITY;
  mission.damage = 0;
  mission.outcome = 'flying';
  return mission;
}

/** The ring the pilot is flying toward right now, or null. */
export function nextRing(mission) {
  return mission.ringIndex < mission.rings.length ? mission.rings[mission.ringIndex] : null;
}

/** Distance in metres from the plane to the next ring. */
export function distanceToNextRing(mission, state) {
  const ring = nextRing(mission);
  if (!ring) return 0;
  return Math.hypot(ring.x - state.x, ring.y - state.y, ring.z - state.z);
}

/** Bearing to the next ring, in degrees (0 = north). */
export function bearingToNextRing(mission, state) {
  const ring = nextRing(mission);
  if (!ring) return 0;
  const dx = ring.x - state.x;
  const dz = ring.z - state.z;
  let deg = (Math.atan2(dx, -dz) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}

function showMessage(mission, text, seconds, now) {
  mission.message = text;
  mission.messageUntil = now + seconds;
}

/**
 * Advance the mission one step. Returns an event: '' | 'ring' | 'landed' |
 * 'complete' | 'crash' | 'fuel' | 'time'. `now` is the mission clock.
 */
export function stepMission(mission, state, flightEvent, dt, now) {
  if (mission.outcome !== 'flying') return '';

  // The clock and the fuel always run.
  mission.timeLeft -= dt;
  const burn = PLANE.FUEL_BURN_IDLE + state.throttle * (PLANE.FUEL_BURN_FULL - PLANE.FUEL_BURN_IDLE);
  mission.fuel -= burn * dt * (state.mode === 'parked' ? 0.2 : 1);
  if (mission.fuel <= 0) {
    mission.fuel = 0;
    mission.outcome = 'out-of-fuel';
    return 'fuel';
  }
  if (mission.timeLeft <= 0) {
    mission.timeLeft = 0;
    mission.outcome = 'out-of-time';
    return 'time';
  }

  // Rings: flying within the hoop — or just through its glow — counts.
  // The window is a little wider than the hoop itself, so a good line
  // through the ring always pays, even at full speed.
  const ring = nextRing(mission);
  if (ring && !state.grounded) {
    const d = Math.hypot(ring.x - state.x, ring.y - state.y, ring.z - state.z);
    if (d < MISSION.RING_RADIUS + 5) {
      ring.passed = true;
      mission.ringIndex += 1;
      mission.ringsFlown += 1;
      mission.score += MISSION.RING_POINTS;
      mission.timeLeft += MISSION.RING_TIME_BONUS;
      mission.fuel = Math.min(PLANE.FUEL_CAPACITY, mission.fuel + PLANE.FUEL_PER_RING);
      const next = nextRing(mission);
      showMessage(
        mission,
        next ? `Ring ${mission.ringIndex + 1} of ${mission.rings.length} — ${next.name}` : 'All rings flown — land on the runway!',
        3.5,
        now,
      );
      return 'ring';
    }
  }

  if (flightEvent === 'rough') {
    mission.damage += PLANE.ROUGH_LANDING_DAMAGE;
    showMessage(mission, 'Rough landing! Airframe damaged.', 3, now);
    if (mission.damage >= 100) {
      mission.damage = 100;
      mission.outcome = 'crashed';
      return 'crash';
    }
    return 'rough';
  }

  if (flightEvent === 'landed') {
    if (mission.ringIndex >= mission.rings.length && mission.rings.length > 0) {
      // The run is complete: landing bonus, plus a gentle-touch bonus.
      const gentle = Math.abs(state.verticalSpeed) < 3;
      const bonus = MISSION.LANDING_POINTS + (gentle ? MISSION.PERFECT_LANDING_POINTS : 0);
      mission.score += bonus;
      mission.outcome = 'complete';
      showMessage(mission, gentle ? 'Perfect landing!' : 'Run complete!', 4, now);
      return 'complete';
    }
    // A pit stop mid-run: fuel and repairs, then back into the sky.
    mission.fuel = PLANE.FUEL_CAPACITY;
    mission.damage = 0;
    showMessage(mission, 'Refuelled and repaired — throttle up and go!', 3.5, now);
    return 'landed';
  }

  if (flightEvent === 'crash' || flightEvent === 'ditch') {
    mission.outcome = 'crashed';
    return 'crash';
  }
  return '';
}
