/* Små gjenbrukbare grensesnittbiter. */
import { useEffect, useRef, useState } from 'react';
import type { Game } from '../game/engine';
import { tokenIcon } from '../progress/cosmetics';
import { squareIcon } from '../scene/textures';

/** Tall som teller seg opp/ned til ny verdi (for penger). */
export function useAnimatedNumber(value: number, ms = 600) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / ms);
      const e = 1 - Math.pow(1 - t, 3);
      const v = Math.round(a + (value - a) * e);
      setShown(v);
      from.current = v;
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

export function Money({ value, currency = 'kr' }: { value: number; currency?: string }) {
  const v = useAnimatedNumber(value);
  return <span className="money">{v.toLocaleString('nb-NO')} {currency}</span>;
}

export function TokenBadge({ token, color, size = 34 }: { token: string; color: string; size?: number }) {
  return (
    <span className="token-badge" style={{ background: color, width: size, height: size, fontSize: size * 0.55 }}>
      {tokenIcon(token)}
    </span>
  );
}

export function textOn(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#000';
  const v = parseInt(m[1], 16);
  const lum = 0.299 * (v >> 16) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255);
  return lum > 150 ? '#111' : '#fff';
}

/** Skjøte / eiendomskort. */
export function DeedCard({ game, i, compact }: { game: Game; i: number; compact?: boolean }) {
  const s = game.s, sq = s.board[i], pr = s.props[i];
  const fmt = (n: number) => game.fmt(n);
  if (!pr) {
    let desc = '';
    if (sq.type === 'tax') desc = `Betal ${fmt(sq.amount || 0)}.`;
    else if (sq.type === 'card') desc = `Trekk et kort fra «${s.decks[sq.deck!]?.name}».`;
    else if (sq.type === 'start') desc = `Motta ${fmt(s.rules.goSalary)} hver gang du passerer.`;
    else if (sq.type === 'jail') desc = `Bare på besøk – eller sitt inne. Betal ${fmt(s.rules.jailFine)}, bruk et kort eller slå dobbel for å komme ut.`;
    else if (sq.type === 'gotojail') desc = 'Gå direkte i fengsel. Du passerer ikke Start.';
    else if (sq.type === 'parking') desc = s.rules.freeParkingJackpot ? `Vinn potten (nå ${fmt(s.pot)}).` : 'Ta en pause. Ingenting skjer.';
    return (
      <div className="deed">
        <div className="deed-head plain"><div className="deed-icon">{squareIcon(sq, s)}</div><b>{sq.name}</b></div>
        <p className="deed-desc">{desc}</p>
      </div>
    );
  }
  const owner = pr.owner !== null ? game.player(pr.owner) : null;
  let head: React.ReactNode;
  let rows: [string, string, boolean][] = [];
  if (sq.type === 'property' && sq.group) {
    const g = game.group(sq.group);
    head = <div className="deed-head" style={{ background: g.color, color: textOn(g.color) }}><small>Skjøte</small><b>{sq.name}</b></div>;
    const mono = owner !== null && game.ownsGroup(owner.id, sq.group);
    const labels = ['Leie', 'Med 1 hus', 'Med 2 hus', 'Med 3 hus', 'Med 4 hus', 'Med hotell'];
    sq.rent!.forEach((r, k) => {
      rows.push([labels[k], fmt(r), !!owner && !pr.mortgaged && pr.houses === k && !(k === 0 && mono)]);
      if (k === 0) rows.push(['Hele fargegruppen', fmt(r * s.rules.monopolyRentMultiplier), mono && pr.houses === 0 && !pr.mortgaged]);
    });
    if (!compact) rows.push(['Hus / hotell koster', fmt(game.houseCost(i)), false]);
  } else if (sq.type === 'station') {
    head = <div className="deed-head plain"><div className="deed-icon">{squareIcon(sq, s)}</div><b>{sq.name}</b></div>;
    const table = sq.rent || s.rules.stationRent;
    const cnt = owner ? game.countOwnedOfType(owner.id, 'station') : 0;
    rows = table.map((r, k) => [`Eier ${k + 1} stasjon${k ? 'er' : ''}`, fmt(r), cnt === k + 1 && !pr.mortgaged]);
  } else {
    head = <div className="deed-head plain"><div className="deed-icon">{squareIcon(sq, s)}</div><b>{sq.name}</b></div>;
    const table = sq.rent || s.rules.utilityMultipliers;
    const cnt = owner ? game.countOwnedOfType(owner.id, 'utility') : 0;
    rows = table.map((r, k) => [`Eier ${k + 1} verk`, `${r} × terningene`, cnt === k + 1 && !pr.mortgaged]);
  }
  return (
    <div className={`deed${compact ? ' compact' : ''}`}>
      {head}
      <table>
        <tbody>
          {rows.map(([a, b, cur], k) => <tr key={k} className={cur ? 'cur' : ''}><td>{a}</td><td>{b}</td></tr>)}
        </tbody>
      </table>
      {!compact && (
        <div className="deed-foot">
          Pris {fmt(sq.price || 0)} · Pant {fmt(game.mortgageValue(i))} · Innløsning {fmt(game.unmortgageCost(i))}
        </div>
      )}
      <div className="deed-owner">
        {owner ? <>Eier: {tokenIcon(owner.token)} {owner.name}{pr.mortgaged && <span className="warn"> · pantsatt</span>}{pr.houses > 0 && ` · ${pr.houses === 5 ? 'hotell' : `${pr.houses} hus`}`}</> : 'Til salgs hos banken'}
      </div>
    </div>
  );
}

export function groupColorOf(game: Game, i: number) {
  const sq = game.s.board[i];
  return sq.type === 'property' && sq.group ? game.group(sq.group)?.color || '#999' : '#cfd4dc';
}
