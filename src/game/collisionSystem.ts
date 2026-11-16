import {
  CAMPSITE_POS,
  CAVE_POS,
  PATROL_POS,
  PLAYABLE_LIMIT,
  QUARRY_POS,
  RANGER_POS,
  SPAWN_POS,
  VILLAGE_POS,
  VILLAGE_WELL_POS,
  WATCHTOWER_POS,
  WATERFALL_POS,
  clamp,
  groundHeightAt,
  riverCenterZ,
} from './terrain';
import { WORLD_DECOR_PLACEMENTS } from './worldPlacements';
import { WORLD_KIT, type KitAsset } from './worldKit';

export type CollisionCategory =
  | 'STATIC_WORLD'
  | 'DYNAMIC_ACTOR'
  | 'TRIGGER'
  | 'NON_COLLIDABLE';

export const COLLISION_BITS = {
  STATIC_WORLD: 0,
  DYNAMIC_ACTOR: 1,
  TRIGGER: 2,
  NON_COLLIDABLE: 3,
} as const;

export function packInteractionGroups(membershipMask: number, filterMask: number): number {
  return ((membershipMask & 0xffff) << 16) + (filterMask & 0xffff);
}

const BIT_STATIC = 1 << COLLISION_BITS.STATIC_WORLD;
const BIT_ACTOR = 1 << COLLISION_BITS.DYNAMIC_ACTOR;
const BIT_TRIGGER = 1 << COLLISION_BITS.TRIGGER;

export const RAPIER_GROUPS = {
  STATIC_WORLD: packInteractionGroups(BIT_STATIC, BIT_ACTOR),
  PLAYER_ACTOR: packInteractionGroups(BIT_ACTOR, BIT_STATIC | BIT_ACTOR),
  TRIGGER_ZONE: packInteractionGroups(BIT_TRIGGER, BIT_ACTOR),
} as const;

export const PLAYER_COLLIDER = {
  halfHeight: 0.45,
  radius: 0.42,
  // Total capsule height = 2 * halfHeight + 2 * radius = 1.74m; center is 0.87m above feet
  centerOffsetY: 0.87,
  height: 1.74,
  maxWalkableSlope: 0.85,
  maxStepHeight: 0.48,
  groundSnapDist: 0.22,
} as const;

export interface CollisionWorldContext {
  nelaRescued?: boolean;
}

export interface SolidActorCircle {
  id: string;
  x: number;
  z: number;
  radius: number;
}

export type StaticColliderTag =
  | 'cottage'
  | 'cave_wall'
  | 'cave_roof'
  | 'archway'
  | 'tower_pillar'
  | 'tower_lintel'
  | 'tower_pedestal'
  | 'palisade'
  | 'prisoner_cage'
  | 'campsite_tent'
  | 'prop'
  | 'tree_trunk'
  | 'boulder'
  | 'cliff_rock'
  | 'brazier'
  | 'rune_stone';

interface BaseStaticCollider {
  id: string;
  tag: StaticColliderTag;
  category: CollisionCategory;
  x: number;
  z: number;
  minY: number;
  maxY: number;
  boundR: number;
  blocksMovement: boolean;
  blocksCamera: boolean;
  blocksLos: boolean;
  blocksProjectiles: boolean;
  activeWhen?: 'nela_trapped';
}

export interface CylinderStaticCollider extends BaseStaticCollider {
  kind: 'cylinder';
  radius: number;
}

export interface ObbStaticCollider extends BaseStaticCollider {
  kind: 'obb';
  halfX: number;
  halfZ: number;
  rotY: number;
  cosY: number;
  sinY: number;
}

export type StaticColliderDef = CylinderStaticCollider | ObbStaticCollider;

function makeCylinder(params: {
  id: string;
  tag: StaticColliderTag;
  x: number;
  z: number;
  radius: number;
  minY: number;
  maxY: number;
  blocksMovement?: boolean;
  blocksCamera?: boolean;
  blocksLos?: boolean;
  blocksProjectiles?: boolean;
  activeWhen?: 'nela_trapped';
}): CylinderStaticCollider {
  return {
    id: params.id,
    tag: params.tag,
    category: 'STATIC_WORLD',
    kind: 'cylinder',
    x: params.x,
    z: params.z,
    radius: params.radius,
    minY: params.minY,
    maxY: params.maxY,
    boundR: params.radius,
    blocksMovement: params.blocksMovement ?? true,
    blocksCamera: params.blocksCamera ?? true,
    blocksLos: params.blocksLos ?? true,
    blocksProjectiles: params.blocksProjectiles ?? true,
    activeWhen: params.activeWhen,
  };
}

function makeObb(params: {
  id: string;
  tag: StaticColliderTag;
  x: number;
  z: number;
  halfX: number;
  halfZ: number;
  rotY?: number;
  minY: number;
  maxY: number;
  blocksMovement?: boolean;
  blocksCamera?: boolean;
  blocksLos?: boolean;
  blocksProjectiles?: boolean;
  activeWhen?: 'nela_trapped';
}): ObbStaticCollider {
  const rotY = params.rotY ?? 0;
  return {
    id: params.id,
    tag: params.tag,
    category: 'STATIC_WORLD',
    kind: 'obb',
    x: params.x,
    z: params.z,
    halfX: params.halfX,
    halfZ: params.halfZ,
    rotY,
    cosY: Math.cos(rotY),
    sinY: Math.sin(rotY),
    minY: params.minY,
    maxY: params.maxY,
    boundR: Math.hypot(params.halfX, params.halfZ),
    blocksMovement: params.blocksMovement ?? true,
    blocksCamera: params.blocksCamera ?? true,
    blocksLos: params.blocksLos ?? true,
    blocksProjectiles: params.blocksProjectiles ?? true,
    activeWhen: params.activeWhen,
  };
}

export function rotateLocalOffsetXZ(
  originX: number,
  originZ: number,
  localX: number,
  localZ: number,
  rotY: number,
): { x: number; z: number } {
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  return {
    x: originX + localX * c + localZ * s,
    z: originZ - localX * s + localZ * c,
  };
}

export const COTTAGE_SPECS = [
  { dx: -5.5, dz: 3.5, rot: 0.25, roofColor: '#483b32' },
  { dx: 5.5, dz: -3.0, rot: -0.6, roofColor: '#3f474d' },
  { dx: -2.0, dz: -6.5, rot: 1.35, roofColor: '#524136' },
] as const;

export const FINGERPOST_SPECS = [
  { x: -3.5, z: 46.5, rot: -0.25 },
  { x: -11.5, z: 8, rot: -0.4 },
  { x: -14, z: -26, rot: 0.1 },
] as const;

export const WATCHTOWER_PILLAR_SPECS = [
  { dx: -4.6, dz: -4.2, h: 6.4 },
  { dx: 4.6, dz: -4.2, h: 5.8 },
  { dx: -6.2, dz: 0.4, h: 3.8 },
  { dx: 6.2, dz: 0.4, h: 4.2 },
] as const;

export const WATCHTOWER_DAIS = {
  x: WATCHTOWER_POS.x,
  z: WATCHTOWER_POS.z,
  topRadius: 9.45,
  outerRadius: 9.85,
  heightAboveCenterGround: 0.425,
} as const;

function buildStaticWorldColliders(): StaticColliderDef[] {
  const list: StaticColliderDef[] = [];

  // Identical authored boxes drive Rapier, camera occlusion, AI and projectiles.
  for (const p of WORLD_KIT.placements) {
    const baseY = groundHeightAt(p.x,p.z);
    WORLD_KIT.assets[p.asset as KitAsset].boxes.forEach((b,i) => {
      const pt = rotateLocalOffsetXZ(p.x,p.z,b[0],b[2],p.rotation);
      list.push(makeObb({id:`kit_${p.id}_${i}`,tag:'prop',x:pt.x,z:pt.z,
        halfX:b[3],halfZ:b[5],rotY:p.rotation,minY:baseY+b[1]-b[4],maxY:baseY+b[1]+b[4]}));
    });
  }

  const villageY = groundHeightAt(VILLAGE_POS.x, VILLAGE_POS.z);
  const campY = groundHeightAt(CAMPSITE_POS.x, CAMPSITE_POS.z);
  const caveY = groundHeightAt(CAVE_POS.x, CAVE_POS.z);
  const towerY = groundHeightAt(WATCHTOWER_POS.x, WATCHTOWER_POS.z);
  const patrolY = groundHeightAt(PATROL_POS.x, PATROL_POS.z);
  const quarryY = groundHeightAt(QUARRY_POS.x, QUARRY_POS.z);
  const rangerFireY = groundHeightAt(RANGER_POS.x - 2.2, RANGER_POS.z + 1.1);

  // 1. Osada Líska cottages (exact rotated OBB walls + overhanging roofs for camera)
  COTTAGE_SPECS.forEach((c, idx) => {
    list.push(
      makeObb({
        id: `cottage_${idx}`,
        tag: 'cottage',
        x: VILLAGE_POS.x + c.dx,
        z: VILLAGE_POS.z + c.dz,
        halfX: 2.18,
        halfZ: 2.58,
        rotY: c.rot,
        minY: villageY - 0.5,
        maxY: villageY + 3.4,
      }),
    );
  });

  const wellY = groundHeightAt(VILLAGE_WELL_POS.x, VILLAGE_WELL_POS.z);
  list.push(makeCylinder({
    id: 'liska_well', tag: 'prop', x: VILLAGE_WELL_POS.x, z: VILLAGE_WELL_POS.z,
    radius: 0.96, minY: wellY - 0.1, maxY: wellY + 2.4,
    blocksCamera: false, blocksLos: false,
  }));

  // Rovan's ledger table & barrel
  list.push(
    makeObb({
      id: 'rovan_table',
      tag: 'prop',
      x: VILLAGE_POS.x - 4.8,
      z: VILLAGE_POS.z + 1.4,
      halfX: 0.6,
      halfZ: 0.42,
      minY: villageY - 0.2,
      maxY: villageY + 0.65,
      blocksCamera: false,
      blocksLos: false,
    }),
    makeCylinder({
      id: 'village_barrel',
      tag: 'prop',
      x: VILLAGE_POS.x - 3.75,
      z: VILLAGE_POS.z + 1.1,
      radius: 0.3,
      minY: villageY - 0.2,
      maxY: villageY + 0.72,
      blocksCamera: false,
      blocksLos: false,
    }),
  );

  // 2. Riderless Horse Prop at Spawn overlook
  const horseX = SPAWN_POS.x + 2.5;
  const horseZ = SPAWN_POS.z - 5.5;
  const horseY = groundHeightAt(horseX, horseZ);
  list.push(
    makeObb({
      id: 'riderless_horse',
      tag: 'prop',
      x: horseX,
      z: horseZ,
      halfX: 0.42,
      halfZ: 0.78,
      rotY: -1.22,
      minY: horseY - 0.2,
      maxY: horseY + 1.55,
      blocksLos: false,
    }),
  );

  // 3. Wooden Fingerpost Milestone Signs
  FINGERPOST_SPECS.forEach((s, idx) => {
    const sy = groundHeightAt(s.x, s.z);
    list.push(
      makeCylinder({
        id: `fingerpost_${idx}`,
        tag: 'prop',
        x: s.x,
        z: s.z,
        radius: 0.22,
        minY: sy - 0.2,
        maxY: sy + 1.65,
        blocksCamera: false,
        blocksLos: false,
      }),
    );
  });

  // 4. Wrecked Caravan Cart & Spilled Barrel at Patrol Trail
  const cartX = PATROL_POS.x - 1.5;
  const cartZ = PATROL_POS.z + 0.5;
  const barrelWorld = rotateLocalOffsetXZ(cartX, cartZ, -1.4, 1.15, 0.42);
  list.push(
    makeObb({
      id: 'caravan_cart',
      tag: 'prop',
      x: cartX,
      z: cartZ,
      halfX: 1.15,
      halfZ: 0.82,
      rotY: 0.42,
      minY: patrolY - 0.2,
      maxY: patrolY + 1.05,
      blocksLos: false,
    }),
    makeCylinder({
      id: 'caravan_barrel',
      tag: 'prop',
      x: barrelWorld.x,
      z: barrelWorld.z,
      radius: 0.42,
      minY: patrolY - 0.2,
      maxY: patrolY + 0.72,
      blocksCamera: false,
      blocksLos: false,
    }),
  );

  // 5. Edran's Watchfire Ring
  list.push(
    makeCylinder({
      id: 'ranger_watchfire',
      tag: 'prop',
      x: RANGER_POS.x - 2.2,
      z: RANGER_POS.z + 1.1,
      radius: 0.76,
      minY: rangerFireY - 0.2,
      maxY: rangerFireY + 0.55,
      blocksCamera: false,
      blocksLos: false,
      blocksProjectiles: false,
    }),
  );

  // 6. Goblin Campsite Tents & Supply Crate
  list.push(
    makeCylinder({
      id: 'camp_tent_west',
      tag: 'campsite_tent',
      x: CAMPSITE_POS.x - 3.2,
      z: CAMPSITE_POS.z - 2.2,
      radius: 1.8,
      minY: campY - 0.2,
      maxY: campY + 2.25,
    }),
    makeCylinder({
      id: 'camp_tent_east',
      tag: 'campsite_tent',
      x: CAMPSITE_POS.x + 3.4,
      z: CAMPSITE_POS.z - 2.4,
      radius: 1.8,
      minY: campY - 0.2,
      maxY: campY + 2.25,
    }),
    makeObb({
      id: 'camp_supply_crate',
      tag: 'prop',
      x: CAMPSITE_POS.x + 1.2,
      z: CAMPSITE_POS.z - 0.8,
      halfX: 0.52,
      halfZ: 0.52,
      minY: campY - 0.2,
      maxY: campY + 0.85,
      blocksCamera: false,
      blocksLos: false,
    }),
  );

  // 7. Dwarven Mines (Staré trpasličí štoly) Walls, Roof, Archway & Runes
  list.push(
    makeObb({
      id: 'cave_front_left',
      tag: 'cave_wall',
      x: CAVE_POS.x - 2.6,
      z: CAVE_POS.z,
      halfX: 1.22,
      halfZ: 1.42,
      minY: caveY - 0.5,
      maxY: caveY + 3.6,
    }),
    makeObb({
      id: 'cave_front_right',
      tag: 'cave_wall',
      x: CAVE_POS.x + 2.6,
      z: CAVE_POS.z,
      halfX: 1.22,
      halfZ: 1.42,
      minY: caveY - 0.5,
      maxY: caveY + 3.6,
    }),
    makeObb({
      id: 'cave_mid_left',
      tag: 'cave_wall',
      x: CAVE_POS.x - 3.0,
      z: CAVE_POS.z - 2.4,
      halfX: 1.32,
      halfZ: 1.62,
      minY: caveY - 0.5,
      maxY: caveY + 3.8,
    }),
    makeObb({
      id: 'cave_mid_right',
      tag: 'cave_wall',
      x: CAVE_POS.x + 3.0,
      z: CAVE_POS.z - 2.4,
      halfX: 1.32,
      halfZ: 1.62,
      minY: caveY - 0.5,
      maxY: caveY + 3.8,
    }),
    makeObb({
      id: 'cave_rear_wall',
      tag: 'cave_wall',
      x: CAVE_POS.x,
      z: CAVE_POS.z - 4.2,
      halfX: 2.9,
      halfZ: 1.35,
      minY: caveY - 0.5,
      maxY: caveY + 4.2,
    }),
    makeObb({
      id: 'cave_roof',
      tag: 'cave_roof',
      x: CAVE_POS.x,
      z: CAVE_POS.z - 0.8,
      halfX: 3.1,
      halfZ: 2.2,
      minY: caveY + 2.45,
      maxY: caveY + 4.8,
      blocksMovement: false,
      blocksLos: false,
    }),
    makeObb({
      id: 'cave_arch_pillar_left',
      tag: 'archway',
      x: CAVE_POS.x - 1.9,
      z: CAVE_POS.z + 1.15,
      halfX: 0.3,
      halfZ: 0.34,
      minY: caveY - 0.2,
      maxY: caveY + 3.15,
    }),
    makeObb({
      id: 'cave_arch_pillar_right',
      tag: 'archway',
      x: CAVE_POS.x + 1.9,
      z: CAVE_POS.z + 1.15,
      halfX: 0.3,
      halfZ: 0.34,
      minY: caveY - 0.2,
      maxY: caveY + 3.15,
    }),
    makeObb({
      id: 'cave_arch_lintel',
      tag: 'archway',
      x: CAVE_POS.x,
      z: CAVE_POS.z + 1.15,
      halfX: 2.32,
      halfZ: 0.42,
      minY: caveY + 2.88,
      maxY: caveY + 3.6,
      blocksMovement: false,
      blocksLos: false,
    }),
  );

  // Three Stone Runes
  [
    { id: 'rune_hammer', dx: -2.3, dz: 1.5 },
    { id: 'rune_mountain', dx: 0, dz: -0.6 },
    { id: 'rune_torch', dx: 2.3, dz: 1.5 },
  ].forEach((r) => {
    const rx = CAVE_POS.x + r.dx;
    const rz = CAVE_POS.z + r.dz;
    const ry = groundHeightAt(rx, rz);
    list.push(
      makeCylinder({
        id: r.id,
        tag: 'rune_stone',
        x: rx,
        z: rz,
        radius: 0.36,
        minY: ry - 0.2,
        maxY: ry + 1.65,
        blocksCamera: false,
        blocksLos: false,
      }),
    );
  });

  // 8. Quarry Supply Wagon
  list.push(
    makeObb({
      id: 'quarry_wagon',
      tag: 'prop',
      x: QUARRY_POS.x,
      z: QUARRY_POS.z,
      halfX: 0.98,
      halfZ: 1.24,
      rotY: 0.65,
      minY: quarryY - 0.2,
      maxY: quarryY + 1.98,
    }),
  );

  // 9. Mountain Fortress (Watchtower) Pillars, Lintel, Pedestal, Palisades, Beacons, Cage
  WATCHTOWER_PILLAR_SPECS.forEach((p, idx) => {
    list.push(
      makeObb({
        id: `tower_pillar_${idx}`,
        tag: 'tower_pillar',
        x: WATCHTOWER_POS.x + p.dx,
        z: WATCHTOWER_POS.z + p.dz,
        halfX: 0.96,
        halfZ: 0.96,
        minY: towerY - 0.2,
        maxY: towerY + p.h + 0.3,
      }),
    );
  });

  list.push(
    makeObb({
      id: 'tower_rear_lintel',
      tag: 'tower_lintel',
      x: WATCHTOWER_POS.x,
      z: WATCHTOWER_POS.z - 4.2,
      halfX: 5.15,
      halfZ: 0.78,
      minY: towerY + 4.75,
      maxY: towerY + 6.1,
      blocksMovement: false,
      blocksLos: false,
    }),
    makeCylinder({
      id: 'tower_pedestal',
      tag: 'tower_pedestal',
      x: WATCHTOWER_POS.x,
      z: WATCHTOWER_POS.z - 2.5,
      radius: 1.35,
      minY: towerY - 0.1,
      maxY: towerY + 1.55,
      blocksLos: false,
    }),
    makeObb({
      id: 'tower_palisade_west',
      tag: 'palisade',
      x: WATCHTOWER_POS.x - 7.6,
      z: WATCHTOWER_POS.z + 2.2,
      halfX: 0.95,
      halfZ: 0.45,
      rotY: 0.5,
      minY: towerY - 0.2,
      maxY: towerY + 1.65,
      blocksCamera: false,
      blocksLos: false,
    }),
    makeObb({
      id: 'tower_palisade_east',
      tag: 'palisade',
      x: WATCHTOWER_POS.x + 7.6,
      z: WATCHTOWER_POS.z + 2.2,
      halfX: 0.95,
      halfZ: 0.45,
      rotY: -0.5,
      minY: towerY - 0.2,
      maxY: towerY + 1.65,
      blocksCamera: false,
      blocksLos: false,
    }),
    makeObb({
      id: 'tower_prisoner_cage',
      tag: 'prisoner_cage',
      x: WATCHTOWER_POS.x - 5.2,
      z: WATCHTOWER_POS.z + 6.4,
      halfX: 1.02,
      halfZ: 1.02,
      minY: towerY - 0.2,
      maxY: towerY + 2.35,
      blocksLos: false,
      activeWhen: 'nela_trapped',
    }),
  );

  // Fortress Signal Beacons & Environmental Braziers
  [
    { id: 'beacon_west', x: WATCHTOWER_POS.x - 5.4, z: WATCHTOWER_POS.z + 3.2 },
    { id: 'beacon_east', x: WATCHTOWER_POS.x + 5.4, z: WATCHTOWER_POS.z + 3.2 },
    { id: 'beacon_summit', x: WATCHTOWER_POS.x, z: WATCHTOWER_POS.z - 3.2 },
  ].forEach((b) => {
    const by = groundHeightAt(b.x, b.z);
    list.push(
      makeCylinder({
        id: b.id,
        tag: 'brazier',
        x: b.x,
        z: b.z,
        radius: 0.5,
        minY: by - 0.2,
        maxY: by + 1.25,
        blocksCamera: false,
        blocksLos: false,
        blocksProjectiles: false,
      }),
    );
  });

  [
    { id: 'brazier_camp_1', x: CAMPSITE_POS.x - 1.5, z: CAMPSITE_POS.z + 1.5 },
    { id: 'brazier_village_1', x: VILLAGE_POS.x, z: VILLAGE_POS.z + 4.5 },
    { id: 'brazier_tower_1', x: WATCHTOWER_POS.x - 4.2, z: WATCHTOWER_POS.z + 4.5 },
    { id: 'brazier_tower_2', x: WATCHTOWER_POS.x + 4.2, z: WATCHTOWER_POS.z + 4.5 },
  ].forEach((b) => {
    const by = groundHeightAt(b.x, b.z);
    list.push(
      makeCylinder({
        id: b.id,
        tag: 'brazier',
        x: b.x,
        z: b.z,
        radius: 0.44,
        minY: by - 0.2,
        maxY: by + 1.15,
        blocksCamera: false,
        blocksLos: false,
        blocksProjectiles: false,
      }),
    );
  });

  // 10. Western Waterfall Flanking Cliffs
  const fallOriginX = WATERFALL_POS.x + 2;
  const fallOriginZ = riverCenterZ(WATERFALL_POS.x);
  list.push(
    makeObb({
      id: 'waterfall_cliff_left',
      tag: 'cliff_rock',
      x: fallOriginX - 0.6,
      z: fallOriginZ - 2.6,
      halfX: 1.75,
      halfZ: 1.55,
      rotY: 0.4,
      minY: -0.5,
      maxY: 5.0,
    }),
    makeObb({
      id: 'waterfall_cliff_right',
      tag: 'cliff_rock',
      x: fallOriginX - 0.6,
      z: fallOriginZ + 2.6,
      halfX: 1.75,
      halfZ: 1.55,
      rotY: 1.1,
      minY: -0.5,
      maxY: 5.0,
    }),
    makeObb({
      id: 'waterfall_cliff_top',
      tag: 'cliff_rock',
      x: fallOriginX - 1.4,
      z: fallOriginZ,
      halfX: 1.45,
      halfZ: 2.65,
      minY: 3.4,
      maxY: 6.1,
    }),
  );

  // 11. All Pine & Oak Tree Trunks ONLY (foliage canopies are NON_COLLIDABLE!)
  WORLD_DECOR_PLACEMENTS.pineTransforms.forEach((t, idx) => {
    const radius = Math.max(0.24, 0.31 * t.scale);
    const height = 3.05 * t.scale;
    list.push(
      makeCylinder({
        id: `pine_trunk_${idx}`,
        tag: 'tree_trunk',
        x: t.x,
        z: t.z,
        radius,
        minY: t.y - 0.25,
        maxY: t.y + height,
      }),
    );
  });

  WORLD_DECOR_PLACEMENTS.oakTransforms.forEach((t, idx) => {
    const radius = Math.max(0.28, 0.36 * t.scale);
    const height = 2.6 * t.scale;
    list.push(
      makeCylinder({
        id: `oak_trunk_${idx}`,
        tag: 'tree_trunk',
        x: t.x,
        z: t.z,
        radius,
        minY: t.y - 0.25,
        maxY: t.y + height,
      }),
    );
  });

  // 12. All Chiseled World Boulders (Bushes, Grass Tufts & Wildflowers remain NON_COLLIDABLE)
  WORLD_DECOR_PLACEMENTS.rockTransforms.forEach((rk, idx) => {
    const halfX = 0.78 * rk.sx;
    const halfZ = 0.78 * rk.sz;
    const minY = rk.y - 0.2;
    const maxY = rk.y + rk.sy * 1.18;
    list.push(
      makeObb({
        id: `world_rock_${idx}`,
        tag: 'boulder',
        x: rk.x,
        z: rk.z,
        halfX,
        halfZ,
        rotY: rk.ry,
        minY,
        maxY,
      }),
    );
  });

  return list;
}

export const STATIC_COLLIDERS: StaticColliderDef[] = buildStaticWorldColliders();

export function isColliderActive(col: StaticColliderDef, ctx?: CollisionWorldContext): boolean {
  if (col.activeWhen === 'nela_trapped') {
    return !(ctx?.nelaRescued ?? false);
  }
  return true;
}

/**
 * Combined walkable ground + elevated stone platform height (e.g. Mountain Fortress floor).
 */
export function walkableSurfaceHeightAt(x: number, z: number): number {
  const baseH = groundHeightAt(x, z);
  const dx = x - WATCHTOWER_DAIS.x;
  const dz = z - WATCHTOWER_DAIS.z;
  const dist = Math.hypot(dx, dz);
  if (dist <= WATCHTOWER_DAIS.outerRadius) {
    const towerCenterH = groundHeightAt(WATCHTOWER_DAIS.x, WATCHTOWER_DAIS.z);
    const daisTop = towerCenterH + WATCHTOWER_DAIS.heightAboveCenterGround;
    if (dist <= WATCHTOWER_DAIS.topRadius) {
      return Math.max(baseH, daisTop);
    }
    const bevelT = 1 - (dist - WATCHTOWER_DAIS.topRadius) / (WATCHTOWER_DAIS.outerRadius - WATCHTOWER_DAIS.topRadius);
    return Math.max(baseH, towerCenterH + WATCHTOWER_DAIS.heightAboveCenterGround * bevelT * 0.5);
  }
  return baseH;
}

export function terrainSlopeVectorAt(
  x: number,
  z: number,
): { slope: number; gx: number; gz: number } {
  const eps = 0.55;
  const gx = (walkableSurfaceHeightAt(x + eps, z) - walkableSurfaceHeightAt(x - eps, z)) / (2 * eps);
  const gz = (walkableSurfaceHeightAt(x, z + eps) - walkableSurfaceHeightAt(x, z - eps)) / (2 * eps);
  return { slope: Math.hypot(gx, gz), gx, gz };
}

function pushOutCylinder(
  rx: number,
  rz: number,
  cx: number,
  cz: number,
  minDist: number,
): { x: number; z: number; hit: boolean } {
  const dx = rx - cx;
  const dz = rz - cz;
  const distSq = dx * dx + dz * dz;
  if (distSq >= minDist * minDist) return { x: rx, z: rz, hit: false };
  const dist = Math.sqrt(distSq);
  if (dist > 1e-4) {
    const push = (minDist - dist) / dist;
    return { x: rx + dx * push, z: rz + dz * push, hit: true };
  }
  return { x: rx, z: rz + minDist, hit: true };
}

function pushOutObb(
  rx: number,
  rz: number,
  ob: ObbStaticCollider,
  entityRadius: number,
): { x: number; z: number; hit: boolean } {
  const dx = rx - ob.x;
  const dz = rz - ob.z;
  const lx = dx * ob.cosY - dz * ob.sinY;
  const lz = dx * ob.sinY + dz * ob.cosY;

  const cx = clamp(lx, -ob.halfX, ob.halfX);
  const cz = clamp(lz, -ob.halfZ, ob.halfZ);
  const dlx = lx - cx;
  const dlz = lz - cz;
  const distSq = dlx * dlx + dlz * dlz;

  if (distSq > 1e-8) {
    if (distSq >= entityRadius * entityRadius) return { x: rx, z: rz, hit: false };
    const dist = Math.sqrt(distSq);
    const pen = entityRadius - dist;
    const nxl = dlx / dist;
    const nzl = dlz / dist;
    const wx = nxl * ob.cosY + nzl * ob.sinY;
    const wz = -nxl * ob.sinY + nzl * ob.cosY;
    return { x: rx + wx * pen, z: rz + wz * pen, hit: true };
  }

  // Center of entity is inside the OBB: push out along nearest face
  const penX = ob.halfX - Math.abs(lx);
  const penZ = ob.halfZ - Math.abs(lz);
  let nxl = 0;
  let nzl = 0;
  let pen = 0;
  if (penX < penZ) {
    nxl = lx >= 0 ? 1 : -1;
    pen = penX + entityRadius;
  } else {
    nzl = lz >= 0 ? 1 : -1;
    pen = penZ + entityRadius;
  }
  const wx = nxl * ob.cosY + nzl * ob.sinY;
  const wz = -nxl * ob.sinY + nzl * ob.cosY;
  return { x: rx + wx * pen, z: rz + wz * pen, hit: true };
}

/**
 * Multi-pass iterative push-out against all active solid static colliders (OBBs + cylinders).
 */
export function resolveStaticCollisionsXZ(
  x: number,
  z: number,
  entityRadius: number,
  ctx?: CollisionWorldContext,
  entityFeetY?: number,
  entityHeight = 1.74,
  out: { x: number; z: number } = { x: 0, z: 0 },
): { x: number; z: number } {
  let rx = x;
  let rz = z;
  const feetY = entityFeetY ?? walkableSurfaceHeightAt(x, z);
  const minCheckY = feetY + 0.15;
  const maxCheckY = feetY + entityHeight;

  for (let pass = 0; pass < 3; pass++) {
    let anyHit = false;
    for (let i = 0; i < STATIC_COLLIDERS.length; i++) {
      const col = STATIC_COLLIDERS[i];
      if (!col.blocksMovement || !isColliderActive(col, ctx)) continue;
      if (col.maxY < minCheckY || col.minY > maxCheckY) continue;

      const broad = col.boundR + entityRadius + 0.05;
      if (Math.abs(rx - col.x) > broad || Math.abs(rz - col.z) > broad) continue;

      if (col.kind === 'cylinder') {
        const res = pushOutCylinder(rx, rz, col.x, col.z, col.radius + entityRadius);
        if (res.hit) {
          rx = res.x;
          rz = res.z;
          anyHit = true;
        }
      } else {
        const res = pushOutObb(rx, rz, col, entityRadius);
        if (res.hit) {
          rx = res.x;
          rz = res.z;
          anyHit = true;
        }
      }
    }
    if (!anyHit) break;
  }

  out.x = rx;
  out.z = rz;
  return out;
}

/**
 * Resolves solid actor-to-actor separation first, followed by authoritative static world push-out
 * so actors never push each other inside walls or solid world props.
 */
export function resolveActorAndStaticCollisionsXZ(
  x: number,
  z: number,
  entityRadius: number,
  otherActors: ReadonlyArray<SolidActorCircle>,
  selfId: string | null,
  ctx?: CollisionWorldContext,
  entityFeetY?: number,
  out: { x: number; z: number } = { x: 0, z: 0 },
): { x: number; z: number } {
  let rx = x;
  let rz = z;

  for (let i = 0; i < otherActors.length; i++) {
    const other = otherActors[i];
    if (selfId && other.id === selfId) continue;
    const minDist = entityRadius + other.radius;
    if (Math.abs(rx - other.x) > minDist || Math.abs(rz - other.z) > minDist) continue;
    const res = pushOutCylinder(rx, rz, other.x, other.z, minDist);
    rx = res.x;
    rz = res.z;
  }

  return resolveStaticCollisionsXZ(rx, rz, entityRadius, ctx, entityFeetY, PLAYER_COLLIDER.height, out);
}

export interface PlayerCollisionMotionResult {
  nextX: number;
  nextZ: number;
  slideVx: number;
  slideVz: number;
  hitSlopeWall: boolean;
  hitWorldBoundary: boolean;
}

const _stepScratch = { x: 0, z: 0 };

/**
 * Sub-stepped character motion solver for Gandalf:
 * - Blocks steep cliffs (> maxWalkableSlope) and projects velocity tangent to cliff contours
 * - Enforces playable valley boundary smoothly without rubberband bounce
 * - Sub-steps fast dodges/lunges against all static obstacles + dynamic actors
 */
export function stepPlayerCollisionMotion(
  curX: number,
  curZ: number,
  curFeetY: number,
  velX: number,
  velZ: number,
  dt: number,
  otherActors: ReadonlyArray<SolidActorCircle>,
  ctx?: CollisionWorldContext,
): PlayerCollisionMotionResult {
  let vx = velX;
  let vz = velZ;
  let hitSlopeWall = false;
  let hitWorldBoundary = false;

  const safeDt = Math.max(0, Math.min(dt, 0.05));
  const totalDisp = Math.hypot(vx, vz) * safeDt;
  const subSteps = Math.max(1, Math.min(6, Math.ceil(totalDisp / 0.18)));
  const subDt = subSteps > 0 ? safeDt / subSteps : 0;

  let px = curX;
  let pz = curZ;

  for (let s = 0; s < subSteps; s++) {
    let candX = px + vx * subDt;
    let candZ = pz + vz * subDt;

    // 1. Steep cliff slope blocking (slides smoothly along cliff face)
    const { slope, gx, gz } = terrainSlopeVectorAt(candX, candZ);
    const curSurfY = walkableSurfaceHeightAt(px, pz);
    const candSurfY = walkableSurfaceHeightAt(candX, candZ);
    const stepDeltaY = candSurfY - curSurfY;
    if (slope > PLAYER_COLLIDER.maxWalkableSlope && stepDeltaY > 0.015) {
      const gradLen = Math.hypot(gx, gz);
      if (gradLen > 1e-4) {
        const nx = gx / gradLen;
        const nz = gz / gradLen;
        const uphillVel = vx * nx + vz * nz;
        if (uphillVel > 0) {
          vx -= nx * uphillVel;
          vz -= nz * uphillVel;
          candX = px + vx * subDt;
          candZ = pz + vz * subDt;
          hitSlopeWall = true;
        }
      }
    }

    // 2. Playable rim boundary tangent projection
    const radial = Math.hypot(candX, candZ);
    if (radial > PLAYABLE_LIMIT) {
      const rnx = candX / radial;
      const rnz = candZ / radial;
      const outVel = vx * rnx + vz * rnz;
      if (outVel > 0) {
        vx -= rnx * outVel;
        vz -= rnz * outVel;
      }
      candX = rnx * PLAYABLE_LIMIT;
      candZ = rnz * PLAYABLE_LIMIT;
      hitWorldBoundary = true;
    }

    // 3. Solid actor + static world push-out
    resolveActorAndStaticCollisionsXZ(
      candX,
      candZ,
      PLAYER_COLLIDER.radius,
      otherActors,
      'player',
      ctx,
      Math.max(curFeetY, curSurfY),
      _stepScratch,
    );
    px = _stepScratch.x;
    pz = _stepScratch.z;
  }

  const slideVx = safeDt > 1e-5 ? (px - curX) / safeDt : 0;
  const slideVz = safeDt > 1e-5 ? (pz - curZ) / safeDt : 0;

  return {
    nextX: px,
    nextZ: pz,
    slideVx,
    slideVz,
    hitSlopeWall,
    hitWorldBoundary,
  };
}

function intersectSegmentObb3D(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  ob: ObbStaticCollider,
  padXZ: number,
  padY: number,
): number | null {
  const dax = ax - ob.x;
  const daz = az - ob.z;
  const lax = dax * ob.cosY - daz * ob.sinY;
  const laz = dax * ob.sinY + daz * ob.cosY;

  const dbx = bx - ob.x;
  const dbz = bz - ob.z;
  const lbx = dbx * ob.cosY - dbz * ob.sinY;
  const lbz = dbx * ob.sinY + dbz * ob.cosY;

  const dx = lbx - lax;
  const dy = by - ay;
  const dz = lbz - laz;

  const minX = -ob.halfX - padXZ;
  const maxX = ob.halfX + padXZ;
  const minY = ob.minY - padY;
  const maxY = ob.maxY + padY;
  const minZ = -ob.halfZ - padXZ;
  const maxZ = ob.halfZ + padXZ;

  let tMin = 0;
  let tMax = 1;

  // X slab
  if (Math.abs(dx) < 1e-7) {
    if (lax < minX || lax > maxX) return null;
  } else {
    const inv = 1 / dx;
    let t1 = (minX - lax) * inv;
    let t2 = (maxX - lax) * inv;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }

  // Y slab
  if (Math.abs(dy) < 1e-7) {
    if (ay < minY || ay > maxY) return null;
  } else {
    const inv = 1 / dy;
    let t1 = (minY - ay) * inv;
    let t2 = (maxY - ay) * inv;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }

  // Z slab
  if (Math.abs(dz) < 1e-7) {
    if (laz < minZ || laz > maxZ) return null;
  } else {
    const inv = 1 / dz;
    let t1 = (minZ - laz) * inv;
    let t2 = (maxZ - laz) * inv;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }

  return tMin >= 0 && tMin <= 1 ? tMin : null;
}

function intersectSegmentCylinder3D(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  col: CylinderStaticCollider,
  padXZ: number,
  padY: number,
): number | null {
  const dy = by - ay;
  const minY = col.minY - padY;
  const maxY = col.maxY + padY;

  let tMinY = 0;
  let tMaxY = 1;
  if (Math.abs(dy) < 1e-7) {
    if (ay < minY || ay > maxY) return null;
  } else {
    const inv = 1 / dy;
    let t1 = (minY - ay) * inv;
    let t2 = (maxY - ay) * inv;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMinY = Math.max(0, t1);
    tMaxY = Math.min(1, t2);
    if (tMinY > tMaxY) return null;
  }

  const r = col.radius + padXZ;
  const fx = ax - col.x;
  const fz = az - col.z;
  const dx = bx - ax;
  const dz = bz - az;
  const a = dx * dx + dz * dz;
  if (a < 1e-8) {
    return fx * fx + fz * fz <= r * r ? tMinY : null;
  }
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;

  const sqrtDisc = Math.sqrt(disc);
  const t0 = (-b - sqrtDisc) / (2 * a);
  const t1 = (-b + sqrtDisc) / (2 * a);
  const enter = Math.max(tMinY, t0);
  const exit = Math.min(tMaxY, t1);
  if (enter <= exit && exit >= 0 && enter <= 1) {
    return Math.max(0, enter);
  }
  return null;
}

export function raycastSegmentStatic(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  filterField: 'blocksLos' | 'blocksCamera' | 'blocksProjectiles',
  padXZ = 0,
  padY = 0,
  ctx?: CollisionWorldContext,
): { hit: boolean; t: number; colliderId: string | null } {
  let bestT = 1.0001;
  let hitId: string | null = null;

  const segMinX = Math.min(ax, bx) - padXZ;
  const segMaxX = Math.max(ax, bx) + padXZ;
  const segMinZ = Math.min(az, bz) - padXZ;
  const segMaxZ = Math.max(az, bz) + padXZ;

  for (let i = 0; i < STATIC_COLLIDERS.length; i++) {
    const col = STATIC_COLLIDERS[i];
    if (!col[filterField] || !isColliderActive(col, ctx)) continue;

    if (
      col.x + col.boundR < segMinX ||
      col.x - col.boundR > segMaxX ||
      col.z + col.boundR < segMinZ ||
      col.z - col.boundR > segMaxZ
    ) {
      continue;
    }

    const hitT =
      col.kind === 'cylinder'
        ? intersectSegmentCylinder3D(ax, ay, az, bx, by, bz, col, padXZ, padY)
        : intersectSegmentObb3D(ax, ay, az, bx, by, bz, col, padXZ, padY);

    if (hitT !== null && hitT < bestT) {
      bestT = hitT;
      hitId = col.id;
    }
  }

  return hitId !== null
    ? { hit: true, t: clamp(bestT, 0, 1), colliderId: hitId }
    : { hit: false, t: 1, colliderId: null };
}

/**
 * Checks 3D line-of-sight against all LOS-blocking solid world obstacles AND terrain crests.
 */
export function hasLineOfSight3D(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  ctx?: CollisionWorldContext,
): boolean {
  const staticHit = raycastSegmentStatic(ax, ay, az, bx, by, bz, 'blocksLos', 0, 0, ctx);
  if (staticHit.hit && staticHit.t > 0.02 && staticHit.t < 0.98) {
    return false;
  }

  const dist = Math.hypot(bx - ax, bz - az);
  if (dist > 4.0) {
    const steps = Math.min(12, Math.ceil(dist / 2.5));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const sx = ax + (bx - ax) * t;
      const sy = ay + (by - ay) * t;
      const sz = az + (bz - az) * t;
      if (walkableSurfaceHeightAt(sx, sz) > sy + 0.35) {
        return false;
      }
    }
  }

  return true;
}

export function hasLineOfSightXZUnified(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  ctx?: CollisionWorldContext,
): boolean {
  const y1 = walkableSurfaceHeightAt(x1, z1) + 1.15;
  const y2 = walkableSurfaceHeightAt(x2, z2) + 1.15;
  return hasLineOfSight3D(x1, y1, z1, x2, y2, z2, ctx);
}

/**
 * Camera collision sweep using sphere probe radius against all solid walls, roofs,
 * lintels, cliffs, trees, boulders, and dense terrain samples.
 */
export function sweepCameraCollision(
  targetX: number,
  targetY: number,
  targetZ: number,
  desiredX: number,
  desiredY: number,
  desiredZ: number,
  out: { fraction: number; minCamY: number } = { fraction: 1.0, minCamY: desiredY },
  ctx?: CollisionWorldContext,
): { fraction: number; minCamY: number } {
  const camRadius = 0.34;
  const minFraction = 0.24;

  const hit = raycastSegmentStatic(
    targetX,
    targetY,
    targetZ,
    desiredX,
    desiredY,
    desiredZ,
    'blocksCamera',
    camRadius,
    camRadius * 0.75,
    ctx,
  );

  let frac = hit.hit ? clamp(hit.t - 0.04, minFraction, 1.0) : 1.0;

  const dx = desiredX - targetX;
  const dy = desiredY - targetY;
  const dz = desiredZ - targetZ;
  let requiredY = walkableSurfaceHeightAt(targetX + dx * frac, targetZ + dz * frac) + 0.72;

  const samples = 14;
  for (let i = 1; i <= samples; i++) {
    const t = (i / samples) * frac;
    const sx = targetX + dx * t;
    const sy = targetY + dy * t;
    const sz = targetZ + dz * t;
    const groundClearY = walkableSurfaceHeightAt(sx, sz) + 0.58;
    if (groundClearY > sy) {
      if (t < 0.85) {
        requiredY = Math.max(requiredY, groundClearY + (groundClearY - sy) * 0.45);
      } else {
        requiredY = Math.max(requiredY, groundClearY);
      }
    }
  }

  out.fraction = frac;
  out.minCamY = requiredY;
  return out;
}

const STEER_CANDIDATE_ANGLES = [0, 0.52, -0.52, 1.05, -1.05, 1.58, -1.58, 2.1, -2.1];
const _steerScratch = { x: 0, z: 0 };

export function computeSteeredDirectionUnified(
  fromX: number,
  fromZ: number,
  targetX: number,
  targetZ: number,
  entityRadius = 0.55,
  lookAhead = 1.8,
  ctx?: CollisionWorldContext,
): { x: number; z: number } {
  const dx = targetX - fromX;
  const dz = targetZ - fromZ;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-4) return { x: 0, z: 0 };

  const baseDirX = dx / dist;
  const baseDirZ = dz / dist;
  const probeDist = Math.min(lookAhead, Math.max(0.75, dist));
  const curFeetY = walkableSurfaceHeightAt(fromX, fromZ);

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

    resolveStaticCollisionsXZ(testX, testZ, entityRadius, ctx, curFeetY, 1.74, _steerScratch);
    const obstacleBlocked = Math.hypot(_steerScratch.x - testX, _steerScratch.z - testZ) > 0.04;

    const slopeInfo = terrainSlopeVectorAt(testX, testZ);
    const uphill = slopeInfo.gx * candX + slopeInfo.gz * candZ > 0;
    const cliffBlocked = slopeInfo.slope > PLAYER_COLLIDER.maxWalkableSlope && uphill;

    if (!obstacleBlocked && !cliffBlocked) {
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
