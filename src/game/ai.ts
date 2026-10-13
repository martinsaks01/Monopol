/*
 * Datamotstanderen.
 *
 * step(game) utfører ÉN handling for spilleren som skal handle nå. Terningkast gjøres
 * ikke her – AI-en returnerer { type: 'roll' } og lar 3D-scenen kaste terningene.
 */
import type { Game } from './engine';
import type { TradeOffer } from './types';

const RESERVE = 150;

export type AIAction =
  | { type: 'roll' }
  | { type: 'proposeTrade'; offer: TradeOffer }
  | { type: 'done' };

type Owners = Record<number, number | null>;

function unownedCount(game: Game) {
  return Object.values(game.s.props).filter((p) => p.owner === null).length;
}

function ownerMap(game: Game): Owners {
  const m: Owners = {};
  Object.keys(game.s.props).forEach((k) => { m[Number(k)] = game.s.props[Number(k)].owner; });
  return m;
}

export function portfolioScore(game: Game, pid: number, owners: Owners): number {
  const s = game.s;
  let score = 0;
  const groups: Record<string, number[]> = {};
  let stations = 0, utilities = 0;
  Object.keys(s.props).forEach((k) => {
    const i = Number(k);
    if (owners[i] !== pid) return;
    const sq = s.board[i];
    if (sq.type === 'property' && sq.group) (groups[sq.group] = groups[sq.group] || []).push(i);
    else if (sq.type === 'station') stations++;
    else if (sq.type === 'utility') utilities++;
    score += (sq.price || 0) * (s.props[i].mortgaged ? 0.6 : 1);
  });
  Object.entries(groups).forEach(([g, owned]) => {
    const total = game.groupSquares(g).length;
    const value = owned.reduce((sum, i) => sum + (s.board[i].price || 0), 0);
    if (owned.length === total) score += value * 1.6 + game.group(g).houseCost * 3;
    else score += value * 0.25 * (owned.length - 1);
  });
  score += [0, 0, 60, 180, 350][Math.min(stations, 4)] || 0;
  score += utilities >= 2 ? 80 : 0;
  return score;
}

export function desire(game: Game, pid: number, i: number): number {
  const before = ownerMap(game);
  const after = { ...before, [i]: pid };
  const gain = portfolioScore(game, pid, after) - portfolioScore(game, pid, before);
  let block = 0;
  game.activePlayers().forEach((o) => {
    if (o.id === pid) return;
    const oAfter = { ...before, [i]: o.id };
    const oGain = portfolioScore(game, o.id, oAfter) - portfolioScore(game, o.id, before);
    block = Math.max(block, oGain - (game.s.board[i].price || 0));
  });
  return gain + block * 0.5;
}

export function evaluateTrade(game: Game, offer: TradeOffer, aiId: number) {
  const before = ownerMap(game);
  const after = { ...before };
  (offer.giveProps || []).forEach((i) => { after[i] = offer.to; });
  (offer.getProps || []).forEach((i) => { after[i] = offer.from; });
  const other = aiId === offer.to ? offer.from : offer.to;
  const sign = aiId === offer.to ? 1 : -1;
  const moneyIn = sign * ((offer.giveMoney || 0) - (offer.getMoney || 0));
  const cardsIn = sign * ((offer.giveCards || 0) - (offer.getCards || 0));
  const myGain = portfolioScore(game, aiId, after) - portfolioScore(game, aiId, before) + moneyIn + cardsIn * 40;
  const theirGain = portfolioScore(game, other, after) - portfolioScore(game, other, before) - moneyIn - cardsIn * 40;
  const me = game.player(aiId);
  if (me.money + moneyIn < 50 && moneyIn < 0) return { accept: false, myGain, theirGain };
  return { accept: myGain > 25 && myGain >= theirGain * 0.4, myGain, theirGain };
}

function reserveFor(game: Game) {
  let maxRent = 0;
  Object.keys(game.s.props).forEach((k) => {
    const i = Number(k);
    const pr = game.s.props[i];
    const rent = game.s.board[i].rent;
    if (pr.owner !== null && pr.houses > 0 && rent) maxRent = Math.max(maxRent, rent[pr.houses]);
  });
  return Math.max(RESERVE, Math.min(600, Math.floor(maxRent * 0.5)));
}

function manage(game: Game, pid: number): boolean {
  const s = game.s, p = game.player(pid);
  const reserve = reserveFor(game);
  const inMono = (i: number) => s.board[i].type === 'property' && !!s.board[i].group && game.ownsGroup(pid, s.board[i].group!);
  const mortgaged = game.ownedBy(pid).filter((i) => s.props[i].mortgaged).sort((a, b) => Number(inMono(b)) - Number(inMono(a)));
  for (const i of mortgaged) {
    if (p.money - game.unmortgageCost(i) > reserve + 100 && !game.canUnmortgage(pid, i)) {
      game.unmortgage(pid, i);
      return true;
    }
  }
  const candidates = game.ownedBy(pid).filter((i) => !game.canBuild(pid, i))
    .sort((a, b) => s.props[a].houses - s.props[b].houses || game.houseCost(a) - game.houseCost(b));
  for (const i of candidates) {
    if (p.money - game.houseCost(i) >= reserve) {
      game.build(pid, i);
      return true;
    }
  }
  return false;
}

function raiseMoney(game: Game, pid: number, needed: number): boolean {
  const s = game.s, p = game.player(pid);
  if (p.money >= needed) return false;
  const owned = game.ownedBy(pid);
  const plain = owned.filter((i) => !game.canMortgage(pid, i) &&
    !(s.board[i].type === 'property' && game.ownsGroup(pid, s.board[i].group!)))
    .sort((a, b) => game.mortgageValue(a) - game.mortgageValue(b));
  if (plain.length) { game.mortgage(pid, plain[0]); return true; }
  const sellable = owned.filter((i) => !game.canSellBuilding(pid, i)).sort((a, b) => s.props[b].houses - s.props[a].houses);
  if (sellable.length) { game.sellBuilding(pid, sellable[0]); return true; }
  const rest = owned.filter((i) => !game.canMortgage(pid, i));
  if (rest.length) { game.mortgage(pid, rest[0]); return true; }
  return false;
}

function findTradeProposal(game: Game, pid: number): TradeOffer | null {
  const s = game.s, p = game.player(pid);
  if (s.turn < 8) return null;
  const memo = (s.aiMemo[pid] = s.aiMemo[pid] || {});
  for (const g of Object.keys(s.theme.groups)) {
    const sqs = game.groupSquares(g);
    if (!sqs.length) continue;
    const mine = sqs.filter((i) => s.props[i].owner === pid);
    const missing = sqs.filter((i) => s.props[i].owner !== pid);
    if (missing.length !== 1 || mine.length < 1) continue;
    const target = missing[0];
    const owner = s.props[target].owner;
    if (owner === null || game.groupHasBuildings(g)) continue;
    if (memo[target] && s.turn - memo[target] < 10) continue;
    if (sqs.filter((i) => s.props[i].owner === owner).length > 1) continue;
    memo[target] = s.turn;
    const other = game.player(owner);
    const price = s.board[target].price || 0;
    const base: TradeOffer = { from: pid, to: owner, giveMoney: 0, getMoney: 0, giveProps: [], getProps: [target], giveCards: 0, getCards: 0 };

    // 1) Bytte: gi motparten eiendommen som fullfører en av deres grupper
    const swaps = game.ownedBy(pid).filter((i) => {
      const sq = s.board[i];
      if (sq.type !== 'property' || !sq.group || sq.group === g || game.groupHasBuildings(sq.group)) return false;
      return game.groupSquares(sq.group).every((j) => j === i || s.props[j].owner === owner);
    });
    for (const x of swaps) {
      for (const extra of [0, 50, 100, 200]) {
        const offer = { ...base, giveProps: [x], giveMoney: extra };
        if (game.validateTrade(offer)) continue;
        if (evaluateTrade(game, offer, pid).myGain <= 0) break;
        if (!other.isAI || evaluateTrade(game, offer, owner).accept) return offer;
      }
    }
    // 2) Kontantbud
    const budget = p.money - RESERVE;
    for (const mult of [1.6, 2, 2.5, 3]) {
      const bid = Math.round((price * mult) / 10) * 10;
      if (bid > budget) break;
      const offer = { ...base, giveMoney: bid };
      if (game.validateTrade(offer)) break;
      if (evaluateTrade(game, offer, pid).myGain <= 0) break;
      if (!other.isAI || evaluateTrade(game, offer, owner).accept) return offer;
    }
  }
  return null;
}

/** Utfør én AI-handling. Returnerer 'roll' når terningene skal kastes. */
export function step(game: Game): AIAction | null {
  const s = game.s;
  const pid = game.actingPlayerId();
  if (pid === null) return null;
  const p = game.player(pid);

  switch (s.phase) {
    case 'roll': {
      if (manage(game, pid)) return { type: 'done' };
      const memo = (s.aiMemo.global = s.aiMemo.global || {});
      if (memo.lastPropose !== s.turn) {
        memo.lastPropose = s.turn;
        const offer = findTradeProposal(game, pid);
        if (offer && !game.validateTrade(offer)) return { type: 'proposeTrade', offer };
      }
      if (p.inJail) {
        const early = unownedCount(game) > 6;
        if (early && p.jailCards.length) { game.useJailCard(); return { type: 'done' }; }
        if (early && p.money > s.rules.jailFine + RESERVE) { game.payJailFine(); return { type: 'done' }; }
      }
      return { type: 'roll' };
    }
    case 'buy': {
      const i = s.pendingBuy as number, price = s.board[i].price || 0;
      const want = desire(game, pid, i);
      const afterMoney = p.money - price;
      if (p.money >= price && (afterMoney >= reserveFor(game) * 0.5 || (want > price * 1.5 && afterMoney >= 0))) {
        game.buy();
        return { type: 'done' };
      }
      if (want > price * 1.5 && game.liquidationValue(pid) - price > 200 && raiseMoney(game, pid, price)) return { type: 'done' };
      game.declineBuy();
      return { type: 'done' };
    }
    case 'auction': {
      const a = s.auction!, price = s.board[a.square].price || 0;
      const want = desire(game, pid, a.square);
      const max = Math.min(p.money - 40, Math.max(price * 0.6, Math.min(want, price * 2.2)));
      const inc = a.highBid < 100 ? 10 : a.highBid < 300 ? 20 : 50;
      const bid = a.highBid + inc;
      if (bid <= max) game.auctionBid(pid, bid);
      else game.auctionPass(pid);
      return { type: 'done' };
    }
    case 'debt': {
      const d = s.debts[0];
      if (p.money >= d.amount) { game.payDebt(); return { type: 'done' }; }
      if (raiseMoney(game, pid, d.amount)) return { type: 'done' };
      game.declareBankruptcy();
      return { type: 'done' };
    }
    case 'end': {
      if (manage(game, pid)) return { type: 'done' };
      game.endTurn();
      return { type: 'done' };
    }
    default:
      return null;
  }
}
