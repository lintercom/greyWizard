import {
  CAMPSITE_POS,
  CAVE_POS,
  FORD_POS,
  LANDMARKS,
  PATROL_POS,
  PLAYABLE_LIMIT,
  QUARRY_POS,
  RANGER_POS,
  SPAWN_POS,
  VILLAGE_POS,
  WATCHTOWER_POS,
  WATERFALL_POS,
  WORLD_RADIUS,
  clamp,
  distanceToRoad,
  groundHeightAt,
  riverCenterZ,
} from './terrain';
import {
  CHAPTERS,
  MainQuestStepId,
  SIDE_QUESTS,
  SideQuestId,
  SideQuestStatus,
  StoryFlags,
  getMainQuestStepDef,
} from './storyData';

export const MAP_WORLD_EXTENT = WORLD_RADIUS; // 92m radius -> [-92, +92]
export const FOG_GRID_SIZE = 48;
export const MAP_PREFS_STORAGE_KEY = 'gandalf_stiny_severu_map_prefs_v1';

export type MapMarkerCategory =
  | 'main_quest'
  | 'side_quest'
  | 'settlement'
  | 'npc'
  | 'service'
  | 'cave'
  | 'landmark'
  | 'enemy_camp'
  | 'waypoint';

export type MapMarkerStatus =
  | 'active'
  | 'available'
  | 'discovered'
  | 'undiscovered'
  | 'cleared'
  | 'completed';

export type MapMarkerTier = 'primary' | 'secondary' | 'detail';

export interface MapCategoryMeta {
  id: MapMarkerCategory;
  label: string;
  color: string;
  defaultVisible: boolean;
  tier: MapMarkerTier;
}

export const MAP_CATEGORIES: MapCategoryMeta[] = [
  { id: 'main_quest', label: 'Hlavní úkol', color: '#c4831a', defaultVisible: true, tier: 'primary' },
  { id: 'side_quest', label: 'Vedlejší úkoly', color: '#24728a', defaultVisible: true, tier: 'primary' },
  { id: 'settlement', label: 'Osady', color: '#8f5920', defaultVisible: true, tier: 'primary' },
  { id: 'landmark', label: 'Významná místa', color: '#536c3e', defaultVisible: true, tier: 'secondary' },
  { id: 'cave', label: 'Štoly a doly', color: '#5b4d42', defaultVisible: true, tier: 'secondary' },
  { id: 'enemy_camp', label: 'Nepřátelská místa', color: '#9c3228', defaultVisible: true, tier: 'secondary' },
  { id: 'service', label: 'Léčitelka a kupci', color: '#396f4e', defaultVisible: true, tier: 'secondary' },
  { id: 'npc', label: 'Osobnosti údolí', color: '#475569', defaultVisible: true, tier: 'detail' },
  { id: 'waypoint', label: 'Vlastní značka', color: '#1b6e8c', defaultVisible: true, tier: 'primary' },
];

export type MapFiltersMap = Record<MapMarkerCategory, boolean>;

export interface MapFilterPresets {
  onlyAvailableQuests: boolean;
  onlyDiscovered: boolean;
  onlyActiveObjectives: boolean;
}

export interface MapPreferences {
  filters: MapFiltersMap;
  presets: MapFilterPresets;
}

export function createDefaultMapFilters(): MapFiltersMap {
  return {
    main_quest: true,
    side_quest: true,
    settlement: true,
    npc: true,
    service: true,
    cave: true,
    landmark: true,
    enemy_camp: true,
    waypoint: true,
  };
}

export function createDefaultMapPresets(): MapFilterPresets {
  return {
    onlyAvailableQuests: false,
    onlyDiscovered: false,
    onlyActiveObjectives: false,
  };
}

export function loadMapPreferences(): MapPreferences {
  const fallback: MapPreferences = {
    filters: createDefaultMapFilters(),
    presets: createDefaultMapPresets(),
  };
  if (typeof window === 'undefined' || !window.localStorage) return fallback;
  try {
    const raw = window.localStorage.getItem(MAP_PREFS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return {
      filters: { ...fallback.filters, ...(parsed?.filters ?? {}) },
      presets: { ...fallback.presets, ...(parsed?.presets ?? {}) },
    };
  } catch {
    return fallback;
  }
}

export function saveMapPreferences(prefs: MapPreferences): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(MAP_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore storage errors
  }
}

// ---------------------------------------------------------------------------
// 1. Coordinate Mapping (1:1 World <-> Normalized Map Space)
// ---------------------------------------------------------------------------

/**
 * Converts Three.js world (x, z) coordinates into normalized map coordinates [0..1].
 * North = -Z (v -> 0), South = +Z (v -> 1), West = -X (u -> 0), East = +X (u -> 1).
 */
export function worldToMapNorm(x: number, z: number): { u: number; v: number } {
  const span = MAP_WORLD_EXTENT * 2;
  return {
    u: clamp((x + MAP_WORLD_EXTENT) / span, 0, 1),
    v: clamp((z + MAP_WORLD_EXTENT) / span, 0, 1),
  };
}

export function mapNormToWorld(u: number, v: number): { x: number; z: number } {
  const span = MAP_WORLD_EXTENT * 2;
  return {
    x: clamp(u, 0, 1) * span - MAP_WORLD_EXTENT,
    z: clamp(v, 0, 1) * span - MAP_WORLD_EXTENT,
  };
}

export function isWithinPlayableMap(x: number, z: number): boolean {
  return Math.hypot(x, z) <= PLAYABLE_LIMIT;
}

export function clampMapPan(
  panX: number,
  panY: number,
  zoom: number,
  viewportW: number,
  viewportH: number,
  baseSize: number,
): { x: number; y: number } {
  const scaled = baseSize * zoom;
  const maxOffsetX = Math.max(viewportW * 0.25, (scaled - viewportW) * 0.5 + viewportW * 0.25);
  const maxOffsetY = Math.max(viewportH * 0.25, (scaled - viewportH) * 0.5 + viewportH * 0.25);
  return {
    x: clamp(panX, -maxOffsetX, maxOffsetX),
    y: clamp(panY, -maxOffsetY, maxOffsetY),
  };
}

// ---------------------------------------------------------------------------
// 2. Fog of War Grid (48x48 cells across [-WORLD_RADIUS, WORLD_RADIUS])
// ---------------------------------------------------------------------------

export function createEmptyFogGrid(): number[] {
  return new Array(FOG_GRID_SIZE * FOG_GRID_SIZE).fill(0);
}

export function getFogCellCoords(x: number, z: number): { col: number; row: number } {
  const { u, v } = worldToMapNorm(x, z);
  const col = clamp(Math.floor(u * FOG_GRID_SIZE), 0, FOG_GRID_SIZE - 1);
  const row = clamp(Math.floor(v * FOG_GRID_SIZE), 0, FOG_GRID_SIZE - 1);
  return { col, row };
}

export function getFogCellCenter(col: number, row: number): { x: number; z: number } {
  const u = (col + 0.5) / FOG_GRID_SIZE;
  const v = (row + 0.5) / FOG_GRID_SIZE;
  return mapNormToWorld(u, v);
}

export function revealFogRadius(
  fogGrid: number[],
  worldX: number,
  worldZ: number,
  radius = 15,
): { next: number[]; changed: boolean } {
  const cellSize = (MAP_WORLD_EXTENT * 2) / FOG_GRID_SIZE;
  const cellRadius = Math.ceil(radius / cellSize) + 1;
  const { col: centerCol, row: centerRow } = getFogCellCoords(worldX, worldZ);
  const rSq = radius * radius;

  let changed = false;
  let next = fogGrid;

  const minRow = Math.max(0, centerRow - cellRadius);
  const maxRow = Math.min(FOG_GRID_SIZE - 1, centerRow + cellRadius);
  const minCol = Math.max(0, centerCol - cellRadius);
  const maxCol = Math.min(FOG_GRID_SIZE - 1, centerCol + cellRadius);

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const idx = row * FOG_GRID_SIZE + col;
      if (next[idx] === 1) continue;
      const center = getFogCellCenter(col, row);
      const dx = center.x - worldX;
      const dz = center.z - worldZ;
      if (dx * dx + dz * dz <= rSq) {
        if (!changed) {
          next = fogGrid.slice();
          changed = true;
        }
        next[idx] = 1;
      }
    }
  }

  return { next, changed };
}

export function createInitialFogGrid(): number[] {
  let grid = createEmptyFogGrid();
  grid = revealFogRadius(grid, SPAWN_POS.x, SPAWN_POS.z, 19).next;
  grid = revealFogRadius(grid, RANGER_POS.x, RANGER_POS.z, 9).next;
  return grid;
}

export function isPointRevealed(fogGrid: number[], x: number, z: number): boolean {
  if (!fogGrid || fogGrid.length !== FOG_GRID_SIZE * FOG_GRID_SIZE) return true;
  const { col, row } = getFogCellCoords(x, z);
  return fogGrid[row * FOG_GRID_SIZE + col] === 1;
}

export function computeExplorationPercent(fogGrid: number[]): number {
  if (!fogGrid || fogGrid.length !== FOG_GRID_SIZE * FOG_GRID_SIZE) return 0;
  let totalPlayable = 0;
  let revealedPlayable = 0;
  for (let row = 0; row < FOG_GRID_SIZE; row++) {
    for (let col = 0; col < FOG_GRID_SIZE; col++) {
      const c = getFogCellCenter(col, row);
      if (Math.hypot(c.x, c.z) <= PLAYABLE_LIMIT) {
        totalPlayable += 1;
        if (fogGrid[row * FOG_GRID_SIZE + col] === 1) {
          revealedPlayable += 1;
        }
      }
    }
  }
  if (totalPlayable === 0) return 0;
  return Math.min(100, Math.round((revealedPlayable / totalPlayable) * 100));
}

export function encodeFogGrid(fogGrid: number[]): string {
  // Compact run-length encoding: e.g., "0:120,1:14,..."
  if (!fogGrid.length) return '';
  const runs: string[] = [];
  let current = fogGrid[0] ? 1 : 0;
  let count = 1;
  for (let i = 1; i < fogGrid.length; i++) {
    const val = fogGrid[i] ? 1 : 0;
    if (val === current) {
      count += 1;
    } else {
      runs.push(`${current}:${count}`);
      current = val;
      count = 1;
    }
  }
  runs.push(`${current}:${count}`);
  return runs.join(',');
}

export function decodeFogGrid(encoded: string): number[] | null {
  if (!encoded || typeof encoded !== 'string') return null;
  const out: number[] = [];
  const parts = encoded.split(',');
  for (const part of parts) {
    const [valStr, cntStr] = part.split(':');
    const val = valStr === '1' ? 1 : 0;
    const cnt = parseInt(cntStr, 10);
    if (!Number.isFinite(cnt) || cnt <= 0) return null;
    for (let i = 0; i < cnt; i++) {
      out.push(val);
    }
  }
  if (out.length !== FOG_GRID_SIZE * FOG_GRID_SIZE) return null;
  return out;
}

// ---------------------------------------------------------------------------
// 3. Deterministic Forest Tree Coords (matches MiddleEarthWorld.tsx)
// ---------------------------------------------------------------------------

function seededRand(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export interface MapTreePoint {
  x: number;
  z: number;
  scale: number;
}

let cachedTrees: MapTreePoint[] | null = null;

export function getForestTreeCoords(): MapTreePoint[] {
  if (cachedTrees) return cachedTrees;
  const items: MapTreePoint[] = [];
  for (let i = 0; i < 420; i++) {
    const r = 14 + seededRand(i * 3 + 1) * 76;
    const a = seededRand(i * 7 + 2) * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (distanceToRoad(x, z) < 5.6) continue;
    if (Math.abs(z - riverCenterZ(x)) < 6.4) continue;
    if (Math.hypot(x - RANGER_POS.x, z - RANGER_POS.z) < 9) continue;
    if (Math.hypot(x - PATROL_POS.x, z - PATROL_POS.z) < 9) continue;
    if (Math.hypot(x - VILLAGE_POS.x, z - VILLAGE_POS.z) < 15) continue;
    if (Math.hypot(x - CAMPSITE_POS.x, z - CAMPSITE_POS.z) < 10) continue;
    if (Math.hypot(x - CAVE_POS.x, z - CAVE_POS.z) < 11) continue;
    if (Math.hypot(x - WATCHTOWER_POS.x, z - WATCHTOWER_POS.z) < 15) continue;

    const y = groundHeightAt(x, z);
    if (y > 9.5 || y < -0.1) continue;
    items.push({
      x,
      z,
      scale: 0.78 + seededRand(i * 11 + 4) * 0.65,
    });
    if (items.length >= 210) break;
  }
  cachedTrees = items;
  return items;
}

// ---------------------------------------------------------------------------
// 4. World Map Markers (100% Real Entities, Anti-Spoiler Rules)
// ---------------------------------------------------------------------------

export interface MapMarker {
  id: string;
  category: MapMarkerCategory;
  title: string;
  subtitle: string;
  description: string;
  x: number;
  z: number;
  status: MapMarkerStatus;
  tier: MapMarkerTier;
  discovered: boolean;
  revealed: boolean;
  questHint?: string;
  trackTarget?: { kind: 'main' } | { kind: 'side'; id: SideQuestId };
  isTracked?: boolean;
  canSetWaypoint: boolean;
}

export interface BuildMapMarkersInput {
  mainStep: MainQuestStepId;
  flags: StoryFlags;
  sideQuests: Record<SideQuestId, { status: SideQuestStatus; progress: number }>;
  discoveredLocations: string[];
  fogGrid: number[];
  customWaypoint: { x: number; z: number } | null;
  trackedQuest: { kind: 'main' } | { kind: 'side'; id: SideQuestId };
  enemiesAliveByGroup: Record<'patrol' | 'village' | 'cave' | 'quarry' | 'watchtower', number>;
  incompleteStoryTargets: Array<{ id: string; kind: string; x: number; z: number }>;
}

export function resolveMainObjectiveWorldPos(
  mainStep: MainQuestStepId,
  incompleteStoryTargets: Array<{ id: string; kind: string; x: number; z: number }>,
): { x: number; z: number } | null {
  const stepDef = getMainQuestStepDef(mainStep);
  let targetPos = stepDef.targetPos;
  if (mainStep === 'ch2_inspect_caravan') {
    const nextEv = incompleteStoryTargets.find((o) => o.kind === 'caravan_evidence');
    if (nextEv) targetPos = { x: nextEv.x, z: nextEv.z };
  } else if (mainStep === 'ch3_solve_stones') {
    const nextRune = incompleteStoryTargets.find((o) => o.kind === 'stone_rune');
    if (nextRune) targetPos = { x: nextRune.x, z: nextRune.z };
  } else if (mainStep === 'ch5_disable_beacons') {
    const nextBeacon = incompleteStoryTargets.find(
      (o) => o.kind === 'signal_beacon' || o.kind === 'prisoner_cage',
    );
    if (nextBeacon) targetPos = { x: nextBeacon.x, z: nextBeacon.z };
  }
  return targetPos;
}

export function resolveSideQuestTargetPos(
  sqId: SideQuestId,
  status: SideQuestStatus,
  progress: number,
  incompleteStoryTargets: Array<{ id: string; kind: string; x: number; z: number }>,
): { x: number; z: number } {
  const def = SIDE_QUESTS[sqId];
  if (status === 'available') {
    return VILLAGE_POS;
  }
  if (status === 'active' && progress >= def.requiredCount) {
    // Ready to turn in to quest giver in Osada Líska
    return VILLAGE_POS;
  }
  if (sqId === 'sq_healer_hope') {
    const next = incompleteStoryTargets.find((o) => o.kind === 'sq_herb');
    if (next) return { x: next.x, z: next.z };
  } else if (sqId === 'sq_stone_kin') {
    const next = incompleteStoryTargets.find((o) => o.kind === 'sq_marker');
    if (next) return { x: next.x, z: next.z };
  } else if (sqId === 'sq_forest_song') {
    const next = incompleteStoryTargets.find((o) => o.kind === 'sq_verse');
    if (next) return { x: next.x, z: next.z };
  } else if (sqId === 'sq_lost_supplies') {
    const next = incompleteStoryTargets.find((o) => o.kind === 'sq_wagon');
    if (next) return { x: next.x, z: next.z };
  }
  return def.targetPos;
}

export function resolveTrackedObjectivePos(
  trackedQuest: { kind: 'main' } | { kind: 'side'; id: SideQuestId },
  mainStep: MainQuestStepId,
  sideQuests: Record<SideQuestId, { status: SideQuestStatus; progress: number }>,
  incompleteStoryTargets: Array<{ id: string; kind: string; x: number; z: number }>,
): { x: number; z: number } | null {
  if (trackedQuest.kind === 'side') {
    const st = sideQuests[trackedQuest.id];
    if (st && (st.status === 'available' || st.status === 'active')) {
      return resolveSideQuestTargetPos(
        trackedQuest.id,
        st.status,
        st.progress,
        incompleteStoryTargets,
      );
    }
  }
  return resolveMainObjectiveWorldPos(mainStep, incompleteStoryTargets);
}

export function buildWorldMapMarkers(input: BuildMapMarkersInput): MapMarker[] {
  const {
    mainStep,
    flags,
    sideQuests,
    discoveredLocations,
    fogGrid,
    customWaypoint,
    trackedQuest,
    enemiesAliveByGroup,
    incompleteStoryTargets,
  } = input;

  const markers: MapMarker[] = [];
  const stepDef = getMainQuestStepDef(mainStep);
  const chapter = stepDef.chapter;

  // 1. Main Quest Objective (Always visible while main quest is not completed)
  const mainTarget = resolveMainObjectiveWorldPos(mainStep, incompleteStoryTargets);
  if (mainTarget && mainStep !== 'completed') {
    const chapDef = CHAPTERS[chapter];
    markers.push({
      id: 'quest_main_active',
      category: 'main_quest',
      title: stepDef.title,
      subtitle: `Kapitola ${chapDef.roman} · Krok ${stepDef.stepNumber}/21`,
      description: `${stepDef.objective}. ${stepDef.journalEntry}`,
      x: mainTarget.x,
      z: mainTarget.z,
      status: 'active',
      tier: 'primary',
      discovered: true,
      revealed: true,
      questHint: stepDef.objective,
      trackTarget: { kind: 'main' },
      isTracked: trackedQuest.kind === 'main',
      canSetWaypoint: true,
    });
  }

  // 2. Side Quests (Unlocked based on current chapter — never spoil locked quests)
  (Object.keys(SIDE_QUESTS) as SideQuestId[]).forEach((sqId) => {
    const def = SIDE_QUESTS[sqId];
    const st = sideQuests[sqId];
    if (st.status === 'locked') return;
    if (st.status === 'completed') return; // Completed objectives hide cleanly from map clutter

    const pos = resolveSideQuestTargetPos(sqId, st.status, st.progress, incompleteStoryTargets);
    const readyTurnIn = st.status === 'active' && st.progress >= def.requiredCount;
    const subtitle =
      st.status === 'available'
        ? `Dostupný úkol · Zadavatel: ${def.giver}`
        : readyTurnIn
          ? `Připraveno k odevzdání · ${def.giver}`
          : `Aktivní úkol (${st.progress}/${def.requiredCount})`;
    const desc =
      st.status === 'available'
        ? `Promluv si s zadavatelem (${def.giver}). Odměna: ${def.rewardSummary}`
        : readyTurnIn
          ? `Vrať se za zadavatelem (${def.giver}) a dokonči úkol. Odměna: ${def.rewardSummary}`
          : `${def.storyImpact} Odměna: ${def.rewardSummary}`;

    markers.push({
      id: `sq_${sqId}`,
      category: 'side_quest',
      title: def.title,
      subtitle,
      description: desc,
      x: pos.x,
      z: pos.z,
      status: st.status === 'available' ? 'available' : 'active',
      tier: 'primary',
      discovered: true,
      revealed: true,
      questHint: def.rewardSummary,
      trackTarget: { kind: 'side', id: sqId },
      isTracked: trackedQuest.kind === 'side' && trackedQuest.id === sqId,
      canSetWaypoint: true,
    });
  });

  // 3. Settlement: Osada Líska (Always known as regional refuge)
  const liskaDiscovered = discoveredLocations.includes('oakhaven_ruins');
  const liskaRevealed = liskaDiscovered || isPointRevealed(fogGrid, VILLAGE_POS.x, VILLAGE_POS.z);
  markers.push({
    id: 'loc_oakhaven_ruins',
    category: 'settlement',
    title: 'Osada Líska',
    subtitle: liskaDiscovered ? 'Bezpečné útočiště v údolí' : 'Známá osada na východ od brodu',
    description:
      'Horská osada chráněná hraničáři a léčitelkou Mirou. Můžeš si zde odpočinout u ohně, vyrábět zásoby a mluvit s obyvateli.',
    x: VILLAGE_POS.x,
    z: VILLAGE_POS.z,
    status: liskaDiscovered ? 'discovered' : 'undiscovered',
    tier: 'primary',
    discovered: liskaDiscovered,
    revealed: liskaRevealed,
    canSetWaypoint: true,
  });

  // 4. Landmarks (excluding settlement, cave, and fortress which have dedicated categories)
  const landmarkDefs = LANDMARKS.filter(
    (l) => l.id !== 'oakhaven_ruins' && l.id !== 'misty_cavern' && l.id !== 'goblin_campsite',
  );
  for (const lm of landmarkDefs) {
    const discovered = discoveredLocations.includes(lm.id);
    const revealed = discovered || isPointRevealed(fogGrid, lm.x, lm.z);
    // Watchtower shouldn't show full boss spoilers before Chapter 5 or discovery
    const isTower = lm.id === 'ruined_watchtower';
    if (!revealed && isTower && chapter < 4) {
      continue;
    }
    const title = discovered || revealed ? lm.name : 'Neprozkoumané místo';
    const description =
      discovered || revealed
        ? lm.subtitle
        : 'Tato část údolí je dosud zahalena mlhou. Vydej se na místo pro její zmapování.';

    markers.push({
      id: `loc_${lm.id}`,
      category: 'landmark',
      title,
      subtitle: discovered ? 'Objevená lokace' : revealed ? 'Zmapováno pohledem' : 'Neprozkoumáno',
      description,
      x: lm.x,
      z: lm.z,
      status: discovered ? 'discovered' : 'undiscovered',
      tier: lm.id === 'whispering_ford' ? 'primary' : 'secondary',
      discovered,
      revealed,
      canSetWaypoint: true,
    });
  }

  // Western Waterfall (genuine environmental landmark from MiddleEarthWorld.tsx)
  const waterfallRevealed = isPointRevealed(fogGrid, WATERFALL_POS.x, WATERFALL_POS.z);
  if (waterfallRevealed) {
    markers.push({
      id: 'loc_waterfall',
      category: 'landmark',
      title: 'Západní vodopád',
      subtitle: 'Horský pramen nad Stříbrným brodem',
      description: 'Mohutný proud stékající ze západních skalisek napájí řeku napříč údolím.',
      x: WATERFALL_POS.x + 2,
      z: WATERFALL_POS.z,
      status: 'discovered',
      tier: 'secondary',
      discovered: true,
      revealed: true,
      canSetWaypoint: true,
    });
  }

  // 5. Caves & Mines
  const caveDiscovered = discoveredLocations.includes('misty_cavern');
  const caveRevealed = caveDiscovered || isPointRevealed(fogGrid, CAVE_POS.x, CAVE_POS.z);
  if (caveRevealed || chapter >= 3) {
    markers.push({
      id: 'loc_misty_cavern',
      category: 'cave',
      title: 'Staré trpasličí štoly',
      subtitle: caveDiscovered ? 'Objevené podzemí' : 'Průchod zakreslený na mapě',
      description:
        'Prastaré trpasličí chodby vytesané pod východními srázy. V hloubi stojí kamenná brána tří znaků.',
      x: CAVE_POS.x,
      z: CAVE_POS.z,
      status: caveDiscovered ? 'discovered' : 'undiscovered',
      tier: 'secondary',
      discovered: caveDiscovered,
      revealed: caveRevealed || chapter >= 3,
      canSetWaypoint: true,
    });
  }

  const quarryRevealed =
    isPointRevealed(fogGrid, QUARRY_POS.x, QUARRY_POS.z) ||
    sideQuests.sq_lost_supplies.status !== 'locked' ||
    flags.villageSupplied;
  if (quarryRevealed) {
    markers.push({
      id: 'loc_quarry',
      category: 'cave',
      title: 'Západní lom',
      subtitle: flags.villageSupplied ? 'Zásoby zajištěny' : 'Kamenolom severozápadně od brodu',
      description: 'Opuštěný horský lom na západním okraji údolí, kam skřeti odvlekli zásobovací vůz.',
      x: QUARRY_POS.x,
      z: QUARRY_POS.z,
      status: flags.villageSupplied ? 'completed' : 'discovered',
      tier: 'secondary',
      discovered: isPointRevealed(fogGrid, QUARRY_POS.x, QUARRY_POS.z),
      revealed: true,
      canSetWaypoint: true,
    });
  }

  // 6. Enemy Camps (Live status from active enemy groups; hidden until revealed or chapter relevant)
  const campSpecs: Array<{
    id: string;
    group: 'patrol' | 'village' | 'cave' | 'quarry' | 'watchtower';
    title: string;
    description: string;
    x: number;
    z: number;
    minChapter: number;
  }> = [
    {
      id: 'camp_patrol',
      group: 'patrol',
      title: 'Skřetí hlídka na stezce',
      description: 'Předsunutá skřetí hlídka poblíž místa přepadení kupecké karavany.',
      x: PATROL_POS.x,
      z: PATROL_POS.z,
      minChapter: 1,
    },
    {
      id: 'camp_goblin_main',
      group: 'village',
      title: 'Opuštěný tábor skřetů',
      description: 'Skřetí tábořiště za Stříbrným brodem se zásobami a stopami po nájezdech.',
      x: CAMPSITE_POS.x,
      z: CAMPSITE_POS.z,
      minChapter: 2,
    },
    {
      id: 'camp_cave_guard',
      group: 'cave',
      title: 'Stráž u vstupu do štol',
      description: 'Skřeti střežící přístup do starých trpasličích chodeb.',
      x: CAVE_POS.x - 1.5,
      z: CAVE_POS.z + 3.5,
      minChapter: 3,
    },
    {
      id: 'camp_quarry_guard',
      group: 'quarry',
      title: 'Skřetí ležení v lomu',
      description: 'Oddíl hlídající ukořistěný zásobovací vůz v západním lomu.',
      x: QUARRY_POS.x + 1.5,
      z: QUARRY_POS.z + 1.5,
      minChapter: 4,
    },
    {
      id: 'camp_watchtower',
      group: 'watchtower',
      title: 'Posádka horské pevnosti',
      description: 'Hlavní skřetí síla pod velením pána průsmyku Grakha u signálních ohňů.',
      x: WATCHTOWER_POS.x,
      z: WATCHTOWER_POS.z - 1.5,
      minChapter: 5,
    },
  ];

  for (const camp of campSpecs) {
    const revealed = isPointRevealed(fogGrid, camp.x, camp.z);
    const alive = enemiesAliveByGroup[camp.group] ?? 0;
    const cleared = alive <= 0;
    if (!revealed && !cleared) continue;

    markers.push({
      id: camp.id,
      category: 'enemy_camp',
      title: camp.title,
      subtitle: cleared ? 'Vyčištěno' : `Aktivní hrozba (${alive} nepřátel)`,
      description: camp.description,
      x: camp.x,
      z: camp.z,
      status: cleared ? 'cleared' : 'active',
      tier: cleared ? 'detail' : 'secondary',
      discovered: revealed || cleared,
      revealed: true,
      canSetWaypoint: true,
    });
  }

  // 7. Services (Healer & Caravan / Trade NPCs genuinely present in the game)
  if (liskaRevealed) {
    markers.push({
      id: 'service_mira',
      category: 'service',
      title: 'Mira · Léčitelka a ohniště',
      subtitle: 'Léčení a výroba zásob (Osada Líska)',
      description:
        'Vesnická léčitelka Mira ti u ohniště obnoví Zdraví i Soustředění a uloží postup. V její blízkosti lze vyrábět léčivé obklady.',
      x: VILLAGE_POS.x + 1.8,
      z: VILLAGE_POS.z + 1.6,
      status: 'discovered',
      tier: 'secondary',
      discovered: liskaDiscovered,
      revealed: liskaRevealed,
      canSetWaypoint: true,
    });

    markers.push({
      id: 'service_rovan',
      category: 'service',
      title: 'Rovan · Správce karavan',
      subtitle: 'Obchodní správa údolí (Osada Líska)',
      description:
        flags.rovanChoice === 'none'
          ? 'Správce obchodních cest v Lísce, jenž dohlíží na pohyb kupeckých vozů údolím.'
          : 'Správce karavan v osadě Líska po odhalení pravdy o zmizelých vozech.',
      x: VILLAGE_POS.x - 4.6,
      z: VILLAGE_POS.z + 0.2,
      status: 'discovered',
      tier: 'detail',
      discovered: liskaDiscovered,
      revealed: liskaRevealed,
      canSetWaypoint: true,
    });
  }

  if (chapter >= 2 || isPointRevealed(fogGrid, PATROL_POS.x - 5.5, PATROL_POS.z - 2.5)) {
    markers.push({
      id: 'service_merchant',
      category: 'service',
      title: 'Skrytý obchodník',
      subtitle: 'Přeživší kupec z karavany',
      description: 'Kupec ukrytý za kameny nedaleko přepadených vozů. Ví o tom, kdo skřetům ukázal cestu.',
      x: PATROL_POS.x - 5.5,
      z: PATROL_POS.z - 2.5,
      status: flags.merchantInterviewed ? 'discovered' : 'available',
      tier: 'detail',
      discovered: flags.merchantInterviewed || isPointRevealed(fogGrid, PATROL_POS.x - 5.5, PATROL_POS.z - 2.5),
      revealed: true,
      canSetWaypoint: true,
    });
  }

  // 8. NPCs (Edran, Bruni, Elka, Nela if rescued)
  const edranX = flags.edranRescued ? VILLAGE_POS.x - 1.5 : RANGER_POS.x;
  const edranZ = flags.edranRescued ? VILLAGE_POS.z + 2.0 : RANGER_POS.z;
  const edranRevealed = flags.edranRescued || isPointRevealed(fogGrid, edranX, edranZ) || discoveredLocations.includes('ranger_post');
  if (edranRevealed) {
    markers.push({
      id: 'npc_edran',
      category: 'npc',
      title: 'Edran',
      subtitle: flags.edranRescued ? 'Hraničář Dúnadan (Osada Líska)' : 'Zraněný hraničář na strážní stezce',
      description: 'Velitel malé hraničářské hlídky sledující severní průsmyk.',
      x: edranX,
      z: edranZ,
      status: 'discovered',
      tier: 'detail',
      discovered: true,
      revealed: true,
      canSetWaypoint: true,
    });
  }

  if (liskaRevealed) {
    markers.push({
      id: 'npc_bruni',
      category: 'npc',
      title: 'Bruni',
      subtitle: 'Trpasličí řemeslník (Osada Líska)',
      description: 'Zkušený trpasličí kameník a znalec prastarých štol v Mlžných horách.',
      x: VILLAGE_POS.x + 4.4,
      z: VILLAGE_POS.z + 0.5,
      status: 'discovered',
      tier: 'detail',
      discovered: liskaDiscovered,
      revealed: true,
      canSetWaypoint: true,
    });

    markers.push({
      id: 'npc_elka',
      category: 'npc',
      title: 'Stará Elka',
      subtitle: 'Pamětnice z osady Líska',
      description: 'Nejstarší obyvatelka Lísky, která uchovává příběhy a písně údolí.',
      x: VILLAGE_POS.x + 0.8,
      z: VILLAGE_POS.z - 2.6,
      status: 'discovered',
      tier: 'detail',
      discovered: liskaDiscovered,
      revealed: true,
      canSetWaypoint: true,
    });

    if (flags.nelaRescued) {
      markers.push({
        id: 'npc_nela',
        category: 'npc',
        title: 'Nela',
        subtitle: 'Zachráněná sestra Rovana (Osada Líska)',
        description: 'Nela se po osvobození ze zajetí vrátila v bezpečí do Lísky.',
        x: VILLAGE_POS.x - 3.2,
        z: VILLAGE_POS.z + 0.6,
        status: 'discovered',
        tier: 'detail',
        discovered: true,
        revealed: true,
        canSetWaypoint: true,
      });
    }
  }

  // 9. Custom Player Waypoint
  if (customWaypoint) {
    markers.push({
      id: 'custom_waypoint',
      category: 'waypoint',
      title: 'Vlastní značka',
      subtitle: `Souřadnice (${Math.round(customWaypoint.x)}, ${Math.round(customWaypoint.z)})`,
      description: 'Uživatelský orientační bod zobrazený na kompasu během putování. Pravým kliknutím jej odstraníš.',
      x: customWaypoint.x,
      z: customWaypoint.z,
      status: 'active',
      tier: 'primary',
      discovered: true,
      revealed: true,
      canSetWaypoint: false,
    });
  }

  return markers;
}

// ---------------------------------------------------------------------------
// 5. Filtering, Search & Zoom-Adaptive LOD / Label Collision Culling
// ---------------------------------------------------------------------------

export function isMarkerVisibleForZoom(marker: MapMarker, zoom: number, searchActive: boolean): boolean {
  if (searchActive) return true;
  if (marker.category === 'main_quest' || marker.category === 'waypoint' || marker.isTracked) {
    return true;
  }
  if (zoom < 1.28) {
    return marker.tier === 'primary';
  }
  if (zoom < 2.05) {
    return marker.tier === 'primary' || marker.tier === 'secondary';
  }
  return true;
}

export function filterWorldMapMarkers(
  markers: MapMarker[],
  filters: MapFiltersMap,
  presets: MapFilterPresets,
  zoom: number,
  searchQuery: string,
): MapMarker[] {
  const q = searchQuery.trim().toLowerCase();
  const searchActive = q.length > 0;

  return markers.filter((m) => {
    if (!filters[m.category]) return false;

    if (presets.onlyDiscovered && !m.discovered && m.category !== 'waypoint' && m.category !== 'main_quest') {
      return false;
    }

    if (presets.onlyAvailableQuests) {
      if (m.category !== 'main_quest' && m.category !== 'side_quest' && m.category !== 'waypoint') {
        return false;
      }
      if (m.category === 'side_quest' && m.status !== 'available' && m.status !== 'active') {
        return false;
      }
    }

    if (presets.onlyActiveObjectives) {
      const isActiveObj =
        m.category === 'main_quest' ||
        (m.category === 'side_quest' && m.status === 'active') ||
        m.category === 'waypoint';
      if (!isActiveObj) return false;
    }

    if (searchActive) {
      // Only search known/revealed markers (prevent leaking hidden spoilers)
      if (!m.revealed) return false;
      const haystack = `${m.title} ${m.subtitle}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    return isMarkerVisibleForZoom(m, zoom, searchActive);
  });
}

export interface PositionedMarker extends MapMarker {
  screenX: number;
  screenY: number;
  showLabel: boolean;
  labelPlacement: 'bottom' | 'top';
}

/**
 * Projects filtered markers into map-pixel space and computes non-overlapping label visibility
 * ordered by priority (tracked/main quest > waypoint > settlement > side quest > landmarks/caves > NPCs).
 */
export function layoutMapMarkers(
  markers: MapMarker[],
  mapPixelSize: number,
  selectedMarkerId: string | null,
  playerScreenPos?: { x: number; y: number },
): PositionedMarker[] {
  const priorityScore = (m: MapMarker): number => {
    if (m.id === selectedMarkerId) return 100;
    if (m.category === 'main_quest') return 90;
    if (m.category === 'waypoint') return 85;
    if (m.isTracked) return 80;
    if (m.category === 'settlement') return 70;
    if (m.category === 'side_quest') return 65;
    if (m.category === 'cave') return 50;
    if (m.category === 'landmark') return 45;
    if (m.category === 'enemy_camp') return 40;
    if (m.category === 'service') return 30;
    return 20;
  };

  const sorted = markers
    .map((m) => {
      const { u, v } = worldToMapNorm(m.x, m.z);
      return {
        ...m,
        screenX: u * mapPixelSize,
        screenY: v * mapPixelSize,
        showLabel: false,
        labelPlacement: 'bottom' as 'bottom' | 'top',
      };
    })
    .sort((a, b) => priorityScore(b) - priorityScore(a));

  const occupiedLabels: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  if (playerScreenPos) {
    occupiedLabels.push({
      x1: playerScreenPos.x - 42,
      y1: playerScreenPos.y - 24,
      x2: playerScreenPos.x + 42,
      y2: playerScreenPos.y + 38,
    });
  }

  for (const m of sorted) {
    const labelW = Math.min(160, Math.max(64, m.title.length * 6.5));
    const labelH = 18;
    const x1 = m.screenX - labelW / 2;
    const x2 = m.screenX + labelW / 2;

    const bottomBox = { x1, y1: m.screenY + 12, x2, y2: m.screenY + 12 + labelH };
    const bottomOverlaps = occupiedLabels.some(
      (b) => !(bottomBox.x2 < b.x1 || bottomBox.x1 > b.x2 || bottomBox.y2 < b.y1 || bottomBox.y1 > b.y2),
    );
    if (!bottomOverlaps) {
      m.showLabel = true;
      m.labelPlacement = 'bottom';
      occupiedLabels.push(bottomBox);
      continue;
    }

    const topBox = { x1, y1: m.screenY - 12 - labelH, x2, y2: m.screenY - 12 };
    const topOverlaps = occupiedLabels.some(
      (b) => !(topBox.x2 < b.x1 || topBox.x1 > b.x2 || topBox.y2 < b.y1 || topBox.y1 > b.y2),
    );
    if (!topOverlaps || m.id === selectedMarkerId || m.category === 'main_quest') {
      m.showLabel = true;
      m.labelPlacement = 'top';
      occupiedLabels.push(topBox);
    }
  }

  return sorted;
}
