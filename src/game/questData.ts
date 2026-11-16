import {
  CAMPSITE_POS,
  FORD_POS,
  PATROL_POS,
  RANGER_POS,
  WATCHTOWER_POS,
} from './terrain';

export type QuestStageId =
  | 'stage_1_path'
  | 'stage_2_meet_ranger'
  | 'stage_3_follow_forest'
  | 'stage_4_defeat_patrol'
  | 'stage_5_find_campsite'
  | 'stage_6_find_clue'
  | 'stage_7_travel_watchtower'
  | 'stage_8_defeat_commander'
  | 'stage_9_recover_message'
  | 'stage_10_return_ranger'
  | 'completed';

export interface QuestStage {
  id: QuestStageId;
  stepNumber: number;
  title: string;
  objective: string;
  journalEntry: string;
  targetPos: { x: number; z: number } | null;
}

export const QUEST_STAGES: Record<QuestStageId, QuestStage> = {
  stage_1_path: {
    id: 'stage_1_path',
    stepNumber: 1,
    title: 'Stíny Mlžných hor',
    objective: 'Vydej se po lesní stezce k táboru Dúnadanů',
    journalEntry:
      'Zvěsti o skřetích nájezdech dolehly až do Kraje i na Hůrecko. Na lesní vyhlídce pod Mlžnými horami před tebou hoří strážní oheň.',
    targetPos: RANGER_POS,
  },
  stage_2_meet_ranger: {
    id: 'stage_2_meet_ranger',
    stepNumber: 2,
    title: 'Varování na cestě',
    objective: 'Promluv si s hraničářem Halbaradem [F]',
    journalEntry:
      'U staré stezky stojí zahalený Hraničář ze Severu. Promluv si s ním a zjisti, co se v podhůří děje.',
    targetPos: RANGER_POS,
  },
  stage_3_follow_forest: {
    id: 'stage_3_follow_forest',
    stepNumber: 3,
    title: 'Do šepotu borovic',
    objective: 'Postupuj lesní cestou na sever k říčnímu brodu',
    journalEntry:
      'Halbarad varuje, že skřetí zvědové přešli pod příkrovem mlhy Stříbrný brod. Vydej se hlouběji mezi borovice.',
    targetPos: PATROL_POS,
  },
  stage_4_defeat_patrol: {
    id: 'stage_4_defeat_patrol',
    stepNumber: 4,
    title: 'Šarvátka v borovicích',
    objective: 'Poraž skřetí hlídku blokující lesní stezku',
    journalEntry:
      'Skřetí zvědové a orcký nájezdník číhají na cestě nedaleko brodu. Zažeň je holí, mečem i plamenem.',
    targetPos: PATROL_POS,
  },
  stage_5_find_campsite: {
    id: 'stage_5_find_campsite',
    stepNumber: 5,
    title: 'Stopy za brodem',
    objective: 'Překroč Stříbrný brod a najdi opuštěný tábor skřetů',
    journalEntry:
      'Hlídka je rozprášena. Sleduj otisky okovaných bot za brodem a zjisti, kde se nájezdníci utábořili.',
    targetPos: CAMPSITE_POS,
  },
  stage_6_find_clue: {
    id: 'stage_6_find_clue',
    stepNumber: 6,
    title: 'Popel a rozkazy',
    objective: 'Prohledej opuštěný tábor a najdi stopy [F]',
    journalEntry:
      'Tábor byl opuštěn ve spěchu, u ohniště však zůstaly bedny a ohořelý pergamen. Prohlédni je zblízka.',
    targetPos: CAMPSITE_POS,
  },
  stage_7_travel_watchtower: {
    id: 'stage_7_travel_watchtower',
    stepNumber: 7,
    title: 'Výstup na Amon Rhûn',
    objective: 'Vystoupej po severní hřebenové cestě k pobořené strážní věži',
    journalEntry:
      'Nalezené rozkazy směřují na sever k Amon Rhûnu, prastaré arnorské strážní věži nad průsmykem. Vydej se vzhůru po horské cestě.',
    targetPos: WATCHTOWER_POS,
  },
  stage_8_defeat_commander: {
    id: 'stage_8_defeat_commander',
    stepNumber: 8,
    title: 'Náčelník ze skalisek',
    objective: 'Poraž velitele skřetů Lugdushe a jeho strážce',
    journalEntry:
      'Těžce obrněný velitel skřetů drží vrchol rozbořené věže spolu s orckými lučištníky. Zlom jeho moc nad hláskou.',
    targetPos: WATCHTOWER_POS,
  },
  stage_9_recover_message: {
    id: 'stage_9_recover_message',
    stepNumber: 9,
    title: 'Černá pečeť',
    objective: 'Vyzvedni Temnou depeši z truhly na strážní věži [F]',
    journalEntry:
      'Lugdush střežil zapečetěnou depeši označenou temným železným znamením. Vezmi zprávu dřív, než sestoupíš z hory.',
    targetPos: WATCHTOWER_POS,
  },
  stage_10_return_ranger: {
    id: 'stage_10_return_ranger',
    stepNumber: 10,
    title: 'Zpráva pro Sever',
    objective: 'Vrať se k hraničáři Halbaradovi a předej varování [F]',
    journalEntry:
      'Depeše mluví o vojskách shromažďovaných pod Gundabadem a Dol Guldurem. Dones zprávu rychle Halbaradovi, aby se osady mohly připravit.',
    targetPos: RANGER_POS,
  },
  completed: {
    id: 'completed',
    stepNumber: 10,
    title: 'Úkol splněn: Stíny Mlžných hor',
    objective: 'Pohraniční osady byly varovány',
    journalEntry:
      'Halbarad vyrazil na sever, aby varoval Hůrku i Roklinku. Ač se v průsmycích srocují stíny, Šedý poutník drží stráž.',
    targetPos: null,
  },
};

export interface DialogueNode {
  id: string;
  speaker: string;
  role: string;
  lines: string[];
  actionLabel: string;
}

export function getRangerDialogue(stage: QuestStageId): DialogueNode {
  if (stage === 'stage_1_path' || stage === 'stage_2_meet_ranger') {
    return {
      id: 'ranger_intro',
      speaker: 'Halbarad',
      role: 'Hraničář ze Severu',
      lines: [
        'Buď zdráv, Mithrandire! Málokdo dnes kráčí tímto podhůřím s lehkým krokem, když se na skalách drží mlha.',
        'Za soumraku překročili skřetí zvědové Stříbrný brod a obsadili lesní stezku. Mí bratři zahlédli světlo pochodní vysoko na pobořené strážní věži Amon Rhûn.',
        'Vyčisti cestu od hlídky, prohledej jejich opuštěný tábor za vodou a zjisti, kdo jim velí, než bude Dubín i Hůrka zaskočena nepřipravená.',
      ],
      actionLabel: 'Okamžitě prozkoumám cestu',
    };
  }
  if (stage === 'stage_10_return_ranger') {
    return {
      id: 'ranger_complete',
      speaker: 'Halbarad',
      role: 'Hraničář ze Severu',
      lines: [
        'Vracíš se z Amon Rhûnu! Podle tvé hole i pláště vidím, že boj byl tvrdý.',
        'Dovol, ať si přečtu tuto Temnou depeši... Železná pečeť a počty bojovníků z hlubokých průsmyků pod Gundabadem. To nebyla jen zatoulaná tlupa – byl to předvoj.',
        'Ihned vyšlu rychlé jezdce, aby varovali osady i elfy v Imladris. Středozem ti dluží klidnou noc, Gandalfe Šedý.',
      ],
      actionLabel: 'Jeď rychle, Halbarade (Dokončit úkol)',
    };
  }
  if (stage === 'completed') {
    return {
      id: 'ranger_after',
      speaker: 'Halbarad',
      role: 'Hraničář ze Severu',
      lines: [
        'Naši jezdci už jsou na cestě k osadám. Odpočiň si u ohně, Mithrandire, nebo prozkoumej Stinnou rokli a Rozvaliny Dubína.',
      ],
      actionLabel: 'Sbohem',
    };
  }
  return {
    id: 'ranger_progress',
    speaker: 'Halbarad',
    role: 'Hraničář ze Severu',
    lines: [
      `Postupuj na sever za Stříbrný brod (${Math.round(FORD_POS.x)}, ${Math.round(FORD_POS.z)}). Hledej jejich tábor a pak se vydej po hřebenové cestě ke strážní věži.`,
    ],
    actionLabel: 'Půjdu dál',
  };
}

export interface InventoryItemDef {
  id: string;
  name: string;
  category: 'consumable' | 'clue' | 'relic';
  description: string;
  effectText?: string;
}

export const ITEM_CATALOG: Record<string, InventoryItemDef> = {
  athelas_leaf: {
    id: 'athelas_leaf',
    name: 'Athelas (Králův lístek)',
    category: 'consumable',
    description: 'Vonná léčivá bylina rostoucí u čistých lesních pramenů.',
    effectText: 'Obnoví 45 zdraví',
  },
  elven_phial: {
    id: 'elven_phial',
    name: 'Lahvička miruvoru',
    category: 'consumable',
    description: 'Hřejivý srdeční posilující nápoj, který navrací sílu unaveným poutníkům.',
    effectText: 'Obnoví 50 magie',
  },
  goblin_orders: {
    id: 'goblin_orders',
    name: 'Ohořelé skřetí rozkazy',
    category: 'clue',
    description:
      'Hrubý pergamen psaný černým inkoustem nařizující zvědům posílit náčelníka Lugdushe na věži Amon Rhûn.',
  },
  dark_dispatch: {
    id: 'dark_dispatch',
    name: 'Zapečetěná temná depeše',
    category: 'clue',
    description:
      'Zpráva se železnou pečetí odhalující shromažďování válečných houfů pod severními průsmyky k útoku na pohraničí.',
  },
  rune_stone: {
    id: 'rune_stone',
    name: 'Prastará arnorská runa',
    category: 'relic',
    description:
      'Ošlehaný kámen s vyrytou hvězdou ukrytý ve Stinné rokli, jenž tiše zvučí dávným řemeslem.',
  },
};

export interface QuestProgressState {
  stage: QuestStageId;
  patrolKilled: number;
  patrolTotal: number;
  commanderDefeated: boolean;
  clueFound: boolean;
  dispatchRecovered: boolean;
}

export function advanceQuestProgress(
  current: QuestProgressState,
  event:
    | { type: 'enter_zone'; zone: 'ranger_approach' | 'forest_path' | 'campsite' | 'watchtower' }
    | { type: 'talk_ranger' }
    | { type: 'patrol_enemy_killed' }
    | { type: 'inspect_clue' }
    | { type: 'commander_killed' }
    | { type: 'recover_dispatch' },
): QuestProgressState {
  const next = { ...current };

  switch (event.type) {
    case 'enter_zone': {
      if (event.zone === 'ranger_approach' && next.stage === 'stage_1_path') {
        next.stage = 'stage_2_meet_ranger';
      } else if (event.zone === 'forest_path' && next.stage === 'stage_3_follow_forest') {
        next.stage = next.patrolKilled >= next.patrolTotal ? 'stage_5_find_campsite' : 'stage_4_defeat_patrol';
      } else if (event.zone === 'campsite' && next.stage === 'stage_5_find_campsite') {
        next.stage = next.clueFound ? 'stage_7_travel_watchtower' : 'stage_6_find_clue';
      } else if (event.zone === 'watchtower' && next.stage === 'stage_7_travel_watchtower') {
        next.stage = next.commanderDefeated ? 'stage_9_recover_message' : 'stage_8_defeat_commander';
      }
      break;
    }
    case 'talk_ranger': {
      if (next.stage === 'stage_1_path' || next.stage === 'stage_2_meet_ranger') {
        next.stage = 'stage_3_follow_forest';
      } else if (next.stage === 'stage_10_return_ranger') {
        next.stage = 'completed';
      }
      break;
    }
    case 'patrol_enemy_killed': {
      next.patrolKilled = Math.min(next.patrolTotal, next.patrolKilled + 1);
      if (
        (next.stage === 'stage_3_follow_forest' || next.stage === 'stage_4_defeat_patrol') &&
        next.patrolKilled >= next.patrolTotal
      ) {
        next.stage = 'stage_5_find_campsite';
      }
      break;
    }
    case 'inspect_clue': {
      next.clueFound = true;
      if (next.stage === 'stage_5_find_campsite' || next.stage === 'stage_6_find_clue') {
        next.stage = 'stage_7_travel_watchtower';
      }
      break;
    }
    case 'commander_killed': {
      next.commanderDefeated = true;
      if (next.stage === 'stage_7_travel_watchtower' || next.stage === 'stage_8_defeat_commander') {
        next.stage = next.dispatchRecovered ? 'stage_10_return_ranger' : 'stage_9_recover_message';
      }
      break;
    }
    case 'recover_dispatch': {
      next.dispatchRecovered = true;
      if (next.stage === 'stage_8_defeat_commander' || next.stage === 'stage_9_recover_message') {
        next.stage = 'stage_10_return_ranger';
      }
      break;
    }
  }

  return next;
}
