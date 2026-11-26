// The flight model: an arcade model with real bones — bank to turn, pitch
// bleeds speed on the climb and gains it on the descent, the wing stalls
// below flying speed, and the ground roll, take-off and landing all work.
//
// Attitude is yaw / pitch / roll in radians. Forward is -z rotated by yaw,
// then pitched. The model never trusts the caller: inputs are clamped.
import { PLANE, RUNWAY } from './config.js';
import { groundHeight, onRunway, overLake } from './terrain.js';
import { WORLD } from './config.js';

const GRAVITY = 9.81;

/** A fresh flight state, parked on the runway facing north. */
export function createFlightState() {
  const ground = groundHeight(RUNWAY.X, 520);
  return {
    x: RUNWAY.X,
    y: ground + 1.4,
    z: 520,
    yaw: 0,
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    verticalSpeed: 0,
    /** 'parked' | 'flying' | 'ground' | 'crashed' */
    mode: 'parked',
    grounded: true,
    /** Seconds since the last touchdown, for landing quality. */
    airTime: 0,
  };
}

/** Forward unit vector from yaw and pitch. */
export function forwardVector(state, out) {
  const cp = Math.cos(state.pitch);
  out.x = -Math.sin(state.yaw) * cp;
  out.y = Math.sin(state.pitch);
  out.z = -Math.cos(state.yaw) * cp;
  return out;
}

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

/**
 * Advance the flight state one fixed step.
 * input: { pitch, roll, throttle, brake } each in [-1, 1] (throttle is a delta).
 * wind: { x, z } drift in m/s. Returns an event string or ''.
 */
export function stepFlight(state, input, wind, dt) {
  const fwd = { x: 0, y: 0, z: 0 };
  forwardVector(state, fwd);

  // Throttle: the lever moves, the engine follows.
  state.throttle = clamp(state.throttle + input.throttle * dt * 0.9, 0, 1);

  if (state.mode === 'crashed') return 'crashed';

  const speedFactor = clamp(state.speed / 45, 0.3, 1);

  if (state.grounded) {
    // Ground roll: steer with the rudder, accelerate with the throttle.
    state.yaw -= input.roll * 0.55 * dt * clamp(state.speed / 20, 0, 1);
    const target = state.throttle * PLANE.MAX_SPEED;
    state.speed += (target - state.speed) * 0.35 * dt;
    if (input.brake) state.speed = Math.max(0, state.speed - 26 * dt);
    state.speed = clamp(state.speed, 0, PLANE.MAX_SPEED);
    state.pitch = 0;
    state.roll = 0;
    if (state.speed >= PLANE.ROTATE_SPEED && input.pitch < -0.25) {
      state.grounded = false;
      state.mode = 'flying';
      state.pitch = 0.12;
      return 'takeoff';
    }
    state.x += -Math.sin(state.yaw) * state.speed * dt;
    state.z += -Math.cos(state.yaw) * state.speed * dt;
    state.y = groundHeight(state.x, state.z) + 1.4;
    state.verticalSpeed = 0;
    return '';
  }

  // In the air: pitch and roll answer to the stick, scaled by airspeed.
  state.pitch = clamp(
    state.pitch - input.pitch * PLANE.PITCH_RATE * speedFactor * dt,
    -PLANE.MAX_PITCH,
    PLANE.MAX_PITCH,
  );
  state.roll = clamp(state.roll + input.roll * PLANE.ROLL_RATE * speedFactor * dt, -PLANE.MAX_ROLL, PLANE.MAX_ROLL);
  // Hands off the stick and the wings level themselves, gently; the nose
  // settles too, so the plane holds its attitude instead of wandering.
  if (Math.abs(input.roll) < 0.05) state.roll -= state.roll * 0.9 * dt;
  if (Math.abs(input.pitch) < 0.05) state.pitch -= state.pitch * 0.5 * dt;
  // Banked wings turn the nose: coordinated turn.
  const turnRate = -Math.tan(state.roll) * (GRAVITY / Math.max(state.speed, 12)) * 0.85;
  state.yaw += turnRate * dt;

  // Speed: thrust pulls toward the throttle's speed, the climb costs speed,
  // the descent gives it back, and drag grows with the square of speed.
  const targetSpeed = PLANE.MIN_SPEED + state.throttle * (PLANE.MAX_SPEED - PLANE.MIN_SPEED);
  state.speed += (targetSpeed - state.speed) * 0.22 * dt;
  state.speed -= Math.sin(state.pitch) * GRAVITY * 0.85 * dt;
  state.speed -= state.speed * state.speed * 0.00012 * dt;
  if (input.brake) state.speed = Math.max(PLANE.MIN_SPEED, state.speed - 18 * dt);
  state.speed = clamp(state.speed, 0, PLANE.MAX_SPEED + 12);

  // Stall: below flying speed the nose drops and the plane sinks.
  if (state.speed < PLANE.STALL_SPEED) {
    state.pitch -= (PLANE.STALL_SPEED - state.speed) * 0.02 * dt * 10;
    state.pitch = Math.max(state.pitch, -0.5);
  }

  const prevY = state.y;
  forwardVector(state, fwd);
  state.x += (fwd.x * state.speed + wind.x) * dt;
  state.y += fwd.y * state.speed * dt;
  state.z += (fwd.z * state.speed + wind.z) * dt;
  state.verticalSpeed = (state.y - prevY) / dt;
  state.airTime += dt;

  // Keep the pilot inside the valley: a soft wall, not a crash.
  const edge = WORLD.SIZE + 60;
  if (Math.abs(state.x) > edge || Math.abs(state.z) > edge) {
    state.x = clamp(state.x, -edge, edge);
    state.z = clamp(state.z, -edge, edge);
    state.yaw += Math.PI * dt * 0.4;
  }
  if (state.y > 420) {
    state.y = 420;
    state.pitch = Math.min(state.pitch, 0);
  }

  // Ground and water contact.
  const ground = groundHeight(state.x, state.z);
  const inWater = overLake(state.x, state.z) && state.y < WORLD.WATER_LEVEL + 1.2;
  if (inWater) {
    state.mode = 'crashed';
    return 'ditch';
  }
  if (state.y <= ground + 1.4) {
    const gentle = Math.abs(state.verticalSpeed) < 6 && state.speed < 62 && Math.abs(state.roll) < 0.4;
    if (onRunway(state.x, state.z) && gentle) {
      state.grounded = true;
      state.mode = 'ground';
      state.y = ground + 1.4;
      state.pitch = 0;
      state.roll = 0;
      state.verticalSpeed = 0;
      return 'landed';
    }
    if (gentle && state.speed < 30) {
      // A rough field landing: survivable, costly, and the plane stops.
      state.grounded = true;
      state.mode = 'ground';
      state.y = ground + 1.4;
      state.speed *= 0.35;
      state.pitch = 0;
      state.roll = 0;
      state.verticalSpeed = 0;
      return 'rough';
    }
    state.mode = 'crashed';
    state.y = ground + 1.0;
    return 'crash';
  }
  return '';
}

/** Heading in degrees, 0 = north, clockwise. */
export function headingDegrees(state) {
  let deg = (-state.yaw * 180) / Math.PI;
  deg %= 360;
  return deg < 0 ? deg + 360 : deg;
}

/** Altitude above the ground directly below, in metres. */
export function altitudeAboveGround(state) {
  return Math.max(0, state.y - groundHeight(state.x, state.z));
}
