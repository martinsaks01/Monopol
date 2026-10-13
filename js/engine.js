/*
 * Monopol – spillmotor.
 *
 * Ren spillogikk uten DOM. Hele spilltilstanden ligger i `game.s` og er ren JSON,
 * slik at den kan lagres og lastes inn igjen. Motoren fungerer både i nettleser og Node.
 *
 * Faser (state.phase):
 *   roll     – nåværende spiller skal kaste terninger (evt. betale seg ut av fengsel)
 *   buy      – spilleren står på en ledig eiendom og må kjøpe eller avslå (→ auksjon)
 *   auction  – auksjon pågår
 *   debt     – en spiller skylder penger og må skaffe dem eller gå konkurs
 *   end      – spilleren kan avslutte turen
 *   gameover – spillet er ferdig
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MonopolEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULT_RULES = {
    startMoney: 1500,
    goSalary: 200,
    doubleSalaryOnGo: false,      // dobbel lønn når man lander nøyaktig på Start
    jailFine: 50,
    maxJailTurns: 3,
    doublesToJail: 3,             // antall doble på rad som sender deg i fengsel
    freeParkingJackpot: false,    // skatter og bøter samles i potten på Gratis parkering
    auctions: true,               // avslåtte eiendommer går på auksjon
    evenBuild: true,              // hus må bygges jevnt i en fargegruppe
    houses: 32,
    hotels: 12,
    mortgageInterest: 0.1,
    buildingSellRate: 0.5,
    monopolyRentMultiplier: 2,    // grunnleie ganges med dette når man eier hele gruppen
    stationRent: [25, 50, 100, 200],
    utilityMultipliers: [4, 10],
    collectRentInJail: true,
    currency: 'kr',
  };

  const BUYABLE = { property: true, station: true, utility: true };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function validateTheme(theme) {
    const errors = [];
    if (!theme || !Array.isArray(theme.board)) return ['Temaet mangler «board».'];
    const n = theme.board.length;
    if (n < 8 || n % 4 !== 0) errors.push('Antall felter må være delelig med 4 (minst 8).');
    if (!theme.board[0] || theme.board[0].type !== 'start') errors.push('Felt 0 må være av typen «start».');
    if (!theme.board.some((s) => s.type === 'jail')) errors.push('Brettet må ha et felt av typen «jail».');
    const groups = theme.groups || {};
    const decks = theme.decks || {};
    theme.board.forEach((sq, i) => {
      if (!sq.name) errors.push(`Felt ${i} mangler navn.`);
      if (BUYABLE[sq.type] && !(sq.price > 0)) errors.push(`Felt ${i} (${sq.name}) mangler pris.`);
      if (sq.type === 'property') {
        if (!groups[sq.group]) errors.push(`Felt ${i} (${sq.name}) har ukjent gruppe «${sq.group}».`);
        if (!Array.isArray(sq.rent) || sq.rent.length !== 6) errors.push(`Felt ${i} (${sq.name}) må ha 6 leieverdier.`);
      }
      if (sq.type === 'card' && !decks[sq.deck]) errors.push(`Felt ${i} (${sq.name}) peker på ukjent kortstokk «${sq.deck}».`);
      if (sq.type === 'tax' && typeof sq.amount !== 'number') errors.push(`Felt ${i} (${sq.name}) mangler beløp.`);
    });
    Object.entries(decks).forEach(([id, d]) => {
      if (!Array.isArray(d.cards) || !d.cards.length) errors.push(`Kortstokken «${id}» har ingen kort.`);
    });
    return errors;
  }

  class Game {
    constructor(state, rng) {
      this.s = state;
      this.rng = rng || Math.random;
    }

    /**
     * Lag et nytt spill.
     * @param theme   temaobjekt (se themes/standard.js)
     * @param players [{ name, color, token, isAI }]
     * @param ruleOverrides regler som overstyrer tema og standard
     */
    static create(theme, players, ruleOverrides, rng) {
      rng = rng || Math.random;
      const errors = validateTheme(theme);
      if (errors.length) throw new Error('Ugyldig tema:\n' + errors.join('\n'));
      if (!players || players.length < 2) throw new Error('Spillet trenger minst to spillere.');

      const rules = Object.assign({}, DEFAULT_RULES, theme.rules || {}, ruleOverrides || {});
      const board = clone(theme.board);
      const props = {};
      board.forEach((sq, i) => {
        if (BUYABLE[sq.type]) props[i] = { owner: null, houses: 0, mortgaged: false };
      });
      const decks = {};
      Object.entries(theme.decks || {}).forEach(([id, d]) => {
        decks[id] = {
          name: d.name || id,
          color: d.color || '#888',
          icon: d.icon || '🂠',
          cards: clone(d.cards),
          order: shuffle(d.cards.map((_, i) => i), rng),
        };
      });

      const state = {
        version: 1,
        theme: { id: theme.id, name: theme.name, groups: clone(theme.groups || {}) },
        rules,
        board,
        props,
        decks,
        players: players.map((p, i) => ({
          id: i,
          name: p.name || `Spiller ${i + 1}`,
          color: p.color || '#888',
          token: p.token || '●',
          isAI: !!p.isAI,
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
        rollId: 0,
        doublesCount: 0,
        extraRoll: false,
        pendingBuy: null,
        pendingMove: null,
        auction: null,
        debts: [],
        pot: 0,
        houses: rules.houses,
        hotels: rules.hotels,
        lastMove: null,
        lastCard: null,
        seq: 0,
        winner: null,
        log: [],
        aiMemo: {},
      };
      const game = new Game(state, rng);
      game.log(`Spillet starter! ${state.players[0].name} begynner.`);
      return game;
    }

    static load(data, rng) {
      return new Game(typeof data === 'string' ? JSON.parse(data) : data, rng);
    }

    serialize() { return JSON.stringify(this.s); }

    // ---------------------------------------------------------------- hjelpere

    fmt(n) {
      const v = Math.round(n).toLocaleString('nb-NO');
      return `${v} ${this.s.rules.currency}`;
    }

    log(msg) {
      this.s.log.push({ turn: this.s.turn, msg });
      if (this.s.log.length > 400) this.s.log.splice(0, this.s.log.length - 400);
    }

    player(id) { return this.s.players[id]; }
    get current() { return this.s.players[this.s.current]; }
    activePlayers() { return this.s.players.filter((p) => !p.bankrupt); }
    square(i) { return this.s.board[i]; }
    isBuyable(i) { return !!BUYABLE[this.s.board[i].type]; }
    group(id) { return this.s.theme.groups[id]; }
    jailIndex() { return this.s.board.findIndex((sq) => sq.type === 'jail'); }
    diceTotal() { return this.s.dice ? this.s.dice[0] + this.s.dice[1] : 0; }

    /** Hvem som skal gjøre noe nå (nåværende spiller, skyldner eller budgiver). */
    actingPlayerId() {
      const s = this.s;
      if (s.phase === 'gameover') return null;
      if (s.phase === 'debt') return s.debts[0].debtor;
      if (s.phase === 'auction') return s.auction.participants[s.auction.turn];
      return s.current;
    }

    groupSquares(groupId) {
      const out = [];
      this.s.board.forEach((sq, i) => { if (sq.type === 'property' && sq.group === groupId) out.push(i); });
      return out;
    }

    ownsGroup(pid, groupId) {
      const sqs = this.groupSquares(groupId);
      return sqs.length > 0 && sqs.every((i) => this.s.props[i].owner === pid);
    }

    groupHasBuildings(groupId) {
      return this.groupSquares(groupId).some((i) => this.s.props[i].houses > 0);
    }

    ownedBy(pid) {
      return Object.keys(this.s.props).map(Number).filter((i) => this.s.props[i].owner === pid);
    }

    countOwnedOfType(pid, type) {
      return this.ownedBy(pid).filter((i) => this.s.board[i].type === type).length;
    }

    mortgageValue(i) {
      const sq = this.s.board[i];
      return sq.mortgage != null ? sq.mortgage : Math.floor(sq.price / 2);
    }

    unmortgageCost(i) {
      return Math.ceil(this.mortgageValue(i) * (1 + this.s.rules.mortgageInterest));
    }

    houseCost(i) {
      const sq = this.s.board[i];
      return sq.houseCost != null ? sq.houseCost : (this.group(sq.group) || {}).houseCost || 0;
    }

    buildingSellValue(i) {
      return Math.floor(this.houseCost(i) * this.s.rules.buildingSellRate);
    }

    /** Hvor mye en spiller kan skaffe ved å selge alle bygninger og pantsette alt. */
    liquidationValue(pid) {
      let total = this.player(pid).money;
      this.ownedBy(pid).forEach((i) => {
        const pr = this.s.props[i];
        total += pr.houses * this.buildingSellValue(i);
        if (!pr.mortgaged) total += this.mortgageValue(i);
      });
      return total;
    }

    netWorth(pid) {
      let total = this.player(pid).money;
      this.ownedBy(pid).forEach((i) => {
        const pr = this.s.props[i];
        total += pr.mortgaged ? this.mortgageValue(i) : this.s.board[i].price;
        total += pr.houses * this.houseCost(i);
      });
      return total;
    }

    /** Leie for et felt gitt terningsum og evt. kortmodifikatorer. */
    calcRent(i, diceTotal, mods) {
      mods = mods || {};
      const sq = this.s.board[i];
      const pr = this.s.props[i];
      if (!pr || pr.owner === null || pr.mortgaged) return 0;
      const r = this.s.rules;
      if (sq.type === 'property') {
        if (pr.houses > 0) return sq.rent[pr.houses];
        return sq.rent[0] * (this.ownsGroup(pr.owner, sq.group) ? r.monopolyRentMultiplier : 1);
      }
      if (sq.type === 'station') {
        const n = this.countOwnedOfType(pr.owner, 'station');
        const table = sq.rent || r.stationRent;
        const base = table[Math.min(n, table.length) - 1];
        return base * (mods.rentMultiplier || 1);
      }
      if (sq.type === 'utility') {
        const n = this.countOwnedOfType(pr.owner, 'utility');
        const table = sq.rent || r.utilityMultipliers;
        const mult = mods.diceMultiplier || table[Math.min(n, table.length) - 1];
        return diceTotal * mult;
      }
      return 0;
    }

    // ------------------------------------------------------------- pengeflyt

    _transfer(fromId, to, amount) {
      const from = this.player(fromId);
      from.money -= amount;
      if (to === 'pot') this.s.pot += amount;
      else if (to !== null && to !== undefined) this.player(to).money += amount;
    }

    _bankOrPot() { return this.s.rules.freeParkingJackpot ? 'pot' : null; }

    _creditorName(to) {
      if (to === 'pot') return 'potten';
      if (to === null || to === undefined) return 'banken';
      return this.player(to).name;
    }

    /** Krev betaling. Kan ikke spilleren betale, legges gjelden i køen. */
    _charge(debtorId, to, amount, reason) {
      amount = Math.round(amount);
      if (amount <= 0) return;
      const debtor = this.player(debtorId);
      if (debtor.bankrupt) return;
      const hasQueued = this.s.debts.some((d) => d.debtor === debtorId);
      if (!hasQueued && debtor.money >= amount) {
        this._transfer(debtorId, to, amount);
        this.log(`${debtor.name} betaler ${this.fmt(amount)} til ${this._creditorName(to)}${reason ? ` (${reason})` : ''}.`);
      } else {
        this.s.debts.push({ debtor: debtorId, to, amount, reason: reason || '' });
        this.log(`${debtor.name} skylder ${this.fmt(amount)} til ${this._creditorName(to)}${reason ? ` (${reason})` : ''}, men har bare ${this.fmt(debtor.money)}.`);
      }
    }

    // ------------------------------------------------------------- bevegelse

    _move(p, steps, collectSalary) {
      const n = this.s.board.length;
      const from = p.position;
      const to = (((from + steps) % n) + n) % n;
      if (steps > 0 && collectSalary !== false && from + steps >= n) {
        const r = this.s.rules;
        const salary = r.goSalary * (to === 0 && r.doubleSalaryOnGo ? 2 : 1);
        p.money += salary;
        this.log(`${p.name} passerer Start og mottar ${this.fmt(salary)}.`);
      }
      p.position = to;
      this.s.lastMove = { player: p.id, from, to, steps, id: ++this.s.seq };
    }

    _moveTo(p, target, collectSalary) {
      const n = this.s.board.length;
      const steps = (target - p.position + n) % n;
      this._move(p, steps === 0 ? n : steps, collectSalary);
    }

    _sendToJail(p) {
      const from = p.position;
      p.position = this.jailIndex();
      p.inJail = true;
      p.jailTurns = 0;
      if (p.id === this.s.current) {
        this.s.extraRoll = false;
        this.s.doublesCount = 0;
      }
      this.s.lastMove = { player: p.id, from, to: p.position, steps: 0, jail: true, id: ++this.s.seq };
      this.log(`${p.name} havner i fengsel!`);
    }

    _resolveLanding(p, mods) {
      mods = mods || {};
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
            this.log(`${p.name} lander på ${sq.name}, som er til salgs for ${this.fmt(sq.price)}.`);
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
            const rent = this.calcRent(idx, dice, mods);
            this._charge(p.id, owner.id, rent, `leie for ${sq.name}`);
          }
          break;
        }
        case 'tax':
          this.log(`${p.name} lander på ${sq.name}.`);
          this._charge(p.id, this._bankOrPot(), sq.amount, sq.name.toLowerCase());
          break;
        case 'card':
          this._drawCard(p, sq.deck);
          break;
        case 'gotojail':
          this._sendToJail(p);
          break;
        case 'parking':
          if (s.rules.freeParkingJackpot && s.pot > 0) {
            this.log(`${p.name} vinner potten på ${this.fmt(s.pot)}!`);
            p.money += s.pot;
            s.pot = 0;
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

    _drawCard(p, deckId) {
      const deck = this.s.decks[deckId];
      if (!deck || !deck.order.length) return;
      const ci = deck.order.shift();
      const card = deck.cards[ci];
      if (card.action !== 'jailCard') deck.order.push(ci);
      this.s.lastCard = { deck: deckId, deckName: deck.name, color: deck.color, icon: deck.icon, text: card.text, player: p.id, id: ++this.s.seq };
      this.log(`${p.name} trekker ${deck.name}: «${card.text}»`);
      this._applyCard(p, card, deckId, ci);
    }

    _applyCard(p, card, deckId, ci) {
      const s = this.s;
      const others = this.activePlayers().filter((o) => o.id !== p.id);
      switch (card.action) {
        case 'advance':
          this._moveTo(p, card.to, card.collectSalary);
          this._resolveLanding(p);
          break;
        case 'nearest': {
          const n = s.board.length;
          let target = -1;
          for (let k = 1; k <= n; k++) {
            const i = (p.position + k) % n;
            if (s.board[i].type === card.target) { target = i; break; }
          }
          if (target >= 0) {
            this._moveTo(p, target);
            this._resolveLanding(p, { rentMultiplier: card.rentMultiplier, diceMultiplier: card.diceMultiplier });
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
          if (card.amount >= 0) p.money += card.amount;
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
        default:
          break;
      }
    }

    _die() { return 1 + Math.floor(this.rng() * 6); }

    /** Fortsett turen etter at noe er avgjort (betaling, kjøp, auksjon …). */
    _continue() {
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

    _nextTurn() {
      const s = this.s;
      if (this._checkGameOver()) return;
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
      this.log(`— Tur ${s.turn}: ${this.current.name} sin tur.`);
    }

    _checkGameOver() {
      const active = this.activePlayers();
      if (active.length <= 1) {
        this.s.phase = 'gameover';
        this.s.winner = active.length ? active[0].id : null;
        if (active.length) this.log(`🏆 ${active[0].name} har vunnet spillet!`);
        return true;
      }
      return false;
    }

    _fail(error) { return { ok: false, error }; }
    _ok(extra) { return Object.assign({ ok: true }, extra || {}); }

    // ------------------------------------------------------------ handlinger

    roll(forced) {
      const s = this.s;
      if (s.phase !== 'roll') return this._fail('Du kan ikke kaste terningene nå.');
      const p = this.current;
      const d1 = forced ? forced[0] : this._die();
      const d2 = forced ? forced[1] : this._die();
      const isDouble = d1 === d2;
      const total = d1 + d2;
      s.dice = [d1, d2];
      s.rollId = ++s.seq;
      s.lastCard = null;
      s.extraRoll = false;
      this.log(`${p.name} kaster ${d1} + ${d2} = ${total}${isDouble ? ' (dobbel!)' : ''}.`);

      if (p.inJail) {
        if (isDouble) {
          p.inJail = false;
          p.jailTurns = 0;
          this.log(`${p.name} slår dobbel og kommer ut av fengselet.`);
          this._move(p, total, true);
          this._resolveLanding(p);
        } else {
          p.jailTurns++;
          if (p.jailTurns >= s.rules.maxJailTurns) {
            this.log(`${p.name} har sittet ${p.jailTurns} runder og må betale ${this.fmt(s.rules.jailFine)} for å komme ut.`);
            p.inJail = false;
            p.jailTurns = 0;
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

    payJailFine() {
      const s = this.s, p = this.current;
      if (s.phase !== 'roll' || !p.inJail) return this._fail('Du sitter ikke i fengsel.');
      if (p.money < s.rules.jailFine) return this._fail('Du har ikke råd.');
      this._transfer(p.id, this._bankOrPot(), s.rules.jailFine);
      p.inJail = false;
      p.jailTurns = 0;
      this.log(`${p.name} betaler ${this.fmt(s.rules.jailFine)} og er ute av fengselet.`);
      return this._ok();
    }

    useJailCard() {
      const s = this.s, p = this.current;
      if (s.phase !== 'roll' || !p.inJail) return this._fail('Du sitter ikke i fengsel.');
      if (!p.jailCards.length) return this._fail('Du har ingen kom-ut-av-fengsel-kort.');
      const c = p.jailCards.shift();
      if (s.decks[c.deck]) s.decks[c.deck].order.push(c.card);
      p.inJail = false;
      p.jailTurns = 0;
      this.log(`${p.name} bruker et kom-ut-av-fengsel-kort.`);
      return this._ok();
    }

    buy() {
      const s = this.s, p = this.current;
      if (s.phase !== 'buy') return this._fail('Det er ingenting å kjøpe nå.');
      const i = s.pendingBuy, sq = s.board[i];
      if (p.money < sq.price) return this._fail('Du har ikke nok penger.');
      p.money -= sq.price;
      s.props[i].owner = p.id;
      s.pendingBuy = null;
      this.log(`${p.name} kjøper ${sq.name} for ${this.fmt(sq.price)}.`);
      this._continue();
      return this._ok();
    }

    declineBuy() {
      const s = this.s;
      if (s.phase !== 'buy') return this._fail('Det er ingenting å avslå nå.');
      const i = s.pendingBuy;
      s.pendingBuy = null;
      if (s.rules.auctions && this.activePlayers().length > 1) {
        this._startAuction(i);
      } else {
        this.log(`${this.current.name} kjøper ikke ${s.board[i].name}.`);
      }
      this._continue();
      return this._ok();
    }

    _startAuction(i) {
      const s = this.s;
      const n = s.players.length;
      const participants = [];
      for (let k = 1; k <= n; k++) {
        const p = s.players[(s.current + k) % n];
        if (!p.bankrupt) participants.push(p.id);
      }
      s.auction = { square: i, highBid: 0, highBidder: null, participants, turn: 0 };
      this.log(`${s.board[i].name} går på auksjon!`);
    }

    auctionBid(pid, amount) {
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

    auctionPass(pid) {
      const s = this.s, a = s.auction;
      if (s.phase !== 'auction' || !a) return this._fail('Ingen auksjon pågår.');
      if (a.participants[a.turn] !== pid) return this._fail('Det er ikke din tur.');
      a.participants.splice(a.turn, 1);
      if (a.participants.length) a.turn %= a.participants.length;
      this.log(`${this.player(pid).name} står over.`);
      this._checkAuction();
      return this._ok();
    }

    _checkAuction() {
      const s = this.s, a = s.auction;
      const sq = s.board[a.square];
      let done = false;
      if (a.participants.length === 0) {
        if (a.highBidder !== null) done = true;
        else { this.log(`Ingen bød på ${sq.name}. Den forblir i banken.`); s.auction = null; }
      } else if (a.participants.length === 1 && a.highBidder === a.participants[0]) {
        done = true;
      }
      if (done) {
        const w = this.player(a.highBidder);
        w.money -= a.highBid;
        s.props[a.square].owner = w.id;
        this.log(`${w.name} vinner auksjonen og kjøper ${sq.name} for ${this.fmt(a.highBid)}.`);
        s.auction = null;
      }
      if (!s.auction) this._continue();
    }

    endTurn() {
      if (this.s.phase !== 'end') return this._fail('Du kan ikke avslutte turen nå.');
      this._nextTurn();
      return this._ok();
    }

    // -------------------------------------------------- bygging og pantsetting

    canBuild(pid, i) {
      const s = this.s, sq = s.board[i], pr = s.props[i];
      if (!sq || sq.type !== 'property' || !pr) return 'Bare eiendommer kan bebygges.';
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

    build(pid, i) {
      const err = this.canBuild(pid, i);
      if (err) return this._fail(err);
      const s = this.s, pr = s.props[i], p = this.player(pid);
      p.money -= this.houseCost(i);
      if (pr.houses === 4) { s.hotels--; s.houses += 4; } else { s.houses--; }
      pr.houses++;
      this.log(`${p.name} bygger ${pr.houses === 5 ? 'hotell' : 'hus'} på ${s.board[i].name}.`);
      return this._ok();
    }

    canSellBuilding(pid, i) {
      const s = this.s, sq = s.board[i], pr = s.props[i];
      if (!pr || pr.owner !== pid) return 'Du eier ikke denne eiendommen.';
      if (pr.houses <= 0) return 'Det er ingen bygninger her.';
      const grp = this.groupSquares(sq.group);
      if (s.rules.evenBuild && pr.houses < Math.max(...grp.map((g) => s.props[g].houses))) return 'Du må selge jevnt i fargegruppen.';
      if (pr.houses === 5 && s.houses < 4) return 'Banken har ikke nok hus til å bytte ut hotellet.';
      return null;
    }

    sellBuilding(pid, i) {
      const err = this.canSellBuilding(pid, i);
      if (err) return this._fail(err);
      const s = this.s, pr = s.props[i], p = this.player(pid);
      const value = this.buildingSellValue(i);
      if (pr.houses === 5) { s.hotels++; s.houses -= 4; } else { s.houses++; }
      pr.houses--;
      p.money += value;
      this.log(`${p.name} selger ${pr.houses === 4 ? 'hotell' : 'hus'} på ${s.board[i].name} for ${this.fmt(value)}.`);
      return this._ok();
    }

    canMortgage(pid, i) {
      const s = this.s, sq = s.board[i], pr = s.props[i];
      if (!pr || pr.owner !== pid) return 'Du eier ikke denne eiendommen.';
      if (pr.mortgaged) return 'Eiendommen er allerede pantsatt.';
      if (sq.type === 'property' && this.groupHasBuildings(sq.group)) return 'Selg alle bygninger i fargegruppen først.';
      return null;
    }

    mortgage(pid, i) {
      const err = this.canMortgage(pid, i);
      if (err) return this._fail(err);
      const p = this.player(pid), v = this.mortgageValue(i);
      this.s.props[i].mortgaged = true;
      p.money += v;
      this.log(`${p.name} pantsetter ${this.s.board[i].name} og får ${this.fmt(v)}.`);
      return this._ok();
    }

    canUnmortgage(pid, i) {
      const pr = this.s.props[i];
      if (!pr || pr.owner !== pid) return 'Du eier ikke denne eiendommen.';
      if (!pr.mortgaged) return 'Eiendommen er ikke pantsatt.';
      if (this.player(pid).money < this.unmortgageCost(i)) return 'Du har ikke nok penger.';
      return null;
    }

    unmortgage(pid, i) {
      const err = this.canUnmortgage(pid, i);
      if (err) return this._fail(err);
      const p = this.player(pid), c = this.unmortgageCost(i);
      this.s.props[i].mortgaged = false;
      p.money -= c;
      this.log(`${p.name} innløser ${this.s.board[i].name} for ${this.fmt(c)}.`);
      return this._ok();
    }

    // ----------------------------------------------------------------- gjeld

    payDebt() {
      const s = this.s;
      if (s.phase !== 'debt') return this._fail('Det er ingen gjeld å betale.');
      const d = s.debts[0], p = this.player(d.debtor);
      if (p.money < d.amount) return this._fail(`Du mangler ${this.fmt(d.amount - p.money)}.`);
      this._transfer(p.id, d.to, d.amount);
      this.log(`${p.name} betaler ${this.fmt(d.amount)} til ${this._creditorName(d.to)}.`);
      s.debts.shift();
      this._continue();
      return this._ok();
    }

    declareBankruptcy() {
      const s = this.s;
      if (s.phase !== 'debt') return this._fail('Du kan bare gå konkurs når du skylder penger.');
      const d = s.debts[0];
      const p = this.player(d.debtor);
      const creditor = typeof d.to === 'number' ? d.to : null;

      // Selg alle bygninger til banken
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
        p.jailCards.forEach((jc) => { if (s.decks[jc.deck]) s.decks[jc.deck].order.push(jc.card); });
        this.log(`${p.name} går konkurs! Eiendommene går tilbake til banken.`);
      }
      p.money = 0;
      p.jailCards = [];
      p.bankrupt = true;
      p.inJail = false;

      s.debts = s.debts.filter((x) => x.debtor !== p.id);
      s.debts.forEach((x) => { if (x.to === p.id) x.to = null; });
      if (s.auction) {
        s.auction.participants = s.auction.participants.filter((id) => id !== p.id);
      }

      if (this._checkGameOver()) return this._ok();
      this._continue();
      return this._ok();
    }

    /** Avslutt spillet nå – spilleren med høyest formue vinner. */
    endByNetWorth() {
      if (this.s.phase === 'gameover') return this._fail('Spillet er allerede ferdig.');
      const ranked = this.activePlayers().sort((a, b) => this.netWorth(b.id) - this.netWorth(a.id));
      this.s.phase = 'gameover';
      this.s.winner = ranked[0].id;
      this.s.auction = null;
      this.s.debts = [];
      this.log(`Spillet avsluttes. 🏆 ${ranked[0].name} vinner med en formue på ${this.fmt(this.netWorth(ranked[0].id))}!`);
      return this._ok();
    }

    // ---------------------------------------------------------------- handel

    /**
     * offer = { from, to, giveMoney, getMoney, giveProps: [felt], getProps: [felt],
     *           giveCards: antall, getCards: antall }
     */
    validateTrade(offer) {
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
      for (const i of gp) {
        if (!s.props[i] || s.props[i].owner !== a.id) return `${a.name} eier ikke ${s.board[i].name}.`;
      }
      for (const i of rp) {
        if (!s.props[i] || s.props[i].owner !== b.id) return `${b.name} eier ikke ${s.board[i].name}.`;
      }
      for (const i of gp.concat(rp)) {
        const sq = s.board[i];
        if (sq.type === 'property' && this.groupHasBuildings(sq.group)) return `Selg bygningene i fargegruppen til ${sq.name} før du handler.`;
      }
      if (gc > a.jailCards.length) return `${a.name} har ikke så mange fengselskort.`;
      if (rc > b.jailCards.length) return `${b.name} har ikke så mange fengselskort.`;
      const feeA = this._mortgageFee(rp), feeB = this._mortgageFee(gp);
      if (a.money - gm + rm - feeA < 0) return `${a.name} har ikke råd til handelen.`;
      if (b.money - rm + gm - feeB < 0) return `${b.name} har ikke råd til handelen.`;
      return null;
    }

    _mortgageFee(list) {
      return list.reduce((sum, i) => sum + (this.s.props[i].mortgaged ? Math.ceil(this.mortgageValue(i) * this.s.rules.mortgageInterest) : 0), 0);
    }

    executeTrade(offer) {
      const err = this.validateTrade(offer);
      if (err) return this._fail(err);
      const s = this.s, a = this.player(offer.from), b = this.player(offer.to);
      const gp = offer.giveProps || [], rp = offer.getProps || [];
      const feeA = this._mortgageFee(rp), feeB = this._mortgageFee(gp);
      a.money += (offer.getMoney || 0) - (offer.giveMoney || 0) - feeA;
      b.money += (offer.giveMoney || 0) - (offer.getMoney || 0) - feeB;
      gp.forEach((i) => { s.props[i].owner = b.id; });
      rp.forEach((i) => { s.props[i].owner = a.id; });
      for (let k = 0; k < (offer.giveCards || 0); k++) b.jailCards.push(a.jailCards.shift());
      for (let k = 0; k < (offer.getCards || 0); k++) a.jailCards.push(b.jailCards.shift());
      this.log(`🤝 Handel mellom ${a.name} og ${b.name}: ${this.describeTrade(offer)}`);
      if (feeA) this.log(`${a.name} betaler ${this.fmt(feeA)} i renter for pantsatte eiendommer.`);
      if (feeB) this.log(`${b.name} betaler ${this.fmt(feeB)} i renter for pantsatte eiendommer.`);
      return this._ok();
    }

    describeTrade(offer) {
      const s = this.s;
      const side = (money, props, cards) => {
        const parts = props.map((i) => s.board[i].name);
        if (money) parts.push(this.fmt(money));
        if (cards) parts.push(`${cards} fengselskort`);
        return parts.length ? parts.join(', ') : 'ingenting';
      };
      const a = this.player(offer.from), b = this.player(offer.to);
      return `${a.name} gir ${side(offer.giveMoney, offer.giveProps || [], offer.giveCards)} – ${b.name} gir ${side(offer.getMoney, offer.getProps || [], offer.getCards)}.`;
    }
  }

  return { Game, DEFAULT_RULES, validateTheme, BUYABLE };
});
