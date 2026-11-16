import { lazy, Suspense, useEffect } from 'react';
import { GameCanvas } from './scene/GameCanvas';
import { TitleScreen } from './ui/TitleScreen';
import { PlayingHud } from './ui/PlayingHud';
import { GameModals } from './ui/GameModals';
import { WorldMapOverlay } from './ui/WorldMapOverlay';
import { useGameStore } from './game/store';
import { gameAudio } from './game/audio';

const WorldReview = import.meta.env.DEV ? lazy(() => import('./scene/WorldReview')) : null;

export default function App() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      useGameStore.getState().startGame();
    }
    return () => {
      gameAudio.dispose();
    };
  }, []);

  if (WorldReview && new URLSearchParams(window.location.search).get('view') === 'world') {
    return <Suspense fallback={<p>Načítání světa…</p>}><WorldReview /></Suspense>;
  }

  return (
    <main className="relative w-full h-full overflow-hidden bg-[#14181d]">
      <GameCanvas />
      <TitleScreen />
      <PlayingHud />
      <GameModals />
      <WorldMapOverlay />
    </main>
  );
}
