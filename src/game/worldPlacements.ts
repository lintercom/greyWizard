import {
  CAMPSITE_POS,
  CAVE_POS,
  PATROL_POS,
  RANGER_POS,
  VILLAGE_POS,
  WATCHTOWER_POS,
  distanceToRoad,
  groundHeightAt,
  riverCenterZ,
} from './terrain';

export function seededRand(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export interface TreeTransformDef {
  x: number;
  y: number;
  z: number;
  scale: number;
  rot: number;
  leanX: number;
  leanZ: number;
  tint: number;
}

export interface BushTransformDef {
  x: number;
  y: number;
  z: number;
  scale: number;
  rot: number;
  tint: number;
}

export interface RockTransformDef {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  rx: number;
  ry: number;
  rz: number;
  tint: number;
}

export interface GrassTransformDef {
  x: number;
  y: number;
  z: number;
  scale: number;
  rot: number;
  paletteIdx: number;
}

export interface FlowerTransformDef {
  x: number;
  y: number;
  z: number;
  scale: number;
  rot: number;
  tint: number;
}

export interface WorldDecorPlacements {
  pineTransforms: TreeTransformDef[];
  oakTransforms: TreeTransformDef[];
  bushTransforms: BushTransformDef[];
  rockTransforms: RockTransformDef[];
  grassTransforms: GrassTransformDef[];
  flowerTransforms: FlowerTransformDef[];
}

function buildWorldDecorPlacements(): WorldDecorPlacements {
  const pines: TreeTransformDef[] = [];
  const oaks: TreeTransformDef[] = [];

  for (let i = 0; i < 480; i++) {
    const r = 13 + seededRand(i * 3 + 1) * 76;
    const a = seededRand(i * 7 + 2) * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (distanceToRoad(x, z) < 5.6) continue;
    // Keep title screen & spawn camera sightlines uncluttered
    if (z > 46 && Math.abs(x) < 14) continue;
    if (Math.abs(z - riverCenterZ(x)) < 6.4) continue;
    if (Math.hypot(x - RANGER_POS.x, z - RANGER_POS.z) < 9) continue;
    if (Math.hypot(x - PATROL_POS.x, z - PATROL_POS.z) < 9) continue;
    if (Math.hypot(x - VILLAGE_POS.x, z - VILLAGE_POS.z) < 15) continue;
    if (Math.hypot(x - CAMPSITE_POS.x, z - CAMPSITE_POS.z) < 10) continue;
    if (Math.hypot(x - CAVE_POS.x, z - CAVE_POS.z) < 11) continue;
    if (Math.hypot(x - WATCHTOWER_POS.x, z - WATCHTOWER_POS.z) < 15) continue;

    const y = groundHeightAt(x, z);
    if (y > 9.5 || y < -0.1) continue;

    const preferOak = z > -5 && y < 3.6 && seededRand(i * 19 + 5) < 0.36;
    const entry: TreeTransformDef = {
      x,
      y,
      z,
      scale: (preferOak ? 0.82 : 0.78) + seededRand(i * 11 + 4) * 0.62,
      rot: seededRand(i * 13 + 5) * Math.PI * 2,
      leanX: (seededRand(i * 17 + 1) - 0.5) * 0.065,
      leanZ: (seededRand(i * 19 + 2) - 0.5) * 0.065,
      tint: i % 4,
    };
    if (preferOak && oaks.length < 56) {
      oaks.push(entry);
    } else if (pines.length < 162) {
      pines.push(entry);
    }
    if (pines.length >= 162 && oaks.length >= 56) break;
  }

  const bushes: BushTransformDef[] = [];
  for (let i = 0; i < 320; i++) {
    const r = 8 + seededRand(i * 13 + 5) * 74;
    const a = seededRand(i * 17 + 9) * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (distanceToRoad(x, z) < 3.8) continue;
    if (Math.abs(z - riverCenterZ(x)) < 5.0) continue;
    if (Math.hypot(x - VILLAGE_POS.x, z - VILLAGE_POS.z) < 11) continue;
    if (Math.hypot(x - WATCHTOWER_POS.x, z - WATCHTOWER_POS.z) < 12) continue;
    const y = groundHeightAt(x, z);
    if (y > 6.5 || y < 0.0) continue;
    bushes.push({
      x,
      y: y - 0.04,
      z,
      scale: 0.72 + seededRand(i * 23 + 3) * 0.7,
      rot: seededRand(i * 29 + 1) * Math.PI * 2,
      tint: i % 3,
    });
    if (bushes.length >= 130) break;
  }

  const rocks: RockTransformDef[] = [];
  for (let i = 0; i < 165; i++) {
    const r = 10 + seededRand(i * 19 + 3) * 78;
    const a = seededRand(i * 23 + 7) * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (distanceToRoad(x, z) < 3.8) continue;
    const y = groundHeightAt(x, z);
    rocks.push({
      x,
      y: y - 0.2,
      z,
      sx: 0.65 + seededRand(i * 29) * 1.35,
      sy: 0.45 + seededRand(i * 31) * 0.95,
      sz: 0.65 + seededRand(i * 37) * 1.25,
      rx: 0.08 + seededRand(i * 43) * 0.3,
      ry: seededRand(i * 41) * Math.PI * 2,
      rz: 0.06 + seededRand(i * 47) * 0.22,
      tint: i % 4,
    });
    if (rocks.length >= 96) break;
  }

  const grasses: GrassTransformDef[] = [];
  for (let i = 0; i < 950; i++) {
    const r = 3.5 + seededRand(i * 5 + 9) * 70;
    const a = seededRand(i * 9 + 3) * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (distanceToRoad(x, z) < 2.85) continue;
    if (Math.abs(z - riverCenterZ(x)) < 4.6) continue;
    const y = groundHeightAt(x, z);
    if (y > 5.2 || y < 0.05) continue;
    grasses.push({
      x,
      y: y - 0.04,
      z,
      scale: 0.75 + seededRand(i * 15 + 2) * 0.78,
      rot: seededRand(i * 21 + 4) * Math.PI * 2,
      paletteIdx: i % 4,
    });
    if (grasses.length >= 580) break;
  }

  const flowers: FlowerTransformDef[] = [];
  for (let i = 0; i < 260; i++) {
    const r = 4 + seededRand(i * 7 + 13) * 66;
    const a = seededRand(i * 11 + 5) * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (distanceToRoad(x, z) < 3.0) continue;
    if (Math.abs(z - riverCenterZ(x)) < 4.8) continue;
    const y = groundHeightAt(x, z);
    if (y > 3.6 || y < 0.1) continue;
    flowers.push({
      x,
      y: y - 0.02,
      z,
      scale: 0.75 + seededRand(i * 13 + 7) * 0.55,
      rot: seededRand(i * 17 + 1) * Math.PI * 2,
      tint: i % 3,
    });
    if (flowers.length >= 115) break;
  }

  return {
    pineTransforms: pines,
    oakTransforms: oaks,
    bushTransforms: bushes,
    rockTransforms: rocks,
    grassTransforms: grasses,
    flowerTransforms: flowers,
  };
}

export const WORLD_DECOR_PLACEMENTS: WorldDecorPlacements = buildWorldDecorPlacements();
