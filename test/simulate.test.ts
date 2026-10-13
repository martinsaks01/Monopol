/* Simulerer mange AI-mot-AI-spill og sjekker at regnskapet alltid stemmer. */
import { expect, it } from 'vitest';
import { Game } from '../src/game/engine';
import * as AI from '../src/game/ai';
import theme from '../src/themes/norgesreisen';

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function check(game: Game) {
  const s = game.s;
  s.players.forEach((p) => { if (!p.bankrupt) expect(p.money).toBeGreaterThanOrEqual(0); });
  let houses = 0, hotels = 0;
  Object.entries(s.props).forEach(([i, pr]) => {
    if (pr.houses === 5) hotels++; else houses += pr.houses;
    if (pr.owner !== null) expect(s.players[pr.owner].bankrupt).toBe(false);
    if (pr.houses > 0) {
      expect(pr.mortgaged).toBe(false);
      expect(game.ownsGroup(pr.owner!, s.board[Number(i)].group!)).toBe(true);
    }
  });
  expect(houses + s.houses).toBe(s.rules.houses);
  expect(hotels + s.hotels).toBe(s.rules.hotels);
  Object.entries(s.decks).forEach(([id, d]) => {
    const held = s.players.reduce((n, p) => n + p.jailCards.filter((c) => c.deck === id).length, 0);
    expect(d.order.length + held).toBe(d.cards.length);
  });
}

it('100 AI-spill holder alle regler', () => {
  let finished = 0;
  for (let g = 0; g < 100; g++) {
    const rng = mulberry32(1000 + g);
    const n = 2 + (g % 5);
    const players = Array.from({ length: n }, (_, i) => ({ name: `AI${i}`, color: '#000', token: 'pawn', isAI: true }));
    const game = Game.create(theme, players, { freeParkingJackpot: g % 2 === 0, startingProperties: g % 3 === 0 ? 2 : 0 }, rng);
    let steps = 0;
    while (game.s.phase !== 'gameover' && game.s.turn < 1500 && steps++ < 200000) {
      const r = AI.step(game);
      if (!r) throw new Error('AI gjorde ingenting i fase ' + game.s.phase);
      if (r.type === 'roll') game.roll();
      if (r.type === 'proposeTrade' && AI.evaluateTrade(game, r.offer, r.offer.to).accept) {
        expect(game.executeTrade(r.offer).ok).toBe(true);
      }
      if (steps % 7 === 0) check(game);
    }
    check(game);
    if (game.s.phase === 'gameover') finished++;
  }
  expect(finished).toBeGreaterThan(90);
}, 120000);
