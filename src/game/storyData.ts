import {
  CAMPSITE_POS,
  CAVE_POS,
  PATROL_POS,
  QUARRY_POS,
  RANGER_POS,
  SPAWN_POS,
  VILLAGE_POS,
  WATCHTOWER_POS,
} from './terrain';

// ---------------------------------------------------------------------------
// 1. Main Campaign Chapters (I - VI) & Fine-Grained Objectives
// ---------------------------------------------------------------------------

export type ChapterId = 1 | 2 | 3 | 4 | 5 | 6;

export interface ChapterDef {
  id: ChapterId;
  roman: string;
  title: string;
  targetMinutes: number;
  summary: string;
}

export const CHAPTERS: Record<ChapterId, ChapterDef> = {
  1: {
    id: 1,
    roman: 'I',
    title: 'Zhaslá světla',
    targetMinutes: 15,
    summary:
      'Gandalf pátrá po zprávách o zmizelých poutnících. Když na severním hřebeni pohasne strážní oheň, stopa koně bez jezdce ho přivede ke zraněnému hraničáři Edranovi.',
  },
  2: {
    id: 2,
    roman: 'II',
    title: 'Stopy v popelu',
    targetMinutes: 17,
    summary:
      'Nedaleko brodu zmizela obchodní karavana. Prohledej přepadené vozy, vyslechni přeživšího obchodníka a objev stopy v táboře skřetů.',
  },
  3: {
    id: 3,
    roman: 'III',
    title: 'Jména vytesaná do kamene',
    targetMinutes: 20,
    summary:
      'Trpaslík Bruni poznal na mapě staré štoly. Sestup do podzemí, rozlušti hádanku tří kamenů a odhal, kdo skřetům otevřel cestu.',
  },
  4: {
    id: 4,
    roman: 'IV',
    title: 'Cena ticha',
    targetMinutes: 20,
    summary:
      'Pečeť nalezená ve štolách patří správci karavan Rovanovi. Shromáždi důkazy v osadě Líska a postav se Rovanovi tváří v tvář.',
  },
  5: {
    id: 5,
    roman: 'V',
    title: 'Oheň na hřebeni',
    targetMinutes: 28,
    summary:
      'Skřetí oddíly pochodují k horské pevnosti. Zastav signální ohně, zachraň zajatce včetně Rovanovy sestry Nely a poraz velitele Grakha.',
  },
  6: {
    id: 6,
    roman: 'VI',
    title: 'Úsvit nad údolím',
    targetMinutes: 10,
    summary:
      'Vrať se do osady Líska, promluv s Edranem i ostatními o následcích svých rozhodnutí a odešli varování Elrondovi.',
  },
};

export type MainQuestStepId =
  | 'ch1_inspect_horse'
  | 'ch1_find_edran'
  | 'ch1_track_scouts'
  | 'ch1_defeat_scouts'
  | 'ch1_escort_liska'
  | 'ch2_talk_village'
  | 'ch2_inspect_caravan'
  | 'ch2_talk_merchant'
  | 'ch2_inspect_camp'
  | 'ch2_return_liska'
  | 'ch3_talk_bruni'
  | 'ch3_enter_mines'
  | 'ch3_solve_stones'
  | 'ch3_take_orders'
  | 'ch4_check_ledger'
  | 'ch4_confront_rovan'
  | 'ch4_prepare_assault'
  | 'ch5_infiltrate_fortress'
  | 'ch5_disable_beacons'
  | 'ch5_defeat_grakh'
  | 'ch6_return_liska'
  | 'completed';

export interface MainQuestStepDef {
  id: MainQuestStepId;
  chapter: ChapterId;
  stepNumber: number;
  title: string;
  objective: string;
  journalEntry: string;
  targetPos: { x: number; z: number } | null;
}

export const MAIN_QUEST_STEPS: Record<MainQuestStepId, MainQuestStepDef> = {
  ch1_inspect_horse: {
    id: 'ch1_inspect_horse',
    chapter: 1,
    stepNumber: 1,
    title: 'Zhaslá světla · Kůň bez jezdce',
    objective: 'Prohlédni zakrvácené sedlo u opuštěného koně na lesní stezce [F]',
    journalEntry:
      'Rok 2960 Třetího věku. Gandalf putuje severním údolím za zprávami o zmizelých poutnících. Na hřebeni zhasl strážní oheň a z lesa vyběhl vyděšený kůň bez jezdce.',
    targetPos: { x: SPAWN_POS.x + 2.5, z: SPAWN_POS.z - 5.5 },
  },
  ch1_find_edran: {
    id: 'ch1_find_edran',
    chapter: 1,
    stepNumber: 2,
    title: 'Zhaslá světla · Zraněný strážce',
    objective: 'Najdi zraněného hraničáře Edrana na strážní stezce [F]',
    journalEntry:
      'Na sedle je čerstvá krev a stopy vedou k severu. Někdo z hlídky údolí potřebuje pomoc.',
    targetPos: RANGER_POS,
  },
  ch1_track_scouts: {
    id: 'ch1_track_scouts',
    chapter: 1,
    stepNumber: 3,
    title: 'Zhaslá světla · Černý symbol',
    objective: 'Sleduj stopy útočníků a prozkoumej roztrženou černou látku [F]',
    journalEntry:
      'Edranovu družinu přepadli neobvykle disciplinovaní skřeti. V borovicích zanechali zlomené šípy a kus látky se zvláštním znamením.',
    targetPos: { x: -4, z: 25 },
  },
  ch1_defeat_scouts: {
    id: 'ch1_defeat_scouts',
    chapter: 1,
    stepNumber: 4,
    title: 'Zhaslá světla · První střet',
    objective: 'Poraž skřetí průzkumníky blokující cestu na sever',
    journalEntry:
      'Na lesní stezce číhají dva skřetí průzkumníci. Použij Glamdring, štít [PTM] i Záblesk světla [Q].',
    targetPos: PATROL_POS,
  },
  ch1_escort_liska: {
    id: 'ch1_escort_liska',
    chapter: 1,
    stepNumber: 5,
    title: 'Zhaslá světla · Osada Líska',
    objective: 'Vydej se do osady Líska a promluv s Mirou nebo Edranem [F]',
    journalEntry:
      'Edran se po ošetření vydal známou lesní stezkou k léčitelce Miře. Cesta je nyní volná; v Lísce zjistíš, jak se mu daří.',
    targetPos: VILLAGE_POS,
  },
  ch2_talk_village: {
    id: 'ch2_talk_village',
    chapter: 2,
    stepNumber: 6,
    title: 'Stopy v popelu · Zmizelá karavana',
    objective: 'Promluv si s Rovanem nebo Edranem v Lísce o zmizelé karavaně [F]',
    journalEntry:
      'Správce karavan Rovan tvrdí, že poslední kupecký vůz zmizel nedaleko stezky k průsmyku.',
    targetPos: VILLAGE_POS,
  },
  ch2_inspect_caravan: {
    id: 'ch2_inspect_caravan',
    chapter: 2,
    stepNumber: 7,
    title: 'Stopy v popelu · Přepadené vozy',
    objective: 'Prozkoumej rozbité vozy u stezky a nasbírej důkazy (0/3) [F]',
    journalEntry:
      'U severní stezky leží ohořelé zbytky karavany. Zkontroluj bedny správy údolí i rozházené zboží.',
    targetPos: PATROL_POS,
  },
  ch2_talk_merchant: {
    id: 'ch2_talk_merchant',
    chapter: 2,
    stepNumber: 8,
    title: 'Stopy v popelu · Přeživší svědek',
    objective: 'Vyslechni skrytého přeživšího obchodníka poblíž přepadení [F]',
    journalEntry:
      'Jeden z obchodníků útok přežil v úkrytu za kameny. Může vědět, kdo skřetům ukazoval cestu.',
    targetPos: { x: PATROL_POS.x - 5.5, z: PATROL_POS.z - 2.5 },
  },
  ch2_inspect_camp: {
    id: 'ch2_inspect_camp',
    chapter: 2,
    stepNumber: 9,
    title: 'Stopy v popelu · Tábor za brodem',
    objective: 'Překroč Stříbrný brod a prohledej opuštěný tábor skřetů [F]',
    journalEntry:
      'Obchodník zaslechl někoho mluvit lidskou řečí. Prozkoumej opuštěný tábor útočníků za vodou.',
    targetPos: CAMPSITE_POS,
  },
  ch2_return_liska: {
    id: 'ch2_return_liska',
    chapter: 2,
    stepNumber: 10,
    title: 'Stopy v popelu · Stará mapa',
    objective: 'Dones mapu zapomenutých průchodů trpaslíkovi Brunimu do Lísky [F]',
    journalEntry:
      'V táboře jsi našel část staré mapy s trpasličími runami. Řemeslník Bruni v Lísce je dokáže rozluštit.',
    targetPos: VILLAGE_POS,
  },
  ch3_talk_bruni: {
    id: 'ch3_talk_bruni',
    chapter: 3,
    stepNumber: 11,
    title: 'Jména vytesaná do kamene · Rada mistra',
    objective: 'Promluv s Brunim o vstupu do starých trpasličích štol [F]',
    journalEntry:
      'Symbol na mapě označuje prastarou obchodní chodbu pod východními srázy.',
    targetPos: VILLAGE_POS,
  },
  ch3_enter_mines: {
    id: 'ch3_enter_mines',
    chapter: 3,
    stepNumber: 12,
    title: 'Jména vytesaná do kamene · Staré štoly',
    objective: 'Vstup do starých štol pod východními skalami a rozsviť hůl [L]',
    journalEntry:
      'Vstup do podzemí leží severovýchodně od Lísky. V hloubi štol panuje tma a ozývají se vzdálené hlasy skřetů.',
    targetPos: CAVE_POS,
  },
  ch3_solve_stones: {
    id: 'ch3_solve_stones',
    chapter: 3,
    stepNumber: 13,
    title: 'Jména vytesaná do kamene · Hádanka tří kamenů',
    objective: 'Aktivuj kamenné znaky ve štolách ve správném pořadí [F]',
    journalEntry:
      '„Nejdříve vzniká dílo, potom cesta a nakonec světlo, které ji ukáže.“ (Kladivo → Hora → Pochodeň)',
    targetPos: CAVE_POS,
  },
  ch3_take_orders: {
    id: 'ch3_take_orders',
    chapter: 3,
    stepNumber: 14,
    title: 'Jména vytesaná do kamene · Zrada v pečeti',
    objective: 'Vezmi Grakhův rozkaz a Rovanovu pečeť ze skryté komory [F]',
    journalEntry:
      'Za otevřenou trpasličí deskou leží skřetí zásoby a zapečetěná listina směřovaná někomu z osady.',
    targetPos: CAVE_POS,
  },
  ch4_check_ledger: {
    id: 'ch4_check_ledger',
    chapter: 4,
    stepNumber: 15,
    title: 'Cena ticha · Porovnání důkazů',
    objective: 'Vrať se do Lísky a prověř Rovanovy záznamy u jeho stolu [F]',
    journalEntry:
      'Pečeť ze štol patří Rovanovi. Než jej obviníš, porovnej nalezenou pečeť s jeho účetními záznamy v Lísce.',
    targetPos: VILLAGE_POS,
  },
  ch4_confront_rovan: {
    id: 'ch4_confront_rovan',
    chapter: 4,
    stepNumber: 16,
    title: 'Cena ticha · Rozhodující rozhovor',
    objective: 'Postav se Rovanovi a rozhodni o jeho osudu [F]',
    journalEntry:
      'Důkazy jsou nepopiratelné. Promluv s Rovanem a zjisti, proč zradil vlastní sousedy.',
    targetPos: VILLAGE_POS,
  },
  ch4_prepare_assault: {
    id: 'ch4_prepare_assault',
    chapter: 4,
    stepNumber: 17,
    title: 'Cena ticha · Bouře nad průsmykem',
    objective: 'Promluv s Edranem a vyraz k horské pevnosti na severu [F]',
    journalEntry:
      'Edran hlásí pohyb skřetích oddílů. Pokud Grakh zapálí signální ohně, osady budou napadeny před úsvitem.',
    targetPos: VILLAGE_POS,
  },
  ch5_infiltrate_fortress: {
    id: 'ch5_infiltrate_fortress',
    chapter: 5,
    stepNumber: 18,
    title: 'Oheň na hřebeni · Cesta k pevnosti',
    objective: 'Pronikni k horské pevnosti a získej kontrolu nad hřebenem',
    journalEntry:
      'Bouře sílí. Postupuj k pevnosti po hlavní stezce, skrze znalosti štol nebo po římsách.',
    targetPos: WATCHTOWER_POS,
  },
  ch5_disable_beacons: {
    id: 'ch5_disable_beacons',
    chapter: 5,
    stepNumber: 19,
    title: 'Oheň na hřebeni · Zhaslé signály a zajatci',
    objective: 'Vyřaď nejméně dva signální ohně [F / E] a osvoboď Nelu se zajatci [F]',
    journalEntry:
      'Na hřebeni hoří či čekají tři signální ohně. Nedaleko v kleci drží zajaté obchodníky a Nelu.',
    targetPos: WATCHTOWER_POS,
  },
  ch5_defeat_grakh: {
    id: 'ch5_defeat_grakh',
    chapter: 5,
    stepNumber: 20,
    title: 'Oheň na hřebeni · Pán průsmyku',
    objective: 'Poraz Grakha ve finálním souboji a znič poslední signální mechanismus',
    journalEntry:
      'Grakh, pán průsmyku, brání vrchol věže. Vyhýbej se jeho sekeře, odrážej údery štítem a zlom jeho moc.',
    targetPos: WATCHTOWER_POS,
  },
  ch6_return_liska: {
    id: 'ch6_return_liska',
    chapter: 6,
    stepNumber: 21,
    title: 'Úsvit nad údolím · Návrat',
    objective: 'Vrať se do osady Líska a rozmluv se s Edranem o budoucnosti údolí [F]',
    journalEntry:
      'Nad horami svítá. Pevnost utichla a údolí je zachráněno. Čekají tě závěrečné rozhovory v Lísce.',
    targetPos: VILLAGE_POS,
  },
  completed: {
    id: 'completed',
    chapter: 6,
    stepNumber: 21,
    title: 'GANDALF: STÍNY SEVERU – Úkol splněn',
    objective: 'Údolí je zachráněno a varování míří k Elrondovi',
    journalEntry:
      '„Temnota nemusí zvítězit jen proto, že přišla dříve než světlo.“ Gandalf pokračuje ve své pouti Středozemí.',
    targetPos: null,
  },
};

// ---------------------------------------------------------------------------
// 2. Side Quests (4 Story-Rich Side Quests with Gameplay & Epilogue Impact)
// ---------------------------------------------------------------------------

export type SideQuestId =
  | 'sq_healer_hope'
  | 'sq_stone_kin'
  | 'sq_forest_song'
  | 'sq_lost_supplies';

export type SideQuestStatus = 'locked' | 'available' | 'active' | 'completed';

export interface SideQuestDef {
  id: SideQuestId;
  title: string;
  giver: string;
  unlockChapter: ChapterId;
  rewardSummary: string;
  storyImpact: string;
  targetPos: { x: number; z: number };
  requiredCount: number;
}

export const SIDE_QUESTS: Record<SideQuestId, SideQuestDef> = {
  sq_healer_hope: {
    id: 'sq_healer_hope',
    title: 'Léčitelčina poslední naděje',
    giver: 'Mira (Osada Líska)',
    unlockChapter: 2,
    rewardSummary: 'Recept na léčivý obklad, 2× byliny, +1 Bod poznání',
    storyImpact: 'Mira dokáže ošetřit více zraněných během útoku.',
    targetPos: { x: -16, z: 32 },
    requiredCount: 3,
  },
  sq_stone_kin: {
    id: 'sq_stone_kin',
    title: 'Odkaz kamenného rodu',
    giver: 'Bruni (Osada Líska)',
    unlockChapter: 3,
    rewardSummary: 'Trpasličí klín, Bruniho záznamy, +1 Bod poznání',
    storyImpact: 'Odemkne trpasličí zkratku a oslabí obranu Grakhovy pevnosti.',
    targetPos: { x: 24, z: -18 },
    requiredCount: 3,
  },
  sq_forest_song: {
    id: 'sq_forest_song',
    title: 'Píseň, kterou les zapomněl',
    giver: 'Stará Elka (Osada Líska)',
    unlockChapter: 3,
    rewardSummary: '+15 max Soustředění, nový hudební motiv osady, +1 Bod poznání',
    storyImpact: 'Obyvatelé Lísky získají odvahu a semknou se k obraně.',
    targetPos: { x: -24, z: 12 },
    requiredCount: 3,
  },
  sq_lost_supplies: {
    id: 'sq_lost_supplies',
    title: 'Ztracené zásoby',
    giver: 'Edran (Osada Líska)',
    unlockChapter: 4,
    rewardSummary: 'Zásobovací balíček před finále, +1 Bod poznání',
    storyImpact: 'Osada je zásobena před obléháním (villageSupplied).',
    targetPos: QUARRY_POS,
    requiredCount: 1,
  },
};

// ---------------------------------------------------------------------------
// 3. Story Flags & Epilogues
// ---------------------------------------------------------------------------

export type RovanChoice = 'none' | 'truth_and_mercy' | 'justice' | 'secrecy';
export type ApproachChoice = 'direct' | 'tunnel' | 'ledge';

export interface StoryFlags {
  edranRescued: boolean;
  caravanEvidenceCount: number;
  merchantInterviewed: boolean;
  puzzleSolved: boolean;
  rovanChoice: RovanChoice;
  rovanConfessed: boolean;
  approachChosen: ApproachChoice;
  beaconsDisabled: number;
  nelaRescued: boolean;
  villageHealed: boolean;
  dwarfShortcut: boolean;
  villageMorale: boolean;
  villageSupplied: boolean;
  grakhDefeated: boolean;
}

export interface EpilogueOutcome {
  id: 'light_over_valley' | 'costly_victory' | 'truth_in_shadow';
  title: string;
  subtitle: string;
  summary: string;
  details: string[];
}

export function resolveEpilogue(flags: StoryFlags): EpilogueOutcome {
  if (!flags.rovanConfessed) {
    return {
      id: 'truth_in_shadow',
      title: 'Pravda ve stínu',
      subtitle: 'Horský průsmyk je uzavřen, avšak mlčení zanechalo stín',
      summary:
        'Grakh padl a signální ohně na hřebeni už nehoří. Obyvatelé Lísky se vracejí ke svým domovům, ale Rovanova role zůstala zahalena tajemstvím — a mezi sousedy přetrvává tichá nedůvěra.',
      details: [
        flags.nelaRescued
          ? 'Nela i zajatí obchodníci se šťastně vrátili k rodinám.'
          : 'Zajatí obchodníci zůstali v chaosu hor ztraceni.',
        flags.villageSupplied
          ? 'Zásoby zachráněné z lomu pomohly přečkat nadcházející zimu.'
          : 'Vesnice bude muset nahradit ztracené zásoby vlastní prací.',
        'Gandalf napsal Elrondovi varování o organizovaných tlupách na severu.',
      ],
    };
  }

  if (flags.nelaRescued && flags.beaconsDisabled >= 2) {
    return {
      id: 'light_over_valley',
      title: 'Světlo nad údolím',
      subtitle: 'Odvaha a pravda udržely osadu jednotnou',
      summary:
        'Zajatci včetně Nely byli zachráněni, signální ohně včas vyřazeny a Rovan předstoupil před osadu, aby svou vinu odčinil poctivou prací. Líska stojí pevná a připravená.',
      details: [
        'Nela byla zachráněna dříve, než Grakh stačil zneužít Rovanovu pověst.',
        flags.villageMorale
          ? 'Zapomenutá píseň údolí znovu zní u večerních ohňů v Lísce.'
          : 'Obyvatelé společně opravují strážní cesty kolem údolí.',
        flags.villageHealed
          ? 'Díky Miřiným bylinám se všichni zranění rychle zotavují.'
          : 'Mira pečuje o přeživší podle svých nejlepších sil.',
      ],
    };
  }

  return {
    id: 'costly_victory',
    title: 'Drahé vítězství',
    subtitle: 'Údolí přežilo, leč vítězství provází zármutek',
    summary:
      'Grakhův plán s otevřením průsmyku byl zmařen a pravda vyšla najevo. Ne všechny životy v horách se však podařilo včas vyrvat temnotě.',
    details: [
      flags.nelaRescued
        ? 'Nela se vrátila do osady, ačkoli následky přepadení budou ještě dlouho bolet.'
        : 'Nela a část zajatců zůstali nezvěstní v troskách pevnosti.',
      'Edran převzal velení nad obnovenými hlídkami u Stříbrného brodu.',
      'Gandalf odešel za dalším stínem probouzejícím se na východě.',
    ],
  };
}

// ---------------------------------------------------------------------------
// 4. Gandalf RPG Attributes, Knowledge Skill Tree & Item/Crafting Catalog
// ---------------------------------------------------------------------------

export interface GandalfAttribute {
  id: string;
  name: string;
  value: number;
  max: number;
  effect: string;
}

export const GANDALF_ATTRIBUTES: GandalfAttribute[] = [
  { id: 'wisdom', name: 'Moudrost', value: 9, max: 10, effect: 'Hlubší rozbor důkazů a skryté dialogové možnosti' },
  { id: 'will', name: 'Vůle', value: 8, max: 10, effect: 'Odolnost vůči přerušení kouzel a práce se soustředěním' },
  { id: 'perception', name: 'Postřeh', value: 7, max: 10, effect: 'Snazší odhalení stop a včasné varování při útoku' },
  { id: 'swordsmanship', name: 'Šerm', value: 6, max: 10, effect: 'Účinnost a jistota úderů Glamdringem' },
  { id: 'endurance', name: 'Odolnost', value: 7, max: 10, effect: 'Výdrž v boji a odolnost proti fyzickým zásahům' },
];

export type SkillBranch = 'istari_power' | 'pilgrim_wisdom' | 'protector';

export type SkillId =
  | 'brighter_light'
  | 'flame_of_hope'
  | 'unbreakable_will'
  | 'keen_eye'
  | 'silent_cloak'
  | 'word_of_hope'
  | 'glamdring_edge'
  | 'warding_shield'
  | 'swift_step';

export interface SkillNodeDef {
  id: SkillId;
  branch: SkillBranch;
  branchLabel: string;
  name: string;
  description: string;
  cost: number;
}

export const SKILL_TREE: SkillNodeDef[] = [
  // Moc Istari
  {
    id: 'brighter_light',
    branch: 'istari_power',
    branchLabel: 'Moc Istari',
    name: 'Jasnější světlo',
    description: 'Zvětší dosah Světla hole o 45 % a snadněji odhalí skryté stopy v temnotě.',
    cost: 1,
  },
  {
    id: 'flame_of_hope',
    branch: 'istari_power',
    branchLabel: 'Moc Istari',
    name: 'Oheň naděje',
    description: 'Magický oheň (Plamen Anoru) způsobuje o 25 % vyšší poškození.',
    cost: 1,
  },
  {
    id: 'unbreakable_will',
    branch: 'istari_power',
    branchLabel: 'Moc Istari',
    name: 'Nezlomná vůle',
    description: 'Soustředění se obnovuje o 25 % rychleji v boji i při putování.',
    cost: 1,
  },
  // Moudrost poutníka
  {
    id: 'keen_eye',
    branch: 'pilgrim_wisdom',
    branchLabel: 'Moudrost poutníka',
    name: 'Bystré oko',
    description: 'Zvýší dosah postřehu stop a zlepší účinek vyrobených léčivých obkladů.',
    cost: 1,
  },
  {
    id: 'silent_cloak',
    branch: 'pilgrim_wisdom',
    branchLabel: 'Moudrost poutníka',
    name: 'Tichý plášť',
    description: 'Sníží nápadnost při chůzi o 30 % a ztíží skřetům tvé odhalení.',
    cost: 1,
  },
  {
    id: 'word_of_hope',
    branch: 'pilgrim_wisdom',
    branchLabel: 'Moudrost poutníka',
    name: 'Slovo naděje',
    description: 'Soustředění v osadě i mimo boj se rychleji zotavuje a úskok stojí méně výdrže.',
    cost: 1,
  },
  // Ochránce Středozemě
  {
    id: 'glamdring_edge',
    branch: 'protector',
    branchLabel: 'Ochránce Středozemě',
    name: 'Čepel Glamdringu',
    description: 'Zvýší poškození útoků mečem a holí o 20 % a snáze vyvede skřety z rovnováhy.',
    cost: 1,
  },
  {
    id: 'warding_shield',
    branch: 'protector',
    branchLabel: 'Ochránce Středozemě',
    name: 'Neproniknutelný štít',
    description: 'Ochranný štít spotřebuje o 35 % méně soustředění a usnadní časovaný protiúder.',
    cost: 1,
  },
  {
    id: 'swift_step',
    branch: 'protector',
    branchLabel: 'Ochránce Středozemě',
    name: 'Hbitý krok',
    description: 'Úskok stojí o 25 % méně výdrže a poskytuje delší ochranu před zásahem.',
    cost: 1,
  },
];

export type ItemCategory = 'equipment' | 'consumable' | 'material' | 'story';

export interface InventoryItemDef {
  id: string;
  name: string;
  category: ItemCategory;
  description: string;
  effectText?: string;
  maxStack?: number;
}

export const ITEM_CATALOG: Record<string, InventoryItemDef> = {
  // Pevné vybavení Gandalfa
  gandalf_staff: {
    id: 'gandalf_staff',
    name: 'Gandalfova hůl',
    category: 'equipment',
    description: 'Jasanová poutnická hůl zasazená prastarým světlem k sesílání kouzel a prosvícení temnoty.',
  },
  glamdring: {
    id: 'glamdring',
    name: 'Glamdring (Bijec nepřátel)',
    category: 'equipment',
    description: 'Prastarý gondolinský meč z Prvního věku, který chladně plane v blízkosti skřetů.',
  },
  grey_cloak: {
    id: 'grey_cloak',
    name: 'Šedý plášť',
    category: 'equipment',
    description: 'Ošlehaný poutnický plášť chránící před nepohodou i zvědavými zraky hlídek.',
  },
  pilgrim_satchel: {
    id: 'pilgrim_satchel',
    name: 'Poutnická brašna',
    category: 'equipment',
    description: 'Kožená brašna na 12 běžných zásob; příběhové listiny jsou uloženy zvlášť.',
  },

  // Spotřební předměty
  healing_poultice: {
    id: 'healing_poultice',
    name: 'Léčivý obklad',
    category: 'consumable',
    description: 'Bylinný zábal z athelasu a čistého plátna podle Miřina receptu.',
    effectText: 'Obnoví 45 zdraví (max 3 ks)',
    maxStack: 3,
  },
  herbal_decoction: {
    id: 'herbal_decoction',
    name: 'Bylinný odvar',
    category: 'consumable',
    description: 'Hřejivý čirý nálev z horských bylin, jenž utiší mysl a navrací sílu Istari.',
    effectText: 'Obnoví 45 soustředění',
  },
  travel_bread: {
    id: 'travel_bread',
    name: 'Cestovní chléb',
    category: 'consumable',
    description: 'Hutný chléb pečený v Lísce pro dlouhé pochody údolím.',
    effectText: 'Obnoví 45 výdrže',
  },
  torch_item: {
    id: 'torch_item',
    name: 'Pochodeň',
    category: 'consumable',
    description: 'Pryskyřicí napuštěná pochodeň vhodná do temných chodeb.',
    effectText: 'Rozsvítí hůl / oheň na 60 s bez ztráty soustředění',
  },

  // Suroviny a materiály
  athelas_herb: {
    id: 'athelas_herb',
    name: 'Léčivé byliny',
    category: 'material',
    description: 'Vonné lesní byliny včetně lístků athelasu.',
  },
  pure_water: {
    id: 'pure_water',
    name: 'Čistá voda',
    category: 'material',
    description: 'Nabraná z horského pramene u Stříbrného brodu.',
  },
  linen_cloth: {
    id: 'linen_cloth',
    name: 'Plátno',
    category: 'material',
    description: 'Čisté pruhy lněného plátna na obklady a pochodně.',
  },
  pine_resin: {
    id: 'pine_resin',
    name: 'Borová pryskyřice',
    category: 'material',
    description: 'Hořlavá smůla ze starých borovic.',
  },
  wood_parts: {
    id: 'wood_parts',
    name: 'Dřevěné části',
    category: 'material',
    description: 'Opracované kusy pevného jasanového dřeva.',
  },
  dwarf_wedge: {
    id: 'dwarf_wedge',
    name: 'Trpasličí kovový klín',
    category: 'material',
    description: 'Starožitný kovaný klín na opravy a otevírání kamenných mechanismů.',
  },

  // Příběhové předměty (nezapočítávají se do 12 slotů)
  black_cloth_emblem: {
    id: 'black_cloth_emblem',
    name: 'Černá látka se symbolem',
    category: 'story',
    description: 'Útržek praporce nalezený po přepadení Edranovy družiny se znakem kovářského kladiva a věže.',
  },
  forgotten_map: {
    id: 'forgotten_map',
    name: 'Mapa zapomenutých průchodů',
    category: 'story',
    description: 'Stará trpasličí kresba nalezená v opuštěném táboře skřetů. Zachycuje chodby pod horami.',
  },
  grakh_orders: {
    id: 'grakh_orders',
    name: 'Grakhův rozkaz',
    category: 'story',
    description: '„Cesta musí zůstat bez stráží. Ostatní obdrží slíbenou odměnu.“ Písemný důkaz spiknutí.',
  },
  rovan_seal: {
    id: 'rovan_seal',
    name: 'Rovanova pečeť',
    category: 'story',
    description: 'Otisk pečeti správce obchodních cest v Lísce nalezený přímo u skřetích zásob.',
  },
  bruni_notes: {
    id: 'bruni_notes',
    name: 'Bruniho záznamy',
    category: 'story',
    description: 'Rodové zápisky trpaslíků o skryté štolové cestě k horské pevnosti.',
  },
  prisoner_list: {
    id: 'prisoner_list',
    name: 'Seznam zajatců',
    category: 'story',
    description: 'Záznam ztracených kupců a jméno Rovanovy sestry Nely.',
  },
};

export interface CraftingRecipe {
  id: string;
  resultId: string;
  ingredients: Array<{ itemId: string; count: number }>;
}

export const CRAFTING_RECIPES: CraftingRecipe[] = [
  {
    id: 'craft_poultice',
    resultId: 'healing_poultice',
    ingredients: [
      { itemId: 'athelas_herb', count: 2 },
      { itemId: 'linen_cloth', count: 1 },
    ],
  },
  {
    id: 'craft_decoction',
    resultId: 'herbal_decoction',
    ingredients: [
      { itemId: 'athelas_herb', count: 2 },
      { itemId: 'pure_water', count: 1 },
    ],
  },
  {
    id: 'craft_torch',
    resultId: 'torch_item',
    ingredients: [
      { itemId: 'wood_parts', count: 1 },
      { itemId: 'linen_cloth', count: 1 },
      { itemId: 'pine_resin', count: 1 },
    ],
  },
];

// ---------------------------------------------------------------------------
// 5. Three-Stone Cave Puzzle Logic (Pure, Non-Softlocking)
// ---------------------------------------------------------------------------

export type StoneRuneId = 'hammer' | 'mountain' | 'torch';

export const STONE_PUZZLE_ORDER: readonly StoneRuneId[] = ['hammer', 'mountain', 'torch'];

export const STONE_RUNE_LABELS: Record<StoneRuneId, string> = {
  hammer: 'Kámen Kladiva (Dílo)',
  mountain: 'Kámen Hory (Cesta)',
  torch: 'Kámen Pochodně (Světlo)',
};

export function stepStonePuzzle(
  currentSequence: StoneRuneId[],
  pressed: StoneRuneId,
): { nextSequence: StoneRuneId[]; solved: boolean; reset: boolean } {
  const expected = STONE_PUZZLE_ORDER[currentSequence.length];
  if (pressed === expected) {
    const nextSequence = [...currentSequence, pressed];
    const solved = nextSequence.length === STONE_PUZZLE_ORDER.length;
    return { nextSequence, solved, reset: false };
  }
  return { nextSequence: [], solved: false, reset: true };
}

export function getMainQuestStepDef(step: MainQuestStepId | string): MainQuestStepDef {
  if (typeof step === 'string' && Object.prototype.hasOwnProperty.call(MAIN_QUEST_STEPS, step)) {
    return MAIN_QUEST_STEPS[step as MainQuestStepId];
  }
  return MAIN_QUEST_STEPS.ch1_inspect_horse;
}

export function resolveGrakhKillStep(
  currentStep: MainQuestStepId,
  beaconsDisabled: number,
): MainQuestStepId {
  if (
    currentStep === 'ch5_infiltrate_fortress' ||
    currentStep === 'ch5_disable_beacons' ||
    currentStep === 'ch5_defeat_grakh'
  ) {
    return beaconsDisabled >= 2 ? 'ch6_return_liska' : 'ch5_disable_beacons';
  }
  return currentStep;
}

export function resolveChapter5EntryStep(
  beaconsDisabled: number,
  grakhDefeated: boolean,
): MainQuestStepId {
  if (grakhDefeated && beaconsDisabled >= 2) {
    return 'ch6_return_liska';
  }
  if (grakhDefeated) {
    return 'ch5_disable_beacons';
  }
  if (beaconsDisabled >= 2) {
    return 'ch5_defeat_grakh';
  }
  return 'ch5_infiltrate_fortress';
}

// ---------------------------------------------------------------------------
// 6. Branching NPC Dialogue Tree
// ---------------------------------------------------------------------------

export interface DialogueChoice {
  label: string;
  tone?: 'wisdom' | 'caution' | 'direct' | 'neutral';
  effectId: string;
}

export interface DialogueNode {
  id: string;
  speaker: string;
  role: string;
  lines: string[];
  choices?: DialogueChoice[];
  actionLabel?: string;
}

export function buildNpcDialogue(
  npcId: 'edran' | 'mira' | 'bruni' | 'rovan' | 'merchant' | 'elka' | 'nela',
  step: MainQuestStepId,
  flags: StoryFlags,
  sideQuests: Record<SideQuestId, { status: SideQuestStatus; progress: number }>,
): DialogueNode {
  if (npcId === 'edran') {
    if (step === 'ch1_find_edran') {
      return {
        id: 'edran_wounded',
        speaker: 'Edran',
        role: 'Zraněný hraničář Dúnadan',
        lines: [
          'Mithrandire… můj kůň tě tedy našel. Přepadli nás u brodu a ostatní z hlídky jsem v té tmě ztratil.',
          'Skřeti se pohybovali na povel. Věděli, kde hlídáme, a nejdřív zaútočili na náš strážní oheň.',
          'Děkuji za obvaz. Dojdu skrytou lesní stezkou k léčitelce Miře v Lísce. Na hlavní cestě ale zůstali zvědové. Najdi mě pak v osadě.',
        ],
        choices: [
          {
            label: '[Moudrost] Ošetřím ti ránu a zjistím, proč světlo na věži zhaslo.',
            tone: 'wisdom',
            effectId: 'edran_rescued_ch1',
          },
          {
            label: '[Přímý zásah] Ošetřím tě. Dostaň se do bezpečí, o hlídku se postarám.',
            tone: 'direct',
            effectId: 'edran_rescued_ch1',
          },
        ],
      };
    }
    if (step === 'ch1_escort_liska' || step === 'ch2_talk_village') {
      return {
        id: 'edran_liska_ch2',
        speaker: 'Edran',
        role: 'Hraničář Dúnadan (Osada Líska)',
        lines: [
          'Mira mi ránu zavázala. Díky tobě jsem se dostal domů, Mithrandire. Ostatní z mé hlídky ale stále pohřešujeme.',
          'Před třemi dny zmizela i karavana. Rovan říká, že kupec zvolil cestu na sever. Zajímalo by mě, kdo všechno o té cestě věděl.',
          'Vozy zůstaly na lesní stezce. Najdeš-li přeživšího, možná nám poví víc než já.',
        ],
        choices: [
          {
            label: 'Prohlédnu místo přepadení karavany a vrátím se se zprávou.',
            tone: 'wisdom',
            effectId: step === 'ch1_escort_liska' ? 'advance_to_ch2' : 'edran_start_caravan',
          },
        ],
      };
    }
    if (step === 'ch4_prepare_assault') {
      return {
        id: 'edran_ch4_assault',
        speaker: 'Edran',
        role: 'Hraničář Dúnadan (Osada Líska)',
        lines: [
          'Moji zvědové právě přiběhli od brodu! Skřetí oddíly se dávají do pohybu směrem k horské pevnosti.',
          'Pokud jejich velitel Grakh zapálí signální ohně na hřebeni, vpadnou další houfy do údolí ještě před úsvitem.',
          flags.rovanConfessed
            ? 'Rovanův plán známe a víme, kde drží zajatce. Kudy chceš k pevnosti proniknout?'
            : 'Musíš na hřeben okamžitě. Jakou cestou vyrazíš?',
        ],
        choices: [
          {
            label: '[Přímý zásah] Půjdu hlavní horskou stezkou přímo k pevnosti.',
            tone: 'direct',
            effectId: 'approach_direct',
          },
          {
            label: '[Průzkum] Využiji tajnou lesní římsu nad brodem a obejdu hlídky.',
            tone: 'caution',
            effectId: 'approach_ledge',
          },
          ...(flags.dwarfShortcut || flags.puzzleSolved
            ? [
                {
                  label: '[Znalost štol] Postoupím starou trpasličí cestou zadem k hřebeni.',
                  tone: 'wisdom' as const,
                  effectId: 'approach_tunnel',
                },
              ]
            : []),
        ],
      };
    }
    if (step === 'ch6_return_liska') {
      return {
        id: 'edran_ending',
        speaker: 'Edran',
        role: 'Hraničář Dúnadan (Osada Líska)',
        lines: [
          'Zachránil jsi nás, Gandalfe. Signální ohně na hřebeni mlčí a z hor už nestoupá kouř.',
          flags.rovanConfessed
            ? 'Pravda o Rovanovi nebyla lehká, ale díky tobě údolí neztratilo čest ani naději.'
            : 'Ačkoli lidé stále cítí nevysvětlené napětí kolem správy karavan, vesnice je v bezpečí.',
          'Přál bych si, abys tu mohl zůstat. Myslíš, že se skřeti vrátí?',
        ],
        choices: [
          {
            label: '„Má cesta pokračuje. A obávám se, že dobrých strážců bude brzy třeba po celém Severu.“',
            tone: 'wisdom',
            effectId: 'finish_campaign_victory',
          },
        ],
      };
    }
    if (sideQuests.sq_lost_supplies.status === 'available') {
      return {
        id: 'edran_sq4_offer',
        speaker: 'Edran',
        role: 'Hraničář Dúnadan',
        lines: [
          'Než udeříme na pevnost, mám jednu prosbu. Do Lísky nedorazil zásobovací vůz s potravinami a výstrojí.',
          'Skřeti jej ukryli v západním lomu severně od brodu. Pokud zásoby získáme zpět, osada přečká zimu i případný útok.',
        ],
        choices: [
          { label: 'Vyrazím k lomu a zásoby přivedu zpět.', tone: 'direct', effectId: 'accept_sq_supplies' },
          { label: 'Zatím mám přednější stopu.', tone: 'neutral', effectId: 'close' },
        ],
      };
    }
    return {
      id: 'edran_idle',
      speaker: 'Edran',
      role: 'Hraničář Dúnadan',
      lines: [
        'Hlídám stezku u Lísky. Zůstávej ostražitý, Gandalfe — na severních svazích se stahují stíny.',
      ],
      actionLabel: 'Zůstaň na stráži',
    };
  }

  if (npcId === 'mira') {
    if (step === 'ch1_escort_liska') {
      return {
        id: 'mira_ch1_welcome',
        speaker: 'Mira',
        role: 'Vesnická léčitelka (Osada Líska)',
        lines: [
          'Vítej v Lísce, Šedý poutníku. Edran došel lesní stezkou sotva po svých, ale tvůj obvaz mu zachránil život.',
          'Zastav se u našeho ohniště, kdykoli budeš potřebovat nabrat síly. Zásob ubývá a z lesa se nevrátila ani poslední karavana.',
          'Edran ví, kde vozy napadli. Prosím, zjisti, jestli někdo přežil.',
        ],
        choices: [
          { label: 'Děkuji za pomoc, Miro. Pustím se do pátrání.', tone: 'wisdom', effectId: 'advance_to_ch2' },
        ],
      };
    }
    if (sideQuests.sq_healer_hope.status === 'available') {
      return {
        id: 'mira_sq1_offer',
        speaker: 'Mira',
        role: 'Vesnická léčitelka',
        lines: [
          'Gandalfe, došly mi zásoby horských bylin athelasu a Edran i ostatní ranění je nutně potřebují.',
          'Rostou v borovém lese nad cestou, kde se nyní toulají skřetí hlídky. Poblíž leží i starý hrob mého učitele, někdejšího vesnického léčitele.',
          'Dokázal bys přinést tři trsy léčivých bylin?',
        ],
        choices: [
          { label: 'Přinesu ti byliny z lesa i uctím památku starého léčitele.', tone: 'wisdom', effectId: 'accept_sq_healer' },
          { label: 'Teď musím sledovat hlavní stopu.', tone: 'neutral', effectId: 'close' },
        ],
      };
    }
    if (sideQuests.sq_healer_hope.status === 'active' && sideQuests.sq_healer_hope.progress >= 3) {
      return {
        id: 'mira_sq1_complete',
        speaker: 'Mira',
        role: 'Vesnická léčitelka',
        lines: [
          'To jsou přesně ty čerstvé listy athelasu! A našel jsi i brašnu mého učitele…',
          '„On pomáhal každému. Dokonce i těm, kteří mu neměli čím zaplatit.“',
          'Vezmi si prosím tyto zásoby obkladů. Díky tobě dokážu v Lísce ošetřit každého raněného.',
        ],
        choices: [
          {
            label: '„Zanechal po sobě větší bohatství než mnozí králové.“ (Dokončit úkol)',
            tone: 'wisdom',
            effectId: 'complete_sq_healer',
          },
        ],
      };
    }
    return {
      id: 'mira_rest',
      speaker: 'Mira',
      role: 'Vesnická léčitelka',
      lines: [
        'U našeho ohniště si můžeš kdykoli ošetřit rány a doplnit sílu, nebo v brašně [Tab] vyrobit léčivé obklady.',
      ],
      choices: [
        { label: 'Odpočinout si u léčitelky (obnovit Zdraví, Soustředění a uložit postup)', tone: 'wisdom', effectId: 'rest_liska' },
        { label: 'Sbohem, Miro.', tone: 'neutral', effectId: 'close' },
      ],
    };
  }

  if (npcId === 'bruni') {
    if (step === 'ch2_return_liska' || step === 'ch3_talk_bruni') {
      return {
        id: 'bruni_ch3_intro',
        speaker: 'Bruni',
        role: 'Trpasličí řemeslník (Osada Líska)',
        lines: [
          'Ukaž tu mapu z tábora, poutníku… Hrom do toho! Tohle jsou značky mého rodu z dob před stovkami let!',
          'Pod východními skalami vedou staré obchodní a větrací štoly. Všichni mysleli, že jsou zasypané — ale skřeti se je zjevně snaží opravit a propojit s průsmykem.',
          'Kamenná brána uvnitř je zamčená starou zkouškou tří znaků: „Nejdříve vzniká dílo, potom cesta a nakonec světlo, které ji ukáže.“',
        ],
        choices: [
          {
            label: 'Kladivo, Hora a Pochodeň… Hned se do starých štol vydám.',
            tone: 'wisdom',
            effectId: 'start_ch3_mines',
          },
        ],
      };
    }
    if (sideQuests.sq_stone_kin.status === 'available') {
      return {
        id: 'bruni_sq2_offer',
        speaker: 'Bruni',
        role: 'Trpasličí řemeslník',
        lines: [
          'Když už znáš cestu k horninám, Gandalfe… Hledám ztracené záznamy svých předků, kteří tyto průchody stavěli.',
          'Na východních svazích před štolami stojí tři staré kamenné značky. Obejdeš-li je, prozradí polohu zapomenuté komory.',
        ],
        choices: [
          { label: 'Pomohu ti najít paměť tvého rodu, Bruni.', tone: 'wisdom', effectId: 'accept_sq_stone' },
          { label: 'Možná později.', tone: 'neutral', effectId: 'close' },
        ],
      };
    }
    if (sideQuests.sq_stone_kin.status === 'active' && sideQuests.sq_stone_kin.progress >= 3) {
      return {
        id: 'bruni_sq2_complete',
        speaker: 'Bruni',
        role: 'Trpasličí řemeslník',
        lines: [
          'Tak tam nebylo zlato… jen staré nástroje, mapy a jména kameníků. Čekal jsem poklad.',
          'Ale máš pravdu, čaroději — paměť národa bývá vzácnější než zlato. Tenhle trpasličí klín a plánek průchodu ti otevřou zadní cestu k pevnosti!',
        ],
        choices: [
          { label: 'Děkuji, příteli. Dobře poslouží. (Dokončit úkol)', tone: 'wisdom', effectId: 'complete_sq_stone' },
        ],
      };
    }
    return {
      id: 'bruni_idle',
      speaker: 'Bruni',
      role: 'Trpasličí řemeslník',
      lines: [
        'Kámen si pamatuje víc než lidé, Gandalfe. Dávej v horách pozor na nosníky a zrezivělé mechanismy.',
      ],
      actionLabel: 'Dobrý den, Bruni',
    };
  }

  if (npcId === 'rovan') {
    if (step === 'ch4_confront_rovan') {
      return {
        id: 'rovan_confrontation',
        speaker: 'Rovan',
        role: 'Správce obchodních karavan',
        lines: [
          'Gandalf: „Víš, proč jsem přišel.“ — Položíš na stůl jeho pečeť ze starých štol. Rovan zbledne.',
          '„Mají moji sestru Nelu! Řekli mi, že pokud jim nechám volný průchod bez stráží, pustí ji. Je to jediná rodina, která mi zůstala!“',
          '„Strach je špatný rádce,“ odvětíš. „Ale ještě horší je uvěřit, že nám nezbývá žádná jiná cesta.“ Jak naložíš s Rovanem?',
        ],
        choices: [
          {
            label: '[Soucit a pravda] Pomohu ti zachránit Nelu, ale po boji musíš vesnici říct pravdu.',
            tone: 'wisdom',
            effectId: 'rovan_truth_mercy',
          },
          {
            label: '[Spravedlnost] Předám tě Edranovi, ale zasadím se o spravedlivý soud za záchranu informací.',
            tone: 'direct',
            effectId: 'rovan_justice',
          },
          {
            label: '[Opatrnost] Zatím tvou vinu utajím před sousedy, pokud mi teď pomůžeš zastavit skřety.',
            tone: 'caution',
            effectId: 'rovan_secrecy',
          },
        ],
      };
    }
    if (step === 'ch2_talk_village') {
      return {
        id: 'rovan_ch2_evade',
        speaker: 'Rovan',
        role: 'Správce obchodních karavan',
        lines: [
          'Poslední karavana měla jen běžné zásoby pro severní průsmyk. Netuším, proč se nevrátila.',
          'Jestli chceš něco najít, zeptej se na lesní stezce u brodu. Tady v Lísce žádný nepřítel není.',
        ],
        choices: [
          { label: 'Podívám se na místo přepadení osobně.', tone: 'wisdom', effectId: 'edran_start_caravan' },
        ],
      };
    }
    return {
      id: 'rovan_after',
      speaker: 'Rovan',
      role: 'Správce obchodních karavan',
      lines: [
        flags.rovanChoice === 'none'
          ? 'Mám plnou hlavu účetních knih a zpožděných vozů.'
          : flags.nelaRescued
            ? 'Nela je zpátky živá… Nikdy ti to nezapomenu, Gandalfe.'
            : 'Udělám cokoli, abych napravil svou chybu. Zajatce drží u severní hradby pevnosti.',
      ],
      actionLabel: 'Pokračovat',
    };
  }

  if (npcId === 'merchant') {
    return {
      id: 'merchant_survivor',
      speaker: 'Skrytý obchodník',
      role: 'Přeživší z karavany',
      lines: [
        'Pssst! Odešli už? Schoval jsem se pod vozem, když zaútočili…',
        'Nebyli tam jen skřeti! Někdo jim ukazoval cestu a znal přesně obsah našich beden s majetkem správy údolí.',
        'Neviděl jsem mu do tváře, ale rozuměli si. Jeden z nich mluvil naší řečí a pak zamířili za brod do starého tábora!',
      ],
      choices: [
        {
          label: 'Díky za svědectví. Prohledám jejich tábor za vodou — zůstaň v bezpečí.',
          tone: 'wisdom',
          effectId: 'merchant_talked',
        },
      ],
    };
  }

  if (npcId === 'elka') {
    if (sideQuests.sq_forest_song.status === 'available') {
      return {
        id: 'elka_sq3_offer',
        speaker: 'Stará Elka',
        role: 'Pamětnice z osady Líska',
        lines: [
          'Pamatuješ si tu starou píseň, co se tu zpívala poutníkům pro štěstí? Lidé dnes ztrácejí odvahu.',
          'Tři sloky příběhu zůstaly v dopisech a zápisech u starých táborů v údolí. Kdyby se vrátily do Lísky, lidem by se ulevilo na duchu.',
        ],
        choices: [
          { label: 'Najdu ztracené zápisy té písně.', tone: 'wisdom', effectId: 'accept_sq_song' },
          { label: 'Možná později, Elko.', tone: 'neutral', effectId: 'close' },
        ],
      };
    }
    if (sideQuests.sq_forest_song.status === 'active' && sideQuests.sq_forest_song.progress >= 3) {
      return {
        id: 'elka_sq3_done',
        speaker: 'Stará Elka',
        role: 'Pamětnice z osady Líska',
        lines: [
          'Ta slova nebyla o mocných králích, ale o obyčejných lidech, kteří vyšli v temnotě pomoci sousedům!',
          'Poslouchej… Líska si tu melodii znovu pamatuje. Děkuji ti, Gandalfe.',
        ],
        choices: [
          { label: 'Odvaha obyčejných lidí drží temnotu na uzdě. (Dokončit úkol)', tone: 'wisdom', effectId: 'complete_sq_song' },
        ],
      };
    }
    return {
      id: 'elka_idle',
      speaker: 'Stará Elka',
      role: 'Pamětnice z osady Líska',
      lines: [
        flags.villageMorale
          ? 'Celá vesnice si teď pobrukuje starou píseň naděje. Strach ustupuje.'
          : 'Kéž by se nad údolím brzy rozjasnilo.',
      ],
      actionLabel: 'Buď zdráva, Elko',
    };
  }

  // Nela (freed prisoner at fortress)
  return {
    id: 'nela_rescued',
    speaker: 'Nela',
    role: 'Rovanova sestra',
    lines: [
      'Děkuji ti, Šedý poutníku! Grakh mě i kupce držel jako rukojmí, ale sám se vysmíval, že Rovanovi stejně nikdy nedovolí odejít živému.',
      'Slyšela jsem, jak velitel chystá poslední signální oheň nahoře na věži. Zastav ho!',
    ],
    actionLabel: 'Utíkejte do bezpečí v Lísce',
  };
}
