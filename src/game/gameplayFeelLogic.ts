import { EnemyRuntime } from './store';
import { SpellId } from './combatLogic';
import { clamp } from './terrain';
import {
  CollisionWorldContext,
  hasLineOfSightXZUnified,
  sweepCameraCollision,
} from './collisionSystem';

// ---------------------------------------------------------------------------
// 1. Tunable Movement & Turning Kinematics
// ---------------------------------------------------------------------------

export const MOVEMENT_TUNING = {
  walkSpeed: 6.4,
  sprintSpeed: 9.8,
  blockSpeed: 3.9,
  dodgeSpeed: 13.8,
  dodgeDuration: 0.36,
  accelRate: 17.5,
  decelRate: 11.5,
  turnaroundBoost: 1.45,
  dodgeDamp: 24.0,
  attackLungeDamp: 20.0,
  turnRateExplore: 13.5,
  turnRateCombat: 18.5,
  slopeSteepThreshold: 0.45,
  slopeSpeedFactor: 0.86,
  downhillFollowMaxVel: -5.2,
} as const;

export function shortestAngleDiff(current: number, target: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff <= -Math.PI) diff += Math.PI * 2;
  return diff;
}

export function normalizeAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Frame-rate independent angular steering.
 * - 'damp': exponential smoothing factor (for organic player & rig turns)
 * - 'rate': max angular speed in rad/s (ideal for enemy template turnSpeed)
 */
export function stepAngleToward(
  current: number,
  target: number,
  rateOrMaxSpeed: number,
  dt: number,
  mode: 'damp' | 'rate' = 'damp',
): number {
  if (dt <= 0) return current;
  const diff = shortestAngleDiff(current, target);
  if (Math.abs(diff) < 1e-5) return target;
  if (mode === 'rate') {
    const maxStep = Math.max(0, rateOrMaxSpeed) * dt;
    if (Math.abs(diff) <= maxStep) return normalizeAngle(target);
    return normalizeAngle(current + Math.sign(diff) * maxStep);
  }
  const alpha = 1 - Math.exp(-Math.max(0, rateOrMaxSpeed) * dt);
  return normalizeAngle(current + diff * alpha);
}

export interface PlanarVelocityOut {
  vx: number;
  vz: number;
}

export function stepPlanarVelocity(
  curVx: number,
  curVz: number,
  targetVx: number,
  targetVz: number,
  hasActiveMotion: boolean,
  isDodging: boolean,
  isAttacking: boolean,
  dt: number,
  out: PlanarVelocityOut = { vx: 0, vz: 0 },
): PlanarVelocityOut {
  if (dt <= 0) {
    out.vx = curVx;
    out.vz = curVz;
    return out;
  }

  let rate: number;
  if (isDodging) {
    rate = MOVEMENT_TUNING.dodgeDamp;
  } else if (isAttacking) {
    rate = MOVEMENT_TUNING.attackLungeDamp;
  } else if (!hasActiveMotion) {
    rate = MOVEMENT_TUNING.decelRate;
  } else {
    const dot = curVx * targetVx + curVz * targetVz;
    rate = dot < -0.5 ? MOVEMENT_TUNING.accelRate * MOVEMENT_TUNING.turnaroundBoost : MOVEMENT_TUNING.accelRate;
  }

  const alpha = 1 - Math.exp(-rate * dt);
  let nx = curVx + (targetVx - curVx) * alpha;
  let nz = curVz + (targetVz - curVz) * alpha;

  if (!hasActiveMotion && !isDodging && !isAttacking && Math.hypot(nx, nz) < 0.03) {
    nx = 0;
    nz = 0;
  }

  out.vx = nx;
  out.vz = nz;
  return out;
}

// ---------------------------------------------------------------------------
// 2. Gandalf Procedural Animation State Machine
// ---------------------------------------------------------------------------

export type GandalfAnimState =
  | 'DEAD'
  | 'HIT_REACTION'
  | 'DODGE'
  | 'CAST'
  | 'ATTACK'
  | 'STRAFE'
  | 'BLOCK'
  | 'RUN'
  | 'WALK'
  | 'COMBAT_IDLE'
  | 'IDLE';

export interface GandalfAnimInput {
  isDead: boolean;
  staggerTimer: number;
  dodgeTimer: number;
  castTimer: number;
  attackTimer: number;
  shieldActive: boolean;
  horizSpeed: number;
  isSprinting: boolean;
  isCombatAlert: boolean;
}

export function resolveGandalfAnimState(input: GandalfAnimInput): GandalfAnimState {
  if (input.isDead) return 'DEAD';
  if (input.staggerTimer > 0) return 'HIT_REACTION';
  if (input.dodgeTimer > 0) return 'DODGE';
  if (input.castTimer > 0) return 'CAST';
  if (input.attackTimer > 0) return 'ATTACK';
  if (input.shieldActive) {
    return input.horizSpeed > 0.55 ? 'STRAFE' : 'BLOCK';
  }
  if (input.horizSpeed > 0.4) {
    return input.isSprinting && input.horizSpeed > 7.1 ? 'RUN' : 'WALK';
  }
  if (input.isCombatAlert) return 'COMBAT_IDLE';
  return 'IDLE';
}

// ---------------------------------------------------------------------------
// 3. Input Buffering, Directional Dodge & Soft Target Assist
// ---------------------------------------------------------------------------

export type BufferedActionKind =
  | 'attack'
  | 'dodge'
  | 'flash_of_light'
  | 'fire_spell'
  | 'shockwave';

export interface BufferedAction {
  kind: BufferedActionKind;
  expiresAtSec: number;
}

export const INPUT_BUFFER_TTL_SEC = 0.28;

export function createBufferedAction(kind: BufferedActionKind, nowSec: number): BufferedAction {
  return { kind, expiresAtSec: nowSec + INPUT_BUFFER_TTL_SEC };
}

export function isBufferedActionValid(buffer: BufferedAction | null, nowSec: number): buffer is BufferedAction {
  return buffer !== null && buffer.expiresAtSec >= nowSec;
}

export interface DodgeDirectionResult {
  dirX: number;
  dirZ: number;
  yaw: number;
}

export function resolveDirectionalDodge(
  moveForward: number,
  moveRight: number,
  cameraYaw: number,
  playerYaw: number,
): DodgeDirectionResult {
  if (moveForward !== 0 || moveRight !== 0) {
    const camFwdX = -Math.sin(cameraYaw);
    const camFwdZ = -Math.cos(cameraYaw);
    const camRightX = Math.cos(cameraYaw);
    const camRightZ = -Math.sin(cameraYaw);

    let dx = camFwdX * moveForward + camRightX * moveRight;
    let dz = camFwdZ * moveForward + camRightZ * moveRight;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    return { dirX: dx, dirZ: dz, yaw: Math.atan2(dx, dz) };
  }
  const sin = Math.sin(playerYaw);
  const cos = Math.cos(playerYaw);
  return { dirX: sin, dirZ: cos, yaw: playerYaw };
}

export interface SoftCombatTarget {
  id: string;
  x: number;
  z: number;
  yawToTarget: number;
  dist: number;
}

export function pickSoftCombatTarget(
  playerX: number,
  playerZ: number,
  playerYaw: number,
  enemies: ReadonlyArray<Pick<EnemyRuntime, 'id' | 'x' | 'z' | 'dead'>>,
  maxRange = 4.6,
  minDot = -0.15,
  ctx?: CollisionWorldContext,
): SoftCombatTarget | null {
  const fwdX = Math.sin(playerYaw);
  const fwdZ = Math.cos(playerYaw);

  let best: SoftCombatTarget | null = null;
  let bestScore = Infinity;

  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (e.dead) continue;
    const dx = e.x - playerX;
    const dz = e.z - playerZ;
    const dist = Math.hypot(dx, dz);
    if (dist > maxRange || dist < 0.01) continue;
    if (!hasLineOfSightXZUnified(playerX, playerZ, e.x, e.z, ctx)) continue;

    const dot = (dx * fwdX + dz * fwdZ) / dist;
    if (dist > 1.4 && dot < minDot) continue;

    // Lower score = higher priority: reward proximity and forward alignment
    const score = dist - dot * 1.65;
    if (score < bestScore) {
      bestScore = score;
      best = {
        id: e.id,
        x: e.x,
        z: e.z,
        yawToTarget: Math.atan2(dx, dz),
        dist,
      };
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// 4. Four-Phase Magic Casting Sequence (Preparation -> Release -> Recovery)
// ---------------------------------------------------------------------------

export interface SpellCastTiming {
  windup: number;
  total: number;
}

export const SPELL_CAST_TIMINGS: Record<SpellId, SpellCastTiming> = {
  staff_light: { windup: 0.0, total: 0.16 },
  flash_of_light: { windup: 0.11, total: 0.44 },
  fire_spell: { windup: 0.14, total: 0.48 },
  shockwave: { windup: 0.21, total: 0.62 },
};

export type SpellCastPhase = 'idle' | 'preparation' | 'release' | 'recovery';

export interface SpellCastStepResult {
  nextTimer: number;
  triggeredRelease: boolean;
  released: boolean;
  phase: SpellCastPhase;
  progress: number;
}

export function stepSpellCastPhase(
  castTimer: number,
  castDuration: number,
  spellId: SpellId | null,
  alreadyReleased: boolean,
  dt: number,
): SpellCastStepResult {
  if (castTimer <= 0 || !spellId || castDuration <= 0) {
    return { nextTimer: 0, triggeredRelease: false, released: false, phase: 'idle', progress: 0 };
  }

  const nextTimer = Math.max(0, castTimer - Math.max(0, dt));
  const elapsed = castDuration - nextTimer;
  const timing = SPELL_CAST_TIMINGS[spellId];
  const progress = clamp(elapsed / castDuration, 0, 1);

  const shouldReleaseNow = !alreadyReleased && elapsed >= timing.windup;
  const released = alreadyReleased || shouldReleaseNow;

  let phase: SpellCastPhase;
  if (nextTimer <= 0) {
    phase = 'idle';
  } else if (shouldReleaseNow) {
    phase = 'release';
  } else if (elapsed < timing.windup) {
    phase = 'preparation';
  } else {
    phase = 'recovery';
  }

  return {
    nextTimer,
    triggeredRelease: shouldReleaseNow,
    released,
    phase,
    progress,
  };
}

// ---------------------------------------------------------------------------
// 5. Camera Terrain + Obstacle Collision & Deterministic Trauma Shake
// ---------------------------------------------------------------------------

export interface CameraClearanceOut {
  fraction: number;
  minCamY: number;
}

export function clampCameraWithTerrainAndObstacles(
  targetX: number,
  targetY: number,
  targetZ: number,
  desiredX: number,
  desiredY: number,
  desiredZ: number,
  out: CameraClearanceOut = { fraction: 1.0, minCamY: desiredY },
  ctx?: CollisionWorldContext,
): CameraClearanceOut {
  return sweepCameraCollision(targetX, targetY, targetZ, desiredX, desiredY, desiredZ, out, ctx);
}

export function evaluateDampedTraumaOffset(
  trauma: number,
  timeSec: number,
): { x: number; y: number } {
  if (trauma <= 0.01) return { x: 0, y: 0 };
  const amp = trauma * trauma * 0.24;
  return {
    x: (Math.sin(timeSec * 41.0) * 0.68 + Math.cos(timeSec * 67.0) * 0.32) * amp,
    y: (Math.cos(timeSec * 47.0) * 0.65 + Math.sin(timeSec * 73.0) * 0.35) * amp * 0.8,
  };
}
