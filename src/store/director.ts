/*
 * Regissøren: binder spillmotoren til 3D-scenen og grensesnittet.
 *
 *  - Menneskelige handlinger går gjennom act(), som kaller motoren og deretter spiller av hendelsene.
 *  - Terningkast skjer fysisk i 3D-scenen; resultatet sendes tilbake via onDiceSettled().
 *  - Hendelser spilles av én og én (brikker hopper, mynter flyr, kort snus …).
 *  - Datamotstandere styres herfra, med pauser som passer valgt hastighet.
 */
import { Game } from '../game/engine';
import * as AI from '../game/ai';
import type { GameEvent, GameState, Party, PlayerSetup, Result, Rules, Theme, TradeOffer } from '../game/types';
import { sfx, startMusic, stopMusic, unlockAudio, setSoundEnabled } from '../audio/sound';
import { ProgressTracker, saveProfile, type ProgressNotice } from '../progress/profile';
import { boardSize, tileCenter, tokenPosition } from '../scene/layout';
import { addBurst, addFloat, bump, nextId, saveSettings, toast, useStore, type Settings } from './store';

const SAVE_KEY = 'monopol.save.v2';

const SPEED = {
  normal: { hop: 0.2, ai: 700, money: 380, card: 2400, pause: 250 },
  fast: { hop: 0.11, ai: 300, money: 180, card: 1400, pause: 120 },
  turbo: { hop: 0.04, ai: 60, money: 50, card: 600, pause: 30 },
};

const sp = () => SPEED[useStore.getState().settings.speed];
const get = () => useStore.getState();
const set = useStore.setState;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

let processed = 0;
let processing = false;
let aiTimer: ReturnType<typeof setTimeout> | null = null;
let tracker: ProgressTracker | null = null;
const animResolvers = new Map<number, () => void>();
let cardResolve: (() => void) | null = null;

function game(): Game | null { return get().game; }

// ------------------------------------------------------------------ oppstart

export function startNewGame(theme: Theme, players: PlayerSetup[], rules: Partial<Rules>) {
  const g = Game.create(theme, players, rules);
  beginGame(g);
}

export function hasSavedGame(): { turn: number; players: string; savedAt: number } | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return { turn: d.turn, players: d.players, savedAt: d.savedAt };
  } catch {
    return null;
  }
}

export function continueSavedGame(): boolean {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    beginGame(Game.load(JSON.parse(raw).state as GameState));
    return true;
  } catch (e) {
    toast('Kunne ikke laste spillet: ' + (e as Error).message, 'bad');
    return false;
  }
}

export function loadGameFromJSON(text: string) {
  const d = JSON.parse(text);
  beginGame(Game.load((d.state || d) as GameState));
}

function beginGame(g: Game) {
  (window as unknown as { __game: Game }).__game = g; // for feilsøking i konsollen
  stopAI();
  processed = g.s.events.length ? g.s.events[g.s.events.length - 1].id : 0;
  tracker = new ProgressTracker(get().profile, g, onProgress);
  set({
    game: g,
    screen: 'game',
    visualPos: g.s.players.map((p) => p.position),
    tokenAnim: null,
    diceThrow: null,
    diceSnap: g.s.dice ? { id: nextId(), values: g.s.dice } : null,
    busy: false,
    card: null,
    modal: null,
    highlight: null,
    camFocus: { id: nextId(), target: null, near: false },
  });
  if (get().settings.music) startMusic();
  bump();
  save();
  scheduleAI();
}

export function leaveGame() {
  stopAI();
  stopMusic();
  cardResolve?.();
  animResolvers.forEach((r) => r());
  animResolvers.clear();
  set({ game: null, screen: 'start', modal: null, card: null, tokenAnim: null, diceThrow: null });
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignorer */ }
}

function save() {
  const g = game();
  if (!g) return;
  try {
    if (g.s.phase === 'gameover') { clearSave(); return; }
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      savedAt: Date.now(),
      turn: g.s.turn,
      players: g.s.players.map((p) => p.name).join(', '),
      state: g.s,
    }));
  } catch { /* fullt */ }
}

export function exportGame(): string | null {
  const g = game();
  return g ? JSON.stringify({ state: g.s }) : null;
}

// ---------------------------------------------------------------- innstillinger

export function updateSettings(patch: Partial<Settings>) {
  const settings = { ...get().settings, ...patch };
  set({ settings });
  saveSettings(settings);
  setSoundEnabled(settings.sound);
  if ('music' in patch) { if (settings.music) startMusic(); else stopMusic(); }
}

export function initAudio() {
  unlockAudio();
  setSoundEnabled(get().settings.sound);
}

// ------------------------------------------------------------------ handlinger

/** Utfør en handling for en menneskelig spiller. */
export function act(fn: (g: Game) => Result): boolean {
  const g = game();
  if (!g) return false;
  if (get().busy) { toast('Vent litt …', 'info'); return false; }
  const res = fn(g);
  if (!res.ok) { sfx.error(); toast(res.error, 'bad'); return false; }
  sfx.click();
  process();
  return true;
}

export function requestRoll() {
  const g = game();
  if (!g || g.s.phase !== 'roll' || get().busy || get().diceThrow) return;
  stopAI();
  set({ busy: true, highlight: null });
  if (get().settings.speed === 'turbo') {
    const values: [number, number] = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
    set({ diceSnap: { id: nextId(), values } });
    setTimeout(() => onDiceSettled(values), 60);
    return;
  }
  sfx.diceShake();
  set({ diceThrow: { id: nextId(), player: g.s.current } });
}

/** Kalles av 3D-terningene når de har landet. */
export function onDiceSettled(values: [number, number]) {
  const g = game();
  set({ diceThrow: null });
  if (!g || g.s.phase !== 'roll') { set({ busy: false }); return; }
  g.roll(values);
  set({ busy: false });
  process();
}

export function finishTokenAnim(id: number) {
  const r = animResolvers.get(id);
  if (r) { animResolvers.delete(id); r(); }
}

export function dismissCard() {
  set({ card: null });
  const r = cardResolve;
  cardResolve = null;
  r?.();
}

export function openModal(m: NonNullable<ReturnType<typeof get>['modal']>) {
  sfx.click();
  set({ modal: m });
}

export function closeModal() {
  set({ modal: null });
  scheduleAI();
}

// ------------------------------------------------------------------ handel

export function proposeTrade(offer: TradeOffer): string | null {
  const g = game();
  if (!g) return 'Ingen spill.';
  const err = g.validateTrade(offer);
  if (err) return err;
  const partner = g.player(offer.to);
  if (partner.isAI) {
    const ev = AI.evaluateTrade(g, offer, partner.id);
    if (!ev.accept) {
      sfx.error();
      return `${partner.name} avslår. Prøv et bedre tilbud.`;
    }
    g.executeTrade(offer);
    set({ modal: null });
    toast(`${partner.name} godtok handelen!`, 'good', '🤝');
    process();
    return null;
  }
  set({ modal: { kind: 'tradeAsk', offer, fromAI: false } });
  return null;
}

export function answerTrade(accept: boolean) {
  const g = game();
  const m = get().modal;
  if (!g || !m || m.kind !== 'tradeAsk') return;
  set({ modal: null });
  if (accept) {
    const res = g.executeTrade(m.offer);
    if (!res.ok) toast(res.error, 'bad');
  } else {
    g.log(`${g.player(m.offer.to).name} avslo et handelsforslag fra ${g.player(m.offer.from).name}.`);
    toast(`${g.player(m.offer.to).name} avslo handelen.`, 'info');
  }
  process();
}

// ------------------------------------------------------------- datamotstander

function stopAI() {
  if (aiTimer) clearTimeout(aiTimer);
  aiTimer = null;
}

function scheduleAI() {
  stopAI();
  const g = game();
  if (!g || g.s.phase === 'gameover' || processing || get().busy) return;
  const m = get().modal;
  if (m && (m.kind === 'tradeAsk' || m.kind === 'results')) return;
  const id = g.actingPlayerId();
  if (id === null || !g.player(id).isAI) return;
  aiTimer = setTimeout(runAI, sp().ai);
}

function runAI() {
  aiTimer = null;
  const g = game();
  if (!g || get().busy || processing) return;
  let r: AI.AIAction | null;
  try {
    r = AI.step(g);
  } catch (e) {
    console.error(e);
    toast('Feil i datamotstanderen: ' + (e as Error).message, 'bad');
    return;
  }
  if (!r) return;
  if (r.type === 'roll') { requestRoll(); return; }
  if (r.type === 'proposeTrade') {
    const target = g.player(r.offer.to);
    if (target.isAI) {
      if (AI.evaluateTrade(g, r.offer, target.id).accept) g.executeTrade(r.offer);
      process();
    } else {
      sfx.trade();
      set({ modal: { kind: 'tradeAsk', offer: r.offer, fromAI: true } });
    }
    return;
  }
  process();
}

// ---------------------------------------------------------- avspilling av hendelser

async function process() {
  const g = game();
  if (!g) return;
  if (processing) return;
  processing = true;
  set({ busy: true });
  try {
    for (;;) {
      const ev = g.s.events.find((e) => e.id > processed);
      if (!ev) break;
      processed = ev.id;
      tracker?.onEvent(ev, g);
      try {
        await playEvent(ev, g);
      } catch (e) {
        console.error(e);
      }
      if (get().game !== g) return;
      bump();
    }
  } finally {
    processing = false;
    if (get().game === g) set({ busy: false });
  }
  const s = g.s;
  set({ highlight: s.phase === 'buy' ? s.pendingBuy : s.phase === 'auction' && s.auction ? s.auction.square : null });
  bump();
  save();
  if (s.phase === 'gameover' && get().modal?.kind !== 'results') {
    setTimeout(() => set({ modal: { kind: 'results' } }), 1200);
  }
  scheduleAI();
}

function playerPos(g: Game, pid: number): [number, number, number] {
  const p = g.player(pid);
  const vp = get().visualPos[pid] ?? p.position;
  const [x, y, z] = tokenPosition(vp, g.s.board.length, 0, 1);
  return [x, y + 0.9, z];
}

function partyPos(g: Game, party: Party): [number, number, number] | null {
  return typeof party === 'number' ? playerPos(g, party) : null;
}

function focus(target: [number, number, number] | null, near: boolean) {
  if (!get().settings.followCam) return;
  set({ camFocus: { id: nextId(), target, near } });
}

function animateToken(player: number, path: number[], mode: 'hop' | 'fly'): Promise<void> {
  if (!path.length) return Promise.resolve();
  const id = nextId();
  const stepTime = mode === 'fly' ? Math.max(0.35, sp().hop * 4) : sp().hop;
  return new Promise<void>((resolve) => {
    const done = () => {
      set((s) => {
        const visualPos = s.visualPos.slice();
        visualPos[player] = path[path.length - 1];
        return { visualPos, tokenAnim: s.tokenAnim?.id === id ? null : s.tokenAnim };
      });
      resolve();
    };
    animResolvers.set(id, done);
    set({ tokenAnim: { id, player, path, mode, stepTime } });
    // Sikkerhetsnett hvis fanen er i bakgrunnen og animasjonen ikke kjører
    setTimeout(() => finishTokenAnim(id), path.length * stepTime * 1000 + 2500);
  });
}

async function playEvent(ev: GameEvent, g: Game) {
  const n = g.s.board.length;
  const speed = sp();
  switch (ev.type) {
    case 'turn': {
      sfx.turn();
      const p = g.player(ev.player);
      focus(playerPos(g, ev.player), false);
      if (!p.isAI) toast(`${p.name} sin tur`, 'info', '🎲', 1400);
      await wait(speed.pause);
      break;
    }
    case 'roll':
      if (ev.double) toast('Dobbel! 🎲', 'gold', undefined, 1500);
      await wait(speed.pause);
      break;
    case 'move': {
      const path: number[] = [];
      const dir = ev.steps >= 0 ? 1 : -1;
      const cur = get().visualPos[ev.player] ?? ev.from;
      const count = ev.steps >= 0 ? (ev.to - cur + n) % n : (cur - ev.to + n) % n;
      for (let k = 1; k <= count; k++) path.push((((cur + dir * k) % n) + n) % n);
      focus(tileCenter(ev.to, n), true);
      if (count > 14) await animateToken(ev.player, [ev.to], 'fly');
      else await animateToken(ev.player, path, 'hop');
      sfx.land();
      await wait(speed.pause);
      break;
    }
    case 'jail':
      sfx.jail();
      focus(tileCenter(ev.to, n), true);
      await animateToken(ev.player, [ev.to], 'fly');
      set((s) => ({ shake: s.shake + 1 }));
      toast(`${g.player(ev.player).name} havner i fengsel!`, 'bad', '🔒');
      await wait(speed.pause * 2);
      break;
    case 'leaveJail':
      sfx.unlock();
      set((s) => ({ visualPos: s.visualPos.slice() }));
      await wait(speed.pause);
      break;
    case 'money': {
      const from = partyPos(g, ev.from);
      const to = partyPos(g, ev.to);
      const amt = g.fmt(ev.amount);
      if (from) addFloat(from, `−${amt}`, '#ff6b6b');
      if (to) {
        addFloat(to, `+${amt}`, '#4ade80');
        addBurst({ pos: to, kind: 'coins', count: Math.min(30, 6 + Math.floor(ev.amount / 50)) });
      }
      if (typeof ev.to === 'number') sfx.coin(); else sfx.pay();
      await wait(speed.money);
      break;
    }
    case 'buy':
    case 'auctionWon': {
      const pos = tileCenter(ev.square, n);
      addBurst({ pos: [pos[0], pos[1] + 0.2, pos[2]], kind: 'sparkle', color: g.player(ev.player).color, count: 40 });
      addFloat([pos[0], pos[1] + 0.8, pos[2]], 'SOLGT!', '#ffd54a');
      sfx.buy();
      if (ev.type === 'auctionWon') toast(`${g.player(ev.player).name} vant auksjonen om ${g.s.board[ev.square].name} for ${g.fmt(ev.amount)}`, 'good', '🔨');
      await wait(speed.money + 150);
      break;
    }
    case 'auctionStart':
      sfx.gavel();
      focus(tileCenter(ev.square, n), true);
      toast(`${g.s.board[ev.square].name} går på auksjon!`, 'info', '🔨');
      await wait(speed.pause);
      break;
    case 'card': {
      sfx.card();
      const p = g.player(ev.player);
      const deck = g.s.decks[ev.deck];
      const waitForClick = !p.isAI;
      set({ card: { id: ev.id, deckName: deck.name, color: deck.color, icon: deck.icon, text: ev.text, playerName: p.name, waitForClick } });
      await new Promise<void>((resolve) => {
        cardResolve = resolve;
        if (!waitForClick) setTimeout(() => { if (cardResolve === resolve) dismissCard(); }, speed.card);
      });
      break;
    }
    case 'build': {
      const pos = tileCenter(ev.square, n);
      addBurst({ pos, kind: 'dust', count: 18 });
      sfx.build();
      await wait(speed.pause);
      break;
    }
    case 'sell':
      sfx.sell();
      await wait(speed.pause / 2);
      break;
    case 'mortgage':
      sfx.click();
      break;
    case 'monopoly': {
      const group = g.group(ev.group);
      g.groupSquares(ev.group).forEach((i) => {
        const pos = tileCenter(i, n);
        addBurst({ pos: [pos[0], pos[1] + 0.3, pos[2]], kind: 'confetti', count: 40 }, 3200);
      });
      sfx.fanfare();
      toast(`${g.player(ev.player).name} eier hele ${group?.name.toLowerCase()} gruppe og kan bygge hus!`, 'gold', '⭐', 4000);
      await wait(speed.money * 2);
      break;
    }
    case 'debt':
      sfx.alarm();
      if (!g.player(ev.player).isAI) toast(`Du skylder ${g.fmt(ev.amount)}! Pantsett eller selg for å skaffe penger.`, 'bad', '⚠️', 4000);
      break;
    case 'bankrupt':
      sfx.bankrupt();
      toast(`${g.player(ev.player).name} er konkurs!`, 'bad', '💥', 4000);
      set((s) => ({ shake: s.shake + 1 }));
      await wait(speed.money * 2);
      break;
    case 'trade':
      sfx.trade();
      toast(`${g.player(ev.from).name} og ${g.player(ev.to).name} har handlet`, 'good', '🤝');
      await wait(speed.pause);
      break;
    case 'gameover': {
      const L = boardSize(n);
      for (let k = 0; k < 5; k++) addBurst({ pos: [(Math.random() - 0.5) * L * 0.5, 0.5, (Math.random() - 0.5) * L * 0.5], kind: 'confetti', count: 80 }, 4500);
      sfx.fanfare();
      focus(null, false);
      break;
    }
    default:
      break;
  }
}

// ------------------------------------------------------------------ progresjon

function onProgress(n: ProgressNotice) {
  const profile = tracker?.profile;
  if (profile) { saveProfile(profile); set({ profile: { ...profile } }); }
  if (n.kind === 'xp') {
    const id = nextId();
    set((s) => ({ xpGains: [...s.xpGains.slice(-4), { id, amount: n.amount, reason: n.reason }] }));
    setTimeout(() => set((s) => ({ xpGains: s.xpGains.filter((x) => x.id !== id) })), 2200);
  } else if (n.kind === 'achievement') {
    sfx.achievement();
    toast(`Prestasjon låst opp: ${n.def.name} (+${n.def.xp} XP)`, 'gold', n.def.icon, 4500);
  } else if (n.kind === 'levelup') {
    sfx.levelup();
    set({ levelUp: { level: n.level, unlocks: n.unlocks } });
    setTimeout(() => set({ levelUp: null }), 4200);
  }
}
