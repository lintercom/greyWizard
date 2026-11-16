import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  PLAYER_COLLIDER,
  STATIC_COLLIDERS,
  isColliderActive,
} from '../game/collisionSystem';
import { liveSim, useGameStore } from '../game/store';

function useDebugColliderEnabled(): boolean {
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('debugColliders') === '1';
  });

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'F3' && !e.repeat) {
        e.preventDefault();
        setEnabled((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return enabled;
}

const MAX_ENEMY_SLOTS = 20;

export function CollisionDebugOverlay() {
  const enabled = useDebugColliderEnabled();
  if (!import.meta.env.DEV || !enabled) return null;
  return <CollisionDebugOverlayActive />;
}

function CollisionDebugOverlayActive() {
  const nelaRescued = useGameStore((s) => s.flags.nelaRescued);
  const playerGroupRef = useRef<THREE.Group>(null);
  const enemyGroupRefs = useRef<Array<THREE.Mesh | null>>([]);

  const activeStatic = useMemo(() => {
    const ctx = { nelaRescued };
    return STATIC_COLLIDERS.filter((c) => isColliderActive(c, ctx));
  }, [nelaRescued]);

  const sharedMats = useMemo(() => {
    return {
      player: new THREE.MeshBasicMaterial({ color: '#22d3ee', wireframe: true, transparent: true, opacity: 0.9 }),
      enemy: new THREE.MeshBasicMaterial({ color: '#ef4444', wireframe: true, transparent: true, opacity: 0.85 }),
      structure: new THREE.MeshBasicMaterial({ color: '#f59e0b', wireframe: true, transparent: true, opacity: 0.65 }),
      tree: new THREE.MeshBasicMaterial({ color: '#a16207', wireframe: true, transparent: true, opacity: 0.6 }),
      rock: new THREE.MeshBasicMaterial({ color: '#94a3b8', wireframe: true, transparent: true, opacity: 0.6 }),
      dynamic: new THREE.MeshBasicMaterial({ color: '#e879f9', wireframe: true, transparent: true, opacity: 0.85 }),
    };
  }, []);

  useEffect(() => {
    return () => {
      Object.values(sharedMats).forEach((m) => m.dispose());
    };
  }, [sharedMats]);

  useFrame(() => {
    if (playerGroupRef.current) {
      playerGroupRef.current.position.set(
        liveSim.playerX,
        liveSim.playerY + PLAYER_COLLIDER.centerOffsetY,
        liveSim.playerZ,
      );
    }

    for (let i = 0; i < MAX_ENEMY_SLOTS; i++) {
      const m = enemyGroupRefs.current[i];
      if (!m) continue;
      const e = liveSim.enemies[i];
      if (!e || e.dead) {
        m.visible = false;
      } else {
        m.visible = true;
        const r = e.archetype === 'goblin_commander' ? 0.72 : 0.52;
        m.position.set(e.x, e.y + 0.9, e.z);
        m.scale.set(r, 1.8, r);
      }
    }
  });

  return (
    <group name="dev-collision-debug-overlay">
      {/* Gandalf Capsule Wireframe */}
      <group ref={playerGroupRef}>
        <mesh material={sharedMats.player}>
          <capsuleGeometry args={[PLAYER_COLLIDER.radius, PLAYER_COLLIDER.halfHeight * 2, 4, 10]} />
        </mesh>
      </group>

      {/* Enemy Actor Cylinders */}
      {Array.from({ length: MAX_ENEMY_SLOTS }, (_, i) => (
        <mesh
          key={`en_dbg_${i}`}
          ref={(el) => {
            enemyGroupRefs.current[i] = el;
          }}
          material={sharedMats.enemy}
          visible={false}
        >
          <cylinderGeometry args={[1, 1, 1, 10]} />
        </mesh>
      ))}

      {/* Static World Colliders */}
      {activeStatic.map((c) => {
        const h = Math.max(0.2, c.maxY - c.minY);
        const cy = (c.minY + c.maxY) * 0.5;
        const mat =
          c.activeWhen === 'nela_trapped'
            ? sharedMats.dynamic
            : c.tag === 'tree_trunk'
              ? sharedMats.tree
              : c.tag === 'boulder' || c.tag === 'cliff_rock'
                ? sharedMats.rock
                : sharedMats.structure;

        if (c.kind === 'cylinder') {
          return (
            <mesh key={c.id} position={[c.x, cy, c.z]} material={mat}>
              <cylinderGeometry args={[c.radius, c.radius, h, 10]} />
            </mesh>
          );
        }
        return (
          <mesh key={c.id} position={[c.x, cy, c.z]} rotation={[0, c.rotY, 0]} material={mat}>
            <boxGeometry args={[c.halfX * 2, h, c.halfZ * 2]} />
          </mesh>
        );
      })}
    </group>
  );
}
