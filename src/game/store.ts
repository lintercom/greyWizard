import { create } from 'zustand';
import {
  ApproachChoice,
  CRAFTING_RECIPES,
  DialogueNode,
  ITEM_CATALOG,
  MAIN_QUEST_STEPS,
  MainQuestStepId,
  RovanChoice,
  SIDE_QUESTS,
  SideQuestId,
  SideQuestStatus,
  SkillId,
  SKILL_TREE,
  STONE_RUNE_LABELS,
  STONE_PUZZLE_ORDER,
  StoneRuneId,
  StoryFlags,
  buildNpcDialogue,
  getMainQuestStepDef,
  resolveChapter5EntryStep,
  resolveGrakhKillStep,
  stepStonePuzzle,
} from './storyData';
import {
  CAMPSITE_POS,
  CAVE_POS,
  PATROL_POS,
  PLAYABLE_LIMIT,
  QUARRY_POS,
  RANGER_POS,
  SPAWN_POS,
  VILLAGE_POS,
  WATCHTOWER_POS,
  groundHeightAt,
} from './terrain';
import {
  EnemyAIState,
  EnemyArchetype,
  ENEMY_TEMPLATES,
  SpellId,
  SPELL_CONFIGS,
  applyXpGain,
  computeSkillBonuses,
} from './combatLogic';
import { gameAudio } from './audio';
import {
  MapFilterPresets,
  MapFiltersMap,
  MapMarkerCategory,
  createDefaultMapFilters,
  createInitialFogGrid,
  decodeFogGrid,
  encodeFogGrid,
  loadMapPreferences,
  revealFogRadius,
  saveMapPreferences,
} from './worldMapData';
import { LANDMARKS } from './terrain';

export type GamePhase = 'title' | 'playing' | 'paused' | 'victory' | 'defeat';

export interface InventorySlot {
  id: string;
  count: number;
}

export interface EnemyRuntime {
  id: string;
  archetype: EnemyArchetype;
  group: 'patrol' | 'village' | 'cave' | 'quarry' | 'watchtower' | 'reinforcement';
  aiState: EnemyAIState;
  alertLevel: number;
  investigateTimer: number;
  lastKnownX: number;
  lastKnownZ: number;
  stuckTimer: number;
  stuckSide: number;
  lastProgressX: number;
  lastProgressZ: number;
  x: number;
  y: number;
  z: number;
  homeX: number;
  homeZ: number;
  yaw: number;
  hp: number;
  maxHp: number;
  stunTimer: number;
  burnTimer: number;
  hitFlashTimer: number;
  cooldownTimer: number;
  windupTimer: number;
  isWindingUp: boolean;
  attackPhase: 'none' | 'windup' | 'swing';
  attackSwingTimer: number;
  dead: boolean;
  deathTimer: number;
  vx: number;
  vz: number;
  patrolPhase: number;
  walkDist: number;
}

export interface CollectibleRuntime {
  id: string;
  itemId: string;
  x: number;
  y: number;
  z: number;
  collected: boolean;
}

export interface StoryInteractableRuntime {
  id: string;
  kind:
    | 'horse_clue'
    | 'cloth_clue'
    | 'caravan_evidence'
    | 'camp_map'
    | 'stone_rune'
    | 'mine_orders'
    | 'rovan_ledger'
    | 'signal_beacon'
    | 'prisoner_cage'
    | 'sq_herb'
    | 'sq_marker'
    | 'sq_verse'
    | 'sq_wagon';
  label: string;
  x: number;
  y: number;
  z: number;
  done: boolean;
  runeId?: StoneRuneId;
}

export interface BrazierRuntime {
  id: string;
  x: number;
  y: number;
  z: number;
  lit: boolean;
}

export interface ProjectileRuntime {
  id: number;
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  damage: number;
  life: number;
}

export interface LiveSimulationRef {
  playerX: number;
  playerY: number;
  playerZ: number;
  playerYaw: number;
  cameraYaw: number;
  cameraPitch: number;
  cameraDist: number;
  isMoving: boolean;
  isSprinting: boolean;
  isCombatAlert: boolean;
  velX: number;
  velZ: number;
  locomotionSpeed: number;
  strideBlend: number;
  yawRate: number;
  walkCycle: number;
  animState: string;
  attackTimer: number;
  attackCombo: number;
  attackDuration: number;
  attackHitApplied: boolean;
  attackBuffered: boolean;
  swingId: number;
  swingHitEnemyIds: Set<string>;
  castTimer: number;
  castDuration: number;
  castKind: SpellId | null;
  pendingCastSpell: SpellId | null;
  pendingCastReleased: boolean;
  dodgeTimer: number;
  dodgeDirX: number;
  dodgeDirZ: number;
  staggerTimer: number;
  shieldHoldTimer: number;
  torchLightTimer: number;
  playerNoiseTimer: number;
  combatTailTimer: number;
  hurtFlashTimer: number;
  hitstopTimer: number;
  cameraTrauma: number;
  cameraTraumaTime: number;
  flashBurstTimer: number;
  fireBurstTimer: number;
  shockwaveTimer: number;
  footstepAccum: number;
  grakhPhaseAnnounced: 1 | 2 | 3;
  enemies: EnemyRuntime[];
  collectibles: CollectibleRuntime[];
  storyInteractables: StoryInteractableRuntime[];
  braziers: BrazierRuntime[];
  projectiles: ProjectileRuntime[];
  nextProjectileId: number;
  resetCounter: number;
}

const SAVE_STORAGE_KEY = 'gandalf_stiny_severu_save_v1';

function createInitialEnemies(): EnemyRuntime[] {
  const specs: Array<{
    id: string;
    archetype: EnemyArchetype;
    group: EnemyRuntime['group'];
    x: number;
    z: number;
    yaw: number;
    startDead?: boolean;
  }> = [
    // Chapter I Scouts along the pine trail
    { id: 'patrol_1', archetype: 'goblin_scout', group: 'patrol', x: PATROL_POS.x - 2.6, z: PATROL_POS.z + 3.2, yaw: 0.4 },
    { id: 'patrol_2', archetype: 'goblin_scout', group: 'patrol', x: PATROL_POS.x + 2.8, z: PATROL_POS.z - 0.5, yaw: -0.5 },

    // Goblin Campsite guards across the Silver Ford
    { id: 'camp_1', archetype: 'goblin_scout', group: 'village', x: CAMPSITE_POS.x - 3.2, z: CAMPSITE_POS.z + 2.5, yaw: 0.9 },
    { id: 'camp_2', archetype: 'orc_warrior', group: 'village', x: CAMPSITE_POS.x + 2.5, z: CAMPSITE_POS.z - 1.5, yaw: -0.9 },

    // Old Dwarven Mines (Staré štoly) guards
    { id: 'cave_1', archetype: 'goblin_scout', group: 'cave', x: CAVE_POS.x - 4.0, z: CAVE_POS.z + 4.8, yaw: 0.6 },
    { id: 'cave_2', archetype: 'orc_warrior', group: 'cave', x: CAVE_POS.x + 2.2, z: CAVE_POS.z + 2.4, yaw: -0.4 },

    // Quarry supply wagon guards (Side Quest IV)
    { id: 'quarry_1', archetype: 'goblin_scout', group: 'quarry', x: QUARRY_POS.x - 2.2, z: QUARRY_POS.z + 2.4, yaw: 0.5 },
    { id: 'quarry_2', archetype: 'orc_warrior', group: 'quarry', x: QUARRY_POS.x + 2.6, z: QUARRY_POS.z - 1.2, yaw: -0.8 },

    // Mountain Fortress & Grakh Boss Fight
    { id: 'tower_archer_1', archetype: 'orc_archer', group: 'watchtower', x: WATCHTOWER_POS.x - 6.5, z: WATCHTOWER_POS.z + 2, yaw: 0.3 },
    { id: 'tower_archer_2', archetype: 'orc_archer', group: 'watchtower', x: WATCHTOWER_POS.x + 6.5, z: WATCHTOWER_POS.z + 1.5, yaw: -0.3 },
    { id: 'tower_boss', archetype: 'goblin_commander', group: 'watchtower', x: WATCHTOWER_POS.x, z: WATCHTOWER_POS.z - 2.5, yaw: 0 },

    // Grakh Phase 2 reinforcements (inactive/dead until 65% HP)
    { id: 'grakh_add_1', archetype: 'orc_warrior', group: 'reinforcement', x: WATCHTOWER_POS.x - 7.5, z: WATCHTOWER_POS.z - 4.0, yaw: 0.2, startDead: true },
    { id: 'grakh_add_2', archetype: 'orc_warrior', group: 'reinforcement', x: WATCHTOWER_POS.x + 7.5, z: WATCHTOWER_POS.z - 4.0, yaw: -0.2, startDead: true },
  ];

  return specs.map((s) => {
    const tpl = ENEMY_TEMPLATES[s.archetype];
    const y = groundHeightAt(s.x, s.z);
    return {
      id: s.id,
      archetype: s.archetype,
      group: s.group,
      aiState: s.startDead ? 'DEAD' : 'PATROL',
      alertLevel: 0,
      investigateTimer: 0,
      lastKnownX: s.x,
      lastKnownZ: s.z,
      stuckTimer: 0,
      stuckSide: 1,
      lastProgressX: s.x,
      lastProgressZ: s.z,
      x: s.x,
      y,
      z: s.z,
      homeX: s.x,
      homeZ: s.z,
      yaw: s.yaw,
      hp: s.startDead ? 0 : tpl.maxHp,
      maxHp: tpl.maxHp,
      stunTimer: 0,
      burnTimer: 0,
      hitFlashTimer: 0,
      cooldownTimer: 0.6 + Math.random() * 0.5,
      windupTimer: 0,
      isWindingUp: false,
      attackPhase: 'none',
      attackSwingTimer: 0,
      dead: !!s.startDead,
      deathTimer: 0,
      vx: 0,
      vz: 0,
      patrolPhase: Math.random() * Math.PI * 2,
      walkDist: 0,
    };
  });
}

function createInitialCollectibles(): CollectibleRuntime[] {
  const list: Array<Omit<CollectibleRuntime, 'y' | 'collected'>> = [
    { id: 'mat_herb_1', itemId: 'athelas_herb', x: 1.5, z: 44 },
    { id: 'mat_water_1', itemId: 'pure_water', x: -12.5, z: 5.5 },
    { id: 'mat_cloth_1', itemId: 'linen_cloth', x: PATROL_POS.x + 4.5, z: PATROL_POS.z + 3.8 },
    { id: 'mat_resin_1', itemId: 'pine_resin', x: -17.5, z: -2.5 },
    { id: 'mat_wood_1', itemId: 'wood_parts', x: CAMPSITE_POS.x - 4.0, z: CAMPSITE_POS.z + 4.5 },
    { id: 'mat_herb_2', itemId: 'athelas_herb', x: VILLAGE_POS.x - 9.0, z: VILLAGE_POS.z + 6.0 },
    { id: 'mat_water_2', itemId: 'pure_water', x: 18.0, z: 2.0 },
    { id: 'cons_bread_1', itemId: 'travel_bread', x: VILLAGE_POS.x + 6.5, z: VILLAGE_POS.z + 4.0 },
  ];
  return list.map((c) => ({
    ...c,
    y: groundHeightAt(c.x, c.z),
    collected: false,
  }));
}

function createInitialStoryInteractables(): StoryInteractableRuntime[] {
  const list: Array<Omit<StoryInteractableRuntime, 'y' | 'done'>> = [
    // Ch 1
    {
      id: 'horse_clue',
      kind: 'horse_clue',
      label: 'Prohlédnout zakrvácené sedlo u koně',
      x: SPAWN_POS.x + 2.5,
      z: SPAWN_POS.z - 5.5,
    },
    {
      id: 'cloth_clue',
      kind: 'cloth_clue',
      label: 'Prozkoumat černou látku se symbolem',
      x: -4,
      z: 25,
    },
    // Ch 2
    {
      id: 'caravan_ev_1',
      kind: 'caravan_evidence',
      label: 'Prozkoumat rozbitý kupecký vůz',
      x: PATROL_POS.x - 1.5,
      z: PATROL_POS.z + 0.5,
    },
    {
      id: 'caravan_ev_2',
      kind: 'caravan_evidence',
      label: 'Prohlédnout bedny správy údolí',
      x: PATROL_POS.x + 2.5,
      z: PATROL_POS.z - 2.2,
    },
    {
      id: 'caravan_ev_3',
      kind: 'caravan_evidence',
      label: 'Zkontrolovat ohořelý zápis přepravy',
      x: PATROL_POS.x - 3.0,
      z: PATROL_POS.z - 3.2,
    },
    {
      id: 'camp_map',
      kind: 'camp_map',
      label: 'Sebrat mapu zapomenutých průchodů',
      x: CAMPSITE_POS.x + 1.2,
      z: CAMPSITE_POS.z - 0.8,
    },
    // Ch 3 Three-Stone Puzzle + Secret Chamber Orders
    {
      id: 'rune_hammer',
      kind: 'stone_rune',
      runeId: 'hammer',
      label: `Aktivovat ${STONE_RUNE_LABELS.hammer}`,
      x: CAVE_POS.x - 2.3,
      z: CAVE_POS.z + 1.5,
    },
    {
      id: 'rune_mountain',
      kind: 'stone_rune',
      runeId: 'mountain',
      label: `Aktivovat ${STONE_RUNE_LABELS.mountain}`,
      x: CAVE_POS.x,
      z: CAVE_POS.z - 0.6,
    },
    {
      id: 'rune_torch',
      kind: 'stone_rune',
      runeId: 'torch',
      label: `Aktivovat ${STONE_RUNE_LABELS.torch}`,
      x: CAVE_POS.x + 2.3,
      z: CAVE_POS.z + 1.5,
    },
    {
      id: 'mine_orders',
      kind: 'mine_orders',
      label: 'Vyzvednout Grakhův rozkaz a Rovanovu pečeť',
      x: CAVE_POS.x,
      z: CAVE_POS.z - 2.3,
    },
    // Ch 4 Rovan's ledger in Osada Líska
    {
      id: 'rovan_ledger',
      kind: 'rovan_ledger',
      label: 'Porovnat pečeť s Rovanovými záznamy',
      x: VILLAGE_POS.x - 4.8,
      z: VILLAGE_POS.z + 1.4,
    },
    // Ch 5 Signal Beacons & Captives Cage
    {
      id: 'beacon_west',
      kind: 'signal_beacon',
      label: 'Zničit západní signální mechanismus',
      x: WATCHTOWER_POS.x - 5.4,
      z: WATCHTOWER_POS.z + 3.2,
    },
    {
      id: 'beacon_east',
      kind: 'signal_beacon',
      label: 'Zničit východní signální mechanismus',
      x: WATCHTOWER_POS.x + 5.4,
      z: WATCHTOWER_POS.z + 3.2,
    },
    {
      id: 'beacon_summit',
      kind: 'signal_beacon',
      label: 'Zneškodnit hlavní signální věžový oheň',
      x: WATCHTOWER_POS.x,
      z: WATCHTOWER_POS.z - 3.2,
    },
    {
      id: 'prisoner_cage',
      kind: 'prisoner_cage',
      label: 'Osvobodit Nelu a zajaté obchodníky',
      x: WATCHTOWER_POS.x - 5.2,
      z: WATCHTOWER_POS.z + 6.4,
    },
    // Side Quest I: Healer herbs
    { id: 'sq_herb_1', kind: 'sq_herb', label: 'Natrhat horský athelas (1/3)', x: -16, z: 32 },
    { id: 'sq_herb_2', kind: 'sq_herb', label: 'Natrhat horský athelas (2/3)', x: -20, z: 26 },
    { id: 'sq_herb_3', kind: 'sq_herb', label: 'Prozkoumat hrob starého léčitele a byliny (3/3)', x: -14, z: 22 },
    // Side Quest II: Bruni stone markers
    { id: 'sq_marker_1', kind: 'sq_marker', label: 'Prozkoumat prastarou kamennou značku', x: 22, z: -12 },
    { id: 'sq_marker_2', kind: 'sq_marker', label: 'Prozkoumat kamenný milník rodu', x: 26, z: -19 },
    { id: 'sq_marker_3', kind: 'sq_marker', label: 'Otevřít zapomenutou trpasličí komoru', x: 20, z: -24 },
    // Side Quest III: Forgotten Song verses
    { id: 'sq_verse_1', kind: 'sq_verse', label: 'Přečíst první sloku ztracené písně', x: -23, z: 14 },
    { id: 'sq_verse_2', kind: 'sq_verse', label: 'Přečíst druhou sloku ze starého dopisu', x: -26, z: 4 },
    { id: 'sq_verse_3', kind: 'sq_verse', label: 'Přečíst závěr písně u tábora', x: -19, z: -10 },
    // Side Quest IV: Lost supplies wagon
    { id: 'sq_wagon', kind: 'sq_wagon', label: 'Zajistit ukradený zásobovací vůz', x: QUARRY_POS.x, z: QUARRY_POS.z },
  ];

  return list.map((o) => ({
    ...o,
    y: groundHeightAt(o.x, o.z),
    done: false,
  }));
}

function createInitialBraziers(): BrazierRuntime[] {
  const spots = [
    { id: 'brazier_camp_1', x: CAMPSITE_POS.x - 1.5, z: CAMPSITE_POS.z + 1.5, lit: false },
    { id: 'brazier_village_1', x: VILLAGE_POS.x, z: VILLAGE_POS.z + 4.5, lit: true },
    { id: 'brazier_tower_1', x: WATCHTOWER_POS.x - 4.2, z: WATCHTOWER_POS.z + 4.5, lit: false },
    { id: 'brazier_tower_2', x: WATCHTOWER_POS.x + 4.2, z: WATCHTOWER_POS.z + 4.5, lit: false },
  ];
  return spots.map((b) => ({ ...b, y: groundHeightAt(b.x, b.z) }));
}

function initialFlags(): StoryFlags {
  return {
    edranRescued: false,
    caravanEvidenceCount: 0,
    merchantInterviewed: false,
    puzzleSolved: false,
    rovanChoice: 'none',
    rovanConfessed: false,
    approachChosen: 'direct',
    beaconsDisabled: 0,
    nelaRescued: false,
    villageHealed: false,
    dwarfShortcut: false,
    villageMorale: false,
    villageSupplied: false,
    grakhDefeated: false,
  };
}

function initialSideQuests(): Record<SideQuestId, { status: SideQuestStatus; progress: number }> {
  return {
    sq_healer_hope: { status: 'locked', progress: 0 },
    sq_stone_kin: { status: 'locked', progress: 0 },
    sq_forest_song: { status: 'locked', progress: 0 },
    sq_lost_supplies: { status: 'locked', progress: 0 },
  };
}

export const liveSim: LiveSimulationRef = {
  playerX: SPAWN_POS.x,
  playerY: groundHeightAt(SPAWN_POS.x, SPAWN_POS.z),
  playerZ: SPAWN_POS.z,
  playerYaw: Math.PI,
  cameraYaw: 0,
  cameraPitch: 0.24,
  cameraDist: 7.2,
  isMoving: false,
  isSprinting: false,
  isCombatAlert: false,
  velX: 0,
  velZ: 0,
  locomotionSpeed: 0,
  strideBlend: 0,
  yawRate: 0,
  walkCycle: 0,
  animState: 'IDLE',
  attackTimer: 0,
  attackCombo: 0,
  attackDuration: 0.34,
  attackHitApplied: false,
  attackBuffered: false,
  swingId: 0,
  swingHitEnemyIds: new Set<string>(),
  castTimer: 0,
  castDuration: 0.44,
  castKind: null,
  pendingCastSpell: null,
  pendingCastReleased: false,
  dodgeTimer: 0,
  dodgeDirX: 0,
  dodgeDirZ: -1,
  staggerTimer: 0,
  shieldHoldTimer: 0,
  torchLightTimer: 0,
  playerNoiseTimer: 0,
  combatTailTimer: 0,
  hurtFlashTimer: 0,
  hitstopTimer: 0,
  cameraTrauma: 0,
  cameraTraumaTime: 0,
  flashBurstTimer: 0,
  fireBurstTimer: 0,
  shockwaveTimer: 0,
  footstepAccum: 0,
  grakhPhaseAnnounced: 1,
  enemies: createInitialEnemies(),
  collectibles: createInitialCollectibles(),
  storyInteractables: createInitialStoryInteractables(),
  braziers: createInitialBraziers(),
  projectiles: [],
  nextProjectileId: 1,
  resetCounter: 0,
};

export interface GameStoreState {
  phase: GamePhase;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  stamina: number;
  maxStamina: number;
  level: number;
  xp: number;
  knowledgePoints: number;
  unlockedSkills: SkillId[];
  staffLightOn: boolean;
  shieldActive: boolean;
  cooldowns: Record<SpellId, number>;
  mainStep: MainQuestStepId;
  flags: StoryFlags;
  sideQuests: Record<SideQuestId, { status: SideQuestStatus; progress: number }>;
  stonePuzzleSeq: StoneRuneId[];
  patrolKilled: number;
  discoveredLocations: string[];
  inventory: InventorySlot[];
  storyItems: string[];
  activeDialogue: DialogueNode | null;
  journalOpen: boolean;
  journalTab: 'quests' | 'map' | 'inventory' | 'skills';
  worldMapOpen: boolean;
  fogGrid: number[];
  customWaypoint: { x: number; z: number } | null;
  trackedQuest: { kind: 'main' } | { kind: 'side'; id: SideQuestId };
  mapFilters: MapFiltersMap;
  mapPresets: MapFilterPresets;
  waypointBearingDeg: number | null;
  waypointDistance: number | null;
  interactPrompt: { label: string; key: string; targetId: string } | null;
  notification: { title: string; subtitle: string; expiresAt: number } | null;
  compassHeadingDeg: number;
  objectiveBearingDeg: number;
  objectiveDistance: number;
  currentRegionName: string;
  bossHud: { name: string; hp: number; maxHp: number; phase: 1 | 2 | 3 } | null;
  lastDamageAt: number;
  combatCallout: { text: string; tone: 'parry' | 'crit' | 'block' | 'stun'; expiresAt: number } | null;
  settings: {
    mouseSensitivity: number;
    graphicsQuality: 'high' | 'medium';
    muted: boolean;
    musicVolume: number;
    sfxVolume: number;
  };
  runStats: {
    elapsedSeconds: number;
    enemiesDefeated: number;
    spellsCast: number;
    damageTaken: number;
  };

  startGame: () => void;
  restartGame: () => void;
  pauseGame: () => void;
  resumeGame: () => void;
  returnToTitle: () => void;
  toggleJournal: (tab?: GameStoreState['journalTab']) => void;
  setJournalTab: (tab: GameStoreState['journalTab']) => void;
  toggleWorldMap: (open?: boolean) => void;
  revealExplorationAt: (x: number, z: number, radius?: number) => void;
  setCustomWaypoint: (pos: { x: number; z: number } | null, silent?: boolean) => void;
  setTrackedQuest: (target: { kind: 'main' } | { kind: 'side'; id: SideQuestId }) => void;
  setMapFilterCategory: (category: MapMarkerCategory, visible: boolean) => void;
  setAllMapFilters: (visible: boolean) => void;
  resetMapFilters: () => void;
  setMapPresets: (partial: Partial<MapFilterPresets>) => void;
  setSettings: (partial: Partial<GameStoreState['settings']>) => void;
  toggleStaffLight: () => void;
  setShieldActive: (active: boolean) => void;
  openNpcDialogue: (npcId: 'edran' | 'mira' | 'bruni' | 'rovan' | 'merchant' | 'elka' | 'nela') => void;
  resolveDialogueChoice: (effectId: string) => void;
  interactWithStoryObject: (objId: string) => void;
  unlockSkill: (skillId: SkillId) => void;
  craftRecipe: (recipeId: string) => void;
  useInventoryItem: (itemId: string) => void;
  addInventoryItem: (itemId: string, silent?: boolean) => void;
  addStoryItem: (itemId: string) => void;
  discoverLocation: (locId: string, name: string, xpReward: number) => void;
  grantXp: (amount: number) => void;
  onEnemyKilled: (enemyId: string, archetype: EnemyArchetype, group: EnemyRuntime['group']) => void;
  applyPlayerDamage: (amount: number) => void;
  showCombatCallout: (text: string, tone: 'parry' | 'crit' | 'block' | 'stun', durationMs?: number) => void;
  notify: (title: string, subtitle: string, durationMs?: number) => void;
  clearExpiredNotification: () => void;
  saveCheckpoint: (silent?: boolean) => void;
  loadCheckpoint: () => boolean;
  setHudTelemetry: (patch: {
    compassHeadingDeg: number;
    objectiveBearingDeg: number;
    objectiveDistance: number;
    waypointBearingDeg: number | null;
    waypointDistance: number | null;
    currentRegionName: string;
    bossHud: { name: string; hp: number; maxHp: number; phase: 1 | 2 | 3 } | null;
    interactPrompt: { label: string; key: string; targetId: string } | null;
    cooldowns: Record<SpellId, number>;
    mana: number;
    stamina: number;
    elapsedSeconds: number;
  }) => void;
}

function syncBodyState(phase: GamePhase) {
  if (typeof document === 'undefined') return;
  if (phase === 'victory' || phase === 'defeat') {
    document.body.dataset.state = 'gameover';
  } else {
    document.body.dataset.state = phase;
  }
}

export function hasSavedCheckpoint(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    return !!window.localStorage.getItem(SAVE_STORAGE_KEY);
  } catch {
    return false;
  }
}

function syncSideQuestUnlocks(
  chapter: number,
  sq: Record<SideQuestId, { status: SideQuestStatus; progress: number }>,
): Record<SideQuestId, { status: SideQuestStatus; progress: number }> {
  const next = { ...sq };
  (Object.keys(SIDE_QUESTS) as SideQuestId[]).forEach((id) => {
    if (next[id].status === 'locked' && chapter >= SIDE_QUESTS[id].unlockChapter) {
      next[id] = { ...next[id], status: 'available' };
    }
  });
  return next;
}

export interface SanitizedCheckpointData {
  mainStep: MainQuestStepId;
  flags: StoryFlags;
  sideQuests: Record<SideQuestId, { status: SideQuestStatus; progress: number }>;
  knowledgePoints: number;
  unlockedSkills: SkillId[];
  patrolKilled: number;
  discoveredLocations: string[];
  inventory: InventorySlot[];
  storyItems: string[];
  stonePuzzleSeq: StoneRuneId[];
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  stamina: number;
  maxStamina: number;
  level: number;
  xp: number;
  staffLightOn: boolean;
  playerX: number;
  playerZ: number;
  doneInteractables: string[];
  deadEnemyIds: string[];
  collectedIds: string[];
  litBrazierIds: string[] | null;
  fogMask: string | null;
  customWaypoint: { x: number; z: number } | null;
  trackedQuest: { kind: 'main' } | { kind: 'side'; id: SideQuestId };
  runStats: GameStoreState['runStats'];
}

export function sanitizeCheckpointData(rawData: unknown): SanitizedCheckpointData | null {
  if (!rawData || typeof rawData !== 'object') return null;
  const d = rawData as Record<string, unknown>;

  const mainStep = getMainQuestStepDef(typeof d.mainStep === 'string' ? d.mainStep : 'ch1_inspect_horse').id;

  const baseFlags = initialFlags();
  const rawFlags = d.flags && typeof d.flags === 'object' ? (d.flags as Record<string, unknown>) : {};
  const validRovanChoices: readonly RovanChoice[] = ['none', 'truth_and_mercy', 'justice', 'secrecy'];
  const validApproaches: readonly ApproachChoice[] = ['direct', 'ledge', 'tunnel'];
  const flags: StoryFlags = {
    edranRescued: typeof rawFlags.edranRescued === 'boolean' ? rawFlags.edranRescued : baseFlags.edranRescued,
    caravanEvidenceCount:
      typeof rawFlags.caravanEvidenceCount === 'number' && Number.isFinite(rawFlags.caravanEvidenceCount)
        ? Math.max(0, Math.min(3, Math.floor(rawFlags.caravanEvidenceCount)))
        : baseFlags.caravanEvidenceCount,
    merchantInterviewed:
      typeof rawFlags.merchantInterviewed === 'boolean'
        ? rawFlags.merchantInterviewed
        : baseFlags.merchantInterviewed,
    puzzleSolved: typeof rawFlags.puzzleSolved === 'boolean' ? rawFlags.puzzleSolved : baseFlags.puzzleSolved,
    rovanChoice: validRovanChoices.includes(rawFlags.rovanChoice as RovanChoice)
      ? (rawFlags.rovanChoice as RovanChoice)
      : baseFlags.rovanChoice,
    rovanConfessed:
      typeof rawFlags.rovanConfessed === 'boolean' ? rawFlags.rovanConfessed : baseFlags.rovanConfessed,
    approachChosen: validApproaches.includes(rawFlags.approachChosen as ApproachChoice)
      ? (rawFlags.approachChosen as ApproachChoice)
      : baseFlags.approachChosen,
    beaconsDisabled:
      typeof rawFlags.beaconsDisabled === 'number' && Number.isFinite(rawFlags.beaconsDisabled)
        ? Math.max(0, Math.min(3, Math.floor(rawFlags.beaconsDisabled)))
        : baseFlags.beaconsDisabled,
    nelaRescued: typeof rawFlags.nelaRescued === 'boolean' ? rawFlags.nelaRescued : baseFlags.nelaRescued,
    villageHealed: typeof rawFlags.villageHealed === 'boolean' ? rawFlags.villageHealed : baseFlags.villageHealed,
    dwarfShortcut: typeof rawFlags.dwarfShortcut === 'boolean' ? rawFlags.dwarfShortcut : baseFlags.dwarfShortcut,
    villageMorale: typeof rawFlags.villageMorale === 'boolean' ? rawFlags.villageMorale : baseFlags.villageMorale,
    villageSupplied:
      typeof rawFlags.villageSupplied === 'boolean' ? rawFlags.villageSupplied : baseFlags.villageSupplied,
    grakhDefeated: typeof rawFlags.grakhDefeated === 'boolean' ? rawFlags.grakhDefeated : baseFlags.grakhDefeated,
  };

  const baseSq = initialSideQuests();
  const rawSq = d.sideQuests && typeof d.sideQuests === 'object' ? (d.sideQuests as Record<string, unknown>) : {};
  const validStatuses: readonly SideQuestStatus[] = ['locked', 'available', 'active', 'completed'];
  (Object.keys(baseSq) as SideQuestId[]).forEach((id) => {
    const entry = rawSq[id];
    if (entry && typeof entry === 'object') {
      const e = entry as Record<string, unknown>;
      const status = validStatuses.includes(e.status as SideQuestStatus)
        ? (e.status as SideQuestStatus)
        : baseSq[id].status;
      const progress =
        typeof e.progress === 'number' && Number.isFinite(e.progress)
          ? Math.max(0, Math.min(SIDE_QUESTS[id].requiredCount, Math.floor(e.progress)))
          : baseSq[id].progress;
      baseSq[id] = { status, progress };
    }
  });

  const maxHp =
    typeof d.maxHp === 'number' && Number.isFinite(d.maxHp) ? Math.max(80, Math.min(400, Math.round(d.maxHp))) : 120;
  const hp =
    typeof d.hp === 'number' && Number.isFinite(d.hp) ? Math.max(1, Math.min(maxHp, Math.round(d.hp))) : maxHp;
  const maxMana =
    typeof d.maxMana === 'number' && Number.isFinite(d.maxMana)
      ? Math.max(60, Math.min(400, Math.round(d.maxMana)))
      : 100;
  const mana =
    typeof d.mana === 'number' && Number.isFinite(d.mana) ? Math.max(0, Math.min(maxMana, Math.round(d.mana))) : maxMana;
  const maxStamina =
    typeof d.maxStamina === 'number' && Number.isFinite(d.maxStamina)
      ? Math.max(60, Math.min(300, Math.round(d.maxStamina)))
      : 100;
  const stamina =
    typeof d.stamina === 'number' && Number.isFinite(d.stamina)
      ? Math.max(0, Math.min(maxStamina, Math.round(d.stamina)))
      : maxStamina;

  const level =
    typeof d.level === 'number' && Number.isFinite(d.level) ? Math.max(1, Math.min(30, Math.floor(d.level))) : 1;
  const xp = typeof d.xp === 'number' && Number.isFinite(d.xp) ? Math.max(0, Math.floor(d.xp)) : 0;
  const knowledgePoints =
    typeof d.knowledgePoints === 'number' && Number.isFinite(d.knowledgePoints)
      ? Math.max(0, Math.min(30, Math.floor(d.knowledgePoints)))
      : 1;
  const patrolKilled =
    typeof d.patrolKilled === 'number' && Number.isFinite(d.patrolKilled)
      ? Math.max(0, Math.min(2, Math.floor(d.patrolKilled)))
      : 0;

  const validSkillIds = new Set<string>(SKILL_TREE.map((k) => k.id));
  const unlockedSkills = Array.isArray(d.unlockedSkills)
    ? Array.from(new Set(d.unlockedSkills.filter((id): id is SkillId => typeof id === 'string' && validSkillIds.has(id))))
    : [];

  const validRunes = new Set<string>(STONE_PUZZLE_ORDER);
  const stonePuzzleSeq = flags.puzzleSolved
    ? []
    : Array.isArray(d.stonePuzzleSeq)
      ? d.stonePuzzleSeq.filter((r): r is StoneRuneId => typeof r === 'string' && validRunes.has(r)).slice(0, 3)
      : [];

  const inventory: InventorySlot[] = [];
  if (Array.isArray(d.inventory)) {
    const seenInv = new Set<string>();
    for (const rawSlot of d.inventory) {
      if (!rawSlot || typeof rawSlot !== 'object') continue;
      const slot = rawSlot as Record<string, unknown>;
      if (typeof slot.id !== 'string' || !(slot.id in ITEM_CATALOG) || seenInv.has(slot.id)) continue;
      if (typeof slot.count !== 'number' || !Number.isFinite(slot.count) || slot.count <= 0) continue;
      const maxStack = ITEM_CATALOG[slot.id].maxStack ?? 99;
      inventory.push({ id: slot.id, count: Math.min(maxStack, Math.floor(slot.count)) });
      seenInv.add(slot.id);
      if (inventory.length >= 12) break;
    }
  }

  const storyItems = Array.isArray(d.storyItems)
    ? Array.from(new Set(d.storyItems.filter((id): id is string => typeof id === 'string' && id in ITEM_CATALOG)))
    : [];

  const discoveredLocations = Array.isArray(d.discoveredLocations)
    ? Array.from(new Set(d.discoveredLocations.filter((id): id is string => typeof id === 'string' && id.length > 0)))
    : ['woodland_path'];

  const rawPx = typeof d.playerX === 'number' && Number.isFinite(d.playerX) ? d.playerX : SPAWN_POS.x;
  const rawPz = typeof d.playerZ === 'number' && Number.isFinite(d.playerZ) ? d.playerZ : SPAWN_POS.z;
  const radial = Math.hypot(rawPx, rawPz);
  const clampScale = radial > PLAYABLE_LIMIT - 2 ? (PLAYABLE_LIMIT - 2) / radial : 1;
  const playerX = rawPx * clampScale;
  const playerZ = rawPz * clampScale;

  const doneInteractables = Array.isArray(d.doneInteractables)
    ? Array.from(new Set(d.doneInteractables.filter((id): id is string => typeof id === 'string')))
    : [];
  const collectedIds = Array.isArray(d.collectedIds)
    ? Array.from(new Set(d.collectedIds.filter((id): id is string => typeof id === 'string')))
    : [];
  const litBrazierIds = Array.isArray(d.litBrazierIds)
    ? Array.from(new Set(d.litBrazierIds.filter((id): id is string => typeof id === 'string')))
    : null;

  const deadSet = new Set<string>(
    Array.isArray(d.deadEnemyIds)
      ? d.deadEnemyIds.filter((id): id is string => typeof id === 'string')
      : [],
  );
  // Backward-compatible inference for checkpoints saved before explicit deadEnemyIds
  if (patrolKilled >= 2) {
    deadSet.add('patrol_1');
    deadSet.add('patrol_2');
  }
  if (flags.grakhDefeated) {
    deadSet.add('tower_boss');
    deadSet.add('grakh_add_1');
    deadSet.add('grakh_add_2');
  }

  const rawWp = d.customWaypoint as Record<string, unknown> | null | undefined;
  const customWaypoint =
    rawWp &&
    typeof rawWp === 'object' &&
    typeof rawWp.x === 'number' &&
    Number.isFinite(rawWp.x) &&
    typeof rawWp.z === 'number' &&
    Number.isFinite(rawWp.z)
      ? { x: rawWp.x, z: rawWp.z }
      : null;

  const rawTracked = d.trackedQuest as Record<string, unknown> | null | undefined;
  const trackedQuest: { kind: 'main' } | { kind: 'side'; id: SideQuestId } =
    rawTracked &&
    typeof rawTracked === 'object' &&
    rawTracked.kind === 'side' &&
    typeof rawTracked.id === 'string' &&
    rawTracked.id in SIDE_QUESTS
      ? { kind: 'side', id: rawTracked.id as SideQuestId }
      : { kind: 'main' };

  const rawStats = d.runStats && typeof d.runStats === 'object' ? (d.runStats as Record<string, unknown>) : {};
  const readStat = (val: unknown) =>
    typeof val === 'number' && Number.isFinite(val) && val >= 0 ? Math.floor(val) : 0;

  return {
    mainStep,
    flags,
    sideQuests: baseSq,
    knowledgePoints,
    unlockedSkills,
    patrolKilled,
    discoveredLocations: discoveredLocations.length > 0 ? discoveredLocations : ['woodland_path'],
    inventory,
    storyItems,
    stonePuzzleSeq,
    hp,
    maxHp,
    mana,
    maxMana,
    stamina,
    maxStamina,
    level,
    xp,
    staffLightOn: typeof d.staffLightOn === 'boolean' ? d.staffLightOn : false,
    playerX,
    playerZ,
    doneInteractables,
    deadEnemyIds: Array.from(deadSet),
    collectedIds,
    litBrazierIds,
    fogMask: typeof d.fogMask === 'string' ? d.fogMask : null,
    customWaypoint,
    trackedQuest,
    runStats: {
      elapsedSeconds: readStat(rawStats.elapsedSeconds),
      enemiesDefeated: readStat(rawStats.enemiesDefeated),
      spellsCast: readStat(rawStats.spellsCast),
      damageTaken: readStat(rawStats.damageTaken),
    },
  };
}

export const useGameStore = create<GameStoreState>((set, get) => ({
  phase: 'title',
  hp: 120,
  maxHp: 120,
  mana: 100,
  maxMana: 100,
  stamina: 100,
  maxStamina: 100,
  level: 1,
  xp: 0,
  knowledgePoints: 0, // The first specialization is earned on arrival in Líska.
  unlockedSkills: [],
  staffLightOn: false,
  shieldActive: false,
  cooldowns: {
    staff_light: 0,
    flash_of_light: 0,
    fire_spell: 0,
    shockwave: 0,
  },
  mainStep: 'ch1_inspect_horse',
  flags: initialFlags(),
  sideQuests: initialSideQuests(),
  stonePuzzleSeq: [],
  patrolKilled: 0,
  discoveredLocations: ['woodland_path'],
  inventory: [
    { id: 'healing_poultice', count: 1 },
    { id: 'herbal_decoction', count: 1 },
    { id: 'travel_bread', count: 1 },
    { id: 'athelas_herb', count: 2 },
    { id: 'linen_cloth', count: 1 },
    { id: 'pure_water', count: 1 },
  ],
  storyItems: [],
  activeDialogue: null,
  journalOpen: false,
  journalTab: 'quests',
  worldMapOpen: false,
  fogGrid: createInitialFogGrid(),
  customWaypoint: null,
  trackedQuest: { kind: 'main' },
  mapFilters: loadMapPreferences().filters,
  mapPresets: loadMapPreferences().presets,
  waypointBearingDeg: null,
  waypointDistance: null,
  interactPrompt: null,
  notification: null,
  compassHeadingDeg: 0,
  objectiveBearingDeg: 0,
  objectiveDistance: 6,
  currentRegionName: 'Lesní vyhlídka',
  bossHud: null,
  lastDamageAt: 0,
  combatCallout: null,
  settings: {
    mouseSensitivity: 1.0,
    graphicsQuality: 'high',
    muted: false,
    musicVolume: 0.7,
    sfxVolume: 0.85,
  },
  runStats: {
    elapsedSeconds: 0,
    enemiesDefeated: 0,
    spellsCast: 0,
    damageTaken: 0,
  },

  startGame: () => {
    const s = get().settings;
    gameAudio.setMusicVolume(s.musicVolume);
    gameAudio.setSfxVolume(s.sfxVolume);
    gameAudio.setMuted(s.muted);
    gameAudio.setPaused(false);
    gameAudio.setVillageSongUnlocked(get().flags.villageMorale);
    gameAudio.startAmbience();
    gameAudio.setMusicContext('exploration');
    syncBodyState('playing');
    set({
      phase: 'playing',
      journalOpen: false,
      worldMapOpen: false,
      activeDialogue: null,
      notification: {
        title: 'Kapitola I: Zhaslá světla',
        subtitle: '„Kůň bez pána, cesta bez strážců…“ Prohlédni sedlo před sebou [F]',
        expiresAt: Date.now() + 5000,
      },
    });
  },

  restartGame: () => {
    liveSim.playerX = SPAWN_POS.x;
    liveSim.playerY = groundHeightAt(SPAWN_POS.x, SPAWN_POS.z);
    liveSim.playerZ = SPAWN_POS.z;
    liveSim.playerYaw = Math.PI;
    liveSim.cameraYaw = 0;
    liveSim.cameraPitch = 0.24;
    liveSim.velX = 0;
    liveSim.velZ = 0;
    liveSim.locomotionSpeed = 0;
    liveSim.strideBlend = 0;
    liveSim.yawRate = 0;
    liveSim.isMoving = false;
    liveSim.isSprinting = false;
    liveSim.isCombatAlert = false;
    liveSim.walkCycle = 0;
    liveSim.animState = 'IDLE';
    liveSim.attackTimer = 0;
    liveSim.attackCombo = 0;
    liveSim.attackHitApplied = false;
    liveSim.attackBuffered = false;
    liveSim.swingId = 0;
    liveSim.swingHitEnemyIds.clear();
    liveSim.castTimer = 0;
    liveSim.castDuration = 0.44;
    liveSim.castKind = null;
    liveSim.pendingCastSpell = null;
    liveSim.pendingCastReleased = false;
    liveSim.dodgeTimer = 0;
    liveSim.staggerTimer = 0;
    liveSim.shieldHoldTimer = 0;
    liveSim.torchLightTimer = 0;
    liveSim.playerNoiseTimer = 0;
    liveSim.combatTailTimer = 0;
    liveSim.hurtFlashTimer = 0;
    liveSim.hitstopTimer = 0;
    liveSim.cameraTrauma = 0;
    liveSim.cameraTraumaTime = 0;
    liveSim.flashBurstTimer = 0;
    liveSim.fireBurstTimer = 0;
    liveSim.shockwaveTimer = 0;
    liveSim.grakhPhaseAnnounced = 1;
    liveSim.enemies = createInitialEnemies();
    liveSim.collectibles = createInitialCollectibles();
    liveSim.storyInteractables = createInitialStoryInteractables();
    liveSim.braziers = createInitialBraziers();
    liveSim.projectiles = [];
    liveSim.nextProjectileId = 1;
    liveSim.footstepAccum = 0;
    liveSim.resetCounter += 1;

    gameAudio.setPaused(false);
    gameAudio.setVillageSongUnlocked(false);
    gameAudio.startAmbience();
    gameAudio.setMusicContext('exploration');
    syncBodyState('playing');
    set({
      phase: 'playing',
      hp: 120,
      maxHp: 120,
      mana: 100,
      maxMana: 100,
      stamina: 100,
      maxStamina: 100,
      level: 1,
      xp: 0,
      knowledgePoints: 0,
      unlockedSkills: [],
      staffLightOn: false,
      shieldActive: false,
      cooldowns: { staff_light: 0, flash_of_light: 0, fire_spell: 0, shockwave: 0 },
      mainStep: 'ch1_inspect_horse',
      flags: initialFlags(),
      sideQuests: initialSideQuests(),
      stonePuzzleSeq: [],
      patrolKilled: 0,
      discoveredLocations: ['woodland_path'],
      inventory: [
        { id: 'healing_poultice', count: 1 },
        { id: 'herbal_decoction', count: 1 },
        { id: 'travel_bread', count: 1 },
        { id: 'athelas_herb', count: 2 },
        { id: 'linen_cloth', count: 1 },
        { id: 'pure_water', count: 1 },
      ],
      storyItems: [],
      activeDialogue: null,
      journalOpen: false,
      journalTab: 'quests',
      worldMapOpen: false,
      fogGrid: createInitialFogGrid(),
      customWaypoint: null,
      trackedQuest: { kind: 'main' },
      waypointBearingDeg: null,
      waypointDistance: null,
      interactPrompt: null,
      combatCallout: null,
      notification: {
        title: 'Kapitola I: Zhaslá světla',
        subtitle: 'Prohlédni zakrvácené sedlo u koně na stezce [F]',
        expiresAt: Date.now() + 4500,
      },
      bossHud: null,
      lastDamageAt: 0,
      runStats: {
        elapsedSeconds: 0,
        enemiesDefeated: 0,
        spellsCast: 0,
        damageTaken: 0,
      },
    });
  },

  pauseGame: () => {
    const { phase } = get();
    if (phase !== 'playing') return;
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }
    gameAudio.setPaused(true);
    syncBodyState('paused');
    set({ phase: 'paused', shieldActive: false, worldMapOpen: false, journalOpen: false });
  },

  resumeGame: () => {
    const { phase } = get();
    if (phase !== 'paused') return;
    gameAudio.setPaused(false);
    syncBodyState('playing');
    set({ phase: 'playing' });
  },

  returnToTitle: () => {
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }
    gameAudio.setPaused(false);
    gameAudio.setMusicContext('exploration');
    syncBodyState('title');
    set({ phase: 'title', journalOpen: false, worldMapOpen: false, activeDialogue: null, shieldActive: false });
  },

  toggleJournal: (tab) => {
    const { phase, journalOpen, activeDialogue } = get();
    if (phase !== 'playing' || activeDialogue) return;
    if (!journalOpen && document.pointerLockElement) {
      document.exitPointerLock?.();
    }
    set((s) => ({
      journalOpen: tab ? true : !s.journalOpen,
      journalTab: tab ?? s.journalTab,
      worldMapOpen: false,
      shieldActive: false,
    }));
  },

  setJournalTab: (tab) => set({ journalTab: tab }),

  toggleWorldMap: (open) => {
    const { phase, worldMapOpen, activeDialogue } = get();
    if (phase !== 'playing' || activeDialogue) return;
    const nextOpen = typeof open === 'boolean' ? open : !worldMapOpen;
    if (nextOpen && document.pointerLockElement) {
      document.exitPointerLock?.();
    }
    set({
      worldMapOpen: nextOpen,
      journalOpen: nextOpen ? false : get().journalOpen,
      shieldActive: false,
    });
  },

  revealExplorationAt: (x, z, radius = 15) => {
    const s = get();
    const res = revealFogRadius(s.fogGrid, x, z, radius);
    if (res.changed) {
      set({ fogGrid: res.next });
    }
  },

  setCustomWaypoint: (pos, silent = false) => {
    set({
      customWaypoint: pos ? { x: Math.round(pos.x * 10) / 10, z: Math.round(pos.z * 10) / 10 } : null,
      waypointBearingDeg: pos ? get().waypointBearingDeg : null,
      waypointDistance: pos ? get().waypointDistance : null,
    });
    if (!silent && pos) {
      gameAudio.playQuestChime();
    }
  },

  setTrackedQuest: (target) => {
    set({ trackedQuest: target });
  },

  setMapFilterCategory: (category, visible) => {
    const next = { ...get().mapFilters, [category]: visible };
    saveMapPreferences({ filters: next, presets: get().mapPresets });
    set({ mapFilters: next });
  },

  setAllMapFilters: (visible) => {
    const next = createDefaultMapFilters();
    (Object.keys(next) as MapMarkerCategory[]).forEach((k) => {
      next[k] = visible;
    });
    saveMapPreferences({ filters: next, presets: get().mapPresets });
    set({ mapFilters: next });
  },

  resetMapFilters: () => {
    const nextFilters = createDefaultMapFilters();
    const nextPresets = { onlyAvailableQuests: false, onlyDiscovered: false, onlyActiveObjectives: false };
    saveMapPreferences({ filters: nextFilters, presets: nextPresets });
    set({ mapFilters: nextFilters, mapPresets: nextPresets });
  },

  setMapPresets: (partial) => {
    const nextPresets = { ...get().mapPresets, ...partial };
    saveMapPreferences({ filters: get().mapFilters, presets: nextPresets });
    set({ mapPresets: nextPresets });
  },

  setSettings: (partial) => {
    set((s) => {
      const next = { ...s.settings, ...partial };
      gameAudio.setMuted(next.muted);
      gameAudio.setMusicVolume(next.musicVolume);
      gameAudio.setSfxVolume(next.sfxVolume);
      return { settings: next };
    });
  },

  toggleStaffLight: () => {
    const s = get();
    if (s.cooldowns.staff_light > 0) return;
    set((st) => ({
      staffLightOn: !st.staffLightOn,
      cooldowns: { ...st.cooldowns, staff_light: SPELL_CONFIGS.staff_light.cooldown },
    }));
  },

  setShieldActive: (active) => {
    const s = get();
    if (active && (s.mana < 5 || liveSim.dodgeTimer > 0 || liveSim.staggerTimer > 0 || liveSim.attackTimer > 0)) {
      if (s.shieldActive) set({ shieldActive: false });
      return;
    }
    if (s.shieldActive !== active) {
      if (active) liveSim.shieldHoldTimer = 0;
      set({ shieldActive: active });
    }
  },

  openNpcDialogue: (npcId) => {
    const s = get();
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }
    const dlg = buildNpcDialogue(npcId, s.mainStep, s.flags, s.sideQuests);
    set({
      activeDialogue: dlg,
      shieldActive: false,
      journalOpen: false,
      worldMapOpen: false,
    });
  },

  resolveDialogueChoice: (effectId) => {
    const s = get();
    if (effectId === 'close') {
      set({ activeDialogue: null });
      return;
    }

    let nextStep = s.mainStep;
    const nextFlags = { ...s.flags };
    let nextSq = { ...s.sideQuests };
    let kpGain = 0;
    let notifTitle = '';
    let notifSub = '';
    let nextHp = s.hp;
    let nextMana = s.mana;
    let nextMaxMana = s.maxMana;
    let shouldSave = false;

    switch (effectId) {
      case 'edran_rescued_ch1': {
        nextFlags.edranRescued = true;
        if (nextStep === 'ch1_find_edran') {
          const clothFound = liveSim.storyInteractables.some((obj) => obj.id === 'cloth_clue' && obj.done);
          nextStep = clothFound ? (s.patrolKilled >= 2 ? 'ch1_escort_liska' : 'ch1_defeat_scouts') : 'ch1_track_scouts';
          notifTitle = 'Edran ošetřen';
          notifSub = clothFound
            ? (s.patrolKilled >= 2 ? 'Edran zamířil do Lísky. Vydej se za ním.' : 'Edran zamířil do Lísky. Zastav zbývající průzkumníky.')
            : 'Edran míří do Lísky. Prozkoumej stopy útočníků v borovicích [F]';
          shouldSave = true;
        }
        break;
      }
      case 'advance_to_ch2': {
        if (nextStep === 'ch1_escort_liska') {
          nextStep = 'ch2_inspect_caravan';
          kpGain += 1;
          nextSq = syncSideQuestUnlocks(2, nextSq);
          notifTitle = 'Kapitola II: Stopy v popelu';
          notifSub = 'Získán první Bod poznání · Otevři deník [Tab] a zvol si vylepšení';
          shouldSave = true;
        }
        break;
      }
      case 'edran_start_caravan': {
        if (nextStep === 'ch2_talk_village') {
          nextStep = 'ch2_inspect_caravan';
          notifTitle = 'Pátrání po karavaně';
          notifSub = 'Najdi tři důkazy u rozbitých vozů na lesní stezce';
        }
        break;
      }
      case 'merchant_talked': {
        nextFlags.merchantInterviewed = true;
        if (nextStep === 'ch2_talk_merchant') {
          nextStep = 'ch2_inspect_camp';
          notifTitle = 'Odhalení přeživšího';
          notifSub = 'Překroč Stříbrný brod a prohledej opuštěný tábor skřetů';
          shouldSave = true;
        }
        break;
      }
      case 'start_ch3_mines': {
        if (nextStep === 'ch2_return_liska' || nextStep === 'ch3_talk_bruni') {
          nextStep = 'ch3_enter_mines';
          nextSq = syncSideQuestUnlocks(3, nextSq);
          notifTitle = 'Kapitola III: Jména vytesaná do kamene';
          notifSub = 'Vydej se do starých štol pod východními skalami [L pro světlo]';
          shouldSave = true;
        }
        break;
      }
      case 'rovan_truth_mercy': {
        nextFlags.rovanChoice = 'truth_and_mercy';
        nextFlags.rovanConfessed = true;
        nextStep = 'ch4_prepare_assault';
        notifTitle = 'Rozhodnutí učiněno: Pravda a soucit';
        notifSub = 'Rovan předá informace o zajatcích. Promluv s Edranem před odchodem [F]';
        shouldSave = true;
        break;
      }
      case 'rovan_justice': {
        nextFlags.rovanChoice = 'justice';
        nextFlags.rovanConfessed = true;
        nextStep = 'ch4_prepare_assault';
        notifTitle = 'Rozhodnutí učiněno: Spravedlivý soud';
        notifSub = 'Rovan odevzdán do péče hlídky. Promluv s Edranem [F]';
        shouldSave = true;
        break;
      }
      case 'rovan_secrecy': {
        nextFlags.rovanChoice = 'secrecy';
        nextFlags.rovanConfessed = false;
        nextStep = 'ch4_prepare_assault';
        notifTitle = 'Rozhodnutí učiněno: Tichá dohoda';
        notifSub = 'Rovanův podíl zůstává skryt. Promluv s Edranem o postupu [F]';
        shouldSave = true;
        break;
      }
      case 'approach_direct':
      case 'approach_ledge':
      case 'approach_tunnel': {
        const chosen: ApproachChoice =
          effectId === 'approach_tunnel' ? 'tunnel' : effectId === 'approach_ledge' ? 'ledge' : 'direct';
        nextFlags.approachChosen = chosen;
        if (nextStep === 'ch4_prepare_assault') {
          nextStep = resolveChapter5EntryStep(nextFlags.beaconsDisabled, nextFlags.grakhDefeated);
          kpGain += 1;
          notifTitle = nextStep === 'ch6_return_liska' ? 'Kapitola VI: Úsvit nad údolím' : 'Kapitola V: Oheň na hřebeni';
          notifSub =
            nextStep === 'ch6_return_liska'
              ? 'Pevnost i Grakh už byli umlčeni (+1 Bod poznání) · Promluv s Edranem v Lísce!'
              : chosen === 'tunnel'
                ? 'Trpasličí zkratka odkryta (+1 Bod poznání) · Zastav signální ohně a poraz Grakha!'
                : chosen === 'ledge'
                  ? 'Lesní římsa zmapována (+1 Bod poznání) · Zastav signální ohně na hřebeni!'
                  : 'Přímý postup k pevnosti (+1 Bod poznání) · Zastav signální ohně a poraz Grakha!';
          shouldSave = true;
        }
        break;
      }
      case 'accept_sq_healer': {
        nextSq.sq_healer_hope = { ...nextSq.sq_healer_hope, status: 'active' };
        notifTitle = 'Vedlejší úkol: Léčitelčina poslední naděje';
        notifSub = 'Nasbírej 3 trsy léčivých bylin v lese nad stezkou';
        break;
      }
      case 'complete_sq_healer': {
        nextSq.sq_healer_hope = { ...nextSq.sq_healer_hope, status: 'completed' };
        nextFlags.villageHealed = true;
        kpGain += 1;
        get().addInventoryItem('athelas_herb', true);
        get().addInventoryItem('athelas_herb', true);
        get().addInventoryItem('healing_poultice', true);
        notifTitle = 'Úkol splněn: Léčitelčina poslední naděje';
        notifSub = '+1 Bod poznání · Získány byliny a obklad pro Lískou';
        shouldSave = true;
        break;
      }
      case 'accept_sq_stone': {
        nextSq.sq_stone_kin = { ...nextSq.sq_stone_kin, status: 'active' };
        notifTitle = 'Vedlejší úkol: Odkaz kamenného rodu';
        notifSub = 'Prozkoumej 3 staré kamenné značky na východních svazích';
        break;
      }
      case 'complete_sq_stone': {
        nextSq.sq_stone_kin = { ...nextSq.sq_stone_kin, status: 'completed' };
        nextFlags.dwarfShortcut = true;
        kpGain += 1;
        get().addInventoryItem('dwarf_wedge', true);
        get().addStoryItem('bruni_notes');
        notifTitle = 'Úkol splněn: Odkaz kamenného rodu';
        notifSub = '+1 Bod poznání · Získány Bruniho záznamy a cesta štolami k pevnosti';
        shouldSave = true;
        break;
      }
      case 'accept_sq_song': {
        nextSq.sq_forest_song = { ...nextSq.sq_forest_song, status: 'active' };
        notifTitle = 'Vedlejší úkol: Píseň, kterou les zapomněl';
        notifSub = 'Najdi 3 ztracené zápisy písně u starých stezek v údolí';
        break;
      }
      case 'complete_sq_song': {
        nextSq.sq_forest_song = { ...nextSq.sq_forest_song, status: 'completed' };
        nextFlags.villageMorale = true;
        nextMaxMana += 15;
        nextMana = nextMaxMana;
        kpGain += 1;
        gameAudio.setVillageSongUnlocked(true);
        notifTitle = 'Úkol splněn: Píseň, kterou les zapomněl';
        notifSub = '+1 Bod poznání · +15 Soustředění · Vesnice získala zpět odvahu';
        shouldSave = true;
        break;
      }
      case 'accept_sq_supplies': {
        nextSq.sq_lost_supplies = { ...nextSq.sq_lost_supplies, status: 'active' };
        notifTitle = 'Vedlejší úkol: Ztracené zásoby';
        notifSub = 'Najdi ztracený zásobovací vůz v západním lomu severně od brodu';
        break;
      }
      case 'rest_liska': {
        nextHp = s.maxHp;
        nextMana = s.maxMana;
        notifTitle = 'Odpočinek v Lísce';
        notifSub = 'Zdraví i Soustředění obnoveny · Postup uložen';
        shouldSave = true;
        break;
      }
      case 'finish_campaign_victory': {
        gameAudio.playQuestChime();
        gameAudio.setMusicContext('victory');
        syncBodyState('victory');
        set({
          activeDialogue: null,
          mainStep: 'completed',
          phase: 'victory',
          flags: nextFlags,
        });
        return;
      }
    }

    if (notifTitle) gameAudio.playQuestChime();

    const completedTrackedSide =
      (effectId === 'complete_sq_healer' && s.trackedQuest.kind === 'side' && s.trackedQuest.id === 'sq_healer_hope') ||
      (effectId === 'complete_sq_stone' && s.trackedQuest.kind === 'side' && s.trackedQuest.id === 'sq_stone_kin') ||
      (effectId === 'complete_sq_song' && s.trackedQuest.kind === 'side' && s.trackedQuest.id === 'sq_forest_song');

    set({
      activeDialogue: null,
      mainStep: nextStep,
      flags: nextFlags,
      sideQuests: nextSq,
      trackedQuest: completedTrackedSide ? { kind: 'main' } : s.trackedQuest,
      knowledgePoints: s.knowledgePoints + kpGain,
      hp: nextHp,
      mana: nextMana,
      maxMana: nextMaxMana,
      stamina: effectId === 'rest_liska' ? s.maxStamina : s.stamina,
      notification: notifTitle
        ? { title: notifTitle, subtitle: notifSub, expiresAt: Date.now() + 4500 }
        : s.notification,
    });

    if (shouldSave) {
      get().saveCheckpoint(true);
    }
  },

  interactWithStoryObject: (objId) => {
    const obj = liveSim.storyInteractables.find((o) => o.id === objId);
    if (!obj || obj.done) return;

    const s = get();
    let nextStep = s.mainStep;
    const nextFlags = { ...s.flags };
    let nextSq = { ...s.sideQuests };
    let nextPuzzle = s.stonePuzzleSeq;
    let kpGain = 0;
    let xpGain = 25;
    let title = '';
    let sub = '';

    if (obj.kind === 'horse_clue') {
      obj.done = true;
      nextStep = s.mainStep === 'ch1_inspect_horse' ? 'ch1_find_edran' : s.mainStep;
      title = 'Stopa: Zakrvácené sedlo';
      sub = 'Stopy vedou na sever ke strážní stezce. Najdi zraněného hraničáře Edrana [F]';
    } else if (obj.kind === 'cloth_clue') {
      obj.done = true;
      get().addStoryItem('black_cloth_emblem');
      if (s.mainStep === 'ch1_track_scouts') {
        nextStep = s.patrolKilled >= 2 ? 'ch1_escort_liska' : 'ch1_defeat_scouts';
      }
      title = 'Nalezena černá látka se symbolem';
      sub = s.patrolKilled >= 2 ? 'Cesta je čistá — vydej se do osady Líska' : 'Poraž skřetí průzkumníky před sebou!';
    } else if (obj.kind === 'caravan_evidence') {
      obj.done = true;
      nextFlags.caravanEvidenceCount = Math.min(3, nextFlags.caravanEvidenceCount + 1);
      if (nextFlags.caravanEvidenceCount >= 3 && s.mainStep === 'ch2_inspect_caravan') {
        nextStep = nextFlags.merchantInterviewed ? 'ch2_inspect_camp' : 'ch2_talk_merchant';
        title = 'Všechny důkazy z karavany shromážděny (3/3)';
        sub = 'Bedny byly majetkem správy údolí. Vyslechni skrytého obchodníka poblíž!';
      } else {
        title = `Důkaz z karavany (${nextFlags.caravanEvidenceCount}/3)`;
        sub = 'Prohlédni zbývající trosky vozů';
      }
    } else if (obj.kind === 'camp_map') {
      obj.done = true;
      get().addStoryItem('forgotten_map');
      get().addStoryItem('prisoner_list');
      if (s.mainStep === 'ch2_inspect_camp' || s.mainStep === 'ch2_talk_merchant') {
        nextStep = 'ch2_return_liska';
      }
      xpGain = 45;
      title = 'Nalezena Mapa zapomenutých průchodů';
      sub = 'Vrať se do osady Líska a ukaž mapu trpaslíkovi Brunimu [F]';
    } else if (obj.kind === 'stone_rune' && obj.runeId) {
      if (nextFlags.puzzleSolved) return;
      const res = stepStonePuzzle(s.stonePuzzleSeq, obj.runeId);
      nextPuzzle = res.nextSequence;
      if (res.reset) {
        liveSim.storyInteractables.forEach((o) => {
          if (o.kind === 'stone_rune') o.done = false;
        });
        gameAudio.playEnemyAlert(false);
        title = 'Kamenný mechanismus se vrátil zpět';
        sub = 'Pořadí zní: „Nejdříve dílo (Kladivo), potom cesta (Hora) a nakonec světlo (Pochodeň).“';
      } else if (res.solved) {
        liveSim.storyInteractables.forEach((o) => {
          if (o.kind === 'stone_rune') o.done = true;
        });
        nextFlags.puzzleSolved = true;
        if (s.mainStep === 'ch3_enter_mines' || s.mainStep === 'ch3_solve_stones') {
          nextStep = 'ch3_take_orders';
        }
        xpGain = 60;
        title = 'Trpasličí brána otevřena!';
        sub = 'Vezmi Grakhův rozkaz a pečeť ze skryté zásobovací komory [F]';
      } else {
        obj.done = true;
        gameAudio.playQuestChime();
        title = `${STONE_RUNE_LABELS[obj.runeId]} zapadl do drážky (${res.nextSequence.length}/3)`;
        sub = 'Pokračuj dalším kamenným znakem';
      }
    } else if (obj.kind === 'mine_orders') {
      if (!nextFlags.puzzleSolved) {
        s.notify('Komora je zapečetěna', 'Nejprve vyřeš hádanku tří kamenných znaků (Kladivo → Hora → Pochodeň)', 2600);
        return;
      }
      obj.done = true;
      get().addStoryItem('grakh_orders');
      get().addStoryItem('rovan_seal');
      nextStep = 'ch4_check_ledger';
      kpGain += 1;
      nextSq = syncSideQuestUnlocks(4, nextSq);
      xpGain = 65;
      title = 'Kapitola IV: Cena ticha';
      sub = 'Pečeť patří Rovanovi! (+1 Bod poznání) · Prověř jeho záznamy v Lísce';
    } else if (obj.kind === 'rovan_ledger') {
      obj.done = true;
      if (s.mainStep === 'ch4_check_ledger') {
        nextStep = 'ch4_confront_rovan';
      }
      title = 'Účetní knihy potvrzují shodu';
      sub = 'Pečeť i písmo odpovídají. Promluv si s Rovanem v Lísce [F]';
    } else if (obj.kind === 'signal_beacon') {
      if (obj.id === 'beacon_summit' && !nextFlags.grakhDefeated) {
        s.notify('Grakh střeží hlavní signální oheň', 'Poraz nejprve velitele skřetů na vrcholu pevnosti!', 2400);
        return;
      }
      obj.done = true;
      nextFlags.beaconsDisabled += 1;
      xpGain = 40;
      if (s.mainStep === 'ch5_infiltrate_fortress' || s.mainStep === 'ch5_disable_beacons') {
        if (nextFlags.beaconsDisabled >= 2) {
          nextStep = nextFlags.grakhDefeated ? 'ch6_return_liska' : 'ch5_defeat_grakh';
          title = `Signální oheň vyřazen (${nextFlags.beaconsDisabled}/3)`;
          sub = nextFlags.grakhDefeated ? 'Vrať se do Lísky!' : 'Zastav Grakha u hlavního ohně pevnosti!';
        } else {
          nextStep = 'ch5_disable_beacons';
          title = `Signální oheň vyřazen (${nextFlags.beaconsDisabled}/2 nutných)`;
          sub = 'Vyřaď ještě druhý signální mechanismus a zachraň zajatce';
        }
      } else {
        title = `Signální oheň vyřazen (${nextFlags.beaconsDisabled}/3)`;
        sub = 'Nepřítel ztratil další spojení s horami';
      }
    } else if (obj.kind === 'prisoner_cage') {
      obj.done = true;
      nextFlags.nelaRescued = true;
      xpGain = 55;
      title = 'Zajatci a Nela osvobozeni!';
      sub = 'Grakh neměl nikdy v úmyslu Rovanovu sestru propustit.';
      // Also alert nearby watchtower guards if still alive
      for (const e of liveSim.enemies) {
        if (!e.dead && e.group === 'watchtower') {
          e.alertLevel = 1;
          if (e.aiState === 'PATROL' || e.aiState === 'IDLE') e.aiState = 'CHASE';
        }
      }
      set({
        storyItems: s.storyItems,
        flags: nextFlags,
        notification: { title, subtitle: sub, expiresAt: Date.now() + 4200 },
      });
      get().grantXp(xpGain);
      get().openNpcDialogue('nela');
      return;
    } else if (obj.kind === 'sq_herb') {
      if (nextSq.sq_healer_hope.status === 'locked') {
        s.notify('Bylina athelas', 'Sebereš ji po rozmluvě s léčitelkou Mirou v Lísce', 2000);
        return;
      }
      if (nextSq.sq_healer_hope.status === 'available') {
        nextSq.sq_healer_hope = { status: 'active', progress: 0 };
      }
      obj.done = true;
      const prog = Math.min(3, nextSq.sq_healer_hope.progress + 1);
      nextSq.sq_healer_hope = { ...nextSq.sq_healer_hope, progress: prog };
      title = `Léčivé byliny pro Miru (${prog}/3)`;
      sub = prog >= 3 ? 'Vrať se za Mirou do osady Líska' : 'Hledej další trsy u borovic';
    } else if (obj.kind === 'sq_marker') {
      if (nextSq.sq_stone_kin.status === 'locked') return;
      if (nextSq.sq_stone_kin.status === 'available') {
        nextSq.sq_stone_kin = { status: 'active', progress: 0 };
      }
      obj.done = true;
      const prog = Math.min(3, nextSq.sq_stone_kin.progress + 1);
      nextSq.sq_stone_kin = { ...nextSq.sq_stone_kin, progress: prog };
      title = `Kamenná značka rodu (${prog}/3)`;
      sub = prog >= 3 ? 'Vrať se k Brunimu do Lísky' : 'Prozkoumej další staré značky';
    } else if (obj.kind === 'sq_verse') {
      if (nextSq.sq_forest_song.status === 'locked') return;
      if (nextSq.sq_forest_song.status === 'available') {
        nextSq.sq_forest_song = { status: 'active', progress: 0 };
      }
      obj.done = true;
      const prog = Math.min(3, nextSq.sq_forest_song.progress + 1);
      nextSq.sq_forest_song = { ...nextSq.sq_forest_song, progress: prog };
      title = `Sloka zapomenuté písně (${prog}/3)`;
      sub = prog >= 3 ? 'Vrať se za starou Elkou do Lísky' : 'Najdi zbývající dopisy';
    } else if (obj.kind === 'sq_wagon') {
      if (nextSq.sq_lost_supplies.status === 'locked') return;
      obj.done = true;
      nextSq.sq_lost_supplies = { status: 'completed', progress: 1 };
      nextFlags.villageSupplied = true;
      kpGain += 1;
      get().addInventoryItem('healing_poultice', true);
      get().addInventoryItem('herbal_decoction', true);
      get().addInventoryItem('travel_bread', true);
      xpGain = 60;
      title = 'Úkol splněn: Ztracené zásoby';
      sub = '+1 Bod poznání · Zásobovací vůz zajištěn pro obranu Lísky!';
    }

    const completedTrackedWagon =
      obj.kind === 'sq_wagon' && s.trackedQuest.kind === 'side' && s.trackedQuest.id === 'sq_lost_supplies';

    if (title) gameAudio.playQuestChime();
    set({
      mainStep: nextStep,
      flags: nextFlags,
      sideQuests: nextSq,
      trackedQuest: completedTrackedWagon ? { kind: 'main' } : s.trackedQuest,
      stonePuzzleSeq: nextPuzzle,
      knowledgePoints: s.knowledgePoints + kpGain,
      notification: title ? { title, subtitle: sub, expiresAt: Date.now() + 4200 } : s.notification,
    });
    get().grantXp(xpGain);
    if (kpGain > 0 || obj.kind === 'horse_clue' || obj.kind === 'cloth_clue' || obj.kind === 'camp_map' || obj.kind === 'mine_orders' || obj.kind === 'sq_wagon') {
      get().saveCheckpoint(true);
    }
  },

  unlockSkill: (skillId) => {
    const s = get();
    if (s.knowledgePoints <= 0 || s.unlockedSkills.includes(skillId)) return;
    const def = SKILL_TREE.find((k) => k.id === skillId);
    if (!def || s.knowledgePoints < def.cost) return;
    gameAudio.playQuestChime();
    set({
      knowledgePoints: s.knowledgePoints - def.cost,
      unlockedSkills: [...s.unlockedSkills, skillId],
      notification: {
        title: `Zdokonalení: ${def.name}`,
        subtitle: def.description,
        expiresAt: Date.now() + 3600,
      },
    });
    get().saveCheckpoint(true);
  },

  craftRecipe: (recipeId) => {
    const s = get();
    const recipe = CRAFTING_RECIPES.find((r) => r.id === recipeId);
    if (!recipe) return;

    // Must be near Osada Líska or a lit campfire/brazier
    const nearLiska = Math.hypot(liveSim.playerX - VILLAGE_POS.x, liveSim.playerZ - VILLAGE_POS.z) < 22;
    const nearFire = liveSim.braziers.some(
      (b) => b.lit && Math.hypot(liveSim.playerX - b.x, liveSim.playerZ - b.z) < 9,
    );
    if (!nearLiska && !nearFire) {
      s.notify('Výroba vyžaduje ohniště', 'Vyráběj v osadě Líska nebo u zapáleného ohně', 2400);
      return;
    }

    if (recipe.resultId === 'healing_poultice') {
      const cur = s.inventory.find((i) => i.id === 'healing_poultice')?.count ?? 0;
      if (cur >= 3) {
        s.notify('Limit léčivých obkladů', 'Můžeš nést nejvýše 3 léčivé obklady najednou', 2200);
        return;
      }
    }

    for (const ing of recipe.ingredients) {
      const have = s.inventory.find((i) => i.id === ing.itemId)?.count ?? 0;
      if (have < ing.count) {
        s.notify('Chybí suroviny', 'Posbírej potřebné materiály v lese či u řeky', 2200);
        return;
      }
    }

    let nextInv = s.inventory.map((slot) => ({ ...slot }));
    for (const ing of recipe.ingredients) {
      nextInv = nextInv
        .map((slot) => (slot.id === ing.itemId ? { ...slot, count: slot.count - ing.count } : slot))
        .filter((slot) => slot.count > 0);
    }

    const resIdx = nextInv.findIndex((slot) => slot.id === recipe.resultId);
    if (resIdx >= 0) {
      nextInv[resIdx].count += 1;
    } else {
      nextInv.push({ id: recipe.resultId, count: 1 });
    }

    const resDef = ITEM_CATALOG[recipe.resultId];
    gameAudio.playQuestChime();
    set({
      inventory: nextInv,
      notification: {
        title: `Vyrobeno: ${resDef.name}`,
        subtitle: resDef.effectText || 'Uloženo do brašny',
        expiresAt: Date.now() + 2600,
      },
    });
  },

  addInventoryItem: (itemId, silent = false) => {
    set((s) => {
      const def = ITEM_CATALOG[itemId];
      if (!def) return {};
      const idx = s.inventory.findIndex((slot) => slot.id === itemId);
      if (def.maxStack && idx >= 0 && s.inventory[idx].count >= def.maxStack) {
        return {
          notification: silent
            ? s.notification
            : {
                title: `Plná zásoba: ${def.name}`,
                subtitle: `Maximálně ${def.maxStack} ks`,
                expiresAt: Date.now() + 2200,
              },
        };
      }
      if (idx < 0 && s.inventory.length >= 12) {
        return {
          notification: {
            title: 'Brašna je plná (12/12)',
            subtitle: 'Spotřebuj nebo vyrob předměty před dalším sběrem',
            expiresAt: Date.now() + 2500,
          },
        };
      }
      const nextInv = [...s.inventory];
      if (idx >= 0) {
        nextInv[idx] = { ...nextInv[idx], count: nextInv[idx].count + 1 };
      } else {
        nextInv.push({ id: itemId, count: 1 });
      }
      return {
        inventory: nextInv,
        notification:
          !silent && def
            ? {
                title: `Získáno: ${def.name}`,
                subtitle: def.effectText || 'Uloženo do brašny',
                expiresAt: Date.now() + 3200,
              }
            : s.notification,
      };
    });
  },

  addStoryItem: (itemId) => {
    set((s) => {
      if (s.storyItems.includes(itemId)) return {};
      return { storyItems: [...s.storyItems, itemId] };
    });
  },

  useInventoryItem: (itemId) => {
    const s = get();
    const slot = s.inventory.find((i) => i.id === itemId && i.count > 0);
    if (!slot) return;
    const mods = computeSkillBonuses(s.unlockedSkills);

    const consumeOne = () =>
      s.inventory
        .map((i) => (i.id === itemId ? { ...i, count: i.count - 1 } : i))
        .filter((i) => i.count > 0);

    if (itemId === 'healing_poultice') {
      if (s.hp >= s.maxHp) return;
      const heal = 45 + mods.poulticeBonusHp;
      gameAudio.playQuestChime();
      set({
        hp: Math.min(s.maxHp, s.hp + heal),
        inventory: consumeOne(),
        notification: {
          title: 'Použit léčivý obklad',
          subtitle: `Obnoveno ${heal} zdraví`,
          expiresAt: Date.now() + 2500,
        },
      });
    } else if (itemId === 'herbal_decoction') {
      if (s.mana >= s.maxMana) return;
      gameAudio.playFlashOfLight();
      set({
        mana: Math.min(s.maxMana, s.mana + 45),
        inventory: consumeOne(),
        notification: {
          title: 'Vypit bylinný odvar',
          subtitle: 'Obnoveno 45 soustředění',
          expiresAt: Date.now() + 2500,
        },
      });
    } else if (itemId === 'travel_bread') {
      if (s.stamina >= s.maxStamina) return;
      gameAudio.playQuestChime();
      set({
        stamina: Math.min(s.maxStamina, s.stamina + 45),
        inventory: consumeOne(),
        notification: {
          title: 'Sněden cestovní chléb',
          subtitle: 'Obnoveno 45 výdrže',
          expiresAt: Date.now() + 2500,
        },
      });
    } else if (itemId === 'torch_item') {
      liveSim.torchLightTimer = 60;
      gameAudio.playFireSpell();
      set({
        staffLightOn: true,
        inventory: consumeOne(),
        notification: {
          title: 'Zapálena pochodeň',
          subtitle: 'Světlo hole svítí po dobu 60 s bez spotřeby soustředění',
          expiresAt: Date.now() + 2600,
        },
      });
    }
  },

  discoverLocation: (locId, name, xpReward) => {
    const s = get();
    if (s.discoveredLocations.includes(locId)) return;
    const xpRes = applyXpGain(s.level, s.xp, xpReward);
    const levelsGained = xpRes.level - s.level;
    const maxHp = s.maxHp + levelsGained * 10;
    const maxMana = s.maxMana + levelsGained * 10;
    const lm = LANDMARKS.find((l) => l.id === locId);
    const fogUpdate = lm ? revealFogRadius(s.fogGrid, lm.x, lm.z, lm.radius + 8) : { next: s.fogGrid, changed: false };
    gameAudio.playQuestChime();
    set({
      discoveredLocations: [...s.discoveredLocations, locId],
      fogGrid: fogUpdate.changed ? fogUpdate.next : s.fogGrid,
      level: xpRes.level,
      xp: xpRes.xp,
      maxHp,
      maxMana,
      hp: xpRes.leveledUp ? maxHp : s.hp,
      mana: xpRes.leveledUp ? maxMana : s.mana,
      notification: {
        title: `Objeveno: ${name}`,
        subtitle: `+${xpReward} XP`,
        expiresAt: Date.now() + 3600,
      },
    });
  },

  grantXp: (amount) => {
    set((s) => {
      const res = applyXpGain(s.level, s.xp, amount);
      const levelsGained = res.level - s.level;
      const maxHp = s.maxHp + levelsGained * 10;
      const maxMana = s.maxMana + levelsGained * 10;
      return {
        level: res.level,
        xp: res.xp,
        maxHp,
        maxMana,
        hp: res.leveledUp ? maxHp : s.hp,
        mana: res.leveledUp ? maxMana : s.mana,
      };
    });
  },

  onEnemyKilled: (_enemyId, archetype, group) => {
    const s = get();
    const tpl = ENEMY_TEMPLATES[archetype];
    let nextStep = s.mainStep;
    let nextPatrolKilled = s.patrolKilled;
    const nextFlags = { ...s.flags };
    let kpGain = 0;
    let notifTitle = '';
    let notifSub = '';

    if (group === 'patrol') {
      nextPatrolKilled += 1;
      if (s.mainStep === 'ch1_defeat_scouts' && nextPatrolKilled >= 2) {
        nextStep = 'ch1_escort_liska';
        notifTitle = 'Skřetí průzkumníci poraženi';
        notifSub = 'Vydej se do osady Líska (východně za stezkou) k Miře a Edranovi [F]';
      }
    }

    if (archetype === 'goblin_commander') {
      nextFlags.grakhDefeated = true;
      kpGain += 1;
      // Disable final summit beacon symbolically with Gandalf's light!
      const summitBeacon = liveSim.storyInteractables.find((o) => o.id === 'beacon_summit');
      if (summitBeacon && !summitBeacon.done) {
        summitBeacon.done = true;
        nextFlags.beaconsDisabled += 1;
      }
      nextStep = resolveGrakhKillStep(s.mainStep, nextFlags.beaconsDisabled);
      notifTitle = 'Grakh, pán průsmyku poražen!';
      notifSub =
        nextStep === 'ch6_return_liska'
          ? 'Poslední signál zůstal temný (+1 Bod poznání). Vrať se do osady Líska!'
          : nextStep === 'ch5_disable_beacons'
            ? 'Velitel padl (+1 Bod poznání). Vyřaď ještě zbývající signální ohně na pevnosti!'
            : 'Velitel průsmyku byl umlčen (+1 Bod poznání). Pokračuj v probíhající stopě!';
    }

    if (notifTitle) gameAudio.playQuestChime();
    set((st) => ({
      mainStep: nextStep,
      patrolKilled: nextPatrolKilled,
      flags: nextFlags,
      knowledgePoints: st.knowledgePoints + kpGain,
      runStats: { ...st.runStats, enemiesDefeated: st.runStats.enemiesDefeated + 1 },
      notification: notifTitle
        ? { title: notifTitle, subtitle: notifSub, expiresAt: Date.now() + 4800 }
        : st.notification,
    }));
    get().grantXp(tpl.xpReward);
    if (archetype === 'goblin_commander' || nextPatrolKilled >= 2) {
      get().saveCheckpoint(true);
    }
  },

  applyPlayerDamage: (amount) => {
    set((s) => {
      if (s.phase !== 'playing') return {};
      const nextHp = Math.max(0, s.hp - amount);
      const now = Date.now();
      const nextStats = { ...s.runStats, damageTaken: s.runStats.damageTaken + amount };
      if (nextHp <= 0) {
        if (document.pointerLockElement) {
          document.exitPointerLock?.();
        }
        syncBodyState('defeat');
        return { hp: 0, phase: 'defeat', shieldActive: false, lastDamageAt: now, runStats: nextStats };
      }
      return { hp: nextHp, lastDamageAt: now, runStats: nextStats };
    });
  },

  showCombatCallout: (text, tone, durationMs = 1100) => {
    set({ combatCallout: { text, tone, expiresAt: Date.now() + durationMs } });
  },

  notify: (title, subtitle, durationMs = 3600) => {
    set({ notification: { title, subtitle, expiresAt: Date.now() + durationMs } });
  },

  clearExpiredNotification: () => {
    const now = Date.now();
    const n = get().notification;
    const c = get().combatCallout;
    if ((n && n.expiresAt <= now) || (c && c.expiresAt <= now)) {
      set({
        notification: n && n.expiresAt <= now ? null : n,
        combatCallout: c && c.expiresAt <= now ? null : c,
      });
    }
  },

  saveCheckpoint: (silent = false) => {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const s = get();
    try {
      const payload = {
        mainStep: s.mainStep,
        flags: s.flags,
        sideQuests: s.sideQuests,
        knowledgePoints: s.knowledgePoints,
        unlockedSkills: s.unlockedSkills,
        patrolKilled: s.patrolKilled,
        discoveredLocations: s.discoveredLocations,
        inventory: s.inventory,
        storyItems: s.storyItems,
        stonePuzzleSeq: s.stonePuzzleSeq,
        hp: s.hp,
        maxHp: s.maxHp,
        mana: s.mana,
        maxMana: s.maxMana,
        stamina: s.stamina,
        maxStamina: s.maxStamina,
        level: s.level,
        xp: s.xp,
        staffLightOn: s.staffLightOn,
        playerX: liveSim.playerX,
        playerZ: liveSim.playerZ,
        doneInteractables: liveSim.storyInteractables.filter((o) => o.done).map((o) => o.id),
        deadEnemyIds: liveSim.enemies.filter((e) => e.dead).map((e) => e.id),
        collectedIds: liveSim.collectibles.filter((c) => c.collected).map((c) => c.id),
        litBrazierIds: liveSim.braziers.filter((b) => b.lit).map((b) => b.id),
        fogMask: encodeFogGrid(s.fogGrid),
        customWaypoint: s.customWaypoint,
        trackedQuest: s.trackedQuest,
        runStats: s.runStats,
      };
      window.localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(payload));
      if (!silent) {
        s.notify('Postup uložen', 'Automatický záchytný bod byl zaznamenán', 2200);
      }
    } catch {
      s.notify('Postup se nepodařilo uložit', 'Zkontroluj dostupné místo a oprávnění úložiště prohlížeče.', 6000);
    }
  },

  loadCheckpoint: () => {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    try {
      const raw = window.localStorage.getItem(SAVE_STORAGE_KEY);
      if (!raw) return false;
      const safe = sanitizeCheckpointData(JSON.parse(raw));
      if (!safe) return false;

      // Read stats BEFORE restartGame resets store fields, then restore all checkpoint state cleanly
      get().restartGame();

      liveSim.playerX = safe.playerX;
      liveSim.playerZ = safe.playerZ;
      liveSim.playerY = groundHeightAt(safe.playerX, safe.playerZ);
      liveSim.grakhPhaseAnnounced = safe.flags.grakhDefeated ? 3 : 1;

      const doneSet = new Set<string>(safe.doneInteractables);
      const runeSet = new Set<string>(safe.stonePuzzleSeq);
      liveSim.storyInteractables.forEach((o) => {
        if (doneSet.has(o.id)) o.done = true;
        if (o.kind === 'stone_rune') {
          if (safe.flags.puzzleSolved) {
            o.done = true;
          } else if (o.runeId && runeSet.has(o.runeId)) {
            o.done = true;
          }
        }
      });

      const deadSet = new Set<string>(safe.deadEnemyIds);
      liveSim.enemies.forEach((e) => {
        if (deadSet.has(e.id)) {
          e.dead = true;
          e.hp = 0;
          e.aiState = 'DEAD';
          e.deathTimer = 0;
          e.isWindingUp = false;
          e.attackPhase = 'none';
        }
      });

      const collectedSet = new Set<string>(safe.collectedIds);
      liveSim.collectibles.forEach((c) => {
        if (collectedSet.has(c.id)) c.collected = true;
      });

      if (safe.litBrazierIds !== null) {
        const litSet = new Set<string>(safe.litBrazierIds);
        liveSim.braziers.forEach((b) => {
          b.lit = litSet.has(b.id);
        });
      }

      const decodedFog = safe.fogMask ? decodeFogGrid(safe.fogMask) : null;
      const fogWithPlayer = revealFogRadius(decodedFog ?? createInitialFogGrid(), safe.playerX, safe.playerZ, 16).next;

      gameAudio.setVillageSongUnlocked(safe.flags.villageMorale);
      set({
        mainStep: safe.mainStep,
        flags: safe.flags,
        sideQuests: safe.sideQuests,
        knowledgePoints: safe.knowledgePoints,
        unlockedSkills: safe.unlockedSkills,
        patrolKilled: safe.patrolKilled,
        discoveredLocations: safe.discoveredLocations,
        fogGrid: fogWithPlayer,
        customWaypoint: safe.customWaypoint,
        trackedQuest: safe.trackedQuest,
        inventory: safe.inventory,
        storyItems: safe.storyItems,
        stonePuzzleSeq: safe.stonePuzzleSeq,
        hp: safe.hp,
        maxHp: safe.maxHp,
        mana: safe.mana,
        maxMana: safe.maxMana,
        stamina: safe.stamina,
        maxStamina: safe.maxStamina,
        level: safe.level,
        xp: safe.xp,
        staffLightOn: safe.staffLightOn,
        runStats: safe.runStats,
        notification: {
          title: 'Výprava načtena',
          subtitle: getMainQuestStepDef(safe.mainStep).title,
          expiresAt: Date.now() + 3600,
        },
      });
      // Trigger GameLoopController reset sync AFTER store state is committed so mana/stamina/elapsed refs match
      liveSim.resetCounter += 1;
      return true;
    } catch {
      return false;
    }
  },

  setHudTelemetry: (patch) => {
    const s = get();
    const sameCd =
      Math.abs(s.cooldowns.flash_of_light - patch.cooldowns.flash_of_light) < 0.05 &&
      Math.abs(s.cooldowns.fire_spell - patch.cooldowns.fire_spell) < 0.05 &&
      Math.abs(s.cooldowns.shockwave - patch.cooldowns.shockwave) < 0.05 &&
      Math.abs(s.cooldowns.staff_light - patch.cooldowns.staff_light) < 0.05;
    const samePrompt =
      s.interactPrompt?.targetId === patch.interactPrompt?.targetId &&
      s.interactPrompt?.label === patch.interactPrompt?.label;
    const sameBoss =
      s.bossHud?.hp === patch.bossHud?.hp &&
      s.bossHud?.name === patch.bossHud?.name &&
      s.bossHud?.phase === patch.bossHud?.phase;
    const sameWaypoint =
      s.waypointDistance === patch.waypointDistance &&
      (s.waypointBearingDeg === patch.waypointBearingDeg ||
        (s.waypointBearingDeg !== null &&
          patch.waypointBearingDeg !== null &&
          Math.abs(s.waypointBearingDeg - patch.waypointBearingDeg) < 0.5));
    if (
      Math.abs(s.compassHeadingDeg - patch.compassHeadingDeg) < 0.5 &&
      Math.abs(s.objectiveBearingDeg - patch.objectiveBearingDeg) < 0.5 &&
      s.objectiveDistance === patch.objectiveDistance &&
      sameWaypoint &&
      s.currentRegionName === patch.currentRegionName &&
      s.mana === patch.mana &&
      s.stamina === patch.stamina &&
      s.runStats.elapsedSeconds === patch.elapsedSeconds &&
      sameCd &&
      samePrompt &&
      sameBoss
    ) {
      return;
    }
    const { elapsedSeconds, ...rest } = patch;
    set({
      ...rest,
      runStats:
        s.runStats.elapsedSeconds === elapsedSeconds
          ? s.runStats
          : { ...s.runStats, elapsedSeconds },
    });
  },
}));
