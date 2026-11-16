import { useState } from 'react';
import { hasSavedCheckpoint, useGameStore } from '../game/store';

export function TitleScreen() {
  const phase = useGameStore((s) => s.phase);
  const startGame = useGameStore((s) => s.startGame);
  const restartGame = useGameStore((s) => s.restartGame);
  const loadCheckpoint = useGameStore((s) => s.loadCheckpoint);
  const settings = useGameStore((s) => s.settings);
  const setSettings = useGameStore((s) => s.setSettings);
  const [showSettings, setShowSettings] = useState(false);

  if (phase !== 'title') return null;

  const canContinue = hasSavedCheckpoint();

  const handleStartNew = () => {
    if (canContinue) {
      restartGame();
    } else {
      startGame();
    }
  };

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between pointer-events-none">
      {/* Asymmetric mist gradient scrim on left side so low-poly sky & valley vista shine on right */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(90deg, rgba(12, 16, 22, 0.86) 0%, rgba(12, 16, 22, 0.5) 40%, rgba(12, 16, 22, 0.08) 76%, rgba(12, 16, 22, 0.0) 100%)',
        }}
      />

      <div className="relative z-10 flex-1 flex items-center px-8 md:px-16">
        <div className="max-w-lg w-full pointer-events-auto">
          {/* Custom inline SVG Istari Staff & Star Emblem */}
          <svg
            viewBox="0 0 80 40"
            className="w-20 h-10 mb-5 text-[#e3be76]"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M40 3 L43.5 14 L54 17.5 L43.5 21 L40 32 L36.5 21 L26 17.5 L36.5 14 Z"
              stroke="currentColor"
              strokeWidth="1.4"
              fill="rgba(227, 190, 118, 0.16)"
            />
            <path d="M4 17.5 H22 M58 17.5 H76" stroke="currentColor" strokeWidth="1.2" opacity="0.65" />
            <path
              d="M22 17.5 L24.5 15 L27 17.5 L24.5 20 Z M53 17.5 L55.5 15 L58 17.5 L55.5 20 Z"
              fill="currentColor"
              opacity="0.55"
            />
            <circle cx="40" cy="17.5" r="2.2" fill="currentColor" />
          </svg>

          <p className="text-xs tracking-[0.26em] uppercase text-[#e3be76]/95 mb-2 hud-text-shadow">
            Rok 2960 Třetího věku · podhůří Mlžných hor
          </p>

          <h1
            className="font-display text-4xl md:text-5xl font-semibold text-[#f5efe0] leading-[1.12] tracking-wide mb-4 hud-text-shadow"
            style={{ textWrap: 'balance' }}
          >
            Gandalf: Stíny Severu
          </h1>

          <div className="w-28 h-px bg-gradient-to-r from-[#c89d54]/75 to-transparent mb-4" />

          <p className="text-sm md:text-base text-slate-200/92 leading-relaxed mb-8 max-w-md hud-text-shadow">
            Při pátrání po zmizelých poutnících spatříš na severním hřebeni zhasínající strážní oheň. Z lesa vyběhne vyděšený kůň bez jezdce. Jeho pán možná ještě potřebuje pomoc.
          </p>

          {!showSettings ? (
            <div className="flex flex-wrap items-center gap-3.5">
              <button
                type="button"
                data-start="true"
                onClick={handleStartNew}
                className="px-7 py-3 bg-[#c89d54] hover:bg-[#dbb064] text-[#12161c] font-semibold text-sm tracking-wide rounded border border-[#f5d593]/50 shadow-[0_6px_18px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,245,220,0.4)] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-300"
              >
                Nová výprava
              </button>
              {canContinue && (
                <button
                  type="button"
                  onClick={() => loadCheckpoint()}
                  className="px-6 py-3 bg-[#1b2735] hover:bg-[#243447] text-[#f3dca6] border border-[#c89d54]/50 shadow-[0_6px_18px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,235,190,0.12)] font-semibold text-sm tracking-wide rounded transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-300"
                >
                  Pokračovat ve výpravě
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowSettings(true)}
                className="px-6 py-3 bg-[#151b23]/92 hover:bg-[#1e2632] text-[#ede7d9] border border-[#c89d54]/35 shadow-[0_6px_18px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,235,190,0.08)] font-medium text-sm tracking-wide rounded transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-300"
              >
                Nastavení
              </button>
            </div>
          ) : (
            <div className="p-5 rounded bg-[#11161d]/95 border border-[#c89d54]/35 shadow-[0_12px_32px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,235,190,0.08)] space-y-4 max-w-sm">
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <h2 className="font-display text-lg text-[#f3e6ca]">Nastavení</h2>
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="text-xs text-slate-300 hover:text-amber-100 px-2 py-1 cursor-pointer"
                >
                  Zpět
                </button>
              </div>

              <label className="block space-y-1.5 text-sm text-slate-200">
                <span className="flex justify-between">
                  <span>Citlivost myši</span>
                  <span className="font-mono-num text-[#e3be76]">
                    {settings.mouseSensitivity.toFixed(1)}x
                  </span>
                </span>
                <input
                  type="range"
                  min={0.4}
                  max={2.0}
                  step={0.1}
                  value={settings.mouseSensitivity}
                  onChange={(e) => setSettings({ mouseSensitivity: parseFloat(e.target.value) })}
                  className="w-full accent-[#c89d54]"
                />
              </label>

              <div className="flex items-center justify-between text-sm text-slate-200">
                <span>Kvalita grafiky</span>
                <div className="flex gap-1 bg-[#0b0f14] p-1 rounded border border-[#c89d54]/20">
                  {(['high', 'medium'] as const).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setSettings({ graphicsQuality: q })}
                      className={`px-3 py-1 text-xs rounded cursor-pointer transition-colors ${
                        settings.graphicsQuality === q
                          ? 'bg-[#c89d54] text-[#12161c] font-semibold'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {q === 'high' ? 'Vysoká' : 'Střední'}
                    </button>
                  ))}
                </div>
              </div>

              <label className="block space-y-1 text-sm text-slate-200">
                <span className="flex justify-between">
                  <span>Hlasitost hudby</span>
                  <span className="font-mono-num text-[#e3be76]">
                    {Math.round(settings.musicVolume * 100)} %
                  </span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.musicVolume}
                  onChange={(e) => setSettings({ musicVolume: parseFloat(e.target.value) })}
                  className="w-full accent-[#c89d54]"
                />
              </label>

              <label className="block space-y-1 text-sm text-slate-200">
                <span className="flex justify-between">
                  <span>Hlasitost efektů</span>
                  <span className="font-mono-num text-[#e3be76]">
                    {Math.round(settings.sfxVolume * 100)} %
                  </span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.sfxVolume}
                  onChange={(e) => setSettings({ sfxVolume: parseFloat(e.target.value) })}
                  className="w-full accent-[#c89d54]"
                />
              </label>

              <div className="flex items-center justify-between text-sm text-slate-200">
                <span>Zvuk a prostředí</span>
                <button
                  type="button"
                  onClick={() => setSettings({ muted: !settings.muted })}
                  className="px-3 py-1 text-xs rounded border border-[#c89d54]/30 bg-[#19202a] hover:bg-[#222c3a] text-[#f3e6ca] cursor-pointer"
                >
                  {settings.muted ? 'Ztlumeno' : 'Zapnuto'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Single flat control hint line in bottom safe margin */}
      <div className="relative z-10 px-8 md:px-16 pb-6 text-xs text-slate-200/85 tracking-wide hud-text-shadow">
        WASD Pohyb · Shift Běh · Mezerník Úskok · LTM Útok · PTM Štít · Q Záblesk · E Oheň · R Vlna · [1/L] Světlo · [2..5] Zásoby · F Interakce · M Mapa · Tab Deník · Esc Pauza
      </div>
    </div>
  );
}
