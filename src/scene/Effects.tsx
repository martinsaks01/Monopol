/* Partikkeleffekter (mynter, konfetti, gnister, støv) og flytende tekst over brettet. */
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useStore, type Burst } from '../store/store';

const CONFETTI_COLORS = ['#e53935', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#fb8c00', '#ffffff'];

interface Particle { p: THREE.Vector3; v: THREE.Vector3; r: THREE.Euler; w: THREE.Vector3; life: number; color: THREE.Color }

function BurstFx({ burst }: { burst: Burst }) {
  const count = burst.count ?? 20;
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const particles = useMemo<Particle[]>(() => Array.from({ length: count }, () => {
    const a = Math.random() * Math.PI * 2;
    let speed = 1 + Math.random() * 2, up = 2 + Math.random() * 3;
    if (burst.kind === 'dust') { speed = 0.5 + Math.random(); up = 0.5 + Math.random() * 0.6; }
    if (burst.kind === 'sparkle') { speed = 0.4 + Math.random() * 0.8; up = 2 + Math.random() * 2.5; }
    if (burst.kind === 'confetti') { speed = 1.5 + Math.random() * 2.5; up = 4 + Math.random() * 4; }
    const color = burst.kind === 'confetti'
      ? new THREE.Color(CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)])
      : burst.kind === 'coins' ? new THREE.Color('#f5c542')
      : burst.kind === 'dust' ? new THREE.Color('#d8d2c0')
      : new THREE.Color(burst.color || '#ffe066');
    return {
      p: new THREE.Vector3(...burst.pos),
      v: new THREE.Vector3(Math.cos(a) * speed, up, Math.sin(a) * speed),
      r: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      w: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10),
      life: 0,
      color,
    };
  }), [burst, count]);

  const geometry = useMemo(() => {
    switch (burst.kind) {
      case 'coins': return new THREE.CylinderGeometry(0.07, 0.07, 0.02, 14);
      case 'confetti': return new THREE.PlaneGeometry(0.08, 0.13);
      case 'sparkle': return new THREE.OctahedronGeometry(0.05);
      default: return new THREE.SphereGeometry(0.07, 8, 6);
    }
  }, [burst.kind]);

  const material = useMemo(() => new THREE.MeshStandardMaterial({
    metalness: burst.kind === 'coins' ? 0.9 : 0.1,
    roughness: burst.kind === 'coins' ? 0.25 : 0.6,
    side: THREE.DoubleSide,
    emissive: burst.kind === 'sparkle' ? new THREE.Color(burst.color || '#ffe066') : new THREE.Color('#000'),
    emissiveIntensity: burst.kind === 'sparkle' ? 1.2 : 0,
    transparent: burst.kind === 'dust',
    opacity: burst.kind === 'dust' ? 0.7 : 1,
  }), [burst.kind, burst.color]);

  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    const g = burst.kind === 'confetti' ? -5 : burst.kind === 'dust' ? -0.5 : -9;
    const drag = burst.kind === 'confetti' ? 0.97 : 0.995;
    particles.forEach((pt, i) => {
      pt.life += dt;
      pt.v.y += g * dt;
      pt.v.multiplyScalar(drag);
      pt.p.addScaledVector(pt.v, dt);
      if (pt.p.y < 0.13) { pt.p.y = 0.13; pt.v.set(pt.v.x * 0.5, Math.abs(pt.v.y) * 0.3, pt.v.z * 0.5); }
      pt.r.x += pt.w.x * dt; pt.r.y += pt.w.y * dt; pt.r.z += pt.w.z * dt;
      dummy.position.copy(pt.p);
      dummy.rotation.copy(pt.r);
      const fadeStart = burst.kind === 'sparkle' ? 0.5 : burst.kind === 'coins' ? 0.9 : 1.6;
      const fade = burst.kind === 'dust' ? Math.max(0, 1.4 - pt.life) * (1 + pt.life) : Math.max(0, 1 - Math.max(0, pt.life - fadeStart) * 1.6);
      dummy.scale.setScalar(fade);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, pt.color);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });

  return <instancedMesh ref={mesh} args={[geometry, material, count]} castShadow />;
}

export function Effects() {
  const bursts = useStore((st) => st.bursts);
  const floats = useStore((st) => st.floats);
  return (
    <group>
      {bursts.map((b) => <BurstFx key={b.id} burst={b} />)}
      {floats.map((f) => (
        <Html key={f.id} position={f.pos} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className="float-text" style={{ color: f.color }}>{f.text}</div>
        </Html>
      ))}
    </group>
  );
}
