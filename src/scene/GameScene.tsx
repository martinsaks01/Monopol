/* 3D-scenen: lys, kamera, bord, brett, brikker, terninger og effekter. */
import { Suspense, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { CameraControls, ContactShadows, Environment, Lightformer, PerformanceMonitor } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import { useStore } from '../store/store';
import { TABLES } from '../progress/cosmetics';
import { Board } from './Board';
import { Tokens } from './Tokens';
import { Dice } from './Dice';
import { Effects } from './Effects';
import { boardSize } from './layout';

/** Kameraet: fri rotasjon/zoom, og myk følging av handlingen. */
function CameraRig() {
  const ref = useRef<CameraControls>(null);
  const focus = useStore((st) => st.camFocus);
  const n = useStore((st) => st.game?.s.board.length ?? 40);
  const { size } = useThree();
  const L = boardSize(n);
  const aspect = size.width / size.height;
  const portrait = aspect < 1;
  // Avstand som får hele brettet til å passe, beregnet ut fra kameraets synsfelt (40°)
  const tanV = Math.tan((40 / 2) * (Math.PI / 180));
  const tanH = tanV * aspect;
  const overview = Math.max((L * 0.56) / tanH, (L * (portrait ? 0.45 : 0.52)) / tanV);

  const home = (smooth: boolean) => {
    const c = ref.current;
    if (!c) return;
    if (portrait) c.setLookAt(0, overview * 0.93, overview * 0.37 - L * 0.05, 0, 0, -L * 0.05, smooth);
    else c.setLookAt(0, overview * 0.82, overview * 0.58, 0, 0, L * 0.08, smooth);
  };

  useEffect(() => { home(false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [n, portrait, Math.round(overview)]);

  useEffect(() => {
    const c = ref.current;
    if (!c || !focus.id) return;
    if (!focus.target) { home(true); return; }
    const [x, , z] = focus.target;
    // Behold vinkelen brukeren har valgt, men flytt fokus mot handlingen og zoom litt inn
    const pan = portrait ? 0 : 0.55;
    const dist = focus.near ? overview * (portrait ? 0.97 : 0.72) : overview;
    c.moveTo(x * pan, 0, portrait ? -L * 0.05 : z * pan + L * 0.08, true);
    c.dollyTo(dist, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  useEffect(() => {
    const onHome = () => home(true);
    window.addEventListener('monopol:camera-home', onHome);
    return () => window.removeEventListener('monopol:camera-home', onHome);
  });

  return (
    <CameraControls
      ref={ref}
      makeDefault
      minDistance={5}
      maxDistance={overview * 1.5}
      minPolarAngle={0.1}
      maxPolarAngle={Math.PI * 0.42}
      smoothTime={0.45}
      draggingSmoothTime={0.15}
    />
  );
}

export function GameScene() {
  const tableId = useStore((st) => st.profile.selected.table);
  const shadows = useStore((st) => st.settings.shadows);
  const n = useStore((st) => st.game?.s.board.length ?? 40);
  const table = TABLES.find((t) => t.id === tableId) || TABLES[0];
  const L = boardSize(n);
  // Senk oppløsningen automatisk på trege enheter
  const [dpr, setDpr] = useState(Math.min(1.75, window.devicePixelRatio || 1));

  return (
    <Canvas
      shadows={shadows}
      dpr={dpr}
      camera={{ fov: 40, near: 0.1, far: 200, position: [0, 18, 14] }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; }}
    >
      <PerformanceMonitor
        onDecline={() => setDpr((d) => Math.max(0.75, d - 0.25))}
        onIncline={() => setDpr((d) => Math.min(Math.min(1.75, window.devicePixelRatio || 1), d + 0.25))}
      />
      <color attach="background" args={[table.background]} />
      <fog attach="fog" args={[table.fog, L * 2.2, L * 5]} />
      <ambientLight intensity={table.ambient} />
      <hemisphereLight args={['#fff8e8', '#2a3a30', 0.5]} />
      <directionalLight
        castShadow
        position={[L * 0.45, L * 1.1, L * 0.35]}
        intensity={table.light}
        shadow-mapSize={[1536, 1536]}
        shadow-camera-left={-L * 0.7}
        shadow-camera-right={L * 0.7}
        shadow-camera-top={L * 0.7}
        shadow-camera-bottom={-L * 0.7}
        shadow-bias={-0.0004}
      />
      <Environment resolution={128}>
        <Lightformer intensity={2} position={[0, 5, -9]} scale={[10, 10, 1]} />
        <Lightformer intensity={1.5} position={[-5, 1, -1]} rotation-y={Math.PI / 2} scale={[20, 1, 1]} />
        <Lightformer intensity={1.5} position={[5, 1, 1]} rotation-y={-Math.PI / 2} scale={[20, 1, 1]} />
        <Lightformer form="ring" color="#ffd27a" intensity={3} position={[0, 6, 4]} scale={3} />
      </Environment>
      <CameraRig />

      {/* Bordet under brettet */}
      <mesh position={[0, -0.31, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[L * 8, L * 8]} />
        <meshStandardMaterial color={table.table} roughness={0.85} />
      </mesh>
      <ContactShadows position={[0, -0.3, 0]} scale={L * 1.6} blur={2.5} opacity={0.6} far={2} frames={1} />

      <Suspense fallback={null}>
        <Physics gravity={[0, -30, 0]}>
          <Board />
          <Dice />
        </Physics>
      </Suspense>
      <Tokens />
      <Effects />
    </Canvas>
  );
}
