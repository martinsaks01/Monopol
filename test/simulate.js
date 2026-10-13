/*
 * Simulerer mange spill mellom datamotstandere og sjekker at reglene holder.
 * Kjør: node test/simulate.js [antall spill]
 */
'use strict';
const { Game } = require('../js/engine.js');
const AI = require('../js/ai.js');
const theme = require('../themes/standard.js');

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function check(game, where) {
  const s = game.s;
  const fail = (m) => { throw new Error(`${where}: ${m}\nFase: ${s.phase}\nSiste logg:\n${s.log.slice(-15).map((l) => l.msg).join('\n')}`); };
  s.players.forEach((p) => {
    if (!p.bankrupt && p.money < 0) fail(`${p.name} har negativ saldo ${p.money}`);
    if (p.position < 0 || p.position >= s.board.length) fail('ugyldig posisjon');
  });
  let houses = 0, hotels = 0;
  Object.entries(s.props).forEach(([i, pr]) => {
    if (pr.houses === 5) hotels++; else houses += pr.houses;
    if (pr.owner !== null && s.players[pr.owner].bankrupt) fail(`konkurs spiller eier felt ${i}`);
    if (pr.houses > 0 && pr.mortgaged) fail('pantsatt eiendom med hus');
    if (pr.houses > 0 && !game.ownsGroup(pr.owner, s.board[i].group)) fail('hus uten komplett gruppe');
  });
  if (houses + s.houses !== s.rules.houses) fail(`husregnskap stemmer ikke (${houses} + ${s.houses})`);
  if (hotels + s.hotels !== s.rules.hotels) fail('hotellregnskap stemmer ikke');
  Object.entries(s.decks).forEach(([id, d]) => {
    const held = s.players.reduce((n, p) => n + p.jailCards.filter((c) => c.deck === id).length, 0);
    if (d.order.length + held !== d.cards.length) fail(`kortstokk ${id} har feil antall kort`);
  });
  if (s.phase === 'debt' && !s.debts.length) fail('gjeldsfase uten gjeld');
}

const games = Number(process.argv[2] || 300);
let finished = 0, totalTurns = 0, trades = 0, auctions = 0;
for (let g = 0; g < games; g++) {
  const rng = mulberry32(1000 + g);
  const nPlayers = 2 + (g % 5);
  const players = Array.from({ length: nPlayers }, (_, i) => ({ name: `AI${i + 1}`, isAI: true }));
  const rules = { freeParkingJackpot: g % 2 === 0, doubleSalaryOnGo: g % 3 === 0, auctions: g % 4 !== 3 };
  const game = Game.create(theme, players, rules, rng);
  let steps = 0;
  while (game.s.phase !== 'gameover' && game.s.turn < 1500 && steps < 200000) {
    steps++;
    const before = game.s.phase;
    const r = AI.step(game);
    if (!r) throw new Error('AI gjorde ingenting i fase ' + before);
    if (r.type === 'proposeTrade') {
      const ev = AI.evaluateTrade(game, r.offer, r.offer.to);
      if (ev.accept) { const res = game.executeTrade(r.offer); if (!res.ok) throw new Error(res.error); trades++; }
    }
    if (r.type === 'bid' && before === 'auction') auctions++;
    check(game, `spill ${g} steg ${steps}`);
  }
  if (game.s.phase === 'gameover') finished++;
  totalTurns += game.s.turn;
}
console.log(`${games} spill simulert. ${finished} ble spilt ferdig (resten nådde turgrensen).`);
console.log(`Snitt ${Math.round(totalTurns / games)} turer per spill, ${trades} handler, ${auctions} auksjonsbud.`);
console.log('Alle invarianter holdt ✔');
