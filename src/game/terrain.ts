export interface Vec2 {
  x: number;
  z: number;
}

export interface LandmarkDef {
  id: string;
  name: string;
  subtitle: string;
  x: number;
  z: number;
  radius: number;
  xpReward: number;
}

export const WORLD_RADIUS = 92;
export const PLAYABLE_LIMIT = 84;

export const SPAWN_POS = { x: 0, z: 54 };
export const RANGER_POS = { x: 4, z: 36 };
export const PATROL_POS = { x: -10, z: 16 };
export const FORD_POS = { x: -14, z: 4 };
export const VILLAGE_POS = { x: 26, z: 14 };
export const VILLAGE_WELL_POS = { x: VILLAGE_POS.x, z: VILLAGE_POS.z + 8 };
export const CAMPSITE_POS = { x: -22, z: -14 };
export const CAVE_POS = { x: 32, z: -26 };
export const WATCHTOWER_POS = { x: -6, z: -50 };
export const WATERFALL_POS = { x: -42, z: 3 };
export const QUARRY_POS = { x: -28, z: -28 };

export const ROAD_WAYPOINTS: Vec2[] = [
  { x: 0, z: 60 },
  { x: 0, z: 54 },
  { x: 4, z: 36 },
  { x: -2, z: 24 },
  { x: -10, z: 16 },
  { x: -14, z: 4 },
  { x: -18, z: -6 },
  { x: -22, z: -14 },
  { x: -16, z: -26 },
  { x: -12, z: -36 },
  { x: -6, z: -50 },
];

// The same paths grade the terrain, clear vegetation and draw the world map.
export const BRANCH_PATHS: Vec2[][] = [
  [{x:-2,z:24},{x:12,z:29},{x:25,z:28},{x:29,z:24},{x:29,z:18},VILLAGE_POS],
  [FORD_POS,{x:-14,z:-7},{x:0,z:-17},{x:17,z:-18},{x:29,z:-17},{x:32,z:-21},CAVE_POS],
  [CAMPSITE_POS,{x:-18,z:-20},{x:-20,z:-27},QUARRY_POS],
];
export const WORLD_PATHS = [ROAD_WAYPOINTS, ...BRANCH_PATHS];

export const LANDMARKS: LandmarkDef[] = [
  {
    id: 'woodland_path',
    name: 'Lesní vyhlídka',
    subtitle: 'Jižní stezka do údolí pod Mlžnými horami',
    x: SPAWN_POS.x,
    z: SPAWN_POS.z,
    radius: 11,
    xpReward: 20,
  },
  {
    id: 'ranger_post',
    name: 'Strážní stezka',
    subtitle: 'Místo přepadení Edranovy družiny',
    x: RANGER_POS.x,
    z: RANGER_POS.z,
    radius: 9,
    xpReward: 25,
  },
  {
    id: 'whispering_ford',
    name: 'Stříbrný brod',
    subtitle: 'Mělký přechod pod západními vodopády',
    x: FORD_POS.x,
    z: FORD_POS.z,
    radius: 10,
    xpReward: 35,
  },
  {
    id: 'oakhaven_ruins',
    name: 'Osada Líska',
    subtitle: 'Bezpečná vesnice v údolí chráněná léčitelkou Mirou a trpaslíkem Brunim',
    x: VILLAGE_POS.x,
    z: VILLAGE_POS.z,
    radius: 14,
    xpReward: 50,
  },
  {
    id: 'goblin_campsite',
    name: 'Opuštěný tábor skřetů',
    subtitle: 'Vychladlý popel a záznamy o ukradených karavanách',
    x: CAMPSITE_POS.x,
    z: CAMPSITE_POS.z,
    radius: 11,
    xpReward: 45,
  },
  {
    id: 'misty_cavern',
    name: 'Staré trpasličí štoly',
    subtitle: 'Prastaré podzemní chodby vytesané do východní skály',
    x: CAVE_POS.x,
    z: CAVE_POS.z,
    radius: 10,
    xpReward: 60,
  },
  {
    id: 'ruined_watchtower',
    name: 'Horská pevnost',
    subtitle: 'Severní strážní věž se signálními ohni ovládaná Grakhem',
    x: WATCHTOWER_POS.x,
    z: WATCHTOWER_POS.z,
    radius: 13,
    xpReward: 80,
  },
];

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function riverCenterZ(x: number): number {
  // Bend the stream around Líska while leaving the western ford unchanged.
  const villageBend = 15 * Math.exp(-Math.pow((x - VILLAGE_POS.x) / 15, 4));
  return 4 + Math.sin(x * 0.055) * 4.2 + Math.cos(x * 0.025) * 1.5 - villageBend;
}

function distToSegmentSq(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const abx = bx - ax;
  const abz = bz - az;
  const apx = px - ax;
  const apz = pz - az;
  const abLenSq = abx * abx + abz * abz;
  if (abLenSq <= 1e-6) return apx * apx + apz * apz;
  const t = clamp((apx * abx + apz * abz) / abLenSq, 0, 1);
  const cx = ax + abx * t;
  const cz = az + abz * t;
  const dx = px - cx;
  const dz = pz - cz;
  return dx * dx + dz * dz;
}

export function distanceToRoad(x: number, z: number): number {
  return distanceToPaths(x, z, WORLD_PATHS);
}

export function distanceToMainRoad(x: number, z: number): number {
  return distanceToPaths(x, z, [ROAD_WAYPOINTS]);
}

function distanceToPaths(x: number, z: number, paths: Vec2[][]): number {
  let minSq = Infinity;
  for (const path of paths) for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const dSq = distToSegmentSq(x, z, a.x, a.z, b.x, b.z);
    if (dSq < minSq) minSq = dSq;
  }
  return Math.sqrt(minSq);
}

/**
 * Deterministic heightmap shared across visual terrain, physics collider,
 * prop placement, and character/enemy grounding.
 */
export function groundHeightAt(x: number, z: number): number {
  // Base gentle valley undulation
  let h =
    Math.sin(x * 0.042) * Math.cos(z * 0.038) * 1.65 +
    Math.sin(x * 0.095 + 1.2) * Math.sin(z * 0.088 - 0.6) * 0.55 +
    Math.cos((x + z) * 0.026) * 0.9;

  // Gradual rise toward the northern Misty Mountains (negative Z)
  const northSlope = smoothstep(25, -75, z) * 3.8;
  h += northSlope;

  // Flatten the spawn overlook and ranger outpost slightly for clean sightlines
  const distSpawn = Math.hypot(x - SPAWN_POS.x, z - SPAWN_POS.z);
  const spawnFlat = 1 - smoothstep(4, 14, distSpawn);
  h = lerp(h, 1.4, spawnFlat * 0.78);

  const distRanger = Math.hypot(x - RANGER_POS.x, z - RANGER_POS.z);
  const rangerFlat = 1 - smoothstep(3.5, 11, distRanger);
  h = lerp(h, 1.15, rangerFlat * 0.72);

  // Patrol clearing & abandoned village gentle flats
  const distPatrol = Math.hypot(x - PATROL_POS.x, z - PATROL_POS.z);
  const patrolFlat = 1 - smoothstep(5, 13, distPatrol);
  h = lerp(h, 0.95, patrolFlat * 0.65);

  const distVillage = Math.hypot(x - VILLAGE_POS.x, z - VILLAGE_POS.z);
  const villageFlat = 1 - smoothstep(16, 23, distVillage);
  h = lerp(h, 1.2, villageFlat);

  const distCamp = Math.hypot(x - CAMPSITE_POS.x, z - CAMPSITE_POS.z);
  const campFlat = 1 - smoothstep(5, 13, distCamp);
  h = lerp(h, 2.2, campFlat * 0.75);

  // Ancient Watchtower plateau at (-6, -50)
  const distTower = Math.hypot(x - WATCHTOWER_POS.x, z - WATCHTOWER_POS.z);
  const towerPlateau = 1 - smoothstep(16, 27, distTower);
  h = lerp(h, 7.6, towerPlateau);

  // Smooth ramp along the road leading up to the Watchtower
  const roadDist = distanceToRoad(x, z);
  const onRoad = 1 - smoothstep(2.4, 6.2, roadDist);
  if (z < -18 && z > -48 && distanceToMainRoad(x, z) < 6.5) {
    const rampT = smoothstep(-18, -44, z);
    const rampHeight = lerp(2.2, 7.6, rampT);
    h = lerp(h, rampHeight, onRoad * 0.9);
  } else {
    // Gently grade the road bed everywhere else
    h = lerp(h, Math.max(0.25, h * 0.78 + 0.35), onRoad * 0.6);
  }

  // Waterfall cliff west of x = -34 near the river
  if (x < -30) {
    const cliffT = smoothstep(-32, -46, x);
    const northOfFalls = smoothstep(-10, 10, z);
    h += cliffT * (4.5 + northOfFalls * 1.2);
  }

  // Hidden cave cliff ridge behind (32, -26)
  const distCave = Math.hypot(x - CAVE_POS.x, z - CAVE_POS.z);
  if (distCave < 16) {
    const caveFloor = 1 - smoothstep(4, 10, distCave);
    h = lerp(h, 2.35, caveFloor * 0.85);
  }
  if (x > 38 && z < -18 && z > -40) {
    h += smoothstep(38, 54, x) * 6.5;
  }

  // Quarry basin and eastern mine forecourt form readable destination spaces.
  const quarryFlat = 1 - smoothstep(6, 14, Math.hypot(x - QUARRY_POS.x, z - QUARRY_POS.z));
  h = lerp(h, 3.8, quarryFlat);
  const mineApron = 1 - smoothstep(7, 14, Math.hypot(x - CAVE_POS.x, z - (CAVE_POS.z + 2)));
  h = lerp(h, 2.35, mineApron);

  // Carve river channel across the valley (with a shallow ford at x = -14)
  const rz = riverCenterZ(x);
  const distRiver = Math.abs(z - rz);
  if (distRiver < 7.2 && x > -46 && x < 55) {
    const riverCarve = 1 - smoothstep(1.8, 6.8, distRiver);
    const fordShallow = 1 - smoothstep(2.5, 7.5, Math.abs(x - FORD_POS.x));
    const bedDepth = lerp(-1.15, -0.22, fordShallow);
    h = lerp(h, bedDepth, riverCarve);
  }

  // Outer perimeter natural mountain rim beyond playable bounds
  const radial = Math.hypot(x, z);
  if (radial > PLAYABLE_LIMIT - 4) {
    const rimT = smoothstep(PLAYABLE_LIMIT - 4, WORLD_RADIUS + 18, radial);
    const ridgeNoise = 0.75 + 0.35 * Math.sin(Math.atan2(z, x) * 7 + radial * 0.08);
    h += rimT * rimT * 24 * ridgeNoise;
  }

  return h;
}

/** Shared art direction for runtime terrain and the editable Blender scene. */
export function terrainColorAt(x: number, z: number): [number, number, number] {
  const y = groundHeightAt(x,z);
  const north = smoothstep(10,-45,z);
  const variation = Math.sin(x*.21+z*.13)*.018;
  let c: [number,number,number] = [lerp(.19,.13,north)+variation,lerp(.29,.22,north)+variation,lerp(.075,.12,north)];
  const mix = (b: number[], t: number) => { c = c.map((a,i)=>lerp(a,b[i],clamp(t,0,1))) as typeof c; };
  const river = Math.abs(z-riverCenterZ(x));
  if (river < 6 && x>-46 && x<55) mix([.27,.25,.17],1-river/6);
  const road = distanceToRoad(x,z);
  if (road<3.5) mix([.33,.24,.14],1-smoothstep(1.3,3.5,road));
  const village = Math.hypot(x-VILLAGE_POS.x,z-VILLAGE_POS.z);
  if (village<9) mix([.32,.28,.19],(1-smoothstep(4,9,village))*.85);
  const camp = Math.hypot(x-CAMPSITE_POS.x,z-CAMPSITE_POS.z);
  if (camp<8) mix([.16,.13,.10],1-smoothstep(3,8,camp));
  const quarry = Math.hypot(x-QUARRY_POS.x,z-QUARRY_POS.z);
  if (quarry<10) mix([.31,.30,.27],1-smoothstep(4,10,quarry));
  const mine = Math.hypot(x-CAVE_POS.x,z-CAVE_POS.z);
  if (mine<9) mix([.25,.28,.29],1-smoothstep(3,9,mine));
  mix([.24,.28,.30],Math.max(smoothstep(4.8,9,y),smoothstep(.6,1.5,surfaceSlopeAt(x,z)))*.8);
  if(y>14) mix([.7,.77,.8],smoothstep(14,22,y));
  return c;
}

export function isWaterAt(x: number, z: number): boolean {
  const rz = riverCenterZ(x);
  return Math.abs(z - rz) < 3.6 && x > -45 && x < 52 && groundHeightAt(x, z) < -0.1;
}

export function surfaceSlopeAt(x: number, z: number): number {
  const eps = 0.6;
  const hx = (groundHeightAt(x + eps, z) - groundHeightAt(x - eps, z)) / (2 * eps);
  const hz = (groundHeightAt(x, z + eps) - groundHeightAt(x, z - eps)) / (2 * eps);
  return Math.hypot(hx, hz);
}

export interface WorldObstacleCircle {
  x: number;
  z: number;
  radius: number;
  height: number;
  blocksLos: boolean;
}

// Deterministic collision footprints matching existing landmarks (cottages, watchtower pillars, cave rocks)
export const WORLD_OBSTACLES: WorldObstacleCircle[] = [
  // Oakhaven cottages (3 ruined houses)
  { x: VILLAGE_POS.x - 5.5, z: VILLAGE_POS.z + 3.5, radius: 2.75, height: 3.2, blocksLos: true },
  { x: VILLAGE_POS.x + 5.5, z: VILLAGE_POS.z - 3.0, radius: 2.75, height: 3.2, blocksLos: true },
  { x: VILLAGE_POS.x - 2.0, z: VILLAGE_POS.z - 6.5, radius: 2.75, height: 3.2, blocksLos: true },
  // Goblin campsite supply crate
  { x: CAMPSITE_POS.x + 1.2, z: CAMPSITE_POS.z - 0.8, radius: 0.78, height: 1.0, blocksLos: false },
  // Halbarad's watchfire
  { x: RANGER_POS.x - 2.2, z: RANGER_POS.z + 1.1, radius: 0.85, height: 0.9, blocksLos: false },
  // Shadowed Hollow cave perimeter boulders
  { x: CAVE_POS.x - 2.6, z: CAVE_POS.z, radius: 1.9, height: 4.5, blocksLos: true },
  { x: CAVE_POS.x + 2.6, z: CAVE_POS.z, radius: 1.9, height: 4.5, blocksLos: true },
  { x: CAVE_POS.x, z: CAVE_POS.z - 4.2, radius: 2.7, height: 4.5, blocksLos: true },
  { x: CAVE_POS.x - 3.0, z: CAVE_POS.z - 2.4, radius: 1.9, height: 4.5, blocksLos: true },
  { x: CAVE_POS.x + 3.0, z: CAVE_POS.z - 2.4, radius: 1.9, height: 4.5, blocksLos: true },
  // Amon Rhûn Watchtower pillars & central altar
  { x: WATCHTOWER_POS.x - 4.6, z: WATCHTOWER_POS.z - 4.2, radius: 1.15, height: 6.4, blocksLos: true },
  { x: WATCHTOWER_POS.x + 4.6, z: WATCHTOWER_POS.z - 4.2, radius: 1.15, height: 5.8, blocksLos: true },
  { x: WATCHTOWER_POS.x - 6.2, z: WATCHTOWER_POS.z + 0.4, radius: 1.15, height: 3.8, blocksLos: true },
  { x: WATCHTOWER_POS.x + 6.2, z: WATCHTOWER_POS.z + 0.4, radius: 1.15, height: 4.2, blocksLos: true },
  { x: WATCHTOWER_POS.x, z: WATCHTOWER_POS.z - 2.5, radius: 1.35, height: 1.4, blocksLos: false },
];

export function resolveObstaclePushOut(
  x: number,
  z: number,
  entityRadius: number,
): { x: number; z: number } {
  let rx = x;
  let rz = z;
  for (let i = 0; i < WORLD_OBSTACLES.length; i++) {
    const ob = WORLD_OBSTACLES[i];
    const minDist = ob.radius + entityRadius;
    const dx = rx - ob.x;
    const dz = rz - ob.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < minDist * minDist) {
      const dist = Math.sqrt(distSq);
      if (dist > 1e-4) {
        const push = (minDist - dist) / dist;
        rx += dx * push;
        rz += dz * push;
      } else {
        rz += minDist;
      }
    }
  }
  return { x: rx, z: rz };
}

export function hasLineOfSightXZ(x1: number, z1: number, x2: number, z2: number): boolean {
  const segDx = x2 - x1;
  const segDz = z2 - z1;
  const segLenSq = segDx * segDx + segDz * segDz;
  if (segLenSq < 1e-4) return true;

  for (let i = 0; i < WORLD_OBSTACLES.length; i++) {
    const ob = WORLD_OBSTACLES[i];
    if (!ob.blocksLos) continue;
    const t = clamp(((ob.x - x1) * segDx + (ob.z - z1) * segDz) / segLenSq, 0.05, 0.95);
    const closestX = x1 + segDx * t;
    const closestZ = z1 + segDz * t;
    const dSq = (ob.x - closestX) * (ob.x - closestX) + (ob.z - closestZ) * (ob.z - closestZ);
    if (dSq < (ob.radius * 0.85) * (ob.radius * 0.85)) {
      return false;
    }
  }
  return true;
}

export function clampCameraFractionOutsideObstacles(
  targetX: number,
  targetY: number,
  targetZ: number,
  desiredX: number,
  desiredY: number,
  desiredZ: number,
): number {
  let bestT = 1.0;
  const dx = desiredX - targetX;
  const dz = desiredZ - targetZ;
  const segLenSq = dx * dx + dz * dz;
  if (segLenSq < 1e-4) return 1.0;

  for (let i = 0; i < WORLD_OBSTACLES.length; i++) {
    const ob = WORLD_OBSTACLES[i];
    if (!ob.blocksLos) continue;
    const baseH = groundHeightAt(ob.x, ob.z);
    if (Math.min(targetY, desiredY) > baseH + ob.height + 0.5) continue;

    const r = ob.radius + 0.45;
    const fx = targetX - ob.x;
    const fz = targetZ - ob.z;
    const b = 2 * (fx * dx + fz * dz);
    const c = fx * fx + fz * fz - r * r;
    const disc = b * b - 4 * segLenSq * c;
    if (disc >= 0) {
      const sqrtDisc = Math.sqrt(disc);
      const t1 = (-b - sqrtDisc) / (2 * segLenSq);
      if (t1 > 0.08 && t1 < bestT) {
        bestT = Math.max(0.28, t1 - 0.04);
      }
    }
  }
  return bestT;
}

const STEER_CANDIDATE_ANGLES = [0, 0.58, -0.58, 1.15, -1.15, 1.75, -1.75];

/**
 * Computes a local obstacle-avoiding unit steering direction toward (targetX, targetZ).
 * Tests direct vector and rotated tangent candidates against WORLD_OBSTACLES.
 */
export function computeSteeredDirection(
  fromX: number,
  fromZ: number,
  targetX: number,
  targetZ: number,
  entityRadius = 0.55,
  lookAhead = 1.6,
): { x: number; z: number } {
  const dx = targetX - fromX;
  const dz = targetZ - fromZ;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-4) return { x: 0, z: 0 };

  const baseDirX = dx / dist;
  const baseDirZ = dz / dist;
  const probeDist = Math.min(lookAhead, Math.max(0.75, dist));

  let bestX = baseDirX;
  let bestZ = baseDirZ;
  let bestScore = -Infinity;

  for (let i = 0; i < STEER_CANDIDATE_ANGLES.length; i++) {
    const ang = STEER_CANDIDATE_ANGLES[i];
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const candX = baseDirX * c - baseDirZ * s;
    const candZ = baseDirX * s + baseDirZ * c;

    const testX = fromX + candX * probeDist;
    const testZ = fromZ + candZ * probeDist;
    const pushed = resolveObstaclePushOut(testX, testZ, entityRadius);
    const blocked = Math.hypot(pushed.x - testX, pushed.z - testZ) > 0.04;

    if (!blocked) {
      // Unblocked candidate: prefer smaller deviation from direct vector
      const alignment = candX * baseDirX + candZ * baseDirZ;
      if (i === 0) return { x: candX, z: candZ };
      if (alignment > bestScore) {
        bestScore = alignment;
        bestX = candX;
        bestZ = candZ;
      }
    }
  }

  return { x: bestX, z: bestZ };
}

