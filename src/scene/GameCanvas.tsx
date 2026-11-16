import { Component, ReactNode, Suspense, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import * as THREE from 'three';
import { GandalfModel } from './GandalfModel';
import { EnemyGroup } from './EnemyModels';
import { MiddleEarthWorld } from './MiddleEarthWorld';
import { GameLoopController } from './GameLoopController';
import { CollisionDebugOverlay } from './CollisionDebugOverlay';

function detectSoftwareGl(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

class SceneErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-[#14181d] text-[#ede7d9] p-8">
          <div className="max-w-md text-center space-y-3">
            <h2 className="font-display text-2xl text-amber-200">3D vykreslování není dostupné</h2>
            <p className="text-sm text-slate-300">{this.state.message || 'Inicializace kontextu WebGL selhala.'}</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function GameCanvas() {
  const isSoftwareGl = useMemo(() => detectSoftwareGl(), []);
  const [contextLost, setContextLost] = useState(false);

  return (
    <div
      data-testid="game-canvas-container"
      className="fixed inset-0 w-full h-full bg-[#1a2229]"
    >
      {contextLost ? (
        <div className="w-full h-full flex items-center justify-center text-[#ede7d9]">
          <p className="font-display text-lg">Obnovování scény Středozemě...</p>
        </div>
      ) : (
        <SceneErrorBoundary>
          <Canvas
            frameloop={isSoftwareGl ? 'never' : 'always'}
            shadows={!isSoftwareGl}
            dpr={isSoftwareGl ? 1 : [1, 1.75]}
            camera={{ fov: 56, near: 0.15, far: 320, position: [0, 5, 62] }}
            gl={{
              antialias: !isSoftwareGl,
              powerPreference: 'high-performance',
              toneMapping: THREE.ACESFilmicToneMapping,
              toneMappingExposure: 1.02,
              outputColorSpace: THREE.SRGBColorSpace,
            }}
            onCreated={({ gl }) => {
              const el = gl.domElement;
              el.addEventListener('webglcontextlost', (e) => {
                e.preventDefault();
                setContextLost(true);
              });
              el.addEventListener('webglcontextrestored', () => {
                setContextLost(false);
              });
            }}
          >
            <Suspense fallback={null}>
              <Physics gravity={[0, -20, 0]} timeStep={1 / 60}>
                <MiddleEarthWorld isSoftwareGl={isSoftwareGl} />
                <GandalfModel />
                <EnemyGroup />
                <GameLoopController isSoftwareGl={isSoftwareGl} />
                <CollisionDebugOverlay />
              </Physics>
            </Suspense>
          </Canvas>
        </SceneErrorBoundary>
      )}
    </div>
  );
}
