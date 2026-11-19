/**
 * Cloth: flags streaming downwind on the town-hall / harbour-office poles and
 * washing lines on Gull Lane and Salt Lane. Both are instanced unit planes
 * deformed in the vertex shader (util.windMaterial); laundry is taken in
 * during a storm and at night.
 */
"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { TownLayout, Placed } from "../buildings/layout";
import { terrainHeight } from "../terrain";
import { windMaterial, whiteColors, tickWind, dummy, tmpC, srand, hideInstance } from "./util";
import { lifeState, hourIn } from "./state";

interface Pole { x: number; y: number; z: number; color: string; base: number }

/** flag pole tops (from L.flagPoles when the buildings agent provides them, else from specs) */
function flagPoles(L: TownLayout): Pole[] {
  // FlagPole from the buildings agent = pole base + height h; the flag flies just below the top
  const given = (L as unknown as { flagPoles?: Array<{ x: number; y: number; z: number; h?: number; color?: string }> }).flagPoles;
  if (given && given.length) return given.map((p, i) => ({ x: p.x, y: p.y + (p.h ?? 3) - 0.5, z: p.z, color: p.color ?? ["#1f5fa8", "#c8323c", "#f2c318"][i % 3], base: p.y }));
  const out: Pole[] = [];
  for (const p of L.buildings as Placed[]) {
    const s = p.spec;
    if (!s.flag) continue;
    const lx = s.w * 0.35, lz = 0;
    const c = Math.cos(p.yaw), sn = Math.sin(p.yaw);
    out.push({ x: p.x + lx * c + lz * sn, y: p.y + s.h + s.roofH + 2.75, z: p.z - lx * sn + lz * c, color: p.loc.id === "harbour_office" ? "#1f5fa8" : "#c8323c", base: p.y + s.h + s.roofH });
  }
  // a tall pole at the pier end flies the harbour pennant
  out.push({ x: 24.6, y: 0.75 + 5.2, z: -327, color: "#f2c318", base: 0.75 });
  return out;
}

interface Line { a: [number, number, number]; b: [number, number, number] }
function laundryLines(L: TownLayout): Line[] {
  // LaundryLine from the buildings agent = centre (x,y,z) + yaw ry + length (the line runs along local +x)
  const given = (L as unknown as { laundryLines?: Array<{ x: number; y: number; z: number; ry: number; len: number }> }).laundryLines;
  if (given && given.length) {
    return given.map((l) => {
      const dx = Math.cos(l.ry) * l.len / 2, dz = -Math.sin(l.ry) * l.len / 2;
      return { a: [l.x - dx, l.y, l.z - dz], b: [l.x + dx, l.y, l.z + dz] };
    });
  }
  const mk = (x1: number, y1: number, x2: number, y2: number): Line => ({ a: [x1, terrainHeight(x1, y1) + 2.1, -y1], b: [x2, terrainHeight(x2, y2) + 2.1, -y2] });
  return [
    mk(63, 97, 71, 97),      // behind the Okafor house, Gull Lane
    mk(55, 63, 64, 63),      // behind the Achebe house
    mk(118, 53, 126, 53),    // Halvorsen back garden
    mk(221, 251, 229, 251),  // Salt Lane: Moreno – Kowalski
    mk(199, 265, 207, 265),  // Romano
    mk(244, 270, 252, 270),  // Demir
  ];
}

const SHIRT_COLORS = ["#e8f0f7", "#f4d9a8", "#c8323c", "#3d6b8f", "#7fbf4a", "#f2c318", "#efc2c9", "#ffffff", "#8a2a3a", "#5a4a6a"];

export default function Cloth({ L }: { L: TownLayout }) {
  const flagRef = useRef<THREE.InstancedMesh>(null);
  const clothRef = useRef<THREE.InstancedMesh>(null);
  const propRef = useRef<THREE.InstancedMesh>(null);
  const poles = useMemo(() => flagPoles(L), [L]);
  const lines = useMemo(() => laundryLines(L), [L]);
  const pieces = useMemo(() => {
    const r = srand(515);
    const out: { x: number; y: number; z: number; yaw: number; w: number; h: number; color: string; phase: number }[] = [];
    for (const l of lines) {
      const len = Math.hypot(l.b[0] - l.a[0], l.b[2] - l.a[2]);
      const yaw = Math.atan2(l.b[0] - l.a[0], l.b[2] - l.a[2]) + Math.PI / 2;
      let d = 0.6;
      while (d < len - 0.6) {
        const sheet = r() < 0.3;
        const w = sheet ? 1.5 + r() * 0.5 : 0.55 + r() * 0.3, h = sheet ? 1.1 + r() * 0.3 : 0.7 + r() * 0.25;
        if (d + w / 2 > len - 0.4) break;
        const k = (d + w / 2) / len;
        const sag = Math.sin(k * Math.PI) * 0.12;
        out.push({ x: l.a[0] + (l.b[0] - l.a[0]) * k, y: l.a[1] + (l.b[1] - l.a[1]) * k - sag, z: l.a[2] + (l.b[2] - l.a[2]) * k, yaw, w, h, color: sheet ? (r() < 0.5 ? "#f4f0e6" : "#dfe9f2") : SHIRT_COLORS[Math.floor(r() * SHIRT_COLORS.length)], phase: r() * 6.28 });
        d += w + 0.25 + r() * 0.3;
      }
    }
    return out;
  }, [lines]);

  const flagGeo = useMemo(() => whiteColors(new THREE.PlaneGeometry(1, 1, 10, 4)), []);
  const clothGeo = useMemo(() => whiteColors(new THREE.PlaneGeometry(1, 1, 4, 5)), []);
  const flagMat = useMemo(() => windMaterial({ mode: 0 }), []);
  const clothMat = useMemo(() => windMaterial({ mode: 1 }), []);
  const flagPhase = useMemo(() => new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, poles.length) * 2), 2), [poles.length]);
  const clothPhase = useMemo(() => new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, pieces.length) * 2), 2), [pieces.length]);
  const propGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const propMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#6b5a48", roughness: 0.9 }), []);
  const nProps = lines.length * 3 + poles.length; // 2 posts + 1 rope per line, 1 pole per flag

  useEffect(() => {
    flagGeo.setAttribute("aPhase", flagPhase);
    clothGeo.setAttribute("aPhase", clothPhase);
    poles.forEach((_, i) => flagPhase.setXY(i, i * 1.9, 1));
    pieces.forEach((p, i) => clothPhase.setXY(i, p.phase, 1));
    flagPhase.needsUpdate = true; clothPhase.needsUpdate = true;
    const fm = flagRef.current, cm = clothRef.current, pm = propRef.current;
    if (fm) { poles.forEach((p, i) => fm.setColorAt(i, tmpC.set(p.color))); if (fm.instanceColor) fm.instanceColor.needsUpdate = true; }
    if (cm) {
      pieces.forEach((p, i) => {
        cm.setColorAt(i, tmpC.set(p.color));
        dummy.position.set(p.x, p.y - p.h / 2, p.z); dummy.rotation.set(0, p.yaw, 0); dummy.scale.set(p.w, p.h, 1); dummy.updateMatrix();
        cm.setMatrixAt(i, dummy.matrix);
      });
      if (cm.instanceColor) cm.instanceColor.needsUpdate = true;
      cm.instanceMatrix.needsUpdate = true;
    }
    if (pm) {
      let k = 0;
      for (const l of lines) {
        const ay = terrainHeight(l.a[0], -l.a[2]), by = terrainHeight(l.b[0], -l.b[2]);
        dummy.position.set(l.a[0], (ay + l.a[1]) / 2, l.a[2]); dummy.rotation.set(0, 0, 0); dummy.scale.set(0.12, l.a[1] - ay, 0.12); dummy.updateMatrix(); pm.setMatrixAt(k++, dummy.matrix);
        dummy.position.set(l.b[0], (by + l.b[1]) / 2, l.b[2]); dummy.scale.set(0.12, l.b[1] - by, 0.12); dummy.updateMatrix(); pm.setMatrixAt(k++, dummy.matrix);
        const len = Math.hypot(l.b[0] - l.a[0], l.b[2] - l.a[2]);
        dummy.position.set((l.a[0] + l.b[0]) / 2, (l.a[1] + l.b[1]) / 2, (l.a[2] + l.b[2]) / 2); dummy.rotation.set(0, Math.atan2(l.b[0] - l.a[0], l.b[2] - l.a[2]), 0); dummy.scale.set(0.03, 0.03, len); dummy.updateMatrix(); pm.setMatrixAt(k++, dummy.matrix);
      }
      for (const p of poles) {
        // pole from the deck/roof up to the flag; poles the buildings agent already draws overlap harmlessly
        const h = p.y + 0.5 - p.base;
        dummy.position.set(p.x, p.base + h / 2, p.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(0.09, h, 0.09); dummy.updateMatrix(); pm.setMatrixAt(k++, dummy.matrix);
      }
      pm.instanceMatrix.needsUpdate = true;
    }
  }, [poles, pieces, lines, flagGeo, clothGeo, flagPhase, clothPhase]);

  const shown = useRef(true);
  useFrame(() => {
    tickWind(flagMat); tickWind(clothMat);
    const fm = flagRef.current, cm = clothRef.current;
    if (fm) {
      const wd = lifeState.windDir;
      const yaw = Math.atan2(-wd.y, wd.x);
      // in calm air the flag droops: fold it down a little and shorten
      const calm = Math.max(0, 1 - lifeState.wind / 0.9);
      for (let i = 0; i < poles.length; i++) {
        const p = poles[i];
        const w = 1.4 * (1 - calm * 0.25), hgt = 0.8;
        dummy.position.set(p.x + Math.cos(yaw) * (w / 2 + 0.06), p.y - calm * 0.35, p.z - Math.sin(yaw) * (w / 2 + 0.06));
        dummy.rotation.set(0, yaw, -calm * 0.75); dummy.scale.set(w, hgt, 1); dummy.updateMatrix();
        fm.setMatrixAt(i, dummy.matrix);
      }
      fm.instanceMatrix.needsUpdate = true;
    }
    if (cm) {
      const want = !lifeState.storm && hourIn(lifeState.hour, 7.5, 19.5);
      if (want !== shown.current) {
        shown.current = want;
        if (want) pieces.forEach((p, i) => { dummy.position.set(p.x, p.y - p.h / 2, p.z); dummy.rotation.set(0, p.yaw, 0); dummy.scale.set(p.w, p.h, 1); dummy.updateMatrix(); cm.setMatrixAt(i, dummy.matrix); });
        else pieces.forEach((_, i) => hideInstance(cm, i));
        cm.instanceMatrix.needsUpdate = true;
      }
    }
  });

  return (
    <group>
      {poles.length > 0 && <instancedMesh ref={flagRef} args={[flagGeo, flagMat, poles.length]} frustumCulled={false} castShadow={false} />}
      {pieces.length > 0 && <instancedMesh ref={clothRef} args={[clothGeo, clothMat, pieces.length]} frustumCulled={false} castShadow />}
      {nProps > 0 && <instancedMesh ref={propRef} args={[propGeo, propMat, nProps]} frustumCulled={false} castShadow={false} />}
    </group>
  );
}
