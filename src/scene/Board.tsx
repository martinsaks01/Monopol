/* Selve brettet: felt, midtpanel, kortstokker, eiermarkører, hus og kollisjonsflater. */
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { useStore } from '../store/store';
import { openModal } from '../store/director';
import type { GameState } from '../game/types';
import { TILE_D, TILE_H, boardSize, buildingPosition, tileLayout, tileToWorld } from './layout';
import { centerTexture, cornerTexture, deckTexture, mortgageTexture, tileTexture } from './textures';

const SIDE_COLOR = '#efe6c8';

function Tile({ i, s }: { i: number; s: GameState }) {
  const n = s.board.length;
  const t = tileLayout(i, n);
  const sq = s.board[i];
  const materials = useMemo(() => {
    const tex = t.corner ? cornerTexture(sq, s) : tileTexture(sq, s);
    const side = new THREE.MeshStandardMaterial({ color: SIDE_COLOR, roughness: 0.8 });
    const top = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.65 });
    return [side, side, top, side, side, side];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, s.theme.id]);
  useEffect(() => () => { materials[2].map?.dispose(); materials.forEach((m) => m.dispose()); }, [materials]);

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 8) return;
    e.stopPropagation();
    openModal({ kind: 'deed', square: i });
  };

  return (
    <mesh
      position={[t.x, TILE_H / 2, t.z]}
      rotation={[0, t.rotY, 0]}
      material={materials}
      receiveShadow
      onClick={onClick}
      onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { document.body.style.cursor = ''; }}
    >
      <boxGeometry args={[t.w - 0.02, TILE_H, t.d - 0.02]} />
    </mesh>
  );
}

/** Eiermarkør, pant-overlegg og markering av feltet som er til salgs. */
function TileOverlays({ s, highlight }: { s: GameState; highlight: number | null }) {
  const n = s.board.length;
  const mortTex = useMemo(() => mortgageTexture(), []);
  const glow = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (glow.current) glow.current.opacity = 0.25 + Math.sin(clock.elapsedTime * 5) * 0.15;
  });
  return (
    <group>
      {Object.keys(s.props).map((k) => {
        const i = Number(k);
        const pr = s.props[i];
        const t = tileLayout(i, n);
        const items = [];
        if (pr.owner !== null) {
          const color = s.players[pr.owner].color;
          const [x, z] = tileToWorld(t, 0, TILE_D / 2 - 0.07);
          items.push(
            <mesh key="own" position={[x, TILE_H + 0.012, z]} rotation={[0, t.rotY, 0]} castShadow>
              <boxGeometry args={[t.w - 0.08, 0.025, 0.1]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} />
            </mesh>,
          );
        }
        if (pr.mortgaged) {
          items.push(
            <mesh key="mort" position={[t.x, TILE_H + 0.006, t.z]} rotation={[-Math.PI / 2, 0, t.rotY]}>
              <planeGeometry args={[t.w - 0.04, t.d - 0.04]} />
              <meshBasicMaterial map={mortTex} transparent depthWrite={false} />
            </mesh>,
          );
        }
        return items.length ? <group key={i}>{items}</group> : null;
      })}
      {highlight !== null && (() => {
        const t = tileLayout(highlight, n);
        return (
          <mesh position={[t.x, TILE_H + 0.01, t.z]} rotation={[-Math.PI / 2, 0, t.rotY]}>
            <planeGeometry args={[t.w, t.d]} />
            <meshBasicMaterial ref={glow} color="#ffe066" transparent opacity={0.35} depthWrite={false} />
          </mesh>
        );
      })()}
    </group>
  );
}

function House({ position, rotY, hotel }: { position: [number, number, number]; rotY: number; hotel: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const born = useRef(performance.now());
  useFrame(() => {
    if (!ref.current) return;
    const t = Math.min(1, (performance.now() - born.current) / 450);
    // Liten «sprett» når huset dukker opp
    const sc = t < 1 ? 1 + Math.sin(t * Math.PI) * 0.5 * (1 - t) : 1;
    ref.current.scale.setScalar(Math.max(0.01, t < 0.15 ? t / 0.15 : sc));
  });
  const w = hotel ? 0.42 : 0.17;
  const color = hotel ? '#d62828' : '#2e9e4b';
  return (
    <group ref={ref} position={position} rotation={[0, rotY, 0]}>
      <mesh position={[0, 0.08, 0]} castShadow>
        <boxGeometry args={[w, 0.16, 0.2]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.2, 0]} rotation={[0, Math.PI / 4, 0]} scale={[w / 0.17, 1, 1]} castShadow>
        <coneGeometry args={[0.15, 0.1, 4]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
    </group>
  );
}

function Buildings({ s }: { s: GameState }) {
  const n = s.board.length;
  return (
    <group>
      {Object.keys(s.props).map((k) => {
        const i = Number(k);
        const h = s.props[i].houses;
        if (!h) return null;
        const t = tileLayout(i, n);
        if (h === 5) return <House key={`${i}-hotel`} position={buildingPosition(i, n, 0, true)} rotY={t.rotY} hotel />;
        return Array.from({ length: h }, (_, k2) => (
          <House key={`${i}-${k2}`} position={buildingPosition(i, n, k2, false)} rotY={t.rotY} hotel={false} />
        ));
      })}
    </group>
  );
}

function CenterPanel({ s }: { s: GameState }) {
  const n = s.board.length;
  const L = boardSize(n);
  const inner = L - 2 * TILE_D;
  const tex = useMemo(() => centerTexture(s.theme.name, inner), [s.theme.name, inner]);
  const decks = Object.entries(s.decks);
  return (
    <group>
      <mesh position={[0, TILE_H / 2 - 0.01, 0]} receiveShadow>
        <boxGeometry args={[inner, TILE_H - 0.02, inner]} />
        <meshStandardMaterial attach="material-0" color={SIDE_COLOR} />
        <meshStandardMaterial attach="material-1" color={SIDE_COLOR} />
        <meshStandardMaterial attach="material-2" map={tex} roughness={0.7} />
        <meshStandardMaterial attach="material-3" color={SIDE_COLOR} />
        <meshStandardMaterial attach="material-4" color={SIDE_COLOR} />
        <meshStandardMaterial attach="material-5" color={SIDE_COLOR} />
      </mesh>
      {decks.map(([id, d], k) => {
        const off = inner * 0.27;
        const pos: [number, number, number] = k % 2 === 0 ? [-off, 0, -off] : [off, 0, off];
        if (k > 1) pos[0] = -pos[0];
        return <DeckPile key={id} name={d.name} color={d.color} icon={d.icon} position={pos} count={d.order.length} />;
      })}
    </group>
  );
}

function DeckPile({ name, color, icon, position, count }: { name: string; color: string; icon: string; position: [number, number, number]; count: number }) {
  const tex = useMemo(() => deckTexture(name, color, icon), [name, color, icon]);
  const h = 0.04 + count * 0.008;
  return (
    <group position={[position[0], TILE_H, position[2]]} rotation={[0, Math.PI / 4, 0]}>
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.5, h, 1]} />
          <meshStandardMaterial attach="material-0" color="#f4f1e6" />
          <meshStandardMaterial attach="material-1" color="#f4f1e6" />
          <meshStandardMaterial attach="material-2" map={tex} />
          <meshStandardMaterial attach="material-3" color="#f4f1e6" />
          <meshStandardMaterial attach="material-4" color="#f4f1e6" />
          <meshStandardMaterial attach="material-5" color="#f4f1e6" />
        </mesh>
      </RigidBody>
    </group>
  );
}

/** Usynlige vegger og gulv som terningene kolliderer med. */
function Colliders({ L }: { L: number }) {
  const h = 3;
  return (
    <RigidBody type="fixed" colliders={false} friction={0.6} restitution={0.25}>
      <CuboidCollider args={[L / 2 + 1, 0.25, L / 2 + 1]} position={[0, TILE_H - 0.25, 0]} />
      <CuboidCollider args={[L / 2, h, 0.2]} position={[0, h, -L / 2 - 0.2]} />
      <CuboidCollider args={[L / 2, h, 0.2]} position={[0, h, L / 2 + 0.2]} />
      <CuboidCollider args={[0.2, h, L / 2]} position={[-L / 2 - 0.2, h, 0]} />
      <CuboidCollider args={[0.2, h, L / 2]} position={[L / 2 + 0.2, h, 0]} />
      <CuboidCollider args={[L / 2, 0.2, L / 2]} position={[0, h * 2, 0]} />
    </RigidBody>
  );
}

export function Board() {
  const game = useStore((st) => st.game);
  useStore((st) => st.v);
  const highlight = useStore((st) => st.highlight);
  if (!game) return null;
  const s = game.s;
  const n = s.board.length;
  const L = boardSize(n);
  return (
    <group>
      {/* Brettets underlag og kant */}
      <mesh position={[0, -0.15, 0]} receiveShadow castShadow>
        <boxGeometry args={[L + 0.35, 0.3, L + 0.35]} />
        <meshStandardMaterial color="#1f3b2d" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.005, 0]} receiveShadow>
        <boxGeometry args={[L + 0.1, 0.01, L + 0.1]} />
        <meshStandardMaterial color="#2b2b2b" />
      </mesh>
      {s.board.map((_, i) => <Tile key={`${s.theme.id}-${i}`} i={i} s={s} />)}
      <CenterPanel s={s} />
      <TileOverlays s={s} highlight={highlight} />
      <Buildings s={s} />
      <Colliders L={L} />
    </group>
  );
}
