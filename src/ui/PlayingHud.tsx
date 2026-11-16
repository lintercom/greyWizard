import { useEffect, useState } from 'react';
import { BookOpen, Map as MapIcon, Pause, Sparkles, Volume2, VolumeX } from 'lucide-react';
import { SPELL_CONFIGS, SpellId, xpForNextLevel } from '../game/combatLogic';
import { CHAPTERS, SIDE_QUESTS, SideQuestId, getMainQuestStepDef } from '../game/storyData';
import { useGameStore } from '../game/store';

function SpellSvgIcon({ id }: { id: SpellId | 'attack' | 'shield' }) {
  if (id === 'attack') {
    return (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M19 5L9 15M6 12l6 6M4 20l4-4" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === 'shield') {
    return (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z" />
      </svg>
    );
  }
  if (id === 'staff_light') {
    return (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="8" r="3" />
        <path d="M12 11v10M12 2v1M6 8H5M19 8h-1M7.8 4.2l.7.7M16.2 4.2l-.7.7" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === 'flash_of_light') {
    return (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 2l2.2 6.8L21 11l-6.8 2.2L12 20l-2.2-6.8L3 11l6.8-2.2L12 2z" />
      </svg>
    );
  }
  if (id === 'fire_spell') {
    return (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 3c2.5 3 5 5.6 5 9.5a5 5 0 11-10 0c0-2.4 1.2-4.6 3-6.5.2 1.6 1 2.5 2 2.5 0-2 0-3.8 0-5.5z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.5" />
    </svg>
  );
}

function normalizeDegDiff(a: number, b: number): number {
  let d = a - b;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

export function PlayingHud() {
  const phase = useGameStore((s) => s.phase);
  const hp = useGameStore((s) => s.hp);
  const maxHp = useGameStore((s) => s.maxHp);
  const mana = useGameStore((s) => s.mana);
  const maxMana = useGameStore((s) => s.maxMana);
  const stamina = useGameStore((s) => s.stamina);
  const maxStamina = useGameStore((s) => s.maxStamina);
  const level = useGameStore((s) => s.level);
  const xp = useGameStore((s) => s.xp);
  const knowledgePoints = useGameStore((s) => s.knowledgePoints);
  const staffLightOn = useGameStore((s) => s.staffLightOn);
  const shieldActive = useGameStore((s) => s.shieldActive);
  const cooldowns = useGameStore((s) => s.cooldowns);
  const mainStep = useGameStore((s) => s.mainStep);
  const flags = useGameStore((s) => s.flags);
  const sideQuests = useGameStore((s) => s.sideQuests);
  const patrolKilled = useGameStore((s) => s.patrolKilled);
  const inventory = useGameStore((s) => s.inventory);
  const interactPrompt = useGameStore((s) => s.interactPrompt);
  const notification = useGameStore((s) => s.notification);
  const compassHeadingDeg = useGameStore((s) => s.compassHeadingDeg);
  const objectiveBearingDeg = useGameStore((s) => s.objectiveBearingDeg);
  const objectiveDistance = useGameStore((s) => s.objectiveDistance);
  const waypointBearingDeg = useGameStore((s) => s.waypointBearingDeg);
  const waypointDistance = useGameStore((s) => s.waypointDistance);
  const customWaypoint = useGameStore((s) => s.customWaypoint);
  const trackedQuest = useGameStore((s) => s.trackedQuest);
  const worldMapOpen = useGameStore((s) => s.worldMapOpen);
  const currentRegionName = useGameStore((s) => s.currentRegionName);
  const bossHud = useGameStore((s) => s.bossHud);
  const lastDamageAt = useGameStore((s) => s.lastDamageAt);
  const combatCallout = useGameStore((s) => s.combatCallout);
  const settings = useGameStore((s) => s.settings);
  const toggleJournal = useGameStore((s) => s.toggleJournal);
  const toggleWorldMap = useGameStore((s) => s.toggleWorldMap);
  const pauseGame = useGameStore((s) => s.pauseGame);
  const setSettings = useGameStore((s) => s.setSettings);
  const useInventoryItem = useGameStore((s) => s.useInventoryItem);
  const clearExpiredNotification = useGameStore((s) => s.clearExpiredNotification);

  const [hitVignette, setHitVignette] = useState(false);

  useEffect(() => {
    if (!lastDamageAt) return;
    setHitVignette(true);
    const id = window.setTimeout(() => setHitVignette(false), 260);
    return () => window.clearTimeout(id);
  }, [lastDamageAt]);

  useEffect(() => {
    if (!notification && !combatCallout) return;
    const now = Date.now();
    const nextExp = Math.min(
      notification ? notification.expiresAt : Infinity,
      combatCallout ? combatCallout.expiresAt : Infinity,
    );
    const ms = Math.max(0, nextExp - now);
    const id = window.setTimeout(() => clearExpiredNotification(), ms + 25);
    return () => window.clearTimeout(id);
  }, [notification, combatCallout, clearExpiredNotification]);

  if (phase !== 'playing' || worldMapOpen) return null;

  const stepDef = getMainQuestStepDef(mainStep);
  const chapterDef = CHAPTERS[stepDef.chapter];
  const nextXp = xpForNextLevel(level);
  const activeNotif = notification && notification.expiresAt > Date.now() ? notification : null;
  const activeCallout = combatCallout && combatCallout.expiresAt > Date.now() ? combatCallout : null;
  const hpPct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  const lowHp = hp > 0 && hp / maxHp <= 0.25;

  const poulticeCount = inventory.find((i) => i.id === 'healing_poultice')?.count ?? 0;
  const decoctionCount = inventory.find((i) => i.id === 'herbal_decoction')?.count ?? 0;
  const breadCount = inventory.find((i) => i.id === 'travel_bread')?.count ?? 0;
  const torchCount = inventory.find((i) => i.id === 'torch_item')?.count ?? 0;

  const activeSideQuestId = (Object.keys(sideQuests) as SideQuestId[]).find(
    (id) => sideQuests[id].status === 'active',
  );

  const cardinals = [
    { label: 'S', deg: 0 },
    { label: 'V', deg: 90 },
    { label: 'J', deg: 180 },
    { label: 'Z', deg: -90 },
  ];

  const objRel = normalizeDegDiff(objectiveBearingDeg, compassHeadingDeg);
  const objClampedPct = Math.max(6, Math.min(94, 50 + (objRel / 95) * 44));
  const wpRel =
    waypointBearingDeg !== null ? normalizeDegDiff(waypointBearingDeg, compassHeadingDeg) : null;
  const wpClampedPct = wpRel !== null ? Math.max(6, Math.min(94, 50 + (wpRel / 95) * 44)) : null;

  const consumableButtons = [
    {
      id: 'healing_poultice',
      key: '2',
      label: 'Obklad',
      count: poulticeCount,
      title: 'Léčivý obklad: Obnoví zdraví [2]',
      className: 'bg-[#18241d] hover:bg-[#213328] border-emerald-400/35 text-emerald-200',
    },
    {
      id: 'herbal_decoction',
      key: '3',
      label: 'Odvar',
      count: decoctionCount,
      title: 'Bylinný odvar: Obnoví 45 soustředění [3]',
      className: 'bg-[#162230] hover:bg-[#1e3044] border-sky-400/35 text-sky-200',
    },
    {
      id: 'travel_bread',
      key: '4',
      label: 'Chléb',
      count: breadCount,
      title: 'Cestovní chléb: Obnoví 45 výdrže [4]',
      className: 'bg-[#262016] hover:bg-[#342c1d] border-amber-400/35 text-amber-200',
    },
    {
      id: 'torch_item',
      key: '5',
      label: 'Pochodeň',
      count: torchCount,
      title: 'Pochodeň: Světlo na 60 s bez soustředění [5]',
      className: 'bg-[#281b15] hover:bg-[#38251c] border-orange-400/35 text-orange-200',
    },
  ].filter((b) => b.count > 0);

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-4 md:p-5">
      {/* Damage / Low-HP Edge Vignette */}
      {(hitVignette || lowHp) && (
        <div
          className="fixed inset-0 pointer-events-none transition-opacity duration-200"
          style={{
            boxShadow: hitVignette
              ? 'inset 0 0 90px rgba(185, 28, 28, 0.65)'
              : 'inset 0 0 65px rgba(127, 29, 29, 0.35)',
          }}
        />
      )}

      {/* Top Row: Vitals (Left) | Compass (Center) | Quest & Utilities (Right) */}
      <div className="flex items-start justify-between gap-4">
        {/* Top-Left: Gandalf Vitals */}
        <div
          className="w-56 sm:w-64 md:w-72 p-3 rounded border border-[#c89d54]/30 shadow-[0_8px_22px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,235,190,0.08)]"
          style={{ backgroundColor: 'rgba(14, 19, 26, 0.88)' }}
        >
          <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-white/10">
            <span className="font-display text-sm font-semibold text-[#f5e9ce] whitespace-nowrap">
              Gandalf Šedý
            </span>
            <div className="flex items-center gap-2 pointer-events-auto shrink-0">
              {knowledgePoints > 0 && (
                <button
                  type="button"
                  tabIndex={-1}
                  title="Otevřít strom schopností v Deníku"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    toggleJournal('skills');
                  }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#2d2415] hover:bg-[#3d311c] border border-[#e3be76]/45 text-[10px] font-semibold text-[#f3dca6] whitespace-nowrap cursor-pointer transition-colors"
                >
                  <Sparkles className="w-2.5 h-2.5 text-[#e3be76] shrink-0" />
                  <span>+{knowledgePoints} Poznání</span>
                </button>
              )}
              <span className="font-mono-num text-xs text-[#e3be76] whitespace-nowrap">Úr. {level}</span>
            </div>
          </div>

          {/* Health */}
          <div className="mb-1.5">
            <div className="flex justify-between text-[11px] text-slate-300 mb-0.5">
              <span>Zdraví</span>
              <span className="font-mono-num text-slate-200">
                {Math.round(hp)} / {maxHp}
              </span>
            </div>
            <div className="relative h-2.5 w-full bg-[#090c10] rounded-sm overflow-hidden border border-[#c89d54]/20">
              <div
                className="absolute inset-y-0 left-0 bg-amber-200/55 transition-all duration-500 ease-out"
                style={{ width: `${hpPct}%` }}
              />
              <div
                className="relative h-full bg-gradient-to-r from-[#a62d2d] to-[#cb4343] transition-all duration-100"
                style={{ width: `${hpPct}%` }}
              />
            </div>
          </div>

          {/* Focus (Soustředění) */}
          <div className="mb-1.5">
            <div className="flex justify-between text-[11px] text-slate-300 mb-0.5">
              <span>Soustředění</span>
              <span className="font-mono-num text-slate-200">
                {Math.round(mana)} / {maxMana}
              </span>
            </div>
            <div className="h-2 w-full bg-[#090c10] rounded-sm overflow-hidden border border-[#c89d54]/20">
              <div
                className="h-full bg-gradient-to-r from-[#3a73ad] to-[#5a9de0] transition-all duration-100"
                style={{ width: `${Math.max(0, Math.min(100, (mana / maxMana) * 100))}%` }}
              />
            </div>
          </div>

          {/* Stamina (Výdrž) & XP */}
          <div className="mb-1">
            <div className="flex justify-between text-[10px] text-slate-300/90 mb-0.5">
              <span>Výdrž</span>
              <span className="font-mono-num text-slate-300/85">
                {Math.round(stamina)}/{maxStamina} · XP {xp}/{nextXp}
              </span>
            </div>
            <div className="h-1.5 w-full bg-[#090c10] rounded-sm overflow-hidden border border-white/10">
              <div
                className="h-full bg-[#d6ab5a] transition-all duration-75"
                style={{ width: `${Math.max(0, Math.min(100, (stamina / maxStamina) * 100))}%` }}
              />
            </div>
          </div>

          {/* Quick Consumables [2..5] */}
          {consumableButtons.length > 0 && (
            <div className="grid grid-cols-2 gap-1.5 mt-2.5 pt-2 border-t border-white/10 pointer-events-auto">
              {consumableButtons.map((btn) => (
                <button
                  key={btn.id}
                  type="button"
                  tabIndex={-1}
                  title={btn.title}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    useInventoryItem(btn.id);
                  }}
                  className={`px-2 py-1 text-[11px] rounded border cursor-pointer whitespace-nowrap transition-colors ${btn.className}`}
                >
                  [{btn.key}] {btn.label} ×{btn.count}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Top-Center: Compass, Region & Grakh Boss Bar */}
        <div className="hidden sm:flex flex-col items-center gap-1">
          <div
            className="relative w-76 h-9 rounded border border-[#c89d54]/30 shadow-[0_6px_18px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,235,190,0.08)] overflow-hidden"
            style={{ backgroundColor: 'rgba(14, 19, 26, 0.88)' }}
          >
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-1.5 bg-[#e3be76]/85 z-10" />
            <div className="relative w-full h-4 border-b border-white/10">
              {cardinals.map((c) => {
                const rel = normalizeDegDiff(c.deg, compassHeadingDeg);
                if (Math.abs(rel) > 95) return null;
                const leftPct = 50 + (rel / 95) * 45;
                return (
                  <span
                    key={c.label}
                    className={`absolute top-0.5 -translate-x-1/2 text-[10px] font-semibold tracking-wider ${
                      c.label === 'S' ? 'text-[#e3be76]' : 'text-slate-200'
                    }`}
                    style={{ left: `${leftPct}%` }}
                  >
                    {c.label}
                  </span>
                );
              })}
            </div>
            <div className="relative w-full h-5 flex items-center">
              {(stepDef.targetPos || trackedQuest.kind === 'side') && (
                <div
                  className="absolute -translate-x-1/2 flex items-center gap-1 text-[#f2ca78]"
                  style={{ left: `${objClampedPct}%` }}
                >
                  <span
                    className={`inline-block w-2 h-2 rotate-45 border ${
                      trackedQuest.kind === 'side'
                        ? 'bg-[#38bdf8] border-[#e0f2fe]'
                        : 'bg-[#e3be76] border-[#fff3d6]'
                    }`}
                  />
                  <span className="font-mono-num text-[10px] font-semibold">{objectiveDistance}m</span>
                </div>
              )}
              {customWaypoint && wpClampedPct !== null && waypointDistance !== null && (
                <div
                  className="absolute -translate-x-1/2 flex items-center gap-1 text-[#67d4f5]"
                  style={{ left: `${wpClampedPct}%` }}
                >
                  <span className="inline-block w-2 h-2 rounded-full bg-[#38bdf8] border border-white" />
                  <span className="font-mono-num text-[10px] font-semibold">{waypointDistance}m</span>
                </div>
              )}
            </div>
          </div>
          <span className="text-[11px] tracking-[0.18em] uppercase text-[#f3e6ca] hud-text-shadow">
            {currentRegionName}
          </span>

          {/* 3-Phase Grakh Boss Health Bar */}
          {bossHud && (
            <div
              className="mt-2 w-84 p-2.5 rounded border border-red-400/45 shadow-[0_8px_22px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,210,200,0.08)]"
              style={{ backgroundColor: 'rgba(22, 13, 15, 0.92)' }}
            >
              <div className="flex items-center justify-between text-xs font-display text-[#f5e5cc] mb-1">
                <div className="flex items-center gap-2">
                  <span>{bossHud.name}</span>
                  <span className="px-1.5 py-0.5 text-[10px] rounded bg-red-900/70 border border-red-400/40 text-red-100 font-sans">
                    Fáze {bossHud.phase === 1 ? 'I' : bossHud.phase === 2 ? 'II' : 'III'}
                  </span>
                </div>
                <span className="font-mono-num text-red-200">
                  {bossHud.hp} / {bossHud.maxHp}
                </span>
              </div>
              <div className="h-2 w-full bg-[#0b0708] rounded-sm overflow-hidden border border-red-300/20">
                <div
                  className="h-full bg-gradient-to-r from-[#991b1b] to-[#dc2626] transition-all duration-150"
                  style={{ width: `${Math.max(0, (bossHud.hp / bossHud.maxHp) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Top-Right: Quest Tracker & Utility Buttons */}
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-1.5 pointer-events-auto">
            <button
              type="button"
              tabIndex={-1}
              aria-label="Otevřít interaktivní mapu světa"
              onClick={(e) => {
                e.currentTarget.blur();
                toggleWorldMap(true);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-[#c89d54]/30 text-xs text-[#f3e6ca] hover:bg-[#1f2733] cursor-pointer whitespace-nowrap transition-colors shadow-[0_4px_12px_rgba(0,0,0,0.28)]"
              style={{ backgroundColor: 'rgba(14, 19, 26, 0.88)' }}
            >
              <MapIcon className="w-3.5 h-3.5 text-[#e3be76]" />
              <span>Mapa [M]</span>
            </button>
            <button
              type="button"
              tabIndex={-1}
              aria-label="Otevřít deník"
              onClick={(e) => {
                e.currentTarget.blur();
                toggleJournal();
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-[#c89d54]/30 text-xs text-[#f3e6ca] hover:bg-[#1f2733] cursor-pointer whitespace-nowrap transition-colors shadow-[0_4px_12px_rgba(0,0,0,0.28)]"
              style={{ backgroundColor: 'rgba(14, 19, 26, 0.88)' }}
            >
              <BookOpen className="w-3.5 h-3.5 text-[#e3be76]" />
              <span>Deník [Tab]</span>
            </button>
            <button
              type="button"
              tabIndex={-1}
              aria-label={settings.muted ? 'Zapnout zvuk' : 'Ztlumit zvuk'}
              onClick={(e) => {
                e.currentTarget.blur();
                setSettings({ muted: !settings.muted });
              }}
              className="p-1.5 rounded border border-[#c89d54]/30 text-[#f3e6ca] hover:bg-[#1f2733] cursor-pointer transition-colors shadow-[0_4px_12px_rgba(0,0,0,0.28)]"
              style={{ backgroundColor: 'rgba(14, 19, 26, 0.88)' }}
            >
              {settings.muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              tabIndex={-1}
              aria-label="Pozastavit hru"
              onClick={(e) => {
                e.currentTarget.blur();
                pauseGame();
              }}
              className="p-1.5 rounded border border-[#c89d54]/30 text-[#f3e6ca] hover:bg-[#1f2733] cursor-pointer transition-colors shadow-[0_4px_12px_rgba(0,0,0,0.28)]"
              style={{ backgroundColor: 'rgba(14, 19, 26, 0.88)' }}
            >
              <Pause className="w-4 h-4" />
            </button>
          </div>

          <div
            className="w-56 sm:w-64 md:w-72 p-3 rounded border border-[#c89d54]/30 text-right shadow-[0_8px_22px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,235,190,0.08)]"
            style={{ backgroundColor: 'rgba(14, 19, 26, 0.88)' }}
          >
            <p className="text-[10px] tracking-[0.18em] uppercase text-[#e3be76]/90 mb-0.5 flex items-center justify-end gap-1.5">
              <span>
                {mainStep === 'completed'
                  ? 'Příběh dokončen'
                  : `Kapitola ${chapterDef.roman} · Krok ${stepDef.stepNumber} z 21`}
              </span>
              <span className="inline-block w-1.5 h-1.5 rotate-45 bg-[#c89d54]" />
            </p>
            <p className="font-display text-xs font-semibold text-[#f5efe0] mb-1">{stepDef.title}</p>
            <p className="text-xs text-slate-200 leading-snug">{stepDef.objective}</p>

            {mainStep === 'ch1_defeat_scouts' && (
              <p className="font-mono-num text-[11px] text-[#e3be76] mt-1">
                Průzkumníci poraženi: {patrolKilled} / 2
              </p>
            )}
            {mainStep === 'ch2_inspect_caravan' && (
              <p className="font-mono-num text-[11px] text-[#e3be76] mt-1">
                Důkazy karavany: {flags.caravanEvidenceCount} / 3
              </p>
            )}
            {mainStep === 'ch5_disable_beacons' && (
              <p className="font-mono-num text-[11px] text-[#e3be76] mt-1">
                Signální ohně: {flags.beaconsDisabled} / 2 · Nela: {flags.nelaRescued ? 'Osvobozena' : 'V zajetí'}
              </p>
            )}

            {activeSideQuestId && (
              <div className="mt-2 pt-1.5 border-t border-white/10">
                <p className="text-[10px] uppercase tracking-wider text-sky-300/90">Vedlejší úkol</p>
                <p className="text-[11px] text-slate-200">
                  {SIDE_QUESTS[activeSideQuestId].title}{' '}
                  <span className="font-mono-num text-[#e3be76]">
                    ({sideQuests[activeSideQuestId].progress}/{SIDE_QUESTS[activeSideQuestId].requiredCount})
                  </span>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Center Banners: Notifications & Combat Callouts */}
      <div className="flex flex-col items-center justify-center gap-3 pointer-events-none">
        {activeNotif && (
          <div
            className="px-6 py-2.5 rounded border border-[#c89d54]/45 shadow-[0_10px_28px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,235,190,0.1)] text-center"
            style={{ backgroundColor: 'rgba(13, 17, 23, 0.92)' }}
          >
            <p className="font-display text-sm text-[#f3dca6]">{activeNotif.title}</p>
            {activeNotif.subtitle && <p className="text-xs text-slate-200 mt-0.5">{activeNotif.subtitle}</p>}
          </div>
        )}
        {activeCallout && (
          <div
            className={`px-3.5 py-1 rounded border text-xs font-display tracking-wider uppercase hud-text-shadow ${
              activeCallout.tone === 'parry'
                ? 'border-sky-300/70 bg-[#102438]/90 text-sky-100'
                : activeCallout.tone === 'crit'
                  ? 'border-amber-300/70 bg-[#2b1f10]/90 text-amber-100'
                  : activeCallout.tone === 'stun'
                    ? 'border-yellow-200/70 bg-[#282410]/90 text-yellow-100'
                    : 'border-slate-300/50 bg-[#141a22]/90 text-slate-200'
            }`}
          >
            {activeCallout.text}
          </div>
        )}
      </div>

      {/* Bottom: Interact Prompt + Combat & Magic Bar */}
      <div className="flex flex-col items-center gap-2.5">
        {interactPrompt && (
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              window.dispatchEvent(new CustomEvent('gandalf-interact'));
            }}
            className="pointer-events-auto px-4 py-1.5 rounded border border-[#c89d54]/55 text-xs font-medium text-[#f5e9ce] hover:bg-[#1f2835] cursor-pointer shadow-[0_6px_18px_rgba(0,0,0,0.42)] transition-colors"
            style={{ backgroundColor: 'rgba(14, 19, 26, 0.92)' }}
          >
            <span className="font-mono-num font-semibold text-[#e3be76] mr-2">[{interactPrompt.key}]</span>
            {interactPrompt.label}
          </button>
        )}

        <div
          className="pointer-events-auto flex items-center gap-1.5 p-1.5 rounded border border-[#c89d54]/30 shadow-[0_10px_26px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,235,190,0.08)]"
          style={{ backgroundColor: 'rgba(14, 19, 26, 0.9)' }}
        >
          {/* Glamdring / Staff Strike */}
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              window.dispatchEvent(new CustomEvent('gandalf-melee-attack'));
            }}
            className="relative flex flex-col items-center justify-center w-16 h-14 rounded border border-[#c89d54]/20 bg-[#19202a] hover:bg-[#232d3b] text-slate-100 cursor-pointer transition-colors shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
          >
            <SpellSvgIcon id="attack" />
            <span className="text-[10px] mt-1 text-slate-200">Úder</span>
            <span className="absolute top-0.5 right-1 font-mono-num text-[9px] text-[#e3be76]/90">LTM</span>
          </button>

          {/* Protective Shield */}
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={() => useGameStore.getState().setShieldActive(true)}
            onMouseUp={() => useGameStore.getState().setShieldActive(false)}
            onMouseLeave={() => useGameStore.getState().setShieldActive(false)}
            className={`relative flex flex-col items-center justify-center w-16 h-14 rounded border text-slate-100 cursor-pointer transition-colors shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ${
              shieldActive
                ? 'border-sky-300/75 bg-[#1d344e] text-sky-100'
                : 'border-[#c89d54]/20 bg-[#19202a] hover:bg-[#232d3b]'
            }`}
          >
            <SpellSvgIcon id="shield" />
            <span className="text-[10px] mt-1 text-slate-200">Štít</span>
            <span className="absolute top-0.5 right-1 font-mono-num text-[9px] text-[#e3be76]/90">PTM</span>
          </button>

          {/* Four Wizard Spells */}
          {(['staff_light', 'flash_of_light', 'fire_spell', 'shockwave'] as SpellId[]).map((id) => {
            const cfg = SPELL_CONFIGS[id];
            const cd = cooldowns[id] ?? 0;
            const notEnoughMana = mana < cfg.manaCost;
            const isLightActive = id === 'staff_light' && staffLightOn;
            return (
              <button
                key={id}
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  window.dispatchEvent(new CustomEvent('gandalf-cast-spell', { detail: id }));
                }}
                title={`${cfg.name} (${cfg.manaCost} soustředění): ${cfg.description}`}
                className={`relative flex flex-col items-center justify-center w-16 h-14 rounded border cursor-pointer transition-colors shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ${
                  isLightActive
                    ? 'border-[#e3be76]/80 bg-[#2d291b] text-[#f8e7bc]'
                    : cd > 0 || notEnoughMana
                      ? 'border-white/5 bg-[#10141a] text-slate-500'
                      : 'border-[#c89d54]/25 bg-[#19202a] hover:bg-[#232d3b] text-[#f3e6ca]'
                }`}
              >
                <SpellSvgIcon id={id} />
                <span className="text-[10px] mt-1 truncate max-w-[58px]">
                  {id === 'staff_light'
                    ? 'Světlo'
                    : id === 'flash_of_light'
                      ? 'Záblesk'
                      : id === 'fire_spell'
                        ? 'Plamen'
                        : 'Vlna'}
                </span>
                <span className="absolute top-0.5 right-1 font-mono-num text-[9px] text-[#e3be76]/90">
                  {id === 'staff_light' ? '1/L' : cfg.keyHint}
                </span>
                {cfg.manaCost > 0 && (
                  <span
                    className={`absolute top-0.5 left-1 font-mono-num text-[9px] ${
                      notEnoughMana ? 'text-red-400' : 'text-sky-300/90'
                    }`}
                  >
                    {cfg.manaCost}
                  </span>
                )}
                {cd > 0 && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/72 rounded font-mono-num text-xs font-semibold text-[#f3dca6]">
                    {cd.toFixed(1)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
