/*
 * Målrettede tester av spillreglene. Kjør: node test/rules.test.js
 */
'use strict';
const assert = require('node:assert/strict');
const { Game } = require('../js/engine.js');
const theme = require('../themes/standard.js');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const newGame = (n = 2, rules) => Game.create(theme, Array.from({ length: n }, (_, i) => ({ name: `P${i}` })), rules, () => 0.5);

test('kjøp av eiendom og leie', () => {
  const g = newGame();
  g.roll([1, 2]); // P0 til felt 3 (Hammerfest)
  assert.equal(g.s.phase, 'buy');
  g.buy();
  assert.equal(g.s.props[3].owner, 0);
  assert.equal(g.player(0).money, 1500 - 60);
  g.endTurn();
  g.roll([1, 2]); // P1 lander på Hammerfest
  assert.equal(g.player(1).money, 1500 - 4);
  assert.equal(g.player(0).money, 1440 + 4);
});

test('dobbel leie med hele fargegruppen, og hus', () => {
  const g = newGame();
  g.s.props[1].owner = 0; g.s.props[3].owner = 0;
  assert.equal(g.calcRent(3, 7), 8);
  assert.ok(g.build(0, 1).ok);
  assert.ok(!g.build(0, 1).ok, 'jevn bygging skal hindre to hus på samme felt');
  assert.ok(g.build(0, 3).ok);
  assert.equal(g.calcRent(3, 7), 20);
  assert.equal(g.s.houses, 30);
  assert.ok(!g.mortgage(0, 1).ok, 'kan ikke pantsette med hus i gruppen');
});

test('hotell bytter ut fire hus', () => {
  const g = newGame();
  g.s.props[1].owner = 0; g.s.props[3].owner = 0;
  g.player(0).money = 10000;
  for (let k = 0; k < 4; k++) { g.build(0, 1); g.build(0, 3); }
  assert.equal(g.s.houses, 24);
  assert.ok(g.build(0, 1).ok);
  assert.equal(g.s.props[1].houses, 5);
  assert.equal(g.s.houses, 28);
  assert.equal(g.s.hotels, 11);
});

test('tre doble på rad sender deg i fengsel', () => {
  const g = newGame();
  g.roll([1, 1]); if (g.s.phase === 'buy') g.declineBuy(); while (g.s.phase === 'auction') g.auctionPass(g.actingPlayerId());
  g.roll([2, 2]); if (g.s.phase === 'buy') g.declineBuy(); while (g.s.phase === 'auction') g.auctionPass(g.actingPlayerId());
  g.roll([3, 3]);
  assert.equal(g.player(0).inJail, true);
  assert.equal(g.player(0).position, 10);
  assert.equal(g.s.phase, 'end');
});

test('må betale bot etter tre mislykte fengselsforsøk', () => {
  const g = newGame();
  const p = g.player(0);
  g._sendToJail(p);
  const other = () => { g.roll([2, 4]); if (g.s.phase === 'buy') g.buy(); g.endTurn(); };
  g.roll([1, 2]); g.endTurn(); other();
  g.roll([1, 2]); g.endTurn(); other();
  g.roll([1, 3]);
  assert.equal(p.inJail, false);
  assert.equal(p.money, 1500 - 50);
  assert.equal(p.position, 14);
});

test('passerer Start og får lønn', () => {
  const g = newGame();
  g.player(0).position = 37;
  g.roll([1, 3]);
  assert.equal(g.player(0).position, 1);
  assert.equal(g.player(0).money, 1700);
});

test('auksjon selger til høyeste bud', () => {
  const g = newGame(3);
  g.roll([1, 2]);
  g.declineBuy();
  assert.equal(g.s.phase, 'auction');
  assert.equal(g.actingPlayerId(), 1);
  g.auctionBid(1, 30);
  g.auctionBid(2, 40);
  g.auctionPass(0);
  g.auctionPass(1);
  assert.equal(g.s.props[3].owner, 2);
  assert.equal(g.player(2).money, 1460);
});

test('konkurs til en annen spiller overfører alt', () => {
  const g = newGame(3);
  g.s.props[39].owner = 1; g.s.props[37].owner = 1;
  g.player(1).money = 100000;
  for (let k = 0; k < 5; k++) { g.build(1, 37); g.build(1, 39); }
  g.s.props[1].owner = 0;
  g.player(0).money = 10;
  g.player(0).position = 35;
  g.roll([2, 2]); // til Oslo (39) med hotell: 2000
  assert.equal(g.s.phase, 'debt');
  assert.ok(!g.payDebt().ok);
  g.declareBankruptcy();
  assert.equal(g.player(0).bankrupt, true);
  assert.equal(g.s.props[1].owner, 1);
  assert.equal(g.s.phase === 'roll' && g.s.current === 1, true);
});

test('pantsatt eiendom gir ingen leie, og handel krever rente', () => {
  const g = newGame();
  g.s.props[3].owner = 1;
  g.mortgage(1, 3);
  assert.equal(g.player(1).money, 1530);
  g.roll([1, 2]);
  assert.equal(g.player(0).money, 1500);
  const offer = { from: 0, to: 1, giveMoney: 50, getProps: [3] };
  assert.equal(g.validateTrade(offer), null);
  g.executeTrade(offer);
  assert.equal(g.s.props[3].owner, 0);
  assert.equal(g.player(0).money, 1500 - 50 - 3);
});

test('gratis parkering-pott', () => {
  const g = newGame(2, { freeParkingJackpot: true });
  g.roll([2, 2]); // inntektsskatt 200 til potten
  assert.equal(g.s.pot, 200);
  g.player(0).position = 15;
  g.s.phase = 'roll';
  g.roll([2, 3]);
  assert.equal(g.s.pot, 0);
});

test('lagre og laste inn gir samme tilstand', () => {
  const g = newGame(3);
  g.roll([3, 4]);
  const g2 = Game.load(g.serialize());
  assert.deepEqual(g2.s, g.s);
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log(`✔ ${t.name}`); } catch (e) { failed++; console.log(`✘ ${t.name}\n   ${e.message}`); }
}
console.log(`\n${tests.length - failed}/${tests.length} tester bestått.`);
process.exit(failed ? 1 : 0);
