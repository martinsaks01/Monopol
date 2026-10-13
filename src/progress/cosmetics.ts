/* Alt som kan låses opp: brikker, overflater, terninger og bordmiljø. */

export interface TokenDef { id: string; name: string; icon: string; level: number }
export interface FinishDef { id: string; name: string; level: number }
export interface DiceDef { id: string; name: string; body: string; pip: string; level: number }
export interface TableDef { id: string; name: string; level: number; background: string; table: string; fog: string; light: number; ambient: number }

export const TOKENS: TokenDef[] = [
  { id: 'pawn', name: 'Brikke', icon: '♟️', level: 1 },
  { id: 'car', name: 'Bil', icon: '🚗', level: 1 },
  { id: 'hat', name: 'Flosshatt', icon: '🎩', level: 1 },
  { id: 'rook', name: 'Tårn', icon: '🏰', level: 1 },
  { id: 'duck', name: 'And', icon: '🦆', level: 2 },
  { id: 'rocket', name: 'Rakett', icon: '🚀', level: 3 },
  { id: 'diamond', name: 'Diamant', icon: '💎', level: 5 },
  { id: 'crown', name: 'Krone', icon: '👑', level: 8 },
];

export const FINISHES: FinishDef[] = [
  { id: 'plastic', name: 'Plast', level: 1 },
  { id: 'metal', name: 'Metall', level: 4 },
  { id: 'gold', name: 'Gull', level: 6 },
  { id: 'glass', name: 'Glass', level: 7 },
  { id: 'neon', name: 'Neon', level: 10 },
];

export const DICE: DiceDef[] = [
  { id: 'classic', name: 'Klassisk', body: '#fbfbf7', pip: '#1d1d1d', level: 1 },
  { id: 'red', name: 'Kasino', body: '#c62828', pip: '#ffffff', level: 3 },
  { id: 'midnight', name: 'Midnatt', body: '#1b1f2a', pip: '#f5c542', level: 5 },
  { id: 'gold', name: 'Gull', body: '#e6b422', pip: '#3b2a00', level: 9 },
];

export const TABLES: TableDef[] = [
  { id: 'wood', name: 'Trebord', level: 1, background: '#1d2b24', table: '#6b4423', fog: '#1d2b24', light: 2.4, ambient: 0.55 },
  { id: 'felt', name: 'Spillebord', level: 2, background: '#0b2a1c', table: '#14532d', fog: '#0b2a1c', light: 2.4, ambient: 0.5 },
  { id: 'night', name: 'Natt', level: 6, background: '#090b1a', table: '#232845', fog: '#090b1a', light: 1.6, ambient: 0.3 },
  { id: 'sunset', name: 'Solnedgang', level: 8, background: '#3b1f2b', table: '#7a3e2a', fog: '#3b1f2b', light: 2.2, ambient: 0.5 },
];

export const PLAYER_COLORS = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#fb8c00', '#00acc1', '#ec407a'];

export function tokenIcon(id: string) {
  return TOKENS.find((t) => t.id === id)?.icon || '♟️';
}
