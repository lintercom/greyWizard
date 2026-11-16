import {
  CHAPTERS,
  CRAFTING_RECIPES,
  GANDALF_ATTRIBUTES,
  ITEM_CATALOG,
  MAIN_QUEST_STEPS,
  MainQuestStepId,
  SIDE_QUESTS,
  SKILL_TREE,
  SideQuestId,
  SkillBranch,
  getMainQuestStepDef,
  resolveEpilogue,
} from '../game/storyData';
import { LANDMARKS, QUARRY_POS, VILLAGE_POS, WORLD_RADIUS } from '../game/terrain';
import { liveSim, useGameStore } from '../game/store';

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const ORDERED_STEPS: MainQuestStepId[] = [
  'ch1_inspect_horse',
  'ch1_find_edran',
  'ch1_track_scouts',
  'ch1_defeat_scouts',
  'ch1_escort_liska',
  'ch2_talk_village',
  'ch2_inspect_caravan',
  'ch2_talk_merchant',
  'ch2_inspect_camp',
  'ch2_return_liska',
  'ch3_talk_bruni',
  'ch3_enter_mines',
  'ch3_solve_stones',
  'ch3_take_orders',
  'ch4_check_ledger',
  'ch4_confront_rovan',
  'ch4_prepare_assault',
  'ch5_infiltrate_fortress',
  'ch5_disable_beacons',
  'ch5_defeat_grakh',
  'ch6_return_liska',
];

const FIXED_EQUIPMENT_IDS = ['gandalf_staff', 'glamdring', 'grey_cloak', 'pilgrim_satchel'] as const;

export function GameModals() {
  const phase = useGameStore((s) => s.phase);
  const activeDialogue = useGameStore((s) => s.activeDialogue);
  const resolveDialogueChoice = useGameStore((s) => s.resolveDialogueChoice);
  const journalOpen = useGameStore((s) => s.journalOpen);
  const journalTab = useGameStore((s) => s.journalTab);
  const setJournalTab = useGameStore((s) => s.setJournalTab);
  const toggleJournal = useGameStore((s) => s.toggleJournal);
  const toggleWorldMap = useGameStore((s) => s.toggleWorldMap);
  const mainStep = useGameStore((s) => s.mainStep);
  const flags = useGameStore((s) => s.flags);
  const sideQuests = useGameStore((s) => s.sideQuests);
  const knowledgePoints = useGameStore((s) => s.knowledgePoints);
  const unlockedSkills = useGameStore((s) => s.unlockedSkills);
  const unlockSkill = useGameStore((s) => s.unlockSkill);
  const craftRecipe = useGameStore((s) => s.craftRecipe);
  const discoveredLocations = useGameStore((s) => s.discoveredLocations);
  const inventory = useGameStore((s) => s.inventory);
  const storyItems = useGameStore((s) => s.storyItems);
  const useInventoryItem = useGameStore((s) => s.useInventoryItem);
  const saveCheckpoint = useGameStore((s) => s.saveCheckpoint);
  const resumeGame = useGameStore((s) => s.resumeGame);
  const restartGame = useGameStore((s) => s.restartGame);
  const returnToTitle = useGameStore((s) => s.returnToTitle);
  const settings = useGameStore((s) => s.settings);
  const setSettings = useGameStore((s) => s.setSettings);
  const runStats = useGameStore((s) => s.runStats);

  // 1. Branching NPC Dialogue Modal
  if (phase === 'playing' && activeDialogue) {
    const choices = activeDialogue.choices ?? [];
    return (
      <div className="fixed inset-0 z-30 flex items-end justify-center p-6 md:p-10 bg-black/45">
        <div
          className="max-w-2xl w-full p-6 rounded border border-[#c89d54]/45 shadow-[0_14px_38px_rgba(0,0,0,0.58),inset_0_1px_0_rgba(255,235,190,0.08)] space-y-4"
          style={{ backgroundColor: 'rgba(14, 19, 26, 0.96)' }}
        >
          <div className="pb-2 border-b border-white/10">
            <p className="text-xs tracking-[0.22em] uppercase text-[#e3be76]/90">{activeDialogue.role}</p>
            <h2 className="font-display text-2xl text-[#f5efe0]">{activeDialogue.speaker}</h2>
          </div>

          <div className="space-y-3 text-sm md:text-base text-slate-200 leading-relaxed">
            {activeDialogue.lines.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>

          {choices.length > 0 ? (
            <div className="space-y-2 pt-2 border-t border-white/10">
              {choices.map((choice, idx) => {
                const toneBadge =
                  choice.tone === 'wisdom'
                    ? 'Moudrost'
                    : choice.tone === 'caution'
                      ? 'Průzkum'
                      : choice.tone === 'direct'
                        ? 'Přímý zásah'
                        : null;
                return (
                  <button
                    key={`${choice.effectId}-${idx}`}
                    type="button"
                    onClick={() => resolveDialogueChoice(choice.effectId)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-xs md:text-sm rounded border border-[#c89d54]/40 bg-[#1a222d] hover:bg-[#253140] text-[#f5efe0] cursor-pointer transition-colors"
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="font-mono-num text-[#e3be76] font-semibold">[{idx + 1}]</span>
                      <span>{choice.label}</span>
                    </span>
                    {toneBadge && (
                      <span className="shrink-0 px-2 py-0.5 text-[10px] rounded bg-[#292214] border border-[#c89d54]/30 text-[#e3be76]">
                        {toneBadge}
                      </span>
                    )}
                  </button>
                );
              })}
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => resolveDialogueChoice('close')}
                  className="px-4 py-1.5 text-xs text-slate-300 hover:text-white rounded border border-white/15 cursor-pointer transition-colors"
                >
                  Zavřít [Esc]
                </button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end gap-3 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => resolveDialogueChoice('close')}
                className="px-4 py-2 text-xs text-slate-300 hover:text-white rounded border border-white/15 cursor-pointer transition-colors"
              >
                Zavřít [Esc]
              </button>
              <button
                type="button"
                onClick={() => resolveDialogueChoice('close')}
                className="px-5 py-2 text-xs font-semibold bg-[#c89d54] hover:bg-[#dbb064] text-[#12161c] rounded border border-[#f5d593]/40 cursor-pointer transition-colors"
              >
                {activeDialogue.actionLabel ?? 'Pokračovat'} [F]
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 2. 4-Tab Journal Modal [Tab]
  if (phase === 'playing' && journalOpen) {
    const currentStepDef = getMainQuestStepDef(mainStep);
    const chapterDef = CHAPTERS[currentStepDef.chapter];
    const currentIndex =
      mainStep === 'completed' ? ORDERED_STEPS.length : ORDERED_STEPS.indexOf(mainStep);

    const mapCoord = (v: number) => 100 + (v / WORLD_RADIUS) * 85;

    const nearLiska = Math.hypot(liveSim.playerX - VILLAGE_POS.x, liveSim.playerZ - VILLAGE_POS.z) < 22;
    const nearFire = liveSim.braziers.some(
      (b) => b.lit && Math.hypot(liveSim.playerX - b.x, liveSim.playerZ - b.z) < 9,
    );
    const canCraftHere = nearLiska || nearFire;

    const tabs: Array<{ id: 'quests' | 'map' | 'inventory' | 'skills'; label: string }> = [
      { id: 'quests', label: 'Úkoly' },
      { id: 'map', label: 'Mapa' },
      { id: 'inventory', label: 'Brašna a výroba' },
      {
        id: 'skills',
        label: knowledgePoints > 0 ? `Schopnosti (+${knowledgePoints})` : 'Schopnosti',
      },
    ];

    const branches: Array<{ branch: SkillBranch; label: string }> = [
      { branch: 'istari_power', label: 'Moc Istari' },
      { branch: 'pilgrim_wisdom', label: 'Moudrost poutníka' },
      { branch: 'protector', label: 'Ochránce Středozemě' },
    ];

    const rovanStatusLabel =
      flags.rovanChoice === 'truth_and_mercy'
        ? 'Pravda a soucit (přizná se po boji)'
        : flags.rovanChoice === 'justice'
          ? 'Předán spravedlnosti v Lísce'
          : flags.rovanChoice === 'secrecy'
            ? 'Tichá dohoda (tajemství zachováno)'
            : 'Dosud nevyřešeno';

    const approachLabel =
      flags.approachChosen === 'tunnel'
        ? 'Staré trpasličí štoly'
        : flags.approachChosen === 'ledge'
          ? 'Tajná lesní římsa'
          : 'Hlavní horská stezka';

    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center p-4 md:p-8 bg-black/55">
        <div
          className="max-w-5xl w-full max-h-[88vh] overflow-y-auto p-6 rounded border border-[#c89d54]/40 shadow-[0_18px_46px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,235,190,0.08)] space-y-5"
          style={{ backgroundColor: 'rgba(14, 19, 26, 0.96)' }}
        >
          {/* Header + Close */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div>
              <p className="text-xs tracking-[0.22em] uppercase text-[#e3be76]/90">
                Gandalf: Stíny Severu
              </p>
              <h2 className="font-display text-2xl text-[#f5efe0]">Deník poutníka</h2>
            </div>
            <button
              type="button"
              onClick={() => toggleJournal()}
              className="px-4 py-1.5 text-xs rounded border border-[#c89d54]/35 text-[#f3e6ca] hover:bg-[#1f2835] cursor-pointer transition-colors"
            >
              Zavřít [Tab]
            </button>
          </div>

          {/* 4-Tab Bar */}
          <div role="tablist" aria-label="Sekce deníku" className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
            {tabs.map((t) => {
              const active = journalTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setJournalTab(t.id)}
                  className={`px-4 py-2 text-xs font-semibold rounded border cursor-pointer transition-colors ${
                    active
                      ? 'bg-[#c89d54] text-[#12161c] border-[#f5d593]/60'
                      : 'bg-[#131922] text-slate-200 border-[#c89d54]/25 hover:bg-[#1c2532]'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* TAB 1: ÚKOLY */}
          {journalTab === 'quests' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="p-4 rounded border border-[#c89d54]/25 bg-[#10151c]">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-[#e3be76]">
                    Kapitola {chapterDef.roman}: {chapterDef.title}
                  </p>
                  <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">{chapterDef.summary}</p>
                </div>

                <div>
                  <h3 className="font-display text-base text-[#f3dca6] mb-1">
                    {currentStepDef.title}
                  </h3>
                  <p className="text-sm text-slate-200 leading-relaxed mb-3">
                    {currentStepDef.journalEntry}
                  </p>
                  <div className="space-y-1.5 text-xs max-h-64 overflow-y-auto pr-1">
                    {ORDERED_STEPS.map((sid, idx) => {
                      const done = idx < currentIndex;
                      const active = idx === currentIndex;
                      if (idx > currentIndex) return null;
                      return (
                        <div
                          key={sid}
                          className={`flex items-start gap-2 py-1 ${
                            active ? 'text-[#f3dca6] font-medium' : 'text-slate-400 line-through'
                          }`}
                        >
                          <span className="font-mono-num">{done ? '✓' : '▸'}</span>
                          <span>{MAIN_QUEST_STEPS[sid].objective}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="font-display text-base text-[#f3dca6] mb-2">Vedlejší úkoly</h3>
                  <div className="space-y-2.5">
                    {(Object.keys(SIDE_QUESTS) as SideQuestId[]).map((sqId) => {
                      const def = SIDE_QUESTS[sqId];
                      const state = sideQuests[sqId];
                      const badge =
                        state.status === 'completed'
                          ? { text: 'Splněno', cls: 'bg-emerald-950/70 border-emerald-400/40 text-emerald-200' }
                          : state.status === 'active'
                            ? {
                                text: `Aktivní (${state.progress}/${def.requiredCount})`,
                                cls: 'bg-amber-950/70 border-amber-400/45 text-amber-200',
                              }
                            : state.status === 'available'
                              ? { text: 'Dostupný', cls: 'bg-sky-950/70 border-sky-400/40 text-sky-200' }
                              : {
                                  text: `Od Kap. ${def.unlockChapter}`,
                                  cls: 'bg-slate-900 border-white/10 text-slate-400',
                                };
                      return (
                        <div
                          key={sqId}
                          className="p-3 rounded border border-[#c89d54]/20 bg-[#10151c] space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-[#f5efe0]">{def.title}</p>
                            <span className={`px-2 py-0.5 text-[10px] rounded border ${badge.cls}`}>
                              {badge.text}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400">Zadavatel: {def.giver}</p>
                          <p className="text-[11px] text-slate-300">Odměna: {def.rewardSummary}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="p-3.5 rounded border border-[#c89d54]/20 bg-[#10151c] space-y-1.5 text-xs">
                  <h4 className="font-display text-sm text-[#f3dca6] mb-1">Rozhodnutí a stav údolí</h4>
                  <p className="text-slate-300">
                    <span className="text-slate-400">Osud Rovana:</span> {rovanStatusLabel}
                  </p>
                  <p className="text-slate-300">
                    <span className="text-slate-400">Nela a zajatci:</span>{' '}
                    {flags.nelaRescued ? 'Osvobozeni v pořádku' : 'Dosud v zajetí'}
                  </p>
                  <p className="text-slate-300">
                    <span className="text-slate-400">Postup k pevnosti:</span> {approachLabel}
                  </p>
                  <p className="text-slate-300">
                    <span className="text-slate-400">Signální ohně vyřazeny:</span> {flags.beaconsDisabled} / 3
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: MAPA */}
          {journalTab === 'map' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-base text-[#f3dca6]">Podhůří Mlžných hor</h3>
                  <button
                    type="button"
                    onClick={() => toggleWorldMap(true)}
                    className="px-3 py-1 text-xs font-semibold rounded bg-[#c89d54] hover:bg-[#dbb064] text-[#12161c] cursor-pointer whitespace-nowrap transition-colors"
                  >
                    Velká interaktivní mapa [M]
                  </button>
                </div>
                <svg
                  viewBox="0 0 200 200"
                  className="w-full aspect-square rounded border border-[#c89d54]/30 bg-[#151e25]"
                >
                  <polygon points="0,0 200,0 200,44 156,30 112,42 64,26 0,40" fill="#1d2933" />
                  <polyline
                    points="8,36 36,16 64,28 96,12 128,27 160,15 192,34"
                    fill="none"
                    stroke="#495f70"
                    strokeWidth="1.2"
                    opacity="0.7"
                  />
                  <text x="184" y="16" textAnchor="middle" fontSize="6.5" fontWeight="bold" fill="#e3be76" opacity="0.85">
                    S
                  </text>
                  <polygon points="184,5 186.5,9 181.5,9" fill="#e3be76" opacity="0.85" />
                  {/* River curve */}
                  <path
                    d="M 15 106 Q 60 98 100 104 T 185 103"
                    fill="none"
                    stroke="#3b7891"
                    strokeWidth="4.2"
                    opacity="0.8"
                  />
                  {/* Road */}
                  <path
                    d="M 100 160 L 104 134 L 90 115 L 86 104 L 78 86 L 94 52"
                    fill="none"
                    stroke="#b39367"
                    strokeWidth="2.5"
                    strokeDasharray="4 3"
                  />
                  {/* Quarry Marker */}
                  <g>
                    <circle
                      cx={mapCoord(QUARRY_POS.x)}
                      cy={mapCoord(QUARRY_POS.z)}
                      r="3"
                      fill={flags.villageSupplied ? '#e3be76' : '#64748b'}
                      stroke="#0f1419"
                      strokeWidth="1"
                    />
                    <text
                      x={mapCoord(QUARRY_POS.x)}
                      y={mapCoord(QUARRY_POS.z) - 6}
                      textAnchor="middle"
                      fontSize="5.5"
                      fill="#94a3b8"
                    >
                      Západní lom
                    </text>
                  </g>

                  {/* Landmarks */}
                  {LANDMARKS.map((loc) => {
                    const cx = mapCoord(loc.x);
                    const cy = mapCoord(loc.z);
                    const found = discoveredLocations.includes(loc.id);
                    const labelBelow = loc.id === 'woodland_path' || loc.id === 'oakhaven_ruins';
                    const dx =
                      loc.id === 'oakhaven_ruins'
                        ? -4
                        : loc.id === 'whispering_ford'
                          ? -12
                          : loc.id === 'ranger_post'
                            ? -18
                            : 0;
                    const dy = loc.id === 'ranger_post' ? -8 : labelBelow ? 11 : -6;
                    return (
                      <g key={loc.id}>
                        <circle
                          cx={cx}
                          cy={cy}
                          r={found ? 4 : 3}
                          fill={found ? '#e3be76' : '#64748b'}
                          stroke="#0f1419"
                          strokeWidth="1"
                        />
                        <text
                          x={cx + dx}
                          y={cy + dy}
                          textAnchor="middle"
                          fontSize="5.8"
                          fill={found ? '#f5efe0' : '#94a3b8'}
                        >
                          {loc.name}
                        </text>
                      </g>
                    );
                  })}

                  {/* Active Side Quest Markers */}
                  {(Object.keys(SIDE_QUESTS) as SideQuestId[]).map((sqId) => {
                    if (sideQuests[sqId].status !== 'active') return null;
                    const pos = SIDE_QUESTS[sqId].targetPos;
                    return (
                      <circle
                        key={sqId}
                        cx={mapCoord(pos.x)}
                        cy={mapCoord(pos.z)}
                        r="4.5"
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth="1.2"
                        strokeDasharray="2 1.5"
                      />
                    );
                  })}

                  {/* Active Main Objective Marker */}
                  {currentStepDef.targetPos && (
                    <circle
                      cx={mapCoord(currentStepDef.targetPos.x)}
                      cy={mapCoord(currentStepDef.targetPos.z)}
                      r="6.5"
                      fill="none"
                      stroke="#f5b041"
                      strokeWidth="1.6"
                    />
                  )}

                  {/* Gandalf Position */}
                  <circle
                    cx={mapCoord(liveSim.playerX)}
                    cy={mapCoord(liveSim.playerZ)}
                    r="4.5"
                    fill="#60a5fa"
                    stroke="#ffffff"
                    strokeWidth="1.5"
                  />
                </svg>
                <p className="text-[11px] text-slate-400">
                  Modrý bod: Gandalf · Zlatý kruh: Hlavní cíl · Tyrkysový kruh: Vedlejší úkol
                </p>
              </div>

              <div className="space-y-2.5">
                <h3 className="font-display text-base text-[#f3dca6]">
                  Lokace údolí ({discoveredLocations.length} / {LANDMARKS.length})
                </h3>
                <div className="space-y-2">
                  {LANDMARKS.map((loc) => {
                    const found = discoveredLocations.includes(loc.id);
                    return (
                      <div
                        key={loc.id}
                        className="p-2.5 rounded border border-[#c89d54]/20 bg-[#10151c] flex items-start justify-between gap-2"
                      >
                        <div>
                          <p className={`text-xs font-semibold ${found ? 'text-[#f5efe0]' : 'text-slate-400'}`}>
                            {loc.name}
                          </p>
                          <p className="text-[11px] text-slate-400">{loc.subtitle}</p>
                        </div>
                        <span className="text-[10px] shrink-0 text-[#e3be76]">
                          {found ? 'Objeveno' : 'Neprozkoumáno'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: BRAŠNA A VÝROBA */}
          {journalTab === 'inventory' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <h3 className="font-display text-base text-[#f3dca6] mb-2">Vybavení Gandalfa</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {FIXED_EQUIPMENT_IDS.map((eqId) => {
                      const def = ITEM_CATALOG[eqId];
                      return (
                        <div key={eqId} className="p-2.5 rounded border border-[#c89d54]/20 bg-[#10151c]">
                          <p className="text-xs font-semibold text-[#f3dca6]">{def.name}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{def.description}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-display text-base text-[#f3dca6]">Poutnická brašna</h3>
                    <span className="font-mono-num text-xs text-slate-300">
                      {inventory.length} / 12 slotů
                    </span>
                  </div>
                  {inventory.length === 0 ? (
                    <p className="text-xs text-slate-400">Brašna je prázdná.</p>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {inventory.map((slot) => {
                        const def = ITEM_CATALOG[slot.id];
                        if (!def) return null;
                        return (
                          <div
                            key={slot.id}
                            className="flex items-center justify-between gap-3 p-2.5 rounded border border-[#c89d54]/20 bg-[#10151c]"
                          >
                            <div>
                              <p className="text-xs font-semibold text-[#f5efe0]">
                                {def.name} <span className="font-mono-num text-[#e3be76]">×{slot.count}</span>
                              </p>
                              <p className="text-[11px] text-slate-400">{def.effectText || def.description}</p>
                            </div>
                            {def.category === 'consumable' && (
                              <button
                                type="button"
                                onClick={() => useInventoryItem(slot.id)}
                                className="px-3 py-1 text-xs rounded bg-[#c89d54] hover:bg-[#dbb064] text-[#12161c] font-semibold cursor-pointer shrink-0 transition-colors"
                              >
                                Použít
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-display text-base text-[#f3dca6]">Výroba zásob</h3>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded border ${
                        canCraftHere
                          ? 'bg-emerald-950/60 border-emerald-400/40 text-emerald-200'
                          : 'bg-amber-950/50 border-amber-400/35 text-amber-200'
                      }`}
                    >
                      {canCraftHere ? 'Ohniště v dosahu' : 'Vyžaduje Lískou či oheň'}
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    {CRAFTING_RECIPES.map((recipe) => {
                      const resultDef = ITEM_CATALOG[recipe.resultId];
                      const hasMaterials = recipe.ingredients.every(
                        (ing) => (inventory.find((s) => s.id === ing.itemId)?.count ?? 0) >= ing.count,
                      );
                      const atPoulticeCap =
                        recipe.resultId === 'healing_poultice' &&
                        (inventory.find((s) => s.id === 'healing_poultice')?.count ?? 0) >= 3;
                      return (
                        <div
                          key={recipe.id}
                          className="p-3 rounded border border-[#c89d54]/25 bg-[#10151c] flex items-center justify-between gap-3"
                        >
                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-[#f5efe0]">{resultDef.name}</p>
                            <p className="text-[11px] text-slate-400">{resultDef.effectText}</p>
                            <p className="text-[11px] text-slate-300">
                              Suroviny:{' '}
                              {recipe.ingredients
                                .map((ing) => {
                                  const owned = inventory.find((s) => s.id === ing.itemId)?.count ?? 0;
                                  return `${ITEM_CATALOG[ing.itemId].name} (${owned}/${ing.count})`;
                                })
                                .join(' · ')}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={!canCraftHere || !hasMaterials || atPoulticeCap}
                            onClick={() => craftRecipe(recipe.id)}
                            className={`px-3 py-1.5 text-xs rounded font-semibold shrink-0 transition-colors ${
                              canCraftHere && hasMaterials && !atPoulticeCap
                                ? 'bg-[#c89d54] hover:bg-[#dbb064] text-[#12161c] cursor-pointer'
                                : 'bg-[#1a2029] text-slate-500 border border-white/10 cursor-not-allowed'
                            }`}
                          >
                            {atPoulticeCap ? 'Max 3 ks' : 'Vyrobit'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <h3 className="font-display text-base text-[#f3dca6] mb-2">
                    Příběhové důkazy a listiny ({storyItems.length})
                  </h3>
                  {storyItems.length === 0 ? (
                    <p className="text-xs text-slate-400">Dosud jsi nenašel žádné příběhové předměty.</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {storyItems.map((sid) => {
                        const def = ITEM_CATALOG[sid];
                        if (!def) return null;
                        return (
                          <div key={sid} className="p-2.5 rounded border border-[#c89d54]/20 bg-[#10151c]">
                            <p className="text-xs font-semibold text-[#f3dca6]">{def.name}</p>
                            <p className="text-[11px] text-slate-400 mt-0.5">{def.description}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: SCHOPNOSTI A ATRIBUTY */}
          {journalTab === 'skills' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded border border-[#c89d54]/30 bg-[#10151c]">
                <div>
                  <p className="font-display text-sm text-[#f3dca6]">Vlastnosti a strom poznání Istari</p>
                  <p className="text-xs text-slate-300">
                    Body poznání získáváš za dokončení kapitol, vedlejších úkolů a porážku velitelů.
                  </p>
                </div>
                <div className="px-3.5 py-1.5 rounded bg-[#271f13] border border-[#e3be76]/50 text-xs font-semibold text-[#f3dca6]">
                  Body poznání: <span className="font-mono-num text-sm">{knowledgePoints}</span>
                </div>
              </div>

              {/* 5 Core Attributes */}
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
                {GANDALF_ATTRIBUTES.map((attr) => (
                  <div key={attr.id} className="p-2.5 rounded border border-[#c89d54]/20 bg-[#10151c] space-y-1">
                    <div className="flex justify-between text-xs font-semibold text-[#f5efe0]">
                      <span>{attr.name}</span>
                      <span className="font-mono-num text-[#e3be76]">
                        {attr.value}/{attr.max}
                      </span>
                    </div>
                    <div className="h-1.5 bg-[#090c10] rounded-sm overflow-hidden">
                      <div
                        className="h-full bg-[#c89d54]"
                        style={{ width: `${(attr.value / attr.max) * 100}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-slate-400 leading-snug">{attr.effect}</p>
                  </div>
                ))}
              </div>

              {/* 3-Branch 9-Node Skill Tree */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {branches.map((b) => {
                  const nodes = SKILL_TREE.filter((n) => n.branch === b.branch);
                  return (
                    <div key={b.branch} className="space-y-2.5">
                      <h3 className="font-display text-sm text-[#f3dca6] border-b border-white/10 pb-1">
                        {b.label}
                      </h3>
                      {nodes.map((skill) => {
                        const unlocked = unlockedSkills.includes(skill.id);
                        const canUnlock = !unlocked && knowledgePoints >= skill.cost;
                        return (
                          <div
                            key={skill.id}
                            className={`p-3 rounded border space-y-2 ${
                              unlocked
                                ? 'border-emerald-400/45 bg-[#121e19]'
                                : 'border-[#c89d54]/25 bg-[#10151c]'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-xs font-semibold text-[#f5efe0]">{skill.name}</p>
                              <span className="text-[10px] font-mono-num text-[#e3be76]">
                                {unlocked ? 'Odemčeno' : `${skill.cost} bod`}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-300 leading-snug">{skill.description}</p>
                            {!unlocked && (
                              <button
                                type="button"
                                disabled={!canUnlock}
                                onClick={() => unlockSkill(skill.id)}
                                className={`w-full py-1.5 text-xs rounded font-semibold transition-colors ${
                                  canUnlock
                                    ? 'bg-[#c89d54] hover:bg-[#dbb064] text-[#12161c] cursor-pointer'
                                    : 'bg-[#1a2029] text-slate-500 border border-white/10 cursor-not-allowed'
                                }`}
                              >
                                Odemknout (1 bod)
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 3. Pause Menu Modal [Esc]
  if (phase === 'paused') {
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/60">
        <div
          className="max-w-md w-full p-6 rounded border border-[#c89d54]/40 shadow-[0_18px_46px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,235,190,0.08)] space-y-5"
          style={{ backgroundColor: 'rgba(14, 19, 26, 0.96)' }}
        >
          <h2 className="font-display text-2xl text-[#f5efe0] text-center pb-2 border-b border-white/10">
            Výprava pozastavena
          </h2>

          <div className="space-y-3 pt-1">
            <label className="block space-y-1 text-sm text-slate-200">
              <span className="flex justify-between">
                <span>Citlivost myši</span>
                <span className="font-mono-num text-[#e3be76]">{settings.mouseSensitivity.toFixed(1)}x</span>
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
                className="px-3 py-1 text-xs rounded border border-[#c89d54]/30 bg-[#19202a] hover:bg-[#222c3a] text-[#f3e6ca] cursor-pointer transition-colors"
              >
                {settings.muted ? 'Ztlumeno' : 'Zapnuto'}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => resumeGame()}
              className="w-full py-2.5 bg-[#c89d54] hover:bg-[#dbb064] text-[#12161c] font-semibold text-sm rounded border border-[#f5d593]/40 cursor-pointer transition-colors"
            >
              Pokračovat ve výpravě
            </button>
            <button
              type="button"
              onClick={() => {
                saveCheckpoint(false);
                resumeGame();
              }}
              className="w-full py-2.5 bg-[#1b2735] hover:bg-[#243447] text-[#f3dca6] border border-[#c89d54]/35 text-sm rounded cursor-pointer transition-colors"
            >
              Uložit záchytný bod
            </button>
            <button
              type="button"
              onClick={() => restartGame()}
              className="w-full py-2.5 bg-[#19202a] hover:bg-[#222c3a] text-[#ede7d9] border border-[#c89d54]/25 text-sm rounded cursor-pointer transition-colors"
            >
              Začít výpravu znovu
            </button>
            <button
              type="button"
              onClick={() => returnToTitle()}
              className="w-full py-2 text-xs text-slate-400 hover:text-slate-200 cursor-pointer transition-colors"
            >
              Návrat na úvodní obrazovku
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 4. Victory (3 Distinct Epilogues) or Defeat Modal
  if (phase === 'victory' || phase === 'defeat') {
    const isVictory = phase === 'victory';
    const epilogue = isVictory ? resolveEpilogue(flags) : null;

    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/65">
        <div
          className="max-w-xl w-full p-7 rounded border border-[#c89d54]/45 shadow-[0_18px_46px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,235,190,0.08)] space-y-5 text-center"
          style={{ backgroundColor: 'rgba(14, 19, 26, 0.96)' }}
        >
          <p className="text-xs tracking-[0.25em] uppercase text-[#e3be76]">
            {isVictory ? 'GANDALF: STÍNY SEVERU – KONEC' : 'Padl jsi v podhůří'}
          </p>
          <h2 className="font-display text-3xl text-[#f5efe0]">
            {epilogue ? epilogue.title : 'Mlha pohltila cestu'}
          </h2>
          {epilogue && <p className="text-xs uppercase tracking-[0.16em] text-[#e3be76]/90">{epilogue.subtitle}</p>}
          <p className="text-sm text-slate-200 leading-relaxed">
            {epilogue
              ? epilogue.summary
              : 'Přemožen Grakhovými oddíly padl Šedý poutník dříve, než varování dolehlo k severním osadám.'}
          </p>

          {epilogue && (
            <ul className="text-left text-xs text-slate-300 space-y-1.5 bg-[#10151c] p-4 rounded border border-[#c89d54]/20">
              {epilogue.details.map((line, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-[#e3be76]">•</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="grid grid-cols-3 gap-3 py-3 border-y border-white/10">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-slate-400">Čas</p>
              <p className="font-mono-num text-lg text-[#f3dca6]">{formatElapsed(runStats.elapsedSeconds)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-slate-400">Poražení nepřátelé</p>
              <p className="font-mono-num text-lg text-[#f3dca6]">{runStats.enemiesDefeated}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-slate-400">Seslaná kouzla</p>
              <p className="font-mono-num text-lg text-[#f3dca6]">{runStats.spellsCast}</p>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-3 pt-1">
            <button
              type="button"
              data-start="true"
              onClick={() => restartGame()}
              className="px-6 py-2.5 bg-[#c89d54] hover:bg-[#dbb064] text-[#12161c] font-semibold text-sm rounded border border-[#f5d593]/40 cursor-pointer transition-colors"
            >
              Hrát znovu
            </button>
            <button
              type="button"
              onClick={() => returnToTitle()}
              className="px-5 py-2.5 bg-[#19202a] hover:bg-[#222c3a] text-[#ede7d9] border border-[#c89d54]/25 text-sm rounded cursor-pointer transition-colors"
            >
              Úvodní obrazovka
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
