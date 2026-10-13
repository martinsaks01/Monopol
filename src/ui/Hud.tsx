/* Alt grensesnitt som ligger oppå 3D-scenen mens man spiller. */
import { useEffect, useState } from 'react';
import type { Game } from '../game/engine';
import { useStore } from '../store/store';
import { act, dismissCard, openModal, requestRoll, updateSettings } from '../store/director';
import { levelFromXp, xpForLevel } from '../progress/profile';
import { DeedCard, Money, TokenBadge, groupColorOf } from './common';

function useGame() {
  const game = useStore((st) => st.game);
  useStore((st) => st.v);
  return game as Game;
}

// ------------------------------------------------------------------ toppen

function TopBar() {
  const game = useGame();
  const settings = useStore((st) => st.settings);
  const s = game.s;
  return (
    <div className="topbar">
      <button className="icon-btn" onClick={() => openModal({ kind: 'menu' })} title="Meny">☰</button>
      <div className="turn-pill">Tur {s.turn}{s.rules.turnLimit ? ` / ${s.rules.turnLimit}` : ''}</div>
      {s.rules.freeParkingJackpot && <div className="turn-pill pot">🅿️ {game.fmt(s.pot)}</div>}
      <div className="spacer" />
      <button className="icon-btn" onClick={() => openModal({ kind: 'log' })} title="Hendelser">📜</button>
      <button className="icon-btn" onClick={() => window.dispatchEvent(new Event('monopol:camera-home'))} title="Vis hele brettet">🗺️</button>
      <button className={`icon-btn${settings.followCam ? ' on' : ''}`} onClick={() => updateSettings({ followCam: !settings.followCam })} title="Kamera følger brikkene">🎥</button>
      <button className="icon-btn" onClick={() => updateSettings({ sound: !settings.sound })} title="Lyd">{settings.sound ? '🔊' : '🔇'}</button>
    </div>
  );
}

// ------------------------------------------------------------------ spillere

function PlayerCard({ game, pid }: { game: Game; pid: number }) {
  const s = game.s;
  const p = s.players[pid];
  const acting = game.actingPlayerId();
  const owned = game.ownedBy(pid).sort((a, b) => a - b);
  return (
    <div
      className={`pcard${pid === s.current ? ' current' : ''}${pid === acting ? ' acting' : ''}${p.bankrupt ? ' bankrupt' : ''}`}
      style={{ ['--pcolor' as string]: p.color }}
      onClick={() => !p.bankrupt && openModal({ kind: 'manage', pid })}
    >
      <div className="pcard-row">
        <TokenBadge token={p.token} color={p.color} />
        <div className="pcard-name">
          <span>{p.name}</span>
          <span className="pcard-tags">
            {p.isAI && <span className="tag">AI</span>}
            {p.isProfile && <span className="tag you">Deg</span>}
            {p.inJail && <span className="tag jail">🔒</span>}
            {p.jailCards.length > 0 && <span className="tag">🎫{p.jailCards.length}</span>}
            {p.bankrupt && <span className="tag">Konkurs</span>}
          </span>
        </div>
        <Money value={p.money} currency={s.rules.currency} />
      </div>
      {owned.length > 0 && (
        <div className="pcard-props">
          {owned.map((i) => (
            <span
              key={i}
              className={`chip${s.props[i].mortgaged ? ' mortgaged' : ''}`}
              style={{ background: groupColorOf(game, i) }}
              title={s.board[i].name}
            >
              {s.props[i].houses === 5 ? 'H' : s.props[i].houses || ''}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function PlayerList() {
  const game = useGame();
  return (
    <div className="players">
      {game.s.players.map((p) => <PlayerCard key={p.id} game={game} pid={p.id} />)}
    </div>
  );
}

// ------------------------------------------------------------------ handlinger

function Secondary({ pid }: { pid: number }) {
  return (
    <div className="dock-secondary">
      <button className="btn ghost" onClick={() => openModal({ kind: 'manage', pid })}>🏠 Eiendommer</button>
      <button className="btn ghost" onClick={() => openModal({ kind: 'trade', from: pid })}>🤝 Handel</button>
    </div>
  );
}

function AuctionPanel({ game, human }: { game: Game; human: boolean }) {
  const s = game.s, a = s.auction!;
  const sq = s.board[a.square];
  const actingId = game.actingPlayerId()!;
  const acting = game.player(actingId);
  const [custom, setCustom] = useState(a.highBid + 10);
  useEffect(() => setCustom(a.highBid + 10), [a.highBid]);
  return (
    <div className="auction">
      <div className="auction-head">
        <span className="swatch" style={{ background: groupColorOf(game, a.square) }} />
        <b>🔨 {sq.name}</b>
        <span className="muted">verdi {game.fmt(sq.price || 0)}</span>
      </div>
      <div className="auction-bid">
        {a.highBidder !== null ? <>Høyeste bud <b>{game.fmt(a.highBid)}</b> – {game.player(a.highBidder).name}</> : 'Ingen bud ennå'}
      </div>
      <div className="auction-bidders">
        {s.players.filter((p) => !p.bankrupt).map((p) => (
          <span key={p.id} className={`${p.id === actingId ? 'turn' : ''} ${a.participants.includes(p.id) ? '' : 'out'}`}>
            <TokenBadge token={p.token} color={p.color} size={20} /> {p.name}
          </span>
        ))}
      </div>
      {human ? (
        <div className="auction-controls">
          {[10, 50, 100].map((inc) => (
            <button key={inc} className="btn green" disabled={a.highBid + inc > acting.money} onClick={() => act((g) => g.auctionBid(actingId, a.highBid + inc))}>
              +{inc}
            </button>
          ))}
          <input type="number" value={custom} min={a.highBid + 1} step={10} onChange={(e) => setCustom(Number(e.target.value))} />
          <button className="btn blue" onClick={() => act((g) => g.auctionBid(actingId, custom))}>By</button>
          <button className="btn" onClick={() => act((g) => g.auctionPass(actingId))}>Stå over</button>
        </div>
      ) : <div className="thinking">🤖 {acting.name} vurderer …</div>}
    </div>
  );
}

function ActionDock() {
  const game = useGame();
  const busy = useStore((st) => st.busy);
  const diceThrow = useStore((st) => st.diceThrow);
  const s = game.s;
  const actingId = game.actingPlayerId();
  const acting = actingId !== null ? game.player(actingId) : null;
  const cur = game.current;
  const human = !!acting && !acting.isAI;

  let content: React.ReactNode = null;
  const thinking = acting && acting.isAI && <div className="thinking">🤖 {acting.name} tenker …</div>;

  if (s.phase === 'gameover') {
    const w = s.winner !== null ? game.player(s.winner) : null;
    content = (
      <div className="dock-main">
        <div className="dock-title">🏆 {w ? `${w.name} har vunnet!` : 'Spillet er over'}</div>
        <button className="btn primary big" onClick={() => openModal({ kind: 'results' })}>Se resultater</button>
      </div>
    );
  } else if (s.phase === 'auction') {
    content = <AuctionPanel game={game} human={human && !busy} />;
  } else if (busy || diceThrow) {
    content = diceThrow ? <div className="thinking">🎲 Terningene ruller …</div> : null;
  } else if (!human) {
    content = thinking;
  } else if (s.phase === 'roll') {
    content = (
      <div className="dock-main">
        {cur.inJail ? (
          <>
            <div className="dock-title">🔒 Du sitter i fengsel <span className="muted">(forsøk {cur.jailTurns + 1} av {s.rules.maxJailTurns})</span></div>
            <div className="dock-buttons">
              <button className="btn primary big pulse" onClick={requestRoll}>🎲 Prøv å slå dobbel</button>
              <button className="btn blue" disabled={cur.money < s.rules.jailFine} onClick={() => act((g) => g.payJailFine())}>Betal {game.fmt(s.rules.jailFine)}</button>
              {cur.jailCards.length > 0 && <button className="btn green" onClick={() => act((g) => g.useJailCard())}>Bruk kort</button>}
            </div>
          </>
        ) : (
          <>
            {s.doublesCount > 0 && <div className="dock-title">Dobbel! Kast igjen 🎲</div>}
            <button className="btn primary huge pulse" onClick={requestRoll}>🎲 KAST</button>
          </>
        )}
        <Secondary pid={cur.id} />
      </div>
    );
  } else if (s.phase === 'buy') {
    const i = s.pendingBuy!;
    const sq = s.board[i];
    const can = cur.money >= (sq.price || 0);
    content = (
      <div className="dock-main buy">
        <DeedCard game={game} i={i} compact />
        <div className="dock-buttons">
          <button className="btn green big" disabled={!can} onClick={() => act((g) => g.buy())}>Kjøp {game.fmt(sq.price || 0)}</button>
          <button className="btn" onClick={() => act((g) => g.declineBuy())}>{s.rules.auctions ? '🔨 Auksjon' : 'Ikke kjøp'}</button>
        </div>
        {!can && <div className="warn small">Ikke nok penger – pantsett eller selg for å skaffe mer.</div>}
        <Secondary pid={cur.id} />
      </div>
    );
  } else if (s.phase === 'debt') {
    const d = s.debts[0];
    const debtor = game.player(d.debtor);
    const missing = d.amount - debtor.money;
    content = (
      <div className="dock-main">
        <div className="dock-title warn">⚠️ {debtor.name} skylder {game.fmt(d.amount)} til {game.partyName(d.to)}</div>
        <div className="muted small">{missing > 0 ? `Du mangler ${game.fmt(missing)}. Pantsett, selg hus eller handle.` : 'Du har nok penger nå!'}</div>
        <div className="dock-buttons">
          <button className="btn green big" disabled={missing > 0} onClick={() => act((g) => g.payDebt())}>Betal</button>
          <button className="btn danger" onClick={() => {
            const canRaise = game.liquidationValue(debtor.id) >= d.amount;
            if (confirm(canRaise ? 'Du kan skaffe nok penger ved å pantsette/selge. Vil du likevel gå konkurs?' : 'Erklære deg konkurs?')) act((g) => g.declareBankruptcy());
          }}>Gå konkurs</button>
        </div>
        <Secondary pid={debtor.id} />
      </div>
    );
  } else if (s.phase === 'end') {
    content = (
      <div className="dock-main">
        <button className="btn blue huge" onClick={() => act((g) => g.endTurn())}>Avslutt tur ➜</button>
        <Secondary pid={cur.id} />
      </div>
    );
  }

  return <div className="dock">{content}</div>;
}

// ------------------------------------------------------------------ kort

function CardOverlay() {
  const card = useStore((st) => st.card);
  if (!card) return null;
  return (
    <div className="card-overlay" onClick={card.waitForClick ? dismissCard : undefined}>
      <div className="game-card" key={card.id}>
        <div className="game-card-inner">
          <div className="game-card-back" style={{ background: card.color }}><span>{card.icon}</span><b>{card.deckName}</b></div>
          <div className="game-card-front">
            <div className="game-card-head" style={{ background: card.color }}>{card.icon} {card.deckName}</div>
            <div className="game-card-text">{card.text}</div>
            <div className="game-card-foot">{card.playerName}</div>
            {card.waitForClick && <button className="btn primary" onClick={dismissCard}>OK</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ varsler og XP

function Toasts() {
  const toasts = useStore((st) => st.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => <div key={t.id} className={`toast ${t.kind || ''}`}>{t.icon && <span className="toast-icon">{t.icon}</span>}{t.text}</div>)}
    </div>
  );
}

function XpBar() {
  const game = useGame();
  const profile = useStore((st) => st.profile);
  const gains = useStore((st) => st.xpGains);
  if (!game.s.players.some((p) => p.isProfile && !p.isAI)) return null;
  const level = levelFromXp(profile.xp);
  const a = xpForLevel(level), b = xpForLevel(level + 1);
  const pct = Math.min(100, ((profile.xp - a) / Math.max(1, b - a)) * 100);
  return (
    <div className="xpbar">
      <div className="xp-level">{level}</div>
      <div className="xp-track"><div className="xp-fill" style={{ width: `${pct}%` }} /></div>
      <div className="xp-gains">
        {gains.map((g) => <div key={g.id} className="xp-gain">+{g.amount} XP <span>{g.reason}</span></div>)}
      </div>
    </div>
  );
}

function LevelUp() {
  const lu = useStore((st) => st.levelUp);
  if (!lu) return null;
  return (
    <div className="levelup">
      <div className="levelup-burst">⭐</div>
      <div className="levelup-title">NIVÅ {lu.level}!</div>
      {lu.unlocks.length > 0 && (
        <div className="levelup-unlocks">
          Låst opp: {lu.unlocks.map((u) => `${u.kind.toLowerCase()} «${u.name}»`).join(', ')}
        </div>
      )}
    </div>
  );
}

function ShakeWatcher() {
  const shake = useStore((st) => st.shake);
  useEffect(() => {
    if (!shake) return;
    const el = document.querySelector('.scene');
    el?.classList.remove('shake');
    void (el as HTMLElement | null)?.offsetWidth;
    el?.classList.add('shake');
  }, [shake]);
  return null;
}

export function Hud() {
  return (
    <div className="hud">
      <TopBar />
      <PlayerList />
      <ActionDock />
      <CardOverlay />
      <Toasts />
      <XpBar />
      <LevelUp />
      <ShakeWatcher />
    </div>
  );
}
