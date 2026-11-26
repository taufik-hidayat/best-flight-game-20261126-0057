// The valley itself: one height function that the terrain mesh, the flight
// model, the trees and the screenshots all read, so the ground the pilot sees
// is exactly the ground the plane can hit.
//
// The valley is a green bowl ringed by snowy peaks, with Mirror Lake in the
// north-west, a pine forest on the lower slopes, a little red-roofed village
// (Millbrook) beside the runway, and the runway itself flattened into the
// valley floor.
import { RUNWAY, WORLD } from './config.js';
import { createRandom, fractalNoise } from './random.js';

const NOISE_SEED = WORLD.SEED;
const LAKE = { x: -480, z: -380, radius: 230 };
const VILLAGE = { x: 170, z: 430, radius: 110 };

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(a, b, v) {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** Distance from the runway centreline segment, in metres. */
export function runwayDistance(x, z) {
  const clampedZ = Math.max(RUNWAY.Z_NORTH, Math.min(RUNWAY.Z_SOUTH, z));
  return Math.hypot(x - RUNWAY.X, z - clampedZ);
}

/** True when the point is on the paved strip. */
export function onRunway(x, z) {
  return (
    Math.abs(x - RUNWAY.X) <= RUNWAY.HALF_WIDTH &&
    z >= RUNWAY.Z_NORTH - 6 &&
    z <= RUNWAY.Z_SOUTH + 6
  );
}

/** True when the point is over Mirror Lake's water. */
export function overLake(x, z) {
  return Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.radius;
}

/** The one height function: metres above sea level at (x, z). */
export function groundHeight(x, z) {
  const distCentre = Math.hypot(x, z);
  // Rolling foothills across the whole valley.
  let h = 14 + fractalNoise(x * 0.0016, z * 0.0016, NOISE_SEED, 4) * 26;
  // A second, rougher octave for character on the slopes.
  h += fractalNoise(x * 0.006, z * 0.006, NOISE_SEED + 7, 3) * 7;
  // The rim: mountains rise toward the edges of the map.
  const rim = smoothstep(620, 1050, distCentre);
  h += rim * rim * 210;
  h += rim * fractalNoise(x * 0.004, z * 0.004, NOISE_SEED + 13, 3) * 55;
  // A high massif in the north-east corner and one in the south-west.
  const ne = Math.hypot(x - 780, z + 780);
  const sw = Math.hypot(x + 820, z - 760);
  h += smoothstep(420, 60, ne) * 120 + smoothstep(420, 60, sw) * 110;
  // Mirror Lake: a smooth basin pressed below the waterline.
  const lakeD = Math.hypot(x - LAKE.x, z - LAKE.z);
  const lakeMask = 1 - smoothstep(LAKE.radius * 0.55, LAKE.radius * 1.05, lakeD);
  h = h * (1 - lakeMask) + 0.5 * lakeMask;
  // The runway strip: flat at its elevation, blended at the edges.
  const flat = 1 - smoothstep(RUNWAY.HALF_WIDTH + 6, RUNWAY.HALF_WIDTH + 70, Math.abs(x - RUNWAY.X));
  const inStrip = smoothstep(RUNWAY.Z_NORTH - 90, RUNWAY.Z_NORTH, z) * (1 - smoothstep(RUNWAY.Z_SOUTH, RUNWAY.Z_SOUTH + 90, z));
  const stripMask = flat * inStrip;
  h = h * (1 - stripMask) + RUNWAY.ELEVATION * stripMask;
  // Millbrook village: gentle ground for the houses.
  const vMask = 1 - smoothstep(VILLAGE.radius * 0.5, VILLAGE.radius, Math.hypot(x - VILLAGE.x, z - VILLAGE.z));
  h = h * (1 - vMask * 0.7) + 15 * vMask * 0.7;
  return h;
}

/** Colour of the ground at a height, before lighting: grass, rock, snow. */
export function groundColour(x, z, height, out) {
  const n = fractalNoise(x * 0.02, z * 0.02, NOISE_SEED + 31, 2) * 0.5 + 0.5;
  // Meadow green with patchy variation; drier gold on the high sunny slopes.
  let r = 0.32 + n * 0.1;
  let g = 0.52 + n * 0.1;
  let b = 0.22 + n * 0.06;
  if (height > 60 && height < 110) {
    const t = (height - 60) / 50;
    r = r * (1 - t) + 0.62 * t;
    g = g * (1 - t) + 0.5 * t;
    b = b * (1 - t) + 0.34 * t;
  }
  if (height >= 110) {
    // Rock, then snow on the peaks.
    const rock = smoothstep(110, 150, height);
    const snow = smoothstep(165, 215, height);
    r = r * (1 - rock) + 0.48 * rock;
    g = g * (1 - rock) + 0.45 * rock;
    b = b * (1 - rock) + 0.44 * rock;
    r = r * (1 - snow) + 0.94 * snow;
    g = g * (1 - snow) + 0.95 * snow;
    b = b * (1 - snow) + 0.98 * snow;
  }
  // Sandy shore ringing the lake.
  if (overLake(x, z) && height < WORLD.WATER_LEVEL + 4) {
    r = 0.78;
    g = 0.7;
    b = 0.52;
  }
  out[0] = r;
  out[1] = g;
  out[2] = b;
  return out;
}

/** Pine positions: on gentle, dry ground, clear of runway, lake and village. */
export function pinePositions(count) {
  const rng = createRandom(WORLD.SEED + 99);
  const spots = [];
  let guard = 0;
  while (spots.length < count && guard < count * 40) {
    guard += 1;
    const x = rng.range(-WORLD.SIZE, WORLD.SIZE);
    const z = rng.range(-WORLD.SIZE, WORLD.SIZE);
    const h = groundHeight(x, z);
    if (h < 18 || h > 95) continue;
    if (Math.abs(x - RUNWAY.X) < 90 && z > 120 && z < 640) continue;
    if (overLake(x, z)) continue;
    if (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < VILLAGE.radius + 30) continue;
    // Pines cluster in groves rather than scattering evenly.
    const grove = fractalNoise(x * 0.004, z * 0.004, NOISE_SEED + 55, 2);
    if (grove < 0.05) continue;
    spots.push({ x, z, h, s: rng.range(0.8, 1.7), tilt: rng.range(-0.06, 0.06) });
  }
  return spots;
}

/** Millbrook: a dozen small houses with red and brown roofs. */
export function villageHouses() {
  const rng = createRandom(WORLD.SEED + 7);
  const houses = [];
  for (let i = 0; i < 14; i += 1) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(15, VILLAGE.radius - 12);
    const x = VILLAGE.x + Math.cos(a) * r;
    const z = VILLAGE.z + Math.sin(a) * r * 0.8;
    houses.push({
      x,
      z,
      h: groundHeight(x, z),
      w: rng.range(9, 15),
      d: rng.range(8, 13),
      wall: rng.pick([0xf3e2c7, 0xe8dcc0, 0xdfe8f0, 0xf0d9b5]),
      roof: rng.pick([0xb3402a, 0x8f2f24, 0x7a4a2b, 0xa03a2c]),
      rot: rng.range(0, Math.PI),
    });
  }
  return houses;
}

export const LAKE_CENTRE = LAKE;
export const VILLAGE_CENTRE = VILLAGE;
