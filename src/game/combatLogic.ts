export type SpellId = 'flash_of_light' | 'fire_spell' | 'shockwave' | 'staff_light';

export interface SpellConfig {
  id: SpellId;
  name: string;
  keyHint: string;
  description: string;
  manaCost: number;
  cooldown: number;
  radius: number;
  damage: number;
  stunDuration: number;
}

export const SPELL_CONFIGS: Record<SpellId, SpellConfig> = {
  staff_light: {
    id: 'staff_light',
    name: 'Světlo hole',
    keyHint: 'L',
    description: 'Zažehne stálou stříbřitě bílou záři na vrcholu čarodějné hole k osvětlení temných jeskyní.',
    manaCost: 0,
    cooldown: 0.4,
    radius: 14,
    damage: 0,
    stunDuration: 0,
  },
  flash_of_light: {
    id: 'flash_of_light',
    name: 'Záblesk světla',
    keyHint: 'Q',
    description: 'Oslepující výboj hvězdného jasu, který omráčí okolní nepřátele.',
    manaCost: 22,
    cooldown: 7,
    radius: 9.5,
    damage: 18,
    stunDuration: 3.4,
  },
  fire_spell: {
    id: 'fire_spell',
    name: 'Plamen Anoru',
    keyHint: 'E',
    description: 'Ovládnutý příval zlatého ohně, jenž spálí nepřátele a zapálí ohniště.',
    manaCost: 26,
    cooldown: 5,
    radius: 11,
    damage: 44,
    stunDuration: 0.4,
  },
  shockwave: {
    id: 'shockwave',
    name: 'Neprojdeš!',
    keyHint: 'R',
    description: 'Mocný úder holí, jehož rázová vlna odhodí nepřátele zpět.',
    manaCost: 38,
    cooldown: 11,
    radius: 11.5,
    damage: 62,
    stunDuration: 1.4,
  },
};

// ---------------------------------------------------------------------------
// Player Combat FSM & 3-Step Melee Combo
// ---------------------------------------------------------------------------

export type PlayerCombatState =
  | 'IDLE'
  | 'ATTACKING'
  | 'BLOCKING'
  | 'DODGING'
  | 'STAGGERED'
  | 'DEAD';

export interface MeleeComboStep {
  step: 0 | 1 | 2;
  kind: 'glamdring_slash' | 'staff_sweep' | 'finisher_cleave';
  duration: number;
  hitStart: number;
  hitEnd: number;
  damage: number;
  range: number;
  minDot: number;
  knockback: number;
  stunSec: number;
  lungeSpeed: number;
}

export const MELEE_COMBO_STEPS: readonly MeleeComboStep[] = [
  {
    step: 0,
    kind: 'glamdring_slash',
    duration: 0.34,
    hitStart: 0.08,
    hitEnd: 0.22,
    damage: 22,
    range: 3.15,
    minDot: 0.14,
    knockback: 5.5,
    stunSec: 0.16,
    lungeSpeed: 2.2,
  },
  {
    step: 1,
    kind: 'staff_sweep',
    duration: 0.36,
    hitStart: 0.09,
    hitEnd: 0.25,
    damage: 25,
    range: 3.35,
    minDot: -0.05,
    knockback: 7.2,
    stunSec: 0.24,
    lungeSpeed: 2.6,
  },
  {
    step: 2,
    kind: 'finisher_cleave',
    duration: 0.44,
    hitStart: 0.12,
    hitEnd: 0.29,
    damage: 36,
    range: 3.45,
    minDot: 0.18,
    knockback: 9.6,
    stunSec: 0.38,
    lungeSpeed: 3.4,
  },
];

export function resolvePlayerCombatState(input: {
  hp: number;
  staggerTimer: number;
  dodgeTimer: number;
  attackTimer: number;
  shieldActive: boolean;
}): PlayerCombatState {
  if (input.hp <= 0) return 'DEAD';
  if (input.staggerTimer > 0) return 'STAGGERED';
  if (input.dodgeTimer > 0) return 'DODGING';
  if (input.attackTimer > 0) return 'ATTACKING';
  if (input.shieldActive) return 'BLOCKING';
  return 'IDLE';
}

export function canStartPlayerAttack(state: PlayerCombatState): boolean {
  return state === 'IDLE' || state === 'BLOCKING';
}

export function canStartPlayerDodge(state: PlayerCombatState, stamina: number, attackTimer = 0): boolean {
  if (state === 'DEAD' || state === 'DODGING') return false;
  if (stamina < 18) return false;
  // Allow dodge-canceling out of late attack recovery or minor stagger
  if (state === 'ATTACKING' && attackTimer > 0.16) return false;
  return true;
}

export function canRaisePlayerShield(state: PlayerCombatState, mana: number): boolean {
  if (state === 'DEAD' || state === 'DODGING' || state === 'STAGGERED') return false;
  if (state === 'ATTACKING') return false;
  return mana >= 5;
}

export function canCastPlayerSpell(
  state: PlayerCombatState,
  mana: number,
  cooldownRemaining: number,
  spellId: SpellId,
  attackTimer = 0,
): boolean {
  if (state === 'DEAD' || state === 'DODGING' || state === 'STAGGERED') return false;
  if (state === 'ATTACKING' && spellId !== 'staff_light' && attackTimer > 0.16) return false;
  return canCastSpell(mana, cooldownRemaining, spellId);
}

export function isMeleeHitWindowActive(
  attackTimer: number,
  attackDuration: number,
  comboStep: number,
): boolean {
  if (attackTimer <= 0 || attackDuration <= 0) return false;
  const spec = MELEE_COMBO_STEPS[((comboStep % 3) + 3) % 3];
  const elapsed = attackDuration - attackTimer;
  return elapsed >= spec.hitStart && elapsed <= spec.hitEnd;
}

export function shouldTriggerMeleeHit(
  attackTimer: number,
  attackDuration: number,
  hitAlreadyApplied: boolean,
): boolean {
  if (hitAlreadyApplied || attackTimer <= 0 || attackDuration <= 0) return false;
  const elapsed = attackDuration - attackTimer;
  return elapsed >= 0.08 && elapsed <= 0.24;
}

export interface MeleeArcCheckInput {
  attackerX: number;
  attackerZ: number;
  attackerYaw: number;
  targetX: number;
  targetZ: number;
  range: number;
  minDot: number;
  hasLos: boolean;
}

export function isTargetInMeleeArc(input: MeleeArcCheckInput): boolean {
  if (!input.hasLos) return false;
  const dx = input.targetX - input.attackerX;
  const dz = input.targetZ - input.attackerZ;
  const dist = Math.hypot(dx, dz);
  if (dist > input.range) return false;
  if (dist <= 1.25) return true;
  const fwdX = Math.sin(input.attackerYaw);
  const fwdZ = Math.cos(input.attackerYaw);
  const dot = (dx * fwdX + dz * fwdZ) / dist;
  return dot >= input.minDot;
}

// ---------------------------------------------------------------------------
// Enemy Templates & Intelligent AI State Machine
// ---------------------------------------------------------------------------

export type EnemyArchetype = 'goblin_scout' | 'orc_warrior' | 'orc_archer' | 'goblin_commander';

export interface EnemyTemplate {
  archetype: EnemyArchetype;
  name: string;
  maxHp: number;
  moveSpeed: number;
  detectRange: number;
  fovCos: number;
  hearingRange: number;
  preferredRange: number;
  attackRange: number;
  attackDamage: number;
  windupDuration: number;
  attackCooldown: number;
  turnSpeed: number;
  xpReward: number;
}

export const ENEMY_TEMPLATES: Record<EnemyArchetype, EnemyTemplate> = {
  goblin_scout: {
    archetype: 'goblin_scout',
    name: 'Skřetí průzkumník',
    maxHp: 45,
    moveSpeed: 5.5,
    detectRange: 17,
    fovCos: -0.35, // ~220° forward awareness
    hearingRange: 4.8,
    preferredRange: 2.2,
    attackRange: 2.45,
    attackDamage: 11,
    windupDuration: 0.38,
    attackCooldown: 1.45,
    turnSpeed: 10.5,
    xpReward: 35,
  },
  orc_warrior: {
    archetype: 'orc_warrior',
    name: 'Skřetí bojovník',
    maxHp: 75,
    moveSpeed: 4.1,
    detectRange: 18,
    fovCos: -0.25,
    hearingRange: 4.5,
    preferredRange: 2.4,
    attackRange: 2.75,
    attackDamage: 18,
    windupDuration: 0.54,
    attackCooldown: 1.95,
    turnSpeed: 8.2,
    xpReward: 60,
  },
  orc_archer: {
    archetype: 'orc_archer',
    name: 'Skřetí lučištník',
    maxHp: 50,
    moveSpeed: 3.8,
    detectRange: 24,
    fovCos: -0.2,
    hearingRange: 5.0,
    preferredRange: 12.5,
    attackRange: 18.5,
    attackDamage: 14,
    windupDuration: 0.64,
    attackCooldown: 2.45,
    turnSpeed: 7.5,
    xpReward: 50,
  },
  goblin_commander: {
    archetype: 'goblin_commander',
    name: 'Grakh, pán průsmyku',
    maxHp: 240,
    moveSpeed: 4.5,
    detectRange: 21,
    fovCos: -0.45,
    hearingRange: 6.5,
    preferredRange: 2.8,
    attackRange: 3.45,
    attackDamage: 24,
    windupDuration: 0.65,
    attackCooldown: 1.95,
    turnSpeed: 7.6,
    xpReward: 250,
  },
};

export function getGrakhBossPhase(hpRatio: number): 1 | 2 | 3 {
  if (hpRatio > 0.65) return 1;
  if (hpRatio > 0.3) return 2;
  return 3;
}

export interface SkillBonusMods {
  staffLightRadiusMult: number;
  fireDamageMult: number;
  focusRegenMult: number;
  meleeDamageMult: number;
  shieldDrainMult: number;
  parryWindowSec: number;
  dodgeStaminaCost: number;
  stealthFactor: number;
  poulticeBonusHp: number;
}

export function computeSkillBonuses(unlockedSkills: readonly string[]): SkillBonusMods {
  const has = (id: string) => unlockedSkills.includes(id);
  return {
    staffLightRadiusMult: has('brighter_light') ? 1.45 : 1.0,
    fireDamageMult: has('flame_of_hope') ? 1.25 : 1.0,
    focusRegenMult: has('unbreakable_will') ? 1.25 : 1.0,
    meleeDamageMult: has('glamdring_edge') ? 1.2 : 1.0,
    shieldDrainMult: has('warding_shield') ? 0.65 : 1.0,
    parryWindowSec: has('warding_shield') ? 0.42 : 0.28,
    dodgeStaminaCost: has('swift_step') ? 13 : has('word_of_hope') ? 15 : 18,
    stealthFactor: has('silent_cloak') ? 0.7 : 1.0,
    poulticeBonusHp: has('keen_eye') ? 15 : 0,
  };
}

export type EnemyAIState =
  | 'IDLE'
  | 'PATROL'
  | 'SUSPICIOUS'
  | 'INVESTIGATE'
  | 'CHASE'
  | 'ATTACK'
  | 'RECOVER'
  | 'RETREAT'
  | 'DEAD';

export interface EnemyPerceptionInput {
  archetype: EnemyArchetype;
  enemyX: number;
  enemyZ: number;
  enemyYaw: number;
  playerX: number;
  playerZ: number;
  hasLos: boolean;
  playerMakingNoise: boolean;
  allyAlerted: boolean;
}

export interface EnemyPerceptionResult {
  canSeePlayer: boolean;
  canHearPlayer: boolean;
  perceived: boolean;
  distToPlayer: number;
}

export function evaluateEnemyPerception(input: EnemyPerceptionInput): EnemyPerceptionResult {
  const tpl = ENEMY_TEMPLATES[input.archetype];
  const dx = input.playerX - input.enemyX;
  const dz = input.playerZ - input.enemyZ;
  const distToPlayer = Math.hypot(dx, dz);

  let inFov = false;
  if (distToPlayer < 0.01) {
    inFov = true;
  } else if (distToPlayer <= tpl.detectRange) {
    const fwdX = Math.sin(input.enemyYaw);
    const fwdZ = Math.cos(input.enemyYaw);
    const dot = (dx * fwdX + dz * fwdZ) / distToPlayer;
    inFov = dot >= tpl.fovCos;
  }

  const canSeePlayer = input.hasLos && distToPlayer <= tpl.detectRange && inFov;
  const noiseRange = input.playerMakingNoise ? Math.min(tpl.detectRange, 12.5) : tpl.hearingRange;
  const canHearPlayer = distToPlayer <= noiseRange;
  const perceived = canSeePlayer || canHearPlayer || (input.allyAlerted && distToPlayer <= tpl.detectRange + 4);

  return { canSeePlayer, canHearPlayer, perceived, distToPlayer };
}

export interface EnemyAIStepInput {
  archetype: EnemyArchetype;
  currentState: EnemyAIState;
  dead: boolean;
  distToPlayer: number;
  distFromHome: number;
  hpRatio: number;
  hasLos: boolean;
  perceived: boolean;
  alertLevel: number;
  investigateTimer: number;
  stunTimer: number;
  cooldownTimer: number;
  windupTimer: number;
  isWindingUp: boolean;
  hasToken: boolean;
}

export function transitionEnemyAIState(input: EnemyAIStepInput): EnemyAIState {
  if (input.dead) return 'DEAD';
  const tpl = ENEMY_TEMPLATES[input.archetype];

  // Leash back home if dragged too far without target
  if (input.distFromHome > 30 && input.distToPlayer > 14 && !input.hasLos) {
    return 'PATROL';
  }

  // Currently locked in windup or active attack -> finish or break if stunned
  if (input.stunTimer > 0) {
    return input.currentState === 'IDLE' || input.currentState === 'PATROL'
      ? 'CHASE'
      : input.currentState === 'ATTACK'
        ? 'RECOVER'
        : input.currentState;
  }

  if (input.isWindingUp) {
    return 'ATTACK';
  }

  // Unaware states
  if (input.currentState === 'IDLE' || input.currentState === 'PATROL') {
    if (input.perceived) {
      return input.alertLevel >= 1.0 || input.distToPlayer <= 10.5 ? 'CHASE' : 'SUSPICIOUS';
    }
    return input.currentState;
  }

  if (input.currentState === 'SUSPICIOUS') {
    if (input.alertLevel >= 1.0) return 'CHASE';
    if (!input.perceived && input.alertLevel <= 0.05) return 'PATROL';
    return 'SUSPICIOUS';
  }

  if (input.currentState === 'INVESTIGATE') {
    if (input.perceived && input.hasLos) return 'CHASE';
    if (input.investigateTimer <= 0) return 'PATROL';
    return 'INVESTIGATE';
  }

  // Combat states: CHASE / ATTACK / RECOVER / RETREAT
  if (!input.hasLos && input.distToPlayer > tpl.hearingRange + 1.5) {
    return 'INVESTIGATE';
  }
  if (input.distToPlayer > tpl.detectRange + 7) {
    return 'INVESTIGATE';
  }

  // Archers kite when pressured at close range
  if (input.archetype === 'orc_archer') {
    if (input.distToPlayer < 6.2) return 'RETREAT';
    if (input.distToPlayer <= tpl.attackRange && input.hasLos && input.cooldownTimer <= 0 && input.hasToken) {
      return 'ATTACK';
    }
    if (input.distToPlayer > tpl.preferredRange + 2.5 || !input.hasLos) {
      return 'CHASE';
    }
    return 'RECOVER';
  }

  // Goblin scouts flee briefly at critical HP if close
  if (input.archetype === 'goblin_scout' && input.hpRatio < 0.28 && input.distToPlayer < 5.2) {
    return 'RETREAT';
  }

  if (input.distToPlayer <= tpl.attackRange && input.hasLos) {
    if (input.cooldownTimer <= 0 && input.hasToken) return 'ATTACK';
    return 'RECOVER';
  }

  return 'CHASE';
}

export type EnemyBehaviorAction =
  | 'patrol'
  | 'approach'
  | 'flank'
  | 'retreat'
  | 'windup'
  | 'strike'
  | 'stunned'
  | 'recover';

export interface EnemyDecisionInput {
  archetype: EnemyArchetype;
  distToPlayer: number;
  hpRatio: number;
  stunTimer: number;
  cooldownTimer: number;
  windupTimer: number;
  isWindingUp: boolean;
  hasToken: boolean;
}

export function decideEnemyAction(input: EnemyDecisionInput): EnemyBehaviorAction {
  if (input.stunTimer > 0) return 'stunned';
  const tpl = ENEMY_TEMPLATES[input.archetype];

  if (input.isWindingUp) {
    if (input.windupTimer <= 0) return 'strike';
    return 'windup';
  }

  if (input.distToPlayer > tpl.detectRange) {
    return 'patrol';
  }

  if (input.archetype === 'orc_archer') {
    if (input.distToPlayer < 6.0) return 'retreat';
    if (input.distToPlayer <= tpl.attackRange && input.cooldownTimer <= 0 && input.hasToken) {
      return 'windup';
    }
    if (input.distToPlayer > tpl.preferredRange + 2) return 'approach';
    return 'flank';
  }

  if (input.archetype === 'goblin_scout' && input.hpRatio < 0.3 && input.distToPlayer < 5.5) {
    return 'retreat';
  }

  if (input.distToPlayer <= tpl.attackRange) {
    if (input.cooldownTimer <= 0 && input.hasToken) return 'windup';
    return input.archetype === 'goblin_scout' ? 'flank' : 'recover';
  }

  return 'approach';
}

// ---------------------------------------------------------------------------
// Spells, Defense Mitigation & Adaptive Music Context
// ---------------------------------------------------------------------------

export function canCastSpell(mana: number, cooldownRemaining: number, spellId: SpellId): boolean {
  const cfg = SPELL_CONFIGS[spellId];
  return cooldownRemaining <= 0 && mana >= cfg.manaCost;
}

export function computeIncomingDamage(
  rawDamage: number,
  shieldActive: boolean,
  isDodging: boolean,
  shieldHoldSeconds = 1.0,
): { finalDamage: number; blocked: boolean; parried: boolean; dodged: boolean } {
  if (isDodging) {
    return { finalDamage: 0, blocked: false, parried: false, dodged: true };
  }
  if (shieldActive) {
    if (shieldHoldSeconds <= 0.28) {
      return { finalDamage: 0, blocked: true, parried: true, dodged: false };
    }
    return {
      finalDamage: Math.max(1, Math.round(rawDamage * 0.15)),
      blocked: true,
      parried: false,
      dodged: false,
    };
  }
  return { finalDamage: Math.round(rawDamage), blocked: false, parried: false, dodged: false };
}

export function xpForNextLevel(level: number): number {
  return 100 + (level - 1) * 75;
}

export function applyXpGain(
  level: number,
  xp: number,
  gain: number,
): { level: number; xp: number; leveledUp: boolean } {
  let curLevel = level;
  let curXp = xp + gain;
  let leveledUp = false;
  while (curXp >= xpForNextLevel(curLevel)) {
    curXp -= xpForNextLevel(curLevel);
    curLevel += 1;
    leveledUp = true;
  }
  return { level: curLevel, xp: curXp, leveledUp };
}

export type MusicContext =
  | 'silent'
  | 'exploration'
  | 'village'
  | 'forest'
  | 'cave'
  | 'encounter'
  | 'combat'
  | 'victory';

export interface MusicContextInput {
  phase: 'title' | 'playing' | 'paused' | 'victory' | 'defeat';
  activeCombatCount: number;
  suspiciousCount: number;
  hasBossNearby: boolean;
  inForestZone: boolean;
  inVillageZone?: boolean;
  inCaveZone?: boolean;
  combatTailTimer: number;
}

export function selectMusicContext(input: MusicContextInput): MusicContext {
  if (input.phase === 'victory') return 'victory';
  if (input.phase === 'title' || input.phase === 'defeat') return 'exploration';
  if (input.activeCombatCount > 0 || input.hasBossNearby || input.combatTailTimer > 0) {
    return 'combat';
  }
  if (input.suspiciousCount > 0) return 'encounter';
  if (input.inCaveZone) return 'cave';
  if (input.inVillageZone) return 'village';
  if (input.inForestZone) return 'forest';
  return 'exploration';
}


