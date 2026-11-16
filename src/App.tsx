import { useEffect } from 'react';
import { GameCanvas } from './scene/GameCanvas';
import { TitleScreen } from './ui/TitleScreen';
import { PlayingHud } from './ui/PlayingHud';
import { GameModals } from './ui/GameModals';
import { WorldMapOverlay } from './ui/WorldMapOverlay';
import { useGameStore } from './game/store';
import { gameAudio } from './game/audio';

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
