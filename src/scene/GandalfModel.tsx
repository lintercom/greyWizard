import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { liveSim, useGameStore } from '../game/store';
import { getSharedRadialShadowTexture } from './textures';
import { applyFacetVertexColors, makeDiamondBladeGeo, toFlatFaceted } from './lowPolyBuilders';
import { SPELL_CAST_TIMINGS, stepAngleToward } from '../game/gameplayFeelLogic';
import { clamp } from '../game/terrain';

export function GandalfModel() {
  const rootRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const upperTorsoRef = useRef<THREE.Group>(null);
  const headGroupRef = useRef<THREE.Group>(null);
  const hatGroupRef = useRef<THREE.Group>(null);
  const beardRef = useRef<THREE.Mesh>(null);
  const cloakGroupRef = useRef<THREE.Group>(null);
  const robeRef = useRef<THREE.Mesh>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const staffOrbRef = useRef<THREE.Mesh>(null);
  const staffLightRef = useRef<THREE.PointLight>(null);
  const shieldRef = useRef<THREE.Group>(null);
  const flashGroupRef = useRef<THREE.Group>(null);
  const flashRingRef = useRef<THREE.Mesh>(null);
  const flashRaysRef = useRef<THREE.Group>(null);
  const fireGroupRef = useRef<THREE.Group>(null);
  const fireOuterRef = useRef<THREE.Mesh>(null);
  const fireInnerRef = useRef<THREE.Mesh>(null);
  const shockGroupRef = useRef<THREE.Group>(null);
  const shockRingRef = useRef<THREE.Mesh>(null);
  const shockInnerRef = useRef<THREE.Mesh>(null);
  const swordGlowRef = useRef<THREE.Mesh>(null);
  const slashArcRef = useRef<THREE.Mesh>(null);

  const staffLightOn = useGameStore((s) => s.staffLightOn);
  const shieldActive = useGameStore((s) => s.shieldActive);
  const phase = useGameStore((s) => s.phase);
  const hasBrighterLight = useGameStore((s) => s.unlockedSkills.includes('brighter_light'));

  const shadowTex = useMemo(() => getSharedRadialShadowTexture(), []);

  const geos = useMemo(() => {
    // 1. Tall crooked pointed wizard hat with organic asymmetric brim wave
    const hatPts = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.47, 0.015),
      new THREE.Vector2(0.45, 0.048),
      new THREE.Vector2(0.21, 0.095),
      new THREE.Vector2(0.19, 0.27),
      new THREE.Vector2(0.135, 0.51),
      new THREE.Vector2(0.055, 0.72),
      new THREE.Vector2(0.0, 0.86),
    ];
    const rawHat = new THREE.LatheGeometry(hatPts, 9);
    const hPos = rawHat.attributes.position;
    for (let i = 0; i < hPos.count; i++) {
      const x = hPos.getX(i);
      const y = hPos.getY(i);
      const z = hPos.getZ(i);
      const r = Math.hypot(x, z);
      const ang = Math.atan2(z, x);
      if (r > 0.25 && y < 0.09) {
        // Dramatic low-poly brim dip in front and back
        hPos.setY(i, y + Math.sin(ang * 2 + 0.3) * 0.024);
      }
      if (y > 0.3) {
        const bend = ((y - 0.3) / 0.56) ** 1.85;
        hPos.setZ(i, z - bend * 0.19);
        hPos.setX(i, x + bend * 0.065);
      }
    }
    const hatGeo = applyFacetVertexColors(rawHat, 0x3b4452, 0x525d6d, 0x626f82, 0.03, 3);

    // 2. Gnarled low-poly twisted wizard staff shaft
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.82, 0),
      new THREE.Vector3(0.026, -0.24, 0.015),
      new THREE.Vector3(-0.028, 0.34, -0.02),
      new THREE.Vector3(0.02, 0.86, 0.025),
      new THREE.Vector3(-0.035, 1.18, 0.045),
    ]);
    const rawStaff = new THREE.TubeGeometry(curve, 12, 0.031, 6, false);
    const staffGeo = applyFacetVertexColors(rawStaff, 0x3d2819, 0x61422a, 0x704e33, 0.03, 9);

    // 3. Pleated faceted lower robe skirt with subtle vertical fold flutes
    const robePts = [
      new THREE.Vector2(0.39, 0.0),
      new THREE.Vector2(0.35, 0.26),
      new THREE.Vector2(0.27, 0.6),
      new THREE.Vector2(0.24, 0.88),
      new THREE.Vector2(0.2, 1.14),
    ];
    const rawRobe = new THREE.LatheGeometry(robePts, 10);
    const rPos = rawRobe.attributes.position;
    for (let i = 0; i < rPos.count; i++) {
      const x = rPos.getX(i);
      const y = rPos.getY(i);
      const z = rPos.getZ(i);
      const rad = Math.hypot(x, z);
      if (rad > 0.05) {
        const ang = Math.atan2(z, x);
        const pleat = 1 + Math.cos(ang * 5) * (0.065 * (1 - y / 1.25));
        rPos.setX(i, x * pleat);
        rPos.setZ(i, z * pleat);
      }
    }
    const robeGeo = applyFacetVertexColors(rawRobe, 0x39414e, 0x677283, 0x778292, 0.025, 12);

    // 4. Sculpted travel cloak draping from shoulders with subtle lower flare & pleat folds
    const rawCloak = new THREE.CylinderGeometry(0.22, 0.44, 1.16, 8, 3, true, Math.PI * 0.56, Math.PI * 0.88);
    const cPos = rawCloak.attributes.position;
    for (let i = 0; i < cPos.count; i++) {
      const x = cPos.getX(i);
      const y = cPos.getY(i);
      const z = cPos.getZ(i);
      const ang = Math.atan2(z, x);
      const fold = 1 + Math.sin(ang * 6) * 0.055 * (1 - (y + 0.58) / 1.16);
      cPos.setX(i, x * fold);
      cPos.setZ(i, z * fold);
    }
    rawCloak.translate(0, -0.58, 0);
    const cloakGeo = applyFacetVertexColors(rawCloak, 0x262d38, 0x455060, 0x546072, 0.025, 19);

    // 5. Chiseled wizard head (slightly elongated jaw silhouette)
    const rawHead = new THREE.IcosahedronGeometry(0.145, 1);
    const hdPos = rawHead.attributes.position;
    for (let i = 0; i < hdPos.count; i++) {
      const x = hdPos.getX(i);
      const y = hdPos.getY(i);
      const z = hdPos.getZ(i);
      if (y < -0.02) {
        hdPos.setX(i, x * 0.84);
        hdPos.setZ(i, z * 0.92);
      }
    }
    const headGeo = toFlatFaceted(rawHead);

    // 6. Sculpted triangular beard with flared edges
    const rawBeard = new THREE.ConeGeometry(0.12, 0.44, 5, 2);
    const bPos = rawBeard.attributes.position;
    for (let i = 0; i < bPos.count; i++) {
      bPos.setZ(i, bPos.getZ(i) * 0.58);
    }
    rawBeard.rotateX(Math.PI);
    const beardGeo = applyFacetVertexColors(rawBeard, 0xcbd2db, 0xf2f0ea, 0xffffff, 0.02, 21);

    // 7. Glamdring faceted diamond blade
    const bladeGeo = makeDiamondBladeGeo(0.92, 0.056, 0.024);

    return { hatGeo, staffGeo, robeGeo, cloakGeo, headGeo, beardGeo, bladeGeo };
  }, []);

  const materials = useMemo(() => {
    return {
      robeVertex: new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.88,
        metalness: 0.03,
        flatShading: true,
      }),
      robeTunic: new THREE.MeshStandardMaterial({
        color: '#636e7e',
        roughness: 0.88,
        metalness: 0.03,
        flatShading: true,
      }),
      cloakVertex: new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.92,
        metalness: 0.02,
        side: THREE.DoubleSide,
        flatShading: true,
      }),
      mantleGrey: new THREE.MeshStandardMaterial({
        color: '#3f4957',
        roughness: 0.9,
        metalness: 0.02,
        flatShading: true,
      }),
      hatVertex: new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.88,
        metalness: 0.03,
        flatShading: true,
      }),
      hatBand: new THREE.MeshStandardMaterial({
        color: '#9aa4b2',
        roughness: 0.55,
        metalness: 0.32,
        flatShading: true,
      }),
      skin: new THREE.MeshStandardMaterial({
        color: '#dbb79c',
        roughness: 0.78,
        metalness: 0.01,
        flatShading: true,
      }),
      beardVertex: new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.86,
        metalness: 0.01,
        flatShading: true,
      }),
      beardWhite: new THREE.MeshStandardMaterial({
        color: '#efece4',
        roughness: 0.86,
        metalness: 0.01,
        flatShading: true,
      }),
      hairSilver: new THREE.MeshStandardMaterial({
        color: '#d4dce4',
        roughness: 0.86,
        metalness: 0.02,
        flatShading: true,
      }),
      eyeDark: new THREE.MeshStandardMaterial({
        color: '#1f2937',
        roughness: 0.4,
        flatShading: true,
      }),
      leather: new THREE.MeshStandardMaterial({
        color: '#422e20',
        roughness: 0.82,
        metalness: 0.06,
        flatShading: true,
      }),
      pouchLeather: new THREE.MeshStandardMaterial({
        color: '#5a3f2b',
        roughness: 0.84,
        metalness: 0.04,
        flatShading: true,
      }),
      brass: new THREE.MeshStandardMaterial({
        color: '#d1a456',
        roughness: 0.38,
        metalness: 0.72,
        flatShading: true,
      }),
      staffVertex: new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.88,
        metalness: 0.03,
        flatShading: true,
      }),
      staffWood: new THREE.MeshStandardMaterial({
        color: '#523824',
        roughness: 0.88,
        metalness: 0.03,
        flatShading: true,
      }),
      steel: new THREE.MeshStandardMaterial({
        color: '#e2ebf5',
        roughness: 0.24,
        metalness: 0.85,
        flatShading: true,
      }),
      hiltBlue: new THREE.MeshStandardMaterial({
        color: '#253b59',
        roughness: 0.48,
        metalness: 0.35,
        flatShading: true,
      }),
      orbMat: new THREE.MeshStandardMaterial({
        color: '#e0f2fe',
        emissive: '#93c5fd',
        emissiveIntensity: 1.2,
        roughness: 0.16,
        metalness: 0.1,
        flatShading: true,
      }),
    };
  }, []);

  useEffect(() => {
    return () => {
      Object.values(geos).forEach((g) => g.dispose());
      Object.values(materials).forEach((m) => m.dispose());
    };
  }, [geos, materials]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const root = rootRef.current;
    if (!root) return;

    root.position.set(liveSim.playerX, liveSim.playerY, liveSim.playerZ);
    root.rotation.y = stepAngleToward(root.rotation.y, liveSim.playerYaw, 20, dt, 'damp');

    if (liveSim.hurtFlashTimer > 0) {
      materials.robeVertex.emissive.setHex(0x881b1b);
      materials.robeVertex.emissiveIntensity = 0.75;
      materials.robeTunic.emissive.setHex(0x881b1b);
      materials.robeTunic.emissiveIntensity = 0.75;
    } else {
      materials.robeVertex.emissive.setHex(0x000000);
      materials.robeVertex.emissiveIntensity = 0;
      materials.robeTunic.emissive.setHex(0x000000);
      materials.robeTunic.emissiveIntensity = 0;
    }

    const t = state.clock.elapsedTime;
    const anim = liveSim.animState;
    const walkSin = Math.sin(liveSim.walkCycle);
    const walkCos = Math.cos(liveSim.walkCycle);
    const strideBlend = clamp(liveSim.strideBlend, 0, 1.45);
    const strideAmp = anim === 'WALK' || anim === 'RUN' || anim === 'STRAFE' ? 0.36 * Math.min(1.42, strideBlend) : 0;
    const turnBank = clamp(-liveSim.yawRate * 0.042, -0.17, 0.17) * Math.min(1, strideBlend);

    // 4-phase spell cast normalized helpers
    const isCasting = liveSim.castTimer > 0 && liveSim.castKind !== null;
    const castSpellId = liveSim.castKind;
    let castPrepP = 0;
    let castRecP = 0;
    let inCastPrep = false;
    if (isCasting && castSpellId) {
      const timing = SPELL_CAST_TIMINGS[castSpellId];
      const elapsed = Math.max(0, liveSim.castDuration - liveSim.castTimer);
      inCastPrep = elapsed < timing.windup;
      if (inCastPrep) {
        castPrepP = clamp(elapsed / Math.max(0.01, timing.windup), 0, 1);
      } else {
        castRecP = clamp(
          (elapsed - timing.windup) / Math.max(0.01, liveSim.castDuration - timing.windup),
          0,
          1,
        );
      }
    }

    // Lower Body / Pelvis Root
    if (bodyRef.current) {
      if (phase === 'defeat' || anim === 'DEAD') {
        bodyRef.current.position.y = THREE.MathUtils.damp(bodyRef.current.position.y, -0.55, 10, dt);
        bodyRef.current.rotation.x = THREE.MathUtils.damp(bodyRef.current.rotation.x, Math.PI * 0.44, 10, dt);
        bodyRef.current.rotation.z = THREE.MathUtils.damp(bodyRef.current.rotation.z, 0, 10, dt);
      } else {
        let targetBob =
          anim === 'COMBAT_IDLE'
            ? -0.045 + Math.sin(t * 2.8) * 0.016
            : Math.sin(t * 1.65) * 0.013;
        if (strideAmp > 0.02) {
          targetBob = Math.abs(walkSin) * 0.052 * Math.min(1.2, strideBlend);
        }
        let targetPitch = strideAmp > 0.02 ? (anim === 'RUN' ? 0.14 : 0.055) : anim === 'COMBAT_IDLE' ? 0.08 : 0;
        let targetRoll = turnBank;

        if (anim === 'HIT_REACTION') {
          targetPitch = -0.26;
          targetBob = -0.03;
        } else if (anim === 'DODGE') {
          const dodgeP = 1 - liveSim.dodgeTimer / 0.36;
          targetPitch = 0.44 + Math.sin(dodgeP * Math.PI) * 0.24;
          targetBob = -0.14 * Math.sin(dodgeP * Math.PI);
        } else if (anim === 'ATTACK') {
          const p = 1 - liveSim.attackTimer / liveSim.attackDuration;
          targetPitch = 0.16 * Math.sin(p * Math.PI);
        } else if (anim === 'CAST' && castSpellId === 'shockwave') {
          targetBob = inCastPrep ? 0.07 * castPrepP : -0.06 * Math.sin(castRecP * Math.PI);
          targetPitch = inCastPrep ? -0.1 : 0.22 * (1 - castRecP);
        } else if (anim === 'BLOCK' || anim === 'STRAFE') {
          targetPitch = 0.08;
          targetBob = -0.03 + Math.abs(walkSin) * strideAmp * 0.04;
        }

        bodyRef.current.position.y = THREE.MathUtils.damp(bodyRef.current.position.y, targetBob, 16, dt);
        bodyRef.current.rotation.x = THREE.MathUtils.damp(bodyRef.current.rotation.x, targetPitch, 14, dt);
        bodyRef.current.rotation.z = THREE.MathUtils.damp(bodyRef.current.rotation.z, targetRoll, 12, dt);
      }
    }

    // Upper Torso Waist Twist & Combat Arch
    if (upperTorsoRef.current) {
      let torsoPitch = 0;
      let torsoTwist = -walkSin * 0.085 * Math.min(1.2, strideBlend);
      let torsoRoll = 0;

      if (anim === 'COMBAT_IDLE') {
        torsoPitch = 0.06;
        torsoTwist = -0.14 + Math.sin(t * 2.4) * 0.03;
      } else if (anim === 'HIT_REACTION') {
        torsoPitch = -0.16;
        torsoTwist = 0.22;
      } else if (anim === 'ATTACK') {
        const p = 1 - liveSim.attackTimer / liveSim.attackDuration;
        if (liveSim.attackCombo === 0) {
          // Anticipation coil -> cleave twist -> follow-through
          torsoTwist = p < 0.22 ? -0.36 * (p / 0.22) : -0.36 + clamp((p - 0.22) / 0.48, 0, 1) * 0.78;
          torsoPitch = Math.sin(p * Math.PI) * 0.12;
        } else if (liveSim.attackCombo === 1) {
          torsoTwist = p < 0.22 ? 0.34 * (p / 0.22) : 0.34 - clamp((p - 0.22) / 0.5, 0, 1) * 0.82;
          torsoPitch = Math.sin(p * Math.PI) * 0.1;
        } else {
          torsoPitch = p < 0.26 ? -0.2 * (p / 0.26) : -0.2 + clamp((p - 0.26) / 0.45, 0, 1) * 0.54;
        }
      } else if (anim === 'CAST' && castSpellId) {
        if (castSpellId === 'flash_of_light') {
          torsoPitch = inCastPrep ? -0.14 * castPrepP : -0.14 * (1 - castRecP);
        } else if (castSpellId === 'fire_spell') {
          torsoTwist = inCastPrep ? -0.3 * castPrepP : -0.3 + clamp(castRecP * 2.4, 0, 1) * 0.54;
          torsoPitch = inCastPrep ? -0.06 : 0.18 * (1 - castRecP * 0.7);
        } else if (castSpellId === 'shockwave') {
          torsoPitch = inCastPrep ? -0.16 * castPrepP : -0.16 + clamp(castRecP * 3.0, 0, 1) * 0.48;
        }
      } else if (anim === 'BLOCK' || anim === 'STRAFE') {
        torsoTwist = -0.18;
      }

      upperTorsoRef.current.rotation.x = THREE.MathUtils.damp(upperTorsoRef.current.rotation.x, torsoPitch, 15, dt);
      upperTorsoRef.current.rotation.y = THREE.MathUtils.damp(upperTorsoRef.current.rotation.y, torsoTwist, 16, dt);
      upperTorsoRef.current.rotation.z = THREE.MathUtils.damp(upperTorsoRef.current.rotation.z, torsoRoll, 14, dt);
    }

    // Head Gaze, Turn Look-Ahead, Casting Focus & Flinch
    if (headGroupRef.current) {
      let headPitch = Math.sin(t * 1.4) * 0.025;
      let headYaw = clamp(liveSim.yawRate * 0.04, -0.22, 0.22);
      if (anim === 'IDLE') {
        headYaw += Math.sin(t * 0.65) * 0.085;
      } else if (anim === 'COMBAT_IDLE') {
        headPitch = -0.04;
        headYaw += 0.1;
      } else if (anim === 'HIT_REACTION') {
        headPitch = -0.28;
      } else if (anim === 'CAST' && castSpellId === 'flash_of_light') {
        headPitch = inCastPrep ? -0.22 * castPrepP : -0.1 * (1 - castRecP);
      } else if (anim === 'CAST' && castSpellId === 'shockwave') {
        headPitch = inCastPrep ? -0.16 * castPrepP : 0.18 * (1 - castRecP);
      }
      headGroupRef.current.rotation.x = THREE.MathUtils.damp(headGroupRef.current.rotation.x, headPitch, 12, dt);
      headGroupRef.current.rotation.y = THREE.MathUtils.damp(headGroupRef.current.rotation.y, headYaw, 12, dt);
    }

    // Subtle Secondary Inertia for Hat & Beard
    if (hatGroupRef.current) {
      const hatBob = -0.08 + Math.abs(walkSin) * strideAmp * 0.035 + (anim === 'DODGE' ? -0.08 : 0);
      hatGroupRef.current.rotation.x = THREE.MathUtils.damp(hatGroupRef.current.rotation.x, hatBob, 10, dt);
      hatGroupRef.current.rotation.z = THREE.MathUtils.damp(
        hatGroupRef.current.rotation.z,
        0.03 - turnBank * 0.35,
        10,
        dt,
      );
    }
    if (beardRef.current) {
      const beardSwing =
        -0.14 - strideAmp * 0.12 - (anim === 'DODGE' ? 0.22 : 0) + Math.sin(t * 2.9) * 0.025;
      beardRef.current.rotation.x = THREE.MathUtils.damp(beardRef.current.rotation.x, beardSwing, 10, dt);
    }

    // Legs with natural lift & bounce damping
    if (leftLegRef.current && rightLegRef.current) {
      const legAmp = phase === 'defeat' || anim === 'DEAD' ? 0 : strideAmp;
      leftLegRef.current.rotation.x = THREE.MathUtils.damp(leftLegRef.current.rotation.x, walkSin * legAmp, 16, dt);
      rightLegRef.current.rotation.x = THREE.MathUtils.damp(rightLegRef.current.rotation.x, -walkSin * legAmp, 16, dt);
      leftLegRef.current.position.y = THREE.MathUtils.damp(
        leftLegRef.current.position.y,
        0.36 + Math.max(0, walkSin) * legAmp * 0.09,
        16,
        dt,
      );
      rightLegRef.current.position.y = THREE.MathUtils.damp(
        rightLegRef.current.position.y,
        0.36 + Math.max(0, -walkSin) * legAmp * 0.09,
        16,
        dt,
      );
    }

    if (robeRef.current) {
      const targetRobePitch =
        anim === 'DODGE' ? -0.14 : strideAmp > 0.02 ? (anim === 'RUN' ? -0.08 : -0.035) : 0;
      robeRef.current.rotation.x = THREE.MathUtils.damp(robeRef.current.rotation.x, targetRobePitch, 10, dt);
    }

    if (cloakGroupRef.current) {
      const speedTrail = clamp(liveSim.locomotionSpeed / 9.8, 0, 1.15);
      const targetCloakTilt =
        anim === 'DODGE'
          ? 0.58
          : 0.045 + speedTrail * 0.34 + (anim === 'CAST' ? 0.14 : 0);
      const windFlutter = Math.sin(t * 2.8) * (0.028 + speedTrail * 0.022);
      cloakGroupRef.current.rotation.x = THREE.MathUtils.damp(
        cloakGroupRef.current.rotation.x,
        targetCloakTilt + windFlutter,
        9,
        dt,
      );
      // Secondary lateral cloth lag on turns
      cloakGroupRef.current.rotation.z = THREE.MathUtils.damp(
        cloakGroupRef.current.rotation.z,
        clamp(liveSim.yawRate * 0.065, -0.22, 0.22),
        9,
        dt,
      );
    }

    // Left Arm (Gnarled Staff)
    if (leftArmRef.current) {
      let targetX = -0.16 - walkCos * strideAmp * 0.45;
      let targetY = 0;
      let targetZ = 0.14;
      if (anim === 'HIT_REACTION') {
        targetX = 0.28;
        targetZ = 0.38;
      } else if (anim === 'CAST' && castSpellId) {
        if (castSpellId === 'shockwave') {
          if (inCastPrep) {
            targetX = -0.4 - castPrepP * 1.88;
            targetZ = 0.08;
          } else {
            const slamT = clamp(castRecP * 3.2, 0, 1);
            const liftBack = clamp((castRecP - 0.45) / 0.55, 0, 1);
            targetX = -2.28 + slamT * 2.52 - liftBack * 0.42;
            targetZ = 0.12;
          }
        } else if (castSpellId === 'fire_spell') {
          if (inCastPrep) {
            targetX = -0.55 - castPrepP * 0.4;
            targetY = 0.25 * castPrepP;
            targetZ = 0.22;
          } else {
            const thrustT = clamp(castRecP * 2.6, 0, 1);
            targetX = -0.95 - thrustT * 0.55;
            targetY = 0.25 - thrustT * 0.35;
            targetZ = -0.12;
          }
        } else {
          // flash_of_light
          targetX = inCastPrep ? -0.45 - castPrepP * 1.52 : -1.97 + castRecP * 0.42;
          targetZ = 0.2;
        }
      } else if (anim === 'ATTACK') {
        const p = 1 - liveSim.attackTimer / liveSim.attackDuration;
        if (liveSim.attackCombo === 1) {
          const swingP = p < 0.2 ? 0 : clamp((p - 0.2) / 0.55, 0, 1);
          targetX = -1.08;
          targetY = 1.0 - swingP * 2.15;
          targetZ = 0.44;
        } else if (liveSim.attackCombo === 2) {
          const plungeP = p < 0.24 ? 0 : clamp((p - 0.24) / 0.52, 0, 1);
          targetX = -1.8 + plungeP * 2.25;
          targetY = -0.25;
          targetZ = -0.15;
        } else {
          targetX = -0.35;
          targetZ = 0.26;
        }
      } else if (anim === 'BLOCK' || anim === 'STRAFE') {
        targetX = -0.94;
        targetZ = -0.28;
      } else if (anim === 'COMBAT_IDLE') {
        targetX = -0.44 + Math.sin(t * 2.8) * 0.04;
        targetZ = 0.2;
      }
      leftArmRef.current.rotation.x = THREE.MathUtils.damp(leftArmRef.current.rotation.x, targetX, 18, dt);
      leftArmRef.current.rotation.y = THREE.MathUtils.damp(leftArmRef.current.rotation.y, targetY, 18, dt);
      leftArmRef.current.rotation.z = THREE.MathUtils.damp(leftArmRef.current.rotation.z, targetZ, 18, dt);
    }

    // Right Arm (Glamdring Sword)
    if (rightArmRef.current) {
      if (anim === 'ATTACK') {
        const p = 1 - liveSim.attackTimer / liveSim.attackDuration;
        if (liveSim.attackCombo === 0) {
          const wind = clamp(p / 0.22, 0, 1);
          const slash = p < 0.22 ? 0 : clamp((p - 0.22) / 0.48, 0, 1);
          rightArmRef.current.rotation.x = -0.45 - wind * 1.12 + slash * 2.32;
          rightArmRef.current.rotation.y = 0.34 - slash * 0.32;
          rightArmRef.current.rotation.z = -0.56 + slash * 0.78;
        } else if (liveSim.attackCombo === 1) {
          const sweep = p < 0.2 ? 0 : clamp((p - 0.2) / 0.55, 0, 1);
          rightArmRef.current.rotation.x = -0.68;
          rightArmRef.current.rotation.y = -1.05 + sweep * 2.18;
          rightArmRef.current.rotation.z = -0.55;
        } else {
          const wind = clamp(p / 0.24, 0, 1);
          const cleave = p < 0.24 ? 0 : clamp((p - 0.24) / 0.48, 0, 1);
          rightArmRef.current.rotation.x = -0.6 - wind * 1.42 + cleave * 2.68;
          rightArmRef.current.rotation.y = 0.06;
          rightArmRef.current.rotation.z = -0.16;
        }
      } else if (anim === 'HIT_REACTION') {
        rightArmRef.current.rotation.x = THREE.MathUtils.damp(rightArmRef.current.rotation.x, 0.42, 14, dt);
        rightArmRef.current.rotation.y = THREE.MathUtils.damp(rightArmRef.current.rotation.y, -0.35, 14, dt);
        rightArmRef.current.rotation.z = THREE.MathUtils.damp(rightArmRef.current.rotation.z, -0.45, 14, dt);
      } else if (anim === 'CAST') {
        const targetRX = castSpellId === 'shockwave' && inCastPrep ? -1.45 : -0.48;
        rightArmRef.current.rotation.x = THREE.MathUtils.damp(rightArmRef.current.rotation.x, targetRX, 14, dt);
        rightArmRef.current.rotation.y = THREE.MathUtils.damp(rightArmRef.current.rotation.y, 0.22, 14, dt);
        rightArmRef.current.rotation.z = THREE.MathUtils.damp(rightArmRef.current.rotation.z, -0.28, 14, dt);
      } else if (anim === 'BLOCK' || anim === 'STRAFE') {
        rightArmRef.current.rotation.x = THREE.MathUtils.damp(rightArmRef.current.rotation.x, -0.78, 14, dt);
        rightArmRef.current.rotation.y = THREE.MathUtils.damp(rightArmRef.current.rotation.y, 0.55, 14, dt);
        rightArmRef.current.rotation.z = THREE.MathUtils.damp(rightArmRef.current.rotation.z, 0.24, 14, dt);
      } else if (anim === 'COMBAT_IDLE') {
        rightArmRef.current.rotation.x = THREE.MathUtils.damp(
          rightArmRef.current.rotation.x,
          -0.36 + Math.sin(t * 2.8) * 0.04,
          12,
          dt,
        );
        rightArmRef.current.rotation.y = THREE.MathUtils.damp(rightArmRef.current.rotation.y, 0.24, 12, dt);
        rightArmRef.current.rotation.z = THREE.MathUtils.damp(rightArmRef.current.rotation.z, -0.32, 12, dt);
      } else {
        rightArmRef.current.rotation.x = THREE.MathUtils.damp(
          rightArmRef.current.rotation.x,
          0.1 + walkCos * strideAmp * 0.55,
          12,
          dt,
        );
        rightArmRef.current.rotation.y = THREE.MathUtils.damp(rightArmRef.current.rotation.y, 0.15, 12, dt);
        rightArmRef.current.rotation.z = THREE.MathUtils.damp(rightArmRef.current.rotation.z, -0.22, 12, dt);
      }
    }

    if (swordGlowRef.current) {
      const elapsed = liveSim.attackDuration - liveSim.attackTimer;
      swordGlowRef.current.visible = liveSim.attackTimer > 0 && elapsed >= 0.05 && elapsed <= 0.3;
    }

    if (slashArcRef.current) {
      const elapsed = liveSim.attackDuration - liveSim.attackTimer;
      const inArc = liveSim.attackTimer > 0 && elapsed >= 0.06 && elapsed <= liveSim.attackDuration * 0.78;
      slashArcRef.current.visible = inArc;
      if (inArc) {
        const p = elapsed / liveSim.attackDuration;
        const arcMat = slashArcRef.current.material as THREE.MeshBasicMaterial;
        arcMat.color.setHex(liveSim.attackCombo === 1 ? 0xfde68a : liveSim.attackCombo === 2 ? 0xe0f2fe : 0xbae6fd);
        arcMat.opacity = Math.max(0.15, 0.72 * (1 - p * 0.75));
        slashArcRef.current.rotation.z =
          liveSim.attackCombo === 0
            ? -0.38
            : liveSim.attackCombo === 1
              ? 0.08
              : Math.PI / 2;
        slashArcRef.current.scale.setScalar(liveSim.attackCombo === 2 ? 1.18 : 1.0);
      }
    }

    const orbPower =
      liveSim.flashBurstTimer > 0
        ? 5.5
        : liveSim.fireBurstTimer > 0
          ? 4.0
          : liveSim.castTimer > 0
            ? 3.4
            : staffLightOn
              ? 2.9
              : 0.75;
    materials.orbMat.emissiveIntensity = orbPower;
    materials.orbMat.emissive.setHex(liveSim.fireBurstTimer > 0 ? 0xff8c2b : 0x93c5fd);

    if (staffLightRef.current) {
      const lightBoost = hasBrighterLight ? 1.38 : 1.0;
      const targetIntensity =
        liveSim.flashBurstTimer > 0
          ? 22
          : liveSim.fireBurstTimer > 0
            ? 14
            : staffLightOn
              ? 8.8 * lightBoost
              : 0.9;
      staffLightRef.current.intensity = THREE.MathUtils.damp(
        staffLightRef.current.intensity,
        targetIntensity,
        10,
        dt,
      );
      staffLightRef.current.color.setHex(
        liveSim.fireBurstTimer > 0 ? 0xff9138 : liveSim.torchLightTimer > 0 ? 0xfde68a : 0xdbeafe,
      );
    }

    if (staffOrbRef.current) {
      const s = 1 + Math.sin(t * 4) * 0.08 + (staffLightOn ? 0.25 : 0);
      staffOrbRef.current.scale.setScalar(s);
      staffOrbRef.current.rotation.y += dt * 1.6;
    }

    if (shieldRef.current) {
      shieldRef.current.visible = shieldActive;
      shieldRef.current.rotation.y += dt * 1.1;
      const isParryWindow = shieldActive && liveSim.shieldHoldTimer <= 0.28;
      shieldRef.current.scale.setScalar(isParryWindow ? 1.07 : 1.0);
    }

    if (flashGroupRef.current && flashRingRef.current && flashRaysRef.current) {
      if (liveSim.flashBurstTimer > 0) {
        flashGroupRef.current.visible = true;
        const p = 1 - liveSim.flashBurstTimer / 0.55;
        const r = 0.6 + p * 9.0;
        flashRingRef.current.scale.set(r, r, r);
        (flashRingRef.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.85 * (1 - p));
        flashRaysRef.current.scale.setScalar(0.8 + p * 3.8);
        flashRaysRef.current.rotation.y += dt * 3.2;
      } else {
        flashGroupRef.current.visible = false;
      }
    }

    if (fireGroupRef.current && fireOuterRef.current && fireInnerRef.current) {
      if (liveSim.fireBurstTimer > 0) {
        fireGroupRef.current.visible = true;
        const p = 1 - liveSim.fireBurstTimer / 0.48;
        fireOuterRef.current.scale.set(0.7 + p * 1.35, 0.7 + p * 1.35, 0.8 + p * 1.45);
        fireInnerRef.current.scale.set(0.6 + p * 1.15, 0.6 + p * 1.15, 0.75 + p * 1.35);
        (fireOuterRef.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.54 * (1 - p));
        (fireInnerRef.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.82 * (1 - p));
      } else {
        fireGroupRef.current.visible = false;
      }
    }

    if (shockGroupRef.current && shockRingRef.current && shockInnerRef.current) {
      if (liveSim.shockwaveTimer > 0) {
        shockGroupRef.current.visible = true;
        const p = 1 - liveSim.shockwaveTimer / 0.65;
        const r1 = 0.8 + p * 11.5;
        const r2 = 0.5 + p * 8.2;
        shockRingRef.current.scale.set(r1, r1, 1);
        shockInnerRef.current.scale.set(r2, r2, 1);
        (shockRingRef.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.88 * (1 - p));
        (shockInnerRef.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.65 * (1 - p));
      } else {
        shockGroupRef.current.visible = false;
      }
    }
  });

  return (
    <group ref={rootRef} name="gandalf-player">
      {/* Grounding Contact Shadow Disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} renderOrder={1}>
        <circleGeometry args={[0.76, 16]} />
        <meshBasicMaterial map={shadowTex} transparent depthWrite={false} opacity={0.78} />
      </mesh>

      <group ref={bodyRef}>
        {/* Boots with Ankle Cuffs & Faceted Toe Caps */}
        <group ref={leftLegRef} position={[-0.115, 0.36, 0.0]}>
          <mesh position={[0, -0.14, 0]} material={materials.leather} castShadow>
            <cylinderGeometry args={[0.072, 0.064, 0.36, 6]} />
          </mesh>
          <mesh position={[0, -0.3, 0.055]} material={materials.leather} castShadow>
            <boxGeometry args={[0.115, 0.1, 0.21]} />
          </mesh>
        </group>
        <group ref={rightLegRef} position={[0.115, 0.36, 0.0]}>
          <mesh position={[0, -0.14, 0]} material={materials.leather} castShadow>
            <cylinderGeometry args={[0.072, 0.064, 0.36, 6]} />
          </mesh>
          <mesh position={[0, -0.3, 0.055]} material={materials.leather} castShadow>
            <boxGeometry args={[0.115, 0.1, 0.21]} />
          </mesh>
        </group>

        {/* Pleated Faceted Grey Robe Skirt */}
        <mesh
          ref={robeRef}
          geometry={geos.robeGeo}
          position={[0, 0.14, 0]}
          material={materials.robeVertex}
          castShadow
          receiveShadow
        />

        {/* Weathered Leather Belt, Brass Buckle & Traveler Pouch */}
        <mesh position={[0, 0.96, 0]} material={materials.leather} castShadow>
          <cylinderGeometry args={[0.225, 0.235, 0.085, 9]} />
        </mesh>
        <mesh position={[0, 0.96, 0.225]} material={materials.brass}>
          <boxGeometry args={[0.095, 0.075, 0.032]} />
        </mesh>
        <mesh position={[-0.22, 0.87, 0.08]} rotation={[0.06, -0.25, 0.14]} material={materials.pouchLeather} castShadow>
          <boxGeometry args={[0.09, 0.14, 0.12]} />
        </mesh>

        {/* Upper Body Waist-Pivot Hierarchy (Torso, Head, Cloak, Staff Arm, Sword Arm) */}
        <group ref={upperTorsoRef} position={[0, 1.0, 0]}>
          {/* Upper Chest Tunic & Collar Lapels */}
          <mesh position={[0, 0.18, 0]} material={materials.robeTunic} castShadow>
            <cylinderGeometry args={[0.185, 0.22, 0.34, 8]} />
          </mesh>
          <mesh position={[0, 0.24, 0.13]} rotation={[0.14, 0, 0]} material={materials.hatBand}>
            <boxGeometry args={[0.14, 0.24, 0.08]} />
          </mesh>

          {/* Layered Shoulder Travel Mantle */}
          <mesh position={[0, 0.34, 0]} material={materials.mantleGrey} castShadow>
            <cylinderGeometry args={[0.2, 0.295, 0.21, 8]} />
          </mesh>

          {/* Flowing Faceted Travel Cloak */}
          <group ref={cloakGroupRef} position={[0, 0.38, -0.02]}>
            <mesh geometry={geos.cloakGeo} material={materials.cloakVertex} castShadow />
          </group>

          {/* Articulated Wizard Head / Neck Pivot */}
          <group ref={headGroupRef} position={[0, 0.48, 0.01]}>
            {/* Sculpted Wizard Head & Facial Features */}
            <mesh geometry={geos.headGeo} position={[0, 0.065, 0.01]} material={materials.skin} castShadow />

            {/* Nose Bridge */}
            <mesh position={[0, 0.05, 0.145]} rotation={[-0.18, 0, 0]} material={materials.skin}>
              <coneGeometry args={[0.028, 0.085, 4]} />
            </mesh>

            {/* Expressive Eyes & Silver Bushy Brows */}
            <mesh position={[-0.048, 0.075, 0.125]} material={materials.eyeDark}>
              <octahedronGeometry args={[0.015, 0]} />
            </mesh>
            <mesh position={[0.048, 0.075, 0.125]} material={materials.eyeDark}>
              <octahedronGeometry args={[0.015, 0]} />
            </mesh>
            <mesh position={[-0.052, 0.1, 0.128]} rotation={[0, 0, 0.16]} material={materials.beardWhite}>
              <boxGeometry args={[0.052, 0.018, 0.03]} />
            </mesh>
            <mesh position={[0.052, 0.1, 0.128]} rotation={[0, 0, -0.16]} material={materials.beardWhite}>
              <boxGeometry args={[0.052, 0.018, 0.03]} />
            </mesh>

            {/* Long Silver Hair Sweeping Over Shoulders */}
            <mesh position={[0, 0, -0.05]} rotation={[0.08, 0, 0]} material={materials.hairSilver} castShadow>
              <cylinderGeometry args={[0.148, 0.19, 0.3, 7, 1, false, Math.PI * 0.52, Math.PI * 0.96]} />
            </mesh>

            {/* Sweeping Mustache + Layered Angular Wizard Beard */}
            <mesh position={[-0.045, -0.005, 0.135]} rotation={[0.2, 0.2, -0.35]} material={materials.beardWhite}>
              <coneGeometry args={[0.036, 0.11, 4]} />
            </mesh>
            <mesh position={[0.045, -0.005, 0.135]} rotation={[0.2, -0.2, 0.35]} material={materials.beardWhite}>
              <coneGeometry args={[0.036, 0.11, 4]} />
            </mesh>
            <mesh
              ref={beardRef}
              geometry={geos.beardGeo}
              position={[0, -0.19, 0.105]}
              rotation={[-0.14, 0, 0]}
              material={materials.beardVertex}
              castShadow
            />

            {/* Iconic Crooked Pointed Wizard Hat + Silver Band + Clasp */}
            <group ref={hatGroupRef} position={[0, 0.125, 0]} rotation={[-0.08, 0, 0.03]}>
              <mesh geometry={geos.hatGeo} material={materials.hatVertex} castShadow />
              <mesh position={[0, 0.102, 0]} material={materials.hatBand}>
                <cylinderGeometry args={[0.21, 0.22, 0.046, 9]} />
              </mesh>
              <mesh position={[0, 0.102, 0.215]} material={materials.brass}>
                <octahedronGeometry args={[0.025, 0]} />
              </mesh>
            </group>
          </group>

          {/* Left Arm (Bell Sleeve, Hand & Gnarled Wizard Staff) */}
          <group ref={leftArmRef} position={[-0.245, 0.34, 0.03]}>
            <mesh position={[-0.04, -0.18, 0.05]} rotation={[0.22, 0, 0.12]} material={materials.robeTunic} castShadow>
              <cylinderGeometry args={[0.062, 0.088, 0.4, 6]} />
            </mesh>
            <mesh position={[-0.075, -0.37, 0.14]} material={materials.skin} castShadow>
              <dodecahedronGeometry args={[0.045, 0]} />
            </mesh>
            <group position={[-0.08, -0.34, 0.22]} rotation={[0.15, 0, 0]}>
              <mesh geometry={geos.staffGeo} material={materials.staffVertex} castShadow />
              {/* Carved 4-Prong Wooden Staff Crown Cradle */}
              {[0, 1, 2, 3].map((pIdx) => {
                const pa = (pIdx / 4) * Math.PI * 2 + 0.4;
                return (
                  <mesh
                    key={pIdx}
                    position={[-0.03 + Math.cos(pa) * 0.042, 1.21, 0.05 + Math.sin(pa) * 0.042]}
                    rotation={[Math.sin(pa) * 0.35, 0, -Math.cos(pa) * 0.35]}
                    material={materials.staffWood}
                  >
                    <coneGeometry args={[0.018, 0.15, 4]} />
                  </mesh>
                );
              })}
              {/* Luminous Faceted Staff Crystal */}
              <mesh ref={staffOrbRef} position={[-0.03, 1.26, 0.05]} material={materials.orbMat}>
                <octahedronGeometry args={[0.068, 0]} />
              </mesh>
              <pointLight
                ref={staffLightRef}
                position={[-0.03, 1.32, 0.1]}
                color="#dbeafe"
                intensity={0.9}
                distance={staffLightOn ? (hasBrighterLight ? 34 : 24) : 11}
                decay={1.65}
              />
            </group>
          </group>

          {/* Right Arm (Bell Sleeve, Hand & Glamdring Sword) */}
          <group ref={rightArmRef} position={[0.245, 0.34, 0.03]}>
            <mesh position={[0.04, -0.18, 0.05]} rotation={[0.22, 0, -0.12]} material={materials.robeTunic} castShadow>
              <cylinderGeometry args={[0.062, 0.088, 0.4, 6]} />
            </mesh>
            <mesh position={[0.075, -0.37, 0.12]} material={materials.skin} castShadow>
              <dodecahedronGeometry args={[0.045, 0]} />
            </mesh>
            <group position={[0.08, -0.38, 0.14]} rotation={[Math.PI * 0.36, 0.12, -0.22]}>
              {/* Ribbed Midnight-Blue Grip & Faceted Pommel */}
              <mesh position={[0, -0.1, 0]} material={materials.hiltBlue}>
                <cylinderGeometry args={[0.022, 0.026, 0.21, 6]} />
              </mesh>
              <mesh position={[0, -0.22, 0]} material={materials.steel}>
                <octahedronGeometry args={[0.038, 0]} />
              </mesh>
              {/* Swept Elven Crossguard */}
              <mesh position={[-0.065, 0.025, 0]} rotation={[0, 0, -0.32]} material={materials.steel}>
                <boxGeometry args={[0.13, 0.024, 0.038]} />
              </mesh>
              <mesh position={[0.065, 0.025, 0]} rotation={[0, 0, 0.32]} material={materials.steel}>
                <boxGeometry args={[0.13, 0.024, 0.038]} />
              </mesh>
              {/* Faceted Diamond-Section Glamdring Blade */}
              <mesh geometry={geos.bladeGeo} position={[0, 0.02, 0]} material={materials.steel} castShadow />
              <mesh ref={swordGlowRef} position={[0, 0.52, 0]} visible={false}>
                <octahedronGeometry args={[0.11, 0]} />
                <meshBasicMaterial color="#bae6fd" transparent opacity={0.55} depthWrite={false} />
              </mesh>
            </group>
          </group>
        </group>
      </group>

      {/* Low-Poly Weapon Slash Arc Trail */}
      <mesh ref={slashArcRef} position={[0, 1.12, 0.35]} rotation={[Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[1.05, 1.88, 10, 1, -Math.PI * 0.22, Math.PI * 0.78]} />
        <meshBasicMaterial
          color="#bae6fd"
          transparent
          opacity={0.68}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Low-Poly Geodesic Istari Shield */}
      <group ref={shieldRef} position={[0, 1.05, 0]} visible={false}>
        <mesh>
          <icosahedronGeometry args={[1.38, 1]} />
          <meshBasicMaterial color="#7dd3fc" transparent opacity={0.18} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        <mesh>
          <icosahedronGeometry args={[1.39, 1]} />
          <meshBasicMaterial color="#e0f2fe" wireframe transparent opacity={0.45} />
        </mesh>
      </group>

      {/* Flash of Light Low-Poly Burst Halo + Radial Star Shards */}
      <group ref={flashGroupRef} position={[0, 1.2, 0]} visible={false}>
        <mesh ref={flashRingRef} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.74, 1.0, 10]} />
          <meshBasicMaterial
            color="#fef3c7"
            transparent
            opacity={0.75}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
          />
        </mesh>
        <group ref={flashRaysRef}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
            const a = (i / 8) * Math.PI * 2;
            return (
              <mesh key={i} position={[Math.cos(a) * 0.42, 0.08, Math.sin(a) * 0.42]} rotation={[0, -a, Math.PI / 2]}>
                <coneGeometry args={[0.08, 0.95, 4]} />
                <meshBasicMaterial color="#fef08a" transparent opacity={0.76} blending={THREE.AdditiveBlending} />
              </mesh>
            );
          })}
        </group>
      </group>

      {/* Fire Spell Faceted Surge Cones + Forward Flame Shards */}
      <group ref={fireGroupRef} position={[0.12, 1.26, 2.3]} rotation={[-Math.PI / 2 + 0.08, 0, 0]} visible={false}>
        <mesh ref={fireOuterRef}>
          <coneGeometry args={[1.22, 4.3, 7, 2, true]} />
          <meshBasicMaterial
            color="#f97316"
            transparent
            opacity={0.44}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh ref={fireInnerRef} position={[0, -0.35, 0]}>
          <coneGeometry args={[0.68, 3.6, 6, 1, true]} />
          <meshBasicMaterial
            color="#fde68a"
            transparent
            opacity={0.76}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
          />
        </mesh>
        {[
          { x: -0.42, y: 0.5, z: 0.28, s: 0.24 },
          { x: 0.48, y: 0.75, z: -0.22, s: 0.2 },
          { x: 0.1, y: 1.35, z: 0.35, s: 0.26 },
          { x: -0.22, y: 1.55, z: -0.3, s: 0.18 },
        ].map((sh, sIdx) => (
          <mesh key={sIdx} position={[sh.x, sh.y, sh.z]} rotation={[0.25, sIdx, 0.15]} scale={[sh.s, sh.s * 2.2, sh.s]}>
            <octahedronGeometry args={[1, 0]} />
            <meshBasicMaterial color={sIdx % 2 === 0 ? '#fb923c' : '#fef08a'} transparent opacity={0.85} blending={THREE.AdditiveBlending} />
          </mesh>
        ))}
      </group>

      {/* Shockwave Low-Poly Concentric Rings */}
      <group ref={shockGroupRef} position={[0, 0.16, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <mesh ref={shockRingRef}>
          <ringGeometry args={[0.74, 1.0, 10]} />
          <meshBasicMaterial color="#e2e8f0" transparent opacity={0.82} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
        <mesh ref={shockInnerRef}>
          <ringGeometry args={[0.56, 0.72, 8]} />
          <meshBasicMaterial color="#93c5fd" transparent opacity={0.62} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}
