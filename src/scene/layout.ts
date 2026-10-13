/*
 * Geometri for brettet: hvor hvert felt ligger, og hvor brikker og hus plasseres.
 *
 * Brettet ligger i XZ-planet med sentrum i origo. Felt 0 (Start) er nede til høyre
 * (+x, +z), og feltene går mot venstre, opp, mot høyre og ned igjen – som et ekte brett.
 * Alle beregninger gjøres først for nederste side og roteres deretter.
 */

export const TILE_W = 1;      // bredde langs siden
export const TILE_D = 1.6;    // dybde inn mot midten (= hjørnestørrelse)
export const TILE_H = 0.12;   // tykkelse
export const BAND_D = 0.36;   // fargefeltets dybde

export interface TileLayout {
  index: number;
  side: number;       // 0 nede, 1 venstre, 2 oppe, 3 høyre
  corner: boolean;
  x: number;
  z: number;
  rotY: number;
  w: number;          // størrelse i lokal x
  d: number;          // størrelse i lokal z
}

export function boardSize(n: number) {
  const k = n / 4;
  return 2 * TILE_D + (k - 1) * TILE_W;
}

function rotate(x: number, z: number, angle: number): [number, number] {
  const c = Math.cos(angle), s = Math.sin(angle);
  return [x * c + z * s, -x * s + z * c];
}

export function tileLayout(i: number, n: number): TileLayout {
  const k = n / 4;
  const L = boardSize(n);
  const side = Math.floor(i / k) % 4;
  const j = i % k;
  const corner = j === 0;
  let lx: number, lz: number;
  if (corner) {
    lx = L / 2 - TILE_D / 2;
    lz = L / 2 - TILE_D / 2;
  } else {
    lx = L / 2 - TILE_D - (j - 0.5) * TILE_W;
    lz = L / 2 - TILE_D / 2;
  }
  const angle = -side * (Math.PI / 2);
  const [x, z] = rotate(lx, lz, angle);
  return { index: i, side, corner, x, z, rotY: angle, w: corner ? TILE_D : TILE_W, d: TILE_D };
}

/** Gjør om et lokalt punkt på et felt (lx langs siden, lz utover) til verdenskoordinater. */
export function tileToWorld(t: TileLayout, lx: number, lz: number): [number, number] {
  const [rx, rz] = rotate(lx, lz, t.rotY);
  return [t.x + rx, t.z + rz];
}

const TOKEN_SLOTS: [number, number][] = [
  [-0.22, 0.05], [0.22, 0.05], [-0.22, 0.45], [0.22, 0.45], [0, 0.25], [-0.22, -0.3], [0.22, -0.3], [0, -0.3],
];

/**
 * Posisjon for brikke nr. `slot` av `count` på et felt.
 * På fengselsfeltet står innsatte i cellen (innerst), besøkende ytterst.
 */
export function tokenPosition(i: number, n: number, slot: number, count: number, jailTile = false, inJail = false): [number, number, number] {
  const t = tileLayout(i, n);
  let lx: number, lz: number;
  if (t.corner) {
    const r = count <= 1 ? 0 : count <= 3 ? 0.22 : 0.32;
    const a = (slot / Math.max(1, count)) * Math.PI * 2 + Math.PI / 4;
    let cx = 0, cz = 0, scale = 1;
    if (jailTile && inJail) { cx = -0.22; cz = -0.22; scale = 0.7; }
    else if (jailTile) { cx = 0.42; cz = 0.42; scale = 0.8; }
    lx = cx + Math.cos(a) * r * scale;
    lz = cz + Math.sin(a) * r * scale;
  } else if (count <= 1) {
    lx = 0; lz = 0.2;
  } else {
    [lx, lz] = TOKEN_SLOTS[slot % TOKEN_SLOTS.length];
  }
  const [x, z] = tileToWorld(t, lx, lz);
  return [x, TILE_H, z];
}

/** Posisjon for hus nr. `h` (0–3) eller hotell på et eiendomsfelt. */
export function buildingPosition(i: number, n: number, h: number, hotel: boolean): [number, number, number] {
  const t = tileLayout(i, n);
  const lz = -TILE_D / 2 + BAND_D / 2;
  const lx = hotel ? 0 : -0.33 + h * 0.22;
  const [x, z] = tileToWorld(t, lx, lz);
  return [x, TILE_H, z];
}

/** Et punkt litt over midten av feltet (for kamera og effekter). */
export function tileCenter(i: number, n: number): [number, number, number] {
  const t = tileLayout(i, n);
  return [t.x, TILE_H, t.z];
}
