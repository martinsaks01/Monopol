/* Hovedmeny, oppsett av nytt spill og profil. */
import { useMemo, useState } from 'react';
import type { PlayerSetup, Rules } from '../game/types';
import { DEFAULT_RULES } from '../game/engine';
import { useStore, toast } from '../store/store';
import { continueSavedGame, hasSavedGame, loadGameFromJSON, startNewGame } from '../store/director';
import { DICE, FINISHES, PLAYER_COLORS, TABLES, TOKENS, tokenIcon } from '../progress/cosmetics';
import { ACHIEVEMENTS, MAX_LEVEL, levelFromXp, saveProfile, xpForLevel, type Profile } from '../progress/profile';
import { allThemes, deleteTheme, downloadText, importTheme, pickTextFile } from '../themes/custom';
import { TokenBadge } from './common';

function setProfile(p: Profile) {
  saveProfile(p);
  useStore.setState({ profile: { ...p } });
}

function LevelBadge({ xp }: { xp: number }) {
  const level = levelFromXp(xp);
  const a = xpForLevel(level), b = xpForLevel(level + 1);
  const pct = level >= MAX_LEVEL ? 100 : Math.min(100, ((xp - a) / (b - a)) * 100);
  return (
    <div className="level-badge">
      <div className="level-num">{level}</div>
      <div className="level-info">
        <div>Nivå {level}</div>
        <div className="xp-track"><div className="xp-fill" style={{ width: `${pct}%` }} /></div>
        <div className="muted small">{level >= MAX_LEVEL ? 'Maks nivå!' : `${xp - a} / ${b - a} XP`}</div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ hovedmeny

export function StartScreen() {
  const profile = useStore((st) => st.profile);
  const saved = hasSavedGame();
  return (
    <div className="screen start-screen">
      <div className="floating-dice" aria-hidden>
        {['🎲', '🏠', '💰', '🎩', '🚗', '🏨', '🎲', '💎'].map((e, k) => <span key={k} style={{ ['--k' as string]: k }}>{e}</span>)}
      </div>
      <div className="start-card">
        <div className="logo-big">MONOPOL</div>
        <p className="tagline">Kjøp. Bygg. Knus motstanderne.</p>
        <div className="start-profile" onClick={() => useStore.setState({ screen: 'profile' })}>
          <TokenBadge token={profile.selected.token} color={profile.selected.color} size={44} />
          <div><b>{profile.name}</b><LevelBadge xp={profile.xp} /></div>
        </div>
        <div className="start-buttons">
          {saved && (
            <button className="btn green huge" onClick={() => continueSavedGame()}>
              ▶ Fortsett <span className="btn-sub">Tur {saved.turn} · {saved.players}</span>
            </button>
          )}
          <button className="btn primary huge" onClick={() => useStore.setState({ screen: 'setup' })}>🎲 Nytt spill</button>
          <button className="btn big" onClick={() => useStore.setState({ screen: 'profile' })}>⭐ Profil og opplåsinger</button>
          <button className="btn ghost" onClick={async () => {
            const text = await pickTextFile();
            if (!text) return;
            try { loadGameFromJSON(text); } catch (e) { toast('Kunne ikke laste: ' + (e as Error).message, 'bad'); }
          }}>📂 Last inn spill fra fil</button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ oppsett

type Mode = 'classic' | 'quick' | 'custom';

const MODES: Record<Mode, { name: string; desc: string; rules: Partial<Rules> }> = {
  classic: { name: 'Klassisk', desc: 'Vanlige regler. Spill til bare én er igjen.', rules: {} },
  quick: { name: 'Hurtigspill', desc: '2 eiendommer hver ved start, maks 40 turer, rikeste vinner.', rules: { startingProperties: 2, turnLimit: 40 } },
  custom: { name: 'Egne regler', desc: 'Velg husregler selv.', rules: {} },
};

interface SetupPlayer extends PlayerSetup { key: number }

export function SetupScreen() {
  const profile = useStore((st) => st.profile);
  const level = levelFromXp(profile.xp);
  const unlockedTokens = TOKENS.filter((t) => t.level <= level);
  const [themes, setThemes] = useState(allThemes());
  const [themeId, setThemeId] = useState(themes[0].id);
  const theme = themes.find((t) => t.id === themeId) || themes[0];
  const [mode, setMode] = useState<Mode>('classic');
  const [custom, setCustom] = useState<Partial<Rules>>({});
  const [players, setPlayers] = useState<SetupPlayer[]>(() => [
    { key: 1, name: profile.name, color: profile.selected.color, token: profile.selected.token, finish: profile.selected.finish, isAI: false, isProfile: true },
    { key: 2, name: 'Datamaskin 1', color: PLAYER_COLORS.find((c) => c !== profile.selected.color)!, token: unlockedTokens.find((t) => t.id !== profile.selected.token)!.id, isAI: true },
    { key: 3, name: 'Datamaskin 2', color: PLAYER_COLORS.filter((c) => c !== profile.selected.color)[1], token: unlockedTokens.filter((t) => t.id !== profile.selected.token)[1].id, isAI: true },
  ]);
  const rules = useMemo<Rules>(() => ({ ...DEFAULT_RULES, ...(theme.rules || {}), ...MODES[mode].rules, ...(mode === 'custom' ? custom : {}) }), [theme, mode, custom]);

  const update = (key: number, patch: Partial<SetupPlayer>) => setPlayers((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const add = () => {
    if (players.length >= 6) return;
    const usedC = players.map((p) => p.color), usedT = players.map((p) => p.token);
    const humans = players.filter((p) => !p.isAI).length;
    setPlayers([...players, {
      key: Date.now(),
      name: `Datamaskin ${players.length - humans + 1}`,
      color: PLAYER_COLORS.find((c) => !usedC.includes(c)) || PLAYER_COLORS[0],
      token: (unlockedTokens.find((t) => !usedT.includes(t.id)) || unlockedTokens[0]).id,
      isAI: true,
    }]);
  };

  const start = () => {
    const list: PlayerSetup[] = players.map(({ key: _key, ...p }) => ({ ...p, name: p.name.trim() || 'Spiller' }));
    try {
      startNewGame(theme, list, { ...MODES[mode].rules, ...(mode === 'custom' ? custom : {}) });
    } catch (e) {
      toast((e as Error).message, 'bad');
    }
  };

  const ruleNum = (key: keyof Rules, label: string, step = 50) => (
    <label>{label}<input type="number" step={step} min={0} value={Number(rules[key])} onChange={(e) => setCustom({ ...custom, [key]: Number(e.target.value) })} /></label>
  );
  const ruleBool = (key: keyof Rules, label: string) => (
    <label className="check"><input type="checkbox" checked={Boolean(rules[key])} onChange={(e) => setCustom({ ...custom, [key]: e.target.checked })} />{label}</label>
  );

  return (
    <div className="screen setup-screen">
      <div className="panel">
        <div className="panel-head">
          <button className="icon-btn" onClick={() => useStore.setState({ screen: 'start' })}>←</button>
          <h1>Nytt spill</h1>
        </div>

        <section>
          <h3>Spillmodus</h3>
          <div className="mode-cards">
            {(Object.keys(MODES) as Mode[]).map((m) => (
              <button key={m} className={`mode-card${mode === m ? ' on' : ''}`} onClick={() => setMode(m)}>
                <b>{MODES[m].name}</b><span>{MODES[m].desc}</span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3>Spillere</h3>
          {players.map((p) => (
            <div className="setup-player" key={p.key}>
              <TokenBadge token={p.token} color={p.color} size={38} />
              <input type="text" value={p.name} maxLength={18} onChange={(e) => update(p.key, { name: e.target.value })} />
              {p.isProfile ? <span className="tag you">Deg</span> : (
                <button className="chip-btn" onClick={() => update(p.key, { isAI: !p.isAI })}>{p.isAI ? '🤖 AI' : '👤 Menneske'}</button>
              )}
              <div className="token-picker">
                {unlockedTokens.map((t) => (
                  <button key={t.id} className={`token-opt${p.token === t.id ? ' on' : ''}`} title={t.name} onClick={() => update(p.key, { token: t.id })}>{t.icon}</button>
                ))}
              </div>
              <div className="color-picker">
                {PLAYER_COLORS.map((c) => (
                  <button key={c} className={`color-opt${p.color === c ? ' on' : ''}`} style={{ background: c }} onClick={() => update(p.key, { color: c })} />
                ))}
              </div>
              {!p.isProfile && players.length > 2 && <button className="icon-btn small" onClick={() => setPlayers(players.filter((x) => x.key !== p.key))}>✕</button>}
            </div>
          ))}
          {players.length < 6 && <button className="btn ghost" onClick={add}>+ Legg til spiller</button>}
          {level < 8 && <p className="muted small">🔒 Flere brikker låses opp når du går opp i nivå.</p>}
        </section>

        <section>
          <h3>Brett</h3>
          <div className="theme-row">
            <select value={theme.id} onChange={(e) => setThemeId(e.target.value)}>
              {themes.map((t) => <option key={t.id} value={t.id}>{t.name}{t.builtIn ? '' : ' (eget)'}</option>)}
            </select>
            <button className="btn small" onClick={async () => {
              const text = await pickTextFile();
              if (!text) return;
              try {
                const t = importTheme(text);
                setThemes(allThemes());
                setThemeId(t.id);
                toast(`Temaet «${t.name}» er importert.`, 'good');
              } catch (e) { alert('Temaet har feil:\n\n' + (e as Error).message); }
            }}>📂 Importer</button>
            <button className="btn small" onClick={() => { const { builtIn: _b, ...t } = theme; downloadText(`${t.id}.json`, JSON.stringify(t, null, 2)); }}>💾 Last ned JSON</button>
            {!theme.builtIn && <button className="btn small" onClick={() => { deleteTheme(theme.id); setThemes(allThemes()); setThemeId(allThemes()[0].id); }}>🗑</button>}
          </div>
          <p className="muted small">{theme.description} {theme.board.length} felter. Last ned som JSON, endre felter og kort, og importer for å lage ditt eget brett.</p>
        </section>

        {mode === 'custom' && (
          <section>
            <h3>Regler</h3>
            <div className="rules-grid">
              {ruleNum('startMoney', 'Startpenger', 100)}
              {ruleNum('goSalary', 'Lønn ved Start')}
              {ruleNum('jailFine', 'Fengselsbot', 10)}
              {ruleNum('turnLimit', 'Turgrense (0 = av)', 10)}
              {ruleNum('startingProperties', 'Eiendommer ved start', 1)}
              {ruleBool('auctions', 'Auksjon når noen ikke kjøper')}
              {ruleBool('evenBuild', 'Jevn bygging')}
              {ruleBool('freeParkingJackpot', 'Pott på Gratis parkering')}
              {ruleBool('doubleSalaryOnGo', 'Dobbel lønn på Start')}
            </div>
          </section>
        )}

        <button className="btn primary huge full" onClick={start}>🎲 Start spillet</button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ profil

export function ProfileScreen() {
  const profile = useStore((st) => st.profile);
  const level = levelFromXp(profile.xp);
  const sel = profile.selected;
  const choose = (patch: Partial<Profile['selected']>) => setProfile({ ...profile, selected: { ...sel, ...patch } });
  const st = profile.stats;

  const lockable = <T extends { id: string; name: string; level: number }>(items: T[], current: string, key: keyof Profile['selected'], render: (t: T) => React.ReactNode) => (
    <div className="unlock-grid">
      {items.map((t) => {
        const locked = t.level > level;
        return (
          <button key={t.id} className={`unlock${current === t.id ? ' on' : ''}${locked ? ' locked' : ''}`} disabled={locked} onClick={() => choose({ [key]: t.id })}>
            {render(t)}
            <span className="unlock-name">{t.name}</span>
            {locked && <span className="unlock-lock">🔒 Nivå {t.level}</span>}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="screen profile-screen">
      <div className="panel">
        <div className="panel-head">
          <button className="icon-btn" onClick={() => useStore.setState({ screen: 'start' })}>←</button>
          <h1>Profil</h1>
        </div>
        <section className="profile-top">
          <TokenBadge token={sel.token} color={sel.color} size={64} />
          <div className="grow">
            <input className="name-input" value={profile.name} maxLength={18} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
            <LevelBadge xp={profile.xp} />
          </div>
        </section>

        <section>
          <h3>Statistikk</h3>
          <div className="stats-grid">
            {([
              ['Spill', st.games], ['Seire', st.wins], ['Eiendommer kjøpt', st.propertiesBought], ['Hus bygget', st.housesBuilt],
              ['Hoteller', st.hotelsBuilt], ['Leie mottatt', `${st.rentCollected.toLocaleString('nb-NO')} kr`], ['Fargegrupper', st.monopolies], ['Handler', st.trades],
            ] as [string, React.ReactNode][]).map(([k, v]) => <div key={k} className="stat"><b>{v}</b><span>{k}</span></div>)}
          </div>
        </section>

        <section>
          <h3>Prestasjoner ({Object.keys(profile.achievements).length}/{ACHIEVEMENTS.length})</h3>
          <div className="ach-grid">
            {ACHIEVEMENTS.map((a) => {
              const got = !!profile.achievements[a.id];
              return (
                <div key={a.id} className={`ach${got ? ' got' : ''}`} title={a.desc}>
                  <span className="ach-icon">{got ? a.icon : '🔒'}</span>
                  <b>{a.name}</b>
                  <span className="muted small">{a.desc}</span>
                  <span className="ach-xp">+{a.xp} XP</span>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <h3>Brikke</h3>
          {lockable(TOKENS, sel.token, 'token', (t) => <span className="unlock-icon">{tokenIcon(t.id)}</span>)}
          <div className="color-picker big">
            {PLAYER_COLORS.map((c) => <button key={c} className={`color-opt${sel.color === c ? ' on' : ''}`} style={{ background: c }} onClick={() => choose({ color: c })} />)}
          </div>
        </section>
        <section>
          <h3>Overflate</h3>
          {lockable(FINISHES, sel.finish, 'finish', (t) => <span className={`finish-swatch finish-${t.id}`} style={{ ['--c' as string]: sel.color }} />)}
        </section>
        <section>
          <h3>Terninger</h3>
          {lockable(DICE, sel.dice, 'dice', (t) => <span className="dice-swatch" style={{ background: t.body, color: t.pip }}>⚅</span>)}
        </section>
        <section>
          <h3>Bord</h3>
          {lockable(TABLES, sel.table, 'table', (t) => <span className="table-swatch" style={{ background: `linear-gradient(135deg, ${t.background}, ${t.table})` }} />)}
        </section>
      </div>
    </div>
  );
}
