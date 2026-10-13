import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/engine';
import theme from '../src/themes/norgesreisen';
import type { Rules } from '../src/game/types';

const newGame = (n = 2, rules?: Partial<Rules>) =>
  Game.create(theme, Array.from({ length: n }, (_, i) => ({ name: `P${i}`, color: '#f00', token: 'pawn', isAI: false })), rules, () => 0.5);

const skipBuy = (g: Game) => {
  if (g.s.phase === 'buy') g.declineBuy();
  while (g.s.phase === 'auction') g.auctionPass(g.actingPlayerId()!);
};

describe('regler', () => {
  it('kjøp av eiendom og leie', () => {
    const g = newGame();
    g.roll([1, 2]);
    expect(g.s.phase).toBe('buy');
    g.buy();
    expect(g.s.props[3].owner).toBe(0);
    expect(g.player(0).money).toBe(1440);
    g.endTurn();
    g.roll([1, 2]);
    expect(g.player(1).money).toBe(1496);
    expect(g.player(0).money).toBe(1444);
  });

  it('dobbel leie med hele gruppen, jevn bygging og hus', () => {
    const g = newGame();
    g.s.props[1].owner = 0; g.s.props[3].owner = 0;
    expect(g.calcRent(3, 7)).toBe(8);
    expect(g.build(0, 1).ok).toBe(true);
    expect(g.build(0, 1).ok).toBe(false);
    expect(g.build(0, 3).ok).toBe(true);
    expect(g.calcRent(3, 7)).toBe(20);
    expect(g.s.houses).toBe(30);
    expect(g.mortgage(0, 1).ok).toBe(false);
  });

  it('hotell bytter ut fire hus', () => {
    const g = newGame();
    g.s.props[1].owner = 0; g.s.props[3].owner = 0;
    g.player(0).money = 10000;
    for (let k = 0; k < 4; k++) { g.build(0, 1); g.build(0, 3); }
    expect(g.build(0, 1).ok).toBe(true);
    expect(g.s.props[1].houses).toBe(5);
    expect(g.s.houses).toBe(28);
    expect(g.s.hotels).toBe(11);
  });

  it('tre doble på rad gir fengsel', () => {
    const g = newGame();
    g.roll([1, 1]); skipBuy(g);
    g.roll([2, 2]); skipBuy(g);
    g.roll([3, 3]);
    expect(g.player(0).inJail).toBe(true);
    expect(g.player(0).position).toBe(10);
    expect(g.s.phase).toBe('end');
  });

  it('må betale bot etter tre mislykte fengselsforsøk', () => {
    const g = newGame();
    g.player(0).position = 30;
    g.roll([0, 0] as unknown as [number, number]); // flytter 0 – lander på «Gå i fengsel»
    const p = g.player(0);
    expect(p.inJail).toBe(true);
    g.endTurn();
    const other = () => { g.roll([2, 4]); skipBuy(g); g.endTurn(); };
    other();
    g.roll([1, 2]); g.endTurn(); other();
    g.roll([1, 2]); g.endTurn(); other();
    g.roll([1, 3]);
    expect(p.inJail).toBe(false);
    expect(p.position).toBe(14);
  });

  it('passerer Start og får lønn', () => {
    const g = newGame();
    g.player(0).position = 37;
    g.roll([1, 3]);
    expect(g.player(0).position).toBe(1);
    expect(g.player(0).money).toBe(1700);
    expect(g.s.events.some((e) => e.type === 'money' && e.reason === 'lønn')).toBe(true);
  });

  it('auksjon selger til høyeste bud', () => {
    const g = newGame(3);
    g.roll([1, 2]);
    g.declineBuy();
    expect(g.actingPlayerId()).toBe(1);
    g.auctionBid(1, 30);
    g.auctionBid(2, 40);
    g.auctionPass(0);
    g.auctionPass(1);
    expect(g.s.props[3].owner).toBe(2);
    expect(g.player(2).money).toBe(1460);
  });

  it('konkurs til en annen spiller overfører alt', () => {
    const g = newGame(3);
    g.s.props[39].owner = 1; g.s.props[37].owner = 1;
    g.player(1).money = 100000;
    for (let k = 0; k < 5; k++) { g.build(1, 37); g.build(1, 39); }
    g.s.props[1].owner = 0;
    g.player(0).money = 10;
    g.player(0).position = 35;
    g.roll([2, 2]);
    expect(g.s.phase).toBe('debt');
    expect(g.payDebt().ok).toBe(false);
    g.declareBankruptcy();
    expect(g.player(0).bankrupt).toBe(true);
    expect(g.s.props[1].owner).toBe(1);
    expect(g.s.current).toBe(1);
  });

  it('pantsatt eiendom gir ingen leie, og handel krever rente', () => {
    const g = newGame();
    g.s.props[3].owner = 1;
    g.mortgage(1, 3);
    g.roll([1, 2]);
    expect(g.player(0).money).toBe(1500);
    const offer = { from: 0, to: 1, giveMoney: 50, getProps: [3] };
    expect(g.validateTrade(offer)).toBeNull();
    g.executeTrade(offer);
    expect(g.s.props[3].owner).toBe(0);
    expect(g.player(0).money).toBe(1447);
  });

  it('gratis parkering-pott', () => {
    const g = newGame(2, { freeParkingJackpot: true });
    g.roll([2, 2]);
    expect(g.s.pot).toBe(200);
  });

  it('melder fra om komplett fargegruppe', () => {
    const g = newGame();
    g.s.props[1].owner = 0;
    g.roll([1, 2]);
    g.buy();
    expect(g.s.events.some((e) => e.type === 'monopoly' && e.player === 0 && e.group === 'brun')).toBe(true);
  });

  it('turgrense avslutter spillet', () => {
    const g = newGame(2, { turnLimit: 2 });
    g.roll([1, 2]); skipBuy(g); g.endTurn();
    g.roll([1, 2]); skipBuy(g); g.endTurn();
    expect(g.s.phase).toBe('gameover');
  });

  it('startende eiendommer deles ut uten komplette grupper som hendelse', () => {
    const g = newGame(4, { startingProperties: 3 });
    expect(g.ownedBy(0).length).toBe(3);
    expect(g.s.events.filter((e) => e.type === 'monopoly').length).toBe(0);
  });

  it('lagre og laste inn gir samme tilstand', () => {
    const g = newGame(3);
    g.roll([3, 4]);
    expect(Game.load(g.serialize()).s).toEqual(g.s);
  });
});
