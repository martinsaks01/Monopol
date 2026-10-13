/* Plasserer og animerer spillebrikkene. */
import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useStore } from '../store/store';
import { finishTokenAnim } from '../store/director';
import { sfx } from '../audio/sound';
import type { GameState } from '../game/types';
import { tokenPosition } from './layout';
import { TokenPiece } from './TokenPiece';

/** Hvilistilling for alle brikker basert på visuell posisjon. */
function restingPositions(s: GameState, visualPos: number[]) {
  const n = s.board.length;
  const jail = s.board.findIndex((sq) => sq.type === 'jail');
  const groups = new Map<string, number[]>();
  s.players.forEach((p) => {
    if (p.bankrupt) return;
    const pos = visualPos[p.id] ?? p.position;
    const key = `${pos}-${pos === jail && p.inJail ? 'in' : 'out'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p.id);
  });
  const out: Record<number, [number, number, number]> = {};
  groups.forEach((ids, key) => {
    const [posStr, where] = key.split('-');
    const pos = Number(posStr);
    ids.forEach((id, slot) => {
      out[id] = tokenPosition(pos, n, slot, ids.length, pos === jail, where === 'in');
    });
  });
  return out;
}

function Token({ pid, target, active }: { pid: number; target: [number, number, number]; active: boolean }) {
  const game = useStore((st) => st.game)!;
  const p = game.s.players[pid];
  const ref = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const anim = useRef<{ id: number; k: number; t: number; from: THREE.Vector3 } | null>(null);
  const tmp = useRef(new THREE.Vector3());

  useFrame(({ clock }, dt) => {
    const g = ref.current;
    if (!g) return;
    const st = useStore.getState();
    const a = st.tokenAnim;
    const n = game.s.board.length;

    if (a && a.player === pid) {
      if (!anim.current || anim.current.id !== a.id) anim.current = { id: a.id, k: 0, t: 0, from: g.position.clone() };
      const cur = anim.current;
      cur.t += dt / a.stepTime;
      const dest = tokenPosition(a.path[cur.k], n, 0, 1);
      const to = tmp.current.set(dest[0], dest[1], dest[2]);
      const t = Math.min(1, cur.t);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      g.position.lerpVectors(cur.from, to, e);
      const height = a.mode === 'fly' ? 2.6 : 0.45;
      g.position.y = dest[1] + Math.sin(t * Math.PI) * height;
      // Litt «squash» når brikken lander
      const sq = 1 - Math.sin(t * Math.PI) * 0.08;
      g.scale.set(1 / sq, sq * (t > 0.9 ? 0.92 : 1.05), 1 / sq);
      if (a.mode === 'fly') g.rotation.y += dt * 10;
      if (cur.t >= 1) {
        if (a.mode === 'hop') sfx.step(cur.k);
        cur.k++;
        cur.t = 0;
        cur.from = to.clone();
        if (cur.k >= a.path.length) {
          anim.current = null;
          g.scale.set(1, 1, 1);
          finishTokenAnim(a.id);
        }
      }
    } else {
      anim.current = null;
      tmp.current.set(target[0], target[1], target[2]);
      g.position.lerp(tmp.current, Math.min(1, dt * 8));
      g.scale.lerp(tmp.current.set(1, 1, 1), Math.min(1, dt * 10));
      const bob = active ? Math.abs(Math.sin(clock.elapsedTime * 3)) * 0.08 : 0;
      g.position.y = target[1] + bob;
      if (active) g.rotation.y += dt * 0.8;
      else {
        const home = Math.round(g.rotation.y / (Math.PI * 2)) * Math.PI * 2;
        g.rotation.y += (home - g.rotation.y) * Math.min(1, dt * 3);
      }
    }
    if (ring.current) {
      ring.current.visible = active;
      ring.current.rotation.z += dt * 2;
      const s2 = 1 + Math.sin(clock.elapsedTime * 4) * 0.08;
      ring.current.scale.set(s2, s2, s2);
    }
  });

  return (
    <group>
      <group ref={ref} position={target}>
        <TokenPiece shape={p.token} color={p.color} finish={p.finish} />
      </group>
      <mesh ref={ring} position={[target[0], target[1] + 0.015, target[2]]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.3, 0.36, 32, 1, 0, Math.PI * 1.6]} />
        <meshBasicMaterial color={p.color} transparent opacity={0.85} toneMapped={false} />
      </mesh>
    </group>
  );
}

export function Tokens() {
  const game = useStore((st) => st.game);
  useStore((st) => st.v);
  const visualPos = useStore((st) => st.visualPos);
  const busy = useStore((st) => st.busy);
  if (!game) return null;
  const s = game.s;
  const rest = restingPositions(s, visualPos);
  const acting = game.actingPlayerId();
  return (
    <group>
      {s.players.map((p) => (p.bankrupt || !rest[p.id] ? null : (
        <Token key={p.id} pid={p.id} target={rest[p.id]} active={!busy && p.id === s.current && acting !== null} />
      )))}
    </group>
  );
}
