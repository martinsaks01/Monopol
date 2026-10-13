/* 3D-modeller for spillebrikkene, bygget av enkle geometrier (ingen modellfiler). */
import { useMemo } from 'react';
import * as THREE from 'three';

export function useFinishMaterial(color: string, finish = 'plastic') {
  return useMemo(() => {
    switch (finish) {
      case 'metal':
        return new THREE.MeshStandardMaterial({ color, metalness: 0.85, roughness: 0.25 });
      case 'gold':
        return new THREE.MeshStandardMaterial({ color: '#e6b422', metalness: 1, roughness: 0.18 });
      case 'glass':
        return new THREE.MeshPhysicalMaterial({ color, transparent: true, opacity: 0.6, roughness: 0.05, metalness: 0.1, clearcoat: 1 });
      case 'neon':
        return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, toneMapped: false });
      default:
        return new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.05 });
    }
  }, [color, finish]);
}

const pawnProfile = [
  [0, 0], [0.2, 0], [0.2, 0.04], [0.15, 0.08], [0.09, 0.2], [0.07, 0.34], [0.12, 0.37], [0.07, 0.4],
  [0.11, 0.48], [0.11, 0.55], [0.06, 0.62], [0, 0.63],
].map(([x, y]) => new THREE.Vector2(x, y));

function Pawn({ m }: { m: THREE.Material }) {
  return (
    <mesh material={m} castShadow>
      <latheGeometry args={[pawnProfile, 24]} />
    </mesh>
  );
}

function Car({ m }: { m: THREE.Material }) {
  const dark = useMemo(() => new THREE.MeshStandardMaterial({ color: '#222', roughness: 0.6 }), []);
  const glass = useMemo(() => new THREE.MeshStandardMaterial({ color: '#9ad', roughness: 0.1, metalness: 0.3 }), []);
  return (
    <group position={[0, 0.02, 0]}>
      <mesh material={m} position={[0, 0.13, 0]} castShadow><boxGeometry args={[0.24, 0.1, 0.44]} /></mesh>
      <mesh material={m} position={[0, 0.22, -0.02]} castShadow><boxGeometry args={[0.2, 0.09, 0.22]} /></mesh>
      <mesh material={glass} position={[0, 0.22, -0.02]}><boxGeometry args={[0.205, 0.06, 0.18]} /></mesh>
      {[[-0.12, 0.14], [0.12, 0.14], [-0.12, -0.14], [0.12, -0.14]].map(([x, z], k) => (
        <mesh key={k} material={dark} position={[x, 0.07, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.065, 0.065, 0.05, 14]} />
        </mesh>
      ))}
    </group>
  );
}

function Hat({ m }: { m: THREE.Material }) {
  const band = useMemo(() => new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.5 }), []);
  return (
    <group>
      <mesh material={m} position={[0, 0.02, 0]} castShadow><cylinderGeometry args={[0.24, 0.24, 0.04, 28]} /></mesh>
      <mesh material={m} position={[0, 0.24, 0]} castShadow><cylinderGeometry args={[0.14, 0.15, 0.4, 28]} /></mesh>
      <mesh material={band} position={[0, 0.1, 0]}><cylinderGeometry args={[0.152, 0.152, 0.06, 28]} /></mesh>
    </group>
  );
}

function Rook({ m }: { m: THREE.Material }) {
  return (
    <group>
      <mesh material={m} position={[0, 0.04, 0]} castShadow><cylinderGeometry args={[0.2, 0.22, 0.08, 24]} /></mesh>
      <mesh material={m} position={[0, 0.25, 0]} castShadow><cylinderGeometry args={[0.13, 0.16, 0.36, 24]} /></mesh>
      <mesh material={m} position={[0, 0.46, 0]} castShadow><cylinderGeometry args={[0.17, 0.15, 0.08, 24]} /></mesh>
      {[0, 1, 2, 3, 4].map((k) => {
        const a = (k / 5) * Math.PI * 2;
        return (
          <mesh key={k} material={m} position={[Math.cos(a) * 0.12, 0.54, Math.sin(a) * 0.12]} castShadow>
            <boxGeometry args={[0.07, 0.08, 0.07]} />
          </mesh>
        );
      })}
    </group>
  );
}

function Duck({ m }: { m: THREE.Material }) {
  const beak = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ff9800', roughness: 0.4 }), []);
  const eye = useMemo(() => new THREE.MeshStandardMaterial({ color: '#111' }), []);
  return (
    <group position={[0, 0.02, 0]}>
      <mesh material={m} position={[0, 0.15, 0.03]} scale={[1, 0.8, 1.3]} castShadow><sphereGeometry args={[0.17, 24, 18]} /></mesh>
      <mesh material={m} position={[0, 0.36, -0.1]} castShadow><sphereGeometry args={[0.11, 20, 16]} /></mesh>
      <mesh material={beak} position={[0, 0.34, -0.22]} rotation={[-Math.PI / 2, 0, 0]} castShadow><coneGeometry args={[0.05, 0.1, 12]} /></mesh>
      <mesh material={eye} position={[0.06, 0.4, -0.18]}><sphereGeometry args={[0.018, 8, 8]} /></mesh>
      <mesh material={eye} position={[-0.06, 0.4, -0.18]}><sphereGeometry args={[0.018, 8, 8]} /></mesh>
      <mesh material={m} position={[0, 0.25, 0.22]} rotation={[0.8, 0, 0]} castShadow><coneGeometry args={[0.06, 0.12, 10]} /></mesh>
    </group>
  );
}

function Rocket({ m }: { m: THREE.Material }) {
  const white = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f5f5f5', roughness: 0.3 }), []);
  return (
    <group>
      <mesh material={white} position={[0, 0.3, 0]} castShadow><cylinderGeometry args={[0.1, 0.11, 0.4, 20]} /></mesh>
      <mesh material={m} position={[0, 0.58, 0]} castShadow><coneGeometry args={[0.1, 0.18, 20]} /></mesh>
      <mesh material={m} position={[0, 0.3, 0.111]}><sphereGeometry args={[0.04, 12, 10]} /></mesh>
      {[0, 1, 2].map((k) => {
        const a = (k / 3) * Math.PI * 2;
        return (
          <mesh key={k} material={m} position={[Math.cos(a) * 0.12, 0.12, Math.sin(a) * 0.12]} rotation={[0, -a, 0]} castShadow>
            <boxGeometry args={[0.1, 0.16, 0.02]} />
          </mesh>
        );
      })}
    </group>
  );
}

function Diamond({ m }: { m: THREE.Material }) {
  return (
    <group>
      <mesh material={m} position={[0, 0.03, 0]} castShadow><cylinderGeometry args={[0.12, 0.16, 0.06, 6]} /></mesh>
      <mesh material={m} position={[0, 0.34, 0]} scale={[1, 1.35, 1]} castShadow><octahedronGeometry args={[0.2, 0]} /></mesh>
    </group>
  );
}

function Crown({ m }: { m: THREE.Material }) {
  const gem = useMemo(() => new THREE.MeshStandardMaterial({ color: '#d32f2f', roughness: 0.1, metalness: 0.3 }), []);
  return (
    <group>
      <mesh material={m} position={[0, 0.12, 0]} castShadow><cylinderGeometry args={[0.2, 0.18, 0.2, 28, 1, true]} /></mesh>
      <mesh material={m} position={[0, 0.03, 0]} castShadow><cylinderGeometry args={[0.19, 0.19, 0.04, 28]} /></mesh>
      {[0, 1, 2, 3, 4, 5].map((k) => {
        const a = (k / 6) * Math.PI * 2;
        return (
          <group key={k}>
            <mesh material={m} position={[Math.cos(a) * 0.18, 0.27, Math.sin(a) * 0.18]} castShadow><coneGeometry args={[0.05, 0.14, 8]} /></mesh>
            <mesh material={gem} position={[Math.cos(a) * 0.18, 0.36, Math.sin(a) * 0.18]}><sphereGeometry args={[0.025, 8, 8]} /></mesh>
          </group>
        );
      })}
    </group>
  );
}

const SHAPES: Record<string, (p: { m: THREE.Material }) => React.JSX.Element> = {
  pawn: Pawn, car: Car, hat: Hat, rook: Rook, duck: Duck, rocket: Rocket, diamond: Diamond, crown: Crown,
};

/** En brikke på en sokkel i spillerens farge (sokkelen viser alltid hvem den tilhører). */
export function TokenPiece({ shape, color, finish }: { shape: string; color: string; finish?: string }) {
  const m = useFinishMaterial(color, finish);
  const base = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.2 }), [color]);
  const Shape = SHAPES[shape] || Pawn;
  return (
    <group>
      <mesh material={base} position={[0, 0.02, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.23, 0.25, 0.04, 28]} />
      </mesh>
      <group position={[0, 0.04, 0]}>
        <Shape m={m} />
      </group>
    </group>
  );
}
