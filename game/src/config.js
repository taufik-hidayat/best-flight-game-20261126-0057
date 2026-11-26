// Ridgeline Courier — tuning constants. One place for every number the flight
// model, the world and the missions share, so a balance change is one edit.
export const WORLD = {
  /** Half-size of the playable valley, in metres. Terrain spans -SIZE..SIZE. */
  SIZE: 1100,
  /** Water level of Mirror Lake. */
  WATER_LEVEL: 3,
  /** Fixed world seed: the same valley, rings and weather every visit. */
  SEED: 20261126,
};

export const RUNWAY = {
  /** Runway centreline (x) and its two ends (z). The strip runs north-south. */
  X: 0,
  Z_NORTH: 180,
  Z_SOUTH: 560,
  HALF_WIDTH: 14,
  /** Height of the flattened strip. */
  ELEVATION: 12,
  /** Heading the pilot faces at the start, degrees (0 = north, -z). */
  HEADING_DEG: 0,
};

export const PLANE = {
  /** Cruise behaviour: metres per second at full and idle throttle.
   *  Topped at 62 m/s (about 120 kt): fast enough to feel quick, slow
   *  enough to thread a ring without the approach becoming a blur. */
  MAX_SPEED: 62,
  MIN_SPEED: 16,
  /** Below this the wing stops flying and the nose drops. */
  STALL_SPEED: 27,
  /** Take-off rotation speed on the ground roll. */
  ROTATE_SPEED: 33,
  /** Turn and pitch authority, radians per second at full input. Kept
   *  gentle on purpose: a twitchy nose makes threading a ring miserable. */
  PITCH_RATE: 0.65,
  ROLL_RATE: 1.9,
  MAX_PITCH: 0.62,
  MAX_ROLL: 1.25,
  /** Fuel: 100 units, burned per second at full throttle. */
  FUEL_CAPACITY: 100,
  FUEL_BURN_FULL: 0.95,
  FUEL_BURN_IDLE: 0.22,
  FUEL_PER_RING: 8,
  /** Damage taken by a rough off-runway touchdown. */
  ROUGH_LANDING_DAMAGE: 45,
};

export const MISSION = {
  /** Rings on the first courier run; later runs add two more. */
  BASE_RINGS: 8,
  RING_RADIUS: 9,
  RING_POINTS: 100,
  /** Seconds added to the clock for each ring flown. */
  RING_TIME_BONUS: 8,
  START_TIME: 240,
  LANDING_POINTS: 250,
  /** Perfect-landing bonus when the touchdown is gentle and centred. */
  PERFECT_LANDING_POINTS: 150,
};

export const BEST_KEY = 'ridgeline-courier-best';
