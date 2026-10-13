/*
 * Lager teksturer for felt, midtpanel, kortstokker og terninger ved å tegne på canvas.
 * Slik blir alle temaer automatisk riktige – uten bildefiler.
 */
import * as THREE from 'three';
import type { GameState, Square } from '../game/types';
import { BAND_D, TILE_D, TILE_W } from './layout';

const FONT = 'Fredoka, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
const PX = 256; // piksler per enhet

export const DEFAULT_ICONS: Partial<Record<Square['type'], string>> = {
  start: '🏁', station: '🚂', utility: '⚡', tax: '💰', jail: '🔒', parking: '🅿️', gotojail: '👮',
};

export function squareIcon(sq: Square, s: GameState): string {
  if (sq.icon) return sq.icon;
  if (sq.type === 'card' && sq.deck) return s.decks[sq.deck]?.icon || '🂠';
  return DEFAULT_ICONS[sq.type] || '';
}

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext('2d') as CanvasRenderingContext2D };
}

function toTexture(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, size: number, weight = 700, maxLines = 2) {
  let s = size;
  let lines: string[] = [];
  for (; s > 12; s -= 2) {
    ctx.font = `${weight} ${s}px ${FONT}`;
    lines = wrapText(ctx, text, maxWidth);
    if (lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= maxWidth)) break;
  }
  return { lines, size: s };
}

function drawLines(ctx: CanvasRenderingContext2D, lines: string[], x: number, y: number, size: number) {
  lines.forEach((l, k) => ctx.fillText(l, x, y + k * size * 1.1));
}

function paper(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#fbf7ea');
  g.addColorStop(1, '#f1ead2');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#2b2b2b';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, w - 4, h - 4);
}

export function fmtMoney(n: number, currency: string) {
  return `${Math.round(n).toLocaleString('nb-NO')} ${currency}`;
}

/** Tekstur for et vanlig felt (ikke hjørne). Toppen av bildet vender inn mot midten. */
export function tileTexture(sq: Square, s: GameState): THREE.CanvasTexture {
  const w = Math.round(TILE_W * PX), h = Math.round(TILE_D * PX);
  const { c, ctx } = makeCanvas(w, h);
  paper(ctx, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#1d1d1d';
  const cur = s.rules.currency;

  if (sq.type === 'property' && sq.group) {
    const band = Math.round((BAND_D / TILE_D) * h);
    ctx.fillStyle = s.theme.groups[sq.group]?.color || '#999';
    ctx.fillRect(4, 4, w - 8, band - 4);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(4, 4, w - 8, (band - 4) * 0.35);
    ctx.fillStyle = '#2b2b2b';
    ctx.fillRect(0, band, w, 4);
    ctx.fillStyle = '#1d1d1d';
    const { lines, size } = fitText(ctx, sq.name.toUpperCase(), w - 24, 34);
    drawLines(ctx, lines, w / 2, band + 22, size);
    ctx.font = `600 30px ${FONT}`;
    ctx.fillText(fmtMoney(sq.price || 0, cur), w / 2, h - 52);
  } else {
    const { lines, size } = fitText(ctx, sq.name.toUpperCase(), w - 24, 32);
    drawLines(ctx, lines, w / 2, 24, size);
    ctx.font = `110px ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(squareIcon(sq, s), w / 2, h / 2 + 10);
    ctx.textBaseline = 'top';
    ctx.font = `600 28px ${FONT}`;
    if (sq.price) ctx.fillText(fmtMoney(sq.price, cur), w / 2, h - 52);
    else if (sq.type === 'tax') ctx.fillText(`Betal ${fmtMoney(sq.amount || 0, cur)}`, w / 2, h - 52);
  }
  return toTexture(c);
}

/** Tekstur for hjørnefelt. Øverst til venstre i bildet er innerste hjørne (mot midten). */
export function cornerTexture(sq: Square, s: GameState): THREE.CanvasTexture {
  const size = Math.round(TILE_D * PX);
  const { c, ctx } = makeCanvas(size, size);
  paper(ctx, size, size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#1d1d1d';

  if (sq.type === 'jail') {
    // Cellen i det indre hjørnet
    const cell = size * 0.62;
    ctx.fillStyle = '#f39221';
    ctx.fillRect(4, 4, cell, cell);
    ctx.fillStyle = '#fff3e0';
    ctx.fillRect(28, 28, cell - 48, cell - 48);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 9;
    for (let k = 1; k < 6; k++) {
      const x = 28 + ((cell - 48) / 6) * k;
      ctx.beginPath(); ctx.moveTo(x, 28); ctx.lineTo(x, cell - 20); ctx.stroke();
    }
    ctx.fillStyle = '#1d1d1d';
    ctx.font = `800 40px ${FONT}`;
    ctx.save();
    ctx.translate(cell / 2 + 4, cell / 2 + 4);
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(-120, -30, 240, 60);
    ctx.fillStyle = '#1d1d1d';
    ctx.fillText(sq.name.toUpperCase(), 0, 2);
    ctx.restore();
    ctx.font = `800 34px ${FONT}`;
    ctx.save();
    ctx.translate(size - 40, cell / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('PÅ BESØK', 0, 0);
    ctx.restore();
    ctx.fillText('PÅ BESØK', cell / 2, size - 40);
  } else {
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(-Math.PI / 4);
    ctx.font = `150px ${FONT}`;
    ctx.fillText(squareIcon(sq, s), 0, -30);
    const { lines, size: fs } = fitText(ctx, sq.name.toUpperCase(), size * 0.9, 44, 800);
    ctx.font = `800 ${fs}px ${FONT}`;
    drawLines(ctx, lines, 0, 90, fs);
    if (sq.type === 'start') {
      ctx.font = `700 28px ${FONT}`;
      ctx.fillText(`Motta ${fmtMoney(s.rules.goSalary, s.rules.currency)}`, 0, 150);
    }
    ctx.restore();
    if (sq.type === 'start') {
      ctx.fillStyle = '#e0312f';
      ctx.beginPath();
      const y = size - 60;
      ctx.moveTo(30, y - 14); ctx.lineTo(160, y - 14); ctx.lineTo(160, y - 40);
      ctx.lineTo(225, y); ctx.lineTo(160, y + 40); ctx.lineTo(160, y + 14);
      ctx.lineTo(30, y + 14); ctx.closePath();
      ctx.fill();
    }
  }
  return toTexture(c);
}

/** Midtpanelet med logo og temanavn. */
export function centerTexture(themeName: string, sizeUnits: number): THREE.CanvasTexture {
  const size = 1024;
  const { c, ctx } = makeCanvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 50, size / 2, size / 2, size * 0.7);
  g.addColorStop(0, '#e4f3e6');
  g.addColorStop(1, '#c4e0c8');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = '#8f1715';
  ctx.fillRect(-330, -70, 660, 150);
  ctx.fillStyle = '#e0312f';
  ctx.fillRect(-330, -80, 660, 150);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 120px ${FONT}`;
  ctx.fillText('MONOPOL', 0, -2);
  ctx.fillStyle = '#2f5d45';
  ctx.font = `700 48px ${FONT}`;
  ctx.fillText(themeName, 0, 130);
  ctx.restore();
  void sizeUnits;
  return toTexture(c);
}

/** Toppen av en kortstokk. */
export function deckTexture(name: string, color: string, icon: string): THREE.CanvasTexture {
  const w = 300, h = 200;
  const { c, ctx } = makeCanvas(w, h);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 8;
  ctx.strokeRect(12, 12, w - 24, h - 24);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `64px ${FONT}`;
  ctx.fillText(icon, w / 2, h / 2 - 22);
  ctx.font = `800 34px ${FONT}`;
  ctx.fillText(name.toUpperCase(), w / 2, h / 2 + 50);
  return toTexture(c);
}

/** Overlegg som viser at en eiendom er pantsatt. */
let mortgageTex: THREE.CanvasTexture | null = null;
export function mortgageTexture(): THREE.CanvasTexture {
  if (mortgageTex) return mortgageTex;
  const w = 256, h = 410;
  const { c, ctx } = makeCanvas(w, h);
  ctx.fillStyle = 'rgba(40,40,40,0.55)';
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 3);
  ctx.fillStyle = '#ffdddd';
  ctx.font = `900 64px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PANT', 0, 0);
  ctx.restore();
  mortgageTex = toTexture(c);
  return mortgageTex;
}

// ------------------------------------------------------------------ terninger

export interface DiceSkin { body: string; pip: string; edge?: string }

const PIP_LAYOUT: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.25, 0.25], [0.75, 0.75]],
  3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
  4: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]],
  5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
  6: [[0.25, 0.22], [0.75, 0.22], [0.25, 0.5], [0.75, 0.5], [0.25, 0.78], [0.75, 0.78]],
};

const diceCache = new Map<string, THREE.CanvasTexture[]>();

/** Seks teksturer i BoxGeometry-rekkefølge: +X, −X, +Y, −Y, +Z, −Z. */
export function diceTextures(skin: DiceSkin): THREE.CanvasTexture[] {
  const key = skin.body + skin.pip;
  const hit = diceCache.get(key);
  if (hit) return hit;
  const faces = DICE_FACE_VALUES.map((v) => {
    const size = 128;
    const { c, ctx } = makeCanvas(size, size);
    ctx.fillStyle = skin.body;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = skin.pip;
    PIP_LAYOUT[v].forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(x * size, y * size, size * 0.095, 0, Math.PI * 2);
      ctx.fill();
    });
    return toTexture(c);
  });
  diceCache.set(key, faces);
  return faces;
}

/** Hvilken verdi som står på hver side av terningen (motsatte sider summerer til 7). */
export const DICE_FACE_VALUES = [1, 6, 2, 5, 3, 4];
