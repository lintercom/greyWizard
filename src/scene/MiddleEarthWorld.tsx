import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  CAMPSITE_POS,
  CAVE_POS,
  FORD_POS,
  PATROL_POS,
  QUARRY_POS,
  RANGER_POS,
  SPAWN_POS,
  VILLAGE_POS,
  WATCHTOWER_POS,
  WATERFALL_POS,
  distanceToRoad,
  groundHeightAt,
  riverCenterZ,
  surfaceSlopeAt,
} from '../game/terrain';
import {
  COTTAGE_SPECS,
  FINGERPOST_SPECS,
  RAPIER_GROUPS,
  WATCHTOWER_DAIS,
  WATCHTOWER_PILLAR_SPECS,
} from '../game/collisionSystem';
import { WORLD_DECOR_PLACEMENTS } from '../game/worldPlacements';
import { liveSim, useGameStore } from '../game/store';
import { stepAngleToward } from '../game/gameplayFeelLogic';
import { getSharedRadialShadowTexture } from './textures';
import {
  applyFacetVertexColors,
  makeBroadleafCrownGeo,
  makeChiseledRockGeo,
  makeDiamondBladeGeo,
  makeLowPolyBushGeo,
  makeSculptedTrunkGeo,
  makeSpokedWheelGeo,
  makeStylizedPineCrownGeo,
  makeWildflowerTuftGeo,
  seededRand,
  toFlatFaceted,
} from './lowPolyBuilders';

const PINE_TINT_PALETTE = [0xdbe8d6, 0xeef5e8, 0xcbdcc8, 0xf2f7eb];
const OAK_TINT_PALETTE = [0xe8efd8, 0xf4f0d8, 0xd8e8d4, 0xf2e4c9];
const ROCK_TINT_PALETTE = [0xd2d8de, 0xe3e7eb, 0xc3ccc4, 0xddd7cc];
const GRASS_HEX_PALETTE = [0x587f42, 0x678e48, 0x4b713c, 0x76994e];
const BUSH_TINT_PALETTE = [0xdcead4, 0xeef4dd, 0xcce0c8];
const FLOWER_TINT_PALETTE = [0xffffff, 0xf4ece4, 0xe6f2e2];

function SkyDomeAndClouds() {
  const cloudGroupRef = useRef<THREE.Group>(null);

  const skyMat = useMemo(() => {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTopColor: { value: new THREE.Color('#47688a') },
        uMidColor: { value: new THREE.Color('#88a6be') },
        uHorizonColor: { value: new THREE.Color('#d8ccb8') },
        uSunDir: { value: new THREE.Vector3(44, 34, 24).normalize() },
      },
      vertexShader: `
        varying vec3 vWorldDir;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldDir = normalize(position);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform vec3 uTopColor;
        uniform vec3 uMidColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uSunDir;
        varying vec3 vWorldDir;
        void main() {
          float h = clamp(vWorldDir.y, 0.0, 1.0);
          vec3 col = mix(uHorizonColor, uMidColor, smoothstep(0.0, 0.26, h));
          col = mix(col, uTopColor, smoothstep(0.22, 0.86, h));
          float sunDot = max(dot(normalize(vWorldDir), uSunDir), 0.0);
          col += vec3(1.0, 0.86, 0.62) * pow(sunDot, 16.0) * 0.36;
          col += vec3(1.0, 0.95, 0.82) * pow(sunDot, 180.0) * 0.68;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
  }, []);

  const clouds = useMemo(() => {
    const items: Array<{ x: number; y: number; z: number; sx: number; sy: number; sz: number; rot: number }> = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.25;
      const dist = 98 + (i % 3) * 18;
      items.push({
        x: Math.cos(a) * dist,
        y: 35 + (i % 4) * 4.5,
        z: Math.sin(a) * dist,
        sx: 6.8 + (i % 3) * 2.6,
        sy: 1.7 + (i % 2) * 0.7,
        sz: 3.8 + (i % 3) * 1.4,
        rot: a + Math.PI * 0.5,
      });
    }
    return items;
  }, []);

  const cloudGeo = useMemo(() => new THREE.DodecahedronGeometry(1, 0), []);
  const cloudMats = useMemo(
    () => [
      new THREE.MeshStandardMaterial({ color: '#f5efe6', roughness: 0.95, flatShading: true, fog: false }),
      new THREE.MeshStandardMaterial({ color: '#ebe4da', roughness: 0.95, flatShading: true, fog: false }),
      new THREE.MeshStandardMaterial({ color: '#ede7dd', roughness: 0.95, flatShading: true, fog: false }),
    ],
    [],
  );

  useEffect(() => {
    return () => {
      skyMat.dispose();
      cloudGeo.dispose();
      cloudMats.forEach((m) => m.dispose());
    };
  }, [skyMat, cloudGeo, cloudMats]);

  useFrame((_, delta) => {
    if (cloudGroupRef.current) {
      cloudGroupRef.current.rotation.y += Math.min(delta, 0.05) * 0.008;
    }
  });

  return (
    <group name="sky-atmosphere">
      <mesh material={skyMat} renderOrder={-2}>
        <sphereGeometry args={[220, 24, 14]} />
      </mesh>
      <group ref={cloudGroupRef}>
        {clouds.map((c, idx) => (
          <group key={idx} position={[c.x, c.y, c.z]} rotation={[0, c.rot, 0]} scale={[c.sx, c.sy, c.sz]}>
            <mesh geometry={cloudGeo} material={cloudMats[0]} />
            <mesh position={[0.78, -0.14, 0.18]} scale={[0.72, 0.74, 0.76]} geometry={cloudGeo} material={cloudMats[1]} />
            <mesh position={[-0.68, -0.18, -0.15]} scale={[0.64, 0.68, 0.7]} geometry={cloudGeo} material={cloudMats[2]} />
          </group>
        ))}
      </group>
    </group>
  );
}

export function EnvironmentLighting({ isSoftwareGl }: { isSoftwareGl: boolean }) {
  const { gl, scene } = useThree();
  const dirLightRef = useRef<THREE.DirectionalLight>(null);
  const graphicsQuality = useGameStore((s) => s.settings.graphicsQuality);

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    scene.environmentIntensity = 0.36;
    scene.background = new THREE.Color('#9cb0be');
    scene.fog = new THREE.FogExp2('#9cb0be', 0.0072);
    return () => {
      scene.environment = null;
      envTex.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  useFrame(() => {
    if (dirLightRef.current) {
      dirLightRef.current.position.set(
        liveSim.playerX + 44,
        liveSim.playerY + 34,
        liveSim.playerZ + 24,
      );
      dirLightRef.current.target.position.set(liveSim.playerX, liveSim.playerY, liveSim.playerZ);
      dirLightRef.current.target.updateMatrixWorld();
    }
  });

  const shadowMapSize = graphicsQuality === 'high' ? 1024 : 512;

  return (
    <>
      <SkyDomeAndClouds />
      <hemisphereLight args={['#b8d5ed', '#435135', 0.78]} />
      <directionalLight
        ref={dirLightRef}
        color="#ffdfb3"
        intensity={2.2}
        position={[44, 34, 24]}
        castShadow={!isSoftwareGl}
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
        shadow-camera-near={5}
        shadow-camera-far={135}
        shadow-camera-left={-32}
        shadow-camera-right={32}
        shadow-camera-top={32}
        shadow-camera-bottom={-32}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight color="#8ab4dc" intensity={0.48} position={[-45, 24, -48]} />
    </>
  );
}

function TerrainMesh() {
  const terrainGeo = useMemo(() => {
    const size = 216;
    const segs = 112;
    const geo = new THREE.PlaneGeometry(size, size, segs, segs);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cMeadow = new THREE.Color('#527841');
    const cSunGrass = new THREE.Color('#6b8c4a');
    const cForest = new THREE.Color('#345134');
    const cRoad = new THREE.Color('#8e7454');
    const cRoadEdge = new THREE.Color('#6f6549');
    const cRock = new THREE.Color('#5a636c');
    const cSnow = new THREE.Color('#dfe8f0');
    const cSand = new THREE.Color('#7b705a');
    const tmp = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = groundHeightAt(x, z);
      pos.setY(i, y);

      const roadDist = distanceToRoad(x, z);
      const rz = riverCenterZ(x);
      const distRiver = Math.abs(z - rz);
      const slope = surfaceSlopeAt(x, z);

      // Stylized low-poly meadow & forest floor gradients
      const sunPatch = 0.5 + 0.5 * Math.sin(x * 0.08 + z * 0.07);
      tmp.copy(cMeadow).lerp(cSunGrass, sunPatch * 0.58);

      const forestT = Math.max(0, Math.min(1, (-z + 5) / 38));
      tmp.lerp(cForest, forestT * 0.55);

      if (distRiver < 5.2 && x > -46 && x < 54 && Math.abs(x - FORD_POS.x) > 4.2) {
        const bankT = Math.max(0, 1 - distRiver / 5.2);
        tmp.lerp(cSand, bankT * 0.85);
      }

      if (roadDist < 4.4) {
        const edgeT = Math.max(0, 1 - roadDist / 4.4);
        tmp.lerp(cRoadEdge, edgeT * 0.68);
      }
      if (roadDist < 2.95) {
        const roadT = Math.max(0, 1 - roadDist / 2.95);
        tmp.lerp(cRoad, roadT * 0.94);
      }

      // Reveal grey rock on steep cliffs OR high altitude
      const slopeRock = Math.max(0, Math.min(1, (slope - 0.55) * 1.4));
      const heightRock = y > 5.2 ? Math.min(1, (y - 5.2) / 4.4) : 0;
      const rockT = Math.max(slopeRock * 0.85, heightRock * 0.9);
      if (rockT > 0) {
        tmp.lerp(cRock, rockT);
      }

      if (y > 13.6) {
        const snowT = Math.min(1, (y - 13.6) / 6.2);
        tmp.lerp(cSnow, snowT * 0.88);
      }

      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, []);

  useEffect(() => {
    return () => {
      terrainGeo.dispose();
    };
  }, [terrainGeo]);

  return (
    <RigidBody
      type="fixed"
      colliders="trimesh"
      friction={0}
      restitution={0}
      collisionGroups={RAPIER_GROUPS.STATIC_WORLD}
    >
      <mesh geometry={terrainGeo} receiveShadow>
        <meshStandardMaterial
          vertexColors
          roughness={0.93}
          metalness={0.01}
          flatShading
        />
      </mesh>
    </RigidBody>
  );
}

function RiverAndWaterfall() {
  const foamRef = useRef<THREE.Mesh>(null);
  const mistRef = useRef<THREE.Mesh>(null);
  const fallRibbonRef = useRef<THREE.Mesh>(null);
  const timeUniformRef = useRef({ value: 0 });

  const { riverGeo, fordStoneGeo } = useMemo(() => {
    const length = 104;
    const width = 9.0;
    const segX = 48;
    const segZ = 8;
    const geo = new THREE.PlaneGeometry(length, width, segX, segZ);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + 2;
      const localZ = pos.getZ(i);
      const rz = riverCenterZ(x);
      pos.setX(i, x);
      pos.setZ(i, rz + localZ);
      pos.setY(i, -0.32);
    }
    geo.computeVertexNormals();

    const stoneGeo = makeChiseledRockGeo(71);
    return { riverGeo: geo, fordStoneGeo: stoneGeo };
  }, []);

  useEffect(() => {
    return () => {
      riverGeo.dispose();
      fordStoneGeo.dispose();
    };
  }, [riverGeo, fordStoneGeo]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    timeUniformRef.current.value = t;
    if (foamRef.current) {
      foamRef.current.scale.setScalar(1 + Math.sin(t * 5.2) * 0.08);
    }
    if (mistRef.current) {
      mistRef.current.scale.setScalar(1 + Math.cos(t * 3.8) * 0.1);
    }
    if (fallRibbonRef.current) {
      fallRibbonRef.current.position.y = 2.45 + Math.sin(t * 7.5) * 0.06;
    }
  });

  const fordSteppingStones = useMemo(() => {
    const rz = riverCenterZ(FORD_POS.x);
    return [
      { x: FORD_POS.x - 1.3, z: rz - 2.2, s: [0.58, 0.24, 0.52] },
      { x: FORD_POS.x + 0.5, z: rz - 1.0, s: [0.65, 0.25, 0.55] },
      { x: FORD_POS.x - 0.6, z: rz + 0.4, s: [0.6, 0.24, 0.5] },
      { x: FORD_POS.x + 0.9, z: rz + 1.8, s: [0.64, 0.24, 0.52] },
      { x: FORD_POS.x - 1.6, z: rz + 2.9, s: [0.52, 0.22, 0.48] },
    ];
  }, []);

  return (
    <group name="river-and-waterfall">
      <mesh geometry={riverGeo}>
        <meshStandardMaterial
          color="#337c98"
          roughness={0.16}
          metalness={0.14}
          flatShading
          transparent
          opacity={0.86}
          onBeforeCompile={(shader) => {
            shader.uniforms.uTime = timeUniformRef.current;
            shader.vertexShader = shader.vertexShader
              .replace(
                '#include <common>',
                `#include <common>
                uniform float uTime;`,
              )
              .replace(
                '#include <begin_vertex>',
                `#include <begin_vertex>
                transformed.y += sin(transformed.x * 0.85 - uTime * 2.4) * 0.03 + cos(transformed.z * 1.4 + uTime * 1.9) * 0.02;`,
              );
          }}
        />
      </mesh>

      {/* Low-Poly Stepping Stones & Ford Markers at Stříbrný brod */}
      {fordSteppingStones.map((st, idx) => (
        <mesh
          key={idx}
          geometry={fordStoneGeo}
          position={[st.x, -0.26, st.z]}
          scale={st.s as [number, number, number]}
          rotation={[0, idx * 0.8, 0]}
          receiveShadow
        >
          <meshStandardMaterial vertexColors roughness={0.86} flatShading />
        </mesh>
      ))}

      {/* Stylized Low-Poly Waterfall cascading down western cliff */}
      <RigidBody
        type="fixed"
        colliders={false}
        friction={0}
        restitution={0}
        collisionGroups={RAPIER_GROUPS.STATIC_WORLD}
        position={[WATERFALL_POS.x + 2, 0, riverCenterZ(WATERFALL_POS.x)]}
      >
        <CuboidCollider args={[1.75, 2.75, 1.55]} position={[-0.6, 2.25, -2.6]} rotation={[0, 0.4, 0]} />
        <CuboidCollider args={[1.75, 2.75, 1.55]} position={[-0.6, 2.25, 2.6]} rotation={[0, 1.1, 0]} />
        <CuboidCollider args={[1.45, 1.35, 2.65]} position={[-1.4, 4.75, 0]} />
        {/* Stepped Flanking Cliff Outcrops */}
        <mesh geometry={fordStoneGeo} position={[-0.6, 2.5, -2.6]} scale={[2.0, 2.7, 1.8]} rotation={[0.2, 0.4, 0.1]} castShadow>
          <meshStandardMaterial vertexColors roughness={0.92} flatShading />
        </mesh>
        <mesh geometry={fordStoneGeo} position={[-0.6, 2.5, 2.6]} scale={[2.0, 2.7, 1.8]} rotation={[-0.1, 1.1, 0.2]} castShadow>
          <meshStandardMaterial vertexColors roughness={0.92} flatShading />
        </mesh>
        <mesh geometry={fordStoneGeo} position={[-1.4, 4.9, 0]} scale={[1.6, 1.2, 3.0]} castShadow>
          <meshStandardMaterial vertexColors roughness={0.92} flatShading />
        </mesh>

        {/* Faceted cascading water sheets */}
        <mesh position={[0.1, 2.5, 0]} rotation={[0, 0, -0.22]}>
          <cylinderGeometry args={[1.55, 2.15, 5.8, 6, 3, true, -0.9, 1.8]} />
          <meshStandardMaterial
            color="#6cc0dd"
            emissive="#2b6e8c"
            emissiveIntensity={0.28}
            roughness={0.2}
            flatShading
            side={THREE.DoubleSide}
            transparent
            opacity={0.88}
          />
        </mesh>
        <mesh ref={fallRibbonRef} position={[0.45, 2.45, 0]} rotation={[0, 0, -0.24]}>
          <cylinderGeometry args={[1.05, 1.5, 5.4, 5, 2, true, -0.65, 1.3]} />
          <meshBasicMaterial color="#e0f6fe" transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>

        {/* Plunge pool stylized foam & crystal spray */}
        <mesh ref={foamRef} position={[1.4, -0.18, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[3.15, 10]} />
          <meshBasicMaterial color="#e6f6fe" transparent opacity={0.58} depthWrite={false} />
        </mesh>
        <mesh ref={mistRef} position={[1.5, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[2.2, 3.85, 10]} />
          <meshBasicMaterial color="#cde8f6" transparent opacity={0.3} depthWrite={false} />
        </mesh>
      </RigidBody>
    </group>
  );
}

function InstancedForestAndRocks() {
  const pineTrunkRef = useRef<THREE.InstancedMesh>(null);
  const pineCrownRef = useRef<THREE.InstancedMesh>(null);
  const oakTrunkRef = useRef<THREE.InstancedMesh>(null);
  const oakCrownRef = useRef<THREE.InstancedMesh>(null);
  const bushRef = useRef<THREE.InstancedMesh>(null);
  const rockRef = useRef<THREE.InstancedMesh>(null);
  const grassRef = useRef<THREE.InstancedMesh>(null);
  const flowerRef = useRef<THREE.InstancedMesh>(null);

  const timeUniformRef = useRef({ value: 0 });

  const geos = useMemo(() => {
    const pineTrunk = makeSculptedTrunkGeo(0.11, 0.34, 3.1, 11);
    const pineCrown = makeStylizedPineCrownGeo(17);
    const oakTrunk = makeSculptedTrunkGeo(0.18, 0.4, 2.65, 29);
    const oakCrown = makeBroadleafCrownGeo(37);
    const bushGeo = makeLowPolyBushGeo(53);
    const rockGeo = makeChiseledRockGeo(67);
    const flowerGeo = makeWildflowerTuftGeo(83);

    // 3-blade stylized low-poly grass tuft
    const tuft = new THREE.BufferGeometry();
    const verts = new Float32Array([
      -0.08, 0, 0, 0.08, 0, 0, 0.02, 0.56, 0.04,
      -0.14, 0, 0.06, -0.02, 0, -0.05, -0.22, 0.42, 0.08,
      0.02, 0, -0.05, 0.14, 0, 0.06, 0.22, 0.44, -0.06,
    ]);
    tuft.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    tuft.computeVertexNormals();

    return { pineTrunk, pineCrown, oakTrunk, oakCrown, bushGeo, rockGeo, flowerGeo, tuft };
  }, []);

  useEffect(() => {
    return () => {
      Object.values(geos).forEach((g) => g.dispose());
    };
  }, [geos]);

  useFrame((state) => {
    timeUniformRef.current.value = state.clock.elapsedTime;
  });

  const { pineTransforms, oakTransforms, bushTransforms, rockTransforms, grassTransforms, flowerTransforms } =
    WORLD_DECOR_PLACEMENTS;

  useEffect(() => {
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    pineTransforms.forEach((t, i) => {
      dummy.position.set(t.x, t.y - 0.08, t.z);
      dummy.rotation.set(t.leanX, t.rot, t.leanZ);
      dummy.scale.setScalar(t.scale);
      dummy.updateMatrix();
      pineTrunkRef.current?.setMatrixAt(i, dummy.matrix);
      pineCrownRef.current?.setMatrixAt(i, dummy.matrix);
      color.setHex(PINE_TINT_PALETTE[t.tint]);
      pineCrownRef.current?.setColorAt(i, color);
    });

    oakTransforms.forEach((t, i) => {
      dummy.position.set(t.x, t.y - 0.08, t.z);
      dummy.rotation.set(t.leanX, t.rot, t.leanZ);
      dummy.scale.setScalar(t.scale);
      dummy.updateMatrix();
      oakTrunkRef.current?.setMatrixAt(i, dummy.matrix);
      oakCrownRef.current?.setMatrixAt(i, dummy.matrix);
      color.setHex(OAK_TINT_PALETTE[t.tint]);
      oakCrownRef.current?.setColorAt(i, color);
    });

    bushTransforms.forEach((b, i) => {
      dummy.position.set(b.x, b.y, b.z);
      dummy.rotation.set(0, b.rot, 0);
      dummy.scale.setScalar(b.scale);
      dummy.updateMatrix();
      bushRef.current?.setMatrixAt(i, dummy.matrix);
      color.setHex(BUSH_TINT_PALETTE[b.tint]);
      bushRef.current?.setColorAt(i, color);
    });

    rockTransforms.forEach((rk, i) => {
      dummy.position.set(rk.x, rk.y + rk.sy * 0.42, rk.z);
      dummy.rotation.set(rk.rx, rk.ry, rk.rz);
      dummy.scale.set(rk.sx, rk.sy, rk.sz);
      dummy.updateMatrix();
      rockRef.current?.setMatrixAt(i, dummy.matrix);
      color.setHex(ROCK_TINT_PALETTE[rk.tint]);
      rockRef.current?.setColorAt(i, color);
    });

    grassTransforms.forEach((g, i) => {
      dummy.position.set(g.x, g.y, g.z);
      dummy.rotation.set(0, g.rot, 0);
      dummy.scale.setScalar(g.scale);
      dummy.updateMatrix();
      grassRef.current?.setMatrixAt(i, dummy.matrix);
      color.setHex(GRASS_HEX_PALETTE[g.paletteIdx]);
      grassRef.current?.setColorAt(i, color);
    });

    flowerTransforms.forEach((fl, i) => {
      dummy.position.set(fl.x, fl.y, fl.z);
      dummy.rotation.set(0, fl.rot, 0);
      dummy.scale.setScalar(fl.scale);
      dummy.updateMatrix();
      flowerRef.current?.setMatrixAt(i, dummy.matrix);
      color.setHex(FLOWER_TINT_PALETTE[fl.tint]);
      flowerRef.current?.setColorAt(i, color);
    });

    [pineTrunkRef, pineCrownRef, oakTrunkRef, oakCrownRef, bushRef, rockRef, grassRef, flowerRef].forEach((ref) => {
      if (ref.current) {
        ref.current.instanceMatrix.needsUpdate = true;
        if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
        ref.current.computeBoundingSphere();
      }
    });
  }, [pineTransforms, oakTransforms, bushTransforms, rockTransforms, grassTransforms, flowerTransforms]);

  return (
    <group name="forest-and-rocks">
      {/* Alpine Pines */}
      <instancedMesh ref={pineTrunkRef} args={[geos.pineTrunk, undefined, pineTransforms.length]} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.94} flatShading />
      </instancedMesh>
      <instancedMesh ref={pineCrownRef} args={[geos.pineCrown, undefined, pineTransforms.length]} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.88} flatShading />
      </instancedMesh>

      {/* Valley Broadleaf Oaks */}
      <instancedMesh ref={oakTrunkRef} args={[geos.oakTrunk, undefined, oakTransforms.length]} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.94} flatShading />
      </instancedMesh>
      <instancedMesh ref={oakCrownRef} args={[geos.oakCrown, undefined, oakTransforms.length]} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.88} flatShading />
      </instancedMesh>

      {/* Low-Poly Bushes & Ferns */}
      <instancedMesh ref={bushRef} args={[geos.bushGeo, undefined, bushTransforms.length]} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.9} flatShading />
      </instancedMesh>

      {/* Chiseled Boulders */}
      <instancedMesh ref={rockRef} args={[geos.rockGeo, undefined, rockTransforms.length]} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.9} metalness={0.04} flatShading />
      </instancedMesh>

      {/* Meadow Wildflower Accents */}
      <instancedMesh ref={flowerRef} args={[geos.flowerGeo, undefined, flowerTransforms.length]}>
        <meshStandardMaterial vertexColors roughness={0.88} flatShading />
      </instancedMesh>

      {/* Swaying Low-Poly Grass Tufts */}
      <instancedMesh ref={grassRef} args={[geos.tuft, undefined, grassTransforms.length]}>
        <meshStandardMaterial
          color="#ffffff"
          roughness={0.9}
          side={THREE.DoubleSide}
          flatShading
          onBeforeCompile={(shader) => {
            shader.uniforms.uTime = timeUniformRef.current;
            shader.vertexShader = shader.vertexShader
              .replace(
                '#include <common>',
                `#include <common>
                uniform float uTime;`,
              )
              .replace(
                '#include <begin_vertex>',
                `#include <begin_vertex>
                float tipFactor = clamp(position.y * 2.0, 0.0, 1.0);
                transformed.x += sin(uTime * 2.1 + position.z * 3.0) * 0.08 * tipFactor;`,
              );
          }}
        />
      </instancedMesh>

      {/* Tree Trunks & Boulders Solid Static Colliders (Foliage/Bushes/Grass/Flowers remain NON_COLLIDABLE) */}
      <RigidBody
        type="fixed"
        colliders={false}
        friction={0}
        restitution={0}
        collisionGroups={RAPIER_GROUPS.STATIC_WORLD}
      >
        {pineTransforms.map((t, idx) => {
          const halfH = 1.52 * t.scale;
          const rad = Math.max(0.24, 0.31 * t.scale);
          return (
            <CylinderCollider
              key={`pt_${idx}`}
              args={[halfH, rad]}
              position={[t.x, t.y + halfH - 0.1, t.z]}
            />
          );
        })}
        {oakTransforms.map((t, idx) => {
          const halfH = 1.3 * t.scale;
          const rad = Math.max(0.28, 0.36 * t.scale);
          return (
            <CylinderCollider
              key={`ot_${idx}`}
              args={[halfH, rad]}
              position={[t.x, t.y + halfH - 0.1, t.z]}
            />
          );
        })}
        {rockTransforms.map((rk, idx) => {
          const halfY = 0.69 * rk.sy;
          return (
            <CuboidCollider
              key={`rk_${idx}`}
              args={[0.78 * rk.sx, halfY, 0.78 * rk.sz]}
              position={[rk.x, rk.y + halfY - 0.2, rk.z]}
              rotation={[0, rk.ry, 0]}
            />
          );
        })}
      </RigidBody>
    </group>
  );
}

function DistantMistyMountains() {
  const mountainGeos = useMemo(() => {
    const peaks: Array<{
      x: number;
      z: number;
      h: number;
      r: number;
      rot: number;
      geo: THREE.BufferGeometry;
    }> = [];
    const total = 28;
    const cBase = new THREE.Color('#4a596a');
    const cRidge = new THREE.Color('#697887');
    const cSnow = new THREE.Color('#cbd8e4');
    const tmp = new THREE.Color();

    for (let i = 0; i < total; i++) {
      const angle = (i / total) * Math.PI * 2;
      const dist = 114 + (i % 3) * 18;
      const northBoost = Math.sin(angle) < 0 ? 1.38 : 0.88;
      const h = (31 + (i % 5) * 7.2) * northBoost;
      const r = 27 + (i % 4) * 6.5;

      const geo = new THREE.ConeGeometry(r, h, 8, 4);
      const pos = geo.attributes.position;
      const colors = new Float32Array(pos.count * 3);
      for (let v = 0; v < pos.count; v++) {
        const vx = pos.getX(v);
        const vy = pos.getY(v);
        const vz = pos.getZ(v);
        const heightNorm = (vy + h * 0.5) / h;
        const rad = Math.hypot(vx, vz);
        const spatialKey =
          Math.round(vx * 4) * 31 + Math.round(vy * 4) * 17 + Math.round(vz * 4) * 53 + i * 13;
        if (rad > 0.2 && heightNorm < 0.96) {
          const ridge = 0.74 + seededRand(spatialKey) * 0.44;
          const shoulder = heightNorm > 0.45 && heightNorm < 0.7 ? 1.12 : 1.0;
          pos.setX(v, vx * ridge * shoulder);
          pos.setZ(v, vz * ridge);
        }
        tmp.copy(cBase).lerp(cRidge, Math.min(1, heightNorm * 1.15));
        if (heightNorm > 0.62 + seededRand(spatialKey + 7) * 0.08) {
          const snowT = Math.min(1, (heightNorm - 0.62) / 0.25);
          tmp.lerp(cSnow, snowT * 0.86);
        }
        colors[v * 3] = tmp.r;
        colors[v * 3 + 1] = tmp.g;
        colors[v * 3 + 2] = tmp.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const nonIdx = toFlatFaceted(geo);

      peaks.push({
        x: Math.cos(angle) * dist,
        z: Math.sin(angle) * dist,
        h,
        r,
        rot: i * 0.65,
        geo: nonIdx,
      });
    }
    return peaks;
  }, []);

  useEffect(() => {
    return () => {
      mountainGeos.forEach((p) => p.geo.dispose());
    };
  }, [mountainGeos]);

  return (
    <group name="misty-mountains-horizon">
      {mountainGeos.map((p, i) => (
        <mesh key={i} geometry={p.geo} position={[p.x, p.h * 0.42, p.z]} rotation={[0, p.rot, 0]}>
          <meshStandardMaterial vertexColors roughness={0.96} flatShading />
        </mesh>
      ))}
    </group>
  );
}

const RANGER_BLADE_GEO = makeDiamondBladeGeo(0.76, 0.045, 0.018);

function StylizedVillager({
  x,
  z,
  rotY,
  tunicColor,
  cloakColor,
  headgear = 'none',
  scale = 1,
  showBeacon = false,
  hasSword = false,
  hasBeard = false,
  prop = 'none',
}: {
  x: number;
  z: number;
  rotY: number;
  tunicColor: string;
  cloakColor: string;
  headgear?: 'hood' | 'scarf' | 'none';
  scale?: number;
  showBeacon?: boolean;
  hasSword?: boolean;
  hasBeard?: boolean;
  prop?: 'staff' | 'hammer' | 'scroll' | 'none';
}) {
  const y = groundHeightAt(x, z);
  const shadowTex = useMemo(() => getSharedRadialShadowTexture(), []);
  const npcRootRef = useRef<THREE.Group>(null);
  const npcBodyRef = useRef<THREE.Group>(null);
  const phaseOffset = useMemo(() => (x * 0.7 + z * 0.3) % (Math.PI * 2), [x, z]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const root = npcRootRef.current;
    if (!root) return;

    const dx = liveSim.playerX - x;
    const dz = liveSim.playerZ - z;
    const dist = Math.hypot(dx, dz);
    const targetYaw = dist < 6.8 && dist > 0.25 ? Math.atan2(dx, dz) : rotY;
    root.rotation.y = stepAngleToward(root.rotation.y, targetYaw, 5.5, dt, 'damp');

    if (npcBodyRef.current) {
      const t = state.clock.elapsedTime + phaseOffset;
      npcBodyRef.current.position.y = Math.sin(t * 1.7) * 0.012;
      npcBodyRef.current.rotation.x = Math.sin(t * 1.1) * 0.018;
    }
  });

  return (
    <group ref={npcRootRef} position={[x, y, z]} rotation={[0, rotY, 0]} scale={[scale, scale, scale]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <circleGeometry args={[0.64, 14]} />
        <meshBasicMaterial map={shadowTex} transparent depthWrite={false} opacity={0.68} />
      </mesh>
      <group ref={npcBodyRef}>
      {/* Boots */}
      <mesh position={[-0.1, 0.28, 0]} castShadow>
        <cylinderGeometry args={[0.075, 0.065, 0.48, 6]} />
        <meshStandardMaterial color="#3c2b1e" roughness={0.86} flatShading />
      </mesh>
      <mesh position={[-0.1, 0.06, 0.04]} castShadow>
        <boxGeometry args={[0.1, 0.09, 0.18]} />
        <meshStandardMaterial color="#312217" roughness={0.88} flatShading />
      </mesh>
      <mesh position={[0.1, 0.28, 0]} castShadow>
        <cylinderGeometry args={[0.075, 0.065, 0.48, 6]} />
        <meshStandardMaterial color="#3c2b1e" roughness={0.86} flatShading />
      </mesh>
      <mesh position={[0.1, 0.06, 0.04]} castShadow>
        <boxGeometry args={[0.1, 0.09, 0.18]} />
        <meshStandardMaterial color="#312217" roughness={0.88} flatShading />
      </mesh>

      {/* Flared Tunic & Belt */}
      <mesh position={[0, 0.88, 0]} castShadow>
        <cylinderGeometry args={[0.19, 0.27, 0.76, 8]} />
        <meshStandardMaterial color={tunicColor} roughness={0.88} flatShading />
      </mesh>
      <mesh position={[0, 0.9, 0]}>
        <cylinderGeometry args={[0.225, 0.23, 0.07, 8]} />
        <meshStandardMaterial color="#3d2b1d" roughness={0.84} flatShading />
      </mesh>
      <mesh position={[0, 0.9, 0.22]}>
        <boxGeometry args={[0.08, 0.065, 0.03]} />
        <meshStandardMaterial color="#c99c4e" metalness={0.65} roughness={0.42} flatShading />
      </mesh>

      {/* Shoulder Mantle & Draped Cloak */}
      <mesh position={[0, 1.24, 0]} castShadow>
        <cylinderGeometry args={[0.19, 0.26, 0.18, 8]} />
        <meshStandardMaterial color={cloakColor} roughness={0.9} flatShading />
      </mesh>
      <mesh position={[0, 0.84, -0.14]} rotation={[0.06, 0, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.3, 0.94, 7, 1, false, Math.PI * 0.62, Math.PI * 0.76]} />
        <meshStandardMaterial color={cloakColor} roughness={0.92} side={THREE.DoubleSide} flatShading />
      </mesh>

      {/* Arms & Hands */}
      <mesh position={[-0.25, 1.06, 0.04]} rotation={[0.15, 0, 0.18]} castShadow>
        <cylinderGeometry args={[0.058, 0.05, 0.38, 6]} />
        <meshStandardMaterial color={tunicColor} roughness={0.88} flatShading />
      </mesh>
      <mesh position={[0.25, 1.06, 0.05]} rotation={[0.22, 0, -0.18]} castShadow>
        <cylinderGeometry args={[0.058, 0.05, 0.38, 6]} />
        <meshStandardMaterial color={tunicColor} roughness={0.88} flatShading />
      </mesh>

      {/* Chiseled Head & Nose */}
      <mesh position={[0, 1.46, 0.01]} castShadow>
        <icosahedronGeometry args={[0.135, 1]} />
        <meshStandardMaterial color="#d2ab8f" roughness={0.78} flatShading />
      </mesh>
      <mesh position={[0, 1.45, 0.14]} rotation={[-0.2, 0, 0]}>
        <coneGeometry args={[0.025, 0.075, 4]} />
        <meshStandardMaterial color="#c99f83" roughness={0.78} flatShading />
      </mesh>

      {hasBeard && (
        <mesh position={[0, 1.31, 0.11]} rotation={[0.15, 0, 0]} castShadow>
          <coneGeometry args={[0.115, 0.3, 5]} />
          <meshStandardMaterial color="#8c4f2b" roughness={0.9} flatShading />
        </mesh>
      )}
      {headgear === 'hood' && (
        <mesh position={[0, 1.53, -0.02]} rotation={[-0.15, 0, 0]} castShadow>
          <coneGeometry args={[0.185, 0.34, 7]} />
          <meshStandardMaterial color={cloakColor} roughness={0.9} flatShading />
        </mesh>
      )}
      {headgear === 'scarf' && (
        <mesh position={[0, 1.54, -0.03]} castShadow>
          <dodecahedronGeometry args={[0.145, 0]} />
          <meshStandardMaterial color="#d6d3d1" roughness={0.88} flatShading />
        </mesh>
      )}
      {hasSword && (
        <group position={[0.26, 0.88, 0.14]} rotation={[1.1, 0, -0.15]}>
          <mesh position={[0, -0.06, 0]}>
            <cylinderGeometry args={[0.018, 0.02, 0.16, 5]} />
            <meshStandardMaterial color="#3b281a" roughness={0.85} flatShading />
          </mesh>
          <mesh position={[0, 0.02, 0]}>
            <boxGeometry args={[0.16, 0.024, 0.03]} />
            <meshStandardMaterial color="#9aa4b0" metalness={0.7} roughness={0.35} flatShading />
          </mesh>
          <mesh geometry={RANGER_BLADE_GEO} position={[0, 0.03, 0]}>
            <meshStandardMaterial color="#d2dbe5" metalness={0.78} roughness={0.28} flatShading />
          </mesh>
        </group>
      )}
      {prop === 'staff' && (
        <mesh position={[-0.31, 0.78, 0.12]} rotation={[0.08, 0, 0.06]} castShadow>
          <cylinderGeometry args={[0.024, 0.03, 1.56, 5]} />
          <meshStandardMaterial color="#583c26" roughness={0.9} flatShading />
        </mesh>
      )}
      {prop === 'hammer' && (
        <group position={[0.29, 0.88, 0.16]} rotation={[0.9, 0, -0.2]}>
          <mesh position={[0, 0.18, 0]}>
            <cylinderGeometry args={[0.022, 0.022, 0.56, 5]} />
            <meshStandardMaterial color="#4e3521" roughness={0.9} flatShading />
          </mesh>
          <mesh position={[0, 0.44, 0]} castShadow>
            <boxGeometry args={[0.22, 0.13, 0.13]} />
            <meshStandardMaterial color="#59626d" metalness={0.7} roughness={0.4} flatShading />
          </mesh>
        </group>
      )}
      {prop === 'scroll' && (
        <mesh position={[-0.27, 0.92, 0.18]} rotation={[0.4, 0.2, 0.5]}>
          <cylinderGeometry args={[0.035, 0.035, 0.34, 6]} />
          <meshStandardMaterial color="#e7dcc4" roughness={0.88} flatShading />
        </mesh>
      )}
      {showBeacon && (
        <mesh position={[0, 2.08, 0]}>
          <octahedronGeometry args={[0.14, 0]} />
          <meshBasicMaterial color="#fbbf24" />
        </mesh>
      )}
      </group>
    </group>
  );
}

function StoryNpcsAndCamp() {
  const mainStep = useGameStore((s) => s.mainStep);
  const flags = useGameStore((s) => s.flags);
  const sideQuests = useGameStore((s) => s.sideQuests);

  const flameRef = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (flameRef.current) {
      const s = 1 + Math.sin(state.clock.elapsedTime * 11) * 0.14;
      flameRef.current.scale.set(1, s, 1);
    }
  });

  const edranX = flags.edranRescued ? VILLAGE_POS.x - 1.5 : RANGER_POS.x;
  const edranZ = flags.edranRescued ? VILLAGE_POS.z + 2.0 : RANGER_POS.z;
  const rangerFireY = groundHeightAt(RANGER_POS.x, RANGER_POS.z);

  const edranBeacon =
    mainStep === 'ch1_find_edran' ||
    mainStep === 'ch1_escort_liska' ||
    mainStep === 'ch2_talk_village' ||
    mainStep === 'ch4_prepare_assault' ||
    mainStep === 'ch6_return_liska' ||
    sideQuests.sq_lost_supplies.status === 'available';

  const miraBeacon =
    mainStep === 'ch1_escort_liska' ||
    sideQuests.sq_healer_hope.status === 'available' ||
    (sideQuests.sq_healer_hope.status === 'active' && sideQuests.sq_healer_hope.progress >= 3);

  const bruniBeacon =
    mainStep === 'ch2_return_liska' ||
    mainStep === 'ch3_talk_bruni' ||
    sideQuests.sq_stone_kin.status === 'available' ||
    (sideQuests.sq_stone_kin.status === 'active' && sideQuests.sq_stone_kin.progress >= 3);

  const rovanBeacon = mainStep === 'ch4_confront_rovan';

  const elkaBeacon =
    sideQuests.sq_forest_song.status === 'available' ||
    (sideQuests.sq_forest_song.status === 'active' && sideQuests.sq_forest_song.progress >= 3);

  const merchantBeacon = mainStep === 'ch2_talk_merchant';

  return (
    <group name="story-npcs">
      <StylizedVillager
        x={edranX}
        z={edranZ}
        rotY={flags.edranRescued ? 0.5 : -0.35}
        tunicColor="#2f4a33"
        cloakColor="#233727"
        headgear="hood"
        hasSword
        showBeacon={edranBeacon}
      />
      <StylizedVillager
        x={VILLAGE_POS.x + 1.8}
        z={VILLAGE_POS.z + 1.6}
        rotY={-0.65}
        tunicColor="#325b52"
        cloakColor="#5a4332"
        headgear="scarf"
        prop="staff"
        showBeacon={miraBeacon}
      />
      <StylizedVillager
        x={VILLAGE_POS.x + 4.4}
        z={VILLAGE_POS.z + 0.5}
        rotY={-1.2}
        tunicColor="#5d422d"
        cloakColor="#3d4959"
        scale={0.82}
        hasBeard
        prop="hammer"
        showBeacon={bruniBeacon}
      />
      <StylizedVillager
        x={VILLAGE_POS.x - 4.6}
        z={VILLAGE_POS.z + 0.2}
        rotY={1.1}
        tunicColor="#593335"
        cloakColor="#332b2d"
        prop="scroll"
        showBeacon={rovanBeacon}
      />
      <StylizedVillager
        x={VILLAGE_POS.x + 0.8}
        z={VILLAGE_POS.z - 2.6}
        rotY={0.25}
        tunicColor="#554b5e"
        cloakColor="#463e4f"
        headgear="scarf"
        scale={0.94}
        prop="staff"
        showBeacon={elkaBeacon}
      />
      <StylizedVillager
        x={PATROL_POS.x - 5.5}
        z={PATROL_POS.z - 2.5}
        rotY={0.75}
        tunicColor="#68553d"
        cloakColor="#473c2d"
        scale={0.92}
        showBeacon={merchantBeacon}
      />
      <StylizedVillager
        x={flags.nelaRescued ? VILLAGE_POS.x - 3.2 : WATCHTOWER_POS.x - 5.2}
        z={flags.nelaRescued ? VILLAGE_POS.z + 0.6 : WATCHTOWER_POS.z + 6.4}
        rotY={flags.nelaRescued ? 0.65 : 0.2}
        tunicColor="#3d526b"
        cloakColor="#4d3d35"
        scale={0.94}
        showBeacon={!flags.nelaRescued && (mainStep === 'ch5_infiltrate_fortress' || mainStep === 'ch5_disable_beacons')}
      />

      {/* Stone-ringed Watchfire at Ranger Outpost */}
      <RigidBody
        type="fixed"
        colliders={false}
        friction={0}
        restitution={0}
        collisionGroups={RAPIER_GROUPS.STATIC_WORLD}
        position={[RANGER_POS.x - 2.2, rangerFireY, RANGER_POS.z + 1.1]}
      >
        <CylinderCollider args={[0.35, 0.76]} position={[0, 0.25, 0]} />
        {[0, 1, 2, 3, 4, 5, 6].map((idx) => {
          const a = (idx / 7) * Math.PI * 2;
          return (
            <mesh key={idx} position={[Math.cos(a) * 0.56, 0.11, Math.sin(a) * 0.56]} rotation={[0, a, 0]} castShadow>
              <dodecahedronGeometry args={[0.17, 0]} />
              <meshStandardMaterial color="#5c636b" roughness={0.92} flatShading />
            </mesh>
          );
        })}
        {[0, 1, 2].map((idx) => {
          const a = (idx / 3) * Math.PI * 2 + 0.3;
          return (
            <mesh key={idx} position={[Math.cos(a) * 0.14, 0.18, Math.sin(a) * 0.14]} rotation={[0.4, a, 0.4]}>
              <cylinderGeometry args={[0.05, 0.06, 0.58, 5]} />
              <meshStandardMaterial color="#4a3320" roughness={0.95} flatShading />
            </mesh>
          );
        })}
        <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.42, 8]} />
          <meshStandardMaterial color="#231c18" emissive="#9a3412" emissiveIntensity={0.65} roughness={1} />
        </mesh>
        <group ref={flameRef} position={[0, 0.35, 0]}>
          <mesh>
            <coneGeometry args={[0.26, 0.65, 5]} />
            <meshBasicMaterial color="#f97316" />
          </mesh>
          <mesh position={[0, -0.06, 0]}>
            <coneGeometry args={[0.15, 0.42, 5]} />
            <meshBasicMaterial color="#fde047" />
          </mesh>
        </group>
        <pointLight position={[0, 0.9, 0]} color="#fb923c" intensity={4.8} distance={11} decay={2} />
      </RigidBody>
    </group>
  );
}

function RiderlessHorseProp() {
  const hx = SPAWN_POS.x + 2.5;
  const hz = SPAWN_POS.z - 5.5;
  const hy = groundHeightAt(hx, hz);
  return (
    <RigidBody
      type="fixed"
      colliders={false}
      friction={0}
      restitution={0}
      collisionGroups={RAPIER_GROUPS.STATIC_WORLD}
      position={[hx, hy, hz]}
      rotation={[0, -1.22, 0]}
      name="riderless-horse"
    >
      <CuboidCollider args={[0.42, 0.78, 0.78]} position={[0, 0.78, 0]} />
      {/* Barrel Torso & Haunches */}
      <mesh position={[0, 0.94, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[0.92, 1.32, 0.88]} castShadow>
        <cylinderGeometry args={[0.28, 0.3, 1.05, 7]} />
        <meshStandardMaterial color="#64422c" roughness={0.86} flatShading />
      </mesh>
      <mesh position={[0, 0.96, 0.46]} castShadow>
        <dodecahedronGeometry args={[0.27, 0]} />
        <meshStandardMaterial color="#5d3d28" roughness={0.86} flatShading />
      </mesh>
      <mesh position={[0, 0.94, -0.46]} castShadow>
        <dodecahedronGeometry args={[0.26, 0]} />
        <meshStandardMaterial color="#593a26" roughness={0.86} flatShading />
      </mesh>

      {/* Tapered Neck, Jagged Mane & Chiseled Head */}
      <mesh position={[0, 1.24, 0.62]} rotation={[0.52, 0, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.21, 0.62, 6]} />
        <meshStandardMaterial color="#593a24" roughness={0.86} flatShading />
      </mesh>
      {[0.12, 0.26, 0.4].map((o, idx) => (
        <mesh key={idx} position={[0, 1.15 + o * 0.65, 0.48 + o * 0.4]} rotation={[-0.25, 0, 0]}>
          <coneGeometry args={[0.045, 0.16, 4]} />
          <meshStandardMaterial color="#271911" roughness={0.92} flatShading />
        </mesh>
      ))}
      <mesh position={[0, 1.43, 0.92]} rotation={[0.38, 0, 0]} castShadow>
        <cylinderGeometry args={[0.085, 0.145, 0.46, 6]} />
        <meshStandardMaterial color="#4e321e" roughness={0.88} flatShading />
      </mesh>
      <mesh position={[-0.075, 1.59, 0.8]} rotation={[0.1, 0, 0.18]}>
        <coneGeometry args={[0.032, 0.11, 4]} />
        <meshStandardMaterial color="#4e321e" roughness={0.88} flatShading />
      </mesh>
      <mesh position={[0.075, 1.59, 0.8]} rotation={[0.1, 0, -0.18]}>
        <coneGeometry args={[0.032, 0.11, 4]} />
        <meshStandardMaterial color="#4e321e" roughness={0.88} flatShading />
      </mesh>

      {/* Tail */}
      <mesh position={[0, 0.82, -0.78]} rotation={[-0.35, 0, 0]} castShadow>
        <coneGeometry args={[0.075, 0.56, 5]} />
        <meshStandardMaterial color="#241710" roughness={0.92} flatShading />
      </mesh>

      {/* Saddle Blanket & Leather Saddle */}
      <mesh position={[0, 1.16, 0.02]} castShadow>
        <boxGeometry args={[0.62, 0.1, 0.62]} />
        <meshStandardMaterial color="#7f1d1d" roughness={0.82} flatShading />
      </mesh>
      <mesh position={[0, 1.24, 0.02]} castShadow>
        <boxGeometry args={[0.52, 0.11, 0.42]} />
        <meshStandardMaterial color="#3b2618" roughness={0.78} flatShading />
      </mesh>

      {/* Legs & Hooves */}
      {[
        [-0.19, 0.44],
        [0.19, 0.44],
        [-0.19, -0.44],
        [0.19, -0.44],
      ].map(([lx, lz], idx) => (
        <group key={idx} position={[lx, 0.44, lz]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.068, 0.048, 0.82, 5]} />
            <meshStandardMaterial color="#4a301e" roughness={0.9} flatShading />
          </mesh>
          <mesh position={[0, -0.4, 0]}>
            <cylinderGeometry args={[0.052, 0.058, 0.09, 5]} />
            <meshStandardMaterial color="#1f1712" roughness={0.8} flatShading />
          </mesh>
        </group>
      ))}
    </RigidBody>
  );
}

function LandmarksAndArchitecture() {
  const campY = groundHeightAt(CAMPSITE_POS.x, CAMPSITE_POS.z);
  const villageY = groundHeightAt(VILLAGE_POS.x, VILLAGE_POS.z);
  const towerY = groundHeightAt(WATCHTOWER_POS.x, WATCHTOWER_POS.z);
  const caveY = groundHeightAt(CAVE_POS.x, CAVE_POS.z);
  const patrolY = groundHeightAt(PATROL_POS.x, PATROL_POS.z);
  const quarryY = groundHeightAt(QUARRY_POS.x, QUARRY_POS.z);

  const flags = useGameStore((s) => s.flags);

  const wheelGeo = useMemo(() => makeSpokedWheelGeo(0.42, 0.09), []);
  const caveBoulderGeo = useMemo(() => makeChiseledRockGeo(99), []);

  useEffect(() => {
    return () => {
      wheelGeo.dispose();
      caveBoulderGeo.dispose();
    };
  }, [wheelGeo, caveBoulderGeo]);

  return (
    <group name="middle-earth-landmarks">
      <RiderlessHorseProp />

      {/* Wooden Fingerpost Milestone Signs along road */}
      {FINGERPOST_SPECS.map((sign, idx) => {
        const sy = groundHeightAt(sign.x, sign.z);
        return (
          <RigidBody
            key={idx}
            type="fixed"
            colliders={false}
            friction={0}
            restitution={0}
            collisionGroups={RAPIER_GROUPS.STATIC_WORLD}
            position={[sign.x, sy, sign.z]}
            rotation={[0, sign.rot, 0]}
          >
            <CylinderCollider args={[0.85, 0.22]} position={[0, 0.8, 0]} />
            <mesh position={[0, 0.78, 0]} castShadow>
              <cylinderGeometry args={[0.06, 0.088, 1.56, 5]} />
              <meshStandardMaterial color="#583f2a" roughness={0.92} flatShading />
            </mesh>
            <mesh position={[0, 1.58, 0]}>
              <coneGeometry args={[0.075, 0.12, 5]} />
              <meshStandardMaterial color="#4b3522" roughness={0.92} flatShading />
            </mesh>
            <mesh position={[0.24, 1.28, 0]} castShadow>
              <boxGeometry args={[0.74, 0.22, 0.065]} />
              <meshStandardMaterial color="#78583b" roughness={0.9} flatShading />
            </mesh>
            <mesh position={[0.66, 1.28, 0]} rotation={[0, 0, -Math.PI / 2]}>
              <coneGeometry args={[0.11, 0.14, 4]} />
              <meshStandardMaterial color="#78583b" roughness={0.9} flatShading />
            </mesh>
          </RigidBody>
        );
      })}

      {/* Wrecked Caravan Cart & Scattered Cargo at Patrol Trail (Chapter II) */}
      <RigidBody
        type="fixed"
        colliders={false}
        friction={0}
        restitution={0}
        collisionGroups={RAPIER_GROUPS.STATIC_WORLD}
        position={[PATROL_POS.x - 1.5, patrolY, PATROL_POS.z + 0.5]}
        rotation={[0, 0.42, 0]}
        name="caravan-wreckage"
      >
        <CuboidCollider args={[1.15, 0.55, 0.82]} position={[0, 0.55, 0]} />
        <CylinderCollider args={[0.36, 0.42]} position={[-1.4, 0.32, 1.15]} />
        <group rotation={[0.08, 0, -0.14]}>
          <mesh position={[0, 0.48, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.15, 0.52, 1.38]} />
            <meshStandardMaterial color="#5b412c" roughness={0.92} flatShading />
          </mesh>
          {/* Timber side rails */}
          <mesh position={[0, 0.84, 0.65]} castShadow>
            <boxGeometry args={[2.0, 0.22, 0.08]} />
            <meshStandardMaterial color="#493321" roughness={0.92} flatShading />
          </mesh>
          <mesh position={[0, 0.84, -0.65]} castShadow>
            <boxGeometry args={[2.0, 0.22, 0.08]} />
            <meshStandardMaterial color="#493321" roughness={0.92} flatShading />
          </mesh>
          {/* Spoked wooden wheels */}
          <mesh geometry={wheelGeo} position={[-0.75, 0.36, 0.74]} castShadow>
            <meshStandardMaterial vertexColors roughness={0.9} flatShading />
          </mesh>
          <mesh geometry={wheelGeo} position={[0.75, 0.36, -0.74]} rotation={[0.28, 0.12, 0]} castShadow>
            <meshStandardMaterial vertexColors roughness={0.9} flatShading />
          </mesh>
          {/* Spilled cargo barrel & crate */}
          <mesh position={[-1.4, 0.32, 1.15]} rotation={[0.3, 0.6, 1.3]} castShadow>
            <cylinderGeometry args={[0.28, 0.28, 0.62, 7]} />
            <meshStandardMaterial color="#67492e" roughness={0.9} flatShading />
          </mesh>
        </group>
      </RigidBody>

      {/* Osada Líska (Warm inhabited timber & stone settlement) */}
      <group position={[VILLAGE_POS.x, villageY, VILLAGE_POS.z]} name="osada-liska">
        {COTTAGE_SPECS.map((c, idx) => (
          <RigidBody
            key={idx}
            type="fixed"
            colliders={false}
            friction={0}
            restitution={0}
            collisionGroups={RAPIER_GROUPS.STATIC_WORLD}
            position={[c.dx, 0, c.dz]}
            rotation={[0, c.rot, 0]}
          >
            <CuboidCollider args={[2.18, 1.7, 2.58]} position={[0, 1.7, 0]} />
            {/* Stone Foundation Plinth + Threshold Step */}
            <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
              <boxGeometry args={[4.2, 0.7, 5.0]} />
              <meshStandardMaterial color="#666e75" roughness={0.92} flatShading />
            </mesh>
            <mesh position={[0, 0.14, 2.65]} castShadow receiveShadow>
              <boxGeometry args={[1.35, 0.28, 0.45]} />
              <meshStandardMaterial color="#757d84" roughness={0.92} flatShading />
            </mesh>

            {/* Plaster-and-Timber Cabin Walls */}
            <mesh position={[0, 1.4, 0]} castShadow receiveShadow>
              <boxGeometry args={[3.9, 1.55, 4.65]} />
              <meshStandardMaterial color="#9c8a74" roughness={0.92} flatShading />
            </mesh>

            {/* Recessed Heavy Oak Door */}
            <mesh position={[-0.78, 1.18, 2.34]}>
              <boxGeometry args={[0.82, 1.32, 0.08]} />
              <meshStandardMaterial color="#4d3522" roughness={0.88} flatShading />
            </mesh>

            {/* Warm Glowing Paned Window + Shutters */}
            <mesh position={[0.72, 1.46, 2.36]}>
              <boxGeometry args={[0.72, 0.56, 0.1]} />
              <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={1.15} />
            </mesh>
            <mesh position={[0.28, 1.46, 2.36]}>
              <boxGeometry args={[0.16, 0.62, 0.08]} />
              <meshStandardMaterial color="#463120" roughness={0.9} flatShading />
            </mesh>
            <mesh position={[1.16, 1.46, 2.36]}>
              <boxGeometry args={[0.16, 0.62, 0.08]} />
              <meshStandardMaterial color="#463120" roughness={0.9} flatShading />
            </mesh>

            {/* Heavy Corner & Wall Timber Framing Posts */}
            {[
              [-1.98, 2.25],
              [1.98, 2.25],
              [-1.98, -2.25],
              [1.98, -2.25],
            ].map(([px, pz], pid) => (
              <mesh key={pid} position={[px, 1.45, pz]} castShadow>
                <boxGeometry args={[0.28, 1.75, 0.28]} />
                <meshStandardMaterial color="#4b3624" roughness={0.92} flatShading />
              </mesh>
            ))}
            <mesh position={[0, 2.12, 2.35]}>
              <boxGeometry args={[4.1, 0.16, 0.18]} />
              <meshStandardMaterial color="#4b3624" roughness={0.92} flatShading />
            </mesh>

            {/* Tapered Stone Hearth Chimney */}
            <mesh position={[-1.42, 2.25, -1.95]} castShadow>
              <cylinderGeometry args={[0.38, 0.56, 3.4, 4]} />
              <meshStandardMaterial color="#586068" roughness={0.92} flatShading />
            </mesh>

            {/* Gabled Overhanging Low-Poly Roof + Ridge Beam */}
            <mesh position={[0, 3.22, 0]} castShadow>
              <boxGeometry args={[0.24, 0.24, 5.45]} />
              <meshStandardMaterial color="#463222" roughness={0.92} flatShading />
            </mesh>
            <mesh position={[-1.02, 2.66, 0]} rotation={[0, 0, 0.55]} castShadow receiveShadow>
              <boxGeometry args={[2.68, 0.16, 5.4]} />
              <meshStandardMaterial color={c.roofColor} roughness={0.92} flatShading />
            </mesh>
            <mesh position={[1.02, 2.66, 0]} rotation={[0, 0, -0.55]} castShadow receiveShadow>
              <boxGeometry args={[2.68, 0.16, 5.4]} />
              <meshStandardMaterial color={c.roofColor} roughness={0.92} flatShading />
            </mesh>
            {/* Gable triangles */}
            <mesh position={[0, 2.62, 2.28]} rotation={[0, Math.PI / 4, 0]}>
              <cylinderGeometry args={[0.02, 1.9, 0.95, 4]} />
              <meshStandardMaterial color="#8b7a66" roughness={0.92} flatShading />
            </mesh>
          </RigidBody>
        ))}

        {/* Village Supply Barrels & Rovan's Ledger Table */}
        <RigidBody
          type="fixed"
          colliders={false}
          friction={0}
          restitution={0}
          collisionGroups={RAPIER_GROUPS.STATIC_WORLD}
          position={[-4.8, 0, 1.4]}
        >
          <CuboidCollider args={[0.6, 0.35, 0.42]} position={[0, 0.35, 0]} />
          <CylinderCollider args={[0.36, 0.3]} position={[1.05, 0.36, -0.3]} />
          <mesh position={[0, 0.48, 0]} castShadow>
            <boxGeometry args={[1.15, 0.12, 0.78]} />
            <meshStandardMaterial color="#6e523a" roughness={0.86} flatShading />
          </mesh>
          <mesh position={[-0.45, 0.22, -0.28]} castShadow>
            <boxGeometry args={[0.1, 0.44, 0.1]} />
            <meshStandardMaterial color="#4d3826" roughness={0.9} />
          </mesh>
          <mesh position={[0.45, 0.22, 0.28]} castShadow>
            <boxGeometry args={[0.1, 0.44, 0.1]} />
            <meshStandardMaterial color="#4d3826" roughness={0.9} />
          </mesh>
          <mesh position={[1.05, 0.34, -0.3]} castShadow>
            <cylinderGeometry args={[0.25, 0.27, 0.68, 7]} />
            <meshStandardMaterial color="#64452b" roughness={0.9} flatShading />
          </mesh>
        </RigidBody>
      </group>

      {/* Abandoned Goblin Campsite */}
      <group position={[CAMPSITE_POS.x, campY, CAMPSITE_POS.z]} name="abandoned-goblin-campsite">
        {[
          { dx: -3.2, dz: -2.2, rot: 0.65 },
          { dx: 3.4, dz: -2.4, rot: -0.55 },
        ].map((t, i) => (
          <RigidBody
            key={i}
            type="fixed"
            colliders={false}
            friction={0}
            restitution={0}
            collisionGroups={RAPIER_GROUPS.STATIC_WORLD}
            position={[t.dx, 0, t.dz]}
            rotation={[0, t.rot, 0]}
          >
            <CylinderCollider args={[1.15, 1.8]} position={[0, 1.15, 0]} />
            <mesh position={[0, 1.05, 0]} castShadow receiveShadow>
              <coneGeometry args={[1.95, 2.2, 5]} />
              <meshStandardMaterial color="#604b38" roughness={0.95} flatShading />
            </mesh>
            <mesh position={[0, 1.15, 0]} rotation={[0, 0.4, 0]}>
              <cylinderGeometry args={[0.06, 0.06, 2.55, 5]} />
              <meshStandardMaterial color="#483322" roughness={0.92} flatShading />
            </mesh>
          </RigidBody>
        ))}

        <RigidBody
          type="fixed"
          colliders={false}
          friction={0}
          restitution={0}
          collisionGroups={RAPIER_GROUPS.STATIC_WORLD}
          position={[1.2, 0.4, -0.8]}
        >
          <CuboidCollider args={[0.52, 0.42, 0.52]} />
          <mesh castShadow receiveShadow>
            <boxGeometry args={[1.0, 0.8, 1.0]} />
            <meshStandardMaterial color="#6e523a" roughness={0.88} flatShading />
          </mesh>
        </RigidBody>

        {/* Cold Ash Fire Ring */}
        <mesh position={[0, 0.08, 0.5]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.95, 8]} />
          <meshStandardMaterial color="#25272b" roughness={1} />
        </mesh>
        {[0, 1, 2, 3, 4].map((idx) => {
          const a = (idx / 5) * Math.PI * 2;
          return (
            <mesh key={idx} position={[Math.cos(a) * 0.72, 0.12, 0.5 + Math.sin(a) * 0.72]}>
              <dodecahedronGeometry args={[0.16, 0]} />
              <meshStandardMaterial color="#4c525a" roughness={0.92} flatShading />
            </mesh>
          );
        })}
      </group>

      {/* Staré trpasličí štoly (Carved Dwarven Mines & Geometric Portal) */}
      <group position={[CAVE_POS.x, caveY, CAVE_POS.z]} name="dwarven-mines">
        {[
          { dx: -2.6, dy: 1.8, dz: 0, sx: 2.2, sy: 3.2, sz: 2.6, hx: 1.22, hy: 2.0, hz: 1.42 },
          { dx: 2.6, dy: 1.8, dz: 0, sx: 2.2, sy: 3.2, sz: 2.6, hx: 1.22, hy: 2.0, hz: 1.42 },
          { dx: 0, dy: 3.5, dz: -0.8, sx: 4.5, sy: 1.6, sz: 3.6, hx: 3.1, hy: 1.15, hz: 2.2 },
          { dx: 0, dy: 2.0, dz: -4.2, sx: 4.8, sy: 3.6, sz: 2.2, hx: 2.9, hy: 2.3, hz: 1.35 },
          { dx: -3.0, dy: 2.0, dz: -2.4, sx: 2.2, sy: 3.4, sz: 3.0, hx: 1.32, hy: 2.1, hz: 1.62 },
          { dx: 3.0, dy: 2.0, dz: -2.4, sx: 2.2, sy: 3.4, sz: 3.0, hx: 1.32, hy: 2.1, hz: 1.62 },
        ].map((b, i) => (
          <RigidBody
            key={i}
            type="fixed"
            colliders={false}
            friction={0}
            restitution={0}
            collisionGroups={RAPIER_GROUPS.STATIC_WORLD}
            position={[b.dx, b.dy, b.dz]}
          >
            <CuboidCollider args={[b.hx, b.hy, b.hz]} />
            <mesh
              geometry={caveBoulderGeo}
              castShadow
              receiveShadow
              scale={[b.sx, b.sy, b.sz]}
              rotation={[i * 0.2, i * 0.7, 0]}
            >
              <meshStandardMaterial vertexColors roughness={0.94} flatShading />
            </mesh>
          </RigidBody>
        ))}

        {/* Monumental Carved Dwarven Trapezoidal Stone Archway */}
        <RigidBody
          type="fixed"
          colliders={false}
          friction={0}
          restitution={0}
          collisionGroups={RAPIER_GROUPS.STATIC_WORLD}
        >
          <CuboidCollider args={[0.3, 1.6, 0.34]} position={[-1.9, 1.55, 1.15]} />
          <CuboidCollider args={[0.3, 1.6, 0.34]} position={[1.9, 1.55, 1.15]} />
          <CuboidCollider args={[2.32, 0.36, 0.42]} position={[0, 3.24, 1.15]} />
          <mesh position={[-1.9, 1.55, 1.15]} castShadow>
            <boxGeometry args={[0.56, 3.1, 0.65]} />
            <meshStandardMaterial color="#676f78" roughness={0.86} flatShading />
          </mesh>
          <mesh position={[1.9, 1.55, 1.15]} castShadow>
            <boxGeometry args={[0.56, 3.1, 0.65]} />
            <meshStandardMaterial color="#676f78" roughness={0.86} flatShading />
          </mesh>
          <mesh position={[0, 3.22, 1.15]} castShadow>
            <boxGeometry args={[4.6, 0.64, 0.78]} />
            <meshStandardMaterial color="#747d87" roughness={0.86} flatShading />
          </mesh>
          <mesh position={[0, 3.22, 1.56]}>
            <octahedronGeometry args={[0.24, 0]} />
            <meshStandardMaterial color="#b48d48" metalness={0.55} roughness={0.45} flatShading />
          </mesh>
        </RigidBody>

        {/* Dark Shadow Volume Inside Mines (Visual only - non-collidable) */}
        <mesh position={[0, 1.6, -2.0]}>
          <boxGeometry args={[3.4, 2.8, 3.2]} />
          <meshStandardMaterial color="#0f1216" roughness={0.98} />
        </mesh>
      </group>

      {/* Supply Wagon at Western Quarry (Side Quest IV) */}
      <RigidBody
        type="fixed"
        colliders={false}
        friction={0}
        restitution={0}
        collisionGroups={RAPIER_GROUPS.STATIC_WORLD}
        position={[QUARRY_POS.x, quarryY, QUARRY_POS.z]}
        rotation={[0, 0.65, 0]}
        name="quarry-supply-wagon"
      >
        <CuboidCollider args={[0.98, 1.0, 1.24]} position={[0, 1.0, 0]} />
        <mesh position={[0, 0.66, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.65, 0.66, 2.4]} />
          <meshStandardMaterial color="#705136" roughness={0.88} flatShading />
        </mesh>
        <mesh position={[0, 1.12, 0]} castShadow>
          <cylinderGeometry args={[0.85, 0.85, 2.2, 6, 1, false, 0, Math.PI]} />
          <meshStandardMaterial color="#d2c9b6" roughness={0.92} side={THREE.DoubleSide} flatShading />
        </mesh>
        {[
          [-0.86, 0.82],
          [0.86, 0.82],
          [-0.86, -0.82],
          [0.86, -0.82],
        ].map(([wx, wz], idx) => (
          <mesh key={idx} geometry={wheelGeo} position={[wx, 0.42, wz]} rotation={[0, Math.PI / 2, 0]} castShadow>
            <meshStandardMaterial vertexColors roughness={0.9} flatShading />
          </mesh>
        ))}
      </RigidBody>

      {/* Horská pevnost (Northern Mountain Fortress) */}
      <group position={[WATCHTOWER_POS.x, towerY, WATCHTOWER_POS.z]} name="mountain-fortress">
        {/* Two-step beveled stone dais collider so capsule walks onto the 0.425m platform smoothly */}
        <RigidBody
          type="fixed"
          colliders={false}
          friction={0}
          restitution={0}
          collisionGroups={RAPIER_GROUPS.STATIC_WORLD}
        >
          <CylinderCollider args={[0.11, WATCHTOWER_DAIS.outerRadius]} position={[0, 0.08, 0]} />
          <CylinderCollider args={[0.11, WATCHTOWER_DAIS.topRadius]} position={[0, 0.315, 0]} />
          <mesh position={[0, 0.2, 0]} receiveShadow>
            <cylinderGeometry args={[9.2, 9.8, 0.45, 10]} />
            <meshStandardMaterial color="#626970" roughness={0.9} flatShading />
          </mesh>
        </RigidBody>

        {WATCHTOWER_PILLAR_SPECS.map((p, idx) => (
          <RigidBody
            key={idx}
            type="fixed"
            colliders={false}
            friction={0}
            restitution={0}
            collisionGroups={RAPIER_GROUPS.STATIC_WORLD}
            position={[p.dx, p.h * 0.5, p.dz]}
          >
            <CuboidCollider args={[0.96, p.h * 0.5 + 0.15, 0.96]} />
            <mesh castShadow receiveShadow>
              <boxGeometry args={[1.55, p.h, 1.55]} />
              <meshStandardMaterial color="#6e757c" roughness={0.9} flatShading />
            </mesh>
            <mesh position={[0, -p.h * 0.5 + 0.35, 0]} castShadow receiveShadow>
              <boxGeometry args={[1.9, 0.58, 1.9]} />
              <meshStandardMaterial color="#585f66" roughness={0.92} flatShading />
            </mesh>
            <mesh position={[0, p.h * 0.5 - 0.15, 0]} castShadow receiveShadow>
              <boxGeometry args={[1.86, 0.38, 1.86]} />
              <meshStandardMaterial color="#7d848b" roughness={0.88} flatShading />
            </mesh>
            {/* Crenellation corner merlons */}
            {[-0.65, 0.65].map((cx) => (
              <mesh key={cx} position={[cx, p.h * 0.5 + 0.18, 0.65]} castShadow>
                <boxGeometry args={[0.42, 0.38, 0.42]} />
                <meshStandardMaterial color="#767d85" roughness={0.88} flatShading />
              </mesh>
            ))}
          </RigidBody>
        ))}

        {/* Ruined Rear Battlement Lintels */}
        <RigidBody
          type="fixed"
          colliders={false}
          friction={0}
          restitution={0}
          collisionGroups={RAPIER_GROUPS.STATIC_WORLD}
          position={[0, 5.4, -4.2]}
        >
          <CuboidCollider args={[5.15, 0.65, 0.78]} />
          <mesh castShadow receiveShadow>
            <boxGeometry args={[10.2, 1.25, 1.52]} />
            <meshStandardMaterial color="#6c737a" roughness={0.9} flatShading />
          </mesh>
        </RigidBody>

        {/* Central Carved Fortress Stone Pedestal */}
        <RigidBody
          type="fixed"
          colliders={false}
          friction={0}
          restitution={0}
          collisionGroups={RAPIER_GROUPS.STATIC_WORLD}
          position={[0, 0.9, -2.5]}
        >
          <CylinderCollider args={[0.75, 1.35]} />
          <mesh castShadow receiveShadow>
            <cylinderGeometry args={[1.08, 1.38, 1.15, 7]} />
            <meshStandardMaterial color="#737a82" roughness={0.88} flatShading />
          </mesh>
        </RigidBody>

        {/* Orc Wooden Spike Palisade Barricades on outer rim */}
        {[-7.6, 7.6].map((bx, bIdx) => (
          <RigidBody
            key={bIdx}
            type="fixed"
            colliders={false}
            friction={0}
            restitution={0}
            collisionGroups={RAPIER_GROUPS.STATIC_WORLD}
            position={[bx, 0.35, 2.2]}
            rotation={[0, bIdx === 0 ? 0.5 : -0.5, 0]}
          >
            <CuboidCollider args={[0.95, 0.85, 0.45]} position={[0, 0.65, 0]} />
            {[-0.7, 0, 0.7].map((sx, sIdx) => (
              <mesh key={sIdx} position={[sx, 0.65, 0]} rotation={[0.35, 0, 0]} castShadow>
                <coneGeometry args={[0.1, 1.5, 5]} />
                <meshStandardMaterial color="#4b3421" roughness={0.94} flatShading />
              </mesh>
            ))}
          </RigidBody>
        ))}

        {/* Wooden Prisoner Cage holding Nela & Merchants until freed (unmounts collider when freed!) */}
        {!flags.nelaRescued && (
          <RigidBody
            type="fixed"
            colliders={false}
            friction={0}
            restitution={0}
            collisionGroups={RAPIER_GROUPS.STATIC_WORLD}
            position={[-5.2, 0, 6.4]}
            name="prisoner-cage-bars"
          >
            <CuboidCollider args={[1.02, 1.18, 1.02]} position={[0, 1.18, 0]} />
            {[
              [-0.85, -0.85],
              [0.85, -0.85],
              [-0.85, 0.85],
              [0.85, 0.85],
              [0, 0.85],
              [0, -0.85],
            ].map(([bx, bz], idx) => (
              <mesh key={idx} position={[bx, 0.95, bz]} castShadow>
                <cylinderGeometry args={[0.055, 0.055, 1.9, 5]} />
                <meshStandardMaterial color="#4e3722" roughness={0.92} flatShading />
              </mesh>
            ))}
            <mesh position={[0, 1.92, 0]} castShadow>
              <boxGeometry args={[1.95, 0.14, 1.95]} />
              <meshStandardMaterial color="#45301d" roughness={0.92} flatShading />
            </mesh>
            <mesh position={[0, 2.18, 0]} castShadow>
              <coneGeometry args={[1.45, 0.45, 4]} />
              <meshStandardMaterial color="#3c2a1a" roughness={0.92} flatShading />
            </mesh>
          </RigidBody>
        )}
      </group>
    </group>
  );
}

function InteractiveWorldObjects() {
  const collectRefs = useRef<Array<THREE.Group | null>>([]);
  const storyRefs = useRef<Array<THREE.Group | null>>([]);
  const brazierFlameRefs = useRef<Array<THREE.Group | null>>([]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    liveSim.collectibles.forEach((c, idx) => {
      const grp = collectRefs.current[idx];
      if (!grp) return;
      grp.visible = !c.collected;
      if (!c.collected) {
        grp.position.set(c.x, c.y + 0.4 + Math.sin(t * 2.5 + idx) * 0.08, c.z);
        grp.rotation.y = t * 1.3 + idx;
      }
    });

    liveSim.storyInteractables.forEach((o, idx) => {
      const grp = storyRefs.current[idx];
      if (!grp) return;
      if (o.kind === 'stone_rune' || o.kind === 'signal_beacon') {
        grp.visible = true;
        const glow = grp.children[1];
        if (glow) {
          if (o.kind === 'stone_rune') {
            glow.visible = true;
            const mat = (glow as THREE.Mesh).material as THREE.MeshStandardMaterial;
            mat.color.setHex(o.done ? 0x34d399 : 0xfbbf24);
            mat.emissive.setHex(o.done ? 0x10b981 : 0xd97706);
          } else if (o.kind === 'signal_beacon') {
            glow.visible = !o.done;
            glow.scale.setScalar(0.95 + Math.sin(t * 12 + idx) * 0.15);
          }
        }
      } else if (o.kind === 'horse_clue' || o.kind === 'prisoner_cage' || o.kind === 'sq_wagon') {
        grp.visible = !o.done;
        grp.position.set(o.x, o.y + 1.85 + Math.sin(t * 3 + idx) * 0.1, o.z);
        grp.rotation.y = t * 1.8;
      } else {
        grp.visible = !o.done;
        if (!o.done) {
          grp.position.set(o.x, o.y + 0.45 + Math.sin(t * 2.4 + idx) * 0.07, o.z);
          if (o.kind !== 'sq_marker') grp.rotation.y = t * 1.1;
        }
      }
    });

    liveSim.braziers.forEach((b, idx) => {
      const grp = brazierFlameRefs.current[idx];
      if (!grp) return;
      grp.visible = b.lit;
      if (b.lit) {
        grp.scale.setScalar(0.95 + Math.sin(t * 13 + idx) * 0.14);
      }
    });
  });

  return (
    <group name="interactive-world-objects">
      {/* Craftable Resource & Consumable Collectibles */}
      {liveSim.collectibles.map((c, idx) => {
        const isHerb = c.itemId === 'athelas_herb';
        const isWater = c.itemId === 'pure_water';
        const isBread = c.itemId === 'travel_bread';
        return (
          <group
            key={c.id}
            ref={(el) => {
              collectRefs.current[idx] = el;
            }}
          >
            {isHerb ? (
              <group>
                {[-0.4, 0, 0.4].map((ang, leafIdx) => (
                  <mesh
                    key={leafIdx}
                    position={[Math.sin(ang) * 0.1, 0, Math.cos(ang) * 0.04]}
                    rotation={[0.25, ang * 2.2, ang * 0.8]}
                  >
                    <coneGeometry args={[0.09, 0.34, 4]} />
                    <meshStandardMaterial color="#4ade80" emissive="#16a34a" emissiveIntensity={0.55} flatShading />
                  </mesh>
                ))}
              </group>
            ) : isWater ? (
              <mesh>
                <octahedronGeometry args={[0.18, 0]} />
                <meshStandardMaterial color="#7dd3fc" emissive="#0284c7" emissiveIntensity={0.75} flatShading />
              </mesh>
            ) : isBread ? (
              <mesh scale={[1.2, 0.7, 0.9]}>
                <dodecahedronGeometry args={[0.19, 0]} />
                <meshStandardMaterial color="#d49b54" emissive="#92400e" emissiveIntensity={0.25} flatShading />
              </mesh>
            ) : (
              <mesh>
                <boxGeometry args={[0.3, 0.24, 0.3]} />
                <meshStandardMaterial color="#caa670" emissive="#b45309" emissiveIntensity={0.35} flatShading />
              </mesh>
            )}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.26, 0]}>
              <ringGeometry args={[0.2, 0.34, 8]} />
              <meshBasicMaterial
                color={isHerb ? '#4ade80' : isWater ? '#38bdf8' : '#fbbf24'}
                transparent
                opacity={0.48}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>
          </group>
        );
      })}

      {/* Story Interactables (Clues, Evidence, Stone Runes, Beacons, Side Quests) */}
      {liveSim.storyInteractables.map((o, idx) => {
        if (o.kind === 'stone_rune') {
          return (
            <RigidBody
              key={o.id}
              type="fixed"
              colliders={false}
              friction={0}
              restitution={0}
              collisionGroups={RAPIER_GROUPS.STATIC_WORLD}
              position={[o.x, o.y, o.z]}
            >
              <CylinderCollider args={[0.78, 0.36]} position={[0, 0.78, 0]} />
              <group
                ref={(el) => {
                  storyRefs.current[idx] = el;
                }}
              >
                <mesh position={[0, 0.78, 0]} castShadow>
                  <cylinderGeometry args={[0.28, 0.38, 1.56, 4]} />
                  <meshStandardMaterial color="#4e555e" roughness={0.9} flatShading />
                </mesh>
                <mesh position={[0, 1.72, 0]}>
                  <octahedronGeometry args={[0.21, 0]} />
                  <meshStandardMaterial color="#fbbf24" emissive="#d97706" emissiveIntensity={0.9} flatShading />
                </mesh>
              </group>
            </RigidBody>
          );
        }

        if (o.kind === 'signal_beacon') {
          return (
            <RigidBody
              key={o.id}
              type="fixed"
              colliders={false}
              friction={0}
              restitution={0}
              collisionGroups={RAPIER_GROUPS.STATIC_WORLD}
              position={[o.x, o.y, o.z]}
            >
              <CylinderCollider args={[0.6, 0.5]} position={[0, 0.6, 0]} />
              <group
                ref={(el) => {
                  storyRefs.current[idx] = el;
                }}
              >
                <mesh position={[0, 0.58, 0]} castShadow>
                  <cylinderGeometry args={[0.5, 0.28, 1.15, 6]} />
                  <meshStandardMaterial color="#272a30" roughness={0.65} metalness={0.55} flatShading />
                </mesh>
                <group position={[0, 1.32, 0]}>
                  <mesh>
                    <coneGeometry args={[0.38, 0.92, 5]} />
                    <meshBasicMaterial color="#ef4444" />
                  </mesh>
                  <pointLight color="#f97316" intensity={5.2} distance={13} decay={2} />
                </group>
              </group>
            </RigidBody>
          );
        }

        const isBeaconMarker = o.kind === 'horse_clue' || o.kind === 'prisoner_cage' || o.kind === 'sq_wagon';
        return (
          <group
            key={o.id}
            ref={(el) => {
              storyRefs.current[idx] = el;
            }}
          >
            {isBeaconMarker ? (
              <mesh>
                <octahedronGeometry args={[0.16, 0]} />
                <meshBasicMaterial color="#fbbf24" />
              </mesh>
            ) : o.kind === 'sq_herb' ? (
              <mesh>
                <coneGeometry args={[0.16, 0.42, 5]} />
                <meshStandardMaterial color="#4ade80" emissive="#16a34a" emissiveIntensity={0.7} flatShading />
              </mesh>
            ) : o.kind === 'sq_marker' ? (
              <mesh position={[0, 0.4, 0]}>
                <boxGeometry args={[0.42, 1.1, 0.34]} />
                <meshStandardMaterial color="#737b84" emissive="#38bdf8" emissiveIntensity={0.25} flatShading />
              </mesh>
            ) : (
              <mesh>
                <octahedronGeometry args={[0.24, 0]} />
                <meshStandardMaterial color="#fde68a" emissive="#f59e0b" emissiveIntensity={0.85} flatShading />
              </mesh>
            )}
          </group>
        );
      })}

      {/* Ignitable Iron Braziers (light up with Fire Spell!) */}
      {liveSim.braziers.map((b, idx) => (
        <RigidBody
          key={b.id}
          type="fixed"
          colliders={false}
          friction={0}
          restitution={0}
          collisionGroups={RAPIER_GROUPS.STATIC_WORLD}
          position={[b.x, b.y, b.z]}
        >
          <CylinderCollider args={[0.56, 0.44]} position={[0, 0.56, 0]} />
          <mesh position={[0, 0.55, 0]} castShadow>
            <cylinderGeometry args={[0.44, 0.24, 1.1, 6]} />
            <meshStandardMaterial color="#2a2d32" roughness={0.62} metalness={0.58} flatShading />
          </mesh>
          <group
            ref={(el) => {
              brazierFlameRefs.current[idx] = el;
            }}
            position={[0, 1.25, 0]}
            visible={false}
          >
            <mesh>
              <coneGeometry args={[0.32, 0.78, 5]} />
              <meshBasicMaterial color="#fb923c" />
            </mesh>
            <mesh position={[0, -0.06, 0]}>
              <coneGeometry args={[0.18, 0.48, 5]} />
              <meshBasicMaterial color="#fde047" />
            </mesh>
            <pointLight color="#fb923c" intensity={5.5} distance={14} decay={2} />
          </group>
        </RigidBody>
      ))}
    </group>
  );
}

export function MiddleEarthWorld({ isSoftwareGl }: { isSoftwareGl: boolean }) {
  return (
    <>
      <EnvironmentLighting isSoftwareGl={isSoftwareGl} />
      <TerrainMesh />
      <RiverAndWaterfall />
      <DistantMistyMountains />
      <InstancedForestAndRocks />
      <StoryNpcsAndCamp />
      <LandmarksAndArchitecture />
      <InteractiveWorldObjects />
    </>
  );
}
