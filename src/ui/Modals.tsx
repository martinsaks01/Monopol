/* Dialogvinduer: skjøte, eiendommer, handel, meny, resultater, regler og logg. */
import { useMemo, useState } from 'react';
import type { Game } from '../game/engine';
import type { TradeOffer } from '../game/types';
import { useStore } from '../store/store';
import { act, answerTrade, closeModal, exportGame, leaveGame, openModal, proposeTrade, updateSettings } from '../store/director';
import { downloadText } from '../themes/custom';
import { DeedCard, TokenBadge, groupColorOf } from './common';

function useGame() {
  const game = useStore((st) => st.game);
  useStore((st) => st.v);
  return game as Game;
}

function Shell({ title, children, wide, noClose }: { title?: React.ReactNode; children: React.ReactNode; wide?: boolean; noClose?: boolean }) {
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (!noClose && e.target === e.currentTarget) closeModal(); }}>
      <div className={`modal${wide ? ' wide' : ''}`}>
        {!noClose && <button className="modal-close" onClick={closeModal}>✕</button>}
        {title && <h2>{title}</h2>}
        {children}
      </div>
    </div>
  );
}

/** Knapper for bygging og pantsetting av én eiendom. */
function PropertyButtons({ game, pid, i }: { game: Game; pid: number; i: number }) {
  const s = game.s, sq = s.board[i], pr = s.props[i];
  const btns: React.ReactNode[] = [];
  if (sq.type === 'property' && sq.group && game.ownsGroup(pid, sq.group)) {
    const be = game.canBuild(pid, i);
    btns.push(
      <button key="b" className="btn green small" disabled={!!be} title={be || ''} onClick={() => act((g) => g.build(pid, i))}>
        + {pr.houses === 4 ? 'Hotell' : 'Hus'} ({game.fmt(game.houseCost(i))})
      </button>,
    );
    if (pr.houses > 0) {
      const se = game.canSellBuilding(pid, i);
      btns.push(
        <button key="s" className="btn small" disabled={!!se} title={se || ''} onClick={() => act((g) => g.sellBuilding(pid, i))}>
          − Selg (+{game.fmt(game.buildingSellValue(i))})
        </button>,
      );
    }
  }
  if (pr.mortgaged) {
    const ue = game.canUnmortgage(pid, i);
    btns.push(<button key="u" className="btn blue small" disabled={!!ue} title={ue || ''} onClick={() => act((g) => g.unmortgage(pid, i))}>Innløs (−{game.fmt(game.unmortgageCost(i))})</button>);
  } else {
    const me = game.canMortgage(pid, i);
    btns.push(<button key="m" className="btn small" disabled={!!me} title={me || ''} onClick={() => act((g) => g.mortgage(pid, i))}>Pantsett (+{game.fmt(game.mortgageValue(i))})</button>);
  }
  return <>{btns}</>;
}

/** Hvem som får administrere en spillers eiendommer nå (bare mennesker, på sin tur eller ved gjeld). */
function canManage(game: Game, pid: number) {
  const p = game.player(pid);
  if (p.isAI || p.bankrupt || game.s.phase === 'gameover') return false;
  const acting = game.actingPlayerId();
  return acting === pid || game.s.current === pid;
}

function DeedModal({ i }: { i: number }) {
  const game = useGame();
  const pr = game.s.props[i];
  const owner = pr?.owner ?? null;
  return (
    <Shell>
      <DeedCard game={game} i={i} />
      {owner !== null && canManage(game, owner) && (
        <div className="modal-actions center"><PropertyButtons game={game} pid={owner} i={i} /></div>
      )}
    </Shell>
  );
}

function ManageModal({ pid }: { pid: number }) {
  const game = useGame();
  const s = game.s, p = game.player(pid);
  const owned = game.ownedBy(pid).sort((a, b) => a - b);
  const groups = new Map<string, number[]>();
  owned.forEach((i) => {
    const sq = s.board[i];
    const key = sq.type === 'property' ? sq.group! : sq.type;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(i);
  });
  const manage = canManage(game, pid);
  return (
    <Shell title={<><TokenBadge token={p.token} color={p.color} /> {p.name}</>} wide>
      <p className="muted">
        Kontanter <b>{game.fmt(p.money)}</b> · Formue {game.fmt(game.netWorth(pid))} · Hus i banken {s.houses} · Hoteller {s.hotels}
      </p>
      {!owned.length && <p>Ingen eiendommer ennå.</p>}
      {[...groups.entries()].map(([key, list]) => {
        const g = game.group(key);
        const title = g ? `${g.name}${game.ownsGroup(pid, key) ? ' ⭐ hele gruppen' : ` (${list.length}/${game.groupSquares(key).length})`}`
          : key === 'station' ? 'Stasjoner' : key === 'utility' ? 'Verk' : key;
        return (
          <div className="manage-group" key={key}>
            <h4><span className="swatch" style={{ background: g?.color || '#cfd4dc' }} />{title}</h4>
            {list.map((i) => {
              const pr = s.props[i];
              const status = [pr.houses === 5 ? 'Hotell' : pr.houses ? `${pr.houses} hus` : '', pr.mortgaged ? 'Pantsatt' : `Leie ${game.fmt(game.calcRent(i, 7))}`].filter(Boolean).join(' · ');
              return (
                <div className="manage-row" key={i}>
                  <span className="nm" onClick={() => openModal({ kind: 'deed', square: i })}>{s.board[i].name}</span>
                  <span className="st">{status}</span>
                  {manage && <span className="btns"><PropertyButtons game={game} pid={pid} i={i} /></span>}
                </div>
              );
            })}
          </div>
        );
      })}
      {!manage && owned.length > 0 && <p className="muted small">Du kan bare endre eiendommer på din egen tur.</p>}
    </Shell>
  );
}

function TradeModal({ from, to }: { from: number; to?: number }) {
  const game = useGame();
  const s = game.s;
  const others = game.activePlayers().filter((p) => p.id !== from);
  const [partner, setPartner] = useState(to ?? others[0]?.id);
  const [give, setGive] = useState<number[]>([]);
  const [get, setGet] = useState<number[]>([]);
  const [giveMoney, setGiveMoney] = useState(0);
  const [getMoney, setGetMoney] = useState(0);
  const [giveCards, setGiveCards] = useState(0);
  const [getCards, setGetCards] = useState(0);
  const [error, setError] = useState('');
  if (partner === undefined) return <Shell title="Handel"><p>Ingen å handle med.</p></Shell>;
  const a = game.player(from), b = game.player(partner);

  const list = (pid: number, chosen: number[], setChosen: (v: number[]) => void) => {
    const owned = game.ownedBy(pid).sort((x, y) => x - y);
    if (!owned.length) return <div className="muted small">Ingen eiendommer.</div>;
    return owned.map((i) => {
      const sq = s.board[i];
      const blocked = sq.type === 'property' && !!sq.group && game.groupHasBuildings(sq.group);
      const on = chosen.includes(i);
      return (
        <label key={i} className={`trade-item${blocked ? ' disabled' : ''}${on ? ' on' : ''}`} title={blocked ? 'Selg bygningene i gruppen først' : ''}>
          <input type="checkbox" disabled={blocked} checked={on} onChange={() => setChosen(on ? chosen.filter((x) => x !== i) : [...chosen, i])} />
          <span className="swatch" style={{ background: groupColorOf(game, i) }} />
          <span className="trade-name">{sq.name}</span>
          <span className="muted small">{game.fmt(sq.price || 0)}{s.props[i].mortgaged ? ' · pant' : ''}</span>
        </label>
      );
    });
  };

  const submit = () => {
    const offer: TradeOffer = { from, to: partner, giveProps: give, getProps: get, giveMoney, getMoney, giveCards, getCards };
    const err = proposeTrade(offer);
    setError(err || '');
  };

  return (
    <Shell title="🤝 Handel" wide>
      <div className="trade-partner">
        Handle med:
        {others.map((o) => (
          <button key={o.id} className={`chip-btn${o.id === partner ? ' on' : ''}`} onClick={() => { setPartner(o.id); setGet([]); setGetMoney(0); setGetCards(0); setError(''); }}>
            <TokenBadge token={o.token} color={o.color} size={22} /> {o.name}{o.isAI ? ' 🤖' : ''}
          </button>
        ))}
      </div>
      <div className="trade-cols">
        <div className="trade-col">
          <h3>{a.name} gir</h3>
          <div className="trade-list">{list(a.id, give, setGive)}</div>
          <label className="trade-field">Penger <input type="number" min={0} max={a.money} step={10} value={giveMoney} onChange={(e) => setGiveMoney(Math.max(0, Number(e.target.value) || 0))} /></label>
          {a.jailCards.length > 0 && <label className="trade-field">Fengselskort <input type="number" min={0} max={a.jailCards.length} value={giveCards} onChange={(e) => setGiveCards(Number(e.target.value) || 0)} /></label>}
        </div>
        <div className="trade-col">
          <h3>{b.name} gir</h3>
          <div className="trade-list">{list(b.id, get, setGet)}</div>
          <label className="trade-field">Penger <input type="number" min={0} max={b.money} step={10} value={getMoney} onChange={(e) => setGetMoney(Math.max(0, Number(e.target.value) || 0))} /></label>
          {b.jailCards.length > 0 && <label className="trade-field">Fengselskort <input type="number" min={0} max={b.jailCards.length} value={getCards} onChange={(e) => setGetCards(Number(e.target.value) || 0)} /></label>}
        </div>
      </div>
      <div className="error">{error}</div>
      <div className="modal-actions">
        <button className="btn" onClick={closeModal}>Avbryt</button>
        <button className="btn primary" onClick={submit}>Foreslå handel</button>
      </div>
    </Shell>
  );
}

function TradeAskModal({ offer, fromAI }: { offer: TradeOffer; fromAI: boolean }) {
  const game = useGame();
  const s = game.s;
  const a = game.player(offer.from), b = game.player(offer.to);
  const side = (money = 0, props: number[] = [], cards = 0) => {
    const parts = props.map((i) => (
      <li key={i}><span className="swatch" style={{ background: groupColorOf(game, i) }} />{s.board[i].name}{s.props[i].mortgaged ? ' (pantsatt)' : ''}</li>
    ));
    if (money) parts.push(<li key="m">💰 {game.fmt(money)}</li>);
    if (cards) parts.push(<li key="c">🎫 {cards} fengselskort</li>);
    return parts.length ? <ul className="trade-summary-list">{parts}</ul> : <p className="muted">ingenting</p>;
  };
  return (
    <Shell title="🤝 Handelsforslag" noClose>
      <p><b>{b.name}</b>, {a.name} foreslår en handel{fromAI ? '' : ` – gi skjermen til ${b.name}`}:</p>
      <div className="trade-cols">
        <div className="trade-col"><h3>Du får</h3>{side(offer.giveMoney, offer.giveProps, offer.giveCards)}</div>
        <div className="trade-col"><h3>Du gir</h3>{side(offer.getMoney, offer.getProps, offer.getCards)}</div>
      </div>
      <div className="modal-actions">
        <button className="btn danger" onClick={() => answerTrade(false)}>Avslå</button>
        <button className="btn green" onClick={() => answerTrade(true)}>Godta</button>
      </div>
    </Shell>
  );
}

function MenuModal() {
  const settings = useStore((st) => st.settings);
  const game = useGame();
  return (
    <Shell title="Meny">
      <div className="settings">
        <label>Hastighet
          <select value={settings.speed} onChange={(e) => updateSettings({ speed: e.target.value as typeof settings.speed })}>
            <option value="normal">Normal</option>
            <option value="fast">Rask</option>
            <option value="turbo">Lynrask (uten terningfysikk)</option>
          </select>
        </label>
        <label className="check"><input type="checkbox" checked={settings.sound} onChange={(e) => updateSettings({ sound: e.target.checked })} /> Lydeffekter</label>
        <label className="check"><input type="checkbox" checked={settings.music} onChange={(e) => updateSettings({ music: e.target.checked })} /> Bakgrunnsmusikk</label>
        <label className="check"><input type="checkbox" checked={settings.followCam} onChange={(e) => updateSettings({ followCam: e.target.checked })} /> Kamera følger brikkene</label>
        <label className="check"><input type="checkbox" checked={settings.shadows} onChange={(e) => updateSettings({ shadows: e.target.checked })} /> Skygger (slå av på trege enheter)</label>
      </div>
      <div className="modal-actions left">
        <button className="btn" onClick={() => openModal({ kind: 'rules' })}>📜 Regler</button>
        <button className="btn" onClick={() => { const t = exportGame(); if (t) downloadText(`monopol-tur-${game.s.turn}.json`, t); }}>💾 Last ned spillet</button>
        {game.s.phase !== 'gameover' && (
          <button className="btn" onClick={() => { if (confirm('Avslutte nå? Spilleren med høyest formue vinner.')) act((g) => g.endByNetWorth()); }}>🏁 Avslutt nå</button>
        )}
        <button className="btn primary" onClick={() => { if (game.s.phase === 'gameover' || confirm('Gå til hovedmenyen? Spillet er lagret og kan fortsettes senere.')) leaveGame(); }}>🏠 Hovedmeny</button>
      </div>
    </Shell>
  );
}

function ResultsModal() {
  const game = useGame();
  const profile = useStore((st) => st.profile);
  const s = game.s;
  const ranked = useMemo(() => s.players.slice().sort((a, b) => Number(a.bankrupt) - Number(b.bankrupt) || game.netWorth(b.id) - game.netWorth(a.id)), [s.players, game]);
  const w = s.winner !== null ? game.player(s.winner) : null;
  const me = s.players.find((p) => p.isProfile && !p.isAI);
  return (
    <Shell>
      <div className="results">
        <div className="trophy">🏆</div>
        <h2>{w ? `${w.name} vinner!` : 'Spillet er over'}</h2>
        <p className="muted">Spillet varte i {s.turn} turer.</p>
        <table className="standings">
          <tbody>
            {ranked.map((p, k) => (
              <tr key={p.id} className={p.id === s.winner ? 'win' : ''}>
                <td>{k + 1}.</td>
                <td><TokenBadge token={p.token} color={p.color} size={24} /> {p.name}</td>
                <td>{p.bankrupt ? 'Konkurs' : game.fmt(game.netWorth(p.id))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {me && <p className="muted">Du har nå {profile.xp} XP totalt.</p>}
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={closeModal}>Se brettet</button>
        <button className="btn primary" onClick={leaveGame}>Hovedmeny</button>
      </div>
    </Shell>
  );
}

function RulesModal() {
  const game = useGame();
  const r = game.s.rules;
  const f = (n: number) => game.fmt(n);
  return (
    <Shell title="📜 Regler" wide>
      <ul className="rules-list">
        <li>Alle starter med {f(r.startMoney)}. Du får {f(r.goSalary)} hver gang du passerer Start{r.doubleSalaryOnGo ? ', og det dobbelte når du lander rett på' : ''}.</li>
        <li>Kast terningene og flytt. Slår du dobbel, kaster du igjen – men {r.doublesToJail} doble på rad sender deg i fengsel.</li>
        <li>Lander du på en ledig eiendom kan du kjøpe den.{r.auctions ? ' Ellers går den på auksjon.' : ''}</li>
        <li>Eier du hele fargegruppen, dobles leien, og du kan bygge hus og hotell{r.evenBuild ? ' (jevnt fordelt)' : ''}.</li>
        <li>Stasjoner gir mer leie jo flere du eier. Verk: terningsum × {r.utilityMultipliers.join(' eller ')}.</li>
        <li>Pantsett eiendommer for halv pris. Innløsning koster {Math.round(r.mortgageInterest * 100)} % ekstra.</li>
        <li>Fengsel: betal {f(r.jailFine)}, bruk et kort eller prøv å slå dobbel ({r.maxJailTurns} forsøk).</li>
        <li>Handle med andre spillere på din tur. Kan du ikke betale, går du konkurs.</li>
        {r.freeParkingJackpot && <li>Skatter og bøter går i potten på Gratis parkering.</li>}
        {r.turnLimit > 0 && <li>Spillet slutter etter {r.turnLimit} turer – høyest formue vinner.</li>}
      </ul>
      <p className="muted small">Tips: Dra for å rotere kameraet, klyp eller scroll for å zoome, og trykk på et felt for å se skjøtet.</p>
    </Shell>
  );
}

function LogModal() {
  const game = useGame();
  const entries = game.s.log.slice(-150).reverse();
  return (
    <Shell title="📜 Hendelser" wide>
      <div className="log">
        {entries.map((l, k) => <div key={k} className={l.msg.startsWith('—') ? 'turn' : ''}>{l.msg}</div>)}
      </div>
    </Shell>
  );
}

export function Modals() {
  const modal = useStore((st) => st.modal);
  const game = useStore((st) => st.game);
  if (!modal || !game) return null;
  switch (modal.kind) {
    case 'deed': return <DeedModal i={modal.square} />;
    case 'manage': return <ManageModal pid={modal.pid} />;
    case 'trade': return <TradeModal from={modal.from} to={modal.to} />;
    case 'tradeAsk': return <TradeAskModal offer={modal.offer} fromAI={modal.fromAI} />;
    case 'menu': return <MenuModal />;
    case 'results': return <ResultsModal />;
    case 'rules': return <RulesModal />;
    case 'log': return <LogModal />;
    default: return null;
  }
}
