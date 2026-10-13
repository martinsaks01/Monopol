/*
 * Spillmotoren: alle regler, uten noe grafikk.
 *
 * Hele tilstanden ligger i `game.s` og er ren JSON (kan lagres og sendes over nett).
 * Hver handling legger til hendelser i `s.events`, som grafikk, lyd og XP-systemet spiller av.
 *
 * Faser: roll → (buy | auction | debt)* → end → neste spiller. gameover når én er igjen.
 */
import type {
  Auction, Card, Debt, GameEvent, GameState, NewEvent, Party, Player, PlayerSetup,
  Result, Rules, Square, Theme, TradeOffer,
} from './types';

export const DEFAULT_RULES: Rules = {
  startMoney: 1500,
  goSalary: 200,
  doubleSalaryOnGo: false,
  jailFine: 50,
  maxJailTurns: 3,
  doublesToJail: 3,
  freeParkingJackpot: false,
  auctions: true,
  evenBuild: true,
  houses: 32,
  hotels: 12,
  mortgageInterest: 0.1,
  buildingSellRate: 0.5,
  monopolyRentMultiplier: 2,
  stationRent: [25, 50, 100, 200],
  utilityMultipliers: [4, 10],
  collectRentInJail: true,
  currency: 'kr',
  turnLimit: 0,
  startingProperties: 0,
};

const BUYABLE: Partial<Record<Square['type'], true>> = { property: true, station: true, utility: true };
export const isBuyableType = (t: Square['type']) => !!BUYABLE[t];

type Rng = () => number;

function clone<T>(o: T): T { return JSON.parse(JSON.stringify(o)); }

function shuffle<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function validateTheme(theme: Partial<Theme> | null | undefined): string[] {
  const errors: string[] = [];
  if (!theme || !Array.isArray(theme.board)) return ['Temaet mangler «board».'];
  const n = theme.board.length;
  if (n < 8 || n % 4 !== 0) errors.push('Antall felter må være delelig med 4 (minst 8).');
  if (theme.board[0]?.type !== 'start') errors.push('Felt 0 må være av typen «start».');
  if (!theme.board.some((s) => s.type === 'jail')) errors.push('Brettet må ha et felt av typen «jail».');
  const groups = theme.groups || {};
  const decks = theme.decks || {};
  theme.board.forEach((sq, i) => {
    if (!sq.name) errors.push(`Felt ${i} mangler navn.`);
    if (BUYABLE[sq.type] && !((sq.price ?? 0) > 0)) errors.push(`Felt ${i} (${sq.name}) mangler pris.`);
    if (sq.type === 'property') {
      if (!sq.group || !groups[sq.group]) errors.push(`Felt ${i} (${sq.name}) har ukjent gruppe «${sq.group}».`);
      if (!Array.isArray(sq.rent) || sq.rent.length !== 6) errors.push(`Felt ${i} (${sq.name}) må ha 6 leieverdier.`);
    }
    if (sq.type === 'card' && (!sq.deck || !decks[sq.deck])) errors.push(`Felt ${i} (${sq.name}) peker på ukjent kortstokk «${sq.deck}».`);
    if (sq.type === 'tax' && typeof sq.amount !== 'number') errors.push(`Felt ${i} (${sq.name}) mangler beløp.`);
  });
  Object.entries(decks).forEach(([id, d]) => {
    if (!Array.isArray(d.cards) || !d.cards.length) errors.push(`Kortstokken «${id}» har ingen kort.`);
  });
  return errors;
}

interface RentMods { rentMultiplier?: number; diceMultiplier?: number }

export class Game {
  s: GameState;
  rng: Rng;

  constructor(state: GameState, rng?: Rng) {
    this.s = state;
    this.rng = rng || Math.random;
  }

  static create(theme: Theme, players: PlayerSetup[], ruleOverrides?: Partial<Rules>, rng?: Rng): Game {
    const r = rng || Math.random;
    const errors = validateTheme(theme);
    if (errors.length) throw new Error('Ugyldig tema:\n' + errors.join('\n'));
    if (!players || players.length < 2) throw new Error('Spillet trenger minst to spillere.');

    const rules: Rules = { ...DEFAULT_RULES, ...(theme.rules || {}), ...(ruleOverrides || {}) };
    const board = clone(theme.board);
    const props: GameState['props'] = {};
    board.forEach((sq, i) => { if (BUYABLE[sq.type]) props[i] = { owner: null, houses: 0, mortgaged: false }; });
    const decks: GameState['decks'] = {};
    Object.entries(theme.decks || {}).forEach(([id, d]) => {
      decks[id] = {
        name: d.name || id,
        color: d.color || '#888',
        icon: d.icon || '🂠',
        cards: clone(d.cards),
        order: shuffle(d.cards.map((_, i) => i), r),
      };
    });

    const state: GameState = {
      version: 2,
      theme: { id: theme.id, name: theme.name, groups: clone(theme.groups || {}) },
      rules,
      board,
      props,
      decks,
      players: players.map((p, i) => ({
        ...p,
        id: i,
        name: p.name || `Spiller ${i + 1}`,
        money: rules.startMoney,
        position: 0,
        inJail: false,
        jailTurns: 0,
        jailCards: [],
        bankrupt: false,
      })),
      current: 0,
      phase: 'roll',
      turn: 1,
      dice: null,
      doublesCount: 0,
      extraRoll: false,
      pendingBuy: null,
      pendingMove: null,
      auction: null,
      debts: [],
      pot: 0,
      houses: rules.houses,
      hotels: rules.hotels,
      lastCard: null,
      seq: 0,
      winner: null,
      log: [],
      events: [],
      monopolies: {},
      aiMemo: {},
    };
    const game = new Game(state, r);
    if (rules.startingProperties > 0) game._dealStartingProperties(rules.startingProperties);
    game.log(`Spillet starter! ${state.players[0].name} begynner.`);
    game.emit({ type: 'turn', player: 0 });
    return game;
  }

  static load(data: string | GameState, rng?: Rng): Game {
    const s: GameState = typeof data === 'string' ? JSON.parse(data) : data;
    if (!s.events) s.events = [];
    if (!s.monopolies) s.monopolies = {};
    s.rules = { ...DEFAULT_RULES, ...s.rules };
    return new Game(s, rng);
  }

  serialize(): string { return JSON.stringify(this.s); }

  // ------------------------------------------------------------------ hjelpere

  fmt(n: number): string {
    return `${Math.round(n).toLocaleString('nb-NO')} ${this.s.rules.currency}`;
  }

  log(msg: string) {
    this.s.log.push({ turn: this.s.turn, msg });
    if (this.s.log.length > 400) this.s.log.splice(0, this.s.log.length - 400);
  }

  emit(ev: NewEvent) {
    const e = { ...ev, id: ++this.s.seq } as GameEvent;
    this.s.events.push(e);
    if (this.s.events.length > 300) this.s.events.splice(0, this.s.events.length - 300);
  }

  player(id: number): Player { return this.s.players[id]; }
  get current(): Player { return this.s.players[this.s.current]; }
  activePlayers(): Player[] { return this.s.players.filter((p) => !p.bankrupt); }
  square(i: number): Square { return this.s.board[i]; }
  isBuyable(i: number) { return !!BUYABLE[this.s.board[i].type]; }
  group(id: string) { return this.s.theme.groups[id]; }
  jailIndex() { return this.s.board.findIndex((sq) => sq.type === 'jail'); }
  diceTotal() { return this.s.dice ? this.s.dice[0] + this.s.dice[1] : 0; }

  /** Hvem som skal handle nå: nåværende spiller, skyldner eller budgiver. */
  actingPlayerId(): number | null {
    const s = this.s;
    if (s.phase === 'gameover') return null;
    if (s.phase === 'debt') return s.debts[0].debtor;
    if (s.phase === 'auction' && s.auction) return s.auction.participants[s.auction.turn];
    return s.current;
  }

  groupSquares(groupId: string): number[] {
    const out: number[] = [];
    this.s.board.forEach((sq, i) => { if (sq.type === 'property' && sq.group === groupId) out.push(i); });
    return out;
  }

  ownsGroup(pid: number, groupId: string): boolean {
    const sqs = this.groupSquares(groupId);
    return sqs.length > 0 && sqs.every((i) => this.s.props[i].owner === pid);
  }

  groupHasBuildings(groupId: string): boolean {
    return this.groupSquares(groupId).some((i) => this.s.props[i].houses > 0);
  }

  ownedBy(pid: number): number[] {
    return Object.keys(this.s.props).map(Number).filter((i) => this.s.props[i].owner === pid);
  }

  countOwnedOfType(pid: number, type: Square['type']): number {
    return this.ownedBy(pid).filter((i) => this.s.board[i].type === type).length;
  }

  mortgageValue(i: number): number {
    const sq = this.s.board[i];
    return sq.mortgage != null ? sq.mortgage : Math.floor((sq.price || 0) / 2);
  }

  unmortgageCost(i: number): number {
    return Math.ceil(this.mortgageValue(i) * (1 + this.s.rules.mortgageInterest));
  }

  houseCost(i: number): number {
    const sq = this.s.board[i];
    if (sq.houseCost != null) return sq.houseCost;
    return (sq.group && this.group(sq.group)?.houseCost) || 0;
  }

  buildingSellValue(i: number): number {
    return Math.floor(this.houseCost(i) * this.s.rules.buildingSellRate);
  }

  liquidationValue(pid: number): number {
    let total = this.player(pid).money;
    this.ownedBy(pid).forEach((i) => {
      const pr = this.s.props[i];
      total += pr.houses * this.buildingSellValue(i);
      if (!pr.mortgaged) total += this.mortgageValue(i);
    });
    return total;
  }

  netWorth(pid: number): number {
    let total = this.player(pid).money;
    this.ownedBy(pid).forEach((i) => {
      const pr = this.s.props[i];
      total += pr.mortgaged ? this.mortgageValue(i) : this.s.board[i].price || 0;
      total += pr.houses * this.houseCost(i);
    });
    return total;
  }

  calcRent(i: number, diceTotal: number, mods: RentMods = {}): number {
    const sq = this.s.board[i];
    const pr = this.s.props[i];
    if (!pr || pr.owner === null || pr.mortgaged) return 0;
    const r = this.s.rules;
    if (sq.type === 'property' && sq.rent && sq.group) {
      if (pr.houses > 0) return sq.rent[pr.houses];
      return sq.rent[0] * (this.ownsGroup(pr.owner, sq.group) ? r.monopolyRentMultiplier : 1);
    }
    if (sq.type === 'station') {
      const n = this.countOwnedOfType(pr.owner, 'station');
      const table = sq.rent || r.stationRent;
      return table[Math.min(n, table.length) - 1] * (mods.rentMultiplier || 1);
    }
    if (sq.type === 'utility') {
      const n = this.countOwnedOfType(pr.owner, 'utility');
      const table = sq.rent || r.utilityMultipliers;
      const mult = mods.diceMultiplier || table[Math.min(n, table.length) - 1];
      return diceTotal * mult;
    }
    return 0;
  }

  // ----------------------------------------------------------------- pengeflyt

  private _transfer(fromId: number, to: Party, amount: number, reason: string) {
    this.player(fromId).money -= amount;
    if (to === 'pot') this.s.pot += amount;
    else if (typeof to === 'number') this.player(to).money += amount;
    this.emit({ type: 'money', from: fromId, to, amount, reason });
  }

  private _pay(pid: number, amount: number, reason: string, from: Party = 'bank') {
    this.player(pid).money += amount;
    this.emit({ type: 'money', from, to: pid, amount, reason });
  }

  private _bankOrPot(): Party { return this.s.rules.freeParkingJackpot ? 'pot' : 'bank'; }

  partyName(to: Party): string {
    if (to === 'pot') return 'potten';
    if (to === 'bank') return 'banken';
    return this.player(to).name;
  }

  private _charge(debtorId: number, to: Party, amount: number, reason: string) {
    amount = Math.round(amount);
    if (amount <= 0) return;
    const debtor = this.player(debtorId);
    if (debtor.bankrupt) return;
    const hasQueued = this.s.debts.some((d) => d.debtor === debtorId);
    if (!hasQueued && debtor.money >= amount) {
      this._transfer(debtorId, to, amount, reason);
      this.log(`${debtor.name} betaler ${this.fmt(amount)} til ${this.partyName(to)}${reason ? ` (${reason})` : ''}.`);
    } else {
      this.s.debts.push({ debtor: debtorId, to, amount, reason });
      this.emit({ type: 'debt', player: debtorId, amount });
      this.log(`${debtor.name} skylder ${this.fmt(amount)} til ${this.partyName(to)}${reason ? ` (${reason})` : ''}, men har bare ${this.fmt(debtor.money)}.`);
    }
  }

  // ----------------------------------------------------------------- eierskap

  private _setOwner(i: number, owner: number | null) {
    this.s.props[i].owner = owner;
    this._checkMonopolies();
  }

  /** Sender en hendelse når noen får komplett fargegruppe. */
  private _checkMonopolies() {
    Object.keys(this.s.theme.groups).forEach((g) => {
      const sqs = this.groupSquares(g);
      if (!sqs.length) return;
      const owner = this.s.props[sqs[0]].owner;
      const complete = owner !== null && sqs.every((i) => this.s.props[i].owner === owner);
      if (complete && this.s.monopolies[g] !== owner) {
        this.s.monopolies[g] = owner as number;
        this.emit({ type: 'monopoly', player: owner as number, group: g });
        this.log(`⭐ ${this.player(owner as number).name} eier nå hele den ${this.group(g).name.toLowerCase()} gruppen!`);
      } else if (!complete && this.s.monopolies[g] !== undefined) {
        delete this.s.monopolies[g];
      }
    });
  }

  private _dealStartingProperties(count: number) {
    const free = shuffle(
      Object.keys(this.s.props).map(Number).filter((i) => this.s.board[i].type === 'property'),
      this.rng,
    );
    this.s.players.forEach((p) => {
      for (let k = 0; k < count && free.length; k++) this.s.props[free.pop() as number].owner = p.id;
    });
    // Ingen skal starte med en komplett gruppe – registrer uten å feire
    this._checkMonopolies();
    this.s.events = this.s.events.filter((e) => e.type !== 'monopoly');
  }

  // ----------------------------------------------------------------- bevegelse

  private _move(p: Player, steps: number, collectSalary = true) {
    const n = this.s.board.length;
    const from = p.position;
    const to = (((from + steps) % n) + n) % n;
    p.position = to;
    this.emit({ type: 'move', player: p.id, from, to, steps });
    if (steps > 0 && collectSalary && from + steps >= n) {
      const r = this.s.rules;
      const salary = r.goSalary * (to === 0 && r.doubleSalaryOnGo ? 2 : 1);
      this._pay(p.id, salary, 'lønn');
      this.log(`${p.name} passerer Start og mottar ${this.fmt(salary)}.`);
    }
  }

  private _moveTo(p: Player, target: number, collectSalary = true) {
    const n = this.s.board.length;
    const steps = (target - p.position + n) % n;
    this._move(p, steps === 0 ? n : steps, collectSalary);
  }

  private _sendToJail(p: Player) {
    const from = p.position;
    p.position = this.jailIndex();
    p.inJail = true;
    p.jailTurns = 0;
    if (p.id === this.s.current) {
      this.s.extraRoll = false;
      this.s.doublesCount = 0;
    }
    this.emit({ type: 'jail', player: p.id, from, to: p.position });
    this.log(`${p.name} havner i fengsel!`);
  }

  private _resolveLanding(p: Player, mods: RentMods = {}) {
    const s = this.s;
    const idx = p.position;
    const sq = s.board[idx];
    switch (sq.type) {
      case 'property':
      case 'station':
      case 'utility': {
        const pr = s.props[idx];
        if (pr.owner === null) {
          s.pendingBuy = idx;
          this.log(`${p.name} lander på ${sq.name}, som er til salgs for ${this.fmt(sq.price || 0)}.`);
        } else if (pr.owner === p.id) {
          this.log(`${p.name} lander på sin egen eiendom ${sq.name}.`);
        } else if (pr.mortgaged) {
          this.log(`${p.name} lander på ${sq.name}, men den er pantsatt – ingen leie.`);
        } else {
          const owner = this.player(pr.owner);
          if (owner.inJail && !s.rules.collectRentInJail) {
            this.log(`${owner.name} sitter i fengsel og kan ikke kreve leie for ${sq.name}.`);
            break;
          }
          let dice = this.diceTotal();
          if (sq.type === 'utility' && mods.diceMultiplier) {
            const d1 = this._die(), d2 = this._die();
            dice = d1 + d2;
            this.log(`${p.name} kaster terningene for verket: ${d1} + ${d2} = ${dice}.`);
          }
          this._charge(p.id, owner.id, this.calcRent(idx, dice, mods), `leie for ${sq.name}`);
        }
        break;
      }
      case 'tax':
        this.log(`${p.name} lander på ${sq.name}.`);
        this._charge(p.id, this._bankOrPot(), sq.amount || 0, sq.name.toLowerCase());
        break;
      case 'card':
        if (sq.deck) this._drawCard(p, sq.deck);
        break;
      case 'gotojail':
        this._sendToJail(p);
        break;
      case 'parking':
        if (s.rules.freeParkingJackpot && s.pot > 0) {
          this.log(`${p.name} vinner potten på ${this.fmt(s.pot)}!`);
          const pot = s.pot;
          s.pot = 0;
          this._pay(p.id, pot, 'potten', 'pot');
        } else {
          this.log(`${p.name} tar en pause på ${sq.name}.`);
        }
        break;
      case 'jail':
        this.log(`${p.name} er på besøk i fengselet.`);
        break;
      default:
        break;
    }
  }

  private _drawCard(p: Player, deckId: string) {
    const deck = this.s.decks[deckId];
    if (!deck || !deck.order.length) return;
    const ci = deck.order.shift() as number;
    const card = deck.cards[ci];
    if (card.action !== 'jailCard') deck.order.push(ci);
    this.s.lastCard = { deck: deckId, deckName: deck.name, color: deck.color, icon: deck.icon, text: card.text, player: p.id, id: this.s.seq + 1 };
    this.emit({ type: 'card', player: p.id, deck: deckId, text: card.text });
    this.log(`${p.name} trekker ${deck.name}: «${card.text}»`);
    this._applyCard(p, card, deckId, ci);
  }

  private _applyCard(p: Player, card: Card, deckId: string, ci: number) {
    const s = this.s;
    const others = this.activePlayers().filter((o) => o.id !== p.id);
    switch (card.action) {
      case 'advance':
        this._moveTo(p, card.to, card.collectSalary !== false);
        this._resolveLanding(p);
        break;
      case 'nearest': {
        const n = s.board.length;
        for (let k = 1; k <= n; k++) {
          const i = (p.position + k) % n;
          if (s.board[i].type === card.target) {
            this._moveTo(p, i);
            this._resolveLanding(p, { rentMultiplier: card.rentMultiplier, diceMultiplier: card.diceMultiplier });
            break;
          }
        }
        break;
      }
      case 'back':
        this._move(p, -(card.steps || 3), false);
        this._resolveLanding(p);
        break;
      case 'move':
        this._move(p, card.steps, true);
        this._resolveLanding(p);
        break;
      case 'money':
        if (card.amount >= 0) this._pay(p.id, card.amount, 'kort');
        else this._charge(p.id, this._bankOrPot(), -card.amount, 'kort');
        break;
      case 'payEach':
        others.forEach((o) => this._charge(p.id, o.id, card.amount, 'kort'));
        break;
      case 'collectEach':
        others.forEach((o) => this._charge(o.id, p.id, card.amount, 'kort'));
        break;
      case 'repairs': {
        let cost = 0;
        this.ownedBy(p.id).forEach((i) => {
          const h = s.props[i].houses;
          cost += h === 5 ? card.hotel : h * card.house;
        });
        if (cost > 0) this._charge(p.id, this._bankOrPot(), cost, 'reparasjoner');
        else this.log(`${p.name} har ingen bygninger å reparere.`);
        break;
      }
      case 'jail':
        this._sendToJail(p);
        break;
      case 'jailCard':
        p.jailCards.push({ deck: deckId, card: ci });
        break;
    }
  }

  private _die() { return 1 + Math.floor(this.rng() * 6); }

  private _continue() {
    const s = this.s;
    if (s.phase === 'gameover') return;
    if (s.debts.length) { s.phase = 'debt'; return; }
    if (s.pendingBuy !== null) { s.phase = 'buy'; return; }
    if (s.auction) { s.phase = 'auction'; return; }
    const p = this.current;
    if (p.bankrupt) { this._nextTurn(); return; }
    if (s.pendingMove !== null) {
      const steps = s.pendingMove;
      s.pendingMove = null;
      this._move(p, steps, true);
      this._resolveLanding(p);
      this._continue();
      return;
    }
    s.phase = s.extraRoll && !p.inJail ? 'roll' : 'end';
  }

  private _nextTurn() {
    const s = this.s;
    if (this._checkGameOver()) return;
    if (s.rules.turnLimit > 0 && s.turn >= s.rules.turnLimit) {
      this.log(`Turgrensen på ${s.rules.turnLimit} turer er nådd.`);
      this.endByNetWorth();
      return;
    }
    const n = s.players.length;
    let next = s.current;
    do { next = (next + 1) % n; } while (s.players[next].bankrupt);
    s.current = next;
    s.turn++;
    s.phase = 'roll';
    s.doublesCount = 0;
    s.extraRoll = false;
    s.pendingBuy = null;
    s.pendingMove = null;
    this.emit({ type: 'turn', player: next });
    this.log(`— Tur ${s.turn}: ${this.current.name} sin tur.`);
  }

  private _checkGameOver(): boolean {
    const active = this.activePlayers();
    if (active.length <= 1) {
      this.s.phase = 'gameover';
      this.s.winner = active.length ? active[0].id : null;
      if (active.length) this.log(`🏆 ${active[0].name} har vunnet spillet!`);
      this.emit({ type: 'gameover', winner: this.s.winner });
      return true;
    }
    return false;
  }

  private _fail(error: string): Result { return { ok: false, error }; }
  private _ok(): Result { return { ok: true }; }

  // --------------------------------------------------------------- handlinger

  /** Kast terningene. `forced` brukes når terningene er kastet med fysikk i 3D-scenen. */
  roll(forced?: [number, number]): Result {
    const s = this.s;
    if (s.phase !== 'roll') return this._fail('Du kan ikke kaste terningene nå.');
    const p = this.current;
    const d1 = forced ? forced[0] : this._die();
    const d2 = forced ? forced[1] : this._die();
    const isDouble = d1 === d2;
    const total = d1 + d2;
    s.dice = [d1, d2];
    s.lastCard = null;
    s.extraRoll = false;
    this.emit({ type: 'roll', player: p.id, dice: [d1, d2], double: isDouble });
    this.log(`${p.name} kaster ${d1} + ${d2} = ${total}${isDouble ? ' (dobbel!)' : ''}.`);

    if (p.inJail) {
      if (isDouble) {
        p.inJail = false;
        p.jailTurns = 0;
        this.emit({ type: 'leaveJail', player: p.id, how: 'double' });
        this.log(`${p.name} slår dobbel og kommer ut av fengselet.`);
        this._move(p, total, true);
        this._resolveLanding(p);
      } else {
        p.jailTurns++;
        if (p.jailTurns >= s.rules.maxJailTurns) {
          this.log(`${p.name} har sittet ${p.jailTurns} runder og må betale ${this.fmt(s.rules.jailFine)} for å komme ut.`);
          p.inJail = false;
          p.jailTurns = 0;
          this.emit({ type: 'leaveJail', player: p.id, how: 'fine' });
          s.pendingMove = total;
          this._charge(p.id, this._bankOrPot(), s.rules.jailFine, 'fengselsbot');
        } else {
          this.log(`${p.name} blir sittende i fengselet.`);
        }
      }
      this._continue();
      return this._ok();
    }

    if (isDouble) {
      s.doublesCount++;
      if (s.doublesCount >= s.rules.doublesToJail) {
        this.log(`${p.name} har slått ${s.doublesCount} doble på rad!`);
        this._sendToJail(p);
        this._continue();
        return this._ok();
      }
      s.extraRoll = true;
    }
    this._move(p, total, true);
    this._resolveLanding(p);
    this._continue();
    return this._ok();
  }

  payJailFine(): Result {
    const s = this.s, p = this.current;
    if (s.phase !== 'roll' || !p.inJail) return this._fail('Du sitter ikke i fengsel.');
    if (p.money < s.rules.jailFine) return this._fail('Du har ikke råd.');
    this._transfer(p.id, this._bankOrPot(), s.rules.jailFine, 'fengselsbot');
    p.inJail = false;
    p.jailTurns = 0;
    this.emit({ type: 'leaveJail', player: p.id, how: 'fine' });
    this.log(`${p.name} betaler ${this.fmt(s.rules.jailFine)} og er ute av fengselet.`);
    return this._ok();
  }

  useJailCard(): Result {
    const s = this.s, p = this.current;
    if (s.phase !== 'roll' || !p.inJail) return this._fail('Du sitter ikke i fengsel.');
    const c = p.jailCards.shift();
    if (!c) return this._fail('Du har ingen kom-ut-av-fengsel-kort.');
    s.decks[c.deck]?.order.push(c.card);
    p.inJail = false;
    p.jailTurns = 0;
    this.emit({ type: 'leaveJail', player: p.id, how: 'card' });
    this.log(`${p.name} bruker et kom-ut-av-fengsel-kort.`);
    return this._ok();
  }

  buy(): Result {
    const s = this.s, p = this.current;
    if (s.phase !== 'buy' || s.pendingBuy === null) return this._fail('Det er ingenting å kjøpe nå.');
    const i = s.pendingBuy, sq = s.board[i];
    const price = sq.price || 0;
    if (p.money < price) return this._fail('Du har ikke nok penger.');
    p.money -= price;
    s.pendingBuy = null;
    this.emit({ type: 'buy', player: p.id, square: i, price });
    this._setOwner(i, p.id);
    this.log(`${p.name} kjøper ${sq.name} for ${this.fmt(price)}.`);
    this._continue();
    return this._ok();
  }

  declineBuy(): Result {
    const s = this.s;
    if (s.phase !== 'buy' || s.pendingBuy === null) return this._fail('Det er ingenting å avslå nå.');
    const i = s.pendingBuy;
    s.pendingBuy = null;
    if (s.rules.auctions && this.activePlayers().length > 1) this._startAuction(i);
    else this.log(`${this.current.name} kjøper ikke ${s.board[i].name}.`);
    this._continue();
    return this._ok();
  }

  private _startAuction(i: number) {
    const s = this.s;
    const n = s.players.length;
    const participants: number[] = [];
    for (let k = 1; k <= n; k++) {
      const p = s.players[(s.current + k) % n];
      if (!p.bankrupt) participants.push(p.id);
    }
    s.auction = { square: i, highBid: 0, highBidder: null, participants, turn: 0 } as Auction;
    this.emit({ type: 'auctionStart', square: i });
    this.log(`${s.board[i].name} går på auksjon!`);
  }

  auctionBid(pid: number, amount: number): Result {
    const s = this.s, a = s.auction;
    if (s.phase !== 'auction' || !a) return this._fail('Ingen auksjon pågår.');
    if (a.participants[a.turn] !== pid) return this._fail('Det er ikke din tur til å by.');
    amount = Math.floor(amount);
    if (!(amount > a.highBid)) return this._fail(`Budet må være høyere enn ${this.fmt(a.highBid)}.`);
    if (amount > this.player(pid).money) return this._fail('Du har ikke så mye penger.');
    a.highBid = amount;
    a.highBidder = pid;
    this.log(`${this.player(pid).name} byr ${this.fmt(amount)}.`);
    a.turn = (a.turn + 1) % a.participants.length;
    this._checkAuction();
    return this._ok();
  }

  auctionPass(pid: number): Result {
    const s = this.s, a = s.auction;
    if (s.phase !== 'auction' || !a) return this._fail('Ingen auksjon pågår.');
    if (a.participants[a.turn] !== pid) return this._fail('Det er ikke din tur.');
    a.participants.splice(a.turn, 1);
    if (a.participants.length) a.turn %= a.participants.length;
    this.log(`${this.player(pid).name} står over.`);
    this._checkAuction();
    return this._ok();
  }

  private _checkAuction() {
    const s = this.s, a = s.auction as Auction;
    const sq = s.board[a.square];
    let done = false;
    if (a.participants.length === 0) {
      if (a.highBidder !== null) done = true;
      else { this.log(`Ingen bød på ${sq.name}. Den forblir i banken.`); s.auction = null; }
    } else if (a.participants.length === 1 && a.highBidder === a.participants[0]) {
      done = true;
    }
    if (done && a.highBidder !== null) {
      const w = this.player(a.highBidder);
      w.money -= a.highBid;
      s.auction = null;
      this.emit({ type: 'auctionWon', player: w.id, square: a.square, amount: a.highBid });
      this._setOwner(a.square, w.id);
      this.log(`${w.name} vinner auksjonen og kjøper ${sq.name} for ${this.fmt(a.highBid)}.`);
    }
    if (!s.auction) this._continue();
  }

  endTurn(): Result {
    if (this.s.phase !== 'end') return this._fail('Du kan ikke avslutte turen nå.');
    this._nextTurn();
    return this._ok();
  }

  // ------------------------------------------------------ bygging og pantsetting

  canBuild(pid: number, i: number): string | null {
    const s = this.s, sq = s.board[i], pr = s.props[i];
    if (!sq || sq.type !== 'property' || !pr || !sq.group) return 'Bare eiendommer kan bebygges.';
    if (pr.owner !== pid) return 'Du eier ikke denne eiendommen.';
    if (!this.ownsGroup(pid, sq.group)) return 'Du må eie hele fargegruppen.';
    const grp = this.groupSquares(sq.group);
    if (grp.some((g) => s.props[g].mortgaged)) return 'Ingen eiendommer i gruppen kan være pantsatt.';
    if (pr.houses >= 5) return 'Eiendommen har allerede hotell.';
    if (s.rules.evenBuild && pr.houses > Math.min(...grp.map((g) => s.props[g].houses))) return 'Du må bygge jevnt i fargegruppen.';
    if (this.player(pid).money < this.houseCost(i)) return 'Du har ikke nok penger.';
    if (pr.houses < 4 && s.houses <= 0) return 'Banken er tom for hus.';
    if (pr.houses === 4 && s.hotels <= 0) return 'Banken er tom for hoteller.';
    return null;
  }

  build(pid: number, i: number): Result {
    const err = this.canBuild(pid, i);
    if (err) return this._fail(err);
    const s = this.s, pr = s.props[i], p = this.player(pid);
    p.money -= this.houseCost(i);
    if (pr.houses === 4) { s.hotels--; s.houses += 4; } else { s.houses--; }
    pr.houses++;
    this.emit({ type: 'build', player: pid, square: i, houses: pr.houses });
    this.log(`${p.name} bygger ${pr.houses === 5 ? 'hotell' : 'hus'} på ${s.board[i].name}.`);
    return this._ok();
  }

  canSellBuilding(pid: number, i: number): string | null {
    const s = this.s, sq = s.board[i], pr = s.props[i];
    if (!pr || pr.owner !== pid) return 'Du eier ikke denne eiendommen.';
    if (pr.houses <= 0 || !sq.group) return 'Det er ingen bygninger her.';
    const grp = this.groupSquares(sq.group);
    if (s.rules.evenBuild && pr.houses < Math.max(...grp.map((g) => s.props[g].houses))) return 'Du må selge jevnt i fargegruppen.';
    if (pr.houses === 5 && s.houses < 4) return 'Banken har ikke nok hus til å bytte ut hotellet.';
    return null;
  }

  sellBuilding(pid: number, i: number): Result {
    const err = this.canSellBuilding(pid, i);
    if (err) return this._fail(err);
    const s = this.s, pr = s.props[i], p = this.player(pid);
    const value = this.buildingSellValue(i);
    if (pr.houses === 5) { s.hotels++; s.houses -= 4; } else { s.houses++; }
    pr.houses--;
    p.money += value;
    this.emit({ type: 'sell', player: pid, square: i, houses: pr.houses });
    this.log(`${p.name} selger ${pr.houses === 4 ? 'hotell' : 'hus'} på ${s.board[i].name} for ${this.fmt(value)}.`);
    return this._ok();
  }

  canMortgage(pid: number, i: number): string | null {
    const s = this.s, sq = s.board[i], pr = s.props[i];
    if (!pr || pr.owner !== pid) return 'Du eier ikke denne eiendommen.';
    if (pr.mortgaged) return 'Eiendommen er allerede pantsatt.';
    if (sq.type === 'property' && sq.group && this.groupHasBuildings(sq.group)) return 'Selg alle bygninger i fargegruppen først.';
    return null;
  }

  mortgage(pid: number, i: number): Result {
    const err = this.canMortgage(pid, i);
    if (err) return this._fail(err);
    const p = this.player(pid), v = this.mortgageValue(i);
    this.s.props[i].mortgaged = true;
    p.money += v;
    this.emit({ type: 'mortgage', player: pid, square: i, mortgaged: true });
    this.log(`${p.name} pantsetter ${this.s.board[i].name} og får ${this.fmt(v)}.`);
    return this._ok();
  }

  canUnmortgage(pid: number, i: number): string | null {
    const pr = this.s.props[i];
    if (!pr || pr.owner !== pid) return 'Du eier ikke denne eiendommen.';
    if (!pr.mortgaged) return 'Eiendommen er ikke pantsatt.';
    if (this.player(pid).money < this.unmortgageCost(i)) return 'Du har ikke nok penger.';
    return null;
  }

  unmortgage(pid: number, i: number): Result {
    const err = this.canUnmortgage(pid, i);
    if (err) return this._fail(err);
    const p = this.player(pid), c = this.unmortgageCost(i);
    this.s.props[i].mortgaged = false;
    p.money -= c;
    this.emit({ type: 'mortgage', player: pid, square: i, mortgaged: false });
    this.log(`${p.name} innløser ${this.s.board[i].name} for ${this.fmt(c)}.`);
    return this._ok();
  }

  // ----------------------------------------------------------------------- gjeld

  payDebt(): Result {
    const s = this.s;
    if (s.phase !== 'debt') return this._fail('Det er ingen gjeld å betale.');
    const d = s.debts[0] as Debt, p = this.player(d.debtor);
    if (p.money < d.amount) return this._fail(`Du mangler ${this.fmt(d.amount - p.money)}.`);
    this._transfer(p.id, d.to, d.amount, d.reason);
    this.log(`${p.name} betaler ${this.fmt(d.amount)} til ${this.partyName(d.to)}.`);
    s.debts.shift();
    this._continue();
    return this._ok();
  }

  declareBankruptcy(): Result {
    const s = this.s;
    if (s.phase !== 'debt') return this._fail('Du kan bare gå konkurs når du skylder penger.');
    const d = s.debts[0];
    const p = this.player(d.debtor);
    const creditor = typeof d.to === 'number' ? d.to : null;

    this.ownedBy(p.id).forEach((i) => {
      const pr = s.props[i];
      if (pr.houses > 0) {
        p.money += pr.houses * this.buildingSellValue(i);
        if (pr.houses === 5) s.hotels++; else s.houses += pr.houses;
        pr.houses = 0;
      }
    });

    if (creditor !== null) {
      const c = this.player(creditor);
      c.money += Math.max(0, p.money);
      this.ownedBy(p.id).forEach((i) => { s.props[i].owner = creditor; });
      c.jailCards.push(...p.jailCards);
      this.log(`${p.name} går konkurs! ${c.name} overtar alle eiendeler.`);
    } else {
      if (d.to === 'pot') s.pot += Math.max(0, p.money);
      this.ownedBy(p.id).forEach((i) => { s.props[i] = { owner: null, houses: 0, mortgaged: false }; });
      p.jailCards.forEach((jc) => s.decks[jc.deck]?.order.push(jc.card));
      this.log(`${p.name} går konkurs! Eiendommene går tilbake til banken.`);
    }
    p.money = 0;
    p.jailCards = [];
    p.bankrupt = true;
    p.inJail = false;
    this.emit({ type: 'bankrupt', player: p.id, creditor });
    this._checkMonopolies();

    s.debts = s.debts.filter((x) => x.debtor !== p.id);
    s.debts.forEach((x) => { if (x.to === p.id) x.to = 'bank'; });
    if (s.auction) s.auction.participants = s.auction.participants.filter((id) => id !== p.id);

    if (this._checkGameOver()) return this._ok();
    this._continue();
    return this._ok();
  }

  /** Avslutt spillet nå – spilleren med høyest formue vinner. */
  endByNetWorth(): Result {
    if (this.s.phase === 'gameover') return this._fail('Spillet er allerede ferdig.');
    const ranked = this.activePlayers().sort((a, b) => this.netWorth(b.id) - this.netWorth(a.id));
    this.s.phase = 'gameover';
    this.s.winner = ranked[0].id;
    this.s.auction = null;
    this.s.debts = [];
    this.log(`Spillet avsluttes. 🏆 ${ranked[0].name} vinner med en formue på ${this.fmt(this.netWorth(ranked[0].id))}!`);
    this.emit({ type: 'gameover', winner: ranked[0].id });
    return this._ok();
  }

  // ---------------------------------------------------------------------- handel

  validateTrade(offer: TradeOffer): string | null {
    const s = this.s;
    const a = this.player(offer.from), b = this.player(offer.to);
    if (!a || !b || a.id === b.id) return 'Ugyldig handelspartner.';
    if (a.bankrupt || b.bankrupt) return 'Spilleren er ute av spillet.';
    if (!['roll', 'end', 'debt', 'buy'].includes(s.phase)) return 'Du kan ikke handle akkurat nå.';
    const gm = offer.giveMoney || 0, rm = offer.getMoney || 0;
    if (gm < 0 || rm < 0) return 'Ugyldig pengebeløp.';
    const gp = offer.giveProps || [], rp = offer.getProps || [];
    const gc = offer.giveCards || 0, rc = offer.getCards || 0;
    if (!gm && !rm && !gp.length && !rp.length && !gc && !rc) return 'Handelen er tom.';
    for (const i of gp) if (s.props[i]?.owner !== a.id) return `${a.name} eier ikke ${s.board[i].name}.`;
    for (const i of rp) if (s.props[i]?.owner !== b.id) return `${b.name} eier ikke ${s.board[i].name}.`;
    for (const i of gp.concat(rp)) {
      const sq = s.board[i];
      if (sq.type === 'property' && sq.group && this.groupHasBuildings(sq.group)) return `Selg bygningene i fargegruppen til ${sq.name} før du handler.`;
    }
    if (gc > a.jailCards.length) return `${a.name} har ikke så mange fengselskort.`;
    if (rc > b.jailCards.length) return `${b.name} har ikke så mange fengselskort.`;
    const feeA = this._mortgageFee(rp), feeB = this._mortgageFee(gp);
    if (a.money - gm + rm - feeA < 0) return `${a.name} har ikke råd til handelen.`;
    if (b.money - rm + gm - feeB < 0) return `${b.name} har ikke råd til handelen.`;
    return null;
  }

  private _mortgageFee(list: number[]): number {
    return list.reduce((sum, i) => sum + (this.s.props[i].mortgaged ? Math.ceil(this.mortgageValue(i) * this.s.rules.mortgageInterest) : 0), 0);
  }

  executeTrade(offer: TradeOffer): Result {
    const err = this.validateTrade(offer);
    if (err) return this._fail(err);
    const s = this.s, a = this.player(offer.from), b = this.player(offer.to);
    const gp = offer.giveProps || [], rp = offer.getProps || [];
    const feeA = this._mortgageFee(rp), feeB = this._mortgageFee(gp);
    a.money += (offer.getMoney || 0) - (offer.giveMoney || 0) - feeA;
    b.money += (offer.giveMoney || 0) - (offer.getMoney || 0) - feeB;
    gp.forEach((i) => { s.props[i].owner = b.id; });
    rp.forEach((i) => { s.props[i].owner = a.id; });
    for (let k = 0; k < (offer.giveCards || 0); k++) b.jailCards.push(a.jailCards.shift()!);
    for (let k = 0; k < (offer.getCards || 0); k++) a.jailCards.push(b.jailCards.shift()!);
    this.emit({ type: 'trade', from: a.id, to: b.id });
    this.log(`🤝 Handel mellom ${a.name} og ${b.name}: ${this.describeTrade(offer)}`);
    if (feeA) this.log(`${a.name} betaler ${this.fmt(feeA)} i renter for pantsatte eiendommer.`);
    if (feeB) this.log(`${b.name} betaler ${this.fmt(feeB)} i renter for pantsatte eiendommer.`);
    this._checkMonopolies();
    return this._ok();
  }

  describeTrade(offer: TradeOffer): string {
    const s = this.s;
    const side = (money = 0, props: number[] = [], cards = 0) => {
      const parts = props.map((i) => s.board[i].name);
      if (money) parts.push(this.fmt(money));
      if (cards) parts.push(`${cards} fengselskort`);
      return parts.length ? parts.join(', ') : 'ingenting';
    };
    const a = this.player(offer.from), b = this.player(offer.to);
    return `${a.name} gir ${side(offer.giveMoney, offer.giveProps, offer.giveCards)} – ${b.name} gir ${side(offer.getMoney, offer.getProps, offer.getCards)}.`;
  }
}
