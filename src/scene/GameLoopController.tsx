import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CapsuleCollider, RapierRigidBody, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import {
  ENEMY_TEMPLATES,
  MELEE_COMBO_STEPS,
  SPELL_CONFIGS,
  SpellId,
  canCastPlayerSpell,
  canRaisePlayerShield,
  canStartPlayerAttack,
  canStartPlayerDodge,
  computeIncomingDamage,
  computeSkillBonuses,
  evaluateEnemyPerception,
  getGrakhBossPhase,
  isMeleeHitWindowActive,
  isTargetInMeleeArc,
  resolvePlayerCombatState,
  selectMusicContext,
  transitionEnemyAIState,
} from '../game/combatLogic';
import { gameAudio } from '../game/audio';
import { ITEM_CATALOG } from '../game/storyData';
import { liveSim, useGameStore } from '../game/store';
import { resolveTrackedObjectivePos } from '../game/worldMapData';
import {
  BufferedAction,
  MOVEMENT_TUNING,
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
} from '../game/gameplayFeelLogic';
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
  computeSteeredDirection,
  groundHeightAt,
  hasLineOfSightXZ,
  isWaterAt,
  resolveObstaclePushOut,
  surfaceSlopeAt,
} from '../game/terrain';

interface ParticleSlot {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  r: number;
  g: number;
  b: number;
}

const PARTICLE_POOL_SIZE = 220;
const ARROW_POOL_SIZE = 16;

// Pre-allocated scratch math helpers (zero GC inside useFrame)
const _camTarget = new THREE.Vector3();
const _camDesired = new THREE.Vector3();
const _camBasePos = new THREE.Vector3(0, 5, 62);
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();
const _velOut = { vx: 0, vz: 0 };
const _camClearOut = { fraction: 1.0, minCamY: 5.0 };

interface NpcAnchor {
  id: 'edran' | 'mira' | 'bruni' | 'rovan' | 'merchant' | 'elka' | 'nela';
  prompt: string;
  x: number;
  z: number;
}

function getActiveNpcs(): NpcAnchor[] {
  const s = useGameStore.getState();
  const list: NpcAnchor[] = [
    {
      id: 'edran',
      prompt: s.flags.edranRescued ? 'Promluvit s Edranem' : 'Pomoci zraněnému Edranovi',
      x: s.flags.edranRescued ? VILLAGE_POS.x - 1.5 : RANGER_POS.x,
      z: s.flags.edranRescued ? VILLAGE_POS.z + 2.0 : RANGER_POS.z,
    },
    { id: 'mira', prompt: 'Promluvit s léčitelkou Mirou', x: VILLAGE_POS.x + 1.8, z: VILLAGE_POS.z + 1.6 },
    { id: 'bruni', prompt: 'Promluvit s trpaslíkem Brunim', x: VILLAGE_POS.x + 4.4, z: VILLAGE_POS.z + 0.5 },
    { id: 'rovan', prompt: 'Promluvit se správcem Rovanem', x: VILLAGE_POS.x - 4.6, z: VILLAGE_POS.z + 0.2 },
    { id: 'elka', prompt: 'Promluvit se starou Elkou', x: VILLAGE_POS.x + 0.8, z: VILLAGE_POS.z - 2.6 },
    { id: 'merchant', prompt: 'Vyslechnout skrytého obchodníka', x: PATROL_POS.x - 5.5, z: PATROL_POS.z - 2.5 },
  ];
  if (s.flags.nelaRescued) {
    list.push({ id: 'nela', prompt: 'Promluvit s Nelou', x: VILLAGE_POS.x - 3.2, z: VILLAGE_POS.z + 0.6 });
  }
  return list;
}

export function GameLoopController({ isSoftwareGl }: { isSoftwareGl: boolean }) {
  const { camera, gl, advance } = useThree();
  const playerBodyRef = useRef<RapierRigidBody>(null);
  const particleMeshRef = useRef<THREE.InstancedMesh>(null);
  const arrowMeshRef = useRef<THREE.InstancedMesh>(null);
  const lastResetRef = useRef<number>(liveSim.resetCounter);
  const camPullRef = useRef(1.0);
  const camInitializedRef = useRef(false);
  const combatCamDistRef = useRef(0);
  const targetPlayerYawRef = useRef<number>(liveSim.playerYaw);
  const inputBufferRef = useRef<BufferedAction | null>(null);

  const keysHeld = useRef<Set<string>>(new Set());
  const draggingMouse = useRef(false);
  const hudSyncTimer = useRef(0);
  const elapsedRef = useRef(0);
  const manaRef = useRef(100);
  const staminaRef = useRef(100);
  const lastSyncedManaRef = useRef(100);
  const lastSyncedStaminaRef = useRef(100);
  const cooldownsRef = useRef<Record<SpellId, number>>({
    staff_light: 0,
    flash_of_light: 0,
    fire_spell: 0,
    shockwave: 0,
  });

  const particles = useMemo<ParticleSlot[]>(() => {
    const arr: ParticleSlot[] = [];
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      arr.push({
        active: false,
        x: 0,
        y: -50,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1,
        size: 0.1,
        r: 1,
        g: 1,
        b: 1,
      });
    }
    return arr;
  }, []);
  const particleCursor = useRef(0);

  const spawnParticle = (
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    size: number,
    r: number,
    g: number,
    b: number,
  ) => {
    const idx = particleCursor.current % PARTICLE_POOL_SIZE;
    particleCursor.current += 1;
    const p = particles[idx];
    p.active = true;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.life = life;
    p.maxLife = life;
    p.size = size;
    p.r = r;
    p.g = g;
    p.b = b;
  };

  // Software-WebGL paced afterDraw loop
  useEffect(() => {
    if (!isSoftwareGl) return;
    let frameId = 0;
    let cancelled = false;
    const renderer = gl;

    const afterDraw = (cb: () => void) => {
      const ctx = renderer.getContext() as WebGL2RenderingContext;
      const sync = ctx.fenceSync?.(ctx.SYNC_GPU_COMMANDS_COMPLETE, 0);
      ctx.flush?.();
      const poll = () => {
        if (cancelled) return;
        const state = sync ? ctx.getSyncParameter(sync, ctx.SYNC_STATUS) : ctx.SIGNALED;
        if (state === ctx.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) ctx.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const tick = () => {
      if (cancelled) return;
      advance(performance.now());
      afterDraw(tick);
    };

    frameId = window.setTimeout(tick, 40);
    return () => {
      cancelled = true;
      window.clearTimeout(frameId);
    };
  }, [isSoftwareGl, gl, advance]);

  const getCombatState = () => {
    const s = useGameStore.getState();
    return resolvePlayerCombatState({
      hp: s.hp,
      staggerTimer: liveSim.staggerTimer,
      dodgeTimer: liveSim.dodgeTimer,
      attackTimer: liveSim.attackTimer,
      shieldActive: s.shieldActive,
    });
  };

  const getMoveAxes = () => {
    let moveForward = 0;
    let moveRight = 0;
    if (keysHeld.current.has('KeyW') || keysHeld.current.has('ArrowUp')) moveForward += 1;
    if (keysHeld.current.has('KeyS') || keysHeld.current.has('ArrowDown')) moveForward -= 1;
    if (keysHeld.current.has('KeyD') || keysHeld.current.has('ArrowRight')) moveRight += 1;
    if (keysHeld.current.has('KeyA') || keysHeld.current.has('ArrowLeft')) moveRight -= 1;
    return { moveForward, moveRight };
  };

  const startDodge = (allowBuffer = true): boolean => {
    const store = useGameStore.getState();
    if (store.phase !== 'playing' || store.activeDialogue || store.journalOpen || store.worldMapOpen) return false;
    const cState = getCombatState();
    const mods = computeSkillBonuses(store.unlockedSkills);

    if (
      !canStartPlayerDodge(cState, staminaRef.current, liveSim.attackTimer) ||
      staminaRef.current < mods.dodgeStaminaCost
    ) {
      if (allowBuffer && staminaRef.current >= mods.dodgeStaminaCost && cState !== 'DEAD') {
        inputBufferRef.current = createBufferedAction('dodge', elapsedRef.current);
      }
      return false;
    }

    staminaRef.current = Math.max(0, staminaRef.current - mods.dodgeStaminaCost);
    lastSyncedStaminaRef.current = Math.round(staminaRef.current);
    liveSim.attackTimer = 0;
    liveSim.attackBuffered = false;
    liveSim.castTimer = 0;
    liveSim.castKind = null;
    liveSim.pendingCastSpell = null;
    liveSim.pendingCastReleased = false;
    liveSim.staggerTimer = 0;
    if (store.shieldActive) store.setShieldActive(false);

    const { moveForward, moveRight } = getMoveAxes();
    const dir = resolveDirectionalDodge(moveForward, moveRight, liveSim.cameraYaw, liveSim.playerYaw);
    liveSim.dodgeTimer = MOVEMENT_TUNING.dodgeDuration;
    liveSim.dodgeDirX = dir.dirX;
    liveSim.dodgeDirZ = dir.dirZ;
    targetPlayerYawRef.current = dir.yaw;
    liveSim.playerYaw = stepAngleToward(liveSim.playerYaw, dir.yaw, 28, 0.032, 'damp');
    liveSim.playerNoiseTimer = Math.max(liveSim.playerNoiseTimer, 0.45);
    inputBufferRef.current = null;
    gameAudio.playSwing(0);
    return true;
  };

  const startMeleeSwing = (allowBuffer = true): boolean => {
    const store = useGameStore.getState();
    if (store.phase !== 'playing' || store.activeDialogue || store.journalOpen || store.worldMapOpen) return false;
    const cState = getCombatState();

    if (liveSim.castTimer > 0 && !liveSim.pendingCastReleased) {
      if (allowBuffer) inputBufferRef.current = createBufferedAction('attack', elapsedRef.current);
      return false;
    }

    if (cState === 'ATTACKING') {
      if (liveSim.attackTimer <= liveSim.attackDuration * 0.58) {
        liveSim.attackBuffered = true;
      } else if (allowBuffer) {
        inputBufferRef.current = createBufferedAction('attack', elapsedRef.current);
      }
      return false;
    }

    if (!canStartPlayerAttack(cState)) {
      if (allowBuffer && cState !== 'DEAD') {
        inputBufferRef.current = createBufferedAction('attack', elapsedRef.current);
      }
      return false;
    }

    if (store.shieldActive) {
      store.setShieldActive(false);
    }

    // Cancel late cast recovery smoothly into melee strike
    liveSim.castTimer = 0;
    liveSim.castKind = null;
    liveSim.pendingCastSpell = null;
    liveSim.pendingCastReleased = false;

    const nextCombo = liveSim.attackTimer > 0 || liveSim.attackBuffered ? (liveSim.attackCombo + 1) % 3 : 0;
    const spec = MELEE_COMBO_STEPS[nextCombo];

    // Soft target-facing assist toward nearby in-front enemy
    const softTarget = pickSoftCombatTarget(
      liveSim.playerX,
      liveSim.playerZ,
      targetPlayerYawRef.current,
      liveSim.enemies,
      spec.range + 1.25,
      -0.15,
    );
    if (softTarget) {
      targetPlayerYawRef.current = softTarget.yawToTarget;
      liveSim.playerYaw = stepAngleToward(liveSim.playerYaw, softTarget.yawToTarget, 24, 0.032, 'damp');
    }

    liveSim.attackCombo = nextCombo;
    liveSim.attackDuration = spec.duration;
    liveSim.attackTimer = spec.duration;
    liveSim.attackHitApplied = false;
    liveSim.attackBuffered = false;
    inputBufferRef.current = null;
    liveSim.swingId += 1;
    liveSim.swingHitEnemyIds.clear();
    liveSim.playerNoiseTimer = Math.max(liveSim.playerNoiseTimer, 0.75);
    gameAudio.playSwing(nextCombo);
    return true;
  };

  const resolveMeleeSwingHit = () => {
    const spec = MELEE_COMBO_STEPS[liveSim.attackCombo % 3];
    const store = useGameStore.getState();
    const mods = computeSkillBonuses(store.unlockedSkills);
    const dmg = Math.round(spec.damage * mods.meleeDamageMult);

    let hitAny = false;
    for (let i = 0; i < liveSim.enemies.length; i++) {
      const e = liveSim.enemies[i];
      if (e.dead || liveSim.swingHitEnemyIds.has(e.id)) continue;

      const los = hasLineOfSightXZ(liveSim.playerX, liveSim.playerZ, e.x, e.z);
      if (
        isTargetInMeleeArc({
          attackerX: liveSim.playerX,
          attackerZ: liveSim.playerZ,
          attackerYaw: liveSim.playerYaw,
          targetX: e.x,
          targetZ: e.z,
          range: spec.range,
          minDot: spec.minDot,
          hasLos: los,
        })
      ) {
        liveSim.swingHitEnemyIds.add(e.id);
        liveSim.attackHitApplied = true;
        const dx = e.x - liveSim.playerX;
        const dz = e.z - liveSim.playerZ;
        const dist = Math.hypot(dx, dz) || 1;
        damageEnemy(
          e,
          dmg,
          (dx / dist) * spec.knockback,
          (dz / dist) * spec.knockback,
          spec.stunSec,
          spec.step === 2,
        );
        hitAny = true;
      }
    }

    // Melee strike can also smash west/east signal beacon mechanisms
    for (const obj of liveSim.storyInteractables) {
      if (obj.done || obj.kind !== 'signal_beacon' || obj.id === 'beacon_summit') continue;
      if (Math.hypot(obj.x - liveSim.playerX, obj.z - liveSim.playerZ) <= spec.range + 0.6) {
        store.interactWithStoryObject(obj.id);
        hitAny = true;
      }
    }

    if (hitAny) {
      liveSim.hitstopTimer = spec.step === 2 ? 0.055 : 0.03;
      liveSim.cameraTrauma = Math.min(1, liveSim.cameraTrauma + (spec.step === 2 ? 0.34 : 0.22));
      gameAudio.playHit(spec.step === 2, spec.step === 1);
      if (spec.step === 2) {
        store.showCombatCallout('Silný úder!', 'crit', 750);
      }
    }
  };

  const damageEnemy = (
    e: (typeof liveSim.enemies)[number],
    dmg: number,
    knockX: number,
    knockZ: number,
    stunSec = 0,
    heavy = false,
  ) => {
    if (e.dead) return;
    e.hp = Math.max(0, e.hp - dmg);
    e.hitFlashTimer = 0.11;
    e.vx += knockX;
    e.vz += knockZ;
    e.alertLevel = 1;
    e.lastKnownX = liveSim.playerX;
    e.lastKnownZ = liveSim.playerZ;
    if (e.aiState === 'IDLE' || e.aiState === 'PATROL' || e.aiState === 'SUSPICIOUS') {
      e.aiState = 'CHASE';
    }
    if (stunSec > 0) {
      e.stunTimer = Math.max(e.stunTimer, stunSec);
      if (e.isWindingUp && (heavy || stunSec >= 0.3)) {
        e.isWindingUp = false;
        e.attackPhase = 'none';
        e.cooldownTimer = Math.max(e.cooldownTimer, 0.7);
      }
    }
    liveSim.combatTailTimer = Math.max(liveSim.combatTailTimer, 3.5);

    const sparkCount = heavy ? 12 : 8;
    for (let p = 0; p < sparkCount; p++) {
      spawnParticle(
        e.x,
        e.y + 1.0,
        e.z,
        (Math.random() - 0.5) * (heavy ? 5.5 : 4),
        1.5 + Math.random() * 2.5,
        (Math.random() - 0.5) * (heavy ? 5.5 : 4),
        0.4,
        heavy ? 0.13 : 0.1,
        1.0,
        heavy ? 0.85 : 0.72,
        heavy ? 0.45 : 0.28,
      );
    }

    if (e.hp <= 0) {
      e.dead = true;
      e.aiState = 'DEAD';
      e.isWindingUp = false;
      e.attackPhase = 'none';
      e.deathTimer = 0.45;
      gameAudio.playEnemyDefeat();
      useGameStore.getState().onEnemyKilled(e.id, e.archetype, e.group);
    }
  };

  const executeSpellRelease = (spellId: SpellId) => {
    const store = useGameStore.getState();
    const mods = computeSkillBonuses(store.unlockedSkills);
    const cfg = SPELL_CONFIGS[spellId];
    const px = liveSim.playerX;
    const py = liveSim.playerY;
    const pz = liveSim.playerZ;
    const fwdX = Math.sin(liveSim.playerYaw);
    const fwdZ = Math.cos(liveSim.playerYaw);

    if (spellId === 'flash_of_light') {
      liveSim.flashBurstTimer = 0.55;
      liveSim.cameraTrauma = Math.min(1, liveSim.cameraTrauma + 0.18);
      gameAudio.playFlashOfLight();
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        spawnParticle(
          px,
          py + 1.3,
          pz,
          Math.cos(a) * (4 + Math.random() * 4),
          1 + Math.random() * 2.5,
          Math.sin(a) * (4 + Math.random() * 4),
          0.55,
          0.16,
          1.0,
          0.98,
          0.72,
        );
      }
      let stunnedAny = false;
      for (const e of liveSim.enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - px, e.z - pz);
        if (d <= cfg.radius && hasLineOfSightXZ(px, pz, e.x, e.z)) {
          damageEnemy(e, cfg.damage, 0, 0, cfg.stunDuration, true);
          stunnedAny = true;
        }
      }
      if (stunnedAny) {
        store.showCombatCallout('Omráčeno světlem!', 'stun', 900);
      }
    } else if (spellId === 'fire_spell') {
      liveSim.fireBurstTimer = 0.48;
      liveSim.cameraTrauma = Math.min(1, liveSim.cameraTrauma + 0.24);
      gameAudio.playFireSpell();
      const fireDmg = Math.round(cfg.damage * mods.fireDamageMult);
      for (let i = 0; i < 26; i++) {
        const spread = (Math.random() - 0.5) * 0.7;
        const cos = Math.cos(spread);
        const sin = Math.sin(spread);
        const dx = fwdX * cos - fwdZ * sin;
        const dz = fwdX * sin + fwdZ * cos;
        const spd = 6 + Math.random() * 7;
        spawnParticle(
          px + fwdX * 0.8,
          py + 1.15,
          pz + fwdZ * 0.8,
          dx * spd,
          0.6 + Math.random() * 1.8,
          dz * spd,
          0.5,
          0.22,
          1.0,
          0.45 + Math.random() * 0.35,
          0.1,
        );
      }

      for (const e of liveSim.enemies) {
        if (e.dead) continue;
        const dx = e.x - px;
        const dz = e.z - pz;
        const d = Math.hypot(dx, dz);
        if (d <= cfg.radius && hasLineOfSightXZ(px, pz, e.x, e.z)) {
          const dot = d > 0.01 ? (dx * fwdX + dz * fwdZ) / d : 1;
          if (dot > 0.25 || d < 2.2) {
            e.burnTimer = 3.5;
            damageEnemy(e, fireDmg, fwdX * 4.8, fwdZ * 4.8, cfg.stunDuration, true);
          }
        }
      }

      // Ignite nearby environmental braziers
      for (const b of liveSim.braziers) {
        if (!b.lit && Math.hypot(b.x - px, b.z - pz) < 9.5) {
          b.lit = true;
          store.grantXp(20);
          store.notify('Ohniště zažehnuto', 'Plamen zahání mlhu a umožňuje výrobu v táboře (+20 XP)', 2800);
        }
      }

      // Fire Spell also disrupts west/east fortress signal beacons
      for (const obj of liveSim.storyInteractables) {
        if (obj.done || obj.kind !== 'signal_beacon' || obj.id === 'beacon_summit') continue;
        if (Math.hypot(obj.x - px, obj.z - pz) < 6.5) {
          store.interactWithStoryObject(obj.id);
        }
      }
    } else if (spellId === 'shockwave') {
      liveSim.shockwaveTimer = 0.65;
      liveSim.cameraTrauma = Math.min(1, liveSim.cameraTrauma + 0.55);
      liveSim.hitstopTimer = 0.05;
      gameAudio.playShockwave();
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2;
        spawnParticle(
          px,
          py + 0.4,
          pz,
          Math.cos(a) * 10,
          1.5 + Math.random() * 2,
          Math.sin(a) * 10,
          0.55,
          0.24,
          0.85,
          0.92,
          1.0,
        );
      }
      for (const e of liveSim.enemies) {
        if (e.dead) continue;
        const dx = e.x - px;
        const dz = e.z - pz;
        const d = Math.hypot(dx, dz);
        if (d <= cfg.radius && hasLineOfSightXZ(px, pz, e.x, e.z)) {
          const inv = d > 0.01 ? 1 / d : 1;
          damageEnemy(e, cfg.damage, dx * inv * 13.5, dz * inv * 13.5, cfg.stunDuration, true);
        }
      }
    }
  };

  const performCastSpell = (spellId: SpellId, allowBuffer = true): boolean => {
    const store = useGameStore.getState();
    if (store.phase !== 'playing' || store.activeDialogue || store.journalOpen || store.worldMapOpen) return false;

    if (spellId === 'staff_light') {
      if (cooldownsRef.current.staff_light > 0) return false;
      cooldownsRef.current.staff_light = SPELL_CONFIGS.staff_light.cooldown;
      store.toggleStaffLight();
      gameAudio.playFlashOfLight();
      return true;
    }

    const cState = getCombatState();
    const cd = cooldownsRef.current[spellId];
    const castLocked = liveSim.castTimer > 0 && !liveSim.pendingCastReleased;
    if (castLocked || !canCastPlayerSpell(cState, manaRef.current, cd, spellId, liveSim.attackTimer)) {
      if (manaRef.current < SPELL_CONFIGS[spellId].manaCost && cd <= 0) {
        if (allowBuffer) {
          store.notify('Nedostatek soustředění', 'Vypij bylinný odvar [3] nebo vyčkej na obnovu sil', 1800);
        }
        return false;
      }
      if (allowBuffer && cd <= 0 && cState !== 'DEAD') {
        inputBufferRef.current = createBufferedAction(spellId, elapsedRef.current);
      }
      return false;
    }

    if (store.shieldActive) {
      store.setShieldActive(false);
    }

    const cfg = SPELL_CONFIGS[spellId];
    manaRef.current = Math.max(0, manaRef.current - cfg.manaCost);
    lastSyncedManaRef.current = Math.round(manaRef.current);
    cooldownsRef.current[spellId] = cfg.cooldown;
    liveSim.attackTimer = 0;
    liveSim.attackBuffered = false;
    inputBufferRef.current = null;

    if (spellId === 'fire_spell') {
      const fireTarget = pickSoftCombatTarget(
        liveSim.playerX,
        liveSim.playerZ,
        targetPlayerYawRef.current,
        liveSim.enemies,
        cfg.radius * 0.85,
        0.0,
      );
      if (fireTarget) {
        targetPlayerYawRef.current = fireTarget.yawToTarget;
      }
    }

    const timing = SPELL_CAST_TIMINGS[spellId];
    liveSim.castDuration = timing.total;
    liveSim.castTimer = timing.total;
    liveSim.castKind = spellId;
    liveSim.pendingCastSpell = spellId;
    liveSim.pendingCastReleased = false;
    liveSim.playerNoiseTimer = Math.max(liveSim.playerNoiseTimer, 1.35);

    useGameStore.setState((s) => ({
      mana: Math.round(manaRef.current),
      cooldowns: { ...cooldownsRef.current },
      runStats: { ...s.runStats, spellsCast: s.runStats.spellsCast + 1 },
    }));
    return true;
  };

  const performInteract = () => {
    const store = useGameStore.getState();
    if (store.phase !== 'playing') return;

    if (store.activeDialogue) {
      const choices = store.activeDialogue.choices;
      if (choices && choices.length === 1) {
        store.resolveDialogueChoice(choices[0].effectId);
      } else if (!choices || choices.length === 0) {
        store.resolveDialogueChoice('close');
      }
      return;
    }

    const px = liveSim.playerX;
    const pz = liveSim.playerZ;
    const mods = computeSkillBonuses(store.unlockedSkills);
    const clueRange = store.unlockedSkills.includes('keen_eye') ? 4.4 : 3.6;

    // 1. Story interactables (prioritize clues/runes/beacons when right next to them)
    let bestObj: (typeof liveSim.storyInteractables)[number] | null = null;
    let bestObjDist = clueRange;
    for (const obj of liveSim.storyInteractables) {
      if (obj.done) continue;
      const d = Math.hypot(px - obj.x, pz - obj.z);
      if (d < bestObjDist) {
        bestObjDist = d;
        bestObj = obj;
      }
    }

    // 2. NPCs
    let bestNpc: NpcAnchor | null = null;
    let bestNpcDist = 4.2;
    for (const npc of getActiveNpcs()) {
      const d = Math.hypot(px - npc.x, pz - npc.z);
      if (d < bestNpcDist) {
        bestNpcDist = d;
        bestNpc = npc;
      }
    }

    if (bestObj && (!bestNpc || bestObjDist <= bestNpcDist + 0.3)) {
      store.interactWithStoryObject(bestObj.id);
      return;
    }

    if (bestNpc) {
      store.openNpcDialogue(bestNpc.id);
      return;
    }

    // 3. Collectibles (herbs, water, cloth, resin, wood, bread)
    for (const c of liveSim.collectibles) {
      if (c.collected) continue;
      if (Math.hypot(px - c.x, pz - c.z) < 3.6 + (mods.poulticeBonusHp > 0 ? 0.6 : 0)) {
        c.collected = true;
        gameAudio.playQuestChime();
        store.addInventoryItem(c.itemId);
        store.grantXp(20);
        return;
      }
    }
  };

  // Input Event Listeners
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      gameAudio.unlockFromGesture();
      const code = e.code;
      const store = useGameStore.getState();

      if (store.phase === 'title') {
        if (code === 'Enter' || code === 'Space') {
          e.preventDefault();
          store.startGame();
        }
        return;
      }

      if (code === 'Escape') {
        if (store.worldMapOpen) {
          store.toggleWorldMap(false);
          return;
        }
        if (store.journalOpen) {
          store.toggleJournal();
          return;
        }
        if (store.activeDialogue) {
          store.resolveDialogueChoice('close');
          return;
        }
        if (store.phase === 'playing') store.pauseGame();
        else if (store.phase === 'paused') store.resumeGame();
        return;
      }

      if (code === 'KeyP') {
        if (store.worldMapOpen || store.journalOpen || store.activeDialogue) return;
        if (store.phase === 'playing') store.pauseGame();
        else if (store.phase === 'paused') store.resumeGame();
        return;
      }

      if (code === 'Tab') {
        e.preventDefault();
        if (!e.repeat) store.toggleJournal();
        return;
      }

      if (store.phase !== 'playing') return;

      const typingInInput =
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement;

      if (code === 'KeyM' && !e.repeat && !typingInInput) {
        if (!store.activeDialogue) {
          keysHeld.current.clear();
          draggingMouse.current = false;
          store.toggleWorldMap();
        }
        return;
      }

      // Branching dialogue numeric hotkeys [1..3]
      if (store.activeDialogue && !e.repeat) {
        const choices = store.activeDialogue.choices;
        if (choices && choices.length > 0) {
          if (code === 'Digit1' && choices[0]) {
            store.resolveDialogueChoice(choices[0].effectId);
            return;
          }
          if (code === 'Digit2' && choices[1]) {
            store.resolveDialogueChoice(choices[1].effectId);
            return;
          }
          if (code === 'Digit3' && choices[2]) {
            store.resolveDialogueChoice(choices[2].effectId);
            return;
          }
        }
      }

      if (store.activeDialogue || store.journalOpen || store.worldMapOpen) return;

      if (code === 'KeyF' && !e.repeat) {
        performInteract();
        return;
      }

      keysHeld.current.add(code);

      if (!e.repeat) {
        if (code === 'KeyQ') performCastSpell('flash_of_light');
        else if (code === 'KeyE') performCastSpell('fire_spell');
        else if (code === 'KeyR') performCastSpell('shockwave');
        else if (code === 'KeyL' || code === 'Digit1') performCastSpell('staff_light');
        else if (code === 'KeyJ') startMeleeSwing();
        else if (code === 'KeyV') {
          if (canRaisePlayerShield(getCombatState(), manaRef.current)) store.setShieldActive(true);
        } else if (code === 'Digit2') store.useInventoryItem('healing_poultice');
        else if (code === 'Digit3') store.useInventoryItem('herbal_decoction');
        else if (code === 'Digit4') store.useInventoryItem('travel_bread');
        else if (code === 'Digit5') store.useInventoryItem('torch_item');
        else if (code === 'Space') {
          e.preventDefault();
          startDodge(true);
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysHeld.current.delete(e.code);
      if (e.code === 'KeyV') {
        useGameStore.getState().setShieldActive(false);
      }
    };

    const onBlur = () => {
      keysHeld.current.clear();
      draggingMouse.current = false;
      inputBufferRef.current = null;
      liveSim.attackBuffered = false;
      useGameStore.getState().setShieldActive(false);
    };

    const onVisibility = () => {
      gameAudio.setTabHidden(document.hidden);
      if (document.hidden) onBlur();
    };

    const canvas = gl.domElement;

    const onMouseDown = (e: MouseEvent) => {
      gameAudio.unlockFromGesture();
      const store = useGameStore.getState();
      if (store.phase !== 'playing' || store.activeDialogue || store.journalOpen || store.worldMapOpen) return;

      if (e.button === 0) {
        draggingMouse.current = true;
        startMeleeSwing();
        if (!document.pointerLockElement && canvas.requestPointerLock) {
          try {
            const p = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
            if (p && typeof p.catch === 'function') p.catch(() => {});
          } catch {
            // ignore in sandboxed frames
          }
        }
      } else if (e.button === 2) {
        if (canRaisePlayerShield(getCombatState(), manaRef.current)) {
          store.setShieldActive(true);
        }
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) draggingMouse.current = false;
      if (e.button === 2) useGameStore.getState().setShieldActive(false);
    };

    const onMouseMove = (e: MouseEvent) => {
      const store = useGameStore.getState();
      if (store.phase !== 'playing' || store.activeDialogue || store.journalOpen || store.worldMapOpen) return;
      if (document.pointerLockElement === canvas || draggingMouse.current) {
        const sens = 0.0024 * store.settings.mouseSensitivity;
        const dx = THREE.MathUtils.clamp(e.movementX, -80, 80);
        const dy = THREE.MathUtils.clamp(e.movementY, -80, 80);
        liveSim.cameraYaw -= dx * sens;
        liveSim.cameraPitch = THREE.MathUtils.clamp(
          liveSim.cameraPitch + dy * sens * 0.85,
          -0.16,
          0.95,
        );
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const onWheel = (e: WheelEvent) => {
      const store = useGameStore.getState();
      if (store.phase !== 'playing' || store.worldMapOpen || store.journalOpen || store.activeDialogue) return;
      liveSim.cameraDist = THREE.MathUtils.clamp(liveSim.cameraDist + e.deltaY * 0.004, 4.5, 12.0);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('contextmenu', onContextMenu);
    canvas.addEventListener('wheel', onWheel, { passive: true });

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [gl]);

  const hudHandlersRef = useRef({ performCastSpell, startMeleeSwing, performInteract });
  hudHandlersRef.current = { performCastSpell, startMeleeSwing, performInteract };

  // Custom window events from HUD Spell buttons
  useEffect(() => {
    const onHudSpell = (e: Event) => {
      gameAudio.unlockFromGesture();
      const custom = e as CustomEvent<SpellId>;
      hudHandlersRef.current.performCastSpell(custom.detail);
    };
    const onHudAttack = () => {
      gameAudio.unlockFromGesture();
      hudHandlersRef.current.startMeleeSwing();
    };
    const onHudInteract = () => {
      gameAudio.unlockFromGesture();
      hudHandlersRef.current.performInteract();
    };
    window.addEventListener('gandalf-cast-spell', onHudSpell);
    window.addEventListener('gandalf-melee-attack', onHudAttack);
    window.addEventListener('gandalf-interact', onHudInteract);
    return () => {
      window.removeEventListener('gandalf-cast-spell', onHudSpell);
      window.removeEventListener('gandalf-melee-attack', onHudAttack);
      window.removeEventListener('gandalf-interact', onHudInteract);
    };
  }, []);

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const store = useGameStore.getState();

    // Sync reset / checkpoint load
    if (lastResetRef.current !== liveSim.resetCounter) {
      lastResetRef.current = liveSim.resetCounter;
      elapsedRef.current = store.runStats.elapsedSeconds;
      manaRef.current = store.mana;
      staminaRef.current = store.stamina;
      lastSyncedManaRef.current = store.mana;
      lastSyncedStaminaRef.current = store.stamina;
      cooldownsRef.current = { staff_light: 0, flash_of_light: 0, fire_spell: 0, shockwave: 0 };
      camInitializedRef.current = false;
      camPullRef.current = 1.0;
      combatCamDistRef.current = 0;
      targetPlayerYawRef.current = liveSim.playerYaw;
      inputBufferRef.current = null;
      if (playerBodyRef.current) {
        playerBodyRef.current.setTranslation(
          {
            x: liveSim.playerX,
            y: groundHeightAt(liveSim.playerX, liveSim.playerZ) + 1.0,
            z: liveSim.playerZ,
          },
          true,
        );
        playerBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
    }

    // Propagate external store mutations (potions, resting, songs) into local refs
    if (store.mana !== lastSyncedManaRef.current) {
      manaRef.current = store.mana;
      lastSyncedManaRef.current = store.mana;
    }
    if (store.stamina !== lastSyncedStaminaRef.current) {
      staminaRef.current = store.stamina;
      lastSyncedStaminaRef.current = store.stamina;
    }

    // Visual-only timers tick even during hitstop
    if (liveSim.flashBurstTimer > 0) liveSim.flashBurstTimer = Math.max(0, liveSim.flashBurstTimer - dt);
    if (liveSim.fireBurstTimer > 0) liveSim.fireBurstTimer = Math.max(0, liveSim.fireBurstTimer - dt);
    if (liveSim.shockwaveTimer > 0) liveSim.shockwaveTimer = Math.max(0, liveSim.shockwaveTimer - dt);
    if (liveSim.hurtFlashTimer > 0) liveSim.hurtFlashTimer = Math.max(0, liveSim.hurtFlashTimer - dt);
    liveSim.cameraTrauma = Math.max(0, liveSim.cameraTrauma - dt * 1.9);

    // Title Screen Camera Showcase
    if (store.phase === 'title') {
      camInitializedRef.current = false;
      const t = state.clock.elapsedTime;
      const orbitAngle = Math.sin(t * 0.18) * 0.32;
      const cx = SPAWN_POS.x + Math.sin(orbitAngle) * 6.5;
      const cz = SPAWN_POS.z + 6.8;
      const cy = groundHeightAt(SPAWN_POS.x, SPAWN_POS.z) + 3.2;
      camera.position.set(cx, cy, cz);
      camera.lookAt(SPAWN_POS.x - 1.5, cy - 0.3, SPAWN_POS.z - 22);
      return;
    }

    // Pause / Map / Journal / Victory / Defeat freeze simulation
    if (store.phase !== 'playing' || store.journalOpen || store.activeDialogue || store.worldMapOpen) {
      if (playerBodyRef.current) {
        playerBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
      return;
    }

    // Hitstop freeze
    if (liveSim.hitstopTimer > 0) {
      liveSim.hitstopTimer = Math.max(0, liveSim.hitstopTimer - dt);
      return;
    }

    elapsedRef.current += dt;
    const mods = computeSkillBonuses(store.unlockedSkills);

    // Torch timer
    if (liveSim.torchLightTimer > 0) {
      liveSim.torchLightTimer = Math.max(0, liveSim.torchLightTimer - dt);
      if (liveSim.torchLightTimer <= 0) {
        store.notify('Pochodeň dohořela', 'Světlo hole můžeš udržet pomocí klávesy [L]', 2000);
      }
    }

    // Cooldowns & Focus Regen
    (['staff_light', 'flash_of_light', 'fire_spell', 'shockwave'] as SpellId[]).forEach((id) => {
      if (cooldownsRef.current[id] > 0) {
        cooldownsRef.current[id] = Math.max(0, cooldownsRef.current[id] - dt);
      }
    });

    const inLiskaSafe = Math.hypot(liveSim.playerX - VILLAGE_POS.x, liveSim.playerZ - VILLAGE_POS.z) < 20;
    if (store.shieldActive) {
      liveSim.shieldHoldTimer += dt;
      manaRef.current = Math.max(0, manaRef.current - 12 * mods.shieldDrainMult * dt);
      if (manaRef.current <= 0.5) store.setShieldActive(false);
    } else {
      liveSim.shieldHoldTimer = 0;
      const freeLight = liveSim.torchLightTimer > 0;
      const baseRegen = store.staffLightOn && !freeLight ? 4.8 : 8.5;
      const safeBonus = inLiskaSafe && store.unlockedSkills.includes('word_of_hope') ? 1.35 : inLiskaSafe ? 1.2 : 1.0;
      manaRef.current = Math.min(store.maxMana, manaRef.current + baseRegen * mods.focusRegenMult * safeBonus * dt);
    }

    if (liveSim.staggerTimer > 0) liveSim.staggerTimer = Math.max(0, liveSim.staggerTimer - dt);
    if (liveSim.playerNoiseTimer > 0) liveSim.playerNoiseTimer = Math.max(0, liveSim.playerNoiseTimer - dt);
    if (liveSim.combatTailTimer > 0) liveSim.combatTailTimer = Math.max(0, liveSim.combatTailTimer - dt);

    if (liveSim.attackTimer > 0) {
      liveSim.attackTimer = Math.max(0, liveSim.attackTimer - dt);
      if (isMeleeHitWindowActive(liveSim.attackTimer, liveSim.attackDuration, liveSim.attackCombo)) {
        resolveMeleeSwingHit();
      }
      if (liveSim.attackTimer <= 0 && liveSim.attackBuffered) {
        startMeleeSwing(false);
      }
    }

    // Four-Phase Magic Casting Sequence (Preparation -> Release -> Recovery)
    if (liveSim.castTimer > 0 && liveSim.pendingCastSpell) {
      const castStep = stepSpellCastPhase(
        liveSim.castTimer,
        liveSim.castDuration,
        liveSim.pendingCastSpell,
        liveSim.pendingCastReleased,
        dt,
      );
      liveSim.castTimer = castStep.nextTimer;
      liveSim.pendingCastReleased = castStep.released;
      if (castStep.triggeredRelease) {
        executeSpellRelease(liveSim.pendingCastSpell);
      }
      if (liveSim.castTimer <= 0) {
        liveSim.castKind = null;
        liveSim.pendingCastSpell = null;
        liveSim.pendingCastReleased = false;
      }
    } else if (liveSim.castTimer > 0) {
      liveSim.castTimer = Math.max(0, liveSim.castTimer - dt);
    }

    if (liveSim.dodgeTimer > 0) liveSim.dodgeTimer = Math.max(0, liveSim.dodgeTimer - dt);

    // Consume buffered combat/dodge/spell input as soon as action window opens
    if (isBufferedActionValid(inputBufferRef.current, elapsedRef.current)) {
      const bufferedKind = inputBufferRef.current.kind;
      let consumed = false;
      if (bufferedKind === 'dodge') consumed = startDodge(false);
      else if (bufferedKind === 'attack') consumed = startMeleeSwing(false);
      else consumed = performCastSpell(bufferedKind, false);
      if (consumed) {
        inputBufferRef.current = null;
      }
    } else if (inputBufferRef.current) {
      inputBufferRef.current = null;
    }

    // Player Movement Input & Smooth Directional Kinematics
    const { moveForward, moveRight } = getMoveAxes();
    const hasMove = moveForward !== 0 || moveRight !== 0;
    const wantsSprint =
      hasMove &&
      (keysHeld.current.has('ShiftLeft') || keysHeld.current.has('ShiftRight')) &&
      staminaRef.current > 2 &&
      !store.shieldActive &&
      liveSim.staggerTimer <= 0 &&
      liveSim.castTimer <= 0;

    if (wantsSprint) {
      staminaRef.current = Math.max(0, staminaRef.current - 22 * dt);
      liveSim.playerNoiseTimer = Math.max(liveSim.playerNoiseTimer, 0.25);
    } else if (liveSim.dodgeTimer <= 0) {
      staminaRef.current = Math.min(store.maxStamina, staminaRef.current + 26 * dt);
    }

    liveSim.isSprinting = wantsSprint;

    let targetVx = 0;
    let targetVz = 0;
    const isCastingWindup = liveSim.castTimer > 0 && !liveSim.pendingCastReleased;

    if (liveSim.staggerTimer > 0) {
      targetVx = -Math.sin(liveSim.playerYaw) * 1.4;
      targetVz = -Math.cos(liveSim.playerYaw) * 1.4;
    } else if (liveSim.dodgeTimer > 0) {
      targetVx = liveSim.dodgeDirX * MOVEMENT_TUNING.dodgeSpeed;
      targetVz = liveSim.dodgeDirZ * MOVEMENT_TUNING.dodgeSpeed;
    } else if (liveSim.attackTimer > 0) {
      const spec = MELEE_COMBO_STEPS[liveSim.attackCombo % 3];
      const elapsed = liveSim.attackDuration - liveSim.attackTimer;
      const lungeFrac = elapsed < 0.16 ? 1.0 : 0.22;
      targetVx = Math.sin(liveSim.playerYaw) * spec.lungeSpeed * lungeFrac;
      targetVz = Math.cos(liveSim.playerYaw) * spec.lungeSpeed * lungeFrac;
    } else if (hasMove) {
      const camFwdX = -Math.sin(liveSim.cameraYaw);
      const camFwdZ = -Math.cos(liveSim.cameraYaw);
      const camRightX = Math.cos(liveSim.cameraYaw);
      const camRightZ = -Math.sin(liveSim.cameraYaw);

      let dirX = camFwdX * moveForward + camRightX * moveRight;
      let dirZ = camFwdZ * moveForward + camRightZ * moveRight;
      const len = Math.hypot(dirX, dirZ) || 1;
      dirX /= len;
      dirZ /= len;

      const slope = surfaceSlopeAt(liveSim.playerX, liveSim.playerZ);
      const slopeFactor =
        slope > MOVEMENT_TUNING.slopeSteepThreshold ? MOVEMENT_TUNING.slopeSpeedFactor : 1.0;
      const castSpeedMult = isCastingWindup ? 0.42 : 1.0;
      const baseSpeed = store.shieldActive
        ? MOVEMENT_TUNING.blockSpeed
        : wantsSprint
          ? MOVEMENT_TUNING.sprintSpeed
          : MOVEMENT_TUNING.walkSpeed;
      const speed = baseSpeed * slopeFactor * castSpeedMult;
      targetVx = dirX * speed;
      targetVz = dirZ * speed;
      if (!isCastingWindup) {
        targetPlayerYawRef.current = Math.atan2(dirX, dirZ);
      }
    }

    const prevYaw = liveSim.playerYaw;
    const turnRate =
      liveSim.attackTimer > 0 || liveSim.castTimer > 0 || store.shieldActive || liveSim.dodgeTimer > 0
        ? MOVEMENT_TUNING.turnRateCombat
        : MOVEMENT_TUNING.turnRateExplore;
    liveSim.playerYaw = stepAngleToward(liveSim.playerYaw, targetPlayerYawRef.current, turnRate, dt, 'damp');
    liveSim.yawRate = shortestAngleDiff(prevYaw, liveSim.playerYaw) / Math.max(dt, 1e-4);

    stepPlanarVelocity(
      liveSim.velX,
      liveSim.velZ,
      targetVx,
      targetVz,
      hasMove && liveSim.staggerTimer <= 0,
      liveSim.dodgeTimer > 0,
      liveSim.attackTimer > 0,
      dt,
      _velOut,
    );
    liveSim.velX = _velOut.vx;
    liveSim.velZ = _velOut.vz;

    const horizSpeed = Math.hypot(liveSim.velX, liveSim.velZ);
    liveSim.locomotionSpeed = horizSpeed;
    liveSim.strideBlend = Math.min(1.45, horizSpeed / MOVEMENT_TUNING.walkSpeed);
    liveSim.isMoving = horizSpeed > 0.35 || liveSim.dodgeTimer > 0;
    if (horizSpeed > 0.35) {
      liveSim.walkCycle += horizSpeed * dt * 1.48;
      liveSim.footstepAccum += horizSpeed * dt * 0.34;
      if (liveSim.footstepAccum >= 1) {
        liveSim.footstepAccum = 0;
        gameAudio.playFootstep(isWaterAt(liveSim.playerX, liveSim.playerZ));
      }
    }

    let vx = liveSim.velX;
    let vz = liveSim.velZ;

    // Apply Rapier velocity + downhill slope ground adherence + soft playable boundary
    const body = playerBodyRef.current;
    if (body) {
      const tr = body.translation();
      const curVel = body.linvel();
      const rad = Math.hypot(tr.x, tr.z);
      if (rad > PLAYABLE_LIMIT) {
        const pull = (rad - PLAYABLE_LIMIT) * 3.0;
        vx -= (tr.x / rad) * pull;
        vz -= (tr.z / rad) * pull;
      }

      const groundY = groundHeightAt(tr.x, tr.z);
      const feetY = tr.y - 0.9;
      let nextVy = curVel.y;
      if (feetY <= groundY + 0.16 && horizSpeed > 0.45 && curVel.y <= 0.25) {
        const slope = surfaceSlopeAt(tr.x, tr.z);
        const followVy = Math.max(
          MOVEMENT_TUNING.downhillFollowMaxVel,
          -slope * horizSpeed * 1.1 - 0.65,
        );
        nextVy = Math.min(curVel.y, followVy);
      }

      body.setLinvel({ x: vx, y: nextVy, z: vz }, true);

      if (feetY < groundY - 0.18) {
        body.setTranslation({ x: tr.x, y: groundY + 0.92, z: tr.z }, true);
      }

      liveSim.playerX = tr.x;
      liveSim.playerY = Math.max(groundY, tr.y - 0.9);
      liveSim.playerZ = tr.z;
    }

    // Count active combat actors early for camera framing & combat-idle readiness
    let combatEngageCount = 0;
    for (let i = 0; i < liveSim.enemies.length; i++) {
      const en = liveSim.enemies[i];
      if (en.dead) continue;
      if (
        en.aiState === 'CHASE' ||
        en.aiState === 'ATTACK' ||
        en.aiState === 'RECOVER' ||
        en.aiState === 'RETREAT'
      ) {
        combatEngageCount += 1;
      }
    }
    liveSim.isCombatAlert = combatEngageCount > 0 || liveSim.combatTailTimer > 0;
    liveSim.animState = resolveGandalfAnimState({
      isDead: store.hp <= 0,
      staggerTimer: liveSim.staggerTimer,
      dodgeTimer: liveSim.dodgeTimer,
      castTimer: liveSim.castTimer,
      attackTimer: liveSim.attackTimer,
      shieldActive: store.shieldActive,
      horizSpeed,
      isSprinting: wantsSprint,
      isCombatAlert: liveSim.isCombatAlert,
    });

    // Third-person smooth camera with multi-sample terrain + obstacle avoidance & deterministic trauma shake
    combatCamDistRef.current = THREE.MathUtils.damp(
      combatCamDistRef.current,
      combatEngageCount > 0 ? 0.58 : 0,
      3.5,
      dt,
    );
    const effectiveCamDist = liveSim.cameraDist + combatCamDistRef.current;

    const targetX = liveSim.playerX;
    const targetY = liveSim.playerY + 1.56;
    const targetZ = liveSim.playerZ;
    _camTarget.set(targetX, targetY, targetZ);

    const horizDist = effectiveCamDist * Math.cos(liveSim.cameraPitch);
    const vertDist = effectiveCamDist * Math.sin(liveSim.cameraPitch);
    const rawCamX = targetX + Math.sin(liveSim.cameraYaw) * horizDist;
    const rawCamZ = targetZ + Math.cos(liveSim.cameraYaw) * horizDist;
    const rawCamY = targetY + vertDist;

    clampCameraWithTerrainAndObstacles(
      targetX,
      targetY,
      targetZ,
      rawCamX,
      rawCamY,
      rawCamZ,
      _camClearOut,
    );
    const pullRate = _camClearOut.fraction < camPullRef.current ? 18 : 7.5;
    camPullRef.current = THREE.MathUtils.damp(camPullRef.current, _camClearOut.fraction, pullRate, dt);

    const desiredCamX = targetX + (rawCamX - targetX) * camPullRef.current;
    const desiredCamZ = targetZ + (rawCamZ - targetZ) * camPullRef.current;
    const desiredCamY = Math.max(_camClearOut.minCamY, targetY + vertDist * camPullRef.current);
    _camDesired.set(desiredCamX, desiredCamY, desiredCamZ);

    if (!camInitializedRef.current) {
      _camBasePos.copy(_camDesired);
      camInitializedRef.current = true;
    } else {
      const camAlpha = 1 - Math.exp(-13 * dt);
      _camBasePos.lerp(_camDesired, camAlpha);
    }

    camera.position.copy(_camBasePos);
    liveSim.cameraTraumaTime += dt;
    if (liveSim.cameraTrauma > 0.01) {
      const traumaOffset = evaluateDampedTraumaOffset(liveSim.cameraTrauma, liveSim.cameraTraumaTime);
      camera.position.x += traumaOffset.x;
      camera.position.y += traumaOffset.y;
    }
    camera.lookAt(_camTarget);

    // Location Discovery & Chapter Zone Triggers
    const px = liveSim.playerX;
    const pz = liveSim.playerZ;
    let regionName = 'Údolí pod Mlžnými horami';
    for (const loc of LANDMARKS) {
      const d = Math.hypot(px - loc.x, pz - loc.z);
      if (d < loc.radius) {
        regionName = loc.name;
        if (!store.discoveredLocations.includes(loc.id)) {
          store.discoverLocation(loc.id, loc.name, loc.xpReward);
        }
      }
    }
    if (Math.hypot(px - QUARRY_POS.x, pz - QUARRY_POS.z) < 12) {
      regionName = 'Západní lom';
    }

    if (store.mainStep === 'ch3_enter_mines' && Math.hypot(px - CAVE_POS.x, pz - CAVE_POS.z) < 10.5) {
      useGameStore.setState({ mainStep: 'ch3_solve_stones' });
      store.notify(
        'Staré trpasličí štoly',
        'Rozsviť hůl [L] a aktivuj kamenné znaky: Kladivo → Hora → Pochodeň',
        3600,
      );
    } else if (
      store.mainStep === 'ch5_infiltrate_fortress' &&
      Math.hypot(px - WATCHTOWER_POS.x, pz - WATCHTOWER_POS.z) < 15.5
    ) {
      useGameStore.setState({ mainStep: 'ch5_disable_beacons' });
      store.notify(
        'Horská pevnost na dohled',
        'Vyřaď alespoň dva signální ohně [F / E] a zachraň zajatce!',
        3800,
      );
    }

    // Intelligent Enemy AI & Grakh 3-Phase Boss Loop
    let activeAttackers = 0;
    let activeCombatCount = 0;
    let suspiciousCount = 0;
    let hasBossNearby = false;

    for (const e of liveSim.enemies) {
      if (e.dead) continue;
      if (e.isWindingUp) activeAttackers += 1;
      if (e.aiState === 'CHASE' || e.aiState === 'ATTACK' || e.aiState === 'RECOVER' || e.aiState === 'RETREAT') {
        activeCombatCount += 1;
      } else if (e.aiState === 'SUSPICIOUS' || e.aiState === 'INVESTIGATE') {
        suspiciousCount += 1;
      }
    }

    if (activeCombatCount > 0) {
      liveSim.combatTailTimer = Math.max(liveSim.combatTailTimer, 3.0);
    }

    let bossHud: { name: string; hp: number; maxHp: number; phase: 1 | 2 | 3 } | null = null;
    const playerMakingNoise = liveSim.playerNoiseTimer > 0 && store.unlockedSkills.includes('silent_cloak') ? false : liveSim.playerNoiseTimer > 0;
    const hasStealthReduction =
      store.flags.dwarfShortcut || store.flags.approachChosen === 'tunnel' || store.flags.approachChosen === 'ledge';

    for (let i = 0; i < liveSim.enemies.length; i++) {
      const e = liveSim.enemies[i];
      if (e.dead) {
        if (e.deathTimer > 0) e.deathTimer = Math.max(0, e.deathTimer - dt);
        continue;
      }

      if (e.hitFlashTimer > 0) e.hitFlashTimer = Math.max(0, e.hitFlashTimer - dt);
      if (e.stunTimer > 0) e.stunTimer = Math.max(0, e.stunTimer - dt);
      if (e.cooldownTimer > 0) e.cooldownTimer = Math.max(0, e.cooldownTimer - dt);
      if (e.attackSwingTimer > 0) {
        e.attackSwingTimer = Math.max(0, e.attackSwingTimer - dt);
        if (e.attackSwingTimer <= 0 && !e.isWindingUp) {
          e.attackPhase = 'none';
        }
      }

      if (e.burnTimer > 0) {
        e.burnTimer = Math.max(0, e.burnTimer - dt);
        e.hp -= 6 * dt;
        if (Math.random() < 0.25) {
          spawnParticle(e.x, e.y + 1.0, e.z, 0, 1.8, 0, 0.35, 0.09, 1.0, 0.5, 0.1);
        }
        if (e.hp <= 0) {
          e.hp = 0;
          e.dead = true;
          e.aiState = 'DEAD';
          e.isWindingUp = false;
          e.attackPhase = 'none';
          e.deathTimer = 0.45;
          gameAudio.playEnemyDefeat();
          store.onEnemyKilled(e.id, e.archetype, e.group);
          continue;
        }
      }

      const tpl = ENEMY_TEMPLATES[e.archetype];
      const dx = px - e.x;
      const dz = pz - e.z;
      const dist = Math.hypot(dx, dz);
      const distFromHome = Math.hypot(e.x - e.homeX, e.z - e.homeZ);
      const hasLos = dist > 26 ? false : hasLineOfSightXZ(e.x, e.z, px, pz);

      let bossSpeedMult = 1.0;
      let bossCdMult = 1.0;
      if (e.archetype === 'goblin_commander') {
        const bPhase = getGrakhBossPhase(e.hp / e.maxHp);
        if (bPhase >= 2 && liveSim.grakhPhaseAnnounced < 2) {
          liveSim.grakhPhaseAnnounced = 2;
          for (const add of liveSim.enemies) {
            if (add.group === 'reinforcement') {
              add.dead = false;
              add.deathTimer = 0;
              add.hp = add.maxHp;
              add.x = add.homeX;
              add.z = add.homeZ;
              add.y = groundHeightAt(add.homeX, add.homeZ);
              add.aiState = 'CHASE';
              add.alertLevel = 1;
            }
          }
          gameAudio.playEnemyAlert(true);
          store.notify('Grakh · Fáze II', 'Velitel povolal dva skřetí bojovníky ze záložní hlídky!', 3500);
        }
        if (bPhase === 3 && liveSim.grakhPhaseAnnounced < 3) {
          liveSim.grakhPhaseAnnounced = 3;
          gameAudio.playEnemyAlert(true);
          store.notify('Grakh · Fáze III', 'Grakh se v zuřivosti pokouší zapálit vrcholový oheň!', 3600);
        }
        if (bPhase === 3) {
          bossSpeedMult = 1.2;
          bossCdMult = 0.85;
        }
        if (dist < 25) {
          bossHud = { name: tpl.name, hp: Math.ceil(e.hp), maxHp: e.maxHp, phase: bPhase };
          if (hasLos || dist < 16) hasBossNearby = true;
        }
      }

      let allyAlerted = false;
      for (let j = 0; j < liveSim.enemies.length; j++) {
        if (i === j) continue;
        const ally = liveSim.enemies[j];
        if (ally.dead) continue;
        if (
          (ally.aiState === 'CHASE' || ally.aiState === 'ATTACK') &&
          Math.hypot(ally.x - e.x, ally.z - e.z) <= 13
        ) {
          allyAlerted = true;
          break;
        }
      }

      const perception = evaluateEnemyPerception({
        archetype: e.archetype,
        enemyX: e.x,
        enemyZ: e.z,
        enemyYaw: e.yaw,
        playerX: px,
        playerZ: pz,
        hasLos,
        playerMakingNoise,
        allyAlerted,
      });

      const stealthRangeMult =
        mods.stealthFactor * (e.group === 'watchtower' && hasStealthReduction ? 0.8 : 1.0);
      const effectivePerceived =
        perception.perceived && perception.distToPlayer <= tpl.detectRange * stealthRangeMult + 1.5;

      if (effectivePerceived) {
        const gainRate = perception.canSeePlayer ? (dist < 11 ? 3.2 : 1.7) : allyAlerted ? 2.5 : 1.3;
        e.alertLevel = Math.min(1, e.alertLevel + dt * gainRate);
        if (hasLos || perception.canHearPlayer || allyAlerted) {
          e.lastKnownX = px;
          e.lastKnownZ = pz;
          e.investigateTimer = 4.5;
        }
      } else {
        e.alertLevel = Math.max(0, e.alertLevel - dt * 0.45);
        if (e.aiState === 'INVESTIGATE' && e.investigateTimer > 0) {
          e.investigateTimer = Math.max(0, e.investigateTimer - dt);
        }
      }

      const prevAiState = e.aiState;
      const nextAiState = transitionEnemyAIState({
        archetype: e.archetype,
        currentState: e.aiState,
        dead: e.dead,
        distToPlayer: dist,
        distFromHome,
        hpRatio: e.hp / e.maxHp,
        hasLos,
        perceived: effectivePerceived,
        alertLevel: e.alertLevel,
        investigateTimer: e.investigateTimer,
        stunTimer: e.stunTimer,
        cooldownTimer: e.cooldownTimer,
        windupTimer: e.windupTimer,
        isWindingUp: e.isWindingUp,
        hasToken: activeAttackers < 3 && hasLos,
      });
      e.aiState = nextAiState;

      if (prevAiState !== nextAiState) {
        if (nextAiState === 'SUSPICIOUS') {
          gameAudio.playEnemyAlert(false);
        } else if (
          nextAiState === 'CHASE' &&
          (prevAiState === 'PATROL' || prevAiState === 'IDLE' || prevAiState === 'SUSPICIOUS')
        ) {
          e.alertLevel = 1;
          gameAudio.playEnemyAlert(true);
        }
      }

      let moveVx = 0;
      let moveVz = 0;
      let desiredYaw = e.yaw;
      const obRadius = e.archetype === 'goblin_commander' ? 0.72 : 0.52;

      if (e.stunTimer > 0) {
        e.isWindingUp = false;
        e.attackPhase = 'none';
      } else if (nextAiState === 'ATTACK') {
        if (!e.isWindingUp) {
          e.isWindingUp = true;
          e.attackPhase = 'windup';
          e.windupTimer = tpl.windupDuration;
          activeAttackers += 1;
        } else {
          e.windupTimer -= dt;
          if (e.windupTimer <= 0) {
            e.isWindingUp = false;
            e.attackPhase = 'swing';
            e.attackSwingTimer = 0.22;
            e.cooldownTimer = tpl.attackCooldown * bossCdMult;

            if (e.archetype === 'orc_archer') {
              if (hasLos) {
                const inv = dist > 0.01 ? 1 / dist : 1;
                const speed = 19;
                const slotIdx = liveSim.projectiles.findIndex((p) => !p.active);
                const nextArrow = {
                  id: liveSim.nextProjectileId++,
                  active: true,
                  x: e.x,
                  y: e.y + 1.25,
                  z: e.z,
                  vx: dx * inv * speed,
                  vy: ((liveSim.playerY + 1.0 - (e.y + 1.25)) / Math.max(1, dist)) * speed + 1.2,
                  vz: dz * inv * speed,
                  damage: tpl.attackDamage,
                  life: 2.2,
                };
                if (slotIdx >= 0) {
                  liveSim.projectiles[slotIdx] = nextArrow;
                } else if (liveSim.projectiles.length < ARROW_POOL_SIZE) {
                  liveSim.projectiles.push(nextArrow);
                } else {
                  liveSim.projectiles[0] = nextArrow;
                }
                gameAudio.playArrowShoot();
              }
            } else if (dist <= tpl.attackRange + 0.6 && hasLos) {
              const parrying = store.shieldActive && liveSim.shieldHoldTimer <= mods.parryWindowSec;
              const hitRes = parrying
                ? { finalDamage: 0, blocked: true, parried: true, dodged: false }
                : computeIncomingDamage(
                    tpl.attackDamage,
                    store.shieldActive,
                    liveSim.dodgeTimer > 0,
                    liveSim.shieldHoldTimer,
                  );
              if (hitRes.parried) {
                gameAudio.playShieldBlock(true);
                manaRef.current = Math.min(store.maxMana, manaRef.current + 12);
                const inv = dist > 0.01 ? 1 / dist : 1;
                damageEnemy(e, 10, -dx * inv * 8.5, -dz * inv * 8.5, 1.15, true);
                liveSim.hitstopTimer = 0.045;
                liveSim.cameraTrauma = Math.min(1, liveSim.cameraTrauma + 0.25);
                store.showCombatCallout('Odraženo!', 'parry', 1000);
              } else if (hitRes.blocked) {
                gameAudio.playShieldBlock(false);
                store.applyPlayerDamage(hitRes.finalDamage);
                store.showCombatCallout('Kryt štítem', 'block', 750);
              } else if (!hitRes.dodged) {
                const isHeavyHit = e.archetype === 'goblin_commander' || e.archetype === 'orc_warrior';
                gameAudio.playHit(isHeavyHit, false);
                liveSim.hurtFlashTimer = 0.22;
                if (isHeavyHit) {
                  liveSim.staggerTimer = 0.22;
                  liveSim.attackTimer = 0;
                  liveSim.attackBuffered = false;
                }
                liveSim.cameraTrauma = Math.min(1, liveSim.cameraTrauma + 0.35);
                store.applyPlayerDamage(hitRes.finalDamage);
              }
            }
          }
        }
        desiredYaw = Math.atan2(dx, dz);
      } else if (nextAiState === 'SUSPICIOUS') {
        desiredYaw = Math.atan2(e.lastKnownX - e.x, e.lastKnownZ - e.z);
        const steer = computeSteeredDirection(e.x, e.z, e.lastKnownX, e.lastKnownZ, obRadius, 1.5);
        moveVx = steer.x * tpl.moveSpeed * 0.28;
        moveVz = steer.z * tpl.moveSpeed * 0.28;
      } else if (nextAiState === 'INVESTIGATE') {
        const idx = e.lastKnownX - e.x;
        const idz = e.lastKnownZ - e.z;
        const idist = Math.hypot(idx, idz);
        if (idist > 0.8) {
          const steer = computeSteeredDirection(e.x, e.z, e.lastKnownX, e.lastKnownZ, obRadius, 1.8);
          moveVx = steer.x * tpl.moveSpeed * 0.65;
          moveVz = steer.z * tpl.moveSpeed * 0.65;
          desiredYaw = Math.atan2(steer.x, steer.z);
        } else {
          desiredYaw = e.yaw + Math.sin(elapsedRef.current * 2.2 + i) * dt * 1.8;
        }
      } else if (nextAiState === 'CHASE') {
        const steer = computeSteeredDirection(e.x, e.z, px, pz, obRadius, 1.8);
        moveVx = steer.x * tpl.moveSpeed * bossSpeedMult;
        moveVz = steer.z * tpl.moveSpeed * bossSpeedMult;
        desiredYaw = Math.atan2(dx, dz);
      } else if (nextAiState === 'RECOVER') {
        const inv = dist > 0.01 ? 1 / dist : 1;
        const side = i % 2 === 0 ? 1 : -1;
        const tangX = -dz * inv * side;
        const tangZ = dx * inv * side;
        const radialOffset = dist < tpl.preferredRange - 0.5 ? -0.35 : dist > tpl.preferredRange + 1.2 ? 0.35 : 0;
        const goalX = e.x + (tangX + dx * inv * radialOffset) * 2.0;
        const goalZ = e.z + (tangZ + dz * inv * radialOffset) * 2.0;
        const steer = computeSteeredDirection(e.x, e.z, goalX, goalZ, obRadius, 1.5);
        moveVx = steer.x * tpl.moveSpeed * 0.7;
        moveVz = steer.z * tpl.moveSpeed * 0.7;
        desiredYaw = Math.atan2(dx, dz);
      } else if (nextAiState === 'RETREAT') {
        const inv = dist > 0.01 ? 1 / dist : 1;
        const awayX = e.x - dx * inv * 4.0;
        const awayZ = e.z - dz * inv * 4.0;
        const steer = computeSteeredDirection(e.x, e.z, awayX, awayZ, obRadius, 1.7);
        moveVx = steer.x * tpl.moveSpeed * 0.88;
        moveVz = steer.z * tpl.moveSpeed * 0.88;
        desiredYaw = e.archetype === 'orc_archer' ? Math.atan2(dx, dz) : Math.atan2(steer.x, steer.z);
      } else if (nextAiState === 'PATROL') {
        e.isWindingUp = false;
        e.attackPhase = 'none';
        e.patrolPhase += dt * 0.65;
        const goalX = e.homeX + Math.cos(e.patrolPhase) * 2.8;
        const goalZ = e.homeZ + Math.sin(e.patrolPhase) * 2.8;
        const pdx = goalX - e.x;
        const pdz = goalZ - e.z;
        const pd = Math.hypot(pdx, pdz);
        if (pd > 0.25) {
          const spd = distFromHome > 10 ? tpl.moveSpeed * 0.88 : 1.45;
          const steer = computeSteeredDirection(e.x, e.z, goalX, goalZ, obRadius, 1.5);
          moveVx = steer.x * spd;
          moveVz = steer.z * spd;
          desiredYaw = Math.atan2(steer.x, steer.z);
        }
      }

      // Anchor horizontal locomotion during committed attack windup / swing
      if (e.attackPhase === 'windup' || e.attackSwingTimer > 0) {
        moveVx = 0;
        moveVz = 0;
      }

      // Smooth archetype-authentic enemy turning using tpl.turnSpeed
      e.yaw = stepAngleToward(e.yaw, desiredYaw, tpl.turnSpeed, dt, 'rate');

      const desiredSpd = Math.hypot(moveVx, moveVz);
      if (desiredSpd > 0.5) {
        const progressed = Math.hypot(e.x - e.lastProgressX, e.z - e.lastProgressZ);
        if (progressed < 0.08 * dt * 20) {
          e.stuckTimer += dt;
          if (e.stuckTimer > 0.35) {
            const side = e.stuckSide;
            const prevVx = moveVx;
            moveVx += -moveVz * 0.7 * side;
            moveVz += prevVx * 0.7 * side;
            if (e.stuckTimer > 1.0) {
              e.stuckSide = -e.stuckSide;
              e.stuckTimer = 0.2;
            }
          }
        } else {
          e.stuckTimer = 0;
          e.lastProgressX = e.x;
          e.lastProgressZ = e.z;
        }
      } else {
        e.stuckTimer = 0;
        e.lastProgressX = e.x;
        e.lastProgressZ = e.z;
      }

      let sepX = 0;
      let sepZ = 0;
      for (let j = 0; j < liveSim.enemies.length; j++) {
        if (i === j) continue;
        const other = liveSim.enemies[j];
        if (other.dead) continue;
        const sdx = e.x - other.x;
        const sdz = e.z - other.z;
        const sd = Math.hypot(sdx, sdz);
        if (sd > 0.001 && sd < 1.35) {
          const push = (1.35 - sd) * 4.8;
          sepX += (sdx / sd) * push;
          sepZ += (sdz / sd) * push;
        }
      }
      if (dist > 0.001 && dist < 1.08) {
        const pushP = (1.08 - dist) * 6.0;
        sepX -= (dx / dist) * pushP;
        sepZ -= (dz / dist) * pushP;
      }

      const prevEX = e.x;
      const prevEZ = e.z;
      e.vx = THREE.MathUtils.damp(e.vx, 0, 8, dt);
      e.vz = THREE.MathUtils.damp(e.vz, 0, 8, dt);
      const nextRawX = e.x + (moveVx + e.vx + sepX) * dt;
      const nextRawZ = e.z + (moveVz + e.vz + sepZ) * dt;
      const pushed = resolveObstaclePushOut(nextRawX, nextRawZ, obRadius);
      const radial = Math.hypot(pushed.x, pushed.z);
      if (radial > PLAYABLE_LIMIT - 2) {
        const s = (PLAYABLE_LIMIT - 2) / radial;
        e.x = pushed.x * s;
        e.z = pushed.z * s;
      } else {
        e.x = pushed.x;
        e.z = pushed.z;
      }
      e.y = groundHeightAt(e.x, e.z);
      // Sync stride to actual displacement so feet never slide against obstacles
      e.walkDist += Math.hypot(e.x - prevEX, e.z - prevEZ);
    }

    // Adaptive Music Context Synchronization (including Osada Líska & Staré štoly)
    const inVillageZone = Math.hypot(px - VILLAGE_POS.x, pz - VILLAGE_POS.z) < 20;
    const inCaveZone = Math.hypot(px - CAVE_POS.x, pz - CAVE_POS.z) < 13;
    const inForestZone =
      Math.hypot(px - PATROL_POS.x, pz - PATROL_POS.z) < 22 ||
      Math.hypot(px - FORD_POS.x, pz - FORD_POS.z) < 16 ||
      Math.hypot(px - CAMPSITE_POS.x, pz - CAMPSITE_POS.z) < 16;

    const nextMusicCtx = selectMusicContext({
      phase: store.phase,
      activeCombatCount,
      suspiciousCount,
      hasBossNearby,
      inForestZone,
      inVillageZone,
      inCaveZone,
      combatTailTimer: liveSim.combatTailTimer,
    });
    gameAudio.setMusicContext(nextMusicCtx);

    // Update Arrow Projectiles
    for (let i = 0; i < liveSim.projectiles.length; i++) {
      const pr = liveSim.projectiles[i];
      if (!pr.active) continue;
      pr.life -= dt;
      pr.vy -= 4.2 * dt;
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.z += pr.vz * dt;
      const pushedArrow = resolveObstaclePushOut(pr.x, pr.z, 0.15);
      const hitObstacle = Math.hypot(pushedArrow.x - pr.x, pushedArrow.z - pr.z) > 0.02;
      if (pr.life <= 0 || pr.y < groundHeightAt(pr.x, pr.z) || hitObstacle) {
        pr.active = false;
        continue;
      }
      if (Math.hypot(pr.x - px, pr.z - pz) < 0.85 && Math.abs(pr.y - (liveSim.playerY + 1.0)) < 1.1) {
        pr.active = false;
        const parrying = store.shieldActive && liveSim.shieldHoldTimer <= mods.parryWindowSec;
        const res = parrying
          ? { finalDamage: 0, blocked: true, parried: true, dodged: false }
          : computeIncomingDamage(
              pr.damage,
              store.shieldActive,
              liveSim.dodgeTimer > 0,
              liveSim.shieldHoldTimer,
            );
        if (res.parried) {
          gameAudio.playShieldBlock(true);
          manaRef.current = Math.min(store.maxMana, manaRef.current + 10);
          store.showCombatCallout('Šíp odražen!', 'parry', 900);
        } else if (res.blocked) {
          gameAudio.playShieldBlock(false);
          store.applyPlayerDamage(res.finalDamage);
        } else if (!res.dodged) {
          gameAudio.playHit(false);
          liveSim.hurtFlashTimer = 0.18;
          store.applyPlayerDamage(res.finalDamage);
        }
      }
    }

    // Update Instanced Arrow Meshes
    if (arrowMeshRef.current) {
      for (let i = 0; i < ARROW_POOL_SIZE; i++) {
        const pr = liveSim.projectiles[i];
        if (!pr || !pr.active) {
          _dummy.position.set(0, -100, 0);
          _dummy.scale.setScalar(0.001);
        } else {
          _dummy.position.set(pr.x, pr.y, pr.z);
          _dummy.lookAt(pr.x + pr.vx, pr.y + pr.vy, pr.z + pr.vz);
          _dummy.scale.set(1, 1, 1);
        }
        _dummy.updateMatrix();
        arrowMeshRef.current.setMatrixAt(i, _dummy.matrix);
      }
      arrowMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    // Ambient Woodland Fireflies / Mist Motes
    if (Math.random() < 0.35) {
      spawnParticle(
        px + (Math.random() - 0.5) * 24,
        liveSim.playerY + 0.6 + Math.random() * 2.8,
        pz + (Math.random() - 0.5) * 24,
        (Math.random() - 0.5) * 0.4,
        0.2 + Math.random() * 0.3,
        (Math.random() - 0.5) * 0.4,
        2.6,
        0.055,
        0.85,
        0.95,
        0.75,
      );
    }

    // Update Pooled Particle InstancedMesh (Zero GC)
    if (particleMeshRef.current) {
      for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
        const p = particles[i];
        if (p.active) {
          p.life -= dt;
          if (p.life <= 0) {
            p.active = false;
            _dummy.position.set(0, -100, 0);
            _dummy.scale.setScalar(0.001);
          } else {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.z += p.vz * dt;
            p.vx *= 0.96;
            p.vz *= 0.96;
            const alpha = p.life / p.maxLife;
            _dummy.position.set(p.x, p.y, p.z);
            _dummy.scale.setScalar(p.size * (0.4 + alpha * 0.6));
            _color.setRGB(p.r, p.g, p.b);
            particleMeshRef.current.setColorAt(i, _color);
          }
        } else {
          _dummy.position.set(0, -100, 0);
          _dummy.scale.setScalar(0.001);
        }
        _dummy.updateMatrix();
        particleMeshRef.current.setMatrixAt(i, _dummy.matrix);
      }
      particleMeshRef.current.instanceMatrix.needsUpdate = true;
      if (particleMeshRef.current.instanceColor) particleMeshRef.current.instanceColor.needsUpdate = true;
    }

    // Sync throttled HUD telemetry (~8 Hz)
    hudSyncTimer.current += dt;
    if (hudSyncTimer.current >= 0.12) {
      hudSyncTimer.current = 0;
      const clueRange = store.unlockedSkills.includes('keen_eye') ? 4.4 : 3.6;

      let interactPrompt: { label: string; key: string; targetId: string } | null = null;
      let bestObj: (typeof liveSim.storyInteractables)[number] | null = null;
      let bestObjDist = clueRange;
      for (const obj of liveSim.storyInteractables) {
        if (obj.done) continue;
        const d = Math.hypot(px - obj.x, pz - obj.z);
        if (d < bestObjDist) {
          bestObjDist = d;
          bestObj = obj;
        }
      }

      let bestNpc: NpcAnchor | null = null;
      let bestNpcDist = 4.2;
      for (const npc of getActiveNpcs()) {
        const d = Math.hypot(px - npc.x, pz - npc.z);
        if (d < bestNpcDist) {
          bestNpcDist = d;
          bestNpc = npc;
        }
      }

      if (bestObj && (!bestNpc || bestObjDist <= bestNpcDist + 0.3)) {
        interactPrompt = { label: bestObj.label, key: 'F', targetId: bestObj.id };
      } else if (bestNpc) {
        interactPrompt = { label: bestNpc.prompt, key: 'F', targetId: `npc_${bestNpc.id}` };
      } else {
        const collectRange = 3.6 + (mods.poulticeBonusHp > 0 ? 0.6 : 0);
        for (const c of liveSim.collectibles) {
          if (!c.collected && Math.hypot(px - c.x, pz - c.z) < collectRange) {
            const def = ITEM_CATALOG[c.itemId];
            interactPrompt = {
              label: `Sebrat: ${def ? def.name : c.itemId}`,
              key: 'F',
              targetId: c.id,
            };
            break;
          }
        }
      }

      // Reveal fog-of-war cells smoothly around Gandalf
      const fogRevealRadius = store.unlockedSkills.includes('keen_eye') ? 19 : 15;
      store.revealExplorationAt(px, pz, fogRevealRadius);

      // Compute smart objective position for compass (honors active tracked quest: main or side)
      const incompleteTargets = liveSim.storyInteractables
        .filter((o) => !o.done)
        .map((o) => ({ id: o.id, kind: o.kind, x: o.x, z: o.z }));
      const targetPos = resolveTrackedObjectivePos(
        store.trackedQuest,
        store.mainStep,
        store.sideQuests,
        incompleteTargets,
      );

      let objDist = 0;
      let objBearing = 0;
      if (targetPos) {
        const odx = targetPos.x - px;
        const odz = targetPos.z - pz;
        objDist = Math.round(Math.hypot(odx, odz));
        objBearing = (Math.atan2(odx, -odz) * 180) / Math.PI;
      }

      let waypointDist: number | null = null;
      let waypointBearing: number | null = null;
      if (store.customWaypoint) {
        const wdx = store.customWaypoint.x - px;
        const wdz = store.customWaypoint.z - pz;
        waypointDist = Math.round(Math.hypot(wdx, wdz));
        waypointBearing = (Math.atan2(wdx, -wdz) * 180) / Math.PI;
      }

      const camFwdX = -Math.sin(liveSim.cameraYaw);
      const camFwdZ = -Math.cos(liveSim.cameraYaw);
      const compassHeadingDeg = (Math.atan2(camFwdX, -camFwdZ) * 180) / Math.PI;

      const roundedMana = Math.round(manaRef.current);
      const roundedStamina = Math.round(staminaRef.current);
      lastSyncedManaRef.current = roundedMana;
      lastSyncedStaminaRef.current = roundedStamina;

      store.setHudTelemetry({
        compassHeadingDeg,
        objectiveBearingDeg: objBearing,
        objectiveDistance: objDist,
        waypointBearingDeg: waypointBearing,
        waypointDistance: waypointDist,
        currentRegionName: regionName,
        bossHud,
        interactPrompt,
        cooldowns: { ...cooldownsRef.current },
        mana: roundedMana,
        stamina: roundedStamina,
        elapsedSeconds: Math.round(elapsedRef.current),
      });
    }
  });

  const spawnY = groundHeightAt(SPAWN_POS.x, SPAWN_POS.z);

  return (
    <>
      <RigidBody
        ref={playerBodyRef}
        position={[SPAWN_POS.x, spawnY + 1.0, SPAWN_POS.z]}
        colliders={false}
        mass={1}
        type="dynamic"
        enabledRotations={[false, false, false]}
        friction={0}
        linearDamping={0.4}
      >
        <CapsuleCollider args={[0.45, 0.42]} />
      </RigidBody>

      {/* Pooled Particle InstancedMesh */}
      <instancedMesh
        ref={particleMeshRef}
        args={[undefined, undefined, PARTICLE_POOL_SIZE]}
        frustumCulled={false}
      >
        <octahedronGeometry args={[1, 0]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>

      {/* Pooled Orc Arrow Projectiles */}
      <instancedMesh
        ref={arrowMeshRef}
        args={[undefined, undefined, ARROW_POOL_SIZE]}
        frustumCulled={false}
      >
        <cylinderGeometry args={[0.025, 0.025, 0.85, 5]} />
        <meshStandardMaterial color="#78350f" emissive="#ef4444" emissiveIntensity={0.45} />
      </instancedMesh>
    </>
  );
}
