/* Felles tilstand for grensesnitt og 3D-scene (Zustand). */
import { create } from 'zustand';
import type { Game } from '../game/engine';
import type { TradeOffer } from '../game/types';
import { loadProfile, type Profile, type Unlock } from '../progress/profile';

export type Screen = 'start' | 'setup' | 'game' | 'profile';

export type Modal =
  | { kind: 'deed'; square: number }
  | { kind: 'manage'; pid: number }
  | { kind: 'trade'; from: number; to?: number }
  | { kind: 'tradeAsk'; offer: TradeOffer; fromAI: boolean }
  | { kind: 'menu' }
  | { kind: 'results' }
  | { kind: 'rules' }
  | { kind: 'log' };

export interface Toast { id: number; text: string; kind?: 'good' | 'bad' | 'gold' | 'info'; icon?: string }
export interface FloatText { id: number; pos: [number, number, number]; text: string; color: string }
export interface Burst { id: number; pos: [number, number, number]; kind: 'coins' | 'confetti' | 'sparkle' | 'dust'; color?: string; count?: number }
export interface TokenAnim { id: number; player: number; path: number[]; mode: 'hop' | 'fly'; stepTime: number }
export interface CardShow { id: number; deckName: string; color: string; icon: string; text: string; playerName: string; waitForClick: boolean }
export interface XpGain { id: number; amount: number; reason: string }

export type Speed = 'normal' | 'fast' | 'turbo';

export interface Settings {
  speed: Speed;
  sound: boolean;
  music: boolean;
  followCam: boolean;
  shadows: boolean;
}

const SETTINGS_KEY = 'monopol.settings.v2';

function loadSettings(): Settings {
  const def: Settings = { speed: 'normal', sound: true, music: false, followCam: true, shadows: true };
  try {
    return { ...def, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return def;
  }
}

export function saveSettings(s: Settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignorer */ }
}

export interface StoreState {
  screen: Screen;
  game: Game | null;
  /** Økes hver gang spilltilstanden er endret, slik at React tegner på nytt. */
  v: number;
  visualPos: number[];
  tokenAnim: TokenAnim | null;
  diceThrow: { id: number; player: number } | null;
  diceSnap: { id: number; values: [number, number] } | null;
  busy: boolean;
  card: CardShow | null;
  floats: FloatText[];
  bursts: Burst[];
  camFocus: { id: number; target: [number, number, number] | null; near: boolean };
  shake: number;
  modal: Modal | null;
  toasts: Toast[];
  xpGains: XpGain[];
  levelUp: { level: number; unlocks: Unlock[] } | null;
  profile: Profile;
  settings: Settings;
  highlight: number | null;
}

export const useStore = create<StoreState>(() => ({
  screen: 'start',
  game: null,
  v: 0,
  visualPos: [],
  tokenAnim: null,
  diceThrow: null,
  diceSnap: null,
  busy: false,
  card: null,
  floats: [],
  bursts: [],
  camFocus: { id: 0, target: null, near: false },
  shake: 0,
  modal: null,
  toasts: [],
  xpGains: [],
  levelUp: null,
  profile: loadProfile(),
  settings: loadSettings(),
  highlight: null,
}));

let uid = 1;
export const nextId = () => uid++;

export function toast(text: string, kind?: Toast['kind'], icon?: string, ms = 3200) {
  const id = nextId();
  useStore.setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind, icon }] }));
  setTimeout(() => useStore.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms);
}

export function addFloat(pos: [number, number, number], text: string, color: string) {
  const id = nextId();
  useStore.setState((s) => ({ floats: [...s.floats, { id, pos, text, color }] }));
  setTimeout(() => useStore.setState((s) => ({ floats: s.floats.filter((f) => f.id !== id) })), 1700);
}

export function addBurst(b: Omit<Burst, 'id'>, ms = 2500) {
  const id = nextId();
  useStore.setState((s) => ({ bursts: [...s.bursts, { ...b, id }] }));
  setTimeout(() => useStore.setState((s) => ({ bursts: s.bursts.filter((x) => x.id !== id) })), ms);
}

export const bump = () => useStore.setState((s) => ({ v: s.v + 1 }));
