import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMPSITE_POS,
  FORD_POS,
  RANGER_POS,
  SPAWN_POS,
  VILLAGE_POS,
  WATCHTOWER_POS,
  clampCameraFractionOutsideObstacles,
  computeSteeredDirection,
  groundHeightAt,
  hasLineOfSightXZ,
  isWaterAt,
  resolveObstaclePushOut,
  surfaceSlopeAt,
} from './terrain';
import {
  QUEST_STAGES,
  QuestProgressState,
  advanceQuestProgress,
  getRangerDialogue,
} from './questData';
import {
  MAIN_QUEST_STEPS,
  StoryFlags,
  buildNpcDialogue,
  getMainQuestStepDef,
  resolveChapter5EntryStep,
  resolveEpilogue,
  resolveGrakhKillStep,
  stepStonePuzzle,
} from './storyData';
import { clampMusicStepTime } from './audio';
import { sanitizeCheckpointData } from './store';
import {
  MELEE_COMBO_STEPS,
  applyXpGain,
  canCastPlayerSpell,
  canCastSpell,
  canRaisePlayerShield,
  canStartPlayerAttack,
  canStartPlayerDodge,
  computeIncomingDamage,
  computeSkillBonuses,
  decideEnemyAction,
  evaluateEnemyPerception,
  getGrakhBossPhase,
  isMeleeHitWindowActive,
  isTargetInMeleeArc,
  resolvePlayerCombatState,
  selectMusicContext,
  shouldTriggerMeleeHit,
  transitionEnemyAIState,
} from './combatLogic';
import {
  FOG_GRID_SIZE,
  buildWorldMapMarkers,
  computeExplorationPercent,
  createDefaultMapFilters,
  createDefaultMapPresets,
  createInitialFogGrid,
  decodeFogGrid,
  encodeFogGrid,
  filterWorldMapMarkers,
  isPointRevealed,
  layoutMapMarkers,
  mapNormToWorld,
  revealFogRadius,
  worldToMapNorm,
} from './worldMapData';
import {
  SPELL_CAST_TIMINGS,
  clampCameraWithTerrainAndObstacles,
  createBufferedAction,
  evaluateDampedTraumaOffset,
  isBufferedActionValid,
  pickSoftCombatTarget,
  resolveDirectionalDodge,
  resolveGandalfAnimState,
  shortestAngleDiff,
  stepAngleToward,
  stepPlanarVelocity,
  stepSpellCastPhase,
} from './gameplayFeelLogic';

test('terrain heightmap keeps spawn, ranger post, and watchtower plateau continuous and walkable', () => {
  const spawnH = groundHeightAt(SPAWN_POS.x, SPAWN_POS.z);
  const rangerH = groundHeightAt(RANGER_POS.x, RANGER_POS.z);
  const towerH = groundHeightAt(WATCHTOWER_POS.x, WATCHTOWER_POS.z);

  assert.ok(Number.isFinite(spawnH));
  assert.ok(Number.isFinite(rangerH));
  assert.ok(towerH > 6.5 && towerH < 8.5, `Expected elevated watchtower plateau, got ${towerH}`);
  assert.ok(surfaceSlopeAt(SPAWN_POS.x, SPAWN_POS.z) < 0.45, 'Spawn path should be gentle');
  assert.ok(surfaceSlopeAt(CAMPSITE_POS.x, CAMPSITE_POS.z) < 0.45, 'Campsite should be gentle');
});

test('river channel carves water while ford remains shallow', () => {
  const fordH = groundHeightAt(FORD_POS.x, FORD_POS.z);
  const deepRiverH = groundHeightAt(8, 4 + Math.sin(8 * 0.055) * 4.2 + Math.cos(8 * 0.025) * 1.5);
  assert.ok(fordH > deepRiverH, 'Ford should be shallower than main river channel');
  assert.equal(isWaterAt(8, 4 + Math.sin(8 * 0.055) * 4.2 + Math.cos(8 * 0.025) * 1.5), true);
});

test('Shadows of the Misty Mountains quest advances cleanly from stage 1 through completion', () => {
  let state: QuestProgressState = {
    stage: 'stage_1_path',
    patrolKilled: 0,
    patrolTotal: 3,
    commanderDefeated: false,
    clueFound: false,
    dispatchRecovered: false,
  };

  state = advanceQuestProgress(state, { type: 'enter_zone', zone: 'ranger_approach' });
  assert.equal(state.stage, 'stage_2_meet_ranger');

  state = advanceQuestProgress(state, { type: 'talk_ranger' });
  assert.equal(state.stage, 'stage_3_follow_forest');

  state = advanceQuestProgress(state, { type: 'enter_zone', zone: 'forest_path' });
  assert.equal(state.stage, 'stage_4_defeat_patrol');

  state = advanceQuestProgress(state, { type: 'patrol_enemy_killed' });
  state = advanceQuestProgress(state, { type: 'patrol_enemy_killed' });
  assert.equal(state.stage, 'stage_4_defeat_patrol');

  state = advanceQuestProgress(state, { type: 'patrol_enemy_killed' });
  assert.equal(state.stage, 'stage_5_find_campsite');

  state = advanceQuestProgress(state, { type: 'enter_zone', zone: 'campsite' });
  assert.equal(state.stage, 'stage_6_find_clue');

  state = advanceQuestProgress(state, { type: 'inspect_clue' });
  assert.equal(state.stage, 'stage_7_travel_watchtower');

  state = advanceQuestProgress(state, { type: 'enter_zone', zone: 'watchtower' });
  assert.equal(state.stage, 'stage_8_defeat_commander');

  state = advanceQuestProgress(state, { type: 'commander_killed' });
  assert.equal(state.stage, 'stage_9_recover_message');

  state = advanceQuestProgress(state, { type: 'recover_dispatch' });
  assert.equal(state.stage, 'stage_10_return_ranger');

  const finalDlg = getRangerDialogue(state.stage);
  assert.equal(finalDlg.id, 'ranger_complete');

  state = advanceQuestProgress(state, { type: 'talk_ranger' });
  assert.equal(state.stage, 'completed');
  assert.ok(QUEST_STAGES[state.stage].title.includes('Úkol splněn'));
});

test('Gandalf: Stíny Severu storyData covers 6 chapters, 3-stone puzzle, branching dialogues, and 3 epilogues', () => {
  assert.equal(MAIN_QUEST_STEPS.ch1_inspect_horse.chapter, 1);
  assert.equal(MAIN_QUEST_STEPS.ch6_return_liska.stepNumber, 21);
  assert.equal(MAIN_QUEST_STEPS.completed.targetPos, null);

  // Three-stone puzzle: hammer -> mountain -> torch
  const wrongFirst = stepStonePuzzle([], 'torch');
  assert.equal(wrongFirst.reset, true);
  assert.deepEqual(wrongFirst.nextSequence, []);

  const step1 = stepStonePuzzle([], 'hammer');
  assert.equal(step1.solved, false);
  assert.equal(step1.reset, false);
  const step2 = stepStonePuzzle(step1.nextSequence, 'mountain');
  assert.equal(step2.solved, false);
  const wrongThird = stepStonePuzzle(step2.nextSequence, 'hammer');
  assert.equal(wrongThird.reset, true);
  const step3 = stepStonePuzzle(step2.nextSequence, 'torch');
  assert.equal(step3.solved, true);
  assert.deepEqual(step3.nextSequence, ['hammer', 'mountain', 'torch']);

  const baseFlags: StoryFlags = {
    edranRescued: true,
    caravanEvidenceCount: 3,
    merchantInterviewed: true,
    puzzleSolved: true,
    rovanChoice: 'truth_and_mercy',
    rovanConfessed: true,
    approachChosen: 'direct',
    beaconsDisabled: 2,
    nelaRescued: true,
    villageHealed: true,
    dwarfShortcut: true,
    villageMorale: true,
    villageSupplied: true,
    grakhDefeated: true,
  };

  assert.equal(resolveEpilogue(baseFlags).id, 'light_over_valley');
  assert.equal(resolveEpilogue({ ...baseFlags, nelaRescued: false }).id, 'costly_victory');
  assert.equal(resolveEpilogue({ ...baseFlags, rovanConfessed: false }).id, 'truth_in_shadow');

  const sqState = {
    sq_healer_hope: { status: 'locked' as const, progress: 0 },
    sq_stone_kin: { status: 'completed' as const, progress: 3 },
    sq_forest_song: { status: 'locked' as const, progress: 0 },
    sq_lost_supplies: { status: 'locked' as const, progress: 0 },
  };
  const rovanDlg = buildNpcDialogue('rovan', 'ch4_confront_rovan', baseFlags, sqState);
  assert.equal(rovanDlg.choices?.length, 3);
  const edranAssaultDlg = buildNpcDialogue('edran', 'ch4_prepare_assault', baseFlags, sqState);
  assert.equal(edranAssaultDlg.choices?.length, 3);
  assert.ok(edranAssaultDlg.choices?.some((c) => c.effectId === 'approach_tunnel'));
});

test('skill bonuses and Grakh 3-phase boss thresholds calculate deterministically', () => {
  const baseMods = computeSkillBonuses([]);
  assert.equal(baseMods.staffLightRadiusMult, 1.0);
  assert.equal(baseMods.meleeDamageMult, 1.0);
  assert.equal(baseMods.dodgeStaminaCost, 18);

  const upgradedMods = computeSkillBonuses([
    'brighter_light',
    'flame_of_hope',
    'unbreakable_will',
    'glamdring_edge',
    'warding_shield',
    'swift_step',
    'silent_cloak',
    'keen_eye',
  ]);
  assert.equal(upgradedMods.staffLightRadiusMult, 1.45);
  assert.equal(upgradedMods.fireDamageMult, 1.25);
  assert.equal(upgradedMods.focusRegenMult, 1.25);
  assert.equal(upgradedMods.meleeDamageMult, 1.2);
  assert.equal(upgradedMods.shieldDrainMult, 0.65);
  assert.equal(upgradedMods.dodgeStaminaCost, 13);
  assert.equal(upgradedMods.stealthFactor, 0.7);
  assert.equal(upgradedMods.poulticeBonusHp, 15);

  assert.equal(getGrakhBossPhase(1.0), 1);
  assert.equal(getGrakhBossPhase(0.66), 1);
  assert.equal(getGrakhBossPhase(0.65), 2);
  assert.equal(getGrakhBossPhase(0.31), 2);
  assert.equal(getGrakhBossPhase(0.3), 3);
});

test('player combat FSM prevents invalid overlapping states and allows valid transitions', () => {
  assert.equal(
    resolvePlayerCombatState({ hp: 0, staggerTimer: 0.2, dodgeTimer: 0.1, attackTimer: 0.2, shieldActive: true }),
    'DEAD',
  );
  assert.equal(
    resolvePlayerCombatState({ hp: 100, staggerTimer: 0.2, dodgeTimer: 0.2, attackTimer: 0.1, shieldActive: false }),
    'STAGGERED',
  );
  assert.equal(
    resolvePlayerCombatState({ hp: 100, staggerTimer: 0, dodgeTimer: 0.25, attackTimer: 0, shieldActive: false }),
    'DODGING',
  );
  assert.equal(
    resolvePlayerCombatState({ hp: 100, staggerTimer: 0, dodgeTimer: 0, attackTimer: 0.2, shieldActive: false }),
    'ATTACKING',
  );

  assert.equal(canStartPlayerAttack('IDLE'), true);
  assert.equal(canStartPlayerAttack('DODGING'), false);
  assert.equal(canStartPlayerAttack('STAGGERED'), false);

  assert.equal(canRaisePlayerShield('ATTACKING', 50), false);
  assert.equal(canRaisePlayerShield('IDLE', 3), false);
  assert.equal(canRaisePlayerShield('IDLE', 40), true);

  // Dodge can cancel late attack recovery (attackTimer <= 0.16), not mid-windup
  assert.equal(canStartPlayerDodge('ATTACKING', 50, 0.28), false);
  assert.equal(canStartPlayerDodge('ATTACKING', 50, 0.12), true);
  assert.equal(canCastPlayerSpell('DODGING', 80, 0, 'fire_spell'), false);
  assert.equal(canCastPlayerSpell('ATTACKING', 80, 0, 'fire_spell', 0.25), false);
  assert.equal(canCastPlayerSpell('ATTACKING', 80, 0, 'fire_spell', 0.12), true);
  assert.equal(canCastPlayerSpell('IDLE', 80, 0, 'fire_spell'), true);
});

test('melee combo active hit window, facing arc, and obstacle LoS validation work accurately', () => {
  const step0 = MELEE_COMBO_STEPS[0];
  assert.equal(isMeleeHitWindowActive(step0.duration - 0.02, step0.duration, 0), false);
  assert.equal(isMeleeHitWindowActive(step0.duration - 0.14, step0.duration, 0), true);
  assert.equal(isMeleeHitWindowActive(0.03, step0.duration, 0), false);

  // Enemy directly in front (+Z when yaw = 0) with LoS -> hit
  assert.equal(
    isTargetInMeleeArc({
      attackerX: 0,
      attackerZ: 0,
      attackerYaw: 0,
      targetX: 0,
      targetZ: 2.5,
      range: step0.range,
      minDot: step0.minDot,
      hasLos: true,
    }),
    true,
  );
  // Enemy behind attacker at 2.5m -> miss
  assert.equal(
    isTargetInMeleeArc({
      attackerX: 0,
      attackerZ: 0,
      attackerYaw: 0,
      targetX: 0,
      targetZ: -2.5,
      range: step0.range,
      minDot: step0.minDot,
      hasLos: true,
    }),
    false,
  );
  // Enemy blocked by wall (hasLos = false) -> miss
  assert.equal(
    isTargetInMeleeArc({
      attackerX: 0,
      attackerZ: 0,
      attackerYaw: 0,
      targetX: 0,
      targetZ: 2.0,
      range: step0.range,
      minDot: step0.minDot,
      hasLos: false,
    }),
    false,
  );
});

test('enemy AI perception, investigation memory, and state machine transitions', () => {
  // Out of FOV and no LoS -> not perceived
  const blockedPercep = evaluateEnemyPerception({
    archetype: 'orc_warrior',
    enemyX: 0,
    enemyZ: 0,
    enemyYaw: 0,
    playerX: 0,
    playerZ: 10,
    hasLos: false,
    playerMakingNoise: false,
    allyAlerted: false,
  });
  assert.equal(blockedPercep.canSeePlayer, false);
  assert.equal(blockedPercep.perceived, false);

  // Close proximity or noisy combat alerts enemy even without direct sight
  const noisyPercep = evaluateEnemyPerception({
    archetype: 'orc_warrior',
    enemyX: 0,
    enemyZ: 0,
    enemyYaw: 0,
    playerX: 0,
    playerZ: -9,
    hasLos: false,
    playerMakingNoise: true,
    allyAlerted: false,
  });
  assert.equal(noisyPercep.canHearPlayer, true);
  assert.equal(noisyPercep.perceived, true);

  // State machine transitions: PATROL -> SUSPICIOUS -> CHASE -> INVESTIGATE when sight breaks
  assert.equal(
    transitionEnemyAIState({
      archetype: 'orc_warrior',
      currentState: 'PATROL',
      dead: false,
      distToPlayer: 14,
      distFromHome: 2,
      hpRatio: 1,
      hasLos: true,
      perceived: true,
      alertLevel: 0.4,
      investigateTimer: 0,
      stunTimer: 0,
      cooldownTimer: 0,
      windupTimer: 0,
      isWindingUp: false,
      hasToken: true,
    }),
    'SUSPICIOUS',
  );

  assert.equal(
    transitionEnemyAIState({
      archetype: 'orc_warrior',
      currentState: 'CHASE',
      dead: false,
      distToPlayer: 10,
      distFromHome: 4,
      hpRatio: 1,
      hasLos: false,
      perceived: false,
      alertLevel: 0.8,
      investigateTimer: 4,
      stunTimer: 0,
      cooldownTimer: 0,
      windupTimer: 0,
      isWindingUp: false,
      hasToken: false,
    }),
    'INVESTIGATE',
  );

  // Legacy decideEnemyAction compatibility
  assert.equal(
    decideEnemyAction({
      archetype: 'orc_archer',
      distToPlayer: 4,
      hpRatio: 1,
      stunTimer: 0,
      cooldownTimer: 0,
      windupTimer: 0,
      isWindingUp: false,
      hasToken: true,
    }),
    'retreat',
  );
  assert.equal(
    decideEnemyAction({
      archetype: 'orc_warrior',
      distToPlayer: 2,
      hpRatio: 1,
      stunTimer: 1.5,
      cooldownTimer: 0,
      windupTimer: 0,
      isWindingUp: false,
      hasToken: true,
    }),
    'stunned',
  );
});

test('spell casting, timed parry, shield mitigation, and XP leveling work accurately', () => {
  assert.equal(canCastSpell(30, 0, 'flash_of_light'), true);
  assert.equal(canCastSpell(10, 0, 'flash_of_light'), false);
  assert.equal(canCastSpell(50, 1.2, 'fire_spell'), false);

  const parried = computeIncomingDamage(24, true, false, 0.15);
  assert.equal(parried.parried, true);
  assert.equal(parried.blocked, true);
  assert.equal(parried.finalDamage, 0);

  const blocked = computeIncomingDamage(20, true, false, 0.8);
  assert.equal(blocked.parried, false);
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.finalDamage, 3);

  const dodged = computeIncomingDamage(30, false, true, 0);
  assert.equal(dodged.dodged, true);
  assert.equal(dodged.finalDamage, 0);

  const lvl = applyXpGain(1, 80, 50);
  assert.equal(lvl.level, 2);
  assert.equal(lvl.xp, 30);
  assert.equal(lvl.leveledUp, true);
});

test('obstacle push-out, steering around obstacles, line of sight, and camera clipping prevent wall clipping', () => {
  const cx = VILLAGE_POS.x - 5.5;
  const cz = VILLAGE_POS.z + 3.5;
  const pushed = resolveObstaclePushOut(cx + 0.5, cz, 0.55);
  assert.ok(Math.hypot(pushed.x - cx, pushed.z - cz) >= 3.25);

  // Enemy standing south of cottage steering north should deflect around obstacle footprint
  const steer = computeSteeredDirection(cx, cz + 3.4, cx, cz - 4.0, 0.55, 1.8);
  assert.ok(Math.abs(steer.x) > 0.25, `Expected lateral steering around cottage, got (${steer.x}, ${steer.z})`);

  assert.equal(hasLineOfSightXZ(cx - 5, cz, cx + 5, cz), false);
  assert.equal(hasLineOfSightXZ(0, 50, 4, 36), true);

  const towerPillarX = WATCHTOWER_POS.x - 4.6;
  const towerPillarZ = WATCHTOWER_POS.z - 4.2;
  const frac = clampCameraFractionOutsideObstacles(
    towerPillarX + 3.0,
    9.0,
    towerPillarZ,
    towerPillarX - 4.0,
    10.0,
    towerPillarZ,
  );
  assert.ok(frac < 1.0 && frac >= 0.28, `Expected camera pull-in fraction < 1, got ${frac}`);
});

test('melee swing hit window triggers once during active arc', () => {
  assert.equal(shouldTriggerMeleeHit(0.32, 0.34, false), false);
  assert.equal(shouldTriggerMeleeHit(0.22, 0.34, false), true);
  assert.equal(shouldTriggerMeleeHit(0.22, 0.34, true), false);
  assert.equal(shouldTriggerMeleeHit(0.05, 0.34, false), false);
});

test('adaptive music context switches cleanly across victory, combat, encounter, village, cave, forest, and exploration', () => {
  assert.equal(
    selectMusicContext({
      phase: 'victory',
      activeCombatCount: 2,
      suspiciousCount: 0,
      hasBossNearby: true,
      inForestZone: true,
      combatTailTimer: 2,
    }),
    'victory',
  );
  assert.equal(
    selectMusicContext({
      phase: 'playing',
      activeCombatCount: 1,
      suspiciousCount: 1,
      hasBossNearby: false,
      inForestZone: true,
      combatTailTimer: 0,
    }),
    'combat',
  );
  assert.equal(
    selectMusicContext({
      phase: 'playing',
      activeCombatCount: 0,
      suspiciousCount: 1,
      hasBossNearby: false,
      inForestZone: true,
      combatTailTimer: 0,
    }),
    'encounter',
  );
  assert.equal(
    selectMusicContext({
      phase: 'playing',
      activeCombatCount: 0,
      suspiciousCount: 0,
      hasBossNearby: false,
      inForestZone: false,
      inCaveZone: true,
      combatTailTimer: 0,
    }),
    'cave',
  );
  assert.equal(
    selectMusicContext({
      phase: 'playing',
      activeCombatCount: 0,
      suspiciousCount: 0,
      hasBossNearby: false,
      inForestZone: false,
      inVillageZone: true,
      combatTailTimer: 0,
    }),
    'village',
  );
  assert.equal(
    selectMusicContext({
      phase: 'playing',
      activeCombatCount: 0,
      suspiciousCount: 0,
      hasBossNearby: false,
      inForestZone: true,
      combatTailTimer: 0,
    }),
    'forest',
  );
  assert.equal(
    selectMusicContext({
      phase: 'playing',
      activeCombatCount: 0,
      suspiciousCount: 0,
      hasBossNearby: false,
      inForestZone: false,
      combatTailTimer: 0,
    }),
    'exploration',
  );
});

test('world map 1:1 coordinate transforms preserve North (-Z) up and round-trip accurately', () => {
  const spawnNorm = worldToMapNorm(SPAWN_POS.x, SPAWN_POS.z);
  const towerNorm = worldToMapNorm(WATCHTOWER_POS.x, WATCHTOWER_POS.z);
  const villageNorm = worldToMapNorm(VILLAGE_POS.x, VILLAGE_POS.z);

  assert.ok(towerNorm.v < 0.3, 'Northern watchtower should map near top (low v)');
  assert.ok(spawnNorm.v > 0.7, 'Southern spawn should map near bottom (high v)');
  assert.ok(villageNorm.u > 0.5, 'Eastern village should map to right half (u > 0.5)');

  const back = mapNormToWorld(villageNorm.u, villageNorm.v);
  assert.ok(Math.abs(back.x - VILLAGE_POS.x) < 1e-6);
  assert.ok(Math.abs(back.z - VILLAGE_POS.z) < 1e-6);
});

test('fog-of-war grid reveals radius, computes exploration percentage, and round-trips encoding', () => {
  let fog = createInitialFogGrid();
  assert.equal(fog.length, FOG_GRID_SIZE * FOG_GRID_SIZE);
  assert.equal(isPointRevealed(fog, SPAWN_POS.x, SPAWN_POS.z), true);
  assert.equal(isPointRevealed(fog, WATCHTOWER_POS.x, WATCHTOWER_POS.z), false);

  const pctBefore = computeExplorationPercent(fog);
  assert.ok(pctBefore > 0 && pctBefore < 25, `Initial exploration should be small, got ${pctBefore}`);

  const updated = revealFogRadius(fog, VILLAGE_POS.x, VILLAGE_POS.z, 16);
  assert.equal(updated.changed, true);
  fog = updated.next;
  assert.equal(isPointRevealed(fog, VILLAGE_POS.x, VILLAGE_POS.z), true);
  assert.ok(computeExplorationPercent(fog) > pctBefore);

  // Repeating same reveal makes no redundant change
  const repeat = revealFogRadius(fog, VILLAGE_POS.x, VILLAGE_POS.z, 16);
  assert.equal(repeat.changed, false);

  const encoded = encodeFogGrid(fog);
  const decoded = decodeFogGrid(encoded);
  assert.deepEqual(decoded, fog);
});

test('world map markers enforce anti-spoiler rules, live camp status, LOD zoom, and label de-overlap', () => {
  const baseFlags: StoryFlags = {
    edranRescued: true,
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
  let fog = createInitialFogGrid();
  fog = revealFogRadius(fog, VILLAGE_POS.x, VILLAGE_POS.z, 18).next;

  const markersCh1 = buildWorldMapMarkers({
    mainStep: 'ch1_find_edran',
    flags: baseFlags,
    sideQuests: {
      sq_healer_hope: { status: 'locked', progress: 0 },
      sq_stone_kin: { status: 'locked', progress: 0 },
      sq_forest_song: { status: 'locked', progress: 0 },
      sq_lost_supplies: { status: 'locked', progress: 0 },
    },
    discoveredLocations: ['woodland_path', 'oakhaven_ruins'],
    fogGrid: fog,
    customWaypoint: { x: 10, z: 20 },
    trackedQuest: { kind: 'main' },
    enemiesAliveByGroup: { patrol: 0, village: 2, cave: 2, quarry: 2, watchtower: 3 },
    incompleteStoryTargets: [],
  });

  // Watchtower boss camp must remain hidden in Chapter 1 before discovery
  assert.equal(markersCh1.some((m) => m.id === 'camp_watchtower'), false);
  // Locked side quests must remain hidden
  assert.equal(markersCh1.some((m) => m.category === 'side_quest'), false);
  // Cleared patrol camp reflects cleared status
  const patrolCamp = markersCh1.find((m) => m.id === 'camp_patrol');
  assert.equal(patrolCamp?.status, 'cleared');
  // Custom waypoint present
  assert.equal(markersCh1.some((m) => m.category === 'waypoint'), true);

  const filters = createDefaultMapFilters();
  const presets = createDefaultMapPresets();

  // At low zoom (1.0), detail NPCs are hidden while primary markers remain visible
  const lowZoom = filterWorldMapMarkers(markersCh1, filters, presets, 1.0, '');
  assert.equal(lowZoom.some((m) => m.category === 'npc'), false);
  assert.equal(lowZoom.some((m) => m.category === 'main_quest'), true);
  assert.equal(lowZoom.some((m) => m.category === 'settlement'), true);

  // At high zoom (2.4), NPCs become visible
  const highZoom = filterWorldMapMarkers(markersCh1, filters, presets, 2.4, '');
  assert.equal(highZoom.some((m) => m.category === 'npc'), true);

  // Search filters cleanly over known locations
  const searchLiska = filterWorldMapMarkers(markersCh1, filters, presets, 1.0, 'líska');
  assert.ok(searchLiska.some((m) => m.id === 'loc_oakhaven_ruins'));

  // Layout produces non-null positions and hides lower-priority overlapping labels at Líska
  const laidOut = layoutMapMarkers(highZoom, 900, null);
  assert.ok(laidOut.some((m) => m.showLabel));
});

test('gameplayFeelLogic movement acceleration, turnaround boost, and frame-rate-independent angular smoothing work accurately', () => {
  // Frame-rate independence: two 1/120s steps vs one 1/60s step produce identical exponential blend
  const singleStep = stepPlanarVelocity(0, 0, 0, -6.4, true, false, false, 1 / 60, { vx: 0, vz: 0 });
  const halfStep1 = stepPlanarVelocity(0, 0, 0, -6.4, true, false, false, 1 / 120, { vx: 0, vz: 0 });
  const halfStep2 = stepPlanarVelocity(halfStep1.vx, halfStep1.vz, 0, -6.4, true, false, false, 1 / 120, { vx: 0, vz: 0 });
  assert.ok(Math.abs(singleStep.vz - halfStep2.vz) < 1e-6);

  // Turnaround reversal accelerates faster than forward acceleration from rest
  const fromRest = stepPlanarVelocity(0, 0, 0, 6.4, true, false, false, 0.016, { vx: 0, vz: 0 });
  const turnaround = stepPlanarVelocity(0, -6.4, 0, 6.4, true, false, false, 0.016, { vx: 0, vz: 0 });
  assert.ok(turnaround.vz - -6.4 > fromRest.vz * 1.3);

  // Micro-velocity settles cleanly to 0 when stopped
  const settled = stepPlanarVelocity(0.01, 0.01, 0, 0, false, false, false, 0.05, { vx: 0, vz: 0 });
  assert.equal(settled.vx, 0);
  assert.equal(settled.vz, 0);

  // Shortest angle wrap-around across +/- PI boundary
  const diff = shortestAngleDiff(Math.PI - 0.1, -Math.PI + 0.1);
  assert.ok(Math.abs(diff - 0.2) < 1e-6);
  const rateTurn = stepAngleToward(Math.PI - 0.1, -Math.PI + 0.1, 8.0, 0.016, 'rate');
  assert.ok(rateTurn < -Math.PI + 0.1 + 0.2 || rateTurn > Math.PI - 0.1);
});

test('gameplayFeelLogic resolves all 11 animation states with deterministic priority', () => {
  assert.equal(
    resolveGandalfAnimState({
      isDead: true,
      staggerTimer: 0.3,
      dodgeTimer: 0.2,
      castTimer: 0.2,
      attackTimer: 0.2,
      shieldActive: true,
      horizSpeed: 9,
      isSprinting: true,
      isCombatAlert: true,
    }),
    'DEAD',
  );
  assert.equal(
    resolveGandalfAnimState({
      isDead: false,
      staggerTimer: 0.2,
      dodgeTimer: 0.2,
      castTimer: 0.2,
      attackTimer: 0.2,
      shieldActive: false,
      horizSpeed: 5,
      isSprinting: false,
      isCombatAlert: true,
    }),
    'HIT_REACTION',
  );
  assert.equal(
    resolveGandalfAnimState({
      isDead: false,
      staggerTimer: 0,
      dodgeTimer: 0.25,
      castTimer: 0.2,
      attackTimer: 0.2,
      shieldActive: false,
      horizSpeed: 10,
      isSprinting: true,
      isCombatAlert: true,
    }),
    'DODGE',
  );
  assert.equal(
    resolveGandalfAnimState({
      isDead: false,
      staggerTimer: 0,
      dodgeTimer: 0,
      castTimer: 0.3,
      attackTimer: 0.2,
      shieldActive: false,
      horizSpeed: 2,
      isSprinting: false,
      isCombatAlert: true,
    }),
    'CAST',
  );
  assert.equal(
    resolveGandalfAnimState({
      isDead: false,
      staggerTimer: 0,
      dodgeTimer: 0,
      castTimer: 0,
      attackTimer: 0.2,
      shieldActive: false,
      horizSpeed: 2,
      isSprinting: false,
      isCombatAlert: false,
    }),
    'ATTACK',
  );
  assert.equal(
    resolveGandalfAnimState({
      isDead: false,
      staggerTimer: 0,
      dodgeTimer: 0,
      castTimer: 0,
      attackTimer: 0,
      shieldActive: true,
      horizSpeed: 3.2,
      isSprinting: false,
      isCombatAlert: true,
    }),
    'STRAFE',
  );
  assert.equal(
    resolveGandalfAnimState({
      isDead: false,
      staggerTimer: 0,
      dodgeTimer: 0,
      castTimer: 0,
      attackTimer: 0,
      shieldActive: true,
      horizSpeed: 0,
      isSprinting: false,
      isCombatAlert: true,
    }),
    'BLOCK',
  );
  assert.equal(
    resolveGandalfAnimState({
      isDead: false,
      staggerTimer: 0,
      dodgeTimer: 0,
      castTimer: 0,
      attackTimer: 0,
      shieldActive: false,
      horizSpeed: 9.2,
      isSprinting: true,
      isCombatAlert: false,
    }),
    'RUN',
  );
  assert.equal(
    resolveGandalfAnimState({
      isDead: false,
      staggerTimer: 0,
      dodgeTimer: 0,
      castTimer: 0,
      attackTimer: 0,
      shieldActive: false,
      horizSpeed: 5.5,
      isSprinting: false,
      isCombatAlert: false,
    }),
    'WALK',
  );
  assert.equal(
    resolveGandalfAnimState({
      isDead: false,
      staggerTimer: 0,
      dodgeTimer: 0,
      castTimer: 0,
      attackTimer: 0,
      shieldActive: false,
      horizSpeed: 0,
      isSprinting: false,
      isCombatAlert: true,
    }),
    'COMBAT_IDLE',
  );
  assert.equal(
    resolveGandalfAnimState({
      isDead: false,
      staggerTimer: 0,
      dodgeTimer: 0,
      castTimer: 0,
      attackTimer: 0,
      shieldActive: false,
      horizSpeed: 0,
      isSprinting: false,
      isCombatAlert: false,
    }),
    'IDLE',
  );
});

test('gameplayFeelLogic handles directional dodge, input buffer TTL, 4-phase spell cast, soft target assist, and camera terrain sweep', () => {
  // Input buffer respects TTL
  const buf = createBufferedAction('dodge', 10.0);
  assert.equal(isBufferedActionValid(buf, 10.24), true);
  assert.equal(isBufferedActionValid(buf, 10.30), false);

  // Directional dodge respects camera-relative WASD over stale playerYaw
  const rightDodge = resolveDirectionalDodge(0, 1, 0, Math.PI);
  assert.ok(rightDodge.dirX > 0.9 && Math.abs(rightDodge.dirZ) < 1e-6);

  const neutralDodge = resolveDirectionalDodge(0, 0, 0, Math.PI * 0.5);
  assert.ok(neutralDodge.dirX > 0.9);

  // 4-phase spell timing triggers release exactly once when windup completes
  const swTiming = SPELL_CAST_TIMINGS.shockwave;
  const prepStep = stepSpellCastPhase(swTiming.total, swTiming.total, 'shockwave', false, 0.1);
  assert.equal(prepStep.phase, 'preparation');
  assert.equal(prepStep.triggeredRelease, false);

  const relStep = stepSpellCastPhase(prepStep.nextTimer, swTiming.total, 'shockwave', prepStep.released, 0.15);
  assert.equal(relStep.phase, 'release');
  assert.equal(relStep.triggeredRelease, true);
  assert.equal(relStep.released, true);

  const recStep = stepSpellCastPhase(relStep.nextTimer, swTiming.total, 'shockwave', relStep.released, 0.1);
  assert.equal(recStep.phase, 'recovery');
  assert.equal(recStep.triggeredRelease, false);

  // Soft target picks aligned nearby live enemy and ignores dead/out-of-range
  const target = pickSoftCombatTarget(
    0,
    50,
    Math.PI,
    [
      { id: 'dead_one', x: 0, z: 48, dead: true },
      { id: 'far_one', x: 0, z: 30, dead: false },
      { id: 'front_right', x: 1.2, z: 47.2, dead: false },
    ],
    4.6,
    -0.15,
  );
  assert.equal(target?.id, 'front_right');

  // Camera clearance & deterministic trauma
  const clearOut = clampCameraWithTerrainAndObstacles(0, 3.0, 50, 0, 4.5, 57.2);
  assert.ok(clearOut.fraction > 0.25 && clearOut.minCamY > -5);

  const shakeA = evaluateDampedTraumaOffset(0.5, 1.2);
  const shakeB = evaluateDampedTraumaOffset(0.5, 1.2);
  assert.deepEqual(shakeA, shakeB);
});

test('story progression guards prevent out-of-order Grakh kill from skipping Chapters 1-4', () => {
  // Killing Grakh early during Chapters 1-4 preserves active chapter step
  assert.equal(resolveGrakhKillStep('ch1_inspect_horse', 1), 'ch1_inspect_horse');
  assert.equal(resolveGrakhKillStep('ch2_inspect_caravan', 1), 'ch2_inspect_caravan');
  assert.equal(resolveGrakhKillStep('ch3_solve_stones', 1), 'ch3_solve_stones');
  assert.equal(resolveGrakhKillStep('ch4_prepare_assault', 1), 'ch4_prepare_assault');

  // Killing Grakh during Chapter 5 only moves to Chapter 6 if >= 2 beacons are disabled
  assert.equal(resolveGrakhKillStep('ch5_infiltrate_fortress', 1), 'ch5_disable_beacons');
  assert.equal(resolveGrakhKillStep('ch5_defeat_grakh', 2), 'ch6_return_liska');

  // Entering Chapter 5 reconciles prior early Grakh kill / beacon destruction
  assert.equal(resolveChapter5EntryStep(0, false), 'ch5_infiltrate_fortress');
  assert.equal(resolveChapter5EntryStep(2, false), 'ch5_defeat_grakh');
  assert.equal(resolveChapter5EntryStep(1, true), 'ch5_disable_beacons');
  assert.equal(resolveChapter5EntryStep(2, true), 'ch6_return_liska');

  // Safe step lookup falls back on unknown/corrupt step IDs
  assert.equal(getMainQuestStepDef('unknown_corrupt_step').id, 'ch1_inspect_horse');
  assert.equal(getMainQuestStepDef('ch3_solve_stones').stepNumber, 13);
});

test('sanitizeCheckpointData clamps invalid fields and reconciles legacy dead enemies', () => {
  assert.equal(sanitizeCheckpointData(null), null);

  const sanitized = sanitizeCheckpointData({
    mainStep: 'nonexistent_step',
    hp: 9999,
    maxHp: 140,
    mana: -20,
    maxMana: 110,
    stamina: 250,
    maxStamina: 100,
    level: 0,
    patrolKilled: 2,
    unlockedSkills: ['swift_step', 'fake_skill', 'swift_step'],
    stonePuzzleSeq: ['hammer', 'invalid_rune'],
    inventory: [
      { id: 'healing_poultice', count: 99 }, // maxStack 3
      { id: 'nonexistent_item', count: 5 },
    ],
    flags: {
      grakhDefeated: true,
      beaconsDisabled: 99,
    },
    deadEnemyIds: ['camp_1'],
    playerX: 500, // out of bounds -> clamped
    playerZ: 0,
    runStats: { elapsedSeconds: 125.9, enemiesDefeated: -3 },
  });

  assert.ok(sanitized);
  assert.equal(sanitized.mainStep, 'ch1_inspect_horse');
  assert.equal(sanitized.hp, 140);
  assert.equal(sanitized.mana, 0);
  assert.equal(sanitized.stamina, 100);
  assert.equal(sanitized.level, 1);
  assert.deepEqual(sanitized.unlockedSkills, ['swift_step']);
  assert.deepEqual(sanitized.stonePuzzleSeq, ['hammer']);
  assert.deepEqual(sanitized.inventory, [{ id: 'healing_poultice', count: 3 }]);
  assert.equal(sanitized.flags.beaconsDisabled, 3);
  assert.ok(sanitized.deadEnemyIds.includes('camp_1'));
  assert.ok(sanitized.deadEnemyIds.includes('patrol_1'));
  assert.ok(sanitized.deadEnemyIds.includes('patrol_2'));
  assert.ok(sanitized.deadEnemyIds.includes('tower_boss'));
  assert.ok(sanitized.deadEnemyIds.includes('grakh_add_1'));
  assert.ok(Math.hypot(sanitized.playerX, sanitized.playerZ) <= 89);
  assert.equal(sanitized.runStats.elapsedSeconds, 125);
  assert.equal(sanitized.runStats.enemiesDefeated, 0);
});

test('clampMusicStepTime prevents Web Audio catch-up oscillator bursts after idle gaps', () => {
  // Stale timestamp from 10 seconds ago while muted/paused jumps forward cleanly
  assert.equal(clampMusicStepTime(2.0, 12.0), 12.04);
  assert.equal(clampMusicStepTime(Number.NaN, 5.0), 5.04);

  // Normal small lookahead step remains intact for seamless rhythm
  assert.equal(clampMusicStepTime(12.15, 12.0), 12.15);
  assert.equal(clampMusicStepTime(11.9, 12.0), 11.9);
});




