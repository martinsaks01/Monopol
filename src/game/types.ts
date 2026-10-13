/* Typer for temaer, spilltilstand og hendelser. */

export type SquareType =
  | 'start' | 'property' | 'station' | 'utility' | 'tax'
  | 'card' | 'jail' | 'parking' | 'gotojail';

export interface Square {
  type: SquareType;
  name: string;
  group?: string;
  price?: number;
  rent?: number[];
  amount?: number;
  deck?: string;
  icon?: string;
  mortgage?: number;
  houseCost?: number;
}

export interface Group {
  name: string;
  color: string;
  houseCost: number;
}

export type CardEffect =
  | { action: 'advance'; to: number; collectSalary?: boolean }
  | { action: 'nearest'; target: 'station' | 'utility'; rentMultiplier?: number; diceMultiplier?: number }
  | { action: 'back'; steps: number }
  | { action: 'move'; steps: number }
  | { action: 'money'; amount: number }
  | { action: 'payEach'; amount: number }
  | { action: 'collectEach'; amount: number }
  | { action: 'repairs'; house: number; hotel: number }
  | { action: 'jail' }
  | { action: 'jailCard' };

export type Card = CardEffect & { text: string };

export interface Deck {
  name: string;
  color: string;
  icon?: string;
  cards: Card[];
}

export interface Rules {
  startMoney: number;
  goSalary: number;
  doubleSalaryOnGo: boolean;
  jailFine: number;
  maxJailTurns: number;
  doublesToJail: number;
  freeParkingJackpot: boolean;
  auctions: boolean;
  evenBuild: boolean;
  houses: number;
  hotels: number;
  mortgageInterest: number;
  buildingSellRate: number;
  monopolyRentMultiplier: number;
  stationRent: number[];
  utilityMultipliers: number[];
  collectRentInJail: boolean;
  currency: string;
  /** 0 = av. Ellers avsluttes spillet etter så mange turer, og rikeste vinner. */
  turnLimit: number;
  /** Antall tilfeldige eiendommer hver spiller får ved start (hurtigspill). */
  startingProperties: number;
}

export interface Theme {
  id: string;
  name: string;
  description?: string;
  rules?: Partial<Rules>;
  groups: Record<string, Group>;
  board: Square[];
  decks: Record<string, Deck>;
}

export interface PlayerSetup {
  name: string;
  color: string;
  token: string;
  isAI: boolean;
  /** Kosmetisk overflate for brikken (låses opp med nivåer). */
  finish?: string;
  /** Spilleren som tjener XP til profilen på denne enheten. */
  isProfile?: boolean;
}

export interface JailCardRef { deck: string; card: number }

export interface Player extends PlayerSetup {
  id: number;
  money: number;
  position: number;
  inJail: boolean;
  jailTurns: number;
  jailCards: JailCardRef[];
  bankrupt: boolean;
}

export interface PropState {
  owner: number | null;
  houses: number; // 5 = hotell
  mortgaged: boolean;
}

export interface DeckState {
  name: string;
  color: string;
  icon: string;
  cards: Card[];
  order: number[];
}

export type Party = number | 'bank' | 'pot';

export interface Debt {
  debtor: number;
  to: Party;
  amount: number;
  reason: string;
}

export interface Auction {
  square: number;
  highBid: number;
  highBidder: number | null;
  participants: number[];
  turn: number;
}

export type Phase = 'roll' | 'buy' | 'auction' | 'debt' | 'end' | 'gameover';

export type GameEvent = { id: number } & (
  | { type: 'turn'; player: number }
  | { type: 'roll'; player: number; dice: [number, number]; double: boolean }
  | { type: 'move'; player: number; from: number; to: number; steps: number }
  | { type: 'jail'; player: number; from: number; to: number }
  | { type: 'leaveJail'; player: number; how: 'double' | 'fine' | 'card' }
  | { type: 'money'; from: Party; to: Party; amount: number; reason: string }
  | { type: 'buy'; player: number; square: number; price: number }
  | { type: 'auctionStart'; square: number }
  | { type: 'auctionWon'; player: number; square: number; amount: number }
  | { type: 'card'; player: number; deck: string; text: string }
  | { type: 'build'; player: number; square: number; houses: number }
  | { type: 'sell'; player: number; square: number; houses: number }
  | { type: 'mortgage'; player: number; square: number; mortgaged: boolean }
  | { type: 'monopoly'; player: number; group: string }
  | { type: 'debt'; player: number; amount: number }
  | { type: 'bankrupt'; player: number; creditor: number | null }
  | { type: 'trade'; from: number; to: number }
  | { type: 'gameover'; winner: number | null }
);

/** Fordeler hendelser uten id-feltet (brukes når motoren lager dem). */
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
export type NewEvent = DistributiveOmit<GameEvent, 'id'>;

export interface LogEntry { turn: number; msg: string }

export interface GameState {
  version: number;
  theme: { id: string; name: string; groups: Record<string, Group> };
  rules: Rules;
  board: Square[];
  props: Record<number, PropState>;
  decks: Record<string, DeckState>;
  players: Player[];
  current: number;
  phase: Phase;
  turn: number;
  dice: [number, number] | null;
  doublesCount: number;
  extraRoll: boolean;
  pendingBuy: number | null;
  pendingMove: number | null;
  auction: Auction | null;
  debts: Debt[];
  pot: number;
  houses: number;
  hotels: number;
  lastCard: { deck: string; deckName: string; color: string; icon: string; text: string; player: number; id: number } | null;
  seq: number;
  winner: number | null;
  log: LogEntry[];
  events: GameEvent[];
  monopolies: Record<string, number>;
  aiMemo: Record<string, Record<string, number>>;
}

export interface TradeOffer {
  from: number;
  to: number;
  giveMoney?: number;
  getMoney?: number;
  giveProps?: number[];
  getProps?: number[];
  giveCards?: number;
  getCards?: number;
}

export type Result = { ok: true } | { ok: false; error: string };
