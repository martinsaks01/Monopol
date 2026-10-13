/*
 * Fysiske terninger (Rapier). Når et kast blir bedt om, kastes terningene inn på brettet
 * fra kamerasiden. Når de ligger i ro, leses øverste side og sendes til spillmotoren.
 */
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { RigidBody, type RapierRigidBody } from '@react-three/rapier';
import { useStore } from '../store/store';
import { onDiceSettled } from '../store/director';
import { sfx } from '../audio/sound';
import { DICE } from '../progress/cosmetics';
import { DICE_FACE_VALUES, diceTextures } from './textures';
import { TILE_H } from './layout';

const SIZE = 0.5;
const NORMALS = [
  new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
];

/** Rotasjon som gir en bestemt verdi øverst (brukes i hurtigmodus og ved innlasting). */
export function quatForValue(v: number, spin = 0): THREE.Quaternion {
  const n = NORMALS[DICE_FACE_VALUES.indexOf(v)];
  const toUp = new THREE.Quaternion().setFromUnitVectors(n, new THREE.Vector3(0, 1, 0));
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spin).multiply(toUp);
}

function topValue(rb: RapierRigidBody): { value: number; flat: boolean } {
  const r = rb.rotation();
  const q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
  let best = -2, idx = 0;
  NORMALS.forEach((n, i) => {
    const y = n.clone().applyQuaternion(q).y;
    if (y > best) { best = y; idx = i; }
  });
  return { value: DICE_FACE_VALUES[idx], flat: best > 0.9 };
}

function Die({ bodyRef, materials }: { bodyRef: React.RefObject<RapierRigidBody | null>; materials: THREE.Material[] }) {
  return (
    <RigidBody
      ref={bodyRef}
      colliders="cuboid"
      mass={1}
      restitution={0.35}
      friction={0.5}
      linearDamping={0.3}
      angularDamping={0.4}
      position={[0, -5, 0]}
      ccd
      onCollisionEnter={() => {
        const v = bodyRef.current?.linvel();
        if (v) sfx.diceHit(Math.hypot(v.x, v.y, v.z) / 4);
      }}
    >
      <mesh material={materials} castShadow receiveShadow>
        <boxGeometry args={[SIZE, SIZE, SIZE]} />
      </mesh>
    </RigidBody>
  );
}

export function Dice() {
  const throwReq = useStore((st) => st.diceThrow);
  const snap = useStore((st) => st.diceSnap);
  const skinId = useStore((st) => st.profile.selected.dice);
  const a = useRef<RapierRigidBody>(null);
  const b = useRef<RapierRigidBody>(null);
  const state = useRef<{ id: number; start: number; still: number } | null>(null);
  const { camera } = useThree();

  const materials = useMemo(() => {
    const skin = DICE.find((d) => d.id === skinId) || DICE[0];
    return diceTextures(skin).map((map) => new THREE.MeshStandardMaterial({ map, roughness: 0.3, metalness: skin.id === 'gold' ? 0.6 : 0.05 }));
  }, [skinId]);

  // Start et kast
  useEffect(() => {
    if (!throwReq || !a.current || !b.current) return;
    const dir = new THREE.Vector3(camera.position.x, 0, camera.position.z).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    [a.current, b.current].forEach((rb, k) => {
      const start = dir.clone().multiplyScalar(3.2).add(side.clone().multiplyScalar(k === 0 ? -0.5 : 0.5));
      rb.setTranslation({ x: start.x, y: 2.2 + k * 0.3, z: start.z }, true);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
      rb.setRotation(q, true);
      const speed = 6 + Math.random() * 3;
      const vel = dir.clone().multiplyScalar(-speed).add(side.clone().multiplyScalar((Math.random() - 0.5) * 3));
      rb.setLinvel({ x: vel.x, y: 1 + Math.random() * 2, z: vel.z }, true);
      rb.setAngvel({ x: (Math.random() - 0.5) * 30, y: (Math.random() - 0.5) * 30, z: (Math.random() - 0.5) * 30 }, true);
      rb.wakeUp();
    });
    state.current = { id: throwReq.id, start: performance.now(), still: 0 };
  }, [throwReq, camera]);

  // Legg terningene direkte med en bestemt verdi opp (hurtigmodus / innlastet spill)
  useEffect(() => {
    if (!snap || !a.current || !b.current) return;
    [a.current, b.current].forEach((rb, k) => {
      rb.setTranslation({ x: -0.45 + k * 0.9, y: TILE_H + SIZE / 2 + 0.01, z: 0.6 }, true);
      rb.setRotation(quatForValue(snap.values[k], Math.random() * 0.6 - 0.3), true);
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
      rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
    });
  }, [snap]);

  useFrame(() => {
    const st = state.current;
    if (!st || !a.current || !b.current) return;
    const elapsed = performance.now() - st.start;
    const bodies = [a.current, b.current];
    const moving = bodies.some((rb) => {
      const v = rb.linvel(), w = rb.angvel();
      return Math.hypot(v.x, v.y, v.z) > 0.05 || Math.hypot(w.x, w.y, w.z) > 0.1;
    });
    st.still = moving ? 0 : st.still + 1;
    const results = bodies.map(topValue);
    const settled = elapsed > 500 && st.still > 10 && results.every((r) => r.flat);
    // Står en terning på kant, gi den et lite dytt
    if (elapsed > 500 && st.still > 10 && !settled) {
      bodies.forEach((rb, k) => {
        if (!results[k].flat) rb.applyImpulse({ x: (Math.random() - 0.5) * 0.4, y: 0.8, z: (Math.random() - 0.5) * 0.4 }, true);
      });
      st.still = 0;
    }
    if (settled || elapsed > 6000) {
      state.current = null;
      onDiceSettled([results[0].value, results[1].value]);
    }
  });

  return (
    <group>
      <Die bodyRef={a} materials={materials} />
      <Die bodyRef={b} materials={materials} />
    </group>
  );
}
