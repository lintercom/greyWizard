import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { Mesh } from 'three';
import { WORLD_KIT, type KitAsset } from '../game/worldKit';
import { groundHeightAt } from '../game/terrain';
import { RAPIER_GROUPS } from '../game/collisionSystem';

export function WorldAsset({ asset }: { asset: KitAsset }) {
  const { scene } = useGLTF(`${import.meta.env.BASE_URL}assets/world/kit/${asset}.glb`);
  const model = useMemo(() => {
    const copy = scene.clone(true);
    copy.traverse((obj) => { if (obj instanceof Mesh) { obj.castShadow = true; obj.receiveShadow = true; } });
    return copy;
  }, [scene]);
  return <primitive object={model} dispose={null} />;
}

export function WorldKit() {
  return <group name="blender-world-kit">
    {WORLD_KIT.placements.map((p) => <RigidBody key={p.id} name={p.id} type="fixed" colliders={false}
      collisionGroups={RAPIER_GROUPS.STATIC_WORLD} friction={0} restitution={0}
      position={[p.x, groundHeightAt(p.x,p.z), p.z]} rotation={[0,p.rotation,0]}>
      <WorldAsset asset={p.asset as KitAsset} />
      {WORLD_KIT.assets[p.asset as KitAsset].boxes.map((b,i) =>
        <CuboidCollider key={i} position={[b[0],b[1],b[2]]} args={[b[3],b[4],b[5]]} />)}
    </RigidBody>)}
  </group>;
}
