/*
 * Spillerprofil: XP, nivåer, prestasjoner og statistikk. Lagres lokalt i nettleseren.
 *
 * Bare den menneskelige spilleren som er merket som «deg» (isProfile) tjener XP.
 */
import type { Game } from '../game/engine';
import type { GameEvent } from '../game/types';
import { DICE, FINISHES, TABLES, TOKENS } from './cosmetics';

const KEY = 'monopol.profile.v2';

export interface Stats {
  games: number;
  wins: number;
  propertiesBought: number;
  housesBuilt: number;
  hotelsBuilt: number;
  rentCollected: number;
  bankruptcies: number;
  trades: number;
  auctionsWon: number;
  monopolies: number;
}

export interface Profile {
  name: string;
  xp: number;
  stats: Stats;
  achievements: Record<string, number>;
  selected: { token: string; color: string; finish: string; dice: string; table: string };
}

export interface AchievementDef { id: string; name: string; desc: string; icon: string; xp: number }

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_buy', name: 'Første eiendom', desc: 'Kjøp din første eiendom.', icon: '🏠', xp: 20 },
  { id: 'monopoly', name: 'Monopolist', desc: 'Eie en hel fargegruppe.', icon: '⭐', xp: 50 },
  { id: 'hotel', name: 'Hotelleier', desc: 'Bygg ditt første hotell.', icon: '🏨', xp: 50 },
  { id: 'big_rent', name: 'Husleiehai', desc: 'Motta minst 1 000 kr i leie på én gang.', icon: '🦈', xp: 75 },
  { id: 'jailbird', name: 'Fengselsfugl', desc: 'Havne i fengsel tre ganger i samme spill.', icon: '🔒', xp: 30 },
  { id: 'speeding', name: 'Fartsbot', desc: 'Slå tre doble på rad.', icon: '🎲', xp: 30 },
  { id: 'auction', name: 'Auksjonarius', desc: 'Vinn en auksjon.', icon: '🔨', xp: 20 },
  { id: 'trader', name: 'Forhandler', desc: 'Gjennomfør en handel.', icon: '🤝', xp: 20 },
  { id: 'tycoon', name: 'Storkapitalist', desc: 'Ha 5 000 kr i kontanter.', icon: '💰', xp: 75 },
  { id: 'empire', name: 'Eiendomsimperium', desc: 'Eie 12 eiendommer samtidig.', icon: '🏙️', xp: 75 },
  { id: 'rail_baron', name: 'Togbaron', desc: 'Eie alle stasjonene.', icon: '🚂', xp: 50 },
  { id: 'crusher', name: 'Knusende', desc: 'Slå en motstander konkurs.', icon: '💥', xp: 50 },
  { id: 'first_win', name: 'Første seier', desc: 'Vinn et spill.', icon: '🏆', xp: 100 },
  { id: 'comeback', name: 'Comeback', desc: 'Vinn etter å ha vært nede i under 100 kr.', icon: '🔥', xp: 150 },
  { id: 'wins5', name: 'Mester', desc: 'Vinn 5 spill.', icon: '👑', xp: 200 },
  { id: 'veteran', name: 'Veteran', desc: 'Spill 10 spill ferdig.', icon: '🎖️', xp: 100 },
];

export const MAX_LEVEL = 20;

/** Total XP som trengs for å nå et nivå. */
export function xpForLevel(level: number) { return 50 * level * (level - 1); }

export function levelFromXp(xp: number) {
  let l = 1;
  while (l < MAX_LEVEL && xp >= xpForLevel(l + 1)) l++;
  return l;
}

function emptyStats(): Stats {
  return { games: 0, wins: 0, propertiesBought: 0, housesBuilt: 0, hotelsBuilt: 0, rentCollected: 0, bankruptcies: 0, trades: 0, auctionsWon: 0, monopolies: 0 };
}

export function loadProfile(): Profile {
  const fallback: Profile = {
    name: 'Spiller',
    xp: 0,
    stats: emptyStats(),
    achievements: {},
    selected: { token: 'car', color: '#e53935', finish: 'plastic', dice: 'classic', table: 'wood' },
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const p = JSON.parse(raw);
    return { ...fallback, ...p, stats: { ...emptyStats(), ...p.stats }, selected: { ...fallback.selected, ...p.selected } };
  } catch {
    return fallback;
  }
}

export function saveProfile(p: Profile) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* lagring blokkert */ }
}

export interface Unlock { kind: string; name: string; level: number }

export function unlocksAt(level: number): Unlock[] {
  return [
    ...TOKENS.map((t) => ({ kind: 'Brikke', name: t.name, level: t.level })),
    ...FINISHES.map((t) => ({ kind: 'Overflate', name: t.name, level: t.level })),
    ...DICE.map((t) => ({ kind: 'Terninger', name: t.name, level: t.level })),
    ...TABLES.map((t) => ({ kind: 'Bord', name: t.name, level: t.level })),
  ].filter((u) => u.level === level);
}

/** Det XP-systemet melder tilbake til grensesnittet. */
export type ProgressNotice =
  | { kind: 'xp'; amount: number; reason: string }
  | { kind: 'achievement'; def: AchievementDef }
  | { kind: 'levelup'; level: number; unlocks: Unlock[] };

/** Følger med på ett spill og deler ut XP til profilspilleren. */
export class ProgressTracker {
  profile: Profile;
  pid: number | null;
  private jailCount = 0;
  private doubles = 0;
  private minMoney = Infinity;
  private finished = false;
  private notify: (n: ProgressNotice) => void;

  constructor(profile: Profile, game: Game, notify: (n: ProgressNotice) => void) {
    this.profile = profile;
    this.notify = notify;
    const p = game.s.players.find((x) => x.isProfile && !x.isAI);
    this.pid = p ? p.id : null;
    if (game.s.phase === 'gameover') this.finished = true;
  }

  private gain(amount: number, reason: string) {
    if (amount <= 0) return;
    const before = levelFromXp(this.profile.xp);
    this.profile.xp += amount;
    this.notify({ kind: 'xp', amount, reason });
    const after = levelFromXp(this.profile.xp);
    for (let l = before + 1; l <= after; l++) this.notify({ kind: 'levelup', level: l, unlocks: unlocksAt(l) });
  }

  private unlock(id: string) {
    if (this.profile.achievements[id]) return;
    const def = ACHIEVEMENTS.find((a) => a.id === id);
    if (!def) return;
    this.profile.achievements[id] = Date.now();
    this.notify({ kind: 'achievement', def });
    this.gain(def.xp, def.name);
  }

  onEvent(ev: GameEvent, game: Game) {
    const me = this.pid;
    if (me === null || this.finished) return;
    const st = this.profile.stats;
    const p = game.player(me);
    this.minMoney = Math.min(this.minMoney, p.money);

    switch (ev.type) {
      case 'buy':
      case 'auctionWon':
        if (ev.player !== me) break;
        st.propertiesBought++;
        if (ev.type === 'auctionWon') { st.auctionsWon++; this.unlock('auction'); }
        this.gain(10, 'Eiendom kjøpt');
        this.unlock('first_buy');
        if (game.ownedBy(me).length >= 12) this.unlock('empire');
        if (game.s.board.every((sq, i) => sq.type !== 'station' || game.s.props[i].owner === me)) this.unlock('rail_baron');
        break;
      case 'build':
        if (ev.player !== me) break;
        if (ev.houses === 5) { st.hotelsBuilt++; this.gain(20, 'Hotell bygget'); this.unlock('hotel'); }
        else { st.housesBuilt++; this.gain(5, 'Hus bygget'); }
        break;
      case 'monopoly':
        if (ev.player !== me) break;
        st.monopolies++;
        this.gain(50, 'Hel fargegruppe');
        this.unlock('monopoly');
        break;
      case 'money':
        if (ev.to === me && ev.reason.startsWith('leie')) {
          st.rentCollected += ev.amount;
          this.gain(Math.min(40, Math.floor(ev.amount / 25)), 'Leie');
          if (ev.amount >= 1000) this.unlock('big_rent');
        }
        if (p.money >= 5000) this.unlock('tycoon');
        break;
      case 'roll':
        if (ev.player !== me) break;
        this.doubles = ev.double ? this.doubles + 1 : 0;
        break;
      case 'turn':
        if (ev.player === me) this.doubles = 0;
        break;
      case 'jail':
        if (ev.player !== me) break;
        if (this.doubles >= 3) this.unlock('speeding');
        if (++this.jailCount >= 3) this.unlock('jailbird');
        break;
      case 'trade':
        if (ev.from !== me && ev.to !== me) break;
        st.trades++;
        this.gain(15, 'Handel');
        this.unlock('trader');
        break;
      case 'bankrupt':
        if (ev.creditor === me) { st.bankruptcies++; this.gain(100, 'Motstander konkurs'); this.unlock('crusher'); }
        break;
      case 'gameover': {
        this.finished = true;
        st.games++;
        this.gain(50, 'Spill fullført');
        if (ev.winner === me) {
          st.wins++;
          this.gain(250, 'Seier');
          this.unlock('first_win');
          if (this.minMoney < 100) this.unlock('comeback');
          if (st.wins >= 5) this.unlock('wins5');
        }
        if (st.games >= 10) this.unlock('veteran');
        break;
      }
      default:
        break;
    }
    saveProfile(this.profile);
  }
}
