/*
 * Monopol – datamotstander.
 *
 * AI.step(game) utfører ÉN handling for spilleren som skal handle nå og returnerer
 * en beskrivelse av hva som ble gjort. Hvis AI-en vil foreslå en handel, returneres
 * { type: 'proposeTrade', offer } slik at grensesnittet kan spørre motparten.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MonopolAI = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const RESERVE = 150;

  function unownedCount(game) {
    return Object.values(game.s.props).filter((p) => p.owner === null).length;
  }

  /** Hvor mye en eiendom er verdt for en spiller dersom eierskapet ser slik ut. */
  function portfolioScore(game, pid, owners) {
    const s = game.s;
    let score = 0;
    const groups = {};
    let stations = 0, utilities = 0;
    Object.keys(s.props).forEach((k) => {
      const i = Number(k);
      if (owners[i] !== pid) return;
      const sq = s.board[i];
      if (sq.type === 'property') (groups[sq.group] = groups[sq.group] || []).push(i);
      else if (sq.type === 'station') stations++;
      else if (sq.type === 'utility') utilities++;
      score += s.props[i].mortgaged ? sq.price * 0.6 : sq.price;
    });
    Object.entries(groups).forEach(([g, owned]) => {
      const total = game.groupSquares(g).length;
      const value = owned.reduce((sum, i) => sum + s.board[i].price, 0);
      if (owned.length === total) score += value * 1.6 + game.group(g).houseCost * 3;
      else score += value * 0.25 * (owned.length - 1);
    });
    score += [0, 0, 60, 180, 350][Math.min(stations, 4)] || 0;
    score += utilities >= 2 ? 80 : 0;
    return score;
  }

  function ownerMap(game) {
    const m = {};
    Object.keys(game.s.props).forEach((k) => { m[k] = game.s.props[k].owner; });
    return m;
  }

  /** Hvor ønskelig er felt i for spiller pid (brukes ved kjøp og auksjon). */
  function desire(game, pid, i) {
    const before = ownerMap(game);
    const after = Object.assign({}, before, { [i]: pid });
    const gain = portfolioScore(game, pid, after) - portfolioScore(game, pid, before);
    // Hindre at andre får komplett gruppe
    let block = 0;
    game.activePlayers().forEach((o) => {
      if (o.id === pid) return;
      const oAfter = Object.assign({}, before, { [i]: o.id });
      const oGain = portfolioScore(game, o.id, oAfter) - portfolioScore(game, o.id, before);
      block = Math.max(block, oGain - game.s.board[i].price);
    });
    return gain + block * 0.5;
  }

  /** Vurder en handel fra AI-spillerens perspektiv (aiId er mottaker eller avsender). */
  function evaluateTrade(game, offer, aiId) {
    const before = ownerMap(game);
    const after = Object.assign({}, before);
    (offer.giveProps || []).forEach((i) => { after[i] = offer.to; });
    (offer.getProps || []).forEach((i) => { after[i] = offer.from; });
    const other = aiId === offer.to ? offer.from : offer.to;
    const moneyIn = aiId === offer.to ? (offer.giveMoney || 0) - (offer.getMoney || 0) : (offer.getMoney || 0) - (offer.giveMoney || 0);
    const cardsIn = aiId === offer.to ? (offer.giveCards || 0) - (offer.getCards || 0) : (offer.getCards || 0) - (offer.giveCards || 0);
    const myGain = portfolioScore(game, aiId, after) - portfolioScore(game, aiId, before) + moneyIn + cardsIn * 40;
    const theirGain = portfolioScore(game, other, after) - portfolioScore(game, other, before) - moneyIn - cardsIn * 40;
    // Ikke tøm kassa
    const me = game.player(aiId);
    if (me.money + moneyIn < 50 && moneyIn < 0) return { accept: false, myGain, theirGain };
    return { accept: myGain > 25 && myGain >= theirGain * 0.4, myGain, theirGain };
  }

  function reserveFor(game) {
    // Hold mer kontanter når motstanderne har bygget
    let maxRent = 0;
    Object.keys(game.s.props).forEach((k) => {
      const pr = game.s.props[k];
      if (pr.owner !== null && pr.houses > 0) maxRent = Math.max(maxRent, game.s.board[k].rent[pr.houses]);
    });
    return Math.max(RESERVE, Math.min(600, Math.floor(maxRent * 0.5)));
  }

  function manage(game, pid) {
    const s = game.s, p = game.player(pid);
    const reserve = reserveFor(game);
    // Innløs pantsatte eiendommer – helst de i komplette grupper
    const mortgaged = game.ownedBy(pid).filter((i) => s.props[i].mortgaged)
      .sort((a, b) => (s.board[a].type === 'property' && game.ownsGroup(pid, s.board[a].group) ? -1 : 0) -
                      (s.board[b].type === 'property' && game.ownsGroup(pid, s.board[b].group) ? -1 : 0));
    for (const i of mortgaged) {
      if (p.money - game.unmortgageCost(i) > reserve + 100 && !game.canUnmortgage(pid, i)) {
        game.unmortgage(pid, i);
        return true;
      }
    }
    // Bygg hus der det er lov – billigste bygg først for jevn fordeling
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

  function raiseMoney(game, pid, needed) {
    const s = game.s, p = game.player(pid);
    if (p.money >= needed) return false;
    // 1) Pantsett eiendommer som ikke er i komplett gruppe og ikke har bygninger
    const owned = game.ownedBy(pid);
    const plain = owned.filter((i) => !game.canMortgage(pid, i) &&
      !(s.board[i].type === 'property' && game.ownsGroup(pid, s.board[i].group)))
      .sort((a, b) => game.mortgageValue(a) - game.mortgageValue(b));
    if (plain.length) { game.mortgage(pid, plain[0]); return true; }
    // 2) Selg hus
    const sellable = owned.filter((i) => !game.canSellBuilding(pid, i))
      .sort((a, b) => s.props[b].houses - s.props[a].houses);
    if (sellable.length) { game.sellBuilding(pid, sellable[0]); return true; }
    // 3) Pantsett resten
    const rest = owned.filter((i) => !game.canMortgage(pid, i));
    if (rest.length) { game.mortgage(pid, rest[0]); return true; }
    return false;
  }

  /** Finn en handel AI-en ønsker: siste eiendom i en gruppe den nesten eier. */
  function findTradeProposal(game, pid) {
    const s = game.s, p = game.player(pid);
    if (s.turn < 8) return null;
    const memo = s.aiMemo[pid] = s.aiMemo[pid] || {};
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
      const ownerCount = sqs.filter((i) => s.props[i].owner === owner).length;
      if (ownerCount > 1) continue;
      memo[target] = s.turn;
      const other = game.player(owner);
      const price = s.board[target].price;
      const base = { from: pid, to: owner, giveMoney: 0, getMoney: 0, giveProps: [], getProps: [target], giveCards: 0, getCards: 0 };

      // 1) Bytte: gi motparten eiendommen som fullfører en av deres grupper
      const swaps = game.ownedBy(pid).filter((i) => {
        const sq = s.board[i];
        if (sq.type !== 'property' || sq.group === g || game.groupHasBuildings(sq.group)) return false;
        return game.groupSquares(sq.group).every((j) => j === i || s.props[j].owner === owner);
      });
      for (const x of swaps) {
        for (const extra of [0, 50, 100, 200]) {
          const offer = Object.assign({}, base, { giveProps: [x], giveMoney: extra });
          if (game.validateTrade(offer)) continue;
          const mineEval = evaluateTrade(game, offer, pid);
          if (mineEval.myGain <= 0) break;
          if (other.isAI ? evaluateTrade(game, offer, owner).accept : extra >= 0) return offer;
        }
      }

      // 2) Kontantbud
      const budget = p.money - RESERVE;
      for (const mult of [1.6, 2, 2.5, 3]) {
        const bid = Math.round(price * mult / 10) * 10;
        if (bid > budget) break;
        const offer = Object.assign({}, base, { giveMoney: bid });
        if (game.validateTrade(offer)) break;
        if (evaluateTrade(game, offer, pid).myGain <= 0) break;
        if (!other.isAI || evaluateTrade(game, offer, owner).accept) return offer;
      }
    }
    return null;
  }

  function step(game) {
    const s = game.s;
    const pid = game.actingPlayerId();
    if (pid === null) return null;
    const p = game.player(pid);

    switch (s.phase) {
      case 'roll': {
        if (manage(game, pid)) return { type: 'manage' };
        if (s.aiMemo.lastPropose !== s.turn) {
          s.aiMemo.lastPropose = s.turn;
          const offer = findTradeProposal(game, pid);
          if (offer && !game.validateTrade(offer)) return { type: 'proposeTrade', offer };
        }
        if (p.inJail) {
          const early = unownedCount(game) > 6;
          if (early && p.jailCards.length) { game.useJailCard(); return { type: 'jailCard' }; }
          if (early && p.money > s.rules.jailFine + RESERVE) { game.payJailFine(); return { type: 'payJail' }; }
        }
        game.roll();
        return { type: 'roll' };
      }
      case 'buy': {
        const i = s.pendingBuy, price = s.board[i].price;
        const want = desire(game, pid, i);
        const afterMoney = p.money - price;
        if (p.money >= price && (afterMoney >= reserveFor(game) * 0.5 || (want > price * 1.5 && afterMoney >= 0))) {
          game.buy();
          return { type: 'buy' };
        }
        // Prøv å skaffe penger hvis eiendommen er svært ønskelig
        if (want > price * 1.5 && game.liquidationValue(pid) - price > 200 && raiseMoney(game, pid, price)) {
          return { type: 'raise' };
        }
        game.declineBuy();
        return { type: 'decline' };
      }
      case 'auction': {
        const a = s.auction, i = a.square, price = s.board[i].price;
        const want = desire(game, pid, i);
        const max = Math.min(p.money - 40, Math.max(price * 0.6, Math.min(want, price * 2.2)));
        const inc = a.highBid < 100 ? 10 : a.highBid < 300 ? 20 : 50;
        const bid = a.highBid + inc;
        if (bid <= max) { game.auctionBid(pid, bid); return { type: 'bid', amount: bid }; }
        game.auctionPass(pid);
        return { type: 'pass' };
      }
      case 'debt': {
        const d = s.debts[0];
        if (p.money >= d.amount) { game.payDebt(); return { type: 'payDebt' }; }
        if (raiseMoney(game, pid, d.amount)) return { type: 'raise' };
        game.declareBankruptcy();
        return { type: 'bankrupt' };
      }
      case 'end': {
        if (manage(game, pid)) return { type: 'manage' };
        game.endTurn();
        return { type: 'endTurn' };
      }
      default:
        return null;
    }
  }

  return { step, evaluateTrade, portfolioScore, desire };
});
