// Screenshot staging: ?shot=start|play|lake|land (with &seed=N) poses the
// game at a fixed, flattering moment instead of running the loop, then the
// page paints it twice and sets window.__shotReady. Every shot is a real
// render of the game's own code — the same world the player flies in.
import { RUNWAY } from './config.js';
import { groundHeight } from './terrain.js';
import { startRun } from './missions.js';

function placePlane(flight, x, y, z, yaw, pitch, roll, speed, throttle) {
  flight.x = x;
  flight.y = y;
  flight.z = z;
  flight.yaw = yaw;
  flight.pitch = pitch;
  flight.roll = roll;
  flight.speed = speed;
  flight.throttle = throttle;
  flight.verticalSpeed = 0;
  flight.mode = speed > 0 ? 'flying' : 'parked';
  flight.grounded = speed === 0;
  flight.airTime = 120;
}

function faceToward(flight, tx, tz) {
  const dx = tx - flight.x;
  const dz = tz - flight.z;
  flight.yaw = Math.atan2(-dx, -dz);
}

/**
 * Pose one named scene. Returns { screen, cameraMode } for the painter.
 * `world` is { flight, mission, renderer, hud }.
 */
export function stageShot(name, world) {
  const { flight, mission, renderer } = world;
  startRun(mission, 1);
  mission.score = 0;
  mission.timeLeft = 213;

  if (name === 'play') {
    // Mid-flight, banked through the valley toward the Mirror Lake ring,
    // peaks and pine forest all around.
    mission.score = 340;
    mission.ringIndex = 1;
    placePlane(flight, -260, 128, -330, 0, 0.04, -0.38, 58, 0.78);
    faceToward(flight, -330, -420);
    renderer.rebuildRings(mission);
    renderer.snapCamera(flight, 'chase');
    return { screen: 'play', cameraMode: 'chase' };
  }

  if (name === 'lake') {
    // Low over Mirror Lake at golden hour, the next ring glowing ahead and
    // the snowy north-east massif behind it.
    mission.score = 150;
    mission.ringIndex = 1;
    placePlane(flight, -350, 70, -250, 0, -0.02, 0.12, 52, 0.62);
    faceToward(flight, -330, -420);
    renderer.rebuildRings(mission);
    renderer.snapCamera(flight, 'chase');
    return { screen: 'play', cameraMode: 'chase' };
  }

  if (name === 'land') {
    // Final approach: every ring flown, the runway dead ahead, gear down,
    // throttle back, instruments lit for the landing.
    mission.score = 890;
    mission.ringIndex = mission.rings.length;
    mission.rings.forEach((ring) => {
      ring.passed = true;
    });
    placePlane(flight, 4, 48, 690, 0, -0.07, 0.02, 47, 0.42);
    faceToward(flight, RUNWAY.X, RUNWAY.Z_SOUTH);
    renderer.rebuildRings(mission);
    renderer.snapCamera(flight, 'chase');
    return { screen: 'play', cameraMode: 'chase' };
  }

  // 'start' (and anything unknown): parked on the runway at golden hour,
  // the strip running away to the mountains, Millbrook to the right.
  const ground = groundHeight(RUNWAY.X, 520);
  placePlane(flight, RUNWAY.X, ground + 1.4, 520, 0, 0, 0, 0, 0);
  renderer.rebuildRings(mission);
  renderer.snapCamera(flight, 'title');
  return { screen: 'title', cameraMode: 'title' };
}
