import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { EnemyRuntime, liveSim } from '../game/store';
import { getSharedRadialShadowTexture } from './textures';
import { toFlatFaceted } from './lowPolyBuilders';
import { stepAngleToward } from '../game/gameplayFeelLogic';

interface EnemyMeshProps {
  enemyIndex: number;
}

function makeGoblinScimitarGeo(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(0.055, 0.14);
  shape.lineTo(0.085, 0.42);
  shape.lineTo(0.035, 0.64);
  shape.lineTo(-0.04, 0.56);
  shape.lineTo(-0.02, 0.25);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.022, bevelEnabled: false, curveSegments: 1 });
  geo.translate(0, 0, -0.011);
  return toFlatFaceted(geo);
}

function makeOrcCleaverGeo(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.025, 0);
  shape.lineTo(0.04, 0);
  shape.lineTo(0.07, 0.28);
  shape.lineTo(0.14, 0.44);
  shape.lineTo(0.11, 0.66);
  shape.lineTo(0.01, 0.72);
  shape.lineTo(-0.035, 0.52);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.028, bevelEnabled: false, curveSegments: 1 });
  geo.translate(0, 0, -0.014);
  return toFlatFaceted(geo);
}

function makeWarAxeHeadGeo(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.05, -0.08);
  shape.lineTo(0.18, -0.2);
  shape.lineTo(0.27, -0.05);
  shape.lineTo(0.24, 0.14);
  shape.lineTo(0.14, 0.24);
  shape.lineTo(-0.05, 0.1);
  shape.lineTo(-0.16, 0.16);
  shape.lineTo(-0.19, 0.0);
  shape.lineTo(-0.14, -0.14);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.045, bevelEnabled: false, curveSegments: 1 });
  geo.translate(0, 0, -0.0225);
  return toFlatFaceted(geo);
}

function makeChiseledHeadGeo(): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(0.175, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    // Pronounced brow & jutting lower jaw
    const jawZ = y < -0.02 && z > 0 ? z * 1.25 : z;
    const narrowX = y < -0.04 ? x * 0.85 : x * 0.96;
    pos.setXYZ(i, narrowX, y * 1.04, jawZ);
  }
  return toFlatFaceted(geo);
}

// Shared low-poly faceted geometries across all enemy instances
const SHADOW_DISC_GEO = new THREE.CircleGeometry(0.7, 14);
const TELEGRAPH_RING_GEO = new THREE.RingGeometry(0.85, 1.06, 10);
const LEG_UPPER_GEO = toFlatFaceted(new THREE.CylinderGeometry(0.095, 0.072, 0.38, 6));
const BOOT_GEO = toFlatFaceted(new THREE.BoxGeometry(0.125, 0.11, 0.21));
const TORSO_GEO = toFlatFaceted(new THREE.CylinderGeometry(0.28, 0.19, 0.62, 7));
const LOINCLOTH_GEO = toFlatFaceted(new THREE.CylinderGeometry(0.2, 0.27, 0.26, 6));
const PAULDRON_GEO = toFlatFaceted(new THREE.DodecahedronGeometry(0.16, 0));
const SPIKE_GEO = toFlatFaceted(new THREE.ConeGeometry(0.04, 0.16, 4));
const HEAD_GEO = makeChiseledHeadGeo();
const EAR_GEO = toFlatFaceted(new THREE.ConeGeometry(0.052, 0.22, 4));
const TUSK_GEO = toFlatFaceted(new THREE.ConeGeometry(0.022, 0.085, 4));
const EYE_GEO = new THREE.OctahedronGeometry(0.026, 0);
const ARM_GEO = toFlatFaceted(new THREE.CylinderGeometry(0.072, 0.056, 0.42, 6));
const HAND_GEO = toFlatFaceted(new THREE.DodecahedronGeometry(0.055, 0));
const STUN_GEO = new THREE.TorusGeometry(0.24, 0.026, 5, 10);
const HP_BG_GEO = new THREE.PlaneGeometry(0.96, 0.11);
const HP_FILL_GEO = new THREE.PlaneGeometry(0.9, 0.07);

const SCIMITAR_GEO = makeGoblinScimitarGeo();
const CLEAVER_GEO = makeOrcCleaverGeo();
const WAR_AXE_HEAD_GEO = makeWarAxeHeadGeo();
const SHIELD_DISC_GEO = toFlatFaceted(new THREE.CylinderGeometry(0.28, 0.28, 0.045, 7));
const SHIELD_BOSS_GEO = toFlatFaceted(new THREE.OctahedronGeometry(0.085, 0));

const SHARED_HP_BG_MAT = new THREE.MeshBasicMaterial({ color: '#111827' });
const SHARED_STUN_MAT = new THREE.MeshBasicMaterial({ color: '#fef08a' });
const SHARED_BONE_MAT = new THREE.MeshStandardMaterial({ color: '#dfd9c7', roughness: 0.72, flatShading: true });
const SHARED_LEATHER_DARK_MAT = new THREE.MeshStandardMaterial({ color: '#33251b', roughness: 0.88, flatShading: true });
const SHARED_TELEGRAPH_MAT = new THREE.MeshBasicMaterial({
  color: '#ef4444',
  transparent: true,
  opacity: 0.78,
  side: THREE.DoubleSide,
  depthWrite: false,
});

export function EnemyActor({ enemyIndex }: EnemyMeshProps) {
  const groupRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const torsoRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const offhandArmRef = useRef<THREE.Group>(null);
  const weaponArmRef = useRef<THREE.Group>(null);
  const telegraphRingRef = useRef<THREE.Mesh>(null);
  const stunHaloRef = useRef<THREE.Mesh>(null);
  const alertGlyphRef = useRef<THREE.Mesh>(null);
  const hpFillRef = useRef<THREE.Mesh>(null);
  const hpBarGroupRef = useRef<THREE.Group>(null);
  const hitMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const prevWalkDistRef = useRef(0);

  const shadowTex = useMemo(() => getSharedRadialShadowTexture(), []);
  const enemy = liveSim.enemies[enemyIndex];
  const archetype = enemy.archetype;

  const palette = useMemo(() => {
    switch (archetype) {
      case 'goblin_scout':
        return { skin: '#587049', armor: '#48382b', trim: '#63513e', metal: '#848c96', scale: 0.78 };
      case 'orc_warrior':
        return { skin: '#4c4b40', armor: '#2c2826', trim: '#4b362b', metal: '#6a727d', scale: 1.08 };
      case 'orc_archer':
        return { skin: '#545f49', armor: '#2d3928', trim: '#534130', metal: '#786852', scale: 0.96 };
      case 'goblin_commander':
        return { skin: '#3c5136', armor: '#341a1a', trim: '#542020', metal: '#7b3030', scale: 1.38 };
    }
  }, [archetype]);

  const armorMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: palette.armor, roughness: 0.86, metalness: 0.1, flatShading: true }),
    [palette.armor],
  );
  const trimMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: palette.trim, roughness: 0.88, metalness: 0.05, flatShading: true }),
    [palette.trim],
  );
  const skinMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: palette.skin, roughness: 0.8, flatShading: true }),
    [palette.skin],
  );
  const metalMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: palette.metal, roughness: 0.4, metalness: 0.72, flatShading: true }),
    [palette.metal],
  );

  useEffect(() => {
    return () => {
      armorMat.dispose();
      trimMat.dispose();
      skinMat.dispose();
      metalMat.dispose();
    };
  }, [armorMat, trimMat, skinMat, metalMat]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const e: EnemyRuntime | undefined = liveSim.enemies[enemyIndex];
    const grp = groupRef.current;
    if (!e || !grp) return;

    if (e.dead && e.deathTimer <= 0) {
      grp.visible = false;
      return;
    }
    grp.visible = true;
    grp.position.set(e.x, e.y, e.z);
    grp.rotation.y = stepAngleToward(grp.rotation.y, e.yaw, 16, dt, 'damp');

    const t = state.clock.elapsedTime;
    const moveRate = Math.max(0, e.walkDist - prevWalkDistRef.current) / Math.max(dt, 1e-4);
    prevWalkDistRef.current = e.walkDist;
    const isStepping = !e.dead && moveRate > 0.28;
    const strideWave = Math.sin(e.walkDist * 2.45);
    const strideFactor = Math.min(1, moveRate / 3.2);

    if (bodyRef.current) {
      if (e.dead) {
        const fallT = 1 - Math.max(0, e.deathTimer / 0.45);
        bodyRef.current.rotation.x = fallT * (Math.PI * 0.48);
        bodyRef.current.position.y = -fallT * 0.35;
      } else {
        const hunch = archetype === 'goblin_scout' ? 0.2 : archetype === 'orc_archer' ? 0.1 : 0.06;
        const recoil = e.hitFlashTimer > 0 ? -0.24 : e.stunTimer > 0 ? -0.14 : 0;
        const attackLean =
          e.attackPhase === 'windup'
            ? -0.12
            : e.attackSwingTimer > 0
              ? 0.24
              : 0;
        bodyRef.current.rotation.x = THREE.MathUtils.damp(
          bodyRef.current.rotation.x,
          hunch + recoil + attackLean,
          14,
          dt,
        );
        const idleBob = Math.sin(t * (archetype === 'goblin_commander' ? 2.0 : 2.6) + enemyIndex) * 0.015;
        const targetBob = isStepping ? Math.abs(strideWave) * 0.055 * strideFactor : idleBob;
        bodyRef.current.position.y = THREE.MathUtils.damp(bodyRef.current.position.y, targetBob, 14, dt);
      }
    }

    if (torsoRef.current && !e.dead) {
      let torsoTwist = isStepping ? -strideWave * 0.08 * strideFactor : Math.sin(t * 1.9 + enemyIndex) * 0.04;
      let torsoPitch = 0;
      if (e.stunTimer > 0 || e.hitFlashTimer > 0) {
        torsoPitch = -0.18;
        torsoTwist = 0.22;
      } else if (e.attackPhase === 'windup' || e.isWindingUp) {
        torsoTwist = archetype === 'orc_archer' ? 0.34 : -0.34;
        torsoPitch = -0.08;
      } else if (e.attackSwingTimer > 0) {
        torsoTwist = archetype === 'orc_archer' ? 0.2 : 0.38;
        torsoPitch = 0.16;
      }
      torsoRef.current.rotation.y = THREE.MathUtils.damp(torsoRef.current.rotation.y, torsoTwist, 15, dt);
      torsoRef.current.rotation.x = THREE.MathUtils.damp(torsoRef.current.rotation.x, torsoPitch, 15, dt);
    }

    if (headRef.current && !e.dead) {
      let headPitch = Math.sin(t * 2.2 + enemyIndex) * 0.03;
      let headYaw = e.aiState === 'SUSPICIOUS' || e.aiState === 'INVESTIGATE' ? Math.sin(t * 2.6 + enemyIndex) * 0.28 : 0;
      if (e.hitFlashTimer > 0) {
        headPitch = -0.32;
      } else if (e.stunTimer > 0) {
        headPitch = 0.14;
        headYaw = Math.sin(t * 7.5) * 0.22;
      }
      headRef.current.rotation.x = THREE.MathUtils.damp(headRef.current.rotation.x, headPitch, 13, dt);
      headRef.current.rotation.y = THREE.MathUtils.damp(headRef.current.rotation.y, headYaw, 11, dt);
    }

    if (leftLegRef.current && rightLegRef.current) {
      const legAmp = isStepping ? 0.46 * strideFactor : 0;
      leftLegRef.current.rotation.x = THREE.MathUtils.damp(leftLegRef.current.rotation.x, strideWave * legAmp, 14, dt);
      rightLegRef.current.rotation.x = THREE.MathUtils.damp(rightLegRef.current.rotation.x, -strideWave * legAmp, 14, dt);
    }

    if (hitMatRef.current) {
      if (e.hitFlashTimer > 0) {
        hitMatRef.current.emissive.setHex(0xffffff);
        hitMatRef.current.emissiveIntensity = 1.4;
      } else if (e.burnTimer > 0) {
        hitMatRef.current.emissive.setHex(0xf97316);
        hitMatRef.current.emissiveIntensity = 0.65;
      } else {
        hitMatRef.current.emissive.setHex(0x000000);
        hitMatRef.current.emissiveIntensity = 0;
      }
    }

    if (offhandArmRef.current) {
      let offX = isStepping ? 0.1 + strideWave * 0.2 * strideFactor : 0.05;
      let offY = 0;
      let offZ = 0;
      if (e.stunTimer > 0) {
        offX = 0.28;
        offZ = 0.26;
      } else if (archetype === 'orc_archer' && (e.attackPhase === 'windup' || e.isWindingUp)) {
        // Brace bow forward during draw
        offX = -1.28;
        offY = 0.24;
      } else if (isArmored && (e.aiState === 'CHASE' || e.aiState === 'RECOVER' || e.attackPhase === 'windup')) {
        // Raise shield defensively in combat
        offX = -0.68;
        offY = 0.42;
      }
      offhandArmRef.current.rotation.x = THREE.MathUtils.damp(offhandArmRef.current.rotation.x, offX, 14, dt);
      offhandArmRef.current.rotation.y = THREE.MathUtils.damp(offhandArmRef.current.rotation.y, offY, 14, dt);
      offhandArmRef.current.rotation.z = THREE.MathUtils.damp(offhandArmRef.current.rotation.z, offZ, 14, dt);
    }

    if (weaponArmRef.current) {
      if (e.stunTimer > 0) {
        weaponArmRef.current.rotation.x = THREE.MathUtils.damp(weaponArmRef.current.rotation.x, 0.35, 12, dt);
        weaponArmRef.current.rotation.z = THREE.MathUtils.damp(weaponArmRef.current.rotation.z, 0.32, 12, dt);
      } else if (e.attackPhase === 'windup' || e.isWindingUp) {
        const targetWindup = archetype === 'orc_archer' ? -1.45 : -2.05;
        weaponArmRef.current.rotation.x = THREE.MathUtils.damp(weaponArmRef.current.rotation.x, targetWindup, 15, dt);
        weaponArmRef.current.rotation.z = THREE.MathUtils.damp(weaponArmRef.current.rotation.z, -0.18, 15, dt);
      } else if (e.attackSwingTimer > 0) {
        const targetSwing = archetype === 'orc_archer' ? -1.05 : 0.92;
        weaponArmRef.current.rotation.x = THREE.MathUtils.damp(weaponArmRef.current.rotation.x, targetSwing, 22, dt);
        weaponArmRef.current.rotation.z = THREE.MathUtils.damp(weaponArmRef.current.rotation.z, 0.14, 20, dt);
      } else {
        const armSwing = isStepping ? -strideWave * 0.26 * strideFactor : Math.sin(t * 2.2 + enemyIndex) * 0.04;
        weaponArmRef.current.rotation.x = THREE.MathUtils.damp(
          weaponArmRef.current.rotation.x,
          -0.2 + armSwing,
          10,
          dt,
        );
        weaponArmRef.current.rotation.z = THREE.MathUtils.damp(weaponArmRef.current.rotation.z, 0, 10, dt);
      }
    }

    if (telegraphRingRef.current) {
      telegraphRingRef.current.visible = !e.dead && e.isWindingUp;
      const pulse = 0.85 + Math.sin(state.clock.elapsedTime * 18) * 0.14;
      telegraphRingRef.current.scale.setScalar(pulse);
    }

    if (stunHaloRef.current) {
      stunHaloRef.current.visible = !e.dead && e.stunTimer > 0;
      stunHaloRef.current.rotation.z += dt * 4;
    }

    if (alertGlyphRef.current) {
      const showAlert =
        !e.dead &&
        e.stunTimer <= 0 &&
        (e.isWindingUp || e.aiState === 'SUSPICIOUS' || e.aiState === 'INVESTIGATE');
      alertGlyphRef.current.visible = showAlert;
      if (showAlert) {
        alertGlyphRef.current.rotation.y += dt * 3.2;
        const gMat = alertGlyphRef.current.material as THREE.MeshBasicMaterial;
        gMat.color.setHex(e.isWindingUp ? 0xef4444 : 0xfbbf24);
        const s = e.isWindingUp ? 1.15 + Math.sin(state.clock.elapsedTime * 16) * 0.2 : 0.85;
        alertGlyphRef.current.scale.setScalar(s);
      }
    }

    if (hpBarGroupRef.current && hpFillRef.current) {
      const showHp = !e.dead && (e.hp < e.maxHp || e.aiState === 'CHASE' || e.aiState === 'ATTACK');
      hpBarGroupRef.current.visible = showHp;
      if (showHp) {
        hpBarGroupRef.current.lookAt(state.camera.position);
        const ratio = Math.max(0.02, e.hp / e.maxHp);
        hpFillRef.current.scale.x = ratio;
        hpFillRef.current.position.x = -(1 - ratio) * 0.45;
      }
    }
  });

  const isArmored = archetype === 'orc_warrior' || archetype === 'goblin_commander';

  return (
    <group ref={groupRef} scale={[palette.scale, palette.scale, palette.scale]}>
      {/* Grounding contact shadow */}
      <mesh geometry={SHADOW_DISC_GEO} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <meshBasicMaterial map={shadowTex} transparent depthWrite={false} opacity={0.72} />
      </mesh>

      {/* Attack Windup Telegraph Ring */}
      <mesh
        ref={telegraphRingRef}
        geometry={TELEGRAPH_RING_GEO}
        material={SHARED_TELEGRAPH_MAT}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.05, 0]}
        visible={false}
      />

      <group ref={bodyRef}>
        {/* Articulated Legs with Boots */}
        <group ref={leftLegRef} position={[-0.14, 0.48, 0]}>
          <mesh geometry={LEG_UPPER_GEO} material={armorMat} position={[0, -0.18, 0]} castShadow />
          <mesh geometry={BOOT_GEO} material={SHARED_LEATHER_DARK_MAT} position={[0, -0.4, 0.04]} castShadow />
        </group>
        <group ref={rightLegRef} position={[0.14, 0.48, 0]}>
          <mesh geometry={LEG_UPPER_GEO} material={armorMat} position={[0, -0.18, 0]} castShadow />
          <mesh geometry={BOOT_GEO} material={SHARED_LEATHER_DARK_MAT} position={[0, -0.4, 0.04]} castShadow />
        </group>

        {/* Tattered Loincloth / War Skirt & Belt */}
        <mesh geometry={LOINCLOTH_GEO} material={trimMat} position={[0, 0.56, 0]} castShadow />
        <mesh position={[0, 0.68, 0]} material={SHARED_LEATHER_DARK_MAT} castShadow>
          <cylinderGeometry args={[0.21, 0.22, 0.09, 7]} />
        </mesh>

        {/* Articulated Upper Torso Pivot (Chest, Pauldrons, Head, Arms) */}
        <group ref={torsoRef} position={[0, 0.72, 0]}>
          {/* Muscular Armored Chest */}
          <mesh geometry={TORSO_GEO} position={[0, 0.22, 0]} castShadow>
            <meshStandardMaterial ref={hitMatRef} color={palette.armor} roughness={0.82} metalness={0.14} flatShading />
          </mesh>

          {/* Chest harness strap for scout/archer */}
          {!isArmored && (
            <mesh position={[0, 0.24, 0]} rotation={[0, 0, 0.55]} material={SHARED_LEATHER_DARK_MAT}>
              <boxGeometry args={[0.08, 0.62, 0.44]} />
            </mesh>
          )}

          {/* Pauldrons (+ Spikes on Warriors & Boss Grakh) */}
          <group position={[-0.31, 0.43, 0]}>
            <mesh geometry={PAULDRON_GEO} material={isArmored ? metalMat : trimMat} castShadow />
            {isArmored && <mesh geometry={SPIKE_GEO} material={SHARED_BONE_MAT} position={[-0.08, 0.14, 0]} rotation={[0, 0, 0.45]} />}
          </group>
          <group position={[0.31, 0.43, 0]}>
            <mesh geometry={PAULDRON_GEO} material={isArmored ? metalMat : trimMat} castShadow />
            {isArmored && <mesh geometry={SPIKE_GEO} material={SHARED_BONE_MAT} position={[0.08, 0.14, 0]} rotation={[0, 0, -0.45]} />}
          </group>

          {/* Boss Grakh Tattered Crimson Cape attached cleanly to torso */}
          {archetype === 'goblin_commander' && (
            <mesh position={[0, 0.19, -0.2]} rotation={[0.14, 0, 0]} castShadow>
              <cylinderGeometry args={[0.21, 0.38, 0.96, 6, 1, false, Math.PI * 0.56, Math.PI * 0.88]} />
              <meshStandardMaterial color="#681c1c" roughness={0.92} side={THREE.DoubleSide} flatShading />
            </mesh>
          )}

          {/* Orc Archer Feathered Quiver */}
          {archetype === 'orc_archer' && (
            <group position={[0.02, 0.34, -0.22]} rotation={[0.15, 0, 0.28]}>
              <mesh>
                <cylinderGeometry args={[0.075, 0.055, 0.52, 6]} />
                <meshStandardMaterial color="#4e3726" roughness={0.88} flatShading />
              </mesh>
              <mesh position={[0.02, 0.3, 0]}>
                <coneGeometry args={[0.045, 0.12, 4]} />
                <meshStandardMaterial color="#d4d4d8" roughness={0.8} flatShading />
              </mesh>
            </group>
          )}

          {/* Articulated Head & Neck Pivot */}
          <group ref={headRef} position={[0, 0.56, 0.02]}>
            {/* Chiseled Head, Pointed Ears, Tusks & Glowing Eyes */}
            <mesh geometry={HEAD_GEO} material={skinMat} position={[0, 0.1, 0.03]} castShadow />
            <mesh
              geometry={EAR_GEO}
              material={skinMat}
              position={[-0.2, 0.12, -0.01]}
              rotation={[-0.15, 0, archetype === 'goblin_scout' ? 0.95 : 0.65]}
            />
            <mesh
              geometry={EAR_GEO}
              material={skinMat}
              position={[0.2, 0.12, -0.01]}
              rotation={[-0.15, 0, archetype === 'goblin_scout' ? -0.95 : -0.65]}
            />
            {archetype !== 'goblin_scout' && (
              <>
                <mesh geometry={TUSK_GEO} material={SHARED_BONE_MAT} position={[-0.055, 0.01, 0.19]} rotation={[0.25, 0, 0.12]} />
                <mesh geometry={TUSK_GEO} material={SHARED_BONE_MAT} position={[0.055, 0.01, 0.19]} rotation={[0.25, 0, -0.12]} />
              </>
            )}

            <mesh geometry={EYE_GEO} position={[-0.06, 0.14, 0.18]}>
              <meshBasicMaterial color={archetype === 'goblin_commander' ? '#f97316' : '#facc15'} />
            </mesh>
            <mesh geometry={EYE_GEO} position={[0.06, 0.14, 0.18]}>
              <meshBasicMaterial color={archetype === 'goblin_commander' ? '#f97316' : '#facc15'} />
            </mesh>

            {/* Orc Warrior Iron Brow Helm */}
            {archetype === 'orc_warrior' && (
              <mesh position={[0, 0.21, 0.02]} castShadow>
                <cylinderGeometry args={[0.14, 0.185, 0.15, 7]} />
                <meshStandardMaterial color="#3c4047" roughness={0.45} metalness={0.72} flatShading />
              </mesh>
            )}

            {/* Boss Grakh Warlord Crown Helm & Noseguard */}
            {archetype === 'goblin_commander' && (
              <group position={[0, 0.21, 0.02]}>
                <mesh castShadow>
                  <cylinderGeometry args={[0.16, 0.195, 0.17, 7]} />
                  <meshStandardMaterial color="#353940" roughness={0.38} metalness={0.78} flatShading />
                </mesh>
                <mesh position={[0, -0.04, 0.185]}>
                  <boxGeometry args={[0.042, 0.13, 0.035]} />
                  <meshStandardMaterial color="#484d56" roughness={0.42} metalness={0.75} flatShading />
                </mesh>
                <mesh position={[-0.18, 0.14, 0]} rotation={[0, 0, 0.48]}>
                  <coneGeometry args={[0.045, 0.28, 5]} />
                  <meshStandardMaterial color="#e4e4e7" roughness={0.5} metalness={0.45} flatShading />
                </mesh>
                <mesh position={[0.18, 0.14, 0]} rotation={[0, 0, -0.48]}>
                  <coneGeometry args={[0.045, 0.28, 5]} />
                  <meshStandardMaterial color="#e4e4e7" roughness={0.5} metalness={0.45} flatShading />
                </mesh>
              </group>
            )}

            {/* Orc Archer Hood */}
            {archetype === 'orc_archer' && (
              <mesh position={[0, 0.21, -0.01]} rotation={[-0.18, 0, 0]} castShadow>
                <coneGeometry args={[0.21, 0.32, 6]} />
                <meshStandardMaterial color="#2a3625" roughness={0.9} flatShading />
              </mesh>
            )}
          </group>

          {/* Left Offhand Arm + Heavy Boss Shield (Warrior & Boss) */}
          <group ref={offhandArmRef} position={[-0.31, 0.34, 0.04]}>
            <mesh geometry={ARM_GEO} material={skinMat} position={[-0.02, -0.2, 0.04]} rotation={[0.12, 0, 0.12]} castShadow />
            <mesh geometry={HAND_GEO} material={skinMat} position={[-0.04, -0.39, 0.06]} />
            {isArmored && (
              <group position={[-0.07, -0.18, 0.18]} rotation={[0, -0.45, Math.PI / 2]}>
                <mesh geometry={SHIELD_DISC_GEO} material={trimMat} castShadow />
                <mesh geometry={SHIELD_BOSS_GEO} material={metalMat} position={[0, 0.04, 0]} />
              </group>
            )}
          </group>

          {/* Right Weapon Arm + Archetype-Specific Low-Poly Weapon */}
          <group ref={weaponArmRef} position={[0.32, 0.38, 0.04]}>
            <mesh geometry={ARM_GEO} material={skinMat} position={[0.02, -0.2, 0.05]} castShadow />
            <mesh geometry={HAND_GEO} material={skinMat} position={[0.03, -0.39, 0.07]} />
            {archetype === 'orc_archer' ? (
              <group position={[0.04, -0.36, 0.22]} rotation={[0, Math.PI / 2, 0]}>
                <mesh>
                  <torusGeometry args={[0.42, 0.026, 5, 10, Math.PI]} />
                  <meshStandardMaterial color="#61432a" roughness={0.85} flatShading />
                </mesh>
                <mesh position={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[0.008, 0.008, 0.56, 4]} />
                  <meshStandardMaterial color="#d6c5a3" roughness={0.7} />
                </mesh>
              </group>
            ) : archetype === 'goblin_commander' ? (
              <group position={[0.04, -0.38, 0.18]} rotation={[Math.PI * 0.45, 0, 0]}>
                <mesh position={[0, 0.42, 0]} castShadow>
                  <cylinderGeometry args={[0.03, 0.03, 0.96, 6]} />
                  <meshStandardMaterial color="#422d1e" roughness={0.86} flatShading />
                </mesh>
                <mesh geometry={WAR_AXE_HEAD_GEO} position={[0, 0.78, 0]} castShadow>
                  <meshStandardMaterial color="#6b7280" roughness={0.35} metalness={0.78} flatShading />
                </mesh>
              </group>
            ) : archetype === 'orc_warrior' ? (
              <group position={[0.04, -0.38, 0.14]} rotation={[Math.PI * 0.44, 0, 0]}>
                <mesh position={[0, -0.05, 0]} material={SHARED_LEATHER_DARK_MAT}>
                  <cylinderGeometry args={[0.024, 0.024, 0.2, 5]} />
                </mesh>
                <mesh geometry={CLEAVER_GEO} position={[0, 0.03, 0]} castShadow>
                  <meshStandardMaterial color="#7b828c" roughness={0.38} metalness={0.74} flatShading />
                </mesh>
              </group>
            ) : (
              <group position={[0.04, -0.38, 0.14]} rotation={[Math.PI * 0.44, 0, 0]}>
                <mesh position={[0, -0.04, 0]} material={SHARED_LEATHER_DARK_MAT}>
                  <cylinderGeometry args={[0.02, 0.022, 0.16, 5]} />
                </mesh>
                <mesh geometry={SCIMITAR_GEO} position={[0, 0.03, 0]} castShadow>
                  <meshStandardMaterial color="#8c949e" roughness={0.36} metalness={0.74} flatShading />
                </mesh>
              </group>
            )}
          </group>
        </group>
      </group>

      <mesh
        ref={stunHaloRef}
        geometry={STUN_GEO}
        material={SHARED_STUN_MAT}
        position={[0, 1.78, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        visible={false}
      />

      {/* AI Awareness / Telegraph Diamond */}
      <mesh ref={alertGlyphRef} position={[0, 2.25, 0]} visible={false}>
        <octahedronGeometry args={[0.1, 0]} />
        <meshBasicMaterial color="#fbbf24" />
      </mesh>

      <group ref={hpBarGroupRef} position={[0, 2.02, 0]} visible={false}>
        <mesh geometry={HP_BG_GEO} material={SHARED_HP_BG_MAT} />
        <mesh ref={hpFillRef} geometry={HP_FILL_GEO} position={[0, 0, 0.01]}>
          <meshBasicMaterial color={archetype === 'goblin_commander' ? '#f59e0b' : '#dc2626'} />
        </mesh>
      </group>
    </group>
  );
}

export function EnemyGroup() {
  const count = liveSim.enemies.length;
  return (
    <group name="enemy-actors">
      {Array.from({ length: count }, (_, idx) => (
        <EnemyActor key={liveSim.enemies[idx].id} enemyIndex={idx} />
      ))}
    </group>
  );
}
